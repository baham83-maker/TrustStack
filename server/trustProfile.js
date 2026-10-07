import { dataCompleteness, deriveOverallAssessment, evidenceState } from './stateModel.js'

function hasHttpsSource(value) {
  try { return new URL(value).protocol === 'https:' } catch { return false }
}

export function buildTrustProfile({ ingredientAssessment, evidenceProfile = {}, variants = [], qualityReview = null, batchReview = null, transparencyReview = null, valueReview = null, materialAlert = null }) {
  const reviewedIngredient = evidenceProfile?.publishable === true && evidenceProfile.status === 'Published ingredient evidence profile'
  const verifiedLabel = transparencyReview?.reviewStatus === 'approved' && transparencyReview.exactProductMatched === true && hasHttpsSource(transparencyReview.labelUrl) && Boolean(transparencyReview.manufacturer)
  const completeDisclosure = verifiedLabel && transparencyReview.ingredientsDisclosed === true && transparencyReview.amountsDisclosed === true && ['Excellent', 'Good'].includes(transparencyReview.status)
  const tierOne = qualityReview?.tier === 'Tier1' && ['NSF', 'NSF Certified for Sport', 'Informed Sport', 'Informed Choice'].includes(qualityReview.provider) && Number.isFinite(Date.parse(qualityReview.validThrough)) && Date.parse(qualityReview.validThrough) >= Date.now()
  const tierTwo = qualityReview?.tier === 'Tier2' && Boolean(qualityReview.labAccreditation === 'ISO/IEC 17025' || qualityReview.documentType === 'Independent COA' || qualityReview.documentType === 'Laboratory report') && Number.isFinite(Date.parse(qualityReview.reportDate)) && Date.parse(qualityReview.reportDate) <= Date.now()
  const verifiedQuality = qualityReview?.reviewStatus === 'approved' && qualityReview.exactProductMatched === true && qualityReview.independent === true && Boolean(qualityReview.provider && qualityReview.scope) && hasHttpsSource(qualityReview.sourceUrl) && (tierOne || tierTwo)
  const partialQuality = verifiedQuality && qualityReview.scope === 'Partial'
  const manufacturerOnly = !verifiedQuality && qualityReview?.reviewStatus === 'approved' && qualityReview.exactProductMatched === true && qualityReview.tier === 'Tier3' && qualityReview.independent === false && Boolean(qualityReview.provider) && hasHttpsSource(qualityReview.sourceUrl)
  const reviewedRegulatory = false
  const verifiedBatch = batchReview?.reviewStatus === 'approved' && batchReview.exactLotMatched === true && batchReview.certificateReviewed === true && batchReview.issuerChecked === true && batchReview.testScopeReviewed === true && Boolean(batchReview.batchNumber && batchReview.reportDate && !Number.isNaN(Date.parse(batchReview.reportDate)) && Date.parse(batchReview.reportDate) <= Date.now()) && hasHttpsSource(batchReview.certificateUrl)
  const historicalBatch = !verifiedBatch && batchReview?.reviewStatus === 'approved' && batchReview.historicalLotMatched === true && batchReview.certificateReviewed === true && batchReview.issuerChecked === true && batchReview.testScopeReviewed === true && Boolean(batchReview.historicalBatchNumber && batchReview.reportDate && Number.isFinite(Date.parse(batchReview.reportDate)) && Date.parse(batchReview.reportDate) <= Date.now()) && hasHttpsSource(batchReview.certificateUrl)
  const batchMismatch = !verifiedBatch && batchReview?.reviewStatus === 'rejected' && batchReview.reason === 'lot_mismatch' && Boolean(batchReview.batchNumber) && hasHttpsSource(batchReview.certificateUrl)
  const batchStatus = verifiedBatch ? 'Current Batch Verified' : batchMismatch ? 'Batch Mismatch' : historicalBatch ? 'Previous Batch Verified' : 'Batch Unknown'
  const qualityLevel = verifiedQuality ? qualityReview.tier : null
  const activeWarning = materialAlert?.reviewStatus === 'approved' && materialAlert.active === true && materialAlert.severity === 'critical' && Boolean(materialAlert.scope) && hasHttpsSource(materialAlert.sourceUrl)
  const safetyStatus = activeWarning || reviewedIngredient && evidenceProfile.direction === 'Potential harm' ? 'Significant Warning' : !reviewedIngredient ? 'Unknown' : evidenceProfile.safety === 'Some concerns' && evidenceProfile.interactionRisk === true ? 'Elevated Risk' : evidenceProfile.safety === 'Established' ? 'Well Characterised' : 'Context Required'
  const offerAge = Date.now() - Date.parse(valueReview?.pricedAt)
  const valueAvailable = valueReview?.reviewStatus === 'approved' && valueReview.exactProductMatched === true && Boolean(valueReview.currency && valueReview.servingSize) && hasHttpsSource(valueReview.offerUrl) && Number.isFinite(offerAge) && offerAge >= 0 && offerAge <= 30 * 24 * 60 * 60 * 1000 && Number.isFinite(valueReview.costPerServing) && valueReview.costPerServing >= 0 && Number.isFinite(valueReview.deliveryCost) && valueReview.deliveryCost >= 0
  const valueStatus = valueAvailable ? valueReview.comparisonBasis && ['Good', 'Fair', 'Poor'].includes(valueReview.valueClass) ? valueReview.valueClass : 'Reviewed' : 'Unknown'
  const reasons = []
  if (!reviewedIngredient) reasons.push('Outcome-specific ingredient evidence and safety have not been reviewed.')
  else if (evidenceProfile.safety === 'Unknown') reasons.push('Safety for the reviewed dose, population and medicine context remains unknown.')
  if (!verifiedLabel) reasons.push('The exact product label is not verified.')
  if (!verifiedQuality) reasons.push('No independent quality test is verified for this product.')
  if (!reviewedRegulatory) reasons.push('Region-specific regulatory status is not reviewed.')
  if (!verifiedBatch) reasons.push('No certificate is verified for the exact batch.')
  if (activeWarning) reasons.unshift('An active, reviewed material warning applies to the recorded scope.')
  const ingredientState = evidenceState(evidenceProfile)
  const transparencyState = completeDisclosure ? 'reviewed_complete' : verifiedLabel ? 'reviewed_partial' : 'not_assessed'
  const productVerificationState = qualityLevel ? partialQuality ? 'partially_verified' : 'verified' : 'unknown'
  const overall = deriveOverallAssessment({ ingredientEvidenceStatus: ingredientState, transparencyStatus: transparencyState, productVerificationStatus: productVerificationState, alert: activeWarning })
  const completeness = dataCompleteness({ evidenceStatus: ingredientState, transparencyStatus: transparencyState, productVerificationStatus: productVerificationState, batchVerificationStatus: verifiedBatch ? 'verified' : 'unknown', safetyReviewed: reviewedIngredient && evidenceProfile.safety !== 'Unknown', hasSeller: false, hasPrice: false })
  const completed = Object.values(completeness.components).filter((item) => item.status === 'complete').length
  return {
    overallState: overall.state,
    customerLabel: overall.customerLabel,
    recommendation: ['assessment_in_progress', 'assessment_not_started'].includes(overall.state) ? 'Assessment Pending' : overall.customerLabel,
    ingredientEvidenceState: ingredientState,
    layers: {
      ingredientEvidence: { status: ingredientState, direction: reviewedIngredient ? evidenceProfile.direction : 'Unknown', certainty: reviewedIngredient ? evidenceProfile.certainty : 'Unknown', outcome: reviewedIngredient ? evidenceProfile.outcome : null, region: reviewedIngredient ? evidenceProfile.region : null },
      productQuality: { status: partialQuality ? 'Partially Verified' : qualityLevel ? 'Verified' : manufacturerOnly ? 'Unverified' : 'Unknown', level: qualityLevel, provider: qualityLevel || manufacturerOnly ? qualityReview.provider : null, scope: qualityLevel ? qualityReview.scope : null, sourceUrl: qualityLevel || manufacturerOnly ? qualityReview.sourceUrl : null },
      batchVerification: { status: batchStatus, batchNumber: verifiedBatch ? batchReview.batchNumber : historicalBatch ? batchReview.historicalBatchNumber : batchMismatch ? batchReview.batchNumber : null, reportDate: verifiedBatch || historicalBatch ? batchReview.reportDate : null, certificateUrl: verifiedBatch || historicalBatch || batchMismatch ? batchReview.certificateUrl : null },
      safety: { status: safetyStatus, context: reviewedIngredient ? `${evidenceProfile.population || 'Reviewed population'} · ${evidenceProfile.doseRange || 'Reviewed dose'} · ${evidenceProfile.outcome || 'Reviewed outcome'}` : null, interactionRisk: reviewedIngredient ? evidenceProfile.interactionRisk ?? null : null, sportsWarning: reviewedIngredient ? evidenceProfile.sportsWarning ?? null : null },
      transparency: { status: completeDisclosure ? transparencyReview.status : verifiedLabel ? transparencyReview.status === 'Limited' ? 'Limited' : 'Partial' : variants.length ? 'Label candidates only' : 'Unknown', details: verifiedLabel ? transparencyReview.details || [] : [] },
      value: { status: valueStatus, costPerServing: valueAvailable ? valueReview.costPerServing : null, costPerEffectiveServing: valueAvailable && reviewedIngredient && evidenceProfile.direction === 'Supports benefit' && valueReview.effectiveDoseMatched === true && Number.isFinite(valueReview.costPerEffectiveServing) ? valueReview.costPerEffectiveServing : null, costPerGram: valueAvailable && Number.isFinite(valueReview.costPerGram) ? valueReview.costPerGram : null, subscriptionCost: valueAvailable && Number.isFinite(valueReview.subscriptionCost) ? valueReview.subscriptionCost : null, deliveryCost: valueAvailable ? valueReview.deliveryCost : null, currency: valueAvailable ? valueReview.currency : null, servingSize: valueAvailable ? valueReview.servingSize : null, comparisonBasis: valueAvailable ? valueReview.comparisonBasis || null : null, offerUrl: valueAvailable ? valueReview.offerUrl : null, pricedAt: valueAvailable ? valueReview.pricedAt : null },
    },
    productTransparencyState: transparencyState,
    verificationState: verifiedBatch ? 'batch_verified' : productVerificationState,
    productTransparencyProfile: { status: transparencyState, labelAvailable: verifiedLabel, labelUrl: verifiedLabel ? transparencyReview.labelUrl : null, manufacturerIdentified: verifiedLabel, ingredientFormDeclared: verifiedLabel && transparencyReview.ingredientFormDeclared === true, doseDeclared: verifiedLabel && transparencyReview.amountsDisclosed === true, ingredientsDisclosed: verifiedLabel && transparencyReview.ingredientsDisclosed === true, standardisedExtractDeclared: verifiedLabel && transparencyReview.standardisedExtractDeclared === true, manufacturingCountry: verifiedLabel ? transparencyReview.manufacturingCountry || null : null, gmpDisclosure: verifiedLabel && transparencyReview.gmpDisclosure === true, contactDetailsDeclared: verifiedLabel && transparencyReview.contactDetailsDeclared === true, recallHistoryReviewed: verifiedLabel && transparencyReview.recallHistoryReviewed === true, qualityDocumentsAvailable: qualityLevel !== null, missingInformation: !verifiedLabel ? ['Exact current product label', 'Manufacturer identity', 'Declared ingredient forms and amounts'] : completeDisclosure ? [] : ['Complete ingredient and amount disclosure'] },
    verificationProfile: { product: productVerificationState, batch: verifiedBatch ? 'verified' : 'unknown', certificate: qualityLevel ? partialQuality ? 'partially_checked' : 'verified' : 'not_available' },
    evidence: reviewedIngredient ? `${evidenceProfile.certainty} · ${evidenceProfile.direction}` : 'Unknown',
    safety: safetyStatus,
    transparency: verifiedLabel ? 'Label verified' : variants.length ? 'Label candidates identified' : 'Unknown',
    verification: qualityLevel ? `${partialQuality ? 'Limited scope · ' : ''}${qualityReview.provider} · ${qualityLevel}` : manufacturerOnly ? 'Manufacturer claim only · Unverified' : 'Unknown',
    regulatory: reviewedRegulatory ? 'Reviewed' : 'Unknown',
    batch: batchStatus === 'Batch Unknown' ? 'Unknown' : batchStatus,
    completeness: { completed, required: Object.keys(completeness.components).length, percent: completeness.percent, components: completeness.components, scope: 'Coverage of reviewed ingredient, product and verification records; completeness is not trustworthiness.' },
    reasons,
  }
}