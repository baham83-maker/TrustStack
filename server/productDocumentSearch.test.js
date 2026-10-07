import { expect, it } from 'vitest'
import { childFromLabel, directoryCandidates, documentedChildren, labelCandidates } from './productDocumentSearch.js'

it('keeps active DSLD label identifiers but excludes unrelated and off-market entries', () => {
  const result = labelCandidates('Creatine Monohydrate', { hits: [
    { _id: '12', _source: { fullName: 'Creatine Monohydrate', brandName: 'Sample', upcSku: '123' } },
    { _id: '13', _source: { fullName: 'Creatine Monohydrate', offMarket: 1 } },
    { _id: '14', _source: { fullName: 'Whey Protein' } },
  ] })
  expect(result).toHaveLength(1)
  expect(result[0]).toMatchObject({ type: 'Label candidate', id: 12, upc: '123', url: 'https://api.ods.od.nih.gov/dsld/v9/label/12' })
})

it('does not treat certification directory name matches as verified product or batch documents', () => {
  const result = directoryCandidates('Creatine Monohydrate', [
    { product: 'Creatine Monohydrate', brand: 'Sample', directory_url: 'https://example.org/list' },
    { product: 'Creatine HCl', brand: 'Sample' },
  ])
  expect(result).toHaveLength(1)
  expect(result[0]).toMatchObject({ type: 'Directory candidate', note: expect.stringContaining('not verified') })
  expect(directoryCandidates('Caffeine', [{ product: 'Zero Caffeine Gel' }, { product: 'Caffeine Tablets' }])).toHaveLength(1)
})

it('requires matching brand and product name before proposing a child record', () => {
  const labels = [{ brand: 'NOW Sports', title: 'Creatine Monohydrate', id: 23, url: 'https://example.org/23' },
    { brand: 'Other', title: 'Creatine Monohydrate', id: 24, url: 'https://example.org/24' }]
  const directory = [{ brand: 'NOW Foods', title: 'NOW Sports Creatine Monohydrate', url: 'https://example.org/directory' },
    { brand: 'Other', title: 'Creatine HCl', url: 'https://example.org/directory' }]
  expect(documentedChildren(labels, directory)).toEqual([])
  expect(documentedChildren(labels, [{ brand: 'NOW Sports', title: 'Creatine Monohydrate', url: 'https://example.org/directory' }]))
    .toMatchObject([{ labelId: 23, status: 'Candidate for identity review' }])
})

it('requires an on-market label with a manufacturer identifier, serving and ingredient data', () => {
  const parent = { id: 3, name: 'Alpha GPC' }
  const candidate = { id: 269275, brand: 'Nutricost', title: 'Alpha GPC 600 mg', url: 'https://api.ods.od.nih.gov/dsld/v9/label/269275' }
  const label = { id: 269275, fullName: candidate.title, brandName: candidate.brand, offMarket: 0,
    upcSku: '7 02669 93604 0', productVersionCode: '403043', servingSizes: [{ minQuantity: 2, maxQuantity: 2, unit: 'Capsule(s)' }], ingredientRows: [{ name: 'Alpha GPC' }] }
  expect(childFromLabel(parent, candidate, label)).toMatchObject({ upc: '702669936040', identityStatus: expect.stringContaining('pending review'), qualityStatus: 'Not verified' })
  expect(childFromLabel(parent, candidate, { ...label, offMarket: 1 })).toBeNull()
  expect(childFromLabel(parent, candidate, { ...label, brandName: 'Another brand' })).toBeNull()
  expect(childFromLabel(parent, candidate, { ...label, upcSku: '', productVersionCode: 'Not Present' })).toBeNull()
})