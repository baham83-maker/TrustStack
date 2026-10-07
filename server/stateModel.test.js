import { expect, it } from 'vitest'
import { dataCompleteness, deriveOverallAssessment, evidenceState } from './stateModel.js'

it('maps completed evidence outcomes independently from product and batch state', () => {
  expect(evidenceState({ state: 'reviewed_insufficient' })).toBe('published_insufficient')
  expect(deriveOverallAssessment({ ingredientEvidenceStatus: 'published_supported', transparencyStatus: 'not_assessed', productVerificationStatus: 'unknown' })).toMatchObject({ state: 'ingredient_evidence_only', customerLabel: 'Ingredient evidence available' })
})

it('derives partial assessment without requiring a verified batch', () => {
  expect(deriveOverallAssessment({ ingredientEvidenceStatus: 'published_supported', transparencyStatus: 'reviewed_partial', productVerificationStatus: 'unknown' }).state).toBe('partial_assessment')
  expect(deriveOverallAssessment({ ingredientEvidenceStatus: 'published_supported', transparencyStatus: 'reviewed_partial', productVerificationStatus: 'partially_verified' }).state).toBe('partial_assessment')
  expect(dataCompleteness({ evidenceStatus: 'published_supported', transparencyStatus: 'reviewed_partial', productVerificationStatus: 'unknown', batchVerificationStatus: 'unknown' }).percent).toBeGreaterThan(0)
})
