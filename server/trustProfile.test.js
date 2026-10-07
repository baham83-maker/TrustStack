import { expect, it } from 'vitest'
import { buildTrustProfile } from './trustProfile.js'

const currentDate = new Date().toISOString().slice(0, 10)

it('does not infer trust from demonstration scores, label candidates or directory names', () => {
  expect(buildTrustProfile({ ingredientAssessment: { score: null }, variants: [{ dsldId: 123 }] })).toMatchObject({
    recommendation: 'Assessment Pending', evidence: 'Unknown', transparency: 'Label candidates identified',
    verification: 'Unknown', batch: 'Unknown', completeness: { percent: 0 },
  })
})

it('does not promote unauthenticated local source or batch submissions', () => {
  const profile = buildTrustProfile({ ingredientAssessment: { score: 80, rating: 'Strong', context: { outcome: 'Strength', region: 'UK' } },
    evidenceProfile: { publishable: true, status: 'Published ingredient evidence profile', state: 'published', certainty: 'High', direction: 'Supports benefit', safety: 'Established' },
    sources: [{ source_type: 'Product label', status: 'Verified' }, { source_type: 'Independent quality test', status: 'Pending review' }],
    batches: [{ status: 'Verified' }],
  })
  expect(profile).toMatchObject({ evidence: 'High · Supports benefit', verification: 'Unknown', batch: 'Unknown', completeness: { completed: 3, required: 10, percent: 40 } })
  expect(profile.recommendation).toBe('Ingredient evidence available')
})

it('excludes a stale or context-free ingredient review from the public profile', () => {
  expect(buildTrustProfile({ ingredientAssessment: { score: 90, rating: 'Exceptional' } }).completeness.percent).toBe(0)
  expect(buildTrustProfile({ ingredientAssessment: { score: 90, rating: 'Exceptional', context: { outcome: 'Strength', region: 'UK' }, nextReviewAt: '2020-01-01' } }).evidence).toBe('Unknown')
})

it('publishes ingredient evidence independently while product and batch remain unknown', () => {
  const profile = buildTrustProfile({ evidenceProfile: { publishable: true, status: 'Published ingredient evidence profile', state: 'published', customerLabel: 'Evidence profile published', certainty: 'High', direction: 'Supports benefit', safety: 'Established' }, variants: [{ id: 1 }] })
  expect(profile).toMatchObject({ overallState: 'ingredient_evidence_only', recommendation: 'Ingredient evidence available', ingredientEvidenceState: 'published_supported', productTransparencyState: 'not_assessed', verificationState: 'unknown' })
})

it('does not promote label candidates, manufacturer claims or indicative offers into quality and value', () => {
  const profile = buildTrustProfile({ variants: [{ dsldId: 42 }], qualityReview: { tier: 'Tier3', provider: 'Manufacturer', reviewStatus: 'approved', exactProductMatched: true, independent: false }, valueReview: { costPerServing: 0.42 } })
  expect(profile.layers).toMatchObject({ productQuality: { status: 'Unknown', level: null }, batchVerification: { status: 'Batch Unknown' }, transparency: { status: 'Label candidates only' }, value: { status: 'Unknown', costPerServing: null } })
})

it('requires traceable independent quality, exact-batch documents and exact-SKU prices', () => {
  const incomplete = buildTrustProfile({ qualityReview: { tier: 'Tier1', provider: 'NSF', independent: true, exactProductMatched: true, reviewStatus: 'approved' }, batchReview: { reviewStatus: 'approved', exactLotMatched: true, certificateReviewed: true }, valueReview: { reviewStatus: 'approved', exactProductMatched: true, costPerServing: 0.42 } })
  expect(incomplete.layers).toMatchObject({ productQuality: { status: 'Unknown' }, batchVerification: { status: 'Batch Unknown' }, value: { status: 'Unknown' } })
  const complete = buildTrustProfile({ qualityReview: { tier: 'Tier1', provider: 'NSF', scope: 'Exact product', sourceUrl: 'https://example.org/product', validThrough: '2099-01-01', independent: true, exactProductMatched: true, reviewStatus: 'approved' }, batchReview: { reviewStatus: 'approved', exactLotMatched: true, certificateReviewed: true, issuerChecked: true, testScopeReviewed: true, batchNumber: 'N1761', certificateUrl: 'https://example.org/lot', reportDate: currentDate }, valueReview: { reviewStatus: 'approved', exactProductMatched: true, costPerServing: 0.42, servingSize: '1 capsule', deliveryCost: 0, currency: 'GBP', offerUrl: 'https://example.org/offer', pricedAt: currentDate } })
  expect(complete.layers).toMatchObject({ productQuality: { status: 'Verified', level: 'Tier1', provider: 'NSF' }, batchVerification: { status: 'Current Batch Verified', batchNumber: 'N1761' }, value: { costPerServing: 0.42, currency: 'GBP' } })
  expect(complete.verificationProfile).toMatchObject({ product: 'verified', batch: 'verified' })
  const labelOnly = buildTrustProfile({ transparencyReview: { reviewStatus: 'approved', exactProductMatched: true, labelUrl: 'https://example.org/label', manufacturer: 'Example' } })
  expect(labelOnly.verificationProfile.product).toBe('unknown')
  expect(buildTrustProfile({ qualityReview: { ...complete.layers.productQuality, tier: 'Tier1', provider: 'Manufacturer', sourceUrl: 'https://example.org/claim', scope: 'Exact product', independent: true, exactProductMatched: true, reviewStatus: 'approved' } }).layers.productQuality.status).toBe('Unknown')
  const noBenefitValue = buildTrustProfile({ evidenceProfile: { publishable: true, status: 'Published ingredient evidence profile', state: 'published', direction: 'No meaningful benefit demonstrated', safety: 'Unknown' }, valueReview: { reviewStatus: 'approved', exactProductMatched: true, currency: 'GBP', offerUrl: 'https://example.org/offer', pricedAt: currentDate, servingSize: '1 capsule', deliveryCost: 0, costPerServing: 0.42, costPerEffectiveServing: 0.51, effectiveDoseMatched: true } })
  expect(noBenefitValue.layers.value).toMatchObject({ costPerServing: 0.42, costPerEffectiveServing: null })
  expect(buildTrustProfile({ valueReview: { reviewStatus: 'approved', exactProductMatched: true, currency: 'GBP', offerUrl: 'https://example.org/offer', pricedAt: currentDate, servingSize: '1 capsule', deliveryCost: 0, costPerServing: 0.42, valueClass: 'Good' } }).layers.value.status).toBe('Reviewed')
  expect(buildTrustProfile({ valueReview: { reviewStatus: 'approved', exactProductMatched: true, currency: 'GBP', offerUrl: 'https://example.org/offer', pricedAt: currentDate, servingSize: '1 capsule', deliveryCost: 0, costPerServing: 0.42, valueClass: 'Good', comparisonBasis: 'Comparable exact-formulation offers' } }).layers.value.status).toBe('Good')
})

it('does not confuse previous batch evidence or a lot mismatch with current batch verification', () => {
  const historical = buildTrustProfile({ batchReview: { reviewStatus: 'approved', historicalLotMatched: true, certificateReviewed: true, issuerChecked: true, testScopeReviewed: true, historicalBatchNumber: 'OLD-1', certificateUrl: 'https://example.org/old', reportDate: '2025-09-09' } })
  const mismatch = buildTrustProfile({ batchReview: { reviewStatus: 'rejected', reason: 'lot_mismatch', batchNumber: 'CURRENT-1', certificateUrl: 'https://example.org/different-lot' } })
  expect(historical.layers.batchVerification.status).toBe('Previous Batch Verified')
  expect(mismatch.layers.batchVerification.status).toBe('Batch Mismatch')
  expect(historical.verificationProfile.batch).toBe('unknown')
  expect(mismatch.verificationProfile.batch).toBe('unknown')
  expect(buildTrustProfile({ batchReview: { reviewStatus: 'approved', historicalLotMatched: true, certificateReviewed: true, issuerChecked: true, testScopeReviewed: true, historicalBatchNumber: 'OLD-1', certificateUrl: 'https://example.org/old', reportDate: '2099-01-01' } }).layers.batchVerification.status).toBe('Batch Unknown')
})

it('distinguishes partial independent testing from documented manufacturer-only claims', () => {
  const partial = buildTrustProfile({ qualityReview: { tier: 'Tier2', provider: 'Independent lab', documentType: 'Laboratory report', reportDate: currentDate, scope: 'Partial', sourceUrl: 'https://example.org/report', independent: true, exactProductMatched: true, reviewStatus: 'approved' } })
  const claim = buildTrustProfile({ qualityReview: { tier: 'Tier3', provider: 'Manufacturer', sourceUrl: 'https://example.org/claim', independent: false, exactProductMatched: true, reviewStatus: 'approved' } })
  expect(partial.layers.productQuality.status).toBe('Partially Verified')
  expect(partial.verificationProfile.product).toBe('partially_verified')
  expect(partial.completeness.components.productVerification.status).toBe('partial')
  expect(claim.layers.productQuality.status).toBe('Unverified')
  expect(claim.verificationProfile.product).toBe('unknown')
  expect(claim.completeness.components.productVerification.status).toBe('missing')
})

it('requires an approved, traceable active warning before overriding the overall state', () => {
  const warning = { reviewStatus: 'approved', active: true, severity: 'critical', sourceUrl: 'https://example.org/alert', scope: 'Exact ingredient' }
  expect(buildTrustProfile({ materialAlert: warning })).toMatchObject({ overallState: 'material_warning', layers: { safety: { status: 'Significant Warning' } } })
  expect(buildTrustProfile({ materialAlert: { ...warning, sourceUrl: '' } }).overallState).toBe('assessment_not_started')
})

it('does not give full assessment to a product missing ingredient amounts on its reviewed label', () => {
  const evidenceProfile = { publishable: true, status: 'Published ingredient evidence profile', state: 'published', certainty: 'High', direction: 'Supports benefit', safety: 'Established' }
  const qualityReview = { tier: 'Tier1', provider: 'NSF', scope: 'Exact product', sourceUrl: 'https://example.org/certificate', validThrough: '2099-01-01', independent: true, exactProductMatched: true, reviewStatus: 'approved' }
  const transparencyReview = { reviewStatus: 'approved', exactProductMatched: true, labelUrl: 'https://example.org/label', manufacturer: 'Example', ingredientsDisclosed: true, amountsDisclosed: false, status: 'Good' }
  const partial = buildTrustProfile({ evidenceProfile, qualityReview, transparencyReview })
  expect(partial).toMatchObject({ overallState: 'partial_assessment', productTransparencyState: 'reviewed_partial', layers: { transparency: { status: 'Partial' } } })
  expect(buildTrustProfile({ evidenceProfile, qualityReview, transparencyReview: { ...transparencyReview, amountsDisclosed: true } }).overallState).toBe('full_assessment')
  expect(buildTrustProfile({ evidenceProfile, qualityReview, transparencyReview: { ...transparencyReview, amountsDisclosed: true } }).recommendation).toBe('Full assessment')
})

it('does not classify an unreviewed warning as a safety conclusion or a future report as a verified batch', () => {
  const reviewed = { publishable: true, status: 'Published ingredient evidence profile', state: 'published', direction: 'Supports benefit', safety: 'Some concerns', interactionRisk: true }
  expect(buildTrustProfile({ evidenceProfile: reviewed }).layers.safety.status).toBe('Elevated Risk')
  expect(buildTrustProfile({ evidenceProfile: reviewed, batchReview: { reviewStatus: 'approved', exactLotMatched: true, certificateReviewed: true, batchNumber: 'LOT-1', certificateUrl: 'https://example.org/lot', reportDate: '2099-01-01' } }).layers.batchVerification.status).toBe('Batch Unknown')
})

it('does not publish expired certification or an offer older than 30 days', () => {
  const qualityReview = { tier: 'Tier1', provider: 'NSF', scope: 'Exact product', sourceUrl: 'https://example.org/certificate', validThrough: '2020-01-01', independent: true, exactProductMatched: true, reviewStatus: 'approved' }
  const valueReview = { reviewStatus: 'approved', exactProductMatched: true, costPerServing: 0.42, servingSize: '1 capsule', deliveryCost: 0, currency: 'GBP', offerUrl: 'https://example.org/offer', pricedAt: '2020-01-01' }
  expect(buildTrustProfile({ qualityReview, valueReview }).layers).toMatchObject({ productQuality: { status: 'Unknown' }, value: { status: 'Unknown' } })
})