import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { load } from 'cheerio'
import TrustProfileDetail from './TrustProfileDetail.jsx'
import CompareSummary from './CompareSummary.jsx'
import { sourceAvailabilitySummary } from './sourceSummary.js'
import { decisionUseCaseSummary, evidenceAnalysisSummary } from './decisionUseCase.js'

const entry = {
  id: 1,
  name: 'Algal Omega-3',
  categories: ['Essential Health Supplements'],
  sourceReview: {
    informationCoverageScore: 0,
    recommendationClass: 'Hold For Now',
    layerScores: [
      { key: 'ingredientEvidence', label: 'Ingredient Evidence', weight: 40, score: 0, status: 'Insufficient Evidence' },
      { key: 'productQuality', label: 'Product Verification', weight: 15, score: 0, status: 'Unverified' },
      { key: 'safety', label: 'Safety Documentation', weight: 25, score: 0, status: 'Unknown' },
      { key: 'transparency', label: 'Transparency', weight: 20, score: 0, status: 'Unknown' },
      { key: 'batchVerification', label: 'Batch Verification', weight: 0, score: 0, status: 'Batch Unknown' },
    ],
  },
}

function render(product, tab = 'overview') {
  return renderToStaticMarkup(<TrustProfileDetail product={product} tab={tab} setTab={() => {}} />)
}

describe('Trust Profile detail', () => {
  it('does not turn title-only source leads into a use-support conclusion or rely on a human-reviewed profile', () => {
    const product = { ...entry, sourceReview: { researchLeadCount: 2, researchLeads: [{ title: 'Creatine performance trial' }, { title: 'Creatine review' }] } }
    const result = decisionUseCaseSummary(product)
    expect(result.available).toContain('2 literature/trial records')
    expect(result.missing).toContain('study outcomes are not available')
    expect(result.next).toContain('Review linked sources')
    expect(result.sentenceCounts).toEqual({ available: 1, missing: 1, next: 1 })
    expect(decisionUseCaseSummary({ ...product, ingredientEvidenceProfile: { publishable: true, direction: 'Supports benefit' } })).toEqual(result)
  })

  it('reports an explicit use conclusion only when structured source results match an exact product', () => {
    const product = { ...entry, trustProfile: { productTransparencyProfile: { labelAvailable: true } }, sourceReview: { researchLeadCount: 3, productEvidenceFit: { status: 'Direct match', outcomeResultsMatched: true, conclusion: 'Source results support the defined use', summary: 'Results match the product record.' } } }
    expect(decisionUseCaseSummary(product)).toMatchObject({ tone: 'information', available: expect.any(String), missing: expect.any(String), next: expect.any(String), sentenceCounts: { available: 1, missing: 1, next: 1 } })
    expect(decisionUseCaseSummary({ ...product, trustProfile: { productTransparencyProfile: { labelAvailable: false } } }).tone).toBe('unknown')
  })

  it('derives the three evidence-analysis topics from source-registry interpretations and record gaps', () => {
    const product = {
      ...entry,
      sourceReview: {
        researchLeadCount: 4,
        officialReferences: [{ source: 'NIH ODS', title: 'Iron evidence overview', url: 'https://ods.od.nih.gov/iron', evidenceInformationAvailable: true, evidenceSummary: 'Defined-context evidence.' }],
        productLabelCandidates: [{ brand: 'Example', productName: 'Iron', labelUrl: 'https://example.org/label', matchScope: 'Candidate label; association pending review' }],
        registryMatches: [{ source: 'Informed Sport', title: 'Example Iron listing', url: 'https://sport.example.org/iron', role: 'PDF text-line candidate; brand unresolved' }],
        layerInterpretations: [{ layer: 'Ingredient Evidence', interpretation: 'Four research candidates are listed; study outcomes are not extracted.' }],
      },
    }
    const analysis = evidenceAnalysisSummary(product)
    expect(analysis.map(({ topic }) => topic)).toEqual(['Evidence strength', 'Product Fit', 'Information Risks'])
    expect(analysis[0].summary).toContain('study outcomes are not extracted')
    expect(analysis[1].summary).toContain('do not confirm this exact product')
    expect(analysis[2].summary).toContain('missing safety-specific records')
  })

  it('recognizes product fit only for a direct exact-label match with structured outcomes', () => {
    const product = {
      ...entry,
      trustProfile: { productTransparencyProfile: { labelAvailable: true } },
      sourceReview: {
        productEvidenceFit: { status: 'Direct match', outcomeResultsMatched: true, summary: 'Matched results are available for the defined use.' },
        structuredOutcomeResults: [{ outcome: 'Defined outcome', result: 'Reported result' }],
        officialReferences: [{ safetySectionAvailable: true }],
      },
      sourceContext: { 'health-canada': 1 },
    }
    const analysis = evidenceAnalysisSummary(product)
    expect(analysis[0].summary).toContain('Matched results are available')
    expect(analysis[1].summary).toContain('structured source match links the exact product')
    expect(analysis[2].summary).toContain('Personal suitability')
  })

  it('keeps the evidence analysis citation-free while retaining links in the Sources tab', () => {
    const product = { ...entry, sourceReview: { registryMatches: [{ source: 'NSF Certified for Sport', title: 'Klean Iron', url: 'https://www.nsfsport.com/certified-products/listing-detail.php?id=1825394', role: 'Named NSF directory listing; ingredient association is a name match, not exact-SKU certification' }] } }
    const overview = load(render(product))
    const sources = load(render(product, 'sources'))
    expect(overview('.tp-evidence-analysis a')).toHaveLength(0)
    expect(overview('.tp-evidence-analysis').text()).not.toContain('not exact-SKU certification')
    expect(sources('.tp-tab-section .tp-sources a').attr('href')).toBe('https://www.nsfsport.com/certified-products/listing-detail.php?id=1825394')
  })

  it('summarizes stored product-label candidates without treating them as confirmed product fit', () => {
    const product = { ...entry, sourceReview: { productLabelCandidates: [{ source: 'NIH DSLD', sourceId: 215623, brand: 'Woodstock Vitamins', productName: 'Easy Iron', serving: '1 Capsule', declaredIngredientCount: 1, region: 'US', labelVersion: 'Rev. 040815', upc: '669439773789', identityStatus: 'Label identified; catalogue association pending review', qualityStatus: 'Not verified', labelUrl: 'https://ods.od.nih.gov/dsld/v9/label/215623' }] } }
    const result = decisionUseCaseSummary(product)
    expect(result.available).toContain('1 product-label candidate')
    expect(result.available).not.toContain('Woodstock Vitamins')
    expect(result.available).not.toContain('serving 1 Capsule')
    expect(result.missing).toContain('exact product match is unconfirmed')
    expect(result.available).not.toContain('Woodstock Vitamins')
    expect(result.sentenceCounts).toEqual({ available: 1, missing: 1, next: 1 })
  })

  it('summarizes three label candidates alongside two official source summaries', () => {
    const candidates = Array.from({ length: 3 }, (_, index) => ({ brand: `Brand ${index + 1}`, productName: `Iron ${index + 1}`, serving: '1 Capsule', declaredIngredientCount: 1, sourceId: index + 1, identityStatus: 'Label identified; catalogue association pending review', qualityStatus: 'Not verified' }))
    const officialReferences = [{ title: 'ODS exercise page', evidenceSummary: 'Iron evidence details.', evidenceInformationAvailable: true }, { title: 'ODS consumer page', evidenceSummary: 'Iron intake details.', evidenceInformationAvailable: true }]
    const result = decisionUseCaseSummary({ ...entry, sourceReview: { researchLeadCount: 3, officialReferences, productLabelCandidates: candidates } })
    expect(result.available).toContain('3 product-label candidates')
    expect(result.available).not.toContain('Brand 1 Iron 1')
    expect(result.available).not.toContain('Brand 2 Iron 2')
    expect(result.sentenceCounts).toEqual({ available: 1, missing: 1, next: 1 })
  })

  it('compares concise information rows without prototype prices or efficacy rankings', () => {
    const html = renderToStaticMarkup(<CompareSummary products={[entry, { ...entry, id: 2, name: 'Iron' }]} onClose={() => {}} onInspect={() => {}} />)
    const $ = load(html)
    expect($('.cs-table tbody tr')).toHaveLength(8)
    expect($('.cs-table thead th')).toHaveLength(3)
    expect(html).toContain('What to check')
    expect(html).toContain('No safety documentation mapped')
    expect(html).toContain('No research records mapped')
    expect(html).toContain('Source records, not a reviewed benefit conclusion')
    expect(html).toContain('Full profile')
    expect(html).toContain('Source findings and limitations')
    expect(html).toContain('More coverage does not mean greater benefit or safety')
    expect(html).not.toContain('Product Trust')
    expect(html).not.toContain('cost per effective serving')
  })
  it('summarizes linked source counts in one factual sentence for cards and profiles', () => {
    const product = { ...entry, sourceReview: { ...entry.sourceReview, researchLeadCount: 3, registryMatchCount: 2, labelCandidateCount: 1, officialReferences: [{ safetySectionAvailable: true }] } }
    expect(sourceAvailabilitySummary(product)).toBe('Linked 3 research leads, 1 safety reference, 2 directory listings, 1 label candidate; an exact product label is not confirmed.')
    expect(sourceAvailabilitySummary(entry)).toBe('No research leads, safety references, label candidates, or directory listings are linked.')
  })
  it('uses source findings without inferring product-use support from ingredient summaries', () => {
    const product = { ...entry, sourceReview: { researchLeadCount: 12, researchLeads: [{ source: 'PubMed', title: 'Creatine trial title only' }], officialReferences: [{ title: 'Official ingredient guidance', url: 'https://example.org/ingredient-guidance', source: 'Official source', evidenceInformationAvailable: true, evidenceSummary: 'The source describes mixed findings for a defined ingredient context.' }] } }
    const result = decisionUseCaseSummary(product)
    expect(result.available).toContain('12 literature/trial records')
    expect(result.missing).toContain('study outcomes are not available')
    expect(result.missing).toContain('an exact product match is not established')
    expect(result.next).toContain('exact product match')
    expect(decisionUseCaseSummary({ ...product, ingredientEvidenceProfile: { publishable: true, direction: 'Supports benefit' } })).toEqual(result)
  })
  it('colors the five boxes from record counts, not evidence or safety conclusions', () => {
    const references = Array.from({ length: 3 }, (_, index) => ({ url: `https://example.org/safety-${index}`, safetySectionAvailable: true }))
    const $ = load(render({ ...entry, sourceReview: { ...entry.sourceReview, researchLeadCount: 3, labelCandidateCount: 1, registryMatches: [{ source: 'NSF' }, { source: 'Informed Sport' }, { source: 'COA' }], officialReferences: references } }))
    expect($('.tp-area-box').map((index, box) => $(box).attr('data-tone')).get()).toEqual(['information', 'partial', 'information', 'unknown', 'information'])
    expect($('.tp-area-status i[aria-hidden="true"]')).toHaveLength(5)
    expect($('.tp-area-box').eq(0).find('.tp-area-status').text()).toBe('Information available')
    expect($('.tp-area-box').eq(1).find('.tp-area-status').text()).toBe('Limited information available')
    expect($('.tp-area-box').eq(3).find('.tp-area-status').text()).toBe('Information unavailable')
  })
  it('keeps each information-box summary to one sentence', () => {
    const $ = load(render({ ...entry, sourceReview: { ...entry.sourceReview, researchLeadCount: 1, labelCandidateCount: 2, registryMatches: [{ source: 'NSF' }] } }))
    const notes = $('.tp-area-box p').map((index, paragraph) => $(paragraph).text()).get()
    expect(notes).toHaveLength(5)
    expect(notes.every((note) => (note.match(/[.!?](?=\s|$)/g) || []).length <= 1)).toBe(true)
  })
  it('shows connecting only for an active source state and warnings only for explicit warning records', () => {
    const connecting = load(render({ ...entry, sourceReview: { ...entry.sourceReview, sources: { europePmc: 'pending' } } }))
    expect(connecting('.tp-area-box').eq(0).find('.tp-area-status').text()).toBe('Sources being connected')
    const warning = load(render({ ...entry, sourceReview: { ...entry.sourceReview, researchLeadCount: 1, warningRecords: [{ warningIdentified: true, dimension: 'evidence', title: 'Official caution record' }] } }))
    expect(warning('.tp-area-box').eq(0).find('.tp-area-status').text()).toBe('Warning identified')
    const missingOnly = load(render(entry))
    expect(missingOnly('.tp-area-box').eq(0).find('.tp-area-status').text()).toBe('Information unavailable')
    expect(missingOnly('.tp-area-box').eq(0).attr('data-tone')).toBe('unknown')
  })
  it('places the five areas after the tabs and stacks missing information below sidebar coverage', () => {
    const $ = load(render(entry))
    expect($('.tp-tabs').next().hasClass('tp-information-areas')).toBe(true)
    expect($('.tp-main .tp-information-areas .tp-area-box')).toHaveLength(5)
    expect($('.tp-layout > .tp-main > .tp-review-banner')).toHaveLength(1)
    expect($('.tp-layout > .tp-sidebar > .tp-coverage')).toHaveLength(1)
    expect($('.tp-coverage-ring')).toHaveLength(1)
    expect($('.tp-coverage').next().hasClass('tp-unknown')).toBe(true)
    expect($('.tp-overview-grid > section')).toHaveLength(2)
    expect($('.tp-overview-grid > .tp-information').next().hasClass('tp-evidence-analysis')).toBe(true)
    expect($('.tp-unknown').next().hasClass('tp-next')).toBe(true)
    expect($('.tp-sidebar > .tp-next')).toHaveLength(1)
  })
  it('renders all six section tabs, the overview and a truthful empty state', () => {
    const html = render(entry)
    expect(html.match(/role="tab" /g)).toHaveLength(6)
    expect(html).toContain('Key information')
    expect(html).toContain('What We know from the Evidence')
    expect(html).toContain('Evidence strength')
    expect(html).toContain('Product Fit')
    expect(html).toContain('Information Risks')
    expect(html).toContain('Profile information areas')
    expect(html.match(/class="tp-area-box"/g)).toHaveLength(5)
    expect(html).toContain('Product transparency')
    expect(html).toContain('Safety information')
    expect(html).toContain('Regulatory status')
    expect(html).toContain('Decision Use-Case')
    expect(html).toContain('Next steps')
    expect(html).toContain('Information unavailable')
    expect(html).not.toContain('Assessment Pending')
    expect(html).toContain('What information is available:')
    expect(html).toContain('What important information is missing:')
    expect(html).toContain('What the user should consider next:')
    const $ = load(html)
    const answers = $('.tp-use-case > div > p').map((index, paragraph) => $(paragraph).text()).get()
    expect(answers).toHaveLength(3)
    expect(answers.every((answer) => (answer.match(/[.!?](?=\s|$)/g) || []).length === 1)).toBe(true)
    expect($('.tp-use-case > div > h3').text()).toBe('Decision Use-Case')
    expect(html).not.toContain('Assessment not ready')
    expect(html).not.toContain('Evidence assessment not started')
    expect(html).not.toContain('Hold For Now')
    expect(html).not.toContain('Well Characterised')
    expect(html).not.toContain('Mixed Evidence')
    expect(html).toContain('Information unavailable')
    expect(html).not.toContain('Information status')
    expect(html).toContain('0 of 5 source areas have linked records')
    expect(html).not.toContain('review in progress')
    expect(html).not.toContain('0.32')
    expect(html).toContain('Batch verification is not provided by TrustStack')
  })

  it('preserves dated ingredient source findings and retrieval caveats in the sources tab', () => {
    const html = render({ ...entry, name: 'Iron', sourceReview: { ...entry.sourceReview, officialReferences: [{ source: 'NIH ODS', title: 'Iron consumer guidance', url: 'https://ods.od.nih.gov/factsheets/Iron-Consumer/', sourceUpdatedAt: '2023-08-17', analysedAt: '2026-10-02', evidenceSummary: 'Deficiency-specific evidence.', safetySummary: 'Overdose and medicine-interaction documentation.', retrievalMethod: 'Tool analysis; direct retrieval returned HTTP 403.' }] } }, 'sources')
    expect(html).toContain('2023-08-17')
    expect(html).toContain('2026-10-02')
    expect(html).toContain('HTTP 403')
    expect(html).toContain('Overdose and medicine-interaction documentation.')
    expect(html).toContain('Information coverage by area')
    expect(html).toContain('40% coverage weight')
    expect(html).not.toContain('<small>0% coverage weight')
  })

  it('states that TrustStack maps records without assessing safety or regulatory approval', () => {
    expect(render(entry, 'safety')).toContain('TrustStack does not assess safety')
    expect(render(entry, 'regulatory')).toContain('TrustStack does not assess regulatory approval')
  })

  it('maps information coverage to the named bands without changing the weighted percentage', () => {
    const html = render({ ...entry, sourceReview: { ...entry.sourceReview, informationCoverageScore: 66, researchLeadCount: 3, registryMatches: [{ source: 'NSF' }] } })
    expect(html).toContain('66%')
    expect(html).toContain('Moderate coverage')
    expect(html).toContain('2 of 5 source areas have linked records')
  })

  it('does not label unmatched product-label candidates as high transparency', () => {
    const html = render({ ...entry, sourceReview: { ...entry.sourceReview, labelCandidateCount: 4 } })
    const $ = load(html)
    expect($('.tp-area-box').eq(1).find('.tp-area-status').text()).toBe('Limited information available')
    expect($('.tp-area-box').eq(1).text()).toContain('4 label candidates are linked; the exact product is unconfirmed.')
  })
})