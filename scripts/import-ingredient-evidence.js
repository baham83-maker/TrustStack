import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateEvidenceProfile } from '../server/evidenceProfile.js'

const inputPath = process.argv[2]
if (!inputPath) { console.error('Usage: npm run import:ingredient-evidence -- /absolute/path/to/evidence-profile.json'); process.exit(1) }
let input
try { input = JSON.parse(readFileSync(inputPath, 'utf8')) } catch { console.error('Evidence profile input must be readable JSON.'); process.exit(1) }
const profile = validateEvidenceProfile(input)
if (!profile.publishable || !input.ingredient) {
  console.error(`Evidence profile is not publishable. Missing or invalid: ${profile.missing.join(', ') || 'ingredient'}`)
  process.exit(1)
}
const directory = path.dirname(fileURLToPath(import.meta.url))
const database = new Database(process.env.SUPPLEMENT_DB_PATH || path.join(directory, '../server/supplements.db'))
database.exec(`CREATE TABLE IF NOT EXISTS ingredient_evidence_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, ingredient_name TEXT NOT NULL, outcome TEXT NOT NULL, region TEXT NOT NULL, profile TEXT NOT NULL, reviewed_at TEXT NOT NULL, UNIQUE(ingredient_name, outcome, region))`)
if (!database.prepare('SELECT name FROM products WHERE name = ?').get(input.ingredient)) { database.close(); console.error('Ingredient is not in the catalogue.'); process.exit(1) }
database.prepare(`INSERT INTO ingredient_evidence_profiles (ingredient_name, outcome, region, profile, reviewed_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(ingredient_name, outcome, region) DO UPDATE SET profile = excluded.profile, reviewed_at = excluded.reviewed_at`).run(input.ingredient, profile.outcome, profile.region, JSON.stringify(profile), profile.reviewedAt)
database.close()
console.log(`${input.ingredient} · ${profile.outcome} · ${profile.region}: Ingredient Evidence Profile published; Product Trust and batch status unchanged.`)