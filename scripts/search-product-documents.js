import Database from 'better-sqlite3'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { directoryCandidates, documentedChildren, labelCandidates } from '../server/productDocumentSearch.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const database = new Database(process.env.SUPPLEMENT_DB_PATH || path.join(root, 'server/supplements.db'), { readonly: true })
const products = database.prepare('SELECT id, name, brand, status FROM products ORDER BY name').all()
const directoryRecords = database.prepare("SELECT payload, observed_at FROM ingestion_records WHERE source = 'informed-sport'").all()
  .flatMap((row) => {
    try { return [{ ...JSON.parse(row.payload), observedAt: row.observed_at }] } catch { return [] }
  })
database.close()

const results = []
for (const product of products) {
  const url = new URL('https://api.ods.od.nih.gov/dsld/v9/search-filter')
  url.searchParams.set('q', `"${product.name}"`)
  url.searchParams.set('status', '1')
  url.searchParams.set('size', '100')
  const directory = directoryCandidates(product.name, directoryRecords, 100)
  let labels = []
  let labelStatus = 'Unavailable'
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    labels = labelCandidates(product.name, await response.json(), 100)
    labelStatus = 'Checked'
  } catch (error) {
    labelStatus = `Unavailable: ${error.message}`
  }
  const children = documentedChildren(labels, directory)
  results.push({ productId: product.id, name: product.name, catalogueBrand: product.brand,
    matchStatus: 'Candidates only - no verified brand, SKU, formulation or batch association',
    labelStatus, labelCandidates: labels.slice(0, 5), qualityDirectoryCandidates: directory.slice(0, 5), documentedChildCandidates: children,
    qualityDocumentsVerified: 0 })
  console.log(`${results.length}/${products.length} ${product.name}: ${labels.length} labels, ${directory.length} directory names, ${children.length} matching pairs; ${labelStatus}`)
}

const report = { searchedAt: new Date().toISOString(),
  scope: 'Catalogue ingredient/category names, not identified branded SKUs',
  sources: ['NIH DSLD v9 search-filter (on-market labels)', 'Existing Informed Sport directory snapshot'],
  disclaimer: 'A DSLD label is self-reported label content, not an independent quality test. A directory name match is not a certificate for the catalogue product or its batch. No scores or verified source records were changed.',
  totals: { products: results.length, withLabelCandidates: results.filter((item) => item.labelCandidates.length).length,
    withDirectoryCandidates: results.filter((item) => item.qualityDirectoryCandidates.length).length,
    labelSearchFailures: results.filter((item) => item.labelStatus !== 'Checked').length,
    entriesWithPairedCandidates: results.filter((item) => item.documentedChildCandidates.length).length,
    verifiedQualityDocuments: 0 }, products: results }
const output = path.join(root, 'reports/catalogue-document-candidates.json')
mkdirSync(path.dirname(output), { recursive: true })
writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(`Report: ${output}`)
console.log(JSON.stringify(report.totals))