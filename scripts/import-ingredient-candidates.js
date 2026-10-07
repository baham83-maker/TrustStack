import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = path.dirname(fileURLToPath(import.meta.url))
const database = new Database(process.env.SUPPLEMENT_DB_PATH || path.join(directory, '../server/supplements.db'))
const api = process.env.SUPPLEMENT_API_URL || 'http://localhost:54321'

database.exec(`CREATE TABLE IF NOT EXISTS ingredient_candidate_snapshots (
  ingredient_name TEXT PRIMARY KEY,
  candidates TEXT NOT NULL,
  sources TEXT NOT NULL,
  checked_at TEXT NOT NULL
)`)

const pending = database.prepare(`SELECT id, name FROM products
  WHERE name NOT IN (SELECT ingredient_name FROM ingredient_assessments)
  ORDER BY name`).all()
const save = database.prepare(`INSERT INTO ingredient_candidate_snapshots (ingredient_name, candidates, sources, checked_at)
  VALUES (?, ?, ?, ?) ON CONFLICT(ingredient_name) DO UPDATE SET
  candidates = excluded.candidates, sources = excluded.sources, checked_at = excluded.checked_at`)
let imported = 0
let failed = 0

for (const product of pending) {
  try {
    const response = await fetch(`${api}/api/products/${product.id}/source-coverage?refresh=true`, { signal: AbortSignal.timeout(60000) })
    if (!response.ok) throw new Error(`API returned ${response.status}`)
    const coverage = await response.json()
    if (coverage.product !== product.name || !Array.isArray(coverage.research?.candidates)) throw new Error('Unexpected source coverage response')
    save.run(product.name, JSON.stringify(coverage.research.candidates), JSON.stringify(coverage.research.sources || {}), coverage.research.checkedAt || new Date().toISOString())
    imported++
    console.log(`${imported + failed}/${pending.length} ${product.name}: ${coverage.research.candidates.length} candidates; rating unchanged`)
  } catch (error) {
    failed++
    console.error(`${imported + failed}/${pending.length} ${product.name}: ${error.message}`)
  }
}

database.close()
console.log(`Imported ${imported}/${pending.length} candidate snapshots; ${failed} failed. No ingredient or product scores were changed.`)
if (failed) process.exitCode = 1