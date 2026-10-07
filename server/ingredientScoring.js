export const ingredientMethodologyVersion = 'ITR-1.0'

export const ingredientWeights = {
  evidence: 0.40,
  safety: 0.20,
  regulatoryConfidence: 0.15,
  transparency: 0.10,
  evidenceConsistency: 0.10,
  biologicalPlausibility: 0.05,
}

export function ingredientRating(score) {
  if (!Number.isFinite(score)) return 'Assessment incomplete'
  if (score >= 90) return 'Exceptional'
  if (score >= 75) return 'Strong'
  if (score >= 60) return 'Moderate'
  if (score >= 40) return 'Limited'
  return 'Low'
}

function acceptedCitations(citations) {
  return citations.filter((url) => {
    try { return new URL(url).protocol === 'https:' } catch { return false }
  })
}

function confidenceFor({ missing, citations, outcome, region, ingredientForm, doseRange, population, reviewer, reviewedAt, nextReviewAt }) {
  let points = Math.round((6 - missing.length) / 6 * 40)
  points += Math.min(20, citations.length * 5)
  points += [outcome, region, ingredientForm, doseRange, population].filter((value) => value?.trim()).length * 5
  if (reviewer?.trim() && reviewedAt) points += 10
  if (nextReviewAt) points += 5
  return { score: Math.min(100, points), level: points >= 85 ? 'High' : points >= 60 ? 'Moderate' : 'Low' }
}

export function assessIngredient(input = {}) {
  const { outcome, region, ingredientForm, doseRange, population, duration, dimensions = {}, citations = [], evidenceProfile = {}, limitations = '', reviewedAt, nextReviewAt, reviewer, methodologyVersion = ingredientMethodologyVersion } = input
  const missing = Object.entries(ingredientWeights)
    .filter(([key]) => !Number.isFinite(dimensions[key]) || dimensions[key] < 0 || dimensions[key] > 100)
    .map(([dimension, weight]) => ({ dimension, weight: Math.round(weight * 100) }))
  const validCitations = acceptedCitations(Array.isArray(citations) ? citations : [])
  const confidence = confidenceFor({ missing, citations: validCitations, outcome, region, ingredientForm, doseRange, population, reviewer, reviewedAt, nextReviewAt })
  const requiredContext = [outcome, region, ingredientForm, doseRange, population].every((value) => value?.trim())
  const validReviewDate = Number.isFinite(Date.parse(reviewedAt)) && Date.parse(reviewedAt) <= Date.now()
  const ready = Boolean(requiredContext && reviewer?.trim() && validReviewDate && validCitations.length && !missing.length)
  const score = ready ? Math.round(Object.entries(ingredientWeights).reduce((sum, [key, weight]) => sum + dimensions[key] * weight, 0)) : null
  return {
    score,
    rating: ingredientRating(score),
    status: ready ? 'Reviewed ingredient assessment' : 'Assessment pending',
    confidence,
    assessedWeight: 100 - missing.reduce((sum, item) => sum + item.weight, 0),
    missing,
    dimensions,
    context: { outcome: outcome || null, region: region || null, ingredientForm: ingredientForm || null, doseRange: doseRange || null, population: population || null, duration: duration || null },
    evidenceProfile,
    citations: validCitations,
    limitations,
    reviewer: reviewer || null,
    reviewedAt: reviewedAt || null,
    nextReviewAt: nextReviewAt || null,
    methodologyVersion,
  }
}