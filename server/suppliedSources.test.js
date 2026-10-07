import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { nsfListingRecords, suppliedPageCandidates, foodSafetyCampaignRecord } from './suppliedSources.js'
import { deduplicateResearchCandidates, extractSourceCoverage, scoreInformationCoverage } from './sourceCoverage.js'

it('extracts only official NSF product listings and deduplicates detail IDs', () => {
  const records = nsfListingRecords('<a href="listing-detail.php?id=123">Creatine Example</a><a href="listing-detail.php?id=123">Creatine Example</a><a href="https://example.org/listing-detail.php?id=45">External</a>', 'https://www.nsfsport.com/certified-products/search-results.php')
  expect(records).toHaveLength(1)
  expect(records[0].url).toBe('https://www.nsfsport.com/certified-products/listing-detail.php?id=123')
  expect(() => nsfListingRecords('Maintenance page', 'https://www.nsfsport.com/')).toThrow()
})

it('matches NSF product names, not brands, and counts certification providers separately', () => {
  const listings = nsfListingRecords('<a href="listing-detail.php?id=123"><p class="results__product-name">Creatine Monohydrate</p><p class="results__company-name">Iron Vegan</p></a>', 'https://www.nsfsport.com/certified-products/')
  const records = listings.map((listing) => ({ source: 'nsf-sport', payload: JSON.stringify(listing) }))
  expect(extractSourceCoverage('Iron', records)).toEqual([])
  const matches = extractSourceCoverage('Creatine Monohydrate', records)
  expect(scoreInformationCoverage({ registryMatches: matches }).layers.find((layer) => layer.key === 'productQuality').score).toBe(40)
  const combined = scoreInformationCoverage({ registryMatches: [...matches, { source: 'Informed Sport' }] })
  expect(combined.layers.find((layer) => layer.key === 'productQuality')).toMatchObject({ score: 80, status: 'Partially Verified' })
})

it('retains NSF information beyond the first twelve unrelated directory leads', () => {
  const records = Array.from({ length: 15 }, (_, index) => ({ source: 'informed-sport', payload: JSON.stringify({ product: `Creatine Monohydrate ${index}` }) }))
  records.push({ source: 'nsf-sport', payload: JSON.stringify({ productName: 'Creatine Monohydrate', title: 'Creatine Monohydrate', url: 'https://www.nsfsport.com/certified-products/listing-detail.php?id=123' }) })
  expect(extractSourceCoverage('Creatine Monohydrate', records).some((match) => match.source === 'NSF Certified for Sport')).toBe(true)
})

it('does not award points or a review warning for general EU campaign context', () => {
  const record = foodSafetyCampaignRecord('<body>Food safety includes traceability</body>', 'https://food.ec.europa.eu/food-safety/campaign-2026_en')
  const matches = extractSourceCoverage('Iron', [{ source: 'eu-food-safety-campaign', payload: JSON.stringify(record) }])
  expect(matches).toEqual([])
  expect(scoreInformationCoverage({ registryMatches: matches }).coverageScore).toBe(0)
})

it('keeps saved ODS findings dated, scoped and separate from product certification', () => {
  const analysis = JSON.parse(readFileSync(new URL('../reports/ods-supplied-page-analysis.json', import.meta.url), 'utf8'))
  expect(analysis.retrievalMethod).toContain('HTTP 403')
  expect(analysis.records.every((record) => record.ingredient && record.sourceUpdatedAt && new URL(record.url).hostname === 'ods.od.nih.gov')).toBe(true)
  expect(analysis.records.filter((record) => record.ingredient === 'Iron')).toHaveLength(2)
  expect(analysis.records.every((record) => !record.verified)).toBe(true)
})

it('merges dated analyses without growing shared research arrays on repeated requests', () => {
  const cached = [{ source: 'NIH ODS', url: 'https://ods.od.nih.gov/factsheets/Iron-Consumer/' }]
  const analysed = [{ ...cached[0], analysedAt: '2026-10-02', safetySectionAvailable: true }]
  const first = deduplicateResearchCandidates([...cached, ...analysed])
  const second = deduplicateResearchCandidates([...first, ...analysed])
  expect(cached).toEqual([{ source: 'NIH ODS', url: analysed[0].url }])
  expect(first).toHaveLength(1)
  expect(second).toEqual(first)
  expect(first[0].safetySectionAvailable).toBe(true)
})

it('limits dated ODS analyses to their stated ingredient and prevents verification/transparency inference', () => {
  const records = [{ source: 'ods-supplied-page-analysis', payload: JSON.stringify({ ingredient: 'Iron', safetySectionAvailable: true, interactionInfoAvailable: true, dosageGuidanceAvailable: true, url: 'https://ods.od.nih.gov/factsheets/Iron-Consumer/' }) }]
  expect(suppliedPageCandidates('Creatine Monohydrate', records)).toEqual([])
  const assessment = scoreInformationCoverage({ researchCandidates: suppliedPageCandidates('Iron', records) })
  expect(assessment.layers.find((layer) => layer.key === 'safety').score).toBe(70)
  expect(assessment.layers.find((layer) => layer.key === 'productQuality').score).toBe(0)
  expect(assessment.layers.find((layer) => layer.key === 'transparency').score).toBe(0)
})