export const catalogueGroups = {
  'Sports Performance': ['Creatine Monohydrate', 'Whey Protein', 'Plant Protein', 'Casein Protein', 'Electrolytes', 'Caffeine', 'Beta-Alanine', 'Citrulline Malate', 'Sodium Bicarbonate', 'Beetroot Nitrate'],
  'Vitamins & Minerals': ['Vitamin D3', 'Vitamin K2', 'Magnesium', 'Zinc', 'Iron', 'Calcium', 'B12', 'Folate', 'Multivitamins', 'Vitamin C'],
  'Essential Health Supplements': ['Omega-3 Fish Oil', 'Algal Omega-3', 'CoQ10', 'Glucosamine', 'Collagen', 'Probiotics'],
  Sleep: ['Magnesium Glycinate', 'Melatonin', 'Valerian', 'Glycine', 'L-Theanine', 'Ashwagandha', 'Chamomile'],
  'Cognitive Performance': ['L-Theanine', 'Caffeine', 'Rhodiola', "Lion's Mane", 'Alpha GPC', 'Citicoline'],
  "Women's Health": ['Folic Acid', 'Prenatal Multivitamins', 'Iron', 'Omega-3 Fish Oil', 'Vitamin D3'],
  "Men's Health": ['Zinc', 'Magnesium', 'Vitamin D3', 'Omega-3 Fish Oil', 'Creatine Monohydrate'],
  'Botanical Supplements': ['Ashwagandha', 'Turmeric', 'Curcumin', 'Rhodiola', 'Ginseng', 'Green Tea Extract', 'Berberine'],
}

export const catalogueNames = [...new Set(Object.values(catalogueGroups).flat())]

export function categoriesFor(name) {
  return Object.entries(catalogueGroups).filter(([, products]) => products.includes(name)).map(([category]) => category)
}

const outcomePatterns = {
  sleep: /\b(?:sleep\w*|snooze|melatonin|rest|insomnia)\b/i,
  'muscle-growth': /\b(?:muscle|hypertrophy|lean mass|growth)\b/i,
  performance: /\b(?:strength|power|exercise|sport)\b/i,
  'heart-health': /\b(?:cholesterol|heart|cardiovascular|lipid|triglyceride|omega)\b/i,
  stress: /\b(?:stress|anxiety|calm|mood|relax)\b/i,
  'joint-health': /\b(?:joint|cartilage|osteoarthritis|inflammation|mobility)\b/i,
  'blood-pressure': /\b(?:blood pressure|hypertension|vascular)\b/i,
  immune: /\b(?:immune|immunity|infection)\b/i,
  cognitive: /\b(?:cognitive|memory|focus|brain|attention)\b/i,
  'bone-health': /\b(?:bone|calcium|vitamin d|osteoporosis)\b/i,
  digestive: /\b(?:digestive|gut|gastro|constipation|bloating|probiotic)\b/i,
  energy: /\b(?:energy|fatigue|alertness|tiredness)\b/i,
}

function normalizedRegion(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[.]/g, '')
  const regions = {
    global: 'global',
    uk: 'uk', gb: 'uk', 'united kingdom': 'uk', 'great britain': 'uk',
    eu: 'eu', 'european union': 'eu', europe: 'eu',
    us: 'us', usa: 'us', 'united states': 'us', 'united states of america': 'us',
    canada: 'canada',
  }
  return regions[normalized] || null
}

export function matchesCatalogueSearch(product, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase()
  if (!normalizedQuery) return true
  const searchableText = [product.name, product.brand, product.type, product.bestFor, product.recommendation, ...(product.categories || [])].filter(Boolean).join(' ').toLowerCase()
  return searchableText.includes(normalizedQuery)
}

export function matchesCatalogueCategory(product, category) {
  return category === 'all' || (product.categories || categoriesFor(product.name)).includes(category)
}

export function matchesCatalogueRegion(product, region) {
  const selectedRegion = normalizedRegion(region)
  if (selectedRegion === 'global') return true
  if (!selectedRegion) return false
  const reviewedRegions = [
    product.ingredientAssessment?.context?.region,
    product.ingredientEvidenceProfile?.region,
    product.trustProfile?.layers?.ingredientEvidence?.region,
  ].map(normalizedRegion).filter(Boolean)
  return reviewedRegions.includes(selectedRegion)
}

export function matchesCatalogueOutcome(product, outcome) {
  if (!outcome || outcome === 'all' || outcome.startsWith('view-')) return true
  if (outcome === 'verified-formulation') {
    const transparency = product.trustProfile?.productTransparencyProfile
    return transparency?.status === 'reviewed_complete'
      && transparency.labelAvailable === true
      && transparency.ingredientsDisclosed === true
      && transparency.doseDeclared === true
      && transparency.manufacturerIdentified === true
  }
  return Boolean(outcomePatterns[outcome]?.test(product.bestFor || ''))
}

export function matchesCatalogueView(product, view) {
  const state = product.ingredientEvidenceProfile?.state
  switch (view) {
    case 'view-evidence-reviewed': return ['published', 'reviewed_insufficient', 'mixed'].includes(state)
    case 'view-evidence-published': return state === 'published'
    case 'view-evidence-insufficient': return state === 'reviewed_insufficient'
    case 'view-evidence-mixed': return state === 'mixed'
    case 'view-evidence-review': return state === 'under_review'
    case 'view-label-candidates': return product.trustProfile?.transparency === 'Label candidates identified'
    case 'view-athlete-verified': return product.sourceReview?.registryMatches?.some((match) => match.source === 'Informed Sport') === true
    default: return true
  }
}