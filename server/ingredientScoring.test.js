import { describe, expect, it } from 'vitest'
import { assessIngredient, ingredientRating } from './ingredientScoring.js'

const dimensions = { evidence: 98, safety: 90, regulatoryConfidence: 85, transparency: 100, evidenceConsistency: 95, biologicalPlausibility: 95 }
const context = { outcome: 'Strength', region: 'UK', ingredientForm: 'Creatine monohydrate', doseRange: '3–5 g/day', population: 'Healthy adults', duration: 'Ongoing' }

describe('assessIngredient', () => {
  it('uses the published six dimensions and rating bands', () => {
    const result = assessIngredient({ ...context, dimensions, citations: ['https://europepmc.org/article/MED/123'], reviewer: 'reviewer 1', reviewedAt: '2026-09-27T10:00:00Z', nextReviewAt: '2027-09-27' })
    expect(result).toMatchObject({ score: 94, rating: 'Exceptional', status: 'Reviewed ingredient assessment', assessedWeight: 100 })
    expect(result.confidence.level).toBe('High')
    expect(ingredientRating(89)).toBe('Strong')
    expect(ingredientRating(60)).toBe('Moderate')
    expect(ingredientRating(39)).toBe('Low')
  })

  it('does not equate title or directory candidates with an ingredient rating', () => {
    const result = assessIngredient({ outcome: 'Sleep', region: 'UK', citations: ['https://example.org/study'] })
    expect(result).toMatchObject({ score: null, rating: 'Assessment incomplete', status: 'Assessment pending', assessedWeight: 0 })
    expect(result.missing).toHaveLength(6)
    expect(result.confidence.level).toBe('Low')
  })

  it('requires form, dose, population, citations and reviewer independently of complete scores', () => {
    const base = { ...context, dimensions, citations: ['https://europepmc.org/article/MED/123'], reviewer: 'reviewer 1', reviewedAt: '2026-09-27T10:00:00Z' }
    expect(assessIngredient(base).score).toBe(94)
    expect(assessIngredient({ ...base, doseRange: '' }).score).toBeNull()
    expect(assessIngredient({ ...base, citations: [] }).score).toBeNull()
    expect(assessIngredient({ ...base, reviewedAt: '2099-01-01' }).score).toBeNull()
  })
})