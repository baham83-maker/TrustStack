import { describe, expect, it } from 'vitest'
import { assessScoreReadiness, calculateTrustScore } from './scoring.js'

describe('calculateTrustScore', () => {
  it('applies the weighted trust model and inverts contamination risk', () => {
    expect(calculateTrustScore({ evidence: 95, safety: 92, quality: 90, transparency: 84, regulatory: 88, contamination: 12, value: 92 })).toBe(92)
  })

  it('reduces trust when contamination risk increases', () => {
    const base = { evidence: 80, safety: 80, quality: 80, transparency: 80, regulatory: 80, value: 80 }
    expect(calculateTrustScore({ ...base, contamination: 10 })).toBeGreaterThan(calculateTrustScore({ ...base, contamination: 80 }))
  })
})

describe('assessScoreReadiness', () => {
  it('does not turn missing methodology inputs into zero ratings', () => {
    const result = assessScoreReadiness({ evidence: null, safety: null, quality: null, transparency: null, regulatory: null, contamination: null, value: null })
    expect(result).toMatchObject({ score: null, status: 'Not scoreable', assessedWeight: 0 })
    expect(result.missing.map((item) => item.weight)).toEqual([40, 20, 15, 10, 5, 5, 5])
  })

  it('only calculates a score from seven assessed inputs', () => {
    const dimensions = { evidence: 95, safety: 92, quality: 90, transparency: 84, regulatory: 88, contamination: 12, value: 92 }
    expect(assessScoreReadiness(dimensions)).toMatchObject({ score: 92, assessedWeight: 100, missing: [] })
    expect(assessScoreReadiness({ ...dimensions, value: null }).score).toBeNull()
  })
})
