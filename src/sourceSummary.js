function positive(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0
}

export function sourceAvailabilitySummary(product) {
  const review = product.sourceReview || {}
  const references = review.officialReferences || []
  const sourceContext = product.sourceContext || {}
  const counts = {
    research: positive(review.researchLeadCount),
    safety: references.filter((reference) => reference.safetySectionAvailable || reference.interactionInfoAvailable || reference.contraindicationInfoAvailable).length + positive(sourceContext.openfda),
    directories: positive(review.registryMatchCount ?? review.registryMatches?.length),
    labels: positive(review.labelCandidateCount),
  }
  const parts = [
    counts.research && `${counts.research} research leads`,
    counts.safety && `${counts.safety} safety reference${counts.safety === 1 ? '' : 's'}`,
    counts.directories && `${counts.directories} directory listings`,
    counts.labels && `${counts.labels} label candidate${counts.labels === 1 ? '' : 's'}`,
  ].filter(Boolean)
  const exactLabel = product.trustProfile?.productTransparencyProfile?.labelAvailable === true
  if (!parts.length) return 'No research leads, safety references, label candidates, or directory listings are linked.'
  return `Linked ${parts.join(', ')}; ${exactLabel ? 'an exact label record is on file' : 'an exact product label is not confirmed'}.`
}
