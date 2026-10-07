import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { childFromLabel } from '../server/productDocumentSearch.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const report = JSON.parse(readFileSync(path.join(root, 'reports/catalogue-document-candidates.json'), 'utf8'))
const database = new Database(process.env.SUPPLEMENT_DB_PATH || path.join(root, 'server/supplements.db'))
const insert = database.prepare(`INSERT OR IGNORE INTO catalogue_product_variants
  (parent_id, dsld_id, brand, name, upc, label_version, serving, ingredient_count,
    label_entry_date, label_url, identity_status, quality_status, region, added_at)
  VALUES (@parentId, @dsldId, @brand, @name, @upc, @labelVersion, @serving, @ingredientCount,
    @labelEntryDate, @labelUrl, @identityStatus, @qualityStatus, @region, @addedAt)`)
const existing = database.prepare('SELECT dsld_id AS dsldId, brand FROM catalogue_product_variants WHERE parent_id = ?')
const lookup = database.prepare('SELECT id, name FROM products WHERE id = ?')
let inserted = 0
let unavailable = 0

for (const entry of report.products) {
  const parent = lookup.get(entry.productId)
  if (!parent || parent.name !== entry.name) continue
  const selected = existing.all(parent.id)
  const brands = new Set(selected.map((item) => item.brand.toLowerCase()))
  for (const candidate of entry.labelCandidates) {
    if (selected.length >= 3) break
    if (brands.has(candidate.brand.toLowerCase())) continue
    try {
      const response = await fetch(candidate.url, { signal: AbortSignal.timeout(12000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const child = childFromLabel(parent, candidate, await response.json())
      if (!child) continue
      if (insert.run({ ...child, addedAt: new Date().toISOString() }).changes) {
        selected.push({ dsldId: child.dsldId, brand: child.brand })
        brands.add(child.brand.toLowerCase())
        inserted++
      }
    } catch (error) {
      unavailable++
      console.error(`${parent.name}: DSLD ${candidate.id} unavailable (${error.message})`)
    }
  }
  console.log(`${parent.name}: ${selected.length}/3 label-identified variants; quality not verified`)
}

const totals = database.prepare('SELECT COUNT(*) AS variants, COUNT(DISTINCT parent_id) AS entries FROM catalogue_product_variants').get()
database.close()
console.log(`Added ${inserted}; now ${totals.variants} variants across ${totals.entries} entries. ${unavailable} label requests failed. Scores and verified quality documents unchanged.`)