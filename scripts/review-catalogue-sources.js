import Database from 'better-sqlite3'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assessmentReview } from '../server/assessmentReview.js'
import { extractSourceCoverage } from '../server/sourceCoverage.js'
import { suppliedPageCandidates } from '../server/suppliedSources.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const database = new Database(process.env.SUPPLEMENT_DB_PATH || path.join(root, 'server/supplements.db'), { readonly: true })
const products = database.prepare('SELECT id, name FROM products ORDER BY name').all()
const registry = database.prepare("SELECT source, payload, observed_at AS observedAt FROM ingestion_records WHERE source IN ('europepmc', 'dsld', 'openfda', 'informed-sport', 'informed-sport-certified-list', 'nsf-sport', 'ods-supplied-page-analysis')").all()
const snapshots = database.prepare('SELECT candidates, sources, checked_at AS checkedAt FROM ingredient_candidate_snapshots WHERE ingredient_name = ?')
const labels = database.prepare('SELECT brand, name, dsld_id, label_url FROM catalogue_product_variants WHERE parent_id = ?')
const entries = products.map((product) => {
  const snapshot = snapshots.get(product.name)
  const plan = assessmentReview({
    name: product.name,
    candidates: [...(snapshot ? JSON.parse(snapshot.candidates) : []), ...suppliedPageCandidates(product.name, registry)],
    sources: snapshot ? JSON.parse(snapshot.sources) : {},
    checkedAt: snapshot?.checkedAt || null,
    labels: labels.all(product.id),
    registry: extractSourceCoverage(product.name, registry),
  })
  return { catalogueEntry: product.name, ...plan, suppliedSourceFindings: suppliedPageCandidates(product.name, registry) }
})
database.close()

const output = path.join(root, 'reports/catalogue-assessment-review.json')
const report = {
  generatedAt: new Date().toISOString(),
  disclaimer: 'Title, directory and label matches are leads only. Assessment Pending is not a negative efficacy finding. No clinical recommendation, verified product, batch certification or numerical rating is inferred.',
  totals: {
    entries: entries.length,
    relevanceScreening: entries.filter((entry) => entry.reviewStage === 'Research relevance screening').length,
    sourceDiscovery: entries.filter((entry) => entry.reviewStage === 'Source discovery').length,
    withLabelLeads: entries.filter((entry) => entry.leads.labels.length).length,
    conditionalGoalLeads: entries.filter((entry) => entry.bestCase.goal).length,
    holdForNow: entries.filter((entry) => !entry.bestCase.goal).length,
    publishable: entries.filter((entry) => !entry.publicationBlocked).length,
  },
  entries,
}
mkdirSync(path.dirname(output), { recursive: true })
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ file: output, ...report.totals }))