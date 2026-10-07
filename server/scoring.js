export const scoreWeights = {
  evidence: 0.40,
  safety: 0.20,
  quality: 0.15,
  transparency: 0.10,
  regulatory: 0.05,
  contamination: 0.05,
  value: 0.05,
}

export function calculateTrustScore(product) {
  return Math.round(
    (product.evidence * scoreWeights.evidence)
      + (product.safety * scoreWeights.safety)
      + (product.quality * scoreWeights.quality)
      + (product.transparency * scoreWeights.transparency)
      + (product.regulatory * scoreWeights.regulatory)
      + ((100 - product.contamination) * scoreWeights.contamination)
      + (product.value * scoreWeights.value)
  )
}

export function assessScoreReadiness(dimensions) {
  const missing = Object.entries(scoreWeights)
    .filter(([key]) => !Number.isFinite(dimensions[key]) || dimensions[key] < 0 || dimensions[key] > 100)
    .map(([key, weight]) => ({ dimension: key, weight: Math.round(weight * 100) }))
  return {
    score: missing.length ? null : calculateTrustScore(dimensions),
    status: missing.length ? 'Not scoreable' : 'Ready for review',
    assessedWeight: 100 - missing.reduce((sum, item) => sum + item.weight, 0),
    missing,
  }
}
