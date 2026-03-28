/**
 * @module __tests__/relevance-scoring.test
 * @description Tests for org-aware relevance scoring.
 */
import { describe, it, expect } from 'vitest'
import { calculateRelevanceBoost, sortByRelevance, getPriorityItems } from '@/lib/relevance-scoring'
import type { OrgProfile } from '@/types/org-profile'

const TECH_PROFILE: OrgProfile = {
  industry: 'Technology',
  techStack: { os: ['Windows', 'Linux'], cloud: ['AWS'], network: [], database: ['PostgreSQL'], web: ['Node.js'] },
  businessRisk: ['DataBreach', 'Ransomware'],
  orgSize: 'smb',
  geography: { country: 'India', region: 'Asia' },
}

describe('calculateRelevanceBoost', () => {
  it('returns 0 for null profile', () => {
    expect(calculateRelevanceBoost({ tags: ['apt'] }, null)).toBe(0)
  })

  it('returns 0 for item with no text', () => {
    expect(calculateRelevanceBoost({}, TECH_PROFILE)).toBe(0)
  })

  it('boosts +30 for industry match', () => {
    const boost = calculateRelevanceBoost({ tags: ['technology', 'saas'] }, TECH_PROFILE)
    expect(boost).toBeGreaterThanOrEqual(30)
  })

  it('boosts +25 for tech stack match', () => {
    const boost = calculateRelevanceBoost({ tags: ['linux', 'ubuntu'] }, TECH_PROFILE)
    expect(boost).toBeGreaterThanOrEqual(25)
  })

  it('boosts +20 for risk match', () => {
    const boost = calculateRelevanceBoost({ tags: ['ransomware', 'lockbit'] }, TECH_PROFILE)
    expect(boost).toBeGreaterThanOrEqual(20)
  })

  it('stacks multiple boosts', () => {
    const boost = calculateRelevanceBoost(
      { tags: ['technology', 'aws', 'ransomware'] },
      TECH_PROFILE,
    )
    // industry(30) + tech(25) + risk(20) = 75
    expect(boost).toBe(75)
  })

  it('caps at 100', () => {
    const boost = calculateRelevanceBoost(
      { tags: ['technology', 'aws', 'ransomware', 'India', 'botnet'] },
      TECH_PROFILE,
    )
    expect(boost).toBeLessThanOrEqual(100)
  })
})

describe('sortByRelevance', () => {
  it('returns original order when profile is null', () => {
    const items = [{ tags: ['a'] }, { tags: ['b'] }]
    expect(sortByRelevance(items, null)).toEqual(items)
  })

  it('sorts matching items to the top', () => {
    const items = [
      { tags: ['benign'] },
      { tags: ['technology', 'ransomware'] },
      { tags: ['unrelated'] },
    ]
    const sorted = sortByRelevance(items, TECH_PROFILE)
    expect(sorted[0].tags).toContain('technology')
  })
})

describe('getPriorityItems', () => {
  it('returns only matching items', () => {
    const items = [
      { tags: ['technology'] },
      { tags: ['benign'] },
      { tags: ['ransomware'] },
    ]
    const priority = getPriorityItems(items, TECH_PROFILE, 5)
    expect(priority.length).toBe(2)
  })

  it('respects limit', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ tags: ['technology', `item-${i}`] }))
    const priority = getPriorityItems(items, TECH_PROFILE, 3)
    expect(priority.length).toBe(3)
  })

  it('returns first N items when profile is null', () => {
    const items = [{ tags: ['a'] }, { tags: ['b'] }, { tags: ['c'] }]
    expect(getPriorityItems(items, null, 2).length).toBe(2)
  })
})
