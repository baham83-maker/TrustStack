import { expect, it } from 'vitest'
import { validateEvidenceProfile } from './evidenceProfile.js'

it('publishes a human-reviewed ingredient profile without a product or batch', () => {
  const profile = validateEvidenceProfile({ canonicalIngredient: 'Creatine monohydrate', ingredientForm: 'Monohydrate powder', doseRange: '3-5 g/day', population: 'Healthy adults', outcome: 'Strength and exercise performance', region: 'Global', searchStrategy: 'PubMed and Europe PMC IEP-1.0 search v1', lastSearched: '2026-09-29', sources: [{ id: 'PMID:123', source: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov/123/' }], certainty: 'High', direction: 'Supports benefit', consistency: 'Mostly consistent', directness: 'Direct', safety: 'Established', reviewer: 'reviewer', reviewedAt: '2026-09-29', reviewStatus: 'Human reviewed' })
  expect(profile).toMatchObject({ publishable: true, status: 'Published ingredient evidence profile', state: 'published', customerLabel: 'Evidence profile published', canonicalIngredient: 'Creatine monohydrate' })
})

it('does not publish automated screening or incomplete context', () => {
  expect(validateEvidenceProfile()).toMatchObject({ publishable: false, state: 'not_assessed', customerLabel: 'Evidence not assessed' })
  expect(validateEvidenceProfile({ canonicalIngredient: 'Creatine', reviewStatus: 'Automated screening only' })).toMatchObject({ publishable: false, state: 'under_review', status: 'Automated screening only' })
  expect(validateEvidenceProfile({ canonicalIngredient: 'Creatine', ingredientForm: 'powder', doseRange: '3 g', population: 'adults', outcome: 'performance', region: 'Global', searchStrategy: 'v1', lastSearched: '2026-09-29', sources: [{ url: 'https://example.org/1' }], certainty: 'Insufficient', direction: 'Insufficient evidence', consistency: 'Unclear', directness: 'Indirect', safety: 'Unknown', reviewer: 'reviewer', reviewedAt: '2026-09-29', reviewStatus: 'Human reviewed' })).toMatchObject({ state: 'reviewed_insufficient', customerLabel: 'Insufficient evidence' })
})

it('retains explicit interaction and sport caution flags without guessing when they are absent', () => {
  expect(validateEvidenceProfile({ interactionRisk: true, sportsWarning: false })).toMatchObject({ interactionRisk: true, sportsWarning: false })
  expect(validateEvidenceProfile().interactionRisk).toBeNull()
})