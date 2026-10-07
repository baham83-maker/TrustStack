function hasExplicitWarning(records = []) {
  return records.some((record) => record?.warningIdentified === true || record?.isWarning === true || record?.warning === true || record?.alert === true)
}

function sentenceCount(text) {
  return (String(text || '').match(/[.!?](?=\s|$)/g) || []).length
}

export function decisionUseCaseSummary(product) {
  const review = product.sourceReview || {}
  const references = review.officialReferences || []
  const researchLeads = review.researchLeads || []
  const labelCandidates = review.productLabelCandidates || []
  const evidenceReferences = references.filter((reference) => reference.evidenceInformationAvailable || reference.evidenceSummary)
  const safetyReferences = references.filter((reference) => reference.safetySectionAvailable || reference.interactionInfoAvailable || reference.contraindicationInfoAvailable)
  const researchCount = Number(review.researchLeadCount) || researchLeads.length
  const exactLabel = product.trustProfile?.productTransparencyProfile?.labelAvailable === true
  const structuredFit = review.productEvidenceFit
  const exactProductResults = exactLabel && structuredFit?.status === 'Direct match' && structuredFit?.outcomeResultsMatched === true
  const warningRecords = [
    ...(review.warningRecords || []),
    ...(review.evidenceWarnings || []),
    ...(review.safetyWarnings || []),
    ...(review.regulatoryWarnings || []),
    ...(review.verificationWarnings || []),
    ...references,
  ]
  const warningFound = hasExplicitWarning(warningRecords)

  const availableParts = []
  if (researchCount) availableParts.push(`${researchCount} literature/trial records`)
  if (evidenceReferences.length) availableParts.push(`${evidenceReferences.length} official evidence summaries`)
  if (safetyReferences.length) availableParts.push(`${safetyReferences.length} safety references`)
  const regulatoryCount = Number(product.sourceContext?.['uk-fsa'] || 0) + Number(product.sourceContext?.['health-canada'] || 0) + Number(product.sourceContext?.['efsa-openfoodtox'] || 0)
  if (regulatoryCount) availableParts.push(`${regulatoryCount} jurisdiction records`)
  const directoryCount = Number(review.registryMatchCount) || review.registryMatches?.length || 0
  if (directoryCount) availableParts.push(`${directoryCount} directory listings`)
  if (labelCandidates.length) availableParts.push(`${labelCandidates.length} product-label candidates`)
  if (warningFound) availableParts.push('an explicitly flagged source record')
  const available = availableParts.length
    ? `${availableParts.join('; ')}.`
    : 'No literature, product-label, safety, regulatory, or directory records are linked.'

  let missing
  if (exactProductResults && (review.structuredOutcomeResults || []).length) {
    missing = 'Personal suitability, long-term safety, regulatory approval, and batch quality are not established.'
  } else {
    const structuredResults = review.structuredOutcomeResults || []
    const leadsWithResults = researchLeads.filter((lead) => lead.outcomeResultsAvailable === true || lead.resultsSummary).length
    const outcomeGap = !structuredResults.length && !leadsWithResults
    const productGap = !exactLabel || !structuredFit || structuredFit.status !== 'Direct match' || structuredFit.outcomeResultsMatched !== true
    const missingParts = []
    if (outcomeGap) missingParts.push('study outcomes are not available')
    if (productGap) missingParts.push(labelCandidates.length && !exactLabel ? 'the exact product match is unconfirmed' : 'an exact product match is not established')
    if (!safetyReferences.length) missingParts.push('safety references are not linked')
    if (!regulatoryCount) missingParts.push('jurisdiction-specific product records are not linked')
    missing = `${missingParts.join('; ')}.`
  }

  let next
  if (warningFound) next = 'Open the flagged source and check its scope, date, and subject before considering this product.'
  else if (exactProductResults) next = 'Compare the matched outcome, serving, and population with the intended use; this does not establish personal suitability.'
  else if (labelCandidates.length) next = 'Confirm the exact product and compare it with relevant study outcomes before drawing a use conclusion.'
  else if (researchCount || evidenceReferences.length) next = 'Review linked sources for study outcomes and an exact product match before drawing a use conclusion.'
  else next = 'Find an exact product label and relevant outcome results before drawing a use conclusion.'

  return {
    tone: warningFound ? 'warning' : exactProductResults ? 'information' : 'unknown',
    available,
    missing,
    next,
    sentenceCounts: { available: sentenceCount(available), missing: sentenceCount(missing), next: sentenceCount(next) },
  }
}

export function evidenceAnalysisSummary(product) {
  const review = product.sourceReview || {}
  const references = review.officialReferences || []
  const researchLeads = review.researchLeads || []
  const labelCandidates = review.productLabelCandidates || []
  const registryMatches = review.registryMatches || []
  const structuredResults = review.structuredOutcomeResults || []
  const productFit = review.productEvidenceFit
  const exactLabel = product.trustProfile?.productTransparencyProfile?.labelAvailable === true
  const exactOutcomeMatch = exactLabel && productFit?.status === 'Direct match' && productFit?.outcomeResultsMatched === true
  const layerInterpretations = review.layerInterpretations || []
  const layerNote = (name) => layerInterpretations.find((item) => item.layer === name)?.interpretation
  const hasOutcomeResults = structuredResults.length > 0 || researchLeads.some((lead) => lead.outcomeResultsAvailable === true || lead.resultsSummary)
  const evidenceInterpretation = layerNote('Ingredient Evidence')

  let evidenceStrength
  if (exactOutcomeMatch && structuredResults.length) {
    evidenceStrength = productFit.summary || productFit.conclusion || 'Structured outcome results are linked to an exact-product match for a defined use; broader conclusions are not established.'
  } else if (evidenceInterpretation) {
    evidenceStrength = evidenceInterpretation
  } else if (Number(review.researchLeadCount) || researchLeads.length) {
    evidenceStrength = `${Number(review.researchLeadCount) || researchLeads.length} research records are available for screening, but outcome results and evidence quality are not established in this entry.`
  } else {
    evidenceStrength = 'No ingredient research matches are linked in this source snapshot; this does not establish that research is absent.'
  }

  let productFitSummary
  if (exactOutcomeMatch) {
    productFitSummary = 'A structured source match links the exact product label to study outcomes for a defined use; applicability beyond that match is not established.'
  } else if (exactLabel) {
    productFitSummary = 'An exact product label is on file, but no structured match links its formulation and serving to study outcomes.'
  } else if (labelCandidates.length || registryMatches.length) {
    productFitSummary = `The source registry has ${labelCandidates.length} label candidates and ${registryMatches.length} directory matches, but they do not confirm this exact product or link it to study outcomes.`
  } else {
    productFitSummary = 'No exact product label or structured match links this product form and serving to study outcomes.'
  }

  const safetyReferences = references.filter((reference) => reference.safetySectionAvailable || reference.interactionInfoAvailable || reference.contraindicationInfoAvailable)
  const sourceContext = product.sourceContext || {}
  const safetyRecords = safetyReferences.length + (Number(sourceContext.openfda) || 0)
  const regulatoryRecords = ['uk-fsa', 'health-canada', 'efsa-openfoodtox'].reduce((count, key) => count + (Number(sourceContext[key]) || 0), 0)
  const informationRisks = []
  if (!hasOutcomeResults) informationRisks.push('unextracted study outcomes')
  if (!exactLabel) informationRisks.push(labelCandidates.length ? 'unconfirmed exact product identity' : 'no exact product label')
  if (!safetyRecords) informationRisks.push('missing safety-specific records')
  if (!regulatoryRecords) informationRisks.push('missing jurisdiction-specific records')
  if (registryMatches.length || labelCandidates.length) informationRisks.push('unverified exact-SKU or batch identity')
  const risks = informationRisks.length
    ? `Key confidence gaps include ${informationRisks.join(', ')}.`
    : 'Personal suitability, long-term safety, regulatory approval, and current-batch quality are not established.'

  return [
    { topic: 'Evidence strength', summary: evidenceStrength },
    { topic: 'Product Fit', summary: productFitSummary },
    { topic: 'Information Risks', summary: risks },
  ]
}
