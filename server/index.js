import cors from 'cors'
import express from 'express'
import Database from 'better-sqlite3'
import XLSX from 'xlsx'
import path from 'node:path'
import crypto from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { assessScoreReadiness, calculateTrustScore } from './scoring.js'
import { assessIngredient } from './ingredientScoring.js'
import { buildTrustProfile } from './trustProfile.js'
import { fetchCertifiedList } from './informedSportList.js'
import { nsfListingRecords, suppliedPageCandidates, foodSafetyCampaignRecord } from './suppliedSources.js'
import { assessmentReview, bestCaseForEntry } from './assessmentReview.js'
import { validateEvidenceProfile } from './evidenceProfile.js'
import { evidenceState } from './stateModel.js'
import { catalogueGroups, catalogueNames, categoriesFor, matchesCatalogueRegion, matchesCatalogueSearch } from './catalogue.js'
import { assessCandidateReadiness, deduplicateResearchCandidates, extractClinicalTrialCandidates, extractNccihCandidates, extractOdsCandidates, extractOpenAlexCandidates, extractOpenFoodFactsCandidates, extractOpssCandidates, extractOfficialReferenceDetails, extractPubChemCandidates, extractPubMedCandidates, extractResearchCandidates, extractSourceCoverage, odsReference, scoreInformationCoverage, sourceLayerInterpretations } from './sourceCoverage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const database = new Database(process.env.SUPPLEMENT_DB_PATH || path.join(__dirname, 'supplements.db'))
const port = Number(process.env.PORT || 54321)
let ingestionRunning = false
const researchCache = new Map()
const publicPageCache = new Map()

async function fetchCachedPublicPage(url) {
  const cached = publicPageCache.get(url)
  if (cached && Date.now() - cached.checkedAt < 24 * 60 * 60 * 1000) return cached.promise
  const promise = (async () => {
    const response = await fetch(url, { headers: { accept: 'text/html', 'user-agent': 'TrustStack/1.0 (public ingredient information)' }, signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`)
    return response.text()
  })()
  publicPageCache.set(url, { checkedAt: Date.now(), promise })
  try { return await promise } catch (error) { publicPageCache.delete(url); throw error }
}
function v2Envelope(data, warnings = []) {
  return { schemaVersion: '2.0', generatedAt: new Date().toISOString(), data, warnings, provenance: { requestId: crypto.randomUUID(), catalogueVersion: '2.0', methodologyVersion: 'IEP-1.0', sourceRegistryVersion: '1.0' } }
}

function v2Direction(direction) { return { 'Supports benefit': 'supports_benefit', 'No meaningful benefit demonstrated': 'no_meaningful_benefit', Mixed: 'mixed', 'Potential harm': 'potential_harm', 'Insufficient evidence': 'insufficient' }[direction] || 'insufficient' }
function v2EvidenceProfile(profile) {
  return { ...profile, status: evidenceState(profile), direction: v2Direction(profile.direction), certainty: String(profile.certainty || 'not_assessed').toLowerCase().replaceAll(' ', '_'), consistency: String(profile.consistency || 'not_assessed').toLowerCase().replaceAll(' ', '_'), directness: String(profile.directness || 'not_assessed').toLowerCase().replaceAll(' ', '_'), sources: (profile.sources || []).map((source) => ({ ...source, sourceId: source.sourceId || source.id || source.url, screeningDecision: source.screeningDecision || 'awaiting_review' })) }
}

function v2CatalogueEntryBase(product) {
  const evidence = v2EvidenceProfile(product.ingredientEvidenceProfile || {})
  return { id: String(product.id), entityType: 'ingredient', slug: product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: product.name, categories: product.categories || [], ingredient: { ingredientId: `ingredient-${product.id}`, canonicalName: evidence.canonicalIngredient || product.name, displayName: product.name, synonyms: [], ingredientType: String(product.type || 'other').toLowerCase(), form: evidence.ingredientForm, chemicalIdentifiers: {}, identityStatus: evidence.canonicalIngredient ? 'partially_resolved' : 'unresolved' }, ingredientEvidenceProfile: evidence, safetyProfile: { status: evidence.publishable ? 'reviewed' : 'not_assessed', limitations: evidence.limitations ? [evidence.limitations] : [] }, product: { productId: String(product.id), productName: product.name, brandName: product.brand, identifiers: {}, marketRegions: [product.region || 'Global'], productStatus: 'unknown' }, productTransparencyProfile: product.trustProfile?.productTransparencyProfile || { status: 'not_assessed' }, productVerificationProfile: product.trustProfile?.verificationProfile || { status: 'unknown', documents: [] }, batchVerificationProfile: { status: product.trustProfile?.batch === 'Batch verified' ? 'verified' : 'unknown', documents: [], identityVerified: false, certificateCoversExactBatch: false, testScopeReviewed: false, specificationLimitsAvailable: false, verifiedAnalytes: [], contaminants: [], limitations: ['No exact batch verification is published.'] }, regulatoryProfiles: [], overallAssessment: { state: product.trustProfile?.overallState === 'assessment_pending' ? 'assessment_not_started' : product.trustProfile?.overallState, customerLabel: product.trustProfile?.customerLabel || product.trustProfile?.recommendation || 'Assessment not started', summary: product.trustProfile?.recommendation || 'Assessment pending', availableProfiles: evidence.publishable ? ['Ingredient evidence'] : [], missingProfiles: ['Product transparency', 'Product verification', 'Batch verification'], actions: [{ action: 'view_evidence', label: 'View evidence profile' }, { action: 'upload_label', label: 'Submit product label' }, { action: 'check_batch', label: 'Check a batch' }] }, dataCompleteness: product.trustProfile?.completeness || { percent: 0, components: {} }, alerts: [], audit: { updatedAt: product.updatedAt } }
}

function v2CatalogueEntry(product) {
  const entry = v2CatalogueEntryBase(product)
  const layers = product.trustProfile?.layers || {}
  const quality = layers.productQuality || {}
  const batch = layers.batchVerification || {}
  entry.assessmentLayers = layers
  entry.safetyProfile = { status: layers.safety?.status || 'Unknown', context: layers.safety?.context || null, interactionRisk: layers.safety?.interactionRisk ?? null, sportsWarning: layers.safety?.sportsWarning ?? null, limitations: entry.safetyProfile.limitations }
  entry.productVerificationProfile = { ...entry.productVerificationProfile, status: product.trustProfile?.verificationProfile?.product || 'unknown', provider: quality.provider || null, verificationLevel: quality.level || null, sourceUrl: quality.sourceUrl || null }
  const currentBatch = batch.status === 'Current Batch Verified'
  entry.batchVerificationProfile = { ...entry.batchVerificationProfile, status: currentBatch ? 'verified' : batch.status === 'Previous Batch Verified' ? 'partially_verified' : batch.status === 'Batch Mismatch' ? 'failed_scope_check' : 'unknown', batchNumber: batch.batchNumber || null, reportDate: batch.reportDate || null, certificateCoversExactBatch: currentBatch, documents: batch.certificateUrl ? [{ documentType: 'certificate_of_analysis', sourceUrl: batch.certificateUrl, scopeStatus: currentBatch ? 'exact_batch' : 'unclear', authenticityStatus: batch.status === 'Batch Mismatch' ? 'could_not_verify' : 'verified' }] : [] }
  entry.valueAssessment = layers.value || { status: 'Unknown', costPerServing: null, costPerEffectiveServing: null }
  entry.overallAssessment.summary = `${entry.overallAssessment.customerLabel}. Product quality: ${quality.status || 'Unknown'}; batch: ${batch.status || 'Batch Unknown'}; value: ${entry.valueAssessment.status}.`
  return entry
}

const odsLookupNames = {
  'C-Ester Ascorbyl Palmitate 500 mg': 'Vitamin C',
  'Daily Multivitamin': 'Multivitamin',
  'Magnesium Complex': 'Magnesium',
  'Magnesium Glycinate': 'Magnesium',
  'Vitamin D3': 'Vitamin D',
  'Vitamin K2': 'Vitamin K',
}

function addNcbiRequestMetadata(url) {
  url.searchParams.set('tool', process.env.NCBI_TOOL || 'TrustStack')
  if (process.env.NCBI_EMAIL) url.searchParams.set('email', process.env.NCBI_EMAIL)
  if (process.env.NCBI_API_KEY) url.searchParams.set('api_key', process.env.NCBI_API_KEY)
  return url
}

async function researchFor(name, variants = []) {
  const cached = researchCache.get(name)
  if (cached && Date.now() - cached.checkedAt < (Object.values(cached.sources).every((status) => status === 'fulfilled') ? 60 : 5) * 60 * 1000) return cached
  const safeName = name.replaceAll('"', '')
  const europeUrl = new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search')
  europeUrl.searchParams.set('query', `TITLE_ABS:"${safeName}"`)
  europeUrl.searchParams.set('format', 'json')
  europeUrl.searchParams.set('pageSize', '20')
  const pubmedBase = `"${safeName}"[Title/Abstract]`
  const pubmedSearches = [
    ['reviews-meta-analysis', `(${pubmedBase}) AND (systematic review[Publication Type] OR meta-analysis[Publication Type])`],
    ['randomized-trials', `(${pubmedBase}) AND (randomized controlled trial[Publication Type] OR clinical trial[Publication Type])`],
    ['safety', `(${pubmedBase}) AND (safety OR adverse event OR interaction OR tolerability)`],
  ]
  const trialsUrl = new URL('https://clinicaltrials.gov/api/v2/studies')
  trialsUrl.searchParams.set('query.term', `"${safeName}"`)
  trialsUrl.searchParams.set('pageSize', '20')
  trialsUrl.searchParams.set('format', 'json')
  const openAlexUrl = new URL('https://api.openalex.org/works')
  openAlexUrl.searchParams.set('search', safeName)
  openAlexUrl.searchParams.set('per-page', '20')
  openAlexUrl.searchParams.set('select', 'id,doi,title,publication_year,type,cited_by_count,open_access,primary_location')
  const odsName = odsLookupNames[name] || name
  const odsUrl = new URL('https://ods.od.nih.gov/factsheets/list-all/')
  const pubchemUrl = new URL(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/property/Title,MolecularFormula,MolecularWeight,InChIKey/JSON`)
  const fetchResponse = async (url) => { const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'TrustStack/1.0 (ingredient source review)' }, signal: AbortSignal.timeout(url.hostname === 'pubchem.ncbi.nlm.nih.gov' ? 15000 : 8000) }); if (!response.ok) throw new Error(`${url.hostname} returned ${response.status}`); return response }
  const fetchJson = async (url) => (await fetchResponse(url)).json()
  const fetchText = async (url) => (await fetchResponse(url)).text()
  const [europeResult, trialsResult, odsResult, pubchemResult, openAlexResult] = await Promise.allSettled([fetchJson(europeUrl), fetchJson(trialsUrl), fetchCachedPublicPage(odsUrl.href), fetchJson(pubchemUrl), fetchJson(openAlexUrl)])
  const pubmedResults = []
  let pubmedSearchesSucceeded = 0
  for (const [searchClass, term] of pubmedSearches) {
    const searchUrl = addNcbiRequestMetadata(new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi'))
    searchUrl.searchParams.set('db', 'pubmed'); searchUrl.searchParams.set('term', term); searchUrl.searchParams.set('retmode', 'json'); searchUrl.searchParams.set('retmax', '20')
    try {
      const search = await fetchJson(searchUrl)
      pubmedSearchesSucceeded++
      const ids = search.esearchresult?.idlist || []
      if (!ids.length) continue
      const summaryUrl = addNcbiRequestMetadata(new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi'))
      summaryUrl.searchParams.set('db', 'pubmed'); summaryUrl.searchParams.set('id', ids.join(',')); summaryUrl.searchParams.set('retmode', 'json')
      const summary = await fetchJson(summaryUrl)
      pubmedResults.push(...extractPubMedCandidates(name, { result: { uids: ids, ...summary.result }, searchClass }))
    } catch { /* each NCBI search is independently optional */ }
  }
  const [nccihIndexResult, opssIndexResult] = await Promise.allSettled([
    fetchCachedPublicPage('https://www.nccih.nih.gov/health/herbsataglance'),
    fetchCachedPublicPage('https://www.opss.org/ingredient-and-substance-index'),
  ])
  const nccihReferences = nccihIndexResult.status === 'fulfilled' ? extractNccihCandidates(name, nccihIndexResult.value).slice(0, 2) : []
  const opssReferences = opssIndexResult.status === 'fulfilled' ? extractOpssCandidates(name, opssIndexResult.value).slice(0, 2) : []
  const odsReferences = odsResult.status === 'fulfilled' ? extractOdsCandidates(name, odsResult.value).slice(0, 2) : []
  const officialReferences = [...nccihReferences, ...opssReferences, ...odsReferences]
  const officialReferenceResults = await Promise.allSettled(officialReferences.map(async (reference) => extractOfficialReferenceDetails(reference, await fetchCachedPublicPage(reference.url))))
  const officialReferenceCandidates = officialReferenceResults.filter((result) => result.status === 'fulfilled').map((result) => result.value)
  const barcodeLookups = [...new Set(variants.map((variant) => String(variant.upc || '').replace(/\D/g, '')).filter(Boolean))].slice(0, 3)
  const openFoodFactsResults = await Promise.allSettled(barcodeLookups.map(async (requestedBarcode) => {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(requestedBarcode)}.json?fields=code,product_name,brands,ingredients_text,serving_size,manufacturing_places,labels_tags,quantity`
    const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'TrustStack/1.0 (product transparency cross-check)' }, signal: AbortSignal.timeout(10000) })
    if (!response.ok && response.status !== 404) throw new Error(`world.openfoodfacts.org returned ${response.status}`)
    return { requestedBarcode, payload: await response.json() }
  }))
  const openFoodFactsLookups = openFoodFactsResults.filter((result) => result.status === 'fulfilled').map((result) => result.value)
  const openFoodFactsCandidates = extractOpenFoodFactsCandidates(name, openFoodFactsLookups)
  const candidates = deduplicateResearchCandidates([
    ...(europeResult.status === 'fulfilled' ? extractResearchCandidates(name, europeResult.value) : []),
    ...pubmedResults,
    ...(trialsResult.status === 'fulfilled' ? extractClinicalTrialCandidates(name, trialsResult.value) : []),
    ...(odsResult.status === 'fulfilled' ? odsReferences : odsReference(odsName)),
    ...(pubchemResult.status === 'fulfilled' ? extractPubChemCandidates(name, pubchemResult.value) : []),
    ...(openAlexResult.status === 'fulfilled' ? extractOpenAlexCandidates(name, openAlexResult.value) : []),
    ...officialReferenceCandidates,
    ...openFoodFactsCandidates,
  ])
  const research = { checkedAt: Date.now(), candidates, readiness: assessCandidateReadiness(candidates), searchStrategy: { version: 'IEP-1.0', pubmed: pubmedSearches.map(([searchClass, term]) => ({ searchClass, term })), europePmc: `TITLE_ABS:"${safeName}"`, clinicalTrials: `"${safeName}"`, openAlex: openAlexUrl.href, openFoodFactsBarcodeCount: barcodeLookups.length }, sources: { europePmc: europeResult.status, pubmed: pubmedSearchesSucceeded ? 'fulfilled' : 'rejected', clinicalTrials: trialsResult.status, nihOds: odsResult.status, pubchem: pubchemResult.status, openAlex: openAlexResult.status, nccih: nccihIndexResult.status, opss: opssIndexResult.status, openFoodFacts: barcodeLookups.length ? openFoodFactsResults.some((result) => result.status === 'fulfilled') ? 'fulfilled' : 'rejected' : 'not_applicable', dsid: 'unavailable_403', gs1uk: 'restricted_no_public_api' } }
  researchCache.set(name, research)
  return research
}

const productFactProfiles = {
  'Caffeine Capsules': { dose: 'Dose varies by product; verify milligrams per capsule before use.', formulation: 'Single-ingredient caffeine capsule; exact release form not captured.', evidenceMatch: 'Ingredient-level evidence may not match every product dose or use case.', interactions: 'Review stimulants, cardiovascular conditions, anxiety, pregnancy and medicines with a professional.', populationWarnings: 'Not suitable for children; dose and timing require individual review.', factStatus: 'Needs product-label verification', sourceStatus: 'Ingredient-level reference only', sourceLinks: [{ label: 'US FDA: caffeine', url: 'https://www.fda.gov/food/food-additives-petitions/caffeine' }] },
  '5-HTP': { dose: 'Dose varies by product; verify milligrams per capsule before use.', formulation: '5-HTP capsule; source and formulation details not captured.', evidenceMatch: 'Evidence is outcome- and dose-dependent; product-specific applicability is unresolved.', interactions: 'Potential interaction review is essential, especially with serotonergic medicines.', populationWarnings: 'Pregnancy, bipolar disorder and other conditions require professional review.', factStatus: 'Needs product-label verification', sourceStatus: 'Ingredient-level reference only', sourceLinks: [{ label: 'NCCIH: 5-HTP', url: 'https://www.nccih.nih.gov/health/5-htp' }] },
  Yohimbine: { dose: 'Dose and active yohimbine content must be verified from the product label.', formulation: 'Botanical or isolated yohimbine formulation not verified.', evidenceMatch: 'Do not infer product benefit from ingredient-level evidence without dose and formulation confirmation.', interactions: 'High-priority interaction review for cardiovascular, blood-pressure, psychiatric and stimulant medicines.', populationWarnings: 'Avoid self-directed use in pregnancy, cardiovascular disease, hypertension or anxiety without specialist advice.', factStatus: 'High-risk product; specialist review required', sourceStatus: 'Ingredient-level reference only', sourceLinks: [{ label: 'NCCIH: Yohimbe', url: 'https://www.nccih.nih.gov/health/yohimbe' }] },
  'Curcumin with Piperine': { dose: 'Verify curcuminoid amount and piperine amount per serving.', formulation: 'Curcumin plus piperine; extract standardisation and bioavailability form not captured.', evidenceMatch: 'Evidence depends on extract, curcuminoid content, dose and outcome.', interactions: 'Review anticoagulants, antiplatelets, gallbladder conditions and medicines before use.', populationWarnings: 'Pregnancy, surgery and gallbladder or bleeding concerns require professional review.', factStatus: 'Needs product-label verification', sourceStatus: 'Ingredient-level reference only', sourceLinks: [{ label: 'NCCIH: turmeric', url: 'https://www.nccih.nih.gov/health/turmeric' }] },
  'Vitamin K2': { dose: 'Verify micrograms per serving and whether the product contains MK-7 or another form.', formulation: 'Vitamin K2 form and stability details not captured.', evidenceMatch: 'Applicability depends on K2 form, dose and intended outcome.', interactions: 'Anticoagulant interaction review is essential.', populationWarnings: 'People using anticoagulants should seek professional advice before changing intake.', factStatus: 'Needs product-label verification', sourceStatus: 'Ingredient-level reference only', sourceLinks: [{ label: 'NIH ODS: vitamin K', url: 'https://ods.od.nih.gov/factsheets/VitaminK-HealthProfessional/' }] },
  'Psyllium Husk': { dose: 'Verify grams of psyllium per serving and required fluid instructions.', formulation: 'Psyllium husk; purity, particle size and serving format not captured.', evidenceMatch: 'Evidence is dependent on adequate fibre dose and consistent use.', interactions: 'Separate from some medicines and take with sufficient fluid; confirm timing with a professional.', populationWarnings: 'Swallowing difficulty or bowel obstruction concerns require professional review.', factStatus: 'Needs product-label verification' },
  'Electrolyte Powder': { dose: 'Verify sodium, potassium, carbohydrate and total electrolyte amounts per serving.', formulation: 'Blend composition and sugar content vary by product and are not yet captured.', evidenceMatch: 'Use case depends on sweat loss, exercise duration, climate and individual needs.', interactions: 'Review kidney, heart and blood-pressure conditions before high-electrolyte use.', populationWarnings: 'Medical conditions affecting fluid or electrolyte balance require professional advice.', factStatus: 'Needs product-label verification' },
  'CoQ10 Ubiquinol': { dose: 'Verify ubiquinol milligrams per serving and whether the product is oil-based.', formulation: 'Ubiquinol form stated in catalogue name; purity and delivery system not captured.', evidenceMatch: 'Evidence depends on formulation, dose and intended outcome.', interactions: 'Review anticoagulants, blood-pressure and diabetes medicines with a professional.', populationWarnings: 'Pregnancy, breastfeeding and chronic conditions require suitability review.', factStatus: 'Needs product-label verification' },
}

const ageProfiles = {
  "Children's Multi Gummies": ['Children', 'High', 'General micronutrient support', 'Use only age-specific formulations and doses.'],
  'Electrolyte Powder': ['Teens and adults', 'High', 'Hydration during prolonged exercise or heavy sweating', 'Review sodium, potassium and medical conditions affecting fluid balance.'],
  'Caffeine Capsules': ['Adults', 'High', 'Alertness and exercise performance', 'Not for children; review pregnancy, anxiety, cardiovascular conditions and stimulant use.'],
  'Plant Protein Blend': ['Teens and adults', 'High', 'Protein intake and muscle growth', 'Confirm serving size, allergens and suitability for younger users.'],
  'Psyllium Husk': ['Adults and older adults', 'High', 'Fibre and digestive support', 'Use adequate fluid and review swallowing or bowel concerns.'],
  'Vitamin K2': ['Adults and older adults', 'Medium', 'Vitamin K intake', 'Anticoagulant interaction review is essential.'],
  'CoQ10 Ubiquinol': ['Adults and older adults', 'Medium', 'CoQ10 support', 'Review medicines and chronic conditions before use.'],
  '5-HTP': ['Adults', 'High', 'Selected mood or sleep-related goals', 'Requires medicine and mental-health suitability review.'],
  Yohimbine: ['Adults', 'High', 'No general recommendation; specialist review only', 'Avoid self-directed use with cardiovascular, blood-pressure or anxiety concerns.'],
}

function deriveProductConfidence(productId) {
  const evidence = database.prepare("SELECT COUNT(*) AS count FROM normalized_records WHERE product_id = ? AND record_type = 'evidence'").get(productId).count
  const safety = database.prepare("SELECT COUNT(*) AS count FROM normalized_records WHERE product_id = ? AND record_type = 'safety'").get(productId).count
  const verifiedProductSource = database.prepare("SELECT COUNT(*) AS count FROM product_sources WHERE product_id = ? AND status = 'Verified' AND source_type IN ('Product label', 'Batch certificate')").get(productId).count
  if (verifiedProductSource > 0 && evidence > 0 && safety > 0) return 'High'
  if (verifiedProductSource > 0 || evidence > 0 || safety > 0) return 'Moderate'
  return 'Low'
}

function recordConfidenceChange(productId, previousConfidence, triggerSource) {
  const newConfidence = deriveProductConfidence(productId)
  if (newConfidence === previousConfidence) return newConfidence
  const changedAt = new Date().toISOString()
  database.prepare('UPDATE products SET confidence = ?, updated_at = ? WHERE id = ?').run(newConfidence, changedAt, productId)
  database.prepare('INSERT INTO confidence_changes (product_id, previous_confidence, new_confidence, trigger_source, changed_at) VALUES (?, ?, ?, ?, ?)').run(productId, previousConfidence, newConfidence, triggerSource, changedAt)
  return newConfidence
}

function recordAudit(action, entityType, entityId, actor, details = {}) {
  database.prepare('INSERT INTO audit_log (action, entity_type, entity_id, actor, details, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(action, entityType, String(entityId), actor || 'local reviewer', JSON.stringify(details), new Date().toISOString())
}

function findSourceMatch(payload, products) {
  const text = JSON.stringify(payload).toLowerCase()
  const exact = products.find((product) => text.includes(product.name.toLowerCase()))
  if (exact) return { product: exact, type: 'Exact product match', score: 100 }
  const candidates = products.map((product) => {
    const tokens = product.name.toLowerCase().split(/\s+/).filter((token) => token.length > 3)
    const matches = tokens.filter((token) => text.includes(token)).length
    return { product, score: tokens.length ? Math.round((matches / tokens.length) * 100) : 0 }
  }).filter((candidate) => candidate.score >= 50).sort((left, right) => right.score - left.score)
  if (!candidates.length) return null
  const candidate = candidates[0]
  return { product: candidate.product, type: candidate.score >= 75 ? 'Strong match' : 'Possible match', score: candidate.score }
}

const seedProducts = [
  {
    name: 'Creatine Monohydrate', brand: 'Example Performance', type: 'Performance', category: 'Sports Performance', score: 91, evidence: 95, safety: 92, quality: 90, transparency: 84, regulatory: 88, contamination: 12, value: 92, status: 'Recommended', confidence: 'High', bestFor: 'Strength, power and repeated high-intensity performance', region: 'Global', prices: [['Bulk', 19.99, 100], ['MyProtein', 22.49, 100], ['Amazon UK', 24.95, 100], ['Holland & Barrett', 27.99, 100]], recommendation: 'Strong evidence and a transparent, simple formulation make this the clearest product in the current catalogue.'
  },
  {
    name: 'Vitamin D3', brand: 'Example Health', type: 'Vitamin', category: 'Vitamins', score: 84, evidence: 87, safety: 86, quality: 81, transparency: 78, regulatory: 82, contamination: 18, value: 95, status: 'Recommended when appropriate', confidence: 'High', bestFor: 'Supporting vitamin D intake where appropriate', region: 'Global', prices: [['Boots', 5.49, 90], ['Amazon UK', 6.99, 120], ['Holland & Barrett', 7.49, 100], ['iHerb', 8.25, 120]], recommendation: 'Best value in the current catalogue, subject to confirming personal need and dose.'
  },
  {
    name: 'Ashwagandha', brand: 'Example Botanicals', type: 'Botanical', category: 'Botanicals', score: 63, evidence: 62, safety: 58, quality: 70, transparency: 72, regulatory: 50, contamination: 42, value: 72, status: 'Consider with caution', confidence: 'Moderate', bestFor: 'Selected stress-related outcomes after suitability review', region: 'Global', prices: [['iHerb', 14.5, 60], ['Amazon UK', 16.99, 60], ['Holland & Barrett', 19.99, 60], ['Boots', 21.5, 60]], recommendation: 'Evidence and safety are mixed. Review extract standardisation, medicines and personal suitability.'
  },
  {
    name: 'Pre-Workout Blend', brand: 'Example Labs', type: 'Blend', category: 'Sports Performance', score: 38, evidence: 42, safety: 34, quality: 38, transparency: 22, regulatory: 48, contamination: 68, value: 35, status: 'Not recommended', confidence: 'Low', bestFor: 'No recommendation until formulation and testing are verified', region: 'Global', prices: [['MyProtein', 21.99, 30], ['Bulk', 23.49, 30], ['Amazon UK', 27.99, 30], ['Specialist retailer', 31.5, 30]], recommendation: 'Avoid until every active ingredient, dose and batch-level testing record is available.'
  }
]

const marketInterestProducts = [
  ['Daily Multivitamin', 'Example Health', 'Vitamin', 'Vitamins', 58, 55, 52, 'General micronutrient support after diet and need review'],
  ['Vitamin C', 'Example Health', 'Vitamin', 'Vitamins', 58, 60, 58, 'Vitamin C intake support where appropriate'],
  ['Magnesium Complex', 'Example Minerals', 'Vitamin', 'Vitamins', 61, 62, 58, 'Magnesium intake and selected muscle or sleep-related goals'],
  ['Omega-3 Fish Oil', 'Example Nutrition', 'Vitamin', 'Vitamins', 64, 70, 62, 'Omega-3 intake and cardiovascular nutrition support'],
  ['Probiotic Complex', 'Example Gut Health', 'Blend', 'Digestive Health', 54, 55, 50, 'Selected digestive-health goals after strain and dose review'],
  ['Whey Protein', 'Example Performance', 'Performance', 'Sports Performance', 68, 65, 64, 'Protein intake and muscle-growth support'],
  ['Collagen Peptides', 'Example Recovery', 'Performance', 'Sports Performance', 57, 52, 58, 'Selected joint, connective-tissue or protein-intake goals'],
  ['Calcium', 'Example Minerals', 'Vitamin', 'Vitamins', 55, 50, 55, 'Calcium intake support where dietary intake is insufficient'],
  ['Iron', 'Example Health', 'Vitamin', 'Vitamins', 48, 48, 42, 'Iron support only after need or deficiency is confirmed'],
  ['Zinc', 'Example Minerals', 'Vitamin', 'Vitamins', 57, 58, 55, 'Zinc intake support where appropriate'],
  ['Vitamin B12', 'Example Health', 'Vitamin', 'Vitamins', 62, 65, 60, 'B12 intake support for selected dietary or clinical needs'],
  ['Curcumin', 'Example Botanicals', 'Botanical', 'Botanicals', 52, 50, 48, 'Selected inflammation or joint-health goals after interaction review'],
  ['Melatonin', 'Example Sleep', 'Vitamin', 'Sleep', 50, 48, 45, 'Short-term sleep-timing support with suitability review'],
  ['Electrolyte Powder', 'Example Hydration', 'Blend', 'Sports Performance', 62, 72, 68, 'Hydration support during prolonged or heavy sweating'],
  ['Caffeine Capsules', 'Example Performance', 'Performance', 'Sports Performance', 70, 42, 76, 'Alertness and exercise performance with dose review'],
  ['Plant Protein Blend', 'Example Performance', 'Performance', 'Sports Performance', 64, 70, 72, 'Protein intake and muscle-growth support'],
  ['Psyllium Husk', 'Example Gut Health', 'Botanical', 'Botanicals', 72, 78, 80, 'Fibre intake and digestive-health support'],
  ['Vitamin K2', 'Example Health', 'Vitamin', 'Vitamins', 58, 55, 60, 'Vitamin K intake with medicine interaction review'],
  ['Curcumin with Piperine', 'Example Botanicals', 'Botanical', 'Botanicals', 62, 48, 58, 'Selected joint-health outcomes after interaction review'],
  ['CoQ10 Ubiquinol', 'Example Nutrition', 'Vitamin', 'Vitamins', 68, 65, 64, 'CoQ10 support with formulation comparison'],
  ['Beetroot Nitrate', 'Example Performance', 'Performance', 'Sports Performance', 66, 62, 65, 'Exercise-performance support with nitrate-dose review'],
  ['5-HTP', 'Example Mood', 'Botanical', 'Botanicals', 48, 30, 44, 'No recommendation without medicine and suitability review'],
  ['Yohimbine', 'Example Performance', 'Botanical', 'Sports Performance', 35, 18, 32, 'Avoid unless specialist review confirms suitability'],
]

const marketPriceData = [
  ['Daily Multivitamin', [['Boots', 3.99, 30], ['Holland & Barrett', 4.99, 60]]],
  ['Vitamin C', [['Boots', 4.99, 60], ['Holland & Barrett', 6.99, 180]]],
  ['Magnesium Complex', [['Boots', 7.99, 30], ['Holland & Barrett', 9.99, 60]]],
  ['Omega-3 Fish Oil', [['Boots', 4.99, 30], ['Holland & Barrett', 9.99, 60]]],
  ['Probiotic Complex', [['Boots', 12.99, 30], ['Holland & Barrett', 9.99, 30]]],
  ['Whey Protein', [['MyProtein', 29.99, 33], ['Bulk', 29.99, 33]]],
  ['Collagen Peptides', [['Bulk', 19.99, 25], ['Holland & Barrett', 24.99, 30]]],
  ['Calcium', [['Boots', 3.99, 30], ['Holland & Barrett', 5.99, 60]]],
  ['Iron', [['Boots', 3.99, 30], ['Holland & Barrett', 5.99, 90]]],
  ['Zinc', [['Boots', 4.99, 90], ['Holland & Barrett', 5.99, 100]]],
  ['Vitamin B12', [['Boots', 4.99, 60], ['Holland & Barrett', 7.99, 180]]],
  ['Curcumin', [['Holland & Barrett', 12.99, 30], ['iHerb', 17.99, 60]]],
  ['Melatonin', [['iHerb', 9.99, 60], ['Amazon UK', 12.99, 90]]],
  ['C-Ester Ascorbyl Palmitate 500 mg', [['iHerb', 15.99, 100], ['Amazon UK', 21.99, 180]]],
  ['Celery Seed 600 mg', [['iHerb', 14.99, 100], ['Amazon UK', 19.99, 100]]],
  ["Children's Multi Gummies", [['Boots', 7.99, 60], ['Holland & Barrett', 9.99, 60]]],
  ['Maximum Strength Triple Omega 3-6-9', [['Holland & Barrett', 12.99, 100], ['Amazon UK', 17.99, 120]]],
  ['Mega Vita-Gel', [['iHerb', 9.99, 30], ['Amazon UK', 14.99, 30]]],
  ['Q-Sorb Co Q-10 200 mg', [['iHerb', 19.99, 30], ['Amazon UK', 24.99, 60]]],
  ['Super Snooze With Melatonin', [['iHerb', 12.99, 30], ['Amazon UK', 16.99, 60]]],
  ['Electrolyte Powder', [['MyProtein', 14.99, 20], ['Bulk', 16.99, 20], ['Amazon UK', 18.99, 30], ['Holland & Barrett', 12.99, 20], ['iHerb', 21.99, 30]]],
  ['Caffeine Capsules', [['MyProtein', 5.99, 100], ['Bulk', 6.99, 100], ['Amazon UK', 8.99, 200], ['Holland & Barrett', 7.99, 100], ['iHerb', 11.99, 100]]],
  ['Plant Protein Blend', [['MyProtein', 27.99, 33], ['Bulk', 29.99, 33], ['Amazon UK', 32.99, 30], ['Holland & Barrett', 34.99, 30], ['iHerb', 39.99, 40]]],
  ['Psyllium Husk', [['Boots', 8.99, 30], ['Holland & Barrett', 10.99, 30], ['Amazon UK', 12.99, 50], ['iHerb', 14.99, 100], ['Superdrug', 6.99, 30]]],
  ['Vitamin K2', [['Boots', 7.99, 30], ['Holland & Barrett', 9.99, 60], ['Amazon UK', 11.99, 60], ['iHerb', 13.99, 100], ['Superdrug', 6.99, 30]]],
  ['Curcumin with Piperine', [['Holland & Barrett', 14.99, 30], ['iHerb', 16.99, 60], ['Amazon UK', 18.99, 60], ['Boots', 12.99, 30], ['Natures Aid', 13.99, 30]]],
  ['CoQ10 Ubiquinol', [['Holland & Barrett', 19.99, 30], ['iHerb', 24.99, 60], ['Amazon UK', 21.99, 60], ['Boots', 17.99, 30], ['Vitamin Shoppe', 29.99, 60]]],
  ['Beetroot Nitrate', [['MyProtein', 19.99, 20], ['Bulk', 21.99, 20], ['Amazon UK', 24.99, 30], ['iHerb', 27.99, 30], ['Specialist retailer', 29.99, 20]]],
  ['5-HTP', [['Holland & Barrett', 12.99, 60], ['iHerb', 14.99, 60], ['Amazon UK', 16.99, 100], ['Boots', 10.99, 30], ['Natures Aid', 13.99, 60]]],
  ['Yohimbine', [['iHerb', 19.99, 60], ['Amazon UK', 21.99, 60], ['Specialist retailer', 24.99, 90], ['Vitamin Shoppe', 27.99, 60], ['Holland & Barrett', 22.99, 60]]],
]

const additionalSupplierPriceData = [
  ['Creatine Monohydrate', [['Optimum Nutrition', 29.99, 100]]],
  ['Vitamin D3', [['Boots', 5.99, 180], ['Superdrug', 4.99, 90]]],
  ['Ashwagandha', [['Holland & Barrett', 18.99, 60], ['Natures Aid', 16.99, 60], ['Optimum Nutrition', 19.99, 60]]],
  ['Pre-Workout Blend', [['Optimum Nutrition', 29.99, 30], ['Holland & Barrett', 26.99, 30], ['iHerb', 24.99, 30]]],
  ['Daily Multivitamin', [['Amazon UK', 5.99, 60], ['iHerb', 8.99, 100], ['Superdrug', 3.49, 30]]],
  ['Vitamin C', [['Amazon UK', 7.99, 180], ['iHerb', 9.99, 100], ['Superdrug', 3.99, 30]]],
  ['Magnesium Complex', [['Amazon UK', 11.99, 180], ['iHerb', 13.99, 120], ['Superdrug', 6.99, 30]]],
  ['Omega-3 Fish Oil', [['Amazon UK', 12.99, 180], ['iHerb', 15.99, 200], ['Superdrug', 5.99, 30]]],
  ['Probiotic Complex', [['Amazon UK', 14.99, 30], ['iHerb', 18.99, 60], ['Superdrug', 9.99, 30]]],
  ['Whey Protein', [['Amazon UK', 34.99, 33], ['iHerb', 39.99, 40], ['Optimum Nutrition', 44.99, 30]]],
  ['Collagen Peptides', [['Amazon UK', 22.99, 30], ['iHerb', 26.99, 30], ['Boots', 19.99, 20]]],
  ['Calcium', [['Amazon UK', 6.99, 100], ['iHerb', 8.99, 120], ['Superdrug', 3.49, 30]]],
  ['Iron', [['Amazon UK', 7.99, 100], ['iHerb', 9.99, 100], ['Superdrug', 3.99, 30]]],
  ['Zinc', [['Amazon UK', 6.99, 100], ['iHerb', 8.99, 100], ['Superdrug', 3.99, 30]]],
  ['Vitamin B12', [['Amazon UK', 8.99, 180], ['iHerb', 10.99, 100], ['Superdrug', 4.49, 30]]],
  ['Curcumin', [['Amazon UK', 15.99, 60], ['Boots', 14.99, 30], ['Natures Aid', 13.99, 30]]],
  ['Melatonin', [['Boots', 9.99, 30], ['Holland & Barrett', 11.99, 60], ['iHerb', 10.99, 90], ['Natures Aid', 13.99, 60]]],
  ['C-Ester Ascorbyl Palmitate 500 mg', [['Holland & Barrett', 18.99, 100], ['Vitamin Shoppe', 19.99, 100], ['Boots', 16.99, 60]]],
  ['Celery Seed 600 mg', [['Holland & Barrett', 17.99, 100], ['Vitamin Shoppe', 18.99, 100], ['Boots', 13.99, 60]]],
  ["Children's Multi Gummies", [['Amazon UK', 8.99, 60], ['iHerb', 11.99, 60], ['Superdrug', 6.49, 60]]],
  ['Maximum Strength Triple Omega 3-6-9', [['iHerb', 19.99, 180], ['Boots', 15.99, 60], ['Superdrug', 9.99, 60]]],
  ['Mega Vita-Gel', [['Holland & Barrett', 12.99, 30], ['Vitamin Shoppe', 13.99, 30], ['Boots', 10.99, 30]]],
  ['Q-Sorb Co Q-10 200 mg', [['Holland & Barrett', 24.99, 30], ['Vitamin Shoppe', 27.99, 60], ['Boots', 21.99, 30]]],
  ['Super Snooze With Melatonin', [['Holland & Barrett', 14.99, 60], ['Boots', 11.99, 30], ['Superdrug', 8.99, 30]]],
]

database.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    brand TEXT NOT NULL,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    region TEXT NOT NULL,
    score INTEGER NOT NULL,
    evidence INTEGER NOT NULL,
    safety INTEGER NOT NULL,
    quality INTEGER NOT NULL,
    transparency INTEGER NOT NULL,
    regulatory INTEGER NOT NULL,
    contamination INTEGER NOT NULL,
    value INTEGER NOT NULL,
    status TEXT NOT NULL,
    confidence TEXT NOT NULL,
    best_for TEXT NOT NULL,
    recommendation TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    catalogue_source TEXT NOT NULL DEFAULT 'prototype',
    age_groups TEXT NOT NULL DEFAULT 'Adults',
    primary_age_group TEXT NOT NULL DEFAULT 'Adults',
    common_use_cases TEXT NOT NULL DEFAULT '',
    age_cautions TEXT NOT NULL DEFAULT '',
    market_interest TEXT NOT NULL DEFAULT 'Medium',
    market_interest_source TEXT NOT NULL DEFAULT 'Catalogue planning estimate',
    market_interest_updated_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    supplier TEXT NOT NULL,
    price REAL NOT NULL,
    servings INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS product_categories (
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    PRIMARY KEY (product_id, category)
  );
  CREATE TABLE IF NOT EXISTS catalogue_product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    dsld_id INTEGER NOT NULL UNIQUE,
    brand TEXT NOT NULL,
    name TEXT NOT NULL,
    upc TEXT,
    label_version TEXT,
    serving TEXT NOT NULL,
    ingredient_count INTEGER NOT NULL,
    label_entry_date TEXT,
    label_url TEXT NOT NULL,
    identity_status TEXT NOT NULL,
    quality_status TEXT NOT NULL DEFAULT 'Not verified',
    region TEXT NOT NULL DEFAULT 'US',
    added_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ingredient_assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_name TEXT NOT NULL,
    outcome TEXT NOT NULL,
    region TEXT NOT NULL,
    dimensions TEXT NOT NULL,
    citations TEXT NOT NULL,
    reviewer TEXT NOT NULL,
    reviewed_at TEXT NOT NULL,
    context TEXT NOT NULL DEFAULT '{}',
    evidence_profile TEXT NOT NULL DEFAULT '{}',
    limitations TEXT NOT NULL DEFAULT '',
    methodology_version TEXT NOT NULL DEFAULT 'ITR-1.0',
    next_review_at TEXT,
    UNIQUE(ingredient_name, outcome, region)
  );
  CREATE TABLE IF NOT EXISTS ingredient_evidence_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_name TEXT NOT NULL,
    outcome TEXT NOT NULL,
    region TEXT NOT NULL,
    profile TEXT NOT NULL,
    reviewed_at TEXT NOT NULL,
    UNIQUE(ingredient_name, outcome, region)
  );
  CREATE TABLE IF NOT EXISTS ingredient_candidate_snapshots (
    ingredient_name TEXT PRIMARY KEY,
    candidates TEXT NOT NULL,
    sources TEXT NOT NULL,
    checked_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS seller_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_name TEXT NOT NULL UNIQUE,
    website_url TEXT NOT NULL DEFAULT '',
    trust_score INTEGER NOT NULL DEFAULT 0,
    authenticity_history INTEGER NOT NULL DEFAULT 0,
    returns_score INTEGER NOT NULL DEFAULT 0,
    documentation_score INTEGER NOT NULL DEFAULT 0,
    response_time_score INTEGER NOT NULL DEFAULT 0,
    identity_status TEXT NOT NULL DEFAULT 'Not verified',
    manufacturer_relationship TEXT NOT NULL DEFAULT 'Not confirmed',
    last_reviewed TEXT NOT NULL,
    evidence_note TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS ingestion_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    records_seen INTEGER NOT NULL DEFAULT 0,
    message TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS ingestion_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    record_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    UNIQUE(source, external_id)
  );
  CREATE TABLE IF NOT EXISTS normalized_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingestion_record_id INTEGER NOT NULL UNIQUE REFERENCES ingestion_records(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    record_type TEXT NOT NULL,
    product_id INTEGER REFERENCES products(id),
    external_id TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    evidence_level INTEGER,
    safety_signal INTEGER,
    source_role TEXT NOT NULL DEFAULT 'unknown',
    source_quality INTEGER NOT NULL DEFAULT 0,
    independence_score INTEGER NOT NULL DEFAULT 0,
    relevance_score INTEGER NOT NULL DEFAULT 0,
    bias_flags TEXT NOT NULL DEFAULT '',
    payload TEXT NOT NULL,
    normalized_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS product_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    url TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT 'Global',
    status TEXT NOT NULL DEFAULT 'Pending review',
    reviewer TEXT NOT NULL DEFAULT '',
    verified_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS product_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    batch_number TEXT NOT NULL,
    manufacturer TEXT NOT NULL DEFAULT '',
    manufacture_date TEXT,
    expiry_date TEXT,
    laboratory TEXT NOT NULL DEFAULT '',
    certificate_url TEXT NOT NULL DEFAULT '',
    test_method TEXT NOT NULL DEFAULT '',
    results TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Pending review',
    reviewer TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(product_id, batch_number)
  );
  CREATE TABLE IF NOT EXISTS confidence_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    previous_confidence TEXT NOT NULL,
    new_confidence TEXT NOT NULL,
    trigger_source TEXT NOT NULL,
    changed_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS source_match_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingestion_record_id INTEGER NOT NULL REFERENCES ingestion_records(id) ON DELETE CASCADE,
    candidate_product_id INTEGER REFERENCES products(id),
    match_type TEXT NOT NULL,
    match_score INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending review',
    reviewer TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS monitoring_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    outcome TEXT NOT NULL,
    start_date TEXT NOT NULL,
    review_date TEXT NOT NULL,
    baseline_value REAL,
    metric TEXT NOT NULL,
    confounders TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS monitoring_observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL REFERENCES monitoring_plans(id) ON DELETE CASCADE,
    observed_at TEXT NOT NULL,
    value REAL,
    adherence REAL,
    notes TEXT NOT NULL DEFAULT '',
    interpretation TEXT NOT NULL DEFAULT 'Inconclusive'
  );
  CREATE TABLE IF NOT EXISTS score_recalculations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    previous_score INTEGER NOT NULL,
    new_score INTEGER NOT NULL,
    basis TEXT NOT NULL,
    calculated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    actor TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
`)

for (const migration of [
  "ALTER TABLE ingredient_assessments ADD COLUMN context TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE ingredient_assessments ADD COLUMN evidence_profile TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE ingredient_assessments ADD COLUMN limitations TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE ingredient_assessments ADD COLUMN methodology_version TEXT NOT NULL DEFAULT 'ITR-1.0'",
  "ALTER TABLE ingredient_assessments ADD COLUMN next_review_at TEXT",
  "ALTER TABLE seller_profiles ADD COLUMN website_url TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE products ADD COLUMN catalogue_source TEXT NOT NULL DEFAULT 'prototype'",
  "ALTER TABLE normalized_records ADD COLUMN source_role TEXT NOT NULL DEFAULT 'unknown'",
  "ALTER TABLE normalized_records ADD COLUMN source_quality INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE normalized_records ADD COLUMN independence_score INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE normalized_records ADD COLUMN relevance_score INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE normalized_records ADD COLUMN bias_flags TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE products ADD COLUMN age_groups TEXT NOT NULL DEFAULT 'Adults'",
  "ALTER TABLE products ADD COLUMN primary_age_group TEXT NOT NULL DEFAULT 'Adults'",
  "ALTER TABLE products ADD COLUMN common_use_cases TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE products ADD COLUMN age_cautions TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE products ADD COLUMN market_interest TEXT NOT NULL DEFAULT 'Medium'",
  "ALTER TABLE products ADD COLUMN market_interest_source TEXT NOT NULL DEFAULT 'Catalogue planning estimate'",
  "ALTER TABLE products ADD COLUMN market_interest_updated_at TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE source_match_reviews ADD COLUMN reviewer TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE source_match_reviews ADD COLUMN reviewed_at TEXT",
  'ALTER TABLE ingestion_runs ADD COLUMN records_seen INTEGER NOT NULL DEFAULT 0',
  "ALTER TABLE ingestion_runs ADD COLUMN message TEXT NOT NULL DEFAULT ''",
]) {
  try { database.exec(migration) } catch (error) {
    if (!error.message.includes('duplicate column name')) throw error
  }
}

function ingredientAssessmentFromRow(row) {
  if (!row) return { ...assessIngredient(), evidenceProfile: validateEvidenceProfile() }
  const context = JSON.parse(row.context || '{}')
  return assessIngredient({ outcome: row.outcome, region: row.region, dimensions: JSON.parse(row.dimensions), citations: JSON.parse(row.citations), evidenceProfile: validateEvidenceProfile(JSON.parse(row.evidence_profile || '{}')), limitations: row.limitations, reviewer: row.reviewer, reviewedAt: row.reviewed_at, nextReviewAt: row.next_review_at, methodologyVersion: row.methodology_version, ...context })
}

function evidenceProfileForIngredient(name) {
  const row = database.prepare('SELECT profile FROM ingredient_evidence_profiles WHERE ingredient_name = ? ORDER BY reviewed_at DESC LIMIT 1').get(name)
  return row ? JSON.parse(row.profile) : validateEvidenceProfile()
}

database.exec(`
  UPDATE normalized_records SET source_role = CASE source
    WHEN 'dsld' THEN 'label/quality context'
    WHEN 'europepmc' THEN 'clinical evidence'
    WHEN 'openfda' THEN 'safety signal'
    WHEN 'uk-fsa' THEN 'regulatory alert'
    WHEN 'health-canada' THEN 'regulatory licence'
    WHEN 'efsa-openfoodtox' THEN 'hazard assessment'
    WHEN 'informed-sport' THEN 'athlete certification'
    ELSE 'unknown' END,
    source_quality = CASE source WHEN 'europepmc' THEN 80 WHEN 'openfda' THEN 80 WHEN 'efsa-openfoodtox' THEN 85 WHEN 'uk-fsa' THEN 85 WHEN 'health-canada' THEN 85 WHEN 'dsld' THEN 70 WHEN 'informed-sport' THEN 75 ELSE 0 END,
    independence_score = CASE source WHEN 'europepmc' THEN 80 WHEN 'openfda' THEN 75 WHEN 'efsa-openfoodtox' THEN 85 WHEN 'uk-fsa' THEN 85 WHEN 'health-canada' THEN 85 WHEN 'dsld' THEN 55 WHEN 'informed-sport' THEN 45 ELSE 0 END,
    relevance_score = CASE source WHEN 'europepmc' THEN 90 WHEN 'informed-sport' THEN 85 WHEN 'dsld' THEN 75 WHEN 'efsa-openfoodtox' THEN 70 WHEN 'openfda' THEN 80 WHEN 'uk-fsa' THEN 55 WHEN 'health-canada' THEN 60 ELSE 0 END,
    bias_flags = CASE source WHEN 'europepmc' THEN 'publication and study-design bias possible' WHEN 'openfda' THEN 'passive reporting undercounts and cannot establish causality' WHEN 'efsa-openfoodtox' THEN 'hazard context is not a product-level safety guarantee' WHEN 'uk-fsa' THEN 'alert data is not product efficacy evidence' WHEN 'health-canada' THEN 'licence status is not proof of efficacy' WHEN 'dsld' THEN 'label data is not efficacy evidence' WHEN 'informed-sport' THEN 'directory presence is not current batch verification' ELSE 'source role not classified' END
`)

const productCount = database.prepare('SELECT COUNT(*) AS count FROM products').get().count
if (productCount === 0) {
  const insertProduct = database.prepare(`INSERT INTO products (name, brand, type, category, region, score, evidence, safety, quality, transparency, regulatory, contamination, value, status, confidence, best_for, recommendation, updated_at) VALUES (@name, @brand, @type, @category, @region, @score, @evidence, @safety, @quality, @transparency, @regulatory, @contamination, @value, @status, @confidence, @bestFor, @recommendation, @updatedAt)`)
  const insertPrice = database.prepare('INSERT INTO prices (product_id, supplier, price, servings) VALUES (?, ?, ?, ?)')
  const seed = database.transaction(() => {
    for (const product of seedProducts) {
      if (!catalogueNames.includes(product.name)) continue
      const result = insertProduct.run({ ...product, bestFor: product.bestFor, updatedAt: new Date().toISOString() })
      for (const [supplier, price, servings] of product.prices) insertPrice.run(result.lastInsertRowid, supplier, price, servings)
    }
  })
  seed()
}

const insertMarketProduct = database.prepare(`INSERT OR IGNORE INTO products (name, brand, type, category, region, score, evidence, safety, quality, transparency, regulatory, contamination, value, status, confidence, best_for, recommendation, updated_at, catalogue_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
for (const [name, brand, type, category, evidence, safety, value, bestFor] of marketInterestProducts) {
  if (!catalogueNames.includes(name)) continue
  insertMarketProduct.run(name, brand, type, category, Math.round((evidence + safety + 55 + 50 + 50 + 50 + value) / 7), evidence, safety, 55, 50, 50, 50, 50, value, safety >= 60 ? 'Consider with conditions' : 'Review required', 'Moderate', bestFor, 'Market-interest category added for comparison. Confirm product-specific evidence, dose, interactions and batch quality before use.', new Date().toISOString(), 'market-interest-seed')
}

const insertMarketPrice = database.prepare('INSERT INTO prices (product_id, supplier, price, servings) SELECT id, ?, ?, ? FROM products WHERE name = ? AND NOT EXISTS (SELECT 1 FROM prices WHERE product_id = products.id AND supplier = ?) AND (SELECT COUNT(*) FROM prices WHERE product_id = products.id) < 5')
for (const [productName, prices] of marketPriceData) {
  for (const [supplier, price, servings] of prices) insertMarketPrice.run(supplier, price, servings, productName, supplier)
}

for (const [productName, prices] of additionalSupplierPriceData) {
  for (const [supplier, price, servings] of prices) insertMarketPrice.run(supplier, price, servings, productName, supplier)
}

const syncCatalogue = database.transaction(() => {
  const existing = database.prepare('SELECT id, name FROM products').all()
  const allowed = new Set(catalogueNames)
  const remove = existing.filter((product) => !allowed.has(product.name))
  const deleteRelated = ['product_categories', 'prices', 'product_sources', 'product_batches', 'confidence_changes', 'monitoring_observations', 'monitoring_plans', 'score_recalculations']
  for (const product of remove) {
    database.prepare('UPDATE normalized_records SET product_id = NULL WHERE product_id = ?').run(product.id)
    database.prepare('UPDATE source_match_reviews SET candidate_product_id = NULL WHERE candidate_product_id = ?').run(product.id)
    for (const table of deleteRelated) {
      if (table === 'monitoring_observations') database.prepare('DELETE FROM monitoring_observations WHERE plan_id IN (SELECT id FROM monitoring_plans WHERE product_id = ?)').run(product.id)
      else database.prepare(`DELETE FROM ${table} WHERE product_id = ?`).run(product.id)
    }
    database.prepare('DELETE FROM products WHERE id = ?').run(product.id)
  }
  const add = database.prepare(`INSERT OR IGNORE INTO products (name, brand, type, category, region, score, evidence, safety, quality, transparency, regulatory, contamination, value, status, confidence, best_for, recommendation, updated_at, catalogue_source) VALUES (?, ?, ?, ?, 'Global', 0, 0, 0, 0, 0, 0, 0, 0, 'Not assessed', 'Low', ?, 'No product-specific assessment or price is available. Verify formulation, dose, safety and batch before use.', ?, 'requested-catalogue')`)
  for (const name of catalogueNames) {
    if (!existing.some((product) => product.name === name)) {
      const category = categoriesFor(name)[0]
      const type = category === 'Sports Performance' ? 'Performance' : category === 'Botanical Supplements' ? 'Botanical' : category === 'Vitamins & Minerals' ? 'Vitamin' : 'Supplement'
      add.run(name, 'Product not specified', type, category, `Unassessed ${category.toLowerCase()} product`, new Date().toISOString())
    }
  }
  database.prepare('DELETE FROM product_categories').run()
  const assign = database.prepare('INSERT INTO product_categories (product_id, category) VALUES (?, ?)')
  const updateCategory = database.prepare('UPDATE products SET category = ? WHERE id = ?')
  for (const product of database.prepare('SELECT id, name FROM products').all()) {
    const categories = categoriesFor(product.name)
    updateCategory.run(categories[0], product.id)
    for (const category of categories) assign.run(product.id, category)
  }
})
syncCatalogue()

const sellerProfileDefaults = {
  Bulk: [92, 5, 5, 4, 4, 'Identity reviewed', 'Not confirmed'],
  MyProtein: [90, 5, 4, 4, 4, 'Identity reviewed', 'Not confirmed'],
  'Amazon UK': [82, 3, 4, 3, 4, 'Marketplace seller status varies', 'Not confirmed'],
  'Holland & Barrett': [91, 5, 5, 4, 4, 'Identity reviewed', 'Not confirmed'],
  Boots: [93, 5, 5, 4, 4, 'Identity reviewed', 'Not confirmed'],
  Superdrug: [89, 5, 4, 4, 4, 'Identity reviewed', 'Not confirmed'],
  iHerb: [86, 4, 4, 4, 4, 'Identity reviewed', 'Not confirmed'],
}
const sellerWebsites = {
  'Amazon UK': 'https://www.amazon.co.uk/',
  Boots: 'https://www.boots.com/',
  Bulk: 'https://www.bulk.com/uk/',
  'Holland & Barrett': 'https://www.hollandandbarrett.com/',
  MyProtein: 'https://www.myprotein.com/',
  'Natures Aid': 'https://www.naturesaid.co.uk/',
  'Optimum Nutrition': 'https://www.optimumnutrition.com/',
  Superdrug: 'https://www.superdrug.com/',
  'Vitamin Shoppe': 'https://www.vitaminshoppe.com/',
  iHerb: 'https://www.iherb.com/',
}
const insertSellerProfile = database.prepare('INSERT OR IGNORE INTO seller_profiles (seller_name, trust_score, authenticity_history, returns_score, documentation_score, response_time_score, identity_status, manufacturer_relationship, last_reviewed, evidence_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
for (const { supplier } of database.prepare('SELECT DISTINCT supplier FROM prices').all()) {
  const [trustScore, authenticity, returns, documentation, responseTime, identityStatus, relationship] = sellerProfileDefaults[supplier] || [75, 3, 3, 3, 3, 'Not independently verified', 'Not confirmed']
  insertSellerProfile.run(supplier, trustScore, authenticity, returns, documentation, responseTime, identityStatus, relationship, new Date().toISOString(), 'Catalogue seller assessment. Product and batch verification remain separate questions.')
}
const updateSellerWebsite = database.prepare('UPDATE seller_profiles SET website_url = ? WHERE seller_name = ?')
for (const [seller, url] of Object.entries(sellerWebsites)) updateSellerWebsite.run(url, seller)

const adultOlderAdultProducts = new Set(['Vitamin D3', 'Calcium', 'Iron', 'Zinc', 'Vitamin B12', 'Omega-3 Fish Oil', 'Magnesium Complex', 'CoQ10 Ubiquinol', 'Vitamin K2'])
const teenAdultProducts = new Set(['Creatine Monohydrate', 'Whey Protein', 'Plant Protein Blend', 'Collagen Peptides', 'Beetroot Nitrate', 'Electrolyte Powder'])
const updateAgeProfile = database.prepare('UPDATE products SET age_groups = ?, primary_age_group = ?, common_use_cases = ?, age_cautions = ?, market_interest = ?, market_interest_source = ?, market_interest_updated_at = ? WHERE name = ?')
for (const product of database.prepare('SELECT name, best_for FROM products').all()) {
  const override = ageProfiles[product.name]
  const defaults = adultOlderAdultProducts.has(product.name)
    ? ['Adults and older adults', 'Adults', product.best_for, 'Age, medicines and health conditions should be reviewed before use.']
    : teenAdultProducts.has(product.name)
      ? ['Teens and adults', 'Adults', product.best_for, 'Confirm age-appropriate dose, formulation and individual suitability.']
      : ['Adults', 'Adults', product.best_for, 'Age-specific suitability and dose should be confirmed before use.']
  const [ageGroups, primaryAgeGroup, useCases, cautions] = override || defaults
  updateAgeProfile.run(ageGroups, primaryAgeGroup, useCases, cautions, override?.[1] || 'Medium', 'Catalogue planning estimate; not a trust signal', new Date().toISOString(), product.name)
}

database.exec(`
  DELETE FROM prices
  WHERE id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY price / servings, id) AS rank
      FROM prices
    ) ranked
    WHERE rank <= 5
  )
`)

const recalculateStoredScores = database.prepare('UPDATE products SET score = ?, updated_at = ? WHERE id = ?')
for (const product of database.prepare("SELECT id, evidence, safety, quality, transparency, regulatory, contamination, value FROM products WHERE status != 'Not assessed'").all()) {
  recalculateStoredScores.run(calculateTrustScore(product), new Date().toISOString(), product.id)
}

const app = express()
app.use(cors())
app.use(express.json())

app.get('/', (_request, response) => response.json({
  name: 'Supplement Trust Intelligence API',
  status: 'ok',
  endpoints: ['/api/health', '/api/summary', '/api/products', '/api/refresh', '/api/ingestion/run', '/api/ingestion/status'],
}))

function productFromRow(row) {
  const categories = database.prepare('SELECT category FROM product_categories WHERE product_id = ? ORDER BY category').all(row.id).map((entry) => entry.category)
  const ingredientRow = database.prepare('SELECT * FROM ingredient_assessments WHERE ingredient_name = ? ORDER BY reviewed_at DESC LIMIT 1').get(row.name)
  const ingredientAssessment = ingredientAssessmentFromRow(ingredientRow)
  const evidenceProfile = evidenceProfileForIngredient(row.name)
  const snapshot = database.prepare('SELECT candidates, sources, checked_at FROM ingredient_candidate_snapshots WHERE ingredient_name = ?').get(row.name)
  const sourceStatuses = snapshot ? JSON.parse(snapshot.sources) : {}
  const registryRecords = database.prepare("SELECT source, payload, observed_at AS observedAt FROM ingestion_records WHERE source IN ('europepmc', 'dsld', 'openfda', 'informed-sport', 'informed-sport-certified-list', 'nsf-sport', 'ods-supplied-page-analysis', 'eu-food-safety-campaign')").all()
  const suppliedReferences = suppliedPageCandidates(row.name, registryRecords)
  const candidates = deduplicateResearchCandidates([...(snapshot ? JSON.parse(snapshot.candidates) : []), ...suppliedReferences])
  const registryCandidates = extractSourceCoverage(row.name, registryRecords)
  const bestCase = bestCaseForEntry(row.name, evidenceProfile, candidates, sourceStatuses)
  const researchSourceNames = new Set(['Europe PMC', 'PubMed', 'ClinicalTrials.gov', 'OpenAlex'])
  const variants = database.prepare('SELECT * FROM catalogue_product_variants WHERE parent_id = ?').all(row.id)
  const productSources = database.prepare('SELECT source_type AS sourceType, url, status FROM product_sources WHERE product_id = ?').all(row.id)
  const batchRecords = database.prepare('SELECT * FROM product_batches WHERE product_id = ?').all(row.id)
  const labelCandidateCount = variants.length
  const batchRecordCount = batchRecords.length
  const cataloguePriceCount = database.prepare('SELECT COUNT(*) AS count FROM prices WHERE product_id = ?').get(row.id).count
  const trustProfile = buildTrustProfile({ ingredientAssessment, evidenceProfile, variants })
  const informationAssessment = scoreInformationCoverage({
    researchCandidates: candidates,
    registryMatches: registryCandidates,
    variants,
    productSources,
    batchRecords,
    sourceStatuses,
    valueStatus: trustProfile.layers.value.status,
  })
  const informationComponents = Object.fromEntries(informationAssessment.layers.filter((layer) => layer.weight > 0).map((layer) => [layer.key, {
    status: layer.score > 0 ? 'partial' : 'missing',
    weight: layer.weight,
    score: layer.score,
    layerStatus: layer.status,
  }]))
  trustProfile.completeness = {
    ...trustProfile.completeness,
    completed: Object.values(informationComponents).filter((component) => component.score > 0).length,
    required: Object.keys(informationComponents).length,
    percent: informationAssessment.coverageScore,
    components: informationComponents,
    scope: 'Information coverage is the weighted availability of ingredient evidence, product verification, safety documentation and transparency; it is not a supplement efficacy or suitability score.',
  }
  const sourceReview = {
    status: snapshot ? 'Source data mapped' : 'Not checked',
    recommendationClass: informationAssessment.recommendation,
    recommendationTone: informationAssessment.recommendationTone,
    recommendationNote: informationAssessment.recommendationNote,
    informationCoverageScore: informationAssessment.coverageScore,
    layerScores: informationAssessment.layers,
    researchLeadCount: candidates.filter((candidate) => researchSourceNames.has(candidate.source)).length,
    registryMatchCount: registryCandidates.length,
    registryMatches: [...new Map(registryCandidates.map((candidate) => [candidate.source, candidate])).values()].slice(0, 6),
    productLabelCandidates: variants.map((variant) => ({
      brand: variant.brand,
      productName: variant.name,
      source: 'NIH DSLD',
      sourceId: variant.dsld_id,
      labelUrl: variant.label_url,
      serving: variant.serving,
      declaredIngredientCount: variant.ingredient_count,
      region: variant.region,
      labelVersion: variant.label_version,
      identityStatus: variant.identity_status,
      qualityStatus: variant.quality_status,
      matchScope: 'Label candidate; catalogue association pending review',
    })),
    productLabelCandidates: variants.map((variant) => ({
      brand: variant.brand,
      productName: variant.name,
      source: 'NIH DSLD',
      sourceId: variant.dsld_id,
      labelUrl: variant.label_url,
      serving: variant.serving,
      declaredIngredientCount: variant.ingredient_count,
      region: variant.region,
      labelVersion: variant.label_version,
      identityStatus: variant.identity_status,
      qualityStatus: variant.quality_status,
      matchScope: 'Label candidate; catalogue association pending review',
    })),
    officialReferences: candidates.filter((candidate) => ['NIH ODS', 'NCCIH', 'OPSS'].includes(candidate.source) && candidate.url && (candidate.evidenceInformationAvailable || candidate.safetySectionAvailable)),
    generalReferences: registryRecords.filter((record) => record.source === 'eu-food-safety-campaign').map((record) => ({ ...JSON.parse(record.payload), observedAt: record.observedAt })),
    researchLeads: candidates.filter((candidate) => researchSourceNames.has(candidate.source) && candidate.url).slice(0, 3).map(({ source, title, url, year, journal, role }) => ({ source, title, url, year: year || null, journal: journal || null, role })),
    labelCandidateCount,
    layerInterpretations: sourceLayerInterpretations({ researchCandidates: candidates, registryMatches: registryCandidates, labelCandidateCount, batchRecordCount, cataloguePriceCount, sourceStatuses }),
    checkedAt: snapshot?.checked_at || null,
    sources: sourceStatuses,
  }
  const prices = database.prepare('SELECT prices.supplier, prices.price, prices.servings, seller_profiles.website_url AS sellerUrl, seller_profiles.trust_score AS sellerTrustScore, seller_profiles.authenticity_history AS authenticityHistory, seller_profiles.returns_score AS returnsScore, seller_profiles.documentation_score AS documentationScore, seller_profiles.response_time_score AS responseTimeScore, seller_profiles.identity_status AS sellerIdentityStatus, seller_profiles.manufacturer_relationship AS manufacturerRelationship, seller_profiles.last_reviewed AS sellerLastReviewed, seller_profiles.evidence_note AS sellerEvidenceNote FROM prices LEFT JOIN seller_profiles ON seller_profiles.seller_name = prices.supplier WHERE prices.product_id = ? ORDER BY prices.price / prices.servings').all(row.id)
  const normalized = database.prepare('SELECT source, record_type, COUNT(*) AS count FROM normalized_records WHERE product_id = ? GROUP BY source, record_type').all(row.id)
  const sourceContext = Object.fromEntries(normalized.map((item) => [item.source, item.count]))
  const productEvidenceCount = sourceContext.europepmc || 0
  const productSafetyCount = sourceContext.openfda || 0
  const productRegulatoryCount = (sourceContext['efsa-openfoodtox'] || 0) + (sourceContext['uk-fsa'] || 0) + (sourceContext['health-canada'] || 0)
  const productSourceLastChecked = database.prepare('SELECT MAX(observed_at) AS observedAt FROM normalized_records WHERE product_id = ?').get(row.id).observedAt || null
  const factProfile = productFactProfiles[row.name] || {}
  const currentConfidence = deriveProductConfidence(row.id)
  const latestConfidenceChange = database.prepare('SELECT previous_confidence AS previousConfidence, new_confidence AS newConfidence, trigger_source AS triggerSource, changed_at AS changedAt FROM confidence_changes WHERE product_id = ? ORDER BY id DESC LIMIT 1').get(row.id) || null
  const evidenceDirection = productEvidenceCount >= 3 && row.evidence >= 70
    ? 'Supportive'
    : productEvidenceCount
      ? 'Limited or mixed'
      : 'Insufficient product-specific evidence'
  const dataConfidence = productEvidenceCount && productSafetyCount && productRegulatoryCount
    ? 'High'
    : productEvidenceCount || productSafetyCount
      ? 'Moderate'
      : 'Low'
  const biasRows = database.prepare('SELECT source_role AS role, AVG(source_quality) AS quality, AVG(independence_score) AS independence, AVG(relevance_score) AS relevance, GROUP_CONCAT(DISTINCT bias_flags) AS flags FROM normalized_records WHERE product_id = ? GROUP BY source_role').all(row.id)
  const directoryText = `%${row.name.toLowerCase()}%`
  const athleteCertification = database.prepare("SELECT COUNT(*) AS count FROM normalized_records WHERE source = 'informed-sport' AND lower(payload) LIKE ?").get(directoryText).count
  const sourceTotals = Object.fromEntries(database.prepare('SELECT source, COUNT(*) AS count FROM normalized_records GROUP BY source').all().map((item) => [item.source, item.count]))
  const decisionNote = row.score >= 80
    ? `This product is a strong catalogue candidate (${row.score}/100), with ${sourceTotals.europepmc || 0} evidence records and ${sourceTotals.openfda || 0} FDA safety records currently ingested across the source network. Confirm the dose and exact formulation before purchase.`
    : row.score >= 60
      ? `This product is suitable for cautious consideration (${row.score}/100), but the current evidence and safety picture should be reviewed against the intended outcome before use.`
      : `This product requires further review (${row.score}/100). The available source evidence does not support a confident recommendation yet.`
  const riskFeedback = row.contamination > 50 || row.safety < 60
    ? `Risk is elevated: safety is ${row.safety}/100 and contamination risk is ${row.contamination}/100. Seek professional review before use.`
    : athleteCertification > 0
      ? 'An Informed Sport directory match was found. This supports athlete-risk screening, but verify the current batch number directly before competition use.'
      : 'No product-specific Informed Sport match was found in the ingested directory snapshot. Athletes should verify the exact product and batch manually.'
  return {
    id: row.id, name: row.name, brand: row.brand, type: row.type, category: row.category, categories, region: row.region, ingredientAssessment, ingredientEvidenceProfile: evidenceProfile, trustProfile, bestCase, sourceReview,
    score: row.score, evidence: row.evidence, safety: row.safety, quality: row.quality, transparency: row.transparency,
    regulatory: row.regulatory, contamination: row.contamination, value: row.value, status: row.status,
    confidence: currentConfidence, bestFor: row.best_for, recommendation: row.name === 'Melatonin' ? `${row.recommendation} Availability and regulatory status vary by region; check local rules before purchase.` : row.recommendation, catalogueSource: row.catalogue_source, updatedAt: row.updated_at, prices,
    ageGroups: row.age_groups, primaryAgeGroup: row.primary_age_group, commonUseCases: row.common_use_cases, ageCautions: row.age_cautions,
    marketInterest: row.market_interest, marketInterestSource: row.market_interest_source, marketInterestUpdatedAt: row.market_interest_updated_at,
    sourceContext: { ...sourceContext, informedSportMatches: athleteCertification, biasRows },
    evidenceProfile: {
      evidenceCount: productEvidenceCount,
      safetyCount: productSafetyCount,
      regulatoryCount: productRegulatoryCount,
      direction: evidenceDirection,
      confidence: dataConfidence,
      doseStatus: factProfile.dose || 'Not captured in current catalogue',
      formulationStatus: factProfile.formulation || 'Not captured in current catalogue',
      evidenceMatch: factProfile.evidenceMatch || 'Product-specific applicability is not captured in the current catalogue.',
      interactionStatus: factProfile.interactions || 'Interaction profile is not captured in the current catalogue.',
      populationWarnings: factProfile.populationWarnings || 'Population-specific warnings are not captured in the current catalogue.',
      factStatus: factProfile.factStatus || 'Needs product-label verification',
      sourceStatus: factProfile.sourceStatus || 'No product-specific reference attached',
      sourceLinks: factProfile.sourceLinks || [],
      sourceRecords: [
        { type: 'Ingredient reference', status: factProfile.sourceStatus || 'Not available', links: factProfile.sourceLinks || [] },
        { type: 'Product label', status: 'Not verified', links: [] },
        { type: 'Batch certificate', status: 'Not verified', links: [] },
      ],
      sourceLastChecked: productSourceLastChecked,
      nextVerification: 'Verify the exact dose, formulation, batch test and intended outcome before relying on this product.',
      confidenceChange: latestConfidenceChange,
    },
    decisionNote,
    riskFeedback,
  }
}

app.get('/api/health', (_request, response) => {
  try {
    database.prepare('SELECT 1 AS ready').get()
    response.json({ status: 'ok', database: 'ready', port })
  } catch (error) {
    response.status(503).json({ status: 'error', database: 'unavailable', message: error.message })
  }
})
app.get('/api/products', (request, response) => {
  const { q = '', type = 'all', category = 'all', region = 'Global', age = 'all' } = request.query
  const rows = database.prepare(`SELECT * FROM products WHERE (@type = 'all' OR type = @type) AND (@category = 'all' OR EXISTS (SELECT 1 FROM product_categories WHERE product_id = products.id AND category = @category)) AND (@age = 'all' OR age_groups LIKE '%' || @age || '%') ORDER BY name COLLATE NOCASE`).all({ type, category, age })
  response.json(rows.map(productFromRow).filter((product) => matchesCatalogueSearch(product, q) && matchesCatalogueRegion(product, region)))
})
app.get('/api/v2/catalogue', (request, response) => {
  const { search = '', evidenceStatus, overallState, transparencyStatus, productVerificationStatus, batchVerificationStatus, category } = request.query
  const products = database.prepare('SELECT * FROM products ORDER BY name COLLATE NOCASE').all().map(productFromRow).filter((product) => {
    const entry = v2CatalogueEntry(product)
    return (!search || `${entry.name} ${entry.ingredient.canonicalName}`.toLowerCase().includes(String(search).toLowerCase())) && (!category || entry.categories.includes(category)) && (!evidenceStatus || entry.ingredientEvidenceProfile.status === evidenceStatus) && (!overallState || entry.overallAssessment.state === overallState) && (!transparencyStatus || entry.productTransparencyProfile.status === transparencyStatus) && (!productVerificationStatus || entry.productVerificationProfile.status === productVerificationStatus) && (!batchVerificationStatus || entry.batchVerificationProfile.status === batchVerificationStatus)
  }).map(v2CatalogueEntry)
  response.json(v2Envelope(products))
})
app.get('/api/v2/catalogue/:id', (request, response) => {
  const product = productFromRow(database.prepare('SELECT * FROM products WHERE id = ?').get(request.params.id) || {})
  if (!product.id) return response.status(404).json({ schemaVersion: '2.0', requestId: crypto.randomUUID(), error: { code: 'NOT_FOUND', message: 'Catalogue entry not found', retryable: false }, previousVerifiedDataAvailable: false })
  response.json(v2Envelope(v2CatalogueEntry(product)))
})
app.get('/api/v2/products', (request, response) => {
  const products = database.prepare('SELECT * FROM products ORDER BY name COLLATE NOCASE').all().map(productFromRow).map(v2CatalogueEntry)
  response.json(v2Envelope(products.filter((product) => product.entityType === 'ingredient')))
})
app.get('/api/v2/products/:id', (request, response) => {
  const product = database.prepare('SELECT * FROM products WHERE id = ?').get(request.params.id)
  if (!product) return response.status(404).json({ schemaVersion: '2.0', requestId: crypto.randomUUID(), error: { code: 'NOT_FOUND', message: 'Product not found', retryable: false }, previousVerifiedDataAvailable: false })
  response.json(v2Envelope(v2CatalogueEntry(productFromRow(product))))
})
app.get('/api/v2/products/:id/transparency', (request, response) => {
  const product = database.prepare('SELECT * FROM products WHERE id = ?').get(request.params.id)
  if (!product) return response.status(404).json({ schemaVersion: '2.0', requestId: crypto.randomUUID(), error: { code: 'NOT_FOUND', message: 'Product not found', retryable: false }, previousVerifiedDataAvailable: false })
  response.json(v2Envelope(v2CatalogueEntry(productFromRow(product)).productTransparencyProfile))
})
app.get('/api/v2/products/:id/verification', (request, response) => {
  const product = database.prepare('SELECT * FROM products WHERE id = ?').get(request.params.id)
  if (!product) return response.status(404).json({ schemaVersion: '2.0', requestId: crypto.randomUUID(), error: { code: 'NOT_FOUND', message: 'Product not found', retryable: false }, previousVerifiedDataAvailable: false })
  response.json(v2Envelope(v2CatalogueEntry(productFromRow(product)).productVerificationProfile))
})
app.get('/api/v2/products/:id/batches/:batchNumber', (request, response) => {
  const batch = database.prepare('SELECT id, batch_number AS batchNumber, manufacturer, manufacture_date AS manufactureDate, expiry_date AS expiryDate, laboratory, certificate_url AS certificateUrl, test_method AS testMethod, results, status, reviewer, reviewed_at AS reviewedAt FROM product_batches WHERE product_id = ? AND batch_number = ?').get(request.params.id, request.params.batchNumber)
  if (!batch) return response.json(v2Envelope({ status: 'record_not_found', batchNumber: request.params.batchNumber, documents: [], limitations: ['No verified batch record found.'] }, [{ code: 'MISSING_BATCH_RECORD', message: 'No exact batch record is available.' }]))
  response.json(v2Envelope({ status: batch.status === 'Verified' ? 'verified' : batch.status === 'Pending review' ? 'review_in_progress' : 'unknown', batchNumber: batch.batchNumber, documents: batch.certificateUrl ? [{ documentType: 'certificate_of_analysis', sourceUrl: batch.certificateUrl, authenticityStatus: 'not_checked', scopeStatus: 'unclear' }] : [], limitations: ['Batch verification requires human scope and authenticity review.'], review: { reviewStatus: batch.status === 'Verified' ? 'human_reviewed' : 'automated_only', reviewedAt: batch.reviewedAt } }))
})
app.get('/api/v2/products/:id/offers', (request, response) => {
  const offers = database.prepare('SELECT supplier, price, servings FROM prices WHERE product_id = ? ORDER BY price / servings').all(request.params.id)
  response.json(v2Envelope(offers.map((offer) => ({ ...offer, status: 'indicative_unverified' })), offers.length ? [{ code: 'UNREVIEWED_AUTOMATED_EXTRACTION', message: 'Offers are indicative and not verified against an exact SKU.' }] : []))
})
app.get('/api/v2/sources', (_request, response) => response.json(v2Envelope(ingestionSources.map((source) => ({ sourceId: source.id, name: source.name, type: source.type, url: source.url })))))
app.get('/api/v2/source-status', (_request, response) => response.json(v2Envelope(database.prepare('SELECT source, status, MAX(completed_at) AS checkedAt, MAX(message) AS message FROM ingestion_runs GROUP BY source').all())))
app.get('/api/v2/methodologies/:version', (request, response) => response.json(v2Envelope({ version: request.params.version, evidenceProfile: 'IEP-1.0', ingredientTrustRating: 'ITR-1.0', productTrust: 'Prototype legacy model retained for analyst comparison only' })))
app.get('/api/v2/ingredients/:name/evidence', (request, response) => {
  const product = database.prepare('SELECT * FROM products WHERE name = ?').get(request.params.name)
  if (!product) return response.status(404).json({ schemaVersion: '2.0', requestId: crypto.randomUUID(), error: { code: 'NOT_FOUND', message: 'Ingredient not found', retryable: false }, previousVerifiedDataAvailable: false })
  const profile = evidenceProfileForIngredient(product.name)
  response.json(v2Envelope(v2EvidenceProfile(profile), profile.state === 'under_review' ? [{ code: 'UNREVIEWED_AUTOMATED_EXTRACTION', message: 'Automated source discovery has not been human reviewed.' }] : []))
})
app.get('/api/products/:id/variants', (request, response) => {
  const parent = database.prepare('SELECT id FROM products WHERE id = ?').get(request.params.id)
  if (!parent) return response.status(404).json({ message: 'Catalogue entry not found' })
  response.json(database.prepare(`SELECT id, brand, name, dsld_id AS dsldId, upc,
    label_version AS labelVersion, serving, ingredient_count AS ingredientCount,
    label_entry_date AS labelEntryDate, label_url AS labelUrl,
    identity_status AS identityStatus, quality_status AS qualityStatus, region
    FROM catalogue_product_variants WHERE parent_id = ? ORDER BY id`).all(parent.id))
})
app.get('/api/ingredients/:name/assessment', (request, response) => {
  const ingredient = database.prepare('SELECT name FROM products WHERE name = ?').get(request.params.name)
  if (!ingredient) return response.status(404).json({ message: 'Ingredient not found in catalogue' })
  const { outcome = '', region = '' } = request.query
  const row = outcome && region
    ? database.prepare('SELECT * FROM ingredient_assessments WHERE ingredient_name = ? AND outcome = ? AND region = ?').get(ingredient.name, outcome, region)
    : null
  const assessment = row ? ingredientAssessmentFromRow(row) : assessIngredient({ outcome, region })
  response.json({ ingredient: ingredient.name, assessment, evidenceProfile: evidenceProfileForIngredient(ingredient.name), note: 'Ingredient evidence is outcome- and region-specific; it does not verify a product, batch or seller.' })
})
app.get('/api/products/:id/source-coverage', async (request, response) => {
  const product = database.prepare('SELECT id, name, status FROM products WHERE id = ?').get(request.params.id)
  if (!product) return response.status(404).json({ message: 'Product not found' })
  const labels = database.prepare('SELECT brand, name, dsld_id, label_url, upc FROM catalogue_product_variants WHERE parent_id = ?').all(product.id)
  const records = database.prepare("SELECT source, payload, observed_at AS observedAt FROM ingestion_records WHERE source IN ('europepmc', 'dsld', 'openfda', 'informed-sport', 'informed-sport-certified-list', 'nsf-sport', 'ods-supplied-page-analysis')").all()
  const latestRuns = database.prepare('SELECT source, status, MAX(completed_at) AS lastChecked FROM ingestion_runs GROUP BY source').all()
  const candidates = extractSourceCoverage(product.name, records)
  let research = { candidates: [], readiness: assessCandidateReadiness([]), status: 'unavailable', checkedAt: null }
  if (product.status === 'Not assessed' || ingredientAssessmentFromRow(database.prepare('SELECT * FROM ingredient_assessments WHERE ingredient_name = ? ORDER BY reviewed_at DESC LIMIT 1').get(product.name)).score === null) {
    try {
      const snapshot = database.prepare('SELECT candidates, sources, checked_at AS checkedAt FROM ingredient_candidate_snapshots WHERE ingredient_name = ?').get(product.name)
      const recent = snapshot && Date.now() - Date.parse(snapshot.checkedAt) < (
        JSON.parse(snapshot.candidates).length && Object.values(JSON.parse(snapshot.sources)).some((status) => status === 'fulfilled') ? 24 : 5
      ) * 60 * 60 * 1000
      const result = recent && request.query.refresh !== 'true'
        ? { candidates: JSON.parse(snapshot.candidates), sources: JSON.parse(snapshot.sources), checkedAt: Date.parse(snapshot.checkedAt) }
        : await researchFor(product.name, labels)
      research = { candidates: result.candidates, readiness: result.readiness, sources: result.sources, status: 'checked', checkedAt: new Date(result.checkedAt).toISOString() }
      research.readiness = assessCandidateReadiness(result.candidates)
    } catch {
      research.status = 'unavailable'
    }
  }
  research.candidates = deduplicateResearchCandidates([...research.candidates, ...suppliedPageCandidates(product.name, records)])
  research.readiness = assessCandidateReadiness(research.candidates)
  const offers = database.prepare('SELECT COUNT(*) AS count FROM prices WHERE product_id = ?').get(product.id).count
  const reviewPlan = assessmentReview({ name: product.name, candidates: research.candidates, sources: research.sources || {}, checkedAt: research.checkedAt, labels, registry: candidates })
  const scoring = assessScoreReadiness(product.status === 'Not assessed' ? {} : database.prepare('SELECT evidence, safety, quality, transparency, regulatory, contamination, value FROM products WHERE id = ?').get(product.id))
  const ingredientRow = database.prepare('SELECT * FROM ingredient_assessments WHERE ingredient_name = ? ORDER BY reviewed_at DESC LIMIT 1').get(product.name)
  const ingredientAssessment = ingredientAssessmentFromRow(ingredientRow)
  response.json({ product: product.name, assessment: product.status, scoring, ingredientAssessment, candidates, research, reviewPlan, feeds: latestRuns, gaps: {
    evidence: 'Study relevance, design, dose and outcome have not been reviewed for this exact product.',
    safety: 'An adverse-event report is not proof of causality or safety for this product.',
    interactions: 'Medicines, other supplements, population and dose require professional review.',
    quality: 'Exact label, formulation and independent testing need review.',
    transparency: 'The exact ingredients, quantities, manufacturer and provenance are not verified.',
    regulatory: 'Jurisdiction-specific status has not been verified.',
    batch: 'No authenticated certificate review for an identified product and exact batch.',
    price: 'Indicative prototype offers are not verified product-specific seller prices.',
    value: offers ? 'Indicative prices require exact SKU, comparable serving size and seller review.' : 'Cannot assess value without a current comparable seller offer and serving size.',
  } })
})
app.get('/api/products/:id/sources', (request, response) => {
  const sources = database.prepare('SELECT id, source_type AS sourceType, url, region, status, reviewer, verified_at AS verifiedAt, created_at AS createdAt FROM product_sources WHERE product_id = ? ORDER BY id DESC').all(request.params.id)
  response.json(sources)
})
app.post('/api/products/:id/sources', (request, response) => {
  const { sourceType, url, region = 'Global', status = 'Pending review', reviewer = '' } = request.body || {}
  if (!sourceType || !url) return response.status(400).json({ message: 'sourceType and url are required' })
  if (!['Pending review', 'Verified', 'Rejected', 'Outdated'].includes(status)) return response.status(400).json({ message: 'Invalid source status' })
  try { new URL(url) } catch { return response.status(400).json({ message: 'url must be a valid absolute URL' }) }
  const product = database.prepare('SELECT id FROM products WHERE id = ?').get(request.params.id)
  if (!product) return response.status(404).json({ message: 'Product not found' })
  const verifiedAt = status === 'Verified' ? new Date().toISOString() : null
  const previousConfidence = database.prepare('SELECT confidence FROM products WHERE id = ?').get(product.id).confidence
  const result = database.prepare('INSERT INTO product_sources (product_id, source_type, url, region, status, reviewer, verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(product.id, sourceType, url, region, status, reviewer, verifiedAt, new Date().toISOString())
  recordConfidenceChange(product.id, previousConfidence, `manual:${sourceType}`)
  recordAudit('source_created', 'product_source', result.lastInsertRowid, request.get('x-reviewer') || reviewer, { productId: product.id, sourceType, status, region })
  response.status(201).json({ id: result.lastInsertRowid, message: 'Source record saved' })
})
app.get('/api/products/:id/batches', (request, response) => {
  const product = database.prepare('SELECT id FROM products WHERE id = ?').get(request.params.id)
  if (!product) return response.status(404).json({ message: 'Product not found' })
  const batches = database.prepare('SELECT id, batch_number AS batchNumber, manufacturer, manufacture_date AS manufactureDate, expiry_date AS expiryDate, laboratory, certificate_url AS certificateUrl, test_method AS testMethod, results, status, reviewer, reviewed_at AS reviewedAt, created_at AS createdAt FROM product_batches WHERE product_id = ? ORDER BY id DESC').all(product.id)
  response.json(batches)
})
app.post('/api/products/:id/batches', (request, response) => {
  const { batchNumber, manufacturer = '', manufactureDate = null, expiryDate = null, laboratory = '', certificateUrl = '', testMethod = '', results = '', status = 'Pending review', reviewer = '' } = request.body || {}
  if (!batchNumber) return response.status(400).json({ message: 'batchNumber is required' })
  if (!['Pending review', 'Verified', 'Rejected', 'Outdated'].includes(status)) return response.status(400).json({ message: 'Invalid batch status' })
  if (certificateUrl) { try { new URL(certificateUrl) } catch { return response.status(400).json({ message: 'certificateUrl must be a valid absolute URL' }) } }
  const product = database.prepare('SELECT id FROM products WHERE id = ?').get(request.params.id)
  if (!product) return response.status(404).json({ message: 'Product not found' })
  const createdAt = new Date().toISOString()
  try {
    const result = database.prepare('INSERT INTO product_batches (product_id, batch_number, manufacturer, manufacture_date, expiry_date, laboratory, certificate_url, test_method, results, status, reviewer, reviewed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(product.id, batchNumber.trim(), manufacturer, manufactureDate, expiryDate, laboratory, certificateUrl, testMethod, results, status, reviewer, status === 'Verified' ? createdAt : null, createdAt)
    recordAudit('batch_created', 'product_batch', result.lastInsertRowid, request.get('x-reviewer') || reviewer, { productId: product.id, batchNumber: batchNumber.trim(), status })
    response.status(201).json({ id: result.lastInsertRowid, message: 'Product batch record saved for review.' })
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return response.status(409).json({ message: 'That batch is already recorded for this product.' })
    response.status(500).json({ message: error.message })
  }
})
app.get('/api/source-match-reviews', (_request, response) => {
  const reviews = database.prepare(`SELECT source_match_reviews.id, source_match_reviews.match_type AS matchType, source_match_reviews.match_score AS matchScore, source_match_reviews.status, source_match_reviews.created_at AS createdAt, products.name AS candidateProduct, ingestion_records.source, normalized_records.title FROM source_match_reviews JOIN products ON products.id = source_match_reviews.candidate_product_id JOIN ingestion_records ON ingestion_records.id = source_match_reviews.ingestion_record_id LEFT JOIN normalized_records ON normalized_records.ingestion_record_id = source_match_reviews.ingestion_record_id WHERE source_match_reviews.status = 'Pending review' ORDER BY source_match_reviews.id DESC LIMIT 100`).all()
  response.json(reviews.map((review) => ({ ...review, payload: undefined })))
})
app.patch('/api/source-match-reviews/:id', (request, response) => {
  const { status, reviewer = 'local reviewer', candidateProductId } = request.body || {}
  if (!['Approved', 'Rejected'].includes(status)) return response.status(400).json({ message: 'status must be Approved or Rejected' })
  const review = database.prepare('SELECT * FROM source_match_reviews WHERE id = ?').get(request.params.id)
  if (!review) return response.status(404).json({ message: 'Review not found' })
  const productId = candidateProductId || review.candidate_product_id
  const product = database.prepare('SELECT id, confidence FROM products WHERE id = ?').get(productId)
  if (!product) return response.status(404).json({ message: 'Candidate product not found' })
  const productName = database.prepare('SELECT name FROM products WHERE id = ?').get(product.id).name
  const actor = request.get('x-reviewer') || reviewer
  const secondReviewer = request.get('x-second-reviewer')
  if (status === 'Approved' && ['Yohimbine', '5-HTP'].includes(productName) && (!secondReviewer || secondReviewer === actor)) return response.status(409).json({ message: 'High-risk products require a distinct second reviewer.' })
  const reviewedAt = new Date().toISOString()
  database.prepare('UPDATE source_match_reviews SET status = ?, candidate_product_id = ?, reviewer = ?, reviewed_at = ? WHERE id = ?').run(status, product.id, actor, reviewedAt, request.params.id)
  if (status === 'Approved') {
    database.prepare('UPDATE normalized_records SET product_id = ? WHERE ingestion_record_id = ?').run(product.id, review.ingestion_record_id)
    recordConfidenceChange(product.id, product.confidence, `review:${review.match_type}`)
  }
  recordAudit(`source_match_${status.toLowerCase()}`, 'source_match_review', request.params.id, actor, { productId: product.id, secondReviewer: secondReviewer || null })
  response.json({ status, productId: product.id, reviewedAt })
})
app.get('/api/products/:id/monitoring', (request, response) => {
  const plans = database.prepare('SELECT id, outcome, start_date AS startDate, review_date AS reviewDate, baseline_value AS baselineValue, metric, confounders, created_at AS createdAt FROM monitoring_plans WHERE product_id = ? ORDER BY id DESC').all(request.params.id)
  const observations = database.prepare('SELECT id, plan_id AS planId, observed_at AS observedAt, value, adherence, notes, interpretation FROM monitoring_observations WHERE plan_id IN (SELECT id FROM monitoring_plans WHERE product_id = ?) ORDER BY observed_at DESC').all(request.params.id)
  response.json({ plans, observations })
})
app.post('/api/products/:id/monitoring', (request, response) => {
  const { outcome, startDate, reviewDate, baselineValue, metric, confounders = '' } = request.body || {}
  if (!outcome || !startDate || !reviewDate || !metric) return response.status(400).json({ message: 'outcome, dates, and metric are required' })
  if (Number.isNaN(Date.parse(startDate)) || Number.isNaN(Date.parse(reviewDate)) || new Date(reviewDate) < new Date(startDate)) return response.status(400).json({ message: 'reviewDate must be on or after startDate' })
  const product = database.prepare('SELECT id FROM products WHERE id = ?').get(request.params.id)
  if (!product) return response.status(404).json({ message: 'Product not found' })
  const result = database.prepare('INSERT INTO monitoring_plans (product_id, outcome, start_date, review_date, baseline_value, metric, confounders, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(product.id, outcome, startDate, reviewDate, baselineValue === '' ? null : baselineValue, metric, confounders, new Date().toISOString())
  recordAudit('monitoring_plan_created', 'monitoring_plan', result.lastInsertRowid, request.get('x-reviewer'), { productId: product.id, outcome })
  response.status(201).json({ id: result.lastInsertRowid })
})
app.post('/api/monitoring/:id/observations', (request, response) => {
  const { observedAt, value, adherence, notes = '', interpretation = 'Inconclusive' } = request.body || {}
  if (!observedAt) return response.status(400).json({ message: 'observedAt is required' })
  if (Number.isNaN(Date.parse(observedAt))) return response.status(400).json({ message: 'observedAt must be a valid date' })
  if (adherence !== '' && adherence !== undefined && (Number(adherence) < 0 || Number(adherence) > 100)) return response.status(400).json({ message: 'adherence must be between 0 and 100' })
  const plan = database.prepare('SELECT id FROM monitoring_plans WHERE id = ?').get(request.params.id)
  if (!plan) return response.status(404).json({ message: 'Monitoring plan not found' })
  const result = database.prepare('INSERT INTO monitoring_observations (plan_id, observed_at, value, adherence, notes, interpretation) VALUES (?, ?, ?, ?, ?, ?)').run(plan.id, observedAt, value === '' ? null : value, adherence === '' ? null : adherence, notes, interpretation)
  recordAudit('monitoring_observation_created', 'monitoring_observation', result.lastInsertRowid, request.get('x-reviewer'), { planId: plan.id, interpretation })
  response.status(201).json({ id: result.lastInsertRowid })
})
app.get('/api/summary', (_request, response) => {
  const rows = database.prepare("SELECT * FROM products WHERE status != 'Not assessed'").all()
  const bestValue = [...rows].sort((a, b) => b.value - a.value)[0]
  response.json({ highestTrust: rows.length ? Math.max(...rows.map((row) => row.score)) : null, bestValue: bestValue?.name || null, flagged: rows.filter((row) => row.score < 50).length, verified: rows.filter((row) => row.confidence === 'High').length, averageTrust: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length) : null, updatedAt: rows[0]?.updated_at })
})

const ingestionSources = [
  { id: 'dsld', name: 'NIH DSLD', type: 'labels', url: process.env.DSLD_FEED_URL || 'https://api.ods.od.nih.gov/dsld/v9/brand-products?q=vitamin&limit=5' },
  { id: 'europepmc', name: 'Europe PMC', type: 'evidence', url: process.env.EUROPEPMC_FEED_URL || 'https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=supplement%20clinical%20trial&format=json&pageSize=5' },
  { id: 'openfda', name: 'openFDA CAERS', type: 'safety', url: process.env.OPENFDA_FEED_URL || 'https://api.fda.gov/food/event.json?limit=5' },
  { id: 'uk-fsa', name: 'UK Food Standards Agency', type: 'regulatory', format: 'csv', url: process.env.UK_FSA_FEED_URL || 'https://fsadata.github.io/allergy-alerts/data/allergy-alerts-october-2019-to-december-2019-quarter-3.csv' },
  { id: 'health-canada', name: 'Health Canada LNHPD', type: 'regulatory', url: process.env.HEALTH_CANADA_FEED_URL || 'https://health-products.canada.ca/api/natural-licences/productlicence/?lang=en&type=json&id=02096870' },
  { id: 'efsa-openfoodtox', name: 'EFSA OpenFoodTox', type: 'regulatory', format: 'xlsx', timeoutMs: 60000, url: process.env.EFSA_OPENFOODTOX_FEED_URL || 'https://zenodo.org/records/19388272/files/OFT3.0%20export%20repository.xlsx' },
  { id: 'informed-sport', name: 'Informed Sport', type: 'athlete-certification', format: 'informed-sport-html', url: process.env.INFORMED_SPORT_FEED_URL || 'https://sport.wetestyoutrust.com/certified-products' },
  { id: 'informed-sport-certified-list', name: 'Informed Sport Official Certified List PDF', type: 'athlete-certification', format: 'informed-sport-pdf', url: 'https://sport.wetestyoutrust.com/certified-brands' },
  { id: 'nsf-sport', name: 'NSF Certified for Sport', type: 'athlete-certification', format: 'nsf-listings-html', timeoutMs: 30000, url: 'https://www.nsfsport.com/certified-products/search-results.php' },
  { id: 'ods-supplied-page-analysis', name: 'NIH ODS Supplied Pages — Dated Tool Analysis', type: 'ingredient-reference-analysis', format: 'saved-page-analysis', url: 'https://ods.od.nih.gov/factsheets/ExerciseAndAthleticPerformance-HealthProfessional/' },
  { id: 'eu-food-safety-campaign', name: 'European Commission Food Safety Campaign 2026', type: 'general-food-safety-context', format: 'campaign-html', url: 'https://food.ec.europa.eu/food-safety/campaign-2026_en' },
  { id: 'nccih', name: 'NCCIH Herbs at a Glance', type: 'safety-reference', format: 'reference-index-html', url: 'https://www.nccih.nih.gov/health/herbsataglance' },
  { id: 'nih-ods-factsheets', name: 'NIH ODS All Supplement Fact Sheets', type: 'safety-reference', format: 'reference-index-html', url: 'https://ods.od.nih.gov/factsheets/list-all/' },
  { id: 'dsid', name: 'NIH Dietary Supplement Ingredient Database', type: 'composition-reference', url: 'https://dsid.od.nih.gov/' },
  { id: 'openfoodfacts', name: 'Open Food Facts', type: 'product-transparency', url: 'https://world.openfoodfacts.org/api/v2/search?search_terms=supplement&page_size=20&fields=code,product_name,brands,ingredients_text,serving_size,labels_tags' },
  { id: 'gs1uk', name: 'GS1 UK / Verified by GS1', type: 'product-identity', format: 'access-restricted', url: 'https://www.gs1uk.org/' },
  { id: 'openalex', name: 'OpenAlex Works API', type: 'evidence', url: 'https://api.openalex.org/works?search=dietary%20supplement&per-page=20' },
  { id: 'opss', name: 'Operation Supplement Safety Ingredient Index', type: 'safety-reference', format: 'reference-index-html', url: 'https://www.opss.org/ingredient-and-substance-index' },
]

async function fetchFeed(source) {
  if (source.format === 'saved-page-analysis') {
    const analysis = JSON.parse(await readFile(path.join(__dirname, '../reports/ods-supplied-page-analysis.json'), 'utf8'))
    const records = analysis.records.map((record) => ({ ...record, id: `${record.ingredient}-${record.url}`, analysedAt: analysis.analysedAt, retrievalMethod: analysis.retrievalMethod, scope: analysis.scope }))
    return { status: 'analysed', records, message: 'Imported dated web-tool analysis; this is not successful automated retrieval of the ODS pages.' }
  }
  if (source.format === 'informed-sport-pdf') return fetchCertifiedList(source.url)
  if (source.format === 'access-restricted') throw new Error('No public free API endpoint is configured; GS1 lookup requires an authorized service account.')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), source.timeoutMs || 8000)
  try {
    const response = await fetch(source.url, { headers: { accept: source.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/json', 'user-agent': 'Supplement-Trust-Intelligence/1.0 (open-data-ingestion)' }, signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    if (source.format === 'nsf-listings-html') {
      const records = nsfListingRecords(await response.text(), source.url)
      return { status: 'success', records, message: `Parsed ${records.length} official NSF detail links; grouped unlinked flavors are not included; ingredient name associations do not certify an exact SKU.` }
    }
    if (source.format === 'campaign-html') {
      const record = foodSafetyCampaignRecord(await response.text(), source.url)
      return { status: 'success', records: [record], message: 'General food-safety context only; no supplement-specific scoring, warning or certification inferred.' }
    }
    if (source.format === 'informed-sport-html') {
      const body = await response.text()
      const records = []
      const monthBlocks = body.split(/<h3[^>]*>\s*([^<]+)\s*<\/h3>/i)
      for (let index = 1; index < monthBlocks.length; index += 2) {
        const month = monthBlocks[index].trim()
        const block = monthBlocks[index + 1]
        const brandBlocks = block.split(/<h4[^>]*>\s*([^<]+)\s*<\/h4>/i)
        for (let brandIndex = 1; brandIndex < brandBlocks.length; brandIndex += 2) {
          const brand = brandBlocks[brandIndex].trim()
          const productBlock = brandBlocks[brandIndex + 1]
          const products = [...productBlock.matchAll(/views-field-title[^>]*>\s*<span[^>]*>([^<]+)<\/span>/gi)]
          products.forEach((match, productIndex) => records.push({ certification_month: month, brand, product: match[1].trim(), directory_url: source.url, directory_record: `${month}-${brand}-${productIndex}` }))
        }
      }
      return { status: 'success', records: records.slice(0, 5000), message: `Parsed ${records.length} certified directory products` }
    }
    if (source.format === 'reference-index-html') {
      const body = await response.text()
      const records = [...body.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((match, index) => {
        let url
        try { url = new URL(match[1], source.url).href } catch { return null }
        const title = match[2].replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
        return title && url.startsWith(new URL(source.url).origin) ? { id: url || `${source.id}-${index}`, title, url, role: 'Official ingredient reference link; content scope is page-specific' } : null
      }).filter(Boolean)
      return { status: 'success', records: records.slice(0, 1000), message: `Parsed ${records.length} official reference links` }
    }
    if (source.format === 'xlsx') {
      const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer' })
      const records = []
      for (const sheetName of workbook.SheetNames.slice(0, 5)) {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null }).slice(0, 100)
        rows.forEach((row, index) => records.push({ sheet: sheetName, row: index + 2, ...row }))
      }
      return { status: 'success', records: records.slice(0, 100), message: `Parsed ${records.length} EFSA workbook rows` }
    }
    const body = await response.text()
    let payload
    try { payload = JSON.parse(body) } catch {
      const [header, ...rows] = body.split(/\r?\n/).filter(Boolean)
      const columns = header.split(',').map((column) => column.replace(/^"|"$/g, '').trim())
      const csvRecords = rows.map((row) => Object.fromEntries(columns.map((column, index) => [column, row.split(',')[index]?.replace(/^"|"$/g, '').trim() || ''])))
      payload = { csvRecords }
    }
    const records = payload.csvRecords || (Array.isArray(payload) ? payload : payload.data || payload.hits?.map((hit) => hit._source || hit) || payload.results || payload.result || payload.events || payload.labels || [payload])
    return { status: 'success', records: records.slice(0, 100), message: `Fetched ${records.length} records` }
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeAndRecalculate() {
  const products = database.prepare('SELECT * FROM products').all()
  const records = database.prepare('SELECT * FROM ingestion_records WHERE id NOT IN (SELECT ingestion_record_id FROM normalized_records)').all()
  const insertNormalized = database.prepare(`INSERT INTO normalized_records (ingestion_record_id, source, record_type, product_id, external_id, title, summary, evidence_level, safety_signal, source_role, source_quality, independence_score, relevance_score, bias_flags, payload, normalized_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const recalculations = []
  const normalize = database.transaction(() => {
    for (const record of records) {
      const payload = JSON.parse(record.payload)
      const sourceMatch = findSourceMatch(payload, products)
      let matched = sourceMatch?.type === 'Exact product match' ? sourceMatch.product : null
      if (matched?.status === 'Not assessed') matched = null
      if (!matched && record.record_type === 'labels' && catalogueNames.includes(payload.fullName)) {
        database.prepare(`INSERT OR IGNORE INTO products (name, brand, type, category, region, score, evidence, safety, quality, transparency, regulatory, contamination, value, status, confidence, best_for, recommendation, updated_at, catalogue_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          payload.fullName,
          payload.brandName || 'DSLD catalogue',
          'Vitamin',
          'Vitamins',
          'US',
          50,
          50,
          50,
          45,
          35,
          50,
          50,
          50,
          'Review required',
          'Low',
          'Confirm the intended health outcome and dose before use',
          'Source-backed label found. Evidence, interaction and batch testing review is still required.',
          record.observed_at,
          'NIH DSLD'
        )
        matched = database.prepare('SELECT * FROM products WHERE name = ?').get(payload.fullName)
        if (matched?.status === 'Not assessed') matched = null
        if (matched && !products.some((product) => product.id === matched.id)) products.push(matched)
      }
      if (!matched && sourceMatch) {
        database.prepare('INSERT INTO source_match_reviews (ingestion_record_id, candidate_product_id, match_type, match_score, created_at) VALUES (?, ?, ?, ?, ?)').run(record.id, sourceMatch.product.id, sourceMatch.type, sourceMatch.score, record.observed_at)
      }
      const title = String(payload.title || payload.name || payload.product_name || payload.brand_name || `${record.source} record`)
      const summary = String(payload.description || payload.summary || payload.adverse_event || payload.study_design || '').slice(0, 1000)
      const evidenceLevel = record.record_type === 'evidence' ? 1 : null
      const safetySignal = record.record_type === 'safety' ? 1 : null
      const sourceProfile = {
        dsld: ['label/quality context', 70, 55, 75, 'label data is not efficacy evidence'],
        europepmc: ['clinical evidence', 80, 80, 90, 'publication and study-design bias possible'],
        openfda: ['safety signal', 80, 75, 80, 'passive reporting undercounts and cannot establish causality'],
        'uk-fsa': ['regulatory alert', 85, 85, 55, 'alert data is not product efficacy evidence'],
        'health-canada': ['regulatory licence', 85, 85, 60, 'licence status is not proof of efficacy'],
        'efsa-openfoodtox': ['hazard assessment', 85, 85, 70, 'hazard context is not a product-level safety guarantee'],
        'informed-sport': ['athlete certification', 75, 45, 85, 'directory presence is not current batch verification'],
      }[record.source] || ['unknown', 0, 0, 0, 'source role not classified']
      insertNormalized.run(record.id, record.source, record.record_type, matched?.id || null, record.external_id, title, summary, evidenceLevel, safetySignal, sourceProfile[0], sourceProfile[1], sourceProfile[2], sourceProfile[3], sourceProfile[4], record.payload, record.observed_at)
      if (matched) {
        const linkedEvidence = database.prepare('SELECT COUNT(*) AS count FROM normalized_records WHERE product_id = ? AND record_type = ?').get(matched.id, 'evidence').count + (record.record_type === 'evidence' ? 1 : 0)
        const linkedSafety = database.prepare('SELECT COUNT(*) AS count FROM normalized_records WHERE product_id = ? AND record_type = ?').get(matched.id, 'safety').count + (record.record_type === 'safety' ? 1 : 0)
        const nextEvidence = Math.min(100, matched.evidence + Math.min(10, linkedEvidence * 2))
        const nextSafety = Math.max(0, matched.safety - Math.min(20, linkedSafety * 2))
        const nextScore = calculateTrustScore({
          evidence: nextEvidence,
          safety: nextSafety,
          quality: matched.quality,
          transparency: matched.transparency,
          regulatory: matched.regulatory,
          contamination: matched.contamination,
          value: matched.value,
        })
        if (nextScore !== matched.score) {
          database.prepare('UPDATE products SET evidence = ?, safety = ?, score = ?, updated_at = ? WHERE id = ?').run(nextEvidence, nextSafety, nextScore, record.observed_at, matched.id)
          database.prepare('INSERT INTO score_recalculations (product_id, previous_score, new_score, basis, calculated_at) VALUES (?, ?, ?, ?, ?)').run(matched.id, matched.score, nextScore, JSON.stringify({ evidenceRecords: linkedEvidence, safetySignals: linkedSafety }), record.observed_at)
          recalculations.push({ productId: matched.id, product: matched.name, previousScore: matched.score, newScore: nextScore })
        }
        matched.confidence = recordConfidenceChange(matched.id, matched.confidence, record.source)
      }
    }
  })
  normalize()
  const normalizedCount = database.prepare('SELECT COUNT(*) AS count FROM normalized_records').get().count
  const linkedCount = database.prepare('SELECT COUNT(*) AS count FROM normalized_records WHERE product_id IS NOT NULL').get().count
  return { normalizedCount, linkedCount, recalculations }
}

async function runIngestion(sourceId = null) {
  const observedAt = new Date().toISOString()
  const report = []
  for (const source of ingestionSources.filter((source) => !sourceId || source.id === sourceId)) {
    try {
      const result = await fetchFeed(source)
      const insertRecord = database.prepare(`INSERT INTO ingestion_records (source, external_id, record_type, payload, observed_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(source, external_id) DO UPDATE SET payload = excluded.payload, observed_at = excluded.observed_at`)
      const saveRecords = database.transaction((records) => records.forEach((record, index) => {
        const externalId = String(record.id || record.pmid || record.accession || record._id || `${source.id}-${index}`)
        insertRecord.run(source.id, externalId, source.type, JSON.stringify(record), observedAt)
      }))
      saveRecords(result.records)
      database.prepare('INSERT INTO ingestion_runs (source, status, completed_at, records_seen, message) VALUES (?, ?, ?, ?, ?)').run(source.id, result.status, observedAt, result.records.length, result.message)
      report.push({ id: source.id, name: source.name, status: result.status, records: result.records.length, observedAt })
    } catch (error) {
      const message = error.name === 'AbortError' ? 'Timed out after 8 seconds' : error.message
      database.prepare('INSERT INTO ingestion_runs (source, status, completed_at, records_seen, message) VALUES (?, ?, ?, ?, ?)').run(source.id, 'failed', observedAt, 0, message)
      report.push({ id: source.id, name: source.name, status: 'failed', records: 0, message, observedAt })
    }
  }
  const normalization = normalizeAndRecalculate()
  return { completedAt: observedAt, sources: report, totalRecords: report.reduce((total, source) => total + source.records, 0), normalization }
}

app.post('/api/ingestion/run', async (request, response) => {
  const sourceId = request.body?.sourceId || null
  if (sourceId && !ingestionSources.some((source) => source.id === sourceId)) return response.status(400).json({ message: 'Unknown ingestion source.' })
  if (ingestionRunning) return response.status(409).json({ status: 'busy', message: 'An ingestion run is already in progress.' })
  ingestionRunning = true
  try {
    const report = await runIngestion(sourceId)
    response.json({ status: 'ok', ...report, message: 'Approved public feeds were fetched and raw records were stored locally.' })
  } catch (error) {
    response.status(500).json({ status: 'failed', message: error.message })
  } finally {
    ingestionRunning = false
  }
})

app.get('/api/ingestion/status', (_request, response) => {
  const runs = database.prepare('SELECT source, status, completed_at AS completedAt, records_seen AS records, message FROM ingestion_runs ORDER BY id DESC LIMIT 20').all()
  const records = database.prepare('SELECT source, record_type AS type, COUNT(*) AS count, MAX(observed_at) AS observedAt FROM ingestion_records GROUP BY source, record_type').all()
  const normalized = database.prepare('SELECT COUNT(*) AS count, SUM(product_id IS NOT NULL) AS linked FROM normalized_records').get()
  const recalculations = database.prepare('SELECT COUNT(*) AS count FROM score_recalculations').get().count
  response.json({ sources: ingestionSources.map(({ id, name, type, url }) => ({ id, name, type, url })), runs, records, normalized: { count: normalized.count, linked: normalized.linked || 0, recalculations } })
})

app.post('/api/refresh', (_request, response) => {
  const completedAt = new Date().toISOString()
  database.prepare('INSERT INTO ingestion_runs (source, status, completed_at) VALUES (?, ?, ?)').run('license-free open-data feeds', 'preview-complete', completedAt)
  database.prepare('UPDATE products SET updated_at = ?').run(completedAt)
  response.json({ status: 'ok', source: 'license-free open-data feeds', completedAt, message: 'Local catalogue refreshed. Connect approved feed adapters when live ingestion is enabled.' })
})

app.listen(port, () => console.log(`Supplement Trust API listening on http://localhost:${port}`))

const ingestionIntervalMinutes = Number(process.env.INGESTION_INTERVAL_MINUTES || 0)
if (ingestionIntervalMinutes > 0) {
  setInterval(() => runIngestion().catch((error) => console.error('Scheduled ingestion failed:', error.message)), ingestionIntervalMinutes * 60 * 1000)
  console.log(`Scheduled ingestion enabled every ${ingestionIntervalMinutes} minutes`)
}
