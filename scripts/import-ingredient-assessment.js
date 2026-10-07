import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assessIngredient } from '../server/ingredientScoring.js'

const inputPath = process.argv[2]
if (!inputPath) {
  console.error('Usage: npm run import:ingredient -- /absolute/path/to/reviewed-assessment.json')
  process.exit(1)
}

let input
try { input = JSON.parse(readFileSync(inputPath, 'utf8')) } catch {
  console.error('Assessment input must be a readable JSON file.')
  process.exit(1)
}
const { ingredient, outcome, region, ingredientForm, doseRange, population, duration = '', dimensions, citations, evidenceProfile = {}, limitations = '', methodologyVersion = 'ITR-1.0', reviewer, reviewedAt, nextReviewAt = null } = input
const assessment = assessIngredient({ outcome, region, ingredientForm, doseRange, population, duration, dimensions, citations, evidenceProfile, limitations, methodologyVersion, reviewer, reviewedAt, nextReviewAt })
if (!ingredient || !Array.isArray(citations) || assessment.score === null || citations.length !== assessment.citations.length || !Number.isFinite(Date.parse(reviewedAt)) || Date.parse(reviewedAt) > Date.now() || (nextReviewAt && (!Number.isFinite(Date.parse(nextReviewAt)) || Date.parse(nextReviewAt) <= Date.parse(reviewedAt)))) {
  console.error('A catalogue ingredient, six assessed dimensions, form, dose, population, outcome, region, HTTPS citations, reviewer and valid review dates are required.')
  process.exit(1)
}

const directory = path.dirname(fileURLToPath(import.meta.url))
const database = new Database(process.env.SUPPLEMENT_DB_PATH || path.join(directory, '../server/supplements.db'))
for (const migration of [
  "ALTER TABLE ingredient_assessments ADD COLUMN context TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE ingredient_assessments ADD COLUMN evidence_profile TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE ingredient_assessments ADD COLUMN limitations TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE ingredient_assessments ADD COLUMN methodology_version TEXT NOT NULL DEFAULT 'ITR-1.0'",
  'ALTER TABLE ingredient_assessments ADD COLUMN next_review_at TEXT',
]) {
  try { database.exec(migration) } catch (error) { if (!error.message.includes('duplicate column name')) throw error }
}
const catalogueProduct = database.prepare('SELECT name FROM products WHERE name = ?').get(ingredient)
if (!catalogueProduct) {
  database.close()
  console.error('Ingredient is not in the catalogue.')
  process.exit(1)
}
database.prepare(`INSERT INTO ingredient_assessments (ingredient_name, outcome, region, dimensions, citations, reviewer, reviewed_at, context, evidence_profile, limitations, methodology_version, next_review_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(ingredient_name, outcome, region) DO UPDATE SET
    dimensions = excluded.dimensions, citations = excluded.citations, reviewer = excluded.reviewer, reviewed_at = excluded.reviewed_at,
    context = excluded.context, evidence_profile = excluded.evidence_profile, limitations = excluded.limitations,
    methodology_version = excluded.methodology_version, next_review_at = excluded.next_review_at`)
  .run(ingredient, outcome, region, JSON.stringify(dimensions), JSON.stringify(citations), reviewer, reviewedAt, JSON.stringify({ ingredientForm, doseRange, population, duration }), JSON.stringify(evidenceProfile), limitations, methodologyVersion, nextReviewAt)
database.close()
console.log(`${ingredient} · ${outcome} · ${region}: ingredient assessment ${assessment.score}/100 recorded; Product Trust unchanged.`)