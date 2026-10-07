import { describe, expect, it } from 'vitest'
import { classifyInformation } from './sourceCoverage.js'
import { assessCandidateReadiness, extractClinicalTrialCandidates, extractNccihCandidates, extractOdsCandidates, extractOpenAlexCandidates, extractOpenFoodFactsCandidates, extractOpssCandidates, extractOfficialReferenceDetails, extractPubChemCandidates, extractPubMedCandidates, extractResearchCandidates, extractSourceCoverage, mentionsName, odsReference, scoreInformationCoverage, sourceLayerInterpretations, weightedCoverageScore } from './sourceCoverage.js'

describe('source coverage extraction', () => {
  it('classifies information by explicit priority and preserves available evidence at low coverage', () => {
    expect(classifyInformation({ evidence: 70, verification: 50, coverage: 70 })).toMatchObject({ recommendation: 'Worth Comparing', recommendationTone: 'strong' })
    expect(classifyInformation({ evidence: 85, verification: 0, coverage: 34 })).toMatchObject({ recommendation: 'Evidence Available', recommendationTone: 'information' })
    expect(classifyInformation({ evidence: 69, verification: 50, coverage: 70 }).recommendation).toBe('Needs More Evidence')
    expect(classifyInformation({ evidence: 70, verification: 50, coverage: 69 }).recommendation).toBe('Needs More Evidence')
    expect(classifyInformation({ evidence: 30, coverage: 12 }).recommendation).toBe('Needs More Evidence')
    expect(classifyInformation({ evidence: 29, coverage: 39 })).toMatchObject({ recommendation: 'Hold For Now', recommendationTone: 'unknown' })
    expect(classifyInformation({ evidence: 100, verification: 100, coverage: 100, warning: true })).toMatchObject({ recommendation: 'Review Warning', recommendationTone: 'warning' })
  })
  it('requires name boundaries so similar names do not become matches', () => {
    expect(mentionsName('Decaffeinated coffee', 'Caffeine')).toBe(false)
    expect(mentionsName('Magnesium Glycinate certified', 'Magnesium')).toBe(true)
    expect(mentionsName('Vitamin B12 complex', 'B12')).toBe(true)
  })

  it('treats structured directory and label names as candidates only', () => {
    const records = [
      { source: 'informed-sport', payload: JSON.stringify({ brand: 'Example', product: 'MAGNESIUM GLYCINATE', directory_url: 'https://example.org/list' }), observedAt: '2026-09-25' },
      { source: 'dsld', payload: JSON.stringify({ fullName: 'Magnesium Glycinate', brandName: 'Example' }), observedAt: '2026-09-25' },
      { source: 'europepmc', payload: JSON.stringify({ resultList: { result: [{ title: 'Magnesium Glycinate trial', pmid: '123' }, { title: 'Unrelated article' }] } }), observedAt: '2026-09-25' },
    ]
    const matches = extractSourceCoverage('Magnesium Glycinate', records)
    expect(matches).toHaveLength(3)
    expect(matches[0].role).toContain('not batch verification')
    expect(matches[2].url).toBe('https://europepmc.org/article/MED/123')
  })

  it('matches punctuation variants in sport listings without confusing similar ingredient names', () => {
    const records = [{ source: 'informed-sport', payload: JSON.stringify({ brand: 'Example', product: 'Beta Alanine Capsules', certification_month: 'October-2026', directory_url: 'https://sport.wetestyoutrust.com/certified-products' }), observedAt: '2026-10-02' }]
    expect(extractSourceCoverage('Beta-Alanine', records)[0]).toMatchObject({ brand: 'Example', productName: 'Beta Alanine Capsules', directoryMonth: 'October-2026' })
    expect(extractSourceCoverage('Alan', records)).toEqual([])
    const assessment = scoreInformationCoverage({ registryMatches: extractSourceCoverage('Beta-Alanine', records) })
    expect(assessment.layers.find((layer) => layer.key === 'productQuality').score).toBe(40)
    expect(assessment.layers.find((layer) => layer.key === 'ingredientEvidence').score).toBe(0)
    expect(assessment.layers.find((layer) => layer.key === 'safety').score).toBe(0)
  })

  it('only exposes linked studies whose titles mention the named ingredient', () => {
    const results = extractResearchCandidates('Magnesium Glycinate', { resultList: { result: [
      { title: 'Magnesium Glycinate in adults', pmid: '123', pubYear: '2024' },
      { title: 'Magnesium in adults', pmid: '456' },
      { title: 'Magnesium Glycinate overview without an identifier' },
      { title: 'Magnesium Glycinate case study', doi: '10.1000/example.42' },
    ] } })
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ title: 'Magnesium Glycinate in adults', year: '2024', url: 'https://europepmc.org/article/MED/123' })
    expect(results[1].url).toBe('https://doi.org/10.1000/example.42')
  })

  it('decodes escaped markup in source titles before displaying them', () => {
    const results = extractResearchCandidates('Ashwagandha', { resultList: { result: [
      { title: 'Ashwagandha Extract for &lt;i&gt;Apis mellifera&lt;/i&gt;', pmid: '123' },
    ] } })
    expect(results[0].title).toBe('Ashwagandha Extract for Apis mellifera')
  })

  it('extracts matching PubMed and ClinicalTrials records as review candidates', () => {
    const pubmed = extractPubMedCandidates('Creatine', { result: { uids: ['1', '2'], 1: { uid: '1', title: 'Creatine and strength', pubdate: '2025', source: 'Journal' }, 2: { uid: '2', title: 'Unrelated study' } } })
    const trials = extractClinicalTrialCandidates('Creatine', { studies: [{ protocolSection: { identificationModule: { nctId: 'NCT1', briefTitle: 'Creatine in athletes' }, statusModule: { overallStatus: 'COMPLETED' } } }, { protocolSection: { identificationModule: { nctId: 'NCT2', briefTitle: 'Other trial' } } }] })
    expect(pubmed).toHaveLength(1)
    expect(pubmed[0].url).toBe('https://pubmed.ncbi.nlm.nih.gov/1/')
    expect(trials).toHaveLength(1)
    expect(trials[0].source).toBe('ClinicalTrials.gov')
  })

  it('extracts ODS fact sheets and PubChem identities without treating them as scores', () => {
    const ods = extractOdsCandidates('Vitamin D', '<a href="/factsheets/VitaminD-HealthProfessional/">Vitamin D</a><a href="/factsheets/Iron-HealthProfessional/">Iron</a>')
    const pubchem = extractPubChemCandidates('Vitamin D3', { PropertyTable: { Properties: [{ CID: 5280795, Title: 'Vitamin D3', MolecularFormula: 'C27H44O', MolecularWeight: '384.6', InChIKey: 'QYSXJUFSXHHAJI-YRZJJWOYSA-N' }] } })
    const readiness = assessCandidateReadiness([...ods, ...pubchem, { source: 'PubMed' }, { source: 'ClinicalTrials.gov' }])
    expect(ods).toHaveLength(1)
    expect(pubchem[0]).toMatchObject({ cid: 5280795, molecularFormula: 'C27H44O' })
    expect(extractPubChemCandidates('Omega-3 Fish Oil', { PropertyTable: { Properties: [{ CID: 42, Title: 'EPA' }] } })).toEqual([])
    expect(readiness).toMatchObject({ status: 'Review candidates available', score: null, publishable: false })
    expect(readiness.dimensions.find((item) => item.dimension === 'Transparency').status).toBe('Candidate data found')
    expect(odsReference('Magnesium')).toHaveLength(1)
    expect(assessCandidateReadiness(odsReference('Magnesium'))).toMatchObject({ score: null, status: 'Insufficient source coverage' })
  })

  it('maps source records to six independent layer interpretations without upgrading a match to verification', () => {
    const layers = sourceLayerInterpretations({
      researchCandidates: [
        { source: 'PubMed', searchClass: 'safety', title: 'Creatine safety review' },
        { source: 'ClinicalTrials.gov', resultsAvailable: true },
      ],
      registryMatches: [
        { source: 'Informed Sport' },
        { source: 'openFDA' },
        { source: 'NIH DSLD' },
      ],
      labelCandidateCount: 2,
      batchRecordCount: 0,
      cataloguePriceCount: 1,
    })
    expect(layers).toHaveLength(6)
    expect(layers.find((layer) => layer.layer === 'Product Quality').signal).toContain('1 Informed Sport')
    expect(layers.find((layer) => layer.layer === 'Batch Verification').signal).toBe('No batch-specific record found')
    expect(layers.find((layer) => layer.layer === 'Safety').interpretation).toContain('does not establish causality')
    expect(layers.find((layer) => layer.layer === 'Value').interpretation).toContain('cannot establish current price')
  })

  it('uses the four-domain weighted coverage formula and comparison thresholds', () => {
    expect(weightedCoverageScore({ evidence: 90, verification: 80, safety: 70, transparency: 70 })).toBe(80)
    const assessment = scoreInformationCoverage({
      researchCandidates: [{ source: 'PubMed', title: 'Systematic review, meta-analysis and randomized controlled trial', publicationTypes: ['Systematic Review', 'Meta-Analysis', 'Randomized Controlled Trial'], year: '2026', searchClass: 'safety', evidenceConsistencyReviewed: true }],
      registryMatches: [{ source: 'Informed Sport' }],
      productSources: [{ sourceType: 'NSF', url: 'https://example.org/nsf' }, { sourceType: 'GMP', url: 'https://example.org/gmp' }, { sourceType: 'Regulatory Safety Alert', url: 'https://example.org/alert' }],
      variants: [{ label_url: 'https://example.org/label', ingredient_count: 1, brand: 'Example', upc: '123', manufacturing_country: 'US', doseGuidance: true }],
      batchRecords: [{ certificate_url: 'https://example.org/coa', batch_number: 'LOT-1', status: 'Verified' }],
      warningPresent: true,
      currentDate: new Date('2026-10-01T00:00:00Z'),
    })
    expect(assessment.coverageScore).toBeGreaterThan(0)
    expect(assessment.layers.map((layer) => layer.label)).toEqual(['Ingredient Evidence', 'Product Verification', 'Batch Verification', 'Transparency', 'Safety Documentation', 'Value'])
    expect(assessment.layers.reduce((total, layer) => total + layer.weight, 0)).toBe(100)
    expect(assessment.layers.filter((layer) => layer.weight > 0).map((layer) => layer.weight)).toEqual([40, 15, 20, 25])
    expect(assessment.layers.find((layer) => layer.key === 'batchVerification').weight).toBe(0)
    expect(assessment.layers.find((layer) => layer.key === 'value').weight).toBe(0)
    expect(assessment.recommendation).toBe('Review Warning')
    expect(assessment.recommendationNote).toContain('explicit warning')
  })

  it('keeps missing safety information Unknown instead of turning it into a warning', () => {
    const assessment = scoreInformationCoverage({ sourceStatuses: { europePmc: 'fulfilled', pubmed: 'fulfilled', clinicalTrials: 'fulfilled' } })
    expect(assessment.layers.find((layer) => layer.key === 'safety')).toMatchObject({ score: 0, status: 'Unknown', tone: 'unknown' })
    expect(assessment.recommendation).toBe('Hold For Now')
    expect(assessment.recommendationNote).toContain('too little information')
  })

  it('uses directory matches as limited verification information without treating them as exact-product verification', () => {
    const assessment = scoreInformationCoverage({ registryMatches: [{ source: 'Informed Sport', role: 'Directory name candidate, not batch verification' }] })
    expect(assessment.layers.find((layer) => layer.key === 'productQuality')).toMatchObject({ score: 40, status: 'Limited Verification', tone: 'limited' })
    expect(assessment.layers.find((layer) => layer.key === 'value')).toMatchObject({ score: null, weight: 0, status: 'Unknown' })
    expect(assessment.recommendation).toBe('Hold For Now')
  })

  it('extracts OpenAlex and exact-barcode Open Food Facts candidates without claiming product certification', () => {
    const works = extractOpenAlexCandidates('Creatine Monohydrate', { results: [
      { id: 'https://openalex.org/W1', title: 'Creatine supplementation: a systematic review', publication_year: 2024, type: 'article', cited_by_count: 10 },
      { id: 'https://openalex.org/W2', title: 'Caffeine and cycling', publication_year: 2023 },
    ] })
    const facts = extractOpenFoodFactsCandidates('Creatine Monohydrate', [
      { requestedBarcode: '0706195000909', payload: { status: 1, product: { code: '706195000909', product_name: 'Creatine powder', brands: 'Example', ingredients_text: 'Creatine monohydrate', serving_size: '5 g' } } },
      { requestedBarcode: '456', payload: { status: 1, product: { code: '789', product_name: 'Unmatched product' } } },
    ])
    expect(works).toHaveLength(1)
    expect(works[0]).toMatchObject({ source: 'OpenAlex', year: 2024, publicationTypes: ['article'] })
    expect(facts).toHaveLength(1)
    expect(facts[0]).toMatchObject({ source: 'Open Food Facts', barcode: '706195000909', ingredientDisclosureAvailable: true, servingDisclosureAvailable: true })
    expect(facts[0].role).toContain('not quality')
  })

  it('finds only matching official NCCIH and OPSS reference pages and reads available safety sections', () => {
    const nccih = extractNccihCandidates('Ashwagandha', '<a href="/health/ashwagandha">Ashwagandha</a><a href="/health/ginger">Ginger</a><a href="https://example.org/health/ashwagandha">Ashwagandha external</a>')
    const opss = extractOpssCandidates('Creatine Monohydrate', '<a href="/article/creatine-supplements-basics">OPSS article about creatine</a><a href="/article/ashwagandha">Ashwagandha</a>')
    const details = extractOfficialReferenceDetails(nccih[0], '<h2>What Have We Learned?</h2><p>Evidence summary.</p><h2>What Do We Know About Safety?</h2><p>May interact with medicines. Avoid use during pregnancy. A dose of 300 mg was studied.</p>')
    expect(nccih).toHaveLength(1)
    expect(opss).toHaveLength(1)
    expect(details).toMatchObject({ evidenceInformationAvailable: true, safetySectionAvailable: true, interactionInfoAvailable: true, contraindicationInfoAvailable: true, dosageGuidanceAvailable: true })
  })

  it('matches professional ODS nutrient-family sheets and scores retrieved sections, not reference links', () => {
    const links = '<a href="/factsheets/VitaminD-Consumer/">Vitamin D</a><a href="/factsheets/VitaminD-HealthProfessional/">Vitamin D</a>'
    const candidates = extractOdsCandidates('Vitamin D3', links)
    expect(candidates).toHaveLength(1)
    expect(candidates[0].referenceScope).toBe('Vitamin D')
    const document = extractOfficialReferenceDetails(candidates[0], '<h2>Vitamin D and Health</h2><p>Research context.</p><h2>Health Risks from Excessive Vitamin D</h2><p>Excess intake can cause harm.</p><h2>Interactions with Medications</h2><p>Interactions are described.</p><h2>Recommended Intakes</h2><p>Intake table.</p>')
    const score = scoreInformationCoverage({ researchCandidates: [document] })
    expect(score.layers.find((layer) => layer.key === 'safety').score).toBe(70)
    expect(score.layers.find((layer) => layer.key === 'productQuality').score).toBe(0)
    expect(score.layers.find((layer) => layer.key === 'transparency').score).toBe(0)
    expect(scoreInformationCoverage({ researchCandidates: candidates }).layers.find((layer) => layer.key === 'safety').score).toBe(0)
  })

  it('maps OpenAlex, official safety pages and barcode label data to their intended coverage layers only', () => {
    const assessment = scoreInformationCoverage({
      researchCandidates: [
        { source: 'OpenAlex', title: 'Creatine systematic review', publicationTypes: ['review'], year: 2025 },
        { source: 'NCCIH', safetySectionAvailable: true, interactionInfoAvailable: true, contraindicationInfoAvailable: true, dosageGuidanceAvailable: true },
        { source: 'Open Food Facts', barcode: '123', brand: 'Example', url: 'https://world.openfoodfacts.org/product/123', ingredientDisclosureAvailable: true, manufacturingPlaces: 'US' },
      ],
      sourceStatuses: { openAlex: 'fulfilled' },
    })
    expect(assessment.layers.find((layer) => layer.key === 'ingredientEvidence').score).toBeGreaterThan(0)
    expect(assessment.layers.find((layer) => layer.key === 'safety').score).toBe(90)
    expect(assessment.layers.find((layer) => layer.key === 'transparency').score).toBe(35)
    expect(assessment.layers.find((layer) => layer.key === 'productQuality').score).toBe(0)
  })
})