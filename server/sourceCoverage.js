const wordCharacter = /[a-z0-9]/i

export function mentionsName(text, name) {
  if (!text || !name) return false
  const subject = String(text).toLowerCase()
  const query = name.toLowerCase()
  let start = subject.indexOf(query)
  while (start !== -1) {
    const before = subject[start - 1]
    const after = subject[start + query.length]
    if ((!before || !wordCharacter.test(before)) && (!after || !wordCharacter.test(after))) return true
    start = subject.indexOf(query, start + 1)
  }
  return false
}

function hasField(record, fields) {
  return fields.some((field) => record?.[field] !== null && record?.[field] !== undefined && record[field] !== '')
}

function sourceTypeIncludes(record, pattern) {
  return pattern.test(String(record?.sourceType || record?.source_type || record?.type || ''))
}

function pointsStatus(score, bands, emptyStatus) {
  if (score === 0) return emptyStatus
  return bands.find(([minimum]) => score >= minimum)?.[1] || emptyStatus
}

export function weightedCoverageScore({ evidence = 0, verification = 0, safety = 0, transparency = 0 } = {}) {
  return Math.round(evidence * 0.4 + verification * 0.15 + safety * 0.25 + transparency * 0.2)
}

export function classifyInformation({ evidence = 0, verification = 0, coverage = 0, warning = false } = {}) {
  if (warning) return { recommendation: 'Review Warning', recommendationTone: 'warning', recommendationNote: 'An explicit warning applies. Review its source and scope before comparing this entry.' }
  if (evidence >= 70 && verification >= 50 && coverage >= 70) return { recommendation: 'Worth Comparing', recommendationTone: 'strong', recommendationNote: 'Enough evidence and product-verification information is available for meaningful comparison. This is not a recommendation to take the supplement.' }
  if (evidence >= 70 && verification < 50) return { recommendation: 'Evidence Available', recommendationTone: 'information', recommendationNote: 'Ingredient evidence information is available; product-verification information remains limited. Missing product records do not negate the available ingredient information.' }
  if (evidence >= 30 || coverage >= 40) return { recommendation: 'Needs More Evidence', recommendationTone: 'partial', recommendationNote: 'Some information is available, but evidence or product-verification gaps prevent a stronger comparison classification.' }
  return { recommendation: 'Hold For Now', recommendationTone: 'unknown', recommendationNote: 'This snapshot contains too little information for meaningful comparison. Missing information does not mean unsafe, ineffective or poor quality.' }
}

export function scoreInformationCoverage({ researchCandidates = [], registryMatches = [], variants = [], productSources = [], batchRecords = [], sourceStatuses = {}, valueStatus = 'Unknown', warningPresent = false, recallPresent = false, regulatoryWarningPresent = false, currentDate = new Date() } = {}) {
  const currentYear = currentDate.getFullYear()
  const research = researchCandidates.filter((candidate) => ['Europe PMC', 'PubMed', 'ClinicalTrials.gov', 'OpenAlex'].includes(candidate.source))
  const candidateTypes = (candidate) => (candidate.publicationTypes || []).join(' ').toLowerCase()
  const candidateTitle = (candidate) => String(candidate.title || '').toLowerCase()
  const hasCandidate = (predicate) => research.some(predicate)
  const officialCitationAvailable = (type) => researchCandidates.some((candidate) => candidate.source === 'NIH ODS' && candidate.evidenceInformationAvailable && candidate.citedResearchTypes?.includes(type))
  const systematicReview = officialCitationAvailable('Systematic Review') || hasCandidate((candidate) => /systematic review/.test(candidateTypes(candidate)) || /systematic review/.test(candidateTitle(candidate)))
  const metaAnalysis = officialCitationAvailable('Meta-Analysis') || hasCandidate((candidate) => /meta-analysis|meta analysis/.test(candidateTypes(candidate)) || /meta-analysis|meta analysis/.test(candidateTitle(candidate)))
  const humanRcts = officialCitationAvailable('Randomized Controlled Trial') || hasCandidate((candidate) => /randomized controlled trial|randomised controlled trial|clinical trial/.test(candidateTypes(candidate)) || /\b(randomi[sz]ed|randomi[sz]ation|randomi[sz]ed controlled trial|randomi[sz]ed trial|randomi[sz]ed, double|clinical trial)\b/.test(candidateTitle(candidate)))
  const recentEvidence = hasCandidate((candidate) => {
    const year = Number.parseInt(candidate.year, 10)
    return Number.isFinite(year) && year <= currentYear && year >= currentYear - 5
  })
  const consistencyReviewed = researchCandidates.some((candidate) => candidate.evidenceConsistencyReviewed === true)
  const evidenceScore = (systematicReview ? 30 : 0) + (metaAnalysis ? 25 : 0) + (humanRcts ? 20 : 0) + (consistencyReviewed ? 15 : 0) + (recentEvidence ? 10 : 0)
  const researchChecked = ['europePmc', 'pubmed', 'clinicalTrials', 'openAlex'].some((source) => sourceStatuses[source] === 'fulfilled')
  const evidenceStatus = !researchChecked && !research.length
    ? 'Not Assessed'
    : pointsStatus(evidenceScore, [[80, 'Published'], [60, 'Mixed Evidence'], [30, 'Limited Evidence']], 'Insufficient Evidence')

  const verificationPoints = new Set()
  if (registryMatches.some((match) => /informed sport|informed choice/i.test(match.source || ''))) verificationPoints.add('directory')
  if (registryMatches.some((match) => match.source === 'NSF Certified for Sport')) verificationPoints.add('nsf')
  if (productSources.some((source) => /nsf/i.test(`${source.sourceType || source.source_type || ''} ${source.url || ''}`))) verificationPoints.add('nsf')
  if (productSources.some((source) => /independent.*(lab|laboratory)|lab(oratory)?.*report/i.test(`${source.sourceType || source.source_type || ''} ${source.documentType || ''}`))) verificationPoints.add('lab')
  if (productSources.some((source) => /certificate of analysis|\bcoa\b/i.test(`${source.sourceType || source.source_type || ''} ${source.documentType || ''}`) && hasField(source, ['url', 'sourceUrl']))) verificationPoints.add('coa')
  if (productSources.some((source) => /gmp|good manufacturing practice/i.test(`${source.sourceType || source.source_type || ''} ${source.title || ''}`))) verificationPoints.add('gmp')
  const verificationScore = Math.min(100,
    (verificationPoints.has('directory') ? 40 : 0) +
    (verificationPoints.has('nsf') ? 40 : 0) +
    (verificationPoints.has('lab') ? 30 : 0) +
    (verificationPoints.has('coa') ? 20 : 0) +
    (verificationPoints.has('gmp') ? 10 : 0))
  const verificationStatus = verificationScore >= 80 && productSources.length === 0 ? 'Partially Verified' : pointsStatus(verificationScore, [[80, 'Verified'], [50, 'Partially Verified'], [1, 'Limited Verification']], 'Unverified')

  const batches = batchRecords
  const currentCoa = batches.some((batch) => hasField(batch, ['certificate_url', 'certificateUrl']) && hasField(batch, ['batch_number', 'batchNumber']) && /verified|approved/i.test(String(batch.status || '')))
  const hasBatchNumber = batches.some((batch) => hasField(batch, ['batch_number', 'batchNumber']))
  const recentTest = batches.some((batch) => {
    const date = Date.parse(batch.report_date || batch.reportDate || batch.test_date || batch.testDate || '')
    return Number.isFinite(date) && date <= currentDate.getTime() && date >= currentDate.getTime() - 365 * 24 * 60 * 60 * 1000
  })
  const namedLab = batches.some((batch) => hasField(batch, ['laboratory', 'labName']) && (batch.independent === true || /verified|approved/i.test(String(batch.status || ''))))
  const batchScore = (currentCoa ? 60 : 0) + (hasBatchNumber ? 20 : 0) + (recentTest ? 10 : 0) + (namedLab ? 10 : 0)
  const batchStatus = pointsStatus(batchScore, [[80, 'Current Batch Verified'], [50, 'Historical Batch Evidence'], [1, 'Limited Batch Information']], 'Batch Unknown')

  const openFoodFacts = researchCandidates.filter((candidate) => candidate.source === 'Open Food Facts')
  const hasLabel = variants.some((variant) => hasField(variant, ['label_url', 'labelUrl']) && Number(variant.ingredient_count ?? variant.ingredientCount) > 0) || openFoodFacts.some((candidate) => candidate.ingredientDisclosureAvailable)
  const hasManufacturingLocation = variants.some((variant) => hasField(variant, ['manufacturing_country', 'manufacturingCountry'])) || openFoodFacts.some((candidate) => hasField(candidate, ['manufacturingPlaces']))
  const hasGmpDisclosure = variants.some((variant) => variant.gmpDisclosure === true) || productSources.some((source) => /gmp/i.test(`${source.sourceType || source.source_type || ''} ${source.title || ''}`) && hasField(source, ['url', 'sourceUrl']))
  const publicCoa = productSources.some((source) => /certificate of analysis|\bcoa\b/i.test(`${source.sourceType || source.source_type || ''} ${source.documentType || ''}`) && hasField(source, ['url', 'sourceUrl']))
  const testingMethod = batches.some((batch) => hasField(batch, ['test_method', 'testMethod']))
  const supplierTraceability = variants.some((variant) => hasField(variant, ['brand']) && hasField(variant, ['upc']) && hasField(variant, ['label_url', 'labelUrl'])) || openFoodFacts.some((candidate) => hasField(candidate, ['brand', 'barcode']) && hasField(candidate, ['url']))
  const recallDisclosure = productSources.some((source) => /recall/i.test(`${source.sourceType || source.source_type || ''} ${source.title || ''}`) && hasField(source, ['url', 'sourceUrl']))
  const transparencyScore = (hasLabel ? 15 : 0) + (hasManufacturingLocation ? 10 : 0) + (hasGmpDisclosure ? 10 : 0) + (publicCoa ? 25 : 0) + (testingMethod ? 20 : 0) + (supplierTraceability ? 10 : 0) + (recallDisclosure ? 10 : 0)
  const transparencyStatus = pointsStatus(transparencyScore, [[85, 'Excellent'], [70, 'Good'], [50, 'Partial'], [1, 'Limited']], 'Unknown')

  const officialSafetyDocuments = researchCandidates.filter((candidate) => ['NCCIH', 'OPSS', 'NIH ODS'].includes(candidate.source) && candidate.safetySectionAvailable)
  const hasSafetyReview = officialSafetyDocuments.length > 0 || research.some((candidate) => candidate.source === 'PubMed' && candidate.searchClass === 'safety' && (/systematic review|meta-analysis|scoping review/i.test(candidate.title || '') || /review/.test(candidateTypes(candidate))))
  const interactionDocumentation = officialSafetyDocuments.some((candidate) => candidate.interactionInfoAvailable) || research.some((candidate) => candidate.source === 'PubMed' && candidate.searchClass === 'safety' && /interaction(s)?/i.test(candidate.title || ''))
  const contraindicationDocumentation = officialSafetyDocuments.some((candidate) => candidate.contraindicationInfoAvailable) || research.some((candidate) => candidate.source === 'PubMed' && candidate.searchClass === 'safety' && /contraindication(s)?/i.test(candidate.title || ''))
  const dosageGuidance = officialSafetyDocuments.some((candidate) => candidate.dosageGuidanceAvailable) || variants.some((variant) => hasField(variant, ['doseGuidance', 'dosageGuidance']))
  const regulatoryAlertsReviewed = productSources.some((source) => /regulatory alert|safety alert/i.test(`${source.sourceType || source.source_type || ''} ${source.title || ''}`) && hasField(source, ['url', 'sourceUrl']))
  const safetyScore = (hasSafetyReview ? 30 : 0) + (interactionDocumentation ? 25 : 0) + (contraindicationDocumentation ? 20 : 0) + (dosageGuidance ? 15 : 0) + (regulatoryAlertsReviewed ? 10 : 0)
  const explicitReviewedWarning = productSources.some((source) => /verified|approved/i.test(String(source.status || '')) && /recall|material warning|regulatory warning/i.test(`${source.sourceType || source.source_type || ''} ${source.title || ''}`))
  const hasWarning = warningPresent || recallPresent || regulatoryWarningPresent || explicitReviewedWarning
  const safetyStatus = hasWarning
    ? 'Material Warning'
    : safetyScore === 0
      ? 'Unknown'
      : pointsStatus(safetyScore, [[80, 'Well Characterised'], [50, 'Context Required'], [20, 'Elevated Risk']], 'Unknown')

  const coverageScore = weightedCoverageScore({ evidence: evidenceScore, verification: verificationScore, safety: safetyScore, transparency: transparencyScore })
  const classification = classifyInformation({ evidence: evidenceScore, verification: verificationScore, coverage: coverageScore, warning: hasWarning })
  const tone = (score, status) => status === 'Material Warning' ? 'warning' : score === 0 ? 'unknown' : score >= 80 ? 'strong' : score >= 50 ? 'partial' : 'limited'

  return {
    coverageScore,
    ...classification,
    layers: [
      { key: 'ingredientEvidence', label: 'Ingredient Evidence', score: evidenceScore, weight: 40, status: evidenceStatus, tone: tone(evidenceScore, evidenceStatus) },
      { key: 'productQuality', label: 'Product Verification', score: verificationScore, weight: 15, status: verificationStatus, tone: tone(verificationScore, verificationStatus) },
      { key: 'batchVerification', label: 'Batch Verification', score: batchScore, weight: 0, status: batchStatus, tone: tone(batchScore, batchStatus) },
      { key: 'transparency', label: 'Transparency', score: transparencyScore, weight: 20, status: transparencyStatus, tone: tone(transparencyScore, transparencyStatus) },
      { key: 'safety', label: 'Safety Documentation', score: safetyScore, weight: 25, status: safetyStatus, tone: tone(safetyScore, safetyStatus) },
      { key: 'value', label: 'Value', score: null, weight: 0, status: valueStatus || 'Unknown', tone: 'unknown' },
    ],
  }
}

export function extractSourceCoverage(name, records) {
  const matches = []
  const normalizeSportName = (value) => String(value || '').replace(/&amp;/g, '&').replace(/[^a-z0-9]+/gi, ' ').trim()
  const latestPdfSnapshot = records.filter((record) => record.source === 'informed-sport-certified-list').reduce((latest, record) => record.observedAt > latest ? record.observedAt : latest, '')
  for (const record of records) {
    if (record.source === 'informed-sport-certified-list' && latestPdfSnapshot && record.observedAt !== latestPdfSnapshot) continue
    let payload
    try { payload = JSON.parse(record.payload) } catch { continue }
    if (record.source === 'europepmc') {
      for (const article of payload.resultList?.result || []) {
        if (mentionsName(article.title, name)) matches.push({ source: 'Europe PMC', role: 'Ingredient research candidate', title: article.title, url: article.pmid ? `https://europepmc.org/article/MED/${encodeURIComponent(article.pmid)}` : null, observedAt: record.observedAt })
      }
    } else if (['informed-sport', 'informed-sport-certified-list'].includes(record.source) && mentionsName(normalizeSportName(payload.product), normalizeSportName(name))) {
      matches.push({ source: 'Informed Sport', role: record.source === 'informed-sport-certified-list' ? payload.match_scope : 'Directory name candidate, not batch verification', title: payload.brand ? `${payload.brand}: ${payload.product}` : payload.product, brand: payload.brand || null, productName: payload.product, directoryMonth: payload.certification_month || null, documentHash: payload.document_hash || null, url: payload.directory_url || null, observedAt: record.observedAt })
    } else if (record.source === 'dsld' && mentionsName(payload.fullName, name)) {
      matches.push({ source: 'NIH DSLD', role: 'Label name candidate, not efficacy evidence', title: `${payload.brandName || 'Brand unknown'}: ${payload.fullName}`, url: null, observedAt: record.observedAt })
    } else if (record.source === 'nsf-sport' && mentionsName(normalizeSportName(payload.productName), normalizeSportName(name))) {
      matches.push({ source: 'NSF Certified for Sport', role: payload.scope, title: payload.title, productName: payload.productName, brand: payload.brand, url: payload.url, observedAt: record.observedAt })
    } else if (record.source === 'openfda' && payload.products?.some((product) => mentionsName(product.name_brand, name))) {
      matches.push({ source: 'openFDA', role: 'Adverse event report candidate, not causality', title: `Report ${payload.report_number || 'unknown'}`, url: null, observedAt: record.observedAt })
    }
  }
  return matches
}

export function sourceLayerInterpretations({ researchCandidates = [], registryMatches = [], labelCandidateCount = 0, batchRecordCount = 0, cataloguePriceCount = 0, sourceStatuses = {} } = {}) {
  const researchSources = new Set(['Europe PMC', 'PubMed', 'ClinicalTrials.gov', 'OpenAlex'])
  const research = researchCandidates.filter((candidate) => researchSources.has(candidate.source))
  const researchCounts = Object.fromEntries([...researchSources].map((source) => [source, research.filter((candidate) => candidate.source === source).length]).filter(([, count]) => count))
  const researchSourceSummary = Object.entries(researchCounts).map(([source, count]) => `${source}: ${count}`).join(', ')
  const trialsWithResults = research.filter((candidate) => candidate.source === 'ClinicalTrials.gov' && candidate.resultsAvailable).length
  const sportMatches = registryMatches.filter((candidate) => candidate.source === 'Informed Sport')
  const nsfMatches = registryMatches.filter((candidate) => candidate.source === 'NSF Certified for Sport')
  const labelMatches = registryMatches.filter((candidate) => candidate.source === 'NIH DSLD')
  const safetyMatches = registryMatches.filter((candidate) => candidate.source === 'openFDA')
  const safetySearches = research.filter((candidate) => candidate.source === 'PubMed' && candidate.searchClass === 'safety')
  const odsReferences = researchCandidates.filter((candidate) => ['NIH ODS', 'NIH ODS reference'].includes(candidate.source))
  const openAlexRecords = research.filter((candidate) => candidate.source === 'OpenAlex')
  const officialSafetyDocs = researchCandidates.filter((candidate) => ['NCCIH', 'OPSS', 'NIH ODS'].includes(candidate.source) && candidate.safetySectionAvailable)
  const offMatches = researchCandidates.filter((candidate) => candidate.source === 'Open Food Facts')
  return [
    {
      layer: 'Ingredient Evidence',
      cardValue: research.length ? `${research.length} research leads` : 'No research matches',
      signal: research.length ? `${research.length} research candidates (${researchSourceSummary}${openAlexRecords.length ? `, OpenAlex: ${openAlexRecords.length}` : ''})` : 'No matching research or trial candidate found',
      interpretation: research.length
        ? `The records identify literature and trial topics to inspect${trialsWithResults ? `; ${trialsWithResults} registered trials indicate results are posted` : ''}. This snapshot contains titles and registry metadata, not extracted outcome results, certainty, dose applicability or bias.`
        : 'No name-matched title appeared in this snapshot. Failed lookups or search terms can explain a gap; this is not evidence that research does not exist.',
    },
    {
      layer: 'Product Quality',
      cardValue: sportMatches.length ? `${sportMatches.length} directory matches` : 'No directory match',
      signal: `${sportMatches.length} Informed Sport · ${nsfMatches.length} NSF directory name matches`,
      interpretation: sportMatches.length || nsfMatches.length
        ? 'These are named listings in independent sport-certification directories. They may cover different products. Their pooled presence provides verification-information availability, not certification of an exact SKU or ingredient entry.'
        : 'No matching directory listing was found in this feed snapshot. The feed does not cover every quality provider or product.',
    },
    {
      layer: 'Batch Verification',
      cardValue: batchRecordCount ? `${batchRecordCount} batch records` : 'No batch record',
      signal: batchRecordCount ? `${batchRecordCount} stored batch records` : 'No batch-specific record found',
      interpretation: batchRecordCount
        ? `${batchRecordCount} batch record(s) exist, but the source match alone does not establish current-lot identity, certificate authenticity or test scope.`
        : 'The ingested feeds contain no exact-lot certificate or test result for this entry. Product-directory listings do not verify a batch.',
    },
    {
      layer: 'Safety',
      cardValue: `${safetyMatches.length} FDA report${safetyMatches.length === 1 ? '' : 's'} · ${officialSafetyDocs.length} official safety pages`,
      signal: `${safetyMatches.length} openFDA report name match${safetyMatches.length === 1 ? '' : 'es'} · ${safetySearches.length} PubMed safety-search titles · ${officialSafetyDocs.length} NCCIH/OPSS/ODS safety pages · ${odsReferences.length} ODS reference link${odsReferences.length === 1 ? '' : 's'}`,
      interpretation: safetyMatches.length
        ? 'An adverse-event record matched by name; the captured record does not establish causality, incidence or risk for this ingredient entry. ODS reference content was unavailable in the latest lookups.'
        : 'No name-matched adverse-event record was found in the small ingested sample. This does not establish safety. Safety-search titles and ODS links do not provide a dose- and population-specific conclusion.',
    },
    {
      layer: 'Transparency',
      cardValue: labelMatches.length || labelCandidateCount || offMatches.length ? `${labelMatches.length} DSLD · ${offMatches.length} barcode matches · ${labelCandidateCount} label leads` : 'No label matches',
      signal: `${labelMatches.length} DSLD registry name match${labelMatches.length === 1 ? '' : 'es'} · ${offMatches.length} barcode-matched Open Food Facts record${offMatches.length === 1 ? '' : 's'} · ${labelCandidateCount} catalogue label candidate${labelCandidateCount === 1 ? '' : 's'}`,
      interpretation: labelMatches.length || labelCandidateCount
        ? 'These records can identify possible branded labels and disclosed ingredients or amounts. The candidates are not linked to a current exact retail SKU, so they do not establish this entry\'s formulation.'
        : 'No label candidate matched this entry in the current snapshot; this does not mean products or labels do not exist.',
    },
    {
      layer: 'Value',
      cardValue: cataloguePriceCount ? `${cataloguePriceCount} indicative prices` : 'No price data',
      signal: cataloguePriceCount ? `${cataloguePriceCount} indicative catalogue price record${cataloguePriceCount === 1 ? '' : 's'}` : 'No catalogue price record',
      interpretation: 'The source registry feeds do not provide a current exact-SKU seller offer. Stored catalogue prices are indicative and cannot establish current price, comparable serving cost or value.',
    },
  ]
}

export function extractResearchCandidates(name, payload) {
  return (payload.resultList?.result || [])
    .filter((article) => mentionsName(article.title, name) && (article.pmid || /^10\.\d{4,9}\/\S+$/.test(article.doi || '')))
    .slice(0, 5)
    .map((article) => ({
      source: 'Europe PMC',
      role: 'Ingredient research candidate, outcome and quality not reviewed',
      title: stripMarkup(article.title),
      url: article.pmid ? `https://europepmc.org/article/MED/${encodeURIComponent(article.pmid)}` : `https://doi.org/${encodeURI(article.doi)}`,
      year: article.pubYear || null,
      journal: article.journalTitle || null,
    }))
}

export function extractPubMedCandidates(name, payload) {
  return (payload.result?.uids || []).map((uid) => payload.result[uid]).filter((article) => article && mentionsName(article.title, name)).slice(0, 10).map((article) => ({ source: 'PubMed', role: 'Indexed ingredient research candidate, quality not reviewed', title: article.title, url: `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(article.uid)}/`, year: article.pubdate?.match(/\d{4}/)?.[0] || null, journal: article.fulljournalname || article.source || null, publicationTypes: article.pubtype || [], searchClass: payload.searchClass || null }))
}

const officialSourceAliases = {
  'Creatine Monohydrate': ['Creatine'],
  'Vitamin D3': ['Vitamin D'],
  'Vitamin K2': ['Vitamin K'],
  'Magnesium Glycinate': ['Magnesium'],
  'Green Tea Extract': ['Green Tea'],
  'Ginseng': ['Asian Ginseng'],
  'Whey Protein': ['Protein Powders'],
  'Plant Protein': ['Protein Powders'],
  'Casein Protein': ['Protein Powders'],
  'Curcumin': ['Turmeric'],
}

function sourceSearchTerms(name) {
  return [name, ...(officialSourceAliases[name] || [])].filter(Boolean)
}

export function extractOpenAlexCandidates(name, payload) {
  return (payload.results || []).filter((work) => work.title && sourceSearchTerms(name).some((term) => mentionsName(work.title, term))).slice(0, 10).map((work) => ({
    source: 'OpenAlex',
    role: 'Scholarly work metadata candidate; results and study quality not reviewed',
    title: stripMarkup(work.title),
    url: /^https:\/\/openalex\.org\//.test(work.id || '') ? work.id : work.doi || null,
    year: work.publication_year || null,
    journal: work.primary_location?.source?.display_name || null,
    publicationTypes: [work.type].filter(Boolean),
    citedByCount: work.cited_by_count ?? null,
    openAccess: work.open_access?.is_oa === true,
  })).filter((candidate) => candidate.url)
}

export function extractOpenFoodFactsCandidates(name, lookups = []) {
  const normalizeBarcode = (value) => String(value || '').replace(/\D/g, '').padStart(14, '0')
  return lookups.filter(({ requestedBarcode, payload }) => {
    const product = payload?.product
    return payload?.status === 1 && product?.code && normalizeBarcode(product.code) === normalizeBarcode(requestedBarcode)
  }).map(({ payload }) => {
    const product = payload.product
    return {
      source: 'Open Food Facts',
      role: 'Barcode-matched public label data candidate; not quality, safety or batch verification',
      title: product.product_name || product.product_name_en || `${product.brands || 'Brand unavailable'} product`,
      url: `https://world.openfoodfacts.org/product/${encodeURIComponent(product.code)}`,
      barcode: product.code,
      brand: product.brands || null,
      ingredientsText: product.ingredients_text || null,
      servingSize: product.serving_size || null,
      manufacturingPlaces: product.manufacturing_places || null,
      labels: product.labels_tags || [],
      ingredientDisclosureAvailable: Boolean(product.ingredients_text),
      servingDisclosureAvailable: Boolean(product.serving_size),
    }
  }).slice(0, 5)
}

function extractReferenceCandidates(name, html, source) {
  const host = source === 'NCCIH' ? 'https://www.nccih.nih.gov' : 'https://www.opss.org'
  const allowed = source === 'NCCIH' ? /^https:\/\/www\.nccih\.nih\.gov\/health\// : /^https:\/\/www\.opss\.org\/(article|ingredient|node)\//
  const terms = sourceSearchTerms(name)
  const candidates = []
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const match of String(html || '').matchAll(linkPattern)) {
    const title = stripMarkup(match[2])
    if (!terms.some((term) => mentionsName(title, term))) continue
    let url
    try { url = new URL(match[1], host).href } catch { continue }
    if (!allowed.test(url)) continue
    candidates.push({ source, role: `${source} ingredient reference; source information is not product-specific`, title, url })
  }
  return [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()].slice(0, 3)
}

export function extractNccihCandidates(name, html) {
  return extractReferenceCandidates(name, html, 'NCCIH')
}

export function extractOpssCandidates(name, html) {
  return extractReferenceCandidates(name, html, 'OPSS')
}

export function extractOfficialReferenceDetails(candidate, html) {
  const headingPattern = /<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi
  const headings = [...String(html || '').matchAll(headingPattern)]
  const sections = headings.map((heading, index) => ({
    heading: stripMarkup(heading[2]),
    text: stripMarkup(String(html).slice(heading.index + heading[0].length, headings[index + 1]?.index || String(html).length)),
  }))
  const evidence = sections.find((section) => /what have we learned|benefit|what does the science say|evidence|and health|health effects/i.test(section.heading))
  const safety = sections.find((section) => /safety|side effects|is .* safe|cautions|health risks|excessive|upper intake/i.test(section.heading))
  const interactions = sections.find((section) => /interactions? with|medication interactions?/i.test(section.heading))
  const intake = sections.find((section) => /recommended intakes|recommended amounts|how much|dosage|dosing/i.test(section.heading))
  return {
    ...candidate,
    evidenceSummary: evidence?.text.slice(0, 1200) || null,
    safetySummary: safety?.text.slice(0, 1200) || null,
    evidenceInformationAvailable: Boolean(evidence?.text),
    safetySectionAvailable: Boolean(safety?.text),
    interactionInfoAvailable: Boolean(interactions?.text) || Boolean(safety && /interact|medicines|medications/i.test(safety.text)),
    contraindicationInfoAvailable: Boolean(safety && /avoid|should not|not recommended|pregnan|breastfeed|contraindicat/i.test(safety.text)),
    dosageGuidanceAvailable: Boolean(intake?.text) || Boolean((evidence || safety) && /\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|grams?)\b|dosage|dose/i.test(`${evidence?.text || ''} ${safety?.text || ''}`)),
    interactionSummary: interactions?.text.slice(0, 1200) || null,
    dosageSummary: intake?.text.slice(0, 1200) || null,
  }
}

export function deduplicateResearchCandidates(candidates) {
  return [...new Map(candidates.filter((candidate) => candidate.url).map((candidate) => [candidate.url, candidate])).values()]
}

export function extractClinicalTrialCandidates(name, payload) {
  return (payload.studies || []).filter((study) => {
    const protocol = study.protocolSection || {}
    const identification = protocol.identificationModule || {}
    const interventions = protocol.armsInterventionsModule?.interventions || []
    return [identification.briefTitle, identification.officialTitle, ...interventions.map((item) => item.name)].some((text) => mentionsName(text, name))
  }).slice(0, 5).map((study) => {
    const protocol = study.protocolSection || {}
    const identification = protocol.identificationModule || {}
    const status = protocol.statusModule || {}
    const design = protocol.designModule || {}
    return { source: 'ClinicalTrials.gov', role: 'Trial registry candidate, results and quality not reviewed', title: identification.briefTitle || identification.officialTitle || identification.nctId, url: `https://clinicaltrials.gov/study/${encodeURIComponent(identification.nctId)}`, year: status.startDateStruct?.date?.slice(0, 4) || null, journal: status.overallStatus || null, studyType: design.studyType || null, enrollment: design.enrollmentInfo?.count || null, population: protocol.eligibilityModule?.sex || null, resultsAvailable: Boolean(study.hasResults) }
  })
}

function stripMarkup(value) {
  return String(value || '').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
}

export function extractOdsCandidates(name, html) {
  const candidates = []
  const aliases = { B12: 'Vitamin B12', 'Vitamin D3': 'Vitamin D', 'Vitamin K2': 'Vitamin K', 'Magnesium Glycinate': 'Magnesium', 'Folic Acid': 'Folate', Multivitamins: 'Multivitamin' }
  const terms = [name, aliases[name]].filter(Boolean)
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const match of String(html || '').matchAll(linkPattern)) {
    const title = stripMarkup(match[2])
    if (!terms.some((term) => mentionsName(title, term) || mentionsName(match[1], term.replaceAll(' ', '')))) continue
    let url
    try { url = new URL(match[1], 'https://ods.od.nih.gov').href } catch { continue }
    if (!url.startsWith('https://ods.od.nih.gov/factsheets/') || !url.includes('-HealthProfessional')) continue
    candidates.push({ source: 'NIH ODS', role: 'Official professional fact sheet; ingredient or nutrient-family scope, not product verification', title, url, matchedIngredient: name, referenceScope: aliases[name] || name })
  }
  return [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()].slice(0, 3)
}

export function odsReference(name) {
  const nutrients = new Set(['Calcium', 'Iron', 'Magnesium', 'Vitamin B12', 'Vitamin C', 'Vitamin D', 'Vitamin K', 'Zinc'])
  if (!nutrients.has(name)) return []
  const slug = name.replaceAll(' ', '')
  return [{ source: 'NIH ODS reference', role: 'Fact sheet link only; live page unavailable and content not assessed', title: `${name} health professional fact sheet`, url: `https://ods.od.nih.gov/factsheets/${slug}-HealthProfessional/` }]
}

export function extractPubChemCandidates(name, payload) {
  return (payload.PropertyTable?.Properties || []).filter((compound) => compound.Title?.toLowerCase() === name.toLowerCase()).slice(0, 3).map((compound) => ({
    source: 'PubChem',
    role: 'Chemical identity candidate, not efficacy or product verification',
    title: compound.Title || name,
    url: compound.CID ? `https://pubchem.ncbi.nlm.nih.gov/compound/${encodeURIComponent(compound.CID)}` : null,
    cid: compound.CID || null,
    molecularFormula: compound.MolecularFormula || null,
    molecularWeight: compound.MolecularWeight || null,
    inchiKey: compound.InChIKey || null,
  })).filter((candidate) => candidate.url)
}

export function assessCandidateReadiness(candidates) {
  const sources = new Set(candidates.map((candidate) => candidate.source))
  const evidenceSources = ['Europe PMC', 'PubMed', 'ClinicalTrials.gov', 'OpenAlex'].filter((source) => sources.has(source))
  const dimensions = [
    { dimension: 'Evidence', status: evidenceSources.length ? 'Candidate data found' : 'No candidate data', detail: evidenceSources.length ? `${evidenceSources.join(', ')} records require outcome, design and bias review.` : 'No matching literature or trial-registry candidate was found.' },
    { dimension: 'Safety', status: ['NIH ODS', 'NCCIH', 'OPSS'].some((source) => sources.has(source)) ? 'Candidate data found' : 'No candidate data', detail: ['NCCIH', 'OPSS'].some((source) => sources.has(source)) ? 'Official NCCIH/OPSS pages provide ingredient-level safety context; dose and population scope still matter.' : sources.has('NIH ODS') ? 'NIH ODS fact-sheet safety and interaction sections require assessment.' : 'No matching official safety reference candidate was found.' },
    { dimension: 'Regulatory confidence', status: sources.has('NIH ODS') ? 'Context found' : 'No candidate data', detail: sources.has('NIH ODS') ? 'NIH ODS supplies US government health context, not product approval or local regulatory status.' : 'Jurisdiction-specific regulatory review remains required.' },
    { dimension: 'Transparency', status: ['PubChem', 'Open Food Facts'].some((source) => sources.has(source)) ? 'Candidate data found' : 'No candidate data', detail: sources.has('Open Food Facts') ? 'Barcode-matched product data can provide label and serving fields; this does not verify product quality.' : sources.has('PubChem') ? 'PubChem identity and structure fields can support ingredient-form verification after review.' : 'No single-compound identity or product label candidate was matched.' },
    { dimension: 'Evidence consistency', status: evidenceSources.length >= 2 ? 'Cross-source review possible' : 'Insufficient source coverage', detail: evidenceSources.length >= 2 ? `${evidenceSources.length} indexes can be reconciled for duplicate and consistency review; overlapping records are not independent evidence.` : 'Independent outcomes and findings still need review.' },
    { dimension: 'Biological plausibility', status: sources.has('PubChem') && evidenceSources.length ? 'Candidate context found' : 'Insufficient source coverage', detail: 'Mechanistic plausibility still requires expert interpretation and cannot be inferred from chemical identity.' },
  ]
  return { status: dimensions.some((item) => item.status.includes('found') || item.status.includes('possible')) ? 'Review candidates available' : 'Insufficient source coverage', score: null, publishable: false, dimensions }
}