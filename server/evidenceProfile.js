export const evidenceProfileVersion = 'IEP-1.0'

const allowed = {
  certainty: new Set(['High', 'Moderate', 'Low', 'Very low', 'Insufficient']),
  direction: new Set(['Supports benefit', 'No meaningful benefit demonstrated', 'Mixed', 'Potential harm', 'Insufficient evidence']),
  consistency: new Set(['Consistent', 'Mostly consistent', 'Mixed', 'Unclear']),
  directness: new Set(['Direct', 'Partially direct', 'Indirect']),
  safety: new Set(['Established', 'Some concerns', 'Limited', 'Unknown']),
}

function valueIn(field, value) { return typeof value === 'string' && allowed[field]?.has(value) }

export function validateEvidenceProfile(input = {}) {
  const { canonicalIngredient, ingredientForm, doseRange, population, outcome, duration = '', route = '', region, searchStrategy, lastSearched, sources = [], certainty, direction, consistency, directness, safety, interactionRisk = null, sportsWarning = null, limitations = '', reviewer, reviewedAt, reviewStatus = 'Not assessed', methodologyVersion = evidenceProfileVersion } = input
  const missing = [
    ['canonicalIngredient', canonicalIngredient], ['ingredientForm', ingredientForm], ['doseRange', doseRange], ['population', population], ['outcome', outcome], ['region', region], ['searchStrategy', searchStrategy], ['lastSearched', lastSearched], ['reviewer', reviewer], ['reviewedAt', reviewedAt],
  ].filter(([, value]) => !String(value || '').trim()).map(([field]) => field)
  if (!Array.isArray(sources) || !sources.length) missing.push('sources')
  for (const field of Object.keys(allowed)) if (!valueIn(field, input[field])) missing.push(field)
  const validDate = Number.isFinite(Date.parse(reviewedAt)) && Date.parse(reviewedAt) <= Date.now()
  if (!validDate) missing.push('reviewedAt')
  const humanReviewed = reviewStatus === 'Human reviewed' && missing.length === 0
  const published = humanReviewed
  const state = humanReviewed
    ? direction === 'Insufficient evidence' ? 'reviewed_insufficient' : direction === 'Mixed' ? 'mixed' : 'published'
    : reviewStatus === 'Automated screening only' ? 'under_review' : 'not_assessed'
  const labels = { published: 'Evidence profile published', reviewed_insufficient: 'Insufficient evidence', mixed: 'Mixed evidence', under_review: 'Evidence under review', not_assessed: 'Evidence not assessed' }
  return {
    status: published ? 'Published ingredient evidence profile' : reviewStatus,
    state,
    customerLabel: labels[state],
    publishable: published,
    missing: [...new Set(missing)],
    canonicalIngredient: canonicalIngredient || null,
    ingredientForm: ingredientForm || null,
    doseRange: doseRange || null,
    population: population || null,
    outcome: outcome || null,
    duration: duration || null,
    route: route || null,
    region: region || null,
    searchStrategy: searchStrategy || null,
    lastSearched: lastSearched || null,
    sources: Array.isArray(sources) ? sources : [],
    certainty: certainty || 'Insufficient',
    direction: direction || 'Insufficient evidence',
    consistency: consistency || 'Unclear',
    directness: directness || 'Indirect',
    safety: safety || 'Unknown',
    interactionRisk: typeof interactionRisk === 'boolean' ? interactionRisk : null,
    sportsWarning: typeof sportsWarning === 'boolean' ? sportsWarning : null,
    limitations,
    reviewer: reviewer || null,
    reviewedAt: reviewedAt || null,
    methodologyVersion,
  }
}