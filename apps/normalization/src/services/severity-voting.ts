/**
 * @module SeverityVotingService
 * @description Weighted severity voting system. Different feeds vote on IOC severity
 * with Admiralty Code determining vote weight. Idempotent per-feed voting.
 * DECISION-029 Phase G.
 */

import type { PrismaClient } from '@prisma/client';

// ── Types ──────────────────────────────────────────────────

interface SeverityBucket {
  weight: number;
  voters: string[];
}

type SeverityVotes = Record<string, SeverityBucket>;

export interface SeverityVoteResult {
  currentSeverity: string;
  totalVotes: number;
  voteBreakdown: Record<string, { weight: number; voterCount: number }>;
  confidence: number;    // 0-100: how decisive the vote was
  margin: number;        // weight gap between 1st and 2nd place
}

export interface CastVoteInput {
  feedId: string;
  severity: string;
  admiraltySource: string;
  admiraltyCred: number;
}

// ── Vote weight formula ─────────────────────────────────────

const SOURCE_RANK: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6,
};

export function calculateVoteWeight(admiraltySource: string, admiraltyCred: number): number {
  const srcRank = SOURCE_RANK[admiraltySource.toUpperCase()] ?? 6;
  const cred = Math.min(Math.max(admiraltyCred, 1), 6);
  return (6 - srcRank) * 2 + (6 - cred);
  // A1 = 5*2 + 5 = 15, B2 = 4*2 + 4 = 12, C3 = 3*2 + 3 = 9, F6 = 0*2 + 0 = 0
}

// ── Determine winner from votes ─────────────────────────────

function determineWinner(votes: SeverityVotes): { severity: string; topWeight: number; secondWeight: number; totalVoters: number } {
  let topSev = 'info';
  let topWeight = 0;
  let secondWeight = 0;
  let totalVoters = 0;

  const entries = Object.entries(votes);
  for (const [sev, bucket] of entries) {
    totalVoters += bucket.voters.length;
    if (bucket.weight > topWeight) {
      secondWeight = topWeight;
      topWeight = bucket.weight;
      topSev = sev;
    } else if (bucket.weight > secondWeight) {
      secondWeight = bucket.weight;
    }
  }

  return { severity: topSev, topWeight, secondWeight, totalVoters };
}

function buildResult(votes: SeverityVotes): SeverityVoteResult {
  const { severity, topWeight, secondWeight, totalVoters } = determineWinner(votes);
  const totalWeight = Object.values(votes).reduce((s, b) => s + b.weight, 0);

  const breakdown: Record<string, { weight: number; voterCount: number }> = {};
  for (const [sev, bucket] of Object.entries(votes)) {
    breakdown[sev] = { weight: bucket.weight, voterCount: bucket.voters.length };
  }

  const confidence = totalWeight > 0
    ? Math.round((topWeight / totalWeight) * 100)
    : 0;

  return {
    currentSeverity: severity,
    totalVotes: totalVoters,
    voteBreakdown: breakdown,
    confidence,
    margin: Math.round((topWeight - secondWeight) * 100) / 100,
  };
}

// ── Service ──────────────────────────────────────────────────

export class SeverityVotingService {
  constructor(private prisma: PrismaClient) {}

  async castVote(globalIocId: string, vote: CastVoteInput): Promise<SeverityVoteResult> {
    const ioc = await this.prisma.globalIoc.findUnique({ where: { id: globalIocId } });
    if (!ioc) throw new Error(`GlobalIoc not found: ${globalIocId}`);

    const votes: SeverityVotes = (ioc.severityVotes as unknown as SeverityVotes) ?? {};
    const weight = calculateVoteWeight(vote.admiraltySource, vote.admiraltyCred);

    // Ensure bucket exists
    if (!votes[vote.severity]) {
      votes[vote.severity] = { weight: 0, voters: [] };
    }

    const bucket = votes[vote.severity]!;

    // Idempotent: if feed already voted for this severity, no change
    if (bucket.voters.includes(vote.feedId)) {
      return buildResult(votes);
    }

    // Remove previous vote from this feed (if voted for different severity)
    for (const [sev, b] of Object.entries(votes)) {
      const idx = b.voters.indexOf(vote.feedId);
      if (idx !== -1 && sev !== vote.severity) {
        b.voters.splice(idx, 1);
        b.weight = Math.max(b.weight - weight, 0);
        if (b.voters.length === 0) delete votes[sev];
        break;
      }
    }

    // Add vote
    bucket.voters.push(vote.feedId);
    bucket.weight += weight;

    const result = buildResult(votes);

    await this.prisma.globalIoc.update({
      where: { id: globalIocId },
      data: {
        severityVotes: votes as any,
        severity: result.currentSeverity,
      },
    });

    return result;
  }

  async getVoteSummary(globalIocId: string): Promise<SeverityVoteResult> {
    const ioc = await this.prisma.globalIoc.findUnique({ where: { id: globalIocId } });
    if (!ioc) throw new Error(`GlobalIoc not found: ${globalIocId}`);

    const votes: SeverityVotes = (ioc.severityVotes as unknown as SeverityVotes) ?? {};
    return buildResult(votes);
  }

  async bulkCastVotes(votes: Array<{
    globalIocId: string;
    feedId: string;
    severity: string;
    admiraltySource: string;
    admiraltyCred: number;
  }>): Promise<{ processed: number; updated: number }> {
    // Group by globalIocId
    const grouped = new Map<string, typeof votes>();
    for (const v of votes) {
      const arr = grouped.get(v.globalIocId) ?? [];
      arr.push(v);
      grouped.set(v.globalIocId, arr);
    }

    let processed = 0;
    let updated = 0;

    for (const [iocId, iocVotes] of grouped) {
      for (const v of iocVotes) {
        try {
          await this.castVote(iocId, {
            feedId: v.feedId,
            severity: v.severity,
            admiraltySource: v.admiraltySource,
            admiraltyCred: v.admiraltyCred,
          });
          updated++;
        } catch {
          // Skip missing IOCs in bulk
        }
        processed++;
      }
    }

    return { processed, updated };
  }
}
