export const completedEvidenceStates = new Set(['published_supported', 'published_no_benefit', 'published_mixed', 'published_insufficient'])

export function evidenceState(profile = {}) {
  if (profile.state === 'published') return profile.direction === 'Supports benefit' ? 'published_supported' : profile.direction === 'No meaningful benefit demonstrated' ? 'published_no_benefit' : profile.direction === 'Mixed' ? 'published_mixed' : 'published_insufficient'
  if (profile.state === 'reviewed_insufficient') return 'published_insufficient'
  if (profile.state === 'mixed') return 'published_mixed'
  if (profile.state === 'under_review') return 'review_in_progress'
  return 'not_assessed'
}

export function deriveOverallAssessment({ ingredientEvidenceStatus, transparencyStatus = 'not_assessed', productVerificationStatus = 'unknown', alert = false }) {
  if (alert) return { state: 'material_warning', customerLabel: 'Material warning' }
  const evidenceComplete = completedEvidenceStates.has(ingredientEvidenceStatus)
  const transparencyComplete = ['reviewed_complete', 'reviewed_partial'].includes(transparencyStatus)
  const productVerified = ['partially_verified', 'verified'].includes(productVerificationStatus)
  if (evidenceComplete && transparencyStatus === 'reviewed_complete' && productVerificationStatus === 'verified') return { state: 'full_assessment', customerLabel: 'Full assessment' }
  if (evidenceComplete && transparencyComplete) return { state: 'partial_assessment', customerLabel: 'Partial assessment' }
  if (evidenceComplete) return { state: 'ingredient_evidence_only', customerLabel: 'Ingredient evidence available' }
  if (transparencyComplete) return { state: 'product_transparency_only', customerLabel: 'Product transparency available' }
  if (productVerified) return { state: 'verification_only', customerLabel: 'Verification available' }
  if (['search_in_progress', 'screening_in_progress', 'review_in_progress'].includes(ingredientEvidenceStatus)) return { state: 'assessment_in_progress', customerLabel: 'Assessment in progress' }
  return { state: 'assessment_not_started', customerLabel: 'Assessment not started' }
}

export function dataCompleteness({ evidenceStatus, transparencyStatus, productVerificationStatus, batchVerificationStatus = 'unknown', safetyReviewed = false, hasSeller = false, hasPrice = false }) {
  const components = {
    ingredientIdentity: { status: completedEvidenceStates.has(evidenceStatus) ? 'complete' : 'missing', weight: 10, reason: 'Canonical ingredient identity is not published.' },
    evidenceReview: { status: completedEvidenceStates.has(evidenceStatus) ? 'complete' : evidenceStatus === 'not_assessed' ? 'missing' : 'partial', weight: 20 },
    safetyReview: { status: safetyReviewed ? 'complete' : 'missing', weight: 10 },
    productLabel: { status: transparencyStatus === 'reviewed_complete' || transparencyStatus === 'reviewed_partial' ? 'complete' : 'missing', weight: 10 },
    productTransparency: { status: transparencyStatus === 'reviewed_complete' ? 'complete' : transparencyStatus === 'reviewed_partial' ? 'partial' : 'missing', weight: 10 },
    regulatoryReview: { status: 'missing', weight: 10, reason: 'Jurisdiction-specific regulatory review is not published.' },
    productVerification: { status: productVerificationStatus === 'verified' ? 'complete' : productVerificationStatus === 'partially_verified' ? 'partial' : 'missing', weight: 10 },
    batchVerification: { status: batchVerificationStatus === 'verified' ? 'complete' : 'missing', weight: 5 },
    sellerData: { status: hasSeller ? 'partial' : 'missing', weight: 5 },
    priceData: { status: hasPrice ? 'partial' : 'missing', weight: 10 },
  }
  const percent = Math.round(Object.values(components).reduce((sum, item) => sum + (item.status === 'complete' ? item.weight : item.status === 'partial' ? item.weight / 2 : 0), 0))
  return { percent, components }
}
