import { mentionsName } from './sourceCoverage.js'

const researchSources = new Set(['Europe PMC', 'PubMed', 'ClinicalTrials.gov', 'OpenAlex'])
const outcomePatterns = [
  ['strength and exercise performance', /\b(strength|power|exercise performance|sprint|resistance training)\b/i],
  ['sleep', /\b(insomnia|sleep quality|sleep duration|sleep onset|sleep disturbance)\b/i],
  ['stress and mood', /\b(psychological stress|perceived stress|stress|anxiety|depression|mood)\b/i],
  ['energy and fatigue', /\b(energy|fatigue|fatigued)\b/i],
  ['cognitive performance', /\b(cognition|cognitive|memory|attention)\b/i],
  ['cardiovascular health', /\b(blood pressure|cholesterol|cardiovascular)\b/i],
  ['metabolic health', /\b(glucose|glycemic|insulin sensitivity|blood sugar)\b/i],
  ['digestive health', /\b(gut health|bowel|constipation|gastrointestinal)\b/i],
  ['joint health', /\b(joint pain|osteoarthritis|joint function)\b/i],
]

export function bestCaseUse(name, candidates = [], sources = {}) {
  const relevant = candidates.filter((item) => researchSources.has(item.source) && item.url && mentionsName(item.title, name) &&
    !/\b(in vitro|in silico|mice|mouse|rats|animal model|food texture|mushroom steak|sensory characterization|adolescents|children|pediatric|menopausal|postmenopausal|age-associated memory impairment|attention deficit|ADHD|patients|hypertension|traumatic brain injury|phonophoresis|observational studies|oxidative stress|thermoregulatory|co-supplementation|combination|combined|versus|hericium erinaceus gummies)\b/i.test(item.title || '') &&
    (item.source === 'ClinicalTrials.gov' ? item.studyType === 'INTERVENTIONAL' :
      /\b(randomi[sz]ed|clinical trial|systematic review|meta-analysis)\b/i.test(item.title || '')))
  for (const [goal, pattern] of outcomePatterns) {
    const lead = relevant.find((item) => pattern.test(item.title || ''))
    if (lead) return { label: `Explore for ${goal}`, goal, reason: `A linked trial or review title investigates ${goal}; its results, dose and applicability have not been reviewed.`, evidenceUrl: lead.url, evidenceTitle: lead.title, status: 'Conditional research lead, not a recommendation to take a product' }
  }
  const unavailableResearch = ['europePmc', 'pubmed', 'clinicalTrials', 'openAlex'].filter((source) => sources[source] !== 'fulfilled')
  return { label: 'Hold for now', goal: null, reason: unavailableResearch.length
    ? `Research lookup incomplete (${unavailableResearch.join(', ')} unavailable). No general-use study lead passed this snapshot; this does not show the ingredient is ineffective.`
    : 'No general-use study lead passed this search. Narrow-population or mixed-ingredient studies may exist; this does not show the ingredient is ineffective.', evidenceUrl: null, evidenceTitle: null, status: 'No supported product recommendation' }
}

export function bestCaseForEntry(name, evidenceProfile, candidates = [], sources = {}) {
  if (!evidenceProfile?.publishable) return bestCaseUse(name, candidates, sources)
  const supportsBenefit = evidenceProfile.direction === 'Supports benefit'
  return {
    label: supportsBenefit ? `Reviewed use: ${evidenceProfile.outcome}` : 'Hold for now',
    goal: supportsBenefit ? evidenceProfile.outcome : null,
    reason: `Human-reviewed ingredient evidence: ${evidenceProfile.direction} for ${evidenceProfile.outcome} (${evidenceProfile.population}, ${evidenceProfile.doseRange}). Product quality and batch status require separate review.`,
    evidenceUrl: evidenceProfile.sources?.[0]?.url || null,
    evidenceTitle: evidenceProfile.sources?.[0]?.title || null,
    status: 'Reviewed ingredient conclusion, not an exact-product recommendation',
  }
}

export function assessmentReview({ name, candidates = [], sources = {}, checkedAt = null, labels = [], registry = [] }) {
  const research = candidates.filter((candidate) => researchSources.has(candidate.source) && candidate.url)
  const identity = candidates.filter((candidate) => candidate.source === 'PubChem' && candidate.url)
  const guidance = candidates.filter((candidate) => candidate.source === 'NIH ODS' || candidate.source === 'NIH ODS reference')
  const adverseEvents = registry.filter((candidate) => candidate.source === 'openFDA')
  const unavailable = Object.entries(sources).filter(([, state]) => state !== 'fulfilled').map(([source]) => source)
  const actions = []
  if (unavailable.length) actions.push(`Retry unavailable sources: ${unavailable.join(', ')}. A failed lookup is not evidence of absence.`)
  actions.push(research.length
    ? 'Screen title matches for the intended outcome and human applicability; exclude unrelated food, animal or mechanistic records before reviewing form, dose, design, bias and consistency. Deduplicate overlapping indexes.'
    : 'Find outcome-specific human evidence; no usable study link was found in this snapshot.')
  actions.push(adverseEvents.length
    ? 'Review the name-matched adverse-event reports for context; reports do not establish causality or incidence.'
    : 'Review interactions, contraindications and dose-specific safety; missing reports do not establish safety.')
  if (guidance.length) actions.push('Review the linked NIH ODS guidance directly; an inaccessible fact sheet is a reference, not reviewed safety data.')
  if (identity.length) actions.push('Check PubChem chemical identity against the exact ingredient form; identity does not establish benefit.')
  actions.push(labels.length
    ? 'Match a labelled child to a current brand, UPC, formulation and market before treating its label as product evidence.'
    : 'Identify a branded product and obtain its current label, serving size and formulation.')
  actions.push('Request independent product-quality documentation and an exact-lot certificate; directory names are not batch verification.')
  actions.push('Review regulatory status for the intended region before making a claim or recommendation.')
  return {
    recommendation: 'Assessment Pending',
    bestCase: bestCaseUse(name, research, sources),
    reviewStage: research.length ? 'Research relevance screening' : 'Source discovery',
    rationale: research.length
      ? 'Search results mention this entry, but may be unrelated to the intended outcome; human applicability and study quality have not been adjudicated.'
      : 'This search did not provide a reviewable study link; source failures or search terms may explain the gap.',
    checkedAt,
    sourceStatuses: sources,
    leads: {
      research: research.slice(0, 5).map(({ source, title, url, studyType, resultsAvailable, publicationTypes, searchClass }) => ({ source, title, url, studyType: studyType || null, resultsAvailable: resultsAvailable === true, publicationTypes: publicationTypes || [], searchClass: searchClass || null })),
      guidance: guidance.slice(0, 2).map(({ source, title, url }) => ({ source, title, url })),
      identity: identity.slice(0, 2).map(({ source, title, url }) => ({ source, title, url })),
      labels: labels.slice(0, 3).map(({ brand, name, dsld_id: dsldId, label_url: labelUrl }) => ({ brand, name, dsldId, labelUrl })),
      safetySignals: adverseEvents.slice(0, 3).map(({ title, observedAt }) => ({ title, observedAt })),
    },
    actions,
    publicationBlocked: true,
  }
}