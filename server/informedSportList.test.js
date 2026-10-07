import { expect, it } from 'vitest'
import { certifiedListRecords, certifiedListUrl } from './informedSportList.js'
import { extractSourceCoverage, scoreInformationCoverage } from './sourceCoverage.js'

it('discovers only the official generated certified-list download', () => {
  expect(certifiedListUrl('<a href="/sites/default/files/generated-pdf/file.pdf?v=123&amp;x=1">Download</a>')).toBe('https://sport.wetestyoutrust.com/sites/default/files/generated-pdf/file.pdf?v=123&x=1')
  expect(() => certifiedListUrl('<a href="https://example.org/generated-pdf/file.pdf">Download</a>')).toThrow()
})

it('retains dated PDF provenance and does not duplicate certification points', () => {
  const records = certifiedListRecords('October-2026\nCreatine Monohydrate\nBrand A\nProduct A\nProduct B\nProduct C\nProduct D\nProduct E\nProduct F\nProduct G\nProduct H', 'https://sport.wetestyoutrust.com/list.pdf', 'hash')
  expect(records[0]).toMatchObject({ certification_month: 'October-2026', document_hash: 'hash', product: 'Creatine Monohydrate' })
  const matches = extractSourceCoverage('Creatine Monohydrate', records.map((record) => ({ source: 'informed-sport-certified-list', payload: JSON.stringify(record) })))
  expect(matches).toHaveLength(1)
  const assessment = scoreInformationCoverage({ registryMatches: [...matches, { source: 'Informed Sport' }] })
  expect(assessment.layers.find((layer) => layer.key === 'productQuality').score).toBe(40)
  expect(() => certifiedListRecords('Undated list', 'url', 'hash')).toThrow()
})

it('ignores text-line matches from superseded PDF snapshots', () => {
  const records = [
    { source: 'informed-sport-certified-list', observedAt: '2026-09-01', payload: JSON.stringify({ product: 'Creatine Monohydrate' }) },
    { source: 'informed-sport-certified-list', observedAt: '2026-10-02', payload: JSON.stringify({ product: 'Whey Protein' }) },
  ]
  expect(extractSourceCoverage('Creatine Monohydrate', records)).toEqual([])
  expect(extractSourceCoverage('Whey Protein', records)).toHaveLength(1)
})