/**
 * Stage 2 — Deep CTI Extraction (Sonnet-powered)
 * Only called on articles that pass Stage 1 triage (~20% of total).
 * Extracts structured threat intelligence from article text:
 *   - IOCs with type + context
 *   - Threat actors, malware families, campaigns
 *   - MITRE ATT&CK techniques (T-codes)
 *   - Target industries/regions
 *   - TLP classification
 *   - Executive summary
 *
 * Dual-mode: Sonnet when API key set, regex-only fallback otherwise.
 * Cost: ~$0.01-0.03 per article (Sonnet, ~2000 input + 500 output tokens).
 */
import Anthropic from '@anthropic-ai/sdk';
import { sanitizeLLMInput } from '@etip/shared-enrichment';
import type pino from 'pino';

export interface ExtractedIOC {
  type: string;
  value: string;
  context: string;
}

export interface CTIExtractionResult {
  iocs: ExtractedIOC[];
  threatActors: string[];
  malwareFamilies: string[];
  mitreTechniques: string[];
  campaigns: string[];
  vulnerabilities: string[];
  targetIndustries: string[];
  targetRegions: string[];
  summary: string;
  tlp: 'WHITE' | 'GREEN' | 'AMBER' | 'RED';
  extractionMode: 'sonnet' | 'regex_only';
  inputTokens: number;
  outputTokens: number;
}

const DEFAULT_SONNET_MODEL = 'claude-sonnet-4-20250514';

const EXTRACTION_SYSTEM_PROMPT = `You are a cyber threat intelligence analyst performing deep extraction from a CTI article.

Extract ALL of the following into JSON (no markdown, no explanation):
{
  "iocs": [{"type": "ip|domain|url|hash_md5|hash_sha1|hash_sha256|email|cve", "value": "...", "context": "sentence where it appears"}],
  "threat_actors": ["APT29", "Lazarus Group"],
  "malware_families": ["Cobalt Strike", "IcedID"],
  "mitre_techniques": ["T1059.001", "T1021.002"],
  "campaigns": ["Operation Aurora"],
  "vulnerabilities": ["CVE-2024-1234"],
  "target_industries": ["healthcare", "finance"],
  "target_regions": ["North America", "Europe"],
  "summary": "2-3 sentence intelligence summary of the threat",
  "tlp": "WHITE|GREEN|AMBER|RED"
}

Rules:
- Extract ONLY what is explicitly mentioned — never infer or hallucinate
- Defang IOCs if needed (convert hxxp back to http, etc.)
- MITRE techniques must be T-codes (T1234 or T1234.001)
- TLP: default AMBER if not mentioned in article
- summary: actionable, analyst-focused, 2-3 sentences max
- If no IOCs/actors/techniques found, return empty arrays`;

export class ExtractionService {
  private client: Anthropic | null = null;
  private logger: pino.Logger | null = null;
  private model: string = DEFAULT_SONNET_MODEL;
  private aiEnabled: boolean = false;

  /**
   * Override the active model without reinitializing the Anthropic client.
   * Call before extract() to apply a per-tenant model from the customization service.
   */
  setModel(model: string): void {
    this.model = model;
  }

  /** Initialize with optional API key. Falls back to regex-only extraction. */
  init(apiKey?: string, logger?: pino.Logger, opts?: { aiEnabled?: boolean; model?: string }): void {
    this.logger = logger ?? null;
    this.aiEnabled = opts?.aiEnabled ?? false;
    this.model = opts?.model ?? DEFAULT_SONNET_MODEL;
    if (apiKey && this.aiEnabled) {
      this.client = new Anthropic({ apiKey });
      this.logger?.info({ model: this.model }, 'Extraction: Claude Sonnet mode (AI enabled)');
    } else {
      this.client = null;
      this.logger?.info('Extraction: Regex-only mode (AI disabled or no API key)');
    }
  }

  get isSonnetMode(): boolean { return this.client !== null && this.aiEnabled; }

  /** Extract structured CTI from article text */
  async extract(title: string, content: string, source: string): Promise<CTIExtractionResult> {
    if (this.client) {
      return this.extractWithSonnet(title, content, source);
    }
    return this.extractRegexOnly(title, content);
  }

  /** Full Sonnet-powered extraction */
  private async extractWithSonnet(title: string, content: string, source: string): Promise<CTIExtractionResult> {
    const { sanitized } = sanitizeLLMInput(content);
    const truncated = sanitized.slice(0, 4000); // ~1000 tokens

    try {
      const response = await this.client!.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Title: ${title}\nSource: ${source}\nFull article:\n${truncated}`,
        }],
      });

      const text = response.content[0]?.type === 'text' ? response.content[0].text : '{}';
      const result = this.parseExtractionResponse(text);
      result.extractionMode = 'sonnet';
      result.inputTokens = response.usage.input_tokens;
      result.outputTokens = response.usage.output_tokens;

      this.logger?.debug(
        { title, iocCount: result.iocs.length, actors: result.threatActors.length, techniques: result.mitreTechniques.length },
        'Sonnet extraction complete',
      );

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger?.warn({ error: message, title }, 'Sonnet extraction failed — falling back to regex');
      return this.extractRegexOnly(title, content);
    }
  }

  /** Regex-only extraction fallback (no LLM cost) */
  private extractRegexOnly(title: string, content: string): CTIExtractionResult {
    const text = `${title} ${content}`;

    return {
      iocs: [],  // IOCs are extracted separately by ioc-patterns.ts in pipeline
      threatActors: extractByPatterns(text, THREAT_ACTOR_PATTERNS),
      malwareFamilies: extractByPatterns(text, MALWARE_PATTERNS),
      mitreTechniques: extractMatches(text, /\bT\d{4}(?:\.\d{3})?\b/g),
      campaigns: [],  // Campaigns need semantic understanding — regex insufficient
      vulnerabilities: extractMatches(text, /\bCVE-\d{4}-\d{4,}\b/gi),
      targetIndustries: extractByPatterns(text, INDUSTRY_PATTERNS),
      targetRegions: extractByPatterns(text, REGION_PATTERNS),
      summary: '',
      tlp: 'AMBER',
      extractionMode: 'regex_only',
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  /** Parse Sonnet JSON response into typed result */
  parseExtractionResponse(rawJson: string): CTIExtractionResult {
    const cleaned = rawJson.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      this.logger?.warn({ raw: rawJson.slice(0, 200) }, 'Extraction response not valid JSON');
      return this.emptyResult('sonnet');
    }

    return {
      iocs: parseIOCArray(parsed.iocs),
      threatActors: parseStringArray(parsed.threat_actors),
      malwareFamilies: parseStringArray(parsed.malware_families),
      mitreTechniques: parseStringArray(parsed.mitre_techniques).filter((t) => /^T\d{4}/.test(t)),
      campaigns: parseStringArray(parsed.campaigns),
      vulnerabilities: parseStringArray(parsed.vulnerabilities),
      targetIndustries: parseStringArray(parsed.target_industries),
      targetRegions: parseStringArray(parsed.target_regions),
      summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 1000) : '',
      tlp: validateTLP(parsed.tlp),
      extractionMode: 'sonnet',
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  private emptyResult(mode: 'sonnet' | 'regex_only'): CTIExtractionResult {
    return {
      iocs: [], threatActors: [], malwareFamilies: [], mitreTechniques: [],
      campaigns: [], vulnerabilities: [], targetIndustries: [], targetRegions: [],
      summary: '', tlp: 'AMBER', extractionMode: mode, inputTokens: 0, outputTokens: 0,
    };
  }
}

// ── Regex extraction helpers ──────────────────────────────────────────────

const THREAT_ACTOR_PATTERNS = [
  /\bAPT\d{1,3}\b/gi,
  /\b(?:Lazarus|Kimsuky|Turla|Fancy Bear|Cozy Bear|Charming Kitten|Sandworm)\b/gi,
  /\b(?:FIN\d{1,2}|UNC\d{3,4}|TA\d{3,4})\b/gi,
  /\b(?:Volt Typhoon|Salt Typhoon|Flax Typhoon|Silk Typhoon)\b/gi,
  /\b(?:Scattered Spider|BlackCat|LockBit|REvil|Conti|Cl0p|Akira|Play|Rhysida)\b/gi,
];

const MALWARE_PATTERNS = [
  /\b(?:Cobalt Strike|Metasploit|Mimikatz|BloodHound)\b/gi,
  /\b(?:IcedID|QakBot|Emotet|TrickBot|BazarLoader|SystemBC)\b/gi,
  /\b(?:AsyncRAT|RemcosRAT|NjRAT|DarkComet|QuasarRAT|AgentTesla)\b/gi,
  /\b(?:Sliver|Brute Ratel|Havoc|Mythic|Covenant)\b/gi,
  /\b(?:WannaCry|NotPetya|BlackEnergy|Stuxnet|DarkSide|RagnarLocker)\b/gi,
];

const INDUSTRY_PATTERNS = [
  /\b(?:healthcare|financial|banking|government|defense|energy|telecom)\b/gi,
  /\b(?:education|manufacturing|retail|transportation|critical infrastructure)\b/gi,
];

const REGION_PATTERNS = [
  /\b(?:North America|Europe|Asia|Middle East|Africa|South America|Oceania)\b/gi,
  /\b(?:United States|China|Russia|Iran|North Korea|Ukraine|Israel|India)\b/gi,
];

function extractMatches(text: string, re: RegExp): string[] {
  return [...new Set((text.match(re) ?? []).map((m) => m.trim()))];
}

function extractByPatterns(text: string, patterns: RegExp[]): string[] {
  const results = new Set<string>();
  for (const re of patterns) {
    re.lastIndex = 0;
    const matches = text.match(re) ?? [];
    for (const m of matches) results.add(m.trim());
  }
  return [...results];
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0).slice(0, 50);
}

function parseIOCArray(value: unknown): ExtractedIOC[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
    .map((v) => ({
      type: String(v.type || 'unknown'),
      value: String(v.value || ''),
      context: String(v.context || '').slice(0, 500),
    }))
    .filter((v) => v.value.length > 0)
    .slice(0, 100);
}

function validateTLP(value: unknown): 'WHITE' | 'GREEN' | 'AMBER' | 'RED' {
  const valid = ['WHITE', 'GREEN', 'AMBER', 'RED'];
  const upper = String(value || '').toUpperCase();
  return valid.includes(upper) ? (upper as 'WHITE' | 'GREEN' | 'AMBER' | 'RED') : 'AMBER';
}
