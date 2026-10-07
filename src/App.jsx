import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { analyseStack } from './stackAnalysis.js'
import SourceCoveragePanel from './SourceCoveragePanel.jsx'
import ProductVariantsPanel from './ProductVariantsPanel.jsx'
import TrustProfileDetail from './TrustProfileDetail.jsx'
import CompareSummary from './CompareSummary.jsx'
import { sourceAvailabilitySummary } from './sourceSummary.js'
import { catalogueGroups, matchesCatalogueCategory, matchesCatalogueOutcome, matchesCatalogueView } from '../server/catalogue.js'

const metricConfig = [
  ['Evidence', 'evidence', '◎'],
  ['Safety', 'safety', '✚'],
  ['Quality', 'quality', '◇'],
  ['Transparency', 'transparency', '≡'],
  ['Regulatory', 'regulatory', '§'],
  ['Contamination', 'contamination', '△'],
  ['Value', 'value', '£'],
]

const tabs = [
  ['dashboard', 'Dashboard'],
  ['goals', 'My Goals'],
  ['decisions', 'Analyst prototype'],
  ['ratings', 'Trust Profiles'],
  ['methodology', 'Methodology'],
  ['regulatory', 'Regulatory data'],
  ['sources', 'Source registry'],
  ['evidence', 'Evidence & Provenance'],
]

const sourceRegistry = [
  { name: 'NIH DSLD', scope: 'Labels, ingredients and serving information', status: 'Approved for adapter', licence: 'Public US government data' },
  { name: 'Europe PMC', scope: 'Peer-reviewed evidence and study metadata', status: 'Live on-demand adapter', licence: 'Per-record licence check' },
  { name: 'PubMed E-Utilities', scope: 'Indexed biomedical literature metadata', status: 'Live on-demand adapter', licence: 'NCBI usage policy and per-record terms' },
  { name: 'ClinicalTrials.gov', scope: 'Trial registration, design, status and results availability', status: 'Live on-demand adapter', licence: 'Public US government data' },
  { name: 'NIH ODS Fact Sheets', scope: 'Government-reviewed nutrient evidence, safety and interaction context', status: 'Live on-demand adapter', licence: 'Public US government content; review attribution requirements' },
  { name: 'PubChem PUG REST', scope: 'Chemical identity, formula, molecular weight and identifiers', status: 'Live on-demand adapter', licence: 'Public NCBI data and usage policy' },
  { name: 'openFDA CAERS', scope: 'Adverse event and safety signals', status: 'Approved for adapter', licence: 'Public FDA data' },
  { name: 'UK Food Standards Agency', scope: 'UK food alerts and regulatory notices', status: 'Approved adapter', licence: 'Open Government Licence v3' },
  { name: 'Health Canada LNHPD', scope: 'Licensed natural health product records', status: 'Approved adapter', licence: 'Government dataset terms' },
  { name: 'NHS website content', scope: 'General health guidance and public health context', status: 'Approved with OGL conditions', licence: 'Open Government Licence v3 · attribution and refresh required' },
  { name: 'EFSA OpenFoodTox', scope: 'Chemical hazards, reference values and genotoxicity context', status: 'Approved with dataset review', licence: 'European Data Portal / Zenodo distribution · verify dataset terms' },
  { name: 'Informed Sport', scope: 'Athlete-focused banned-substance batch certification', status: 'Public directory · permission required', licence: 'Public directory evidence · no public API or reuse licence verified' },
]

const decisionStyles = `.decision-layout{display:grid;gap:16px}.decision-hero,.decision-card{padding:22px}.decision-hero{background:linear-gradient(125deg,var(--surface),color-mix(in srgb,var(--primary) 12%,var(--surface)))}.decision-hero h2{font:700 30px 'Space Grotesk',sans-serif;margin:7px 0}.decision-hero p{color:var(--muted);line-height:1.6}.decision-gate{display:inline-block;padding:7px 11px;border-radius:999px;font-size:11px;font-weight:700}.decision-gate.good{background:#d9f7e9;color:#08704e}.decision-gate.watch{background:#fff2d8;color:#8a5600}.decision-gate.risk{background:#fde4e2;color:#a52f28}.decision-card h3{font:600 19px 'Space Grotesk',sans-serif;margin:7px 0 12px}.decision-form,.monitor-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.decision-form label,.monitor-grid label{display:grid;gap:6px;color:var(--muted);font-size:12px;font-weight:700}.decision-form input,.decision-form select,.monitor-grid input,.monitor-grid select{width:100%;padding:10px 11px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--text)}.metric-inline{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--line);color:var(--muted)}.metric-inline strong{font:700 22px 'Space Grotesk',sans-serif}.source-evidence-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.source-evidence-grid div{display:grid;gap:6px;padding:12px;border:1px solid var(--line);border-radius:11px;background:var(--surface2)}.source-evidence-grid b{font:600 13px 'Space Grotesk',sans-serif}.source-evidence-grid span{color:var(--muted);font-size:12px}.stack-list{display:grid;gap:8px}.stack-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid var(--line);border-radius:11px;background:var(--surface2)}.stack-item b,.stack-item small{display:block}.stack-item small{color:var(--muted);font-size:11px;margin-top:3px}.stack-item>span:last-child{font-size:11px;font-weight:700;text-align:right}.explorer{display:grid;gap:12px;margin:16px 0}.explorer-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:12px}.explorer-heading h3{margin:5px 0 0;font:700 24px 'Space Grotesk',sans-serif}.explorer-heading p{margin:0;color:var(--muted);font-size:12px}.explorer-groups{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.explorer-group{padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}.explorer-group h4{margin:0 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}.explorer-card{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:11px;margin-top:8px;border:1px solid var(--line);border-radius:11px;background:var(--surface2);color:var(--text);text-align:left;cursor:pointer}.explorer-card:hover,.explorer-card.selected{border-color:var(--primary)}.explorer-card b,.explorer-card small{display:block}.explorer-card small{color:var(--muted);font-size:11px;margin-top:3px}.explorer-score{font:700 20px 'Space Grotesk',sans-serif}.compare-tray{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:11px 14px;border:1px solid var(--primary);border-radius:12px;background:color-mix(in srgb,var(--primary) 8%,var(--surface))}.compare-tray button{border:0;background:transparent;color:var(--text);cursor:pointer}.compare-tray strong{font-size:12px}.compare-table{overflow-x:auto}.compare-table table{width:100%;border-collapse:collapse}.compare-table th,.compare-table td{padding:9px;border-bottom:1px solid var(--line);text-align:left;font-size:12px}.compare-table th{color:var(--muted);text-transform:uppercase;font-size:10px}@media(max-width:1050px){.explorer-groups{grid-template-columns:repeat(2,1fr)}}@media(max-width:720px){.decision-form,.monitor-grid,.source-evidence-grid,.explorer-groups{grid-template-columns:1fr}.decision-hero,.decision-card{padding:17px}}`
const legacyDecisionStyles = `.legacy-product-list{display:none}.decision-layout{display:grid;gap:16px}.decision-hero,.decision-card{padding:22px}.decision-hero{background:linear-gradient(125deg,var(--surface),color-mix(in srgb,var(--primary) 12%,var(--surface)))}.decision-hero h2{font:700 30px 'Space Grotesk',sans-serif;margin:7px 0}.decision-hero p{color:var(--muted);line-height:1.6}.decision-gate{display:inline-block;padding:7px 11px;border-radius:999px;font-size:11px;font-weight:700}.decision-gate.good{background:#d9f7e9;color:#08704e}.decision-gate.watch{background:#fff2d8;color:#8a5600}.decision-gate.risk{background:#fde4e2;color:#a52f28}.decision-card h3{font:600 19px 'Space Grotesk',sans-serif;margin:7px 0 12px}.decision-form,.monitor-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.decision-form label,.monitor-grid label{display:grid;gap:6px;color:var(--muted);font-size:12px;font-weight:700}.decision-form input,.decision-form select,.monitor-grid input,.monitor-grid select{width:100%;padding:10px 11px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--text)}.metric-inline{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--line);color:var(--muted)}.metric-inline strong{font:700 22px 'Space Grotesk',sans-serif}.source-evidence-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.source-evidence-grid div{display:grid;gap:6px;padding:12px;border:1px solid var(--line);border-radius:11px;background:var(--surface2)}.source-evidence-grid b{font:600 13px 'Space Grotesk',sans-serif}.source-evidence-grid span{color:var(--muted);font-size:12px}.stack-list{display:grid;gap:8px}.stack-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid var(--line);border-radius:11px;background:var(--surface2)}.stack-item b,.stack-item small{display:block}.stack-item small{color:var(--muted);font-size:11px;margin-top:3px}.stack-item>span:last-child{font-size:11px;font-weight:700;text-align:right}.explorer{display:grid;gap:12px;margin:16px 0}.explorer-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:12px}.explorer-heading h3{margin:5px 0 0;font:700 24px 'Space Grotesk',sans-serif}.explorer-heading p{margin:0;color:var(--muted);font-size:12px}.explorer-groups{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.explorer-group{padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}.explorer-group h4{margin:0 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}.explorer-card{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:11px;margin-top:8px;border:1px solid var(--line);border-radius:11px;background:var(--surface2);color:var(--text);text-align:left;cursor:pointer}.explorer-card:hover,.explorer-card.selected{border-color:var(--primary)}.explorer-card b,.explorer-card small{display:block}.explorer-card small{color:var(--muted);font-size:11px;margin-top:3px}.explorer-score{font:700 20px 'Space Grotesk',sans-serif}.compare-tray{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:11px 14px;border:1px solid var(--primary);border-radius:12px;background:color-mix(in srgb,var(--primary) 8%,var(--surface))}.compare-tray button{border:0;background:transparent;color:var(--text);cursor:pointer}.compare-tray strong{font-size:12px}.compare-table{overflow-x:auto}.compare-table table{width:100%;border-collapse:collapse}.compare-table th,.compare-table td{padding:9px;border-bottom:1px solid var(--line);text-align:left;font-size:12px}.compare-table th{color:var(--muted);text-transform:uppercase;font-size:10px}@media(max-width:1050px){.explorer-groups{grid-template-columns:repeat(2,1fr)}}@media(max-width:720px){.decision-form,.monitor-grid,.source-evidence-grid,.explorer-groups{grid-template-columns:1fr}.decision-hero,.decision-card{padding:17px}}`

const outcomeOptions = [
  ['all', 'All Best Suited Outcomes'],
  ['sleep', 'Sleep'],
  ['muscle-growth', 'Muscle growth'],
  ['performance', 'Strength & performance'],
  ['heart-health', 'Cholesterol/heart health'],
  ['stress', 'Anxiety & stress'],
  ['joint-health', 'Joint health'],
  ['blood-pressure', 'Blood pressure'],
  ['immune', 'Immune support'],
  ['cognitive', 'Cognitive function'],
  ['bone-health', 'Bone health'],
  ['digestive', 'Digestive health'],
  ['energy', 'Energy & fatigue'],
  ['verified-formulation', 'Verified formulation only'],
]

const productStatusOptions = [
  ['view-recommended', 'All entries'],
  ['view-evidence-reviewed', 'Evidence complete'],
  ['view-evidence-published', 'Published evidence'],
  ['view-evidence-insufficient', 'Insufficient evidence'],
  ['view-evidence-mixed', 'Mixed evidence'],
  ['view-evidence-review', 'Evidence under review'],
  ['view-label-candidates', 'Label candidates'],
  ['view-athlete-verified', 'Informed Sport Certified'],
]

const ageOptions = [
  ['all', 'All age groups'],
  ['Children', 'Children'],
  ['Teens', 'Teens'],
  ['Adults', 'Adults'],
  ['older adults', 'Older adults'],
]

function scoreTone(value, inverse = false) {
  const score = inverse ? 100 - value : value
  return score >= 80 ? 'good' : score >= 60 ? 'watch' : 'risk'
}

function productRating(score) {
  if (score >= 80) return ['High', 'good']
  if (score >= 60) return ['Medium', 'watch']
  return ['Low', 'risk']
}

function contaminationBand(value) {
  return value <= 25 ? ['Low', 'good'] : value <= 50 ? ['Moderate', 'watch'] : value <= 75 ? ['High', 'risk'] : ['Critical', 'risk']
}

function regulatoryBand(score) {
  if (score >= 90) return ['Approved health claim / positive listing', 'good']
  if (score >= 70) return ['Permitted / listed, no specific claim', 'good']
  if (score >= 40) return ['No formal review / novel', 'watch']
  if (score >= 20) return ['Warning issued / under review', 'risk']
  return ['Banned or rejected claim', 'risk']
}

const regulatoryFramework = [
  ['Approved health claim / positive listing', 100],
  ['Permitted / listed, no specific claim', 70],
  ['No formal review / novel', 40],
  ['Warning issued / under review', 20],
  ['Banned or rejected claim', 0],
]

function Metric({ label, value, icon, inverse }) {
  const tone = scoreTone(value, inverse)
  return <article className="metric"><div className="metric-label"><span>{label}</span><span className="metric-icon">{icon}</span></div><strong className={tone}>{value}</strong><div className="meter"><span className={tone} style={{ width: `${inverse ? 100 - value : value}%` }} /></div></article>
}

function ProductExplorer({ products, selected, selectedId, onSelect, compare, onCompare }) {
  const groups = [
    ['Recommended', products.filter((product) => product.score >= 80)],
    ['Worth a closer look', products.filter((product) => product.score >= 60 && product.score < 80)],
    ['Needs verification', products.filter((product) => product.score < 60)],
  ]
  return <section className="explorer"><div className="explorer-heading"><div><span className="section-kicker">Decision-oriented catalogue</span><h3>Find a product to inspect</h3><p>{products.length} products ranked by trust score and current recommendation state.</p></div><span className="badge">{compare.length}/4 selected for comparison</span></div><div className="explorer-groups">{groups.map(([label, items]) => <div className="explorer-group" key={label}><h4>{label} · {items.length}</h4>{items.slice(0, 6).map((product) => <button className={product.id === selectedId ? 'explorer-card selected' : 'explorer-card'} key={product.id} onClick={() => onSelect(product)}><span><b>{product.name}</b><small>{product.brand} · {product.bestFor}</small></span><strong className={`explorer-score ${scoreTone(product.score)}`}>{product.score}</strong><input type="checkbox" aria-label={`Compare ${product.name}`} checked={compare.some((item) => item.id === product.id)} disabled={!compare.some((item) => item.id === product.id) && compare.length >= 4} onClick={(event) => event.stopPropagation()} onChange={() => onCompare(product)} /></button>)}</div>)}</div>{compare.length ? <div className="compare-tray"><strong>Compare selected:</strong>{compare.map((product) => <button key={product.id} onClick={() => onCompare(product)}>{product.name} ×</button>)}<span className="muted">Use the comparison table below to compare trust, safety, evidence and value.</span></div> : null}{compare.length > 1 ? <div className="panel compare-table"><table><thead><tr><th>Product</th><th>Trust</th><th>Evidence</th><th>Safety</th><th>Quality</th><th>Transparency</th><th>Regulatory</th><th>Value</th></tr></thead><tbody>{compare.map((product) => <tr key={product.id}><td><b>{product.name}</b></td><td className={scoreTone(product.score)}>{product.score}</td><td className={scoreTone(product.evidence)}>{product.evidence}</td><td className={scoreTone(product.safety)}>{product.safety}</td><td className={scoreTone(product.regulatory)}>{product.regulatory}</td><td className={scoreTone(product.value)}>{product.value}</td></tr>)}</tbody></table></div> : null}</section>
}

function SourceFeedback({ product, inline = false }) {
  if (!product || !inline) return null
  const context = product.sourceContext || {}
  const athleteNote = context.informedSportMatches > 0
    ? 'Informed Sport directory match found; verify the current batch before competition use.'
    : 'No product-specific Informed Sport match found; athletes should verify the exact product and batch manually.'
  return <div className="source-feedback" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', maxWidth: '1320px', margin: '16px auto 0', padding: '0 22px' }}><div className="source-feedback-card panel" style={{ padding: '16px 18px' }}><span className="section-kicker">Decision note · live analysis</span><p>{product.decisionNote || product.recommendation}</p></div><div className="source-feedback-card panel" style={{ padding: '16px 18px' }}><span className="section-kicker">Risk intelligence · live analysis</span><p>{product.riskFeedback || athleteNote}</p><small>Source coverage: {context.europepmc || 0} evidence · {context.openfda || 0} FDA safety · {context['efsa-openfoodtox'] || 0} EFSA · {context['uk-fsa'] || 0} UK FSA · {context['health-canada'] || 0} Health Canada.</small></div></div>
}

function DecisionRiskPanels({ product }) {
  const target = typeof document !== 'undefined' ? document.querySelector('.workspace .details > .two-col') : null
  const context = product.sourceContext || {}
  const evidenceProfile = product.evidenceProfile || {}
  const evidenceCount = context.europepmc || 0
  const safetyCount = context.openfda || 0
  const regulatoryCount = (context['efsa-openfoodtox'] || 0) + (context['uk-fsa'] || 0) + (context['health-canada'] || 0)
  const confidence = evidenceProfile.confidence ? `${evidenceProfile.confidence} confidence` : evidenceCount && safetyCount ? 'Moderate source coverage' : 'Limited source coverage'
  const confidenceChange = evidenceProfile.confidenceChange
  const recommendation = product.score >= 80 ? 'Strong catalogue candidate' : product.score >= 60 ? 'Consider with conditions' : 'Further review required'
    const riskItems = [
    [`Evidence coverage: ${evidenceCount ? `${evidenceCount} linked record(s)` : 'No product-specific linked record'}`, evidenceCount ? 'good' : 'watch'],
    [`Evidence direction: ${evidenceProfile.direction || 'Not assessed'}`, evidenceProfile.direction === 'Supportive' ? 'good' : 'watch'],
    [`Safety coverage: ${safetyCount ? `${safetyCount} linked FDA record(s)` : 'No product-specific linked record'}`, safetyCount ? 'good' : 'watch'],
    [`Regulatory coverage: ${regulatoryCount ? `${regulatoryCount} linked record(s)` : 'No linked UK FSA, Health Canada or EFSA record'}`, regulatoryCount ? 'good' : 'watch'],
    [`Contamination signal: ${contaminationBand(product.contamination)[0]} (${product.contamination}/100)`, contaminationBand(product.contamination)[1]],
    [`Dose: ${evidenceProfile.doseStatus || 'Not verified'}`, 'watch'],
    [`Formulation: ${evidenceProfile.formulationStatus || 'Not verified'}`, 'watch'],
    [`Interaction review: ${evidenceProfile.interactionStatus || 'Not captured'}`, 'watch'],
    [`Population caution: ${evidenceProfile.populationWarnings || 'Not captured'}`, 'watch'],
    [context.informedSportMatches ? 'Athlete certification match found; verify the current batch' : 'Athlete certification not verified for this product', context.informedSportMatches ? 'watch' : 'watch'],
      [`Age context: ${product.ageGroups || 'Adults'} · ${product.ageCautions || 'Confirm age-specific suitability.'}`, 'watch'],
  ]
  if (!target) return null
  return createPortal(<><section className="panel recommendation structured-intelligence-card"><span className="section-kicker">Decision note</span><h3>{recommendation}</h3><p><b>Best suited for:</b> {product.bestFor}</p><p>{product.recommendation}</p><p className="muted"><b>Evidence applicability:</b> {evidenceProfile.evidenceMatch || 'Not captured'}</p><div className="intelligence-meta"><span><b>Trust score</b>{product.score}/100</span><span><b>Data confidence</b>{confidence}</span><span><b>Evidence</b>{evidenceProfile.direction || 'Not assessed'}</span></div><p className="muted"><b>What would change this decision:</b> {evidenceProfile.nextVerification}</p><div className="notice">{evidenceProfile.factStatus || 'Product facts require verification'}. This is decision support, not a medical recommendation. Confirm the exact formulation, dose, batch, medicines, conditions and intended outcome before use.</div></section><section className="panel structured-intelligence-card"><span className="section-kicker">Risk intelligence</span><h3>What needs attention</h3>{confidenceChange ? <div className="confidence-alert"><b>Confidence changed</b><span>{confidenceChange.previousConfidence} to {confidenceChange.newConfidence} after {confidenceChange.triggerSource} updated the source record.</span><small>{new Date(confidenceChange.changedAt).toLocaleString()}</small></div> : null}<ul className="risk-list structured-risk-list">{riskItems.map(([item, tone]) => <li key={item}><span className={`dot ${tone}`} />{item}</li>)}</ul><p className="muted">{evidenceProfile.sourceStatus || 'No source scope recorded'}. Last linked source check: {evidenceProfile.sourceLastChecked ? new Date(evidenceProfile.sourceLastChecked).toLocaleDateString() : 'Not available'}. A missing linked record means the dashboard has not verified that dimension; it does not prove that the product is safe or unsafe.</p><div className="source-audit"><b>Source verification</b>{(evidenceProfile.sourceRecords || []).map((record) => <div className="source-audit-row" key={record.type}><span>{record.type}</span><span className={record.status === 'Not verified' ? 'watch' : 'good'}>{record.status}</span></div>)}</div>{evidenceProfile.sourceLinks?.length ? <div className="source-links"><b>Reference sources</b>{evidenceProfile.sourceLinks.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}</a>)}</div> : null}</section></>, target)
}

function RatingsTab({ products }) {
  return <section className="tab-content"><div className="section-heading"><div><span className="section-kicker">Comparable scoring</span><h2>Ratings matrix</h2><p>See how each supplement performs across the trust dimensions that make up its composite score.</p></div><span className="badge">0-100 scale</span></div><div className="table-wrap"><table><thead><tr><th>Product</th><th>Trust</th><th>Evidence</th><th>Safety</th><th>Quality</th><th>Transparency</th><th>Regulatory</th><th>Value</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><b>{product.name}</b><small className="table-sub">{product.brand}</small></td><td><span className={`rating-cell ${scoreTone(product.score)}`}><i />{product.score}<small>{productRating(product.score)[0]}</small></span></td>{['evidence', 'safety', 'quality', 'transparency', 'regulatory', 'value'].map((key) => <td key={key}><span className={`metric-chip ${scoreTone(product[key])}`}><i />{product[key]}</span></td>)}</tr>)}</tbody></table></div></section>
  return <section className="tab-content"><div className="section-heading"><div><span className="section-kicker">Reviewed information only</span><h2>Trust Profiles</h2><p>Completeness describes reviewed data, not effectiveness or product quality. Ingredient research, labels and exact batches are separate.</p></div></div><div className="profile-list">{products.map((product) => <article className="panel" key={product.id}><h3>{product.name}</h3><TrustProfile product={product} compact /></article>)}</div></section>
}

const methodologyWeights = [
  ['Evidence', '40%', 'The largest weight because relevant, consistent and higher-quality research is the primary basis for judging whether a claimed benefit is credible.'],
  ['Safety', '20%', 'Protects against harm by accounting for adverse-event signals, contraindications, interactions and suitability concerns.'],
  ['Quality', '15%', 'Checks identity, dose accuracy, manufacturing controls, testing and batch-level quality evidence.'],
  ['Transparency', '10%', 'Measures whether ingredients, doses, provenance, testing and limitations are clearly disclosed.'],
  ['Regulatory', '5%', 'Adds jurisdictional context such as permitted status, warnings or review without treating regulation as proof of efficacy.'],
  ['Contamination risk (inverted)', '5%', 'Higher contamination risk lowers trust: the score uses 100 minus the risk value before applying this weight.'],
  ['Supplier value', '5%', 'Adds a modest price signal by comparing normalised cost per relevant serving after pack size and formulation are considered.'],
]

const ingredientMethodologyWeights = [
  ['Evidence', '40%', 'Outcome-specific human evidence, prioritising systematic reviews and randomised controlled trials.'],
  ['Safety', '20%', 'Reviewed adverse events, interactions, contraindications and dose concerns without treating reports as causality.'],
  ['Regulatory confidence', '15%', 'Region-specific regulatory awareness, reviews, warnings and permitted claims.'],
  ['Transparency', '10%', 'How precisely the ingredient form, species or extract standardisation is defined.'],
  ['Evidence consistency', '10%', 'Agreement across relevant findings, forms, populations, doses and outcomes.'],
  ['Biological plausibility', '5%', 'Whether the proposed mechanism is credible; this cannot dominate the rating.'],
]

function IngredientMethodology() {
  return <section className="tab-content ingredient-methodology"><div className="section-heading"><div><span className="section-kicker">Ingredient ITR-1.0</span><h2>Ingredient Trust Rating</h2><p>Ingredient ratings are outcome- and region-specific and remain separate from Product Trust, batch verification and seller trust.</p></div><span className="badge good">Independent rating</span></div><div className="table-wrap"><table><thead><tr><th>Ingredient dimension</th><th>Weight</th><th>Meaning</th></tr></thead><tbody>{ingredientMethodologyWeights.map(([category, weight, meaning]) => <tr key={category}><td><b>{category}</b></td><td>{weight}</td><td>{meaning}</td></tr>)}</tbody></table></div><div className="notice">A publishable rating also requires ingredient form, dose range, population, outcome, region, HTTPS citations, reviewer, limitations and review date. Confidence is calculated independently.</div></section>
}

function SixLayerMethodology() {
  const layers = [
    ['01', 'Ingredient evidence', 'What evidence records are available for this ingredient?', 'Published · Mixed Evidence · Limited Evidence · Insufficient Evidence · Not Assessed', 'Weight: 40%. Up to 30 points for a systematic review, 25 for a meta-analysis, 20 for human RCTs, 15 for documented consistency and 10 for recent evidence. These points measure information availability, not whether the supplement works.'],
    ['02', 'Product verification', 'What independent checks are recorded for matching products?', 'Verified · Partially Verified · Limited Verification · Unverified', 'Weight: 15%. NSF and Informed Sport/Choice listings contribute 40 points each; independent lab report 30; public COA 20; GMP evidence 10, capped at 100. A name match is limited information, not exact-SKU verification.'],
    ['03', 'Batch verification', 'What test information is available for a batch?', 'Current Batch Verified · Historical Batch Evidence · Limited Batch Information · Batch Unknown', 'Shown as a separate status and excluded from Information Coverage. Batch records still help users assess exact-lot information independently.'],
    ['04', 'Safety documentation', 'What safety information is available?', 'Well Characterised · Context Required · Elevated Risk · Material Warning · Unknown', 'Weight: 25%. Safety review 30 points, interaction documentation 25, contraindications 20, dosage guidance 15, regulatory alerts 10. Missing information is Unknown; a warning requires an explicit warning, recall or regulatory alert.'],
    ['05', 'Transparency', 'What quality-related information is publicly available?', 'Excellent · Good · Partial · Limited · Unknown', 'Weight: 20%. Full ingredient disclosure 15 points, manufacturing location 10, GMP 10, COA 25, test method 20, supplier traceability 10, recall history 10. Candidate labels add information but do not prove an exact product match.'],
    ['06', 'Value', 'Is the price comparable at a relevant serving?', 'Reviewed value class · Unknown', 'Shown as a separate status and excluded from Information Coverage. A current exact-product offer and comparable serving data are required to assess value.'],
  ]
  return <section className="tab-content methodology-page"><div className="section-heading"><div><span className="section-kicker">TRUSTSTACK METHODOLOGY</span><h2>Information, not efficacy.</h2><p>TrustStack maps evidence, verification, batch, safety and transparency information. It does not decide whether a supplement works or whether a person should take it.</p></div></div><div className="methodology-layer-list">{layers.map(([number, name, question, states, rule]) => <section key={number}><span>{number}</span><div><h3>{name}</h3><p>{question}</p><small>{states}</small><p>{rule}</p></div></section>)}</div><div className="methodology-gates"><h3>Information Coverage</h3><p>Coverage = Evidence × 40% + Product Verification × 15% + Safety Documentation × 25% + Transparency × 20%. Batch Verification and Value remain separate statuses and do not add to coverage. Only the final weighted percentage is shown on product cards.</p><h3>Card classifications</h3><p>Apply in order: Review Warning (red) for an explicit warning; Worth Comparing (green) when evidence ≥70, verification ≥50 and coverage ≥70; Evidence Available (blue) when evidence ≥70 and verification &lt;50; Needs More Evidence (amber) for remaining entries with evidence ≥30 or coverage ≥40; otherwise Hold For Now (gray). Available ingredient evidence is not hidden by missing product records.</p><p>Unknown reduces coverage but is not Poor, Unsafe or Ineffective. A missing-data status never triggers a warning.</p></div></section>
}

function MethodologyTab() {
  return <section className="tab-content"><div className="section-heading"><div><span className="section-kicker">Version 0.2 · review required</span><h2>Scoring methodology</h2><p>The dashboard makes its decision-support logic visible so every rating can be challenged, reviewed and recalculated.</p></div><span className="badge good">Traceable model</span></div><div className="method-grid"><article><strong>Trust score</strong><p>The trust score uses the requested weighted composite: Evidence 40%, Safety 20%, Quality 15%, Transparency 10%, Regulatory 5%, Contamination risk 5% and Supplier value 5%.</p></article><article><strong>Evidence</strong><p>Weighted most heavily because relevant, consistent and higher-quality research is the primary basis for judging whether a claimed benefit is credible.</p></article><article><strong>Safety and risk</strong><p>Receives 20% to protect against harm through adverse-event signals, contraindications, interaction review and suitability concerns.</p></article><article><strong>Quality and transparency</strong><p>Quality receives 15% for product integrity; transparency receives 10% for clear ingredients, doses, provenance, testing and limitations.</p></article><article><strong>Regulatory</strong><p>Receives 5% because regulatory status adds jurisdictional context but does not prove efficacy or safety by itself.</p></article><article><strong>Value and contamination</strong><p>Each receives 5%: contamination is inverted so higher risk lowers trust, while supplier value contributes a modest normalised cost signal.</p></article></div><div className="panel decision-card" style={{ marginTop: '16px' }}><div className="section-heading"><div><span className="section-kicker">Weighted categories</span><h3>How the trust score is calculated</h3></div><span className="badge">100% total</span></div><div className="table-wrap"><table><thead><tr><th>Category</th><th>Weight</th><th>Justification</th></tr></thead><tbody>{methodologyWeights.map(([category, weight, justification]) => <tr key={category}><td><b>{category}</b></td><td>{weight}</td><td>{justification}</td></tr>)}</tbody></table></div><p className="muted">The score is calculated as a weighted sum of the seven 0-100 category scores. Contamination contributes as 100 minus the recorded risk value.</p></div><div className="notice">Scores are prototype decision support. Clinical, legal, regulatory and independent methodology review is required before production recommendations.</div></section>
  return <section className="tab-content"><div className="section-heading"><div><span className="section-kicker">Version 0.2 · review required</span><h2>Scoring methodology</h2><p>The dashboard makes its decision-support logic visible so every rating can be challenged, reviewed and recalculated.</p></div><span className="badge good">Traceable model</span></div><div className="method-grid"><article><strong>Trust score</strong><p>The trust score uses the requested weighted composite: Evidence 40%, Safety 20%, Quality 15%, Transparency 10%, Regulatory 5%, Contamination risk 5% and Supplier value 5%.</p></article><article><strong>Evidence</strong><p>Weighted most heavily because relevant, consistent and higher-quality research is the primary basis for judging whether a claimed benefit is credible.</p></article><article><strong>Safety and risk</strong><p>Receives 20% to protect against harm through adverse-event signals, contraindications, interaction review and suitability concerns.</p></article><article><strong>Quality and transparency</strong><p>Quality receives 15% for product integrity; transparency receives 10% for clear ingredients, doses, provenance, testing and limitations.</p></article><article><strong>Regulatory</strong><p>Receives 5% because regulatory status adds jurisdictional context but does not prove efficacy or safety by itself.</p></article><article><strong>Value and contamination</strong><p>Each receives 5%: contamination is inverted so higher risk lowers trust, while supplier value contributes a modest normalised cost signal.</p></article></div><div className="panel decision-card" style={{ marginTop: '16px' }}><div className="section-heading"><div><span className="section-kicker">Weighted categories</span><h3>How the trust score is calculated</h3></div><span className="badge">100% total</span></div><div className="table-wrap"><table><thead><tr><th>Category</th><th>Weight</th><th>Justification</th></tr></thead><tbody>{methodologyWeights.map(([category, weight, justification]) => <tr key={category}><td><b>{category}</b></td><td>{weight}</td><td>{justification}</td></tr>)}</tbody></table></div><p className="muted">The score is calculated as a weighted sum of the seven 0-100 category scores. Contamination contributes as 100 minus the recorded risk value.</p></div><div className="notice">Scores are prototype decision support. Clinical, legal, regulatory and independent methodology review is required before production recommendations.</div></section>
}

function RegulatoryTab({ products }) {
  return <section className="tab-content"><div className="section-heading"><div><span className="section-kicker">Region-aware review</span><h2>Regulatory data</h2><p>Products are categorised using the five-band regulatory framework, with the numeric score retained for traceability.</p></div><span className="badge">Global view</span></div><div className="panel decision-card" style={{ marginBottom: '16px' }}><div className="section-heading"><div><span className="section-kicker">Framework rating</span><h3>Five-band regulatory score</h3></div><span className="badge">Reference scale</span></div><div className="table-wrap"><table><thead><tr><th>Status</th><th>Score</th></tr></thead><tbody>{regulatoryFramework.map(([status, score]) => <tr key={status}><td>{status}</td><td><b>{score}</b></td></tr>)}</tbody></table></div></div><div className="notice" style={{ marginBottom: '16px' }}>Provisional catalogue classification: no product-linked UK FSA, Health Canada or EFSA regulatory records are currently available. Source-backed alerts or listings should override this score-based band when ingested.</div><div className="table-wrap"><table><thead><tr><th>Product</th><th>Status</th><th>Score</th><th>Contamination signal</th><th>Review action</th></tr></thead><tbody>{products.map((product) => { const [status, tone] = regulatoryBand(product.regulatory); return <tr key={product.id}><td><b>{product.name}</b><small className="table-sub">{product.brand}</small></td><td><span className={`badge ${tone === 'good' ? 'good' : ''}`}>{status}</span></td><td><span className={scoreTone(product.regulatory)}>{product.regulatory}</span></td><td><span className={contaminationBand(product.contamination)[1]}>{contaminationBand(product.contamination)[0]} ({product.contamination}/100)</span></td><td>{product.regulatory >= 70 ? 'Monitor source updates and batch records' : 'Hold recommendation pending source review'}</td></tr> })}</tbody></table></div></section>
}

function SourcesTab() {
  const [ingestion, setIngestion] = useState(null)
  useEffect(() => { fetch('/api/ingestion/status').then((response) => response.json()).then(setIngestion).catch(() => {}) }, [])
  const latestRun = (sourceId) => ingestion?.runs?.find((run) => run.source === sourceId)
  return <section className="tab-content"><div className="section-heading"><div><span className="section-kicker">Governed ingestion</span><h2>Source registry</h2><p>Only license-free or explicitly approved feeds should be connected to the local ingestion boundary.</p></div><span className="badge good">{sourceRegistry.length} adapters · {ingestion?.normalized?.count || 0} normalized</span></div><div className="source-grid">{sourceRegistry.map((source) => { const sourceId = source.name === 'NIH DSLD' ? 'dsld' : source.name === 'Europe PMC' ? 'europepmc' : source.name === 'openFDA CAERS' ? 'openfda' : source.name === 'UK Food Standards Agency' ? 'uk-fsa' : source.name === 'Health Canada LNHPD' ? 'health-canada' : source.name === 'EFSA OpenFoodTox' ? 'efsa-openfoodtox' : source.name === 'Informed Sport' ? 'informed-sport' : source.name.toLowerCase().replaceAll(' ', '-'); const run = latestRun(sourceId); const isLive = run?.status === 'success'; return <article className="source-item" key={source.name}><div className="source-status"><span className={`dot ${isLive ? 'good' : run ? 'risk' : 'watch'}`} />{run ? `${run.status} · ${run.records} records` : source.status}</div><h3>{source.name}</h3><p>{source.scope}</p><small>{source.licence}{run?.completedAt ? ` · ${new Date(run.completedAt).toLocaleString()}` : ''}</small></article> })}</div><div className="notice">Automated source matches remain review candidates and cannot publish a rating. NHS content must retain OGL attribution. EFSA OpenFoodTox remains subject to dataset-level reuse verification. Informed Sport records require permission before commercial reuse or a batch-certification claim.</div></section>
}

function SourceMatchReviewQueue() {
  const [reviews, setReviews] = useState([])
  useEffect(() => { fetch('/api/source-match-reviews').then((response) => response.json()).then(setReviews).catch(() => setReviews([])) }, [])
  async function reviewMatch(id, status) {
    const response = await fetch(`/api/source-match-reviews/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, reviewer: 'local reviewer' }) })
    if (response.ok) setReviews((current) => current.filter((reviewItem) => reviewItem.id !== id))
  }
  return <section className="panel decision-card source-manager"><span className="section-kicker">Human review queue</span><h3>Possible source matches</h3><p className="muted">Only exact product matches are linked automatically. Possible matches remain pending so they cannot silently change a product confidence rating.</p>{reviews.length ? <div className="saved-sources">{reviews.map((review) => <div className="saved-source" key={review.id}><span><b>{review.candidateProduct}</b> · {review.matchType} ({review.matchScore}%)<small>{review.source} · {review.title || 'Untitled source record'}</small></span><span className="review-actions"><button className="button primary" onClick={() => reviewMatch(review.id, 'Approved')}>Approve</button><button className="button" onClick={() => reviewMatch(review.id, 'Rejected')}>Reject</button></span></div>)}</div> : <p className="muted">No pending source matches.</p>}</section>
}

function EvidenceProvenanceTab({ product }) {
  if (!product) return <section className="tab-content empty">Select a product to inspect its evidence and provenance.</section>
  const context = product.sourceContext || {}
  const sourceRows = [
    ['Europe PMC', context.europepmc || 0, 'Evidence records'],
    ['openFDA', context.openfda || 0, 'Safety records'],
    ['EFSA OpenFoodTox', context['efsa-openfoodtox'] || 0, 'Hazard/regulatory records'],
    ['UK FSA', context['uk-fsa'] || 0, 'Regulatory records'],
    ['Health Canada', context['health-canada'] || 0, 'Licence records'],
    ['Informed Sport', context.informedSportMatches || 0, 'Directory matches'],
  ]
  const biasRows = context.biasRows || []
  const averageQuality = biasRows.length ? Math.round(biasRows.reduce((sum, row) => sum + Number(row.quality || 0), 0) / biasRows.length) : 0
  const averageIndependence = biasRows.length ? Math.round(biasRows.reduce((sum, row) => sum + Number(row.independence || 0), 0) / biasRows.length) : 0
  return <section className="tab-content"><div className="section-heading"><div><span className="section-kicker">Selected product evidence</span><h2>{product.name}</h2><p>Traceable source coverage behind the current decision support view.</p></div><span className="badge">{product.catalogueSource || 'Prototype catalogue'}</span></div><div className="source-grid">{sourceRows.map(([source, count, label]) => <article className="source-item" key={source}><div className="source-status"><span className={`dot ${count ? 'good' : 'watch'}`} />{count ? 'Coverage found' : 'No linked record'}</div><h3>{count}</h3><p>{label}</p><small>{source}</small></article>)}</div><div className="two-col" style={{ marginTop: '16px' }}><section className="panel decision-card"><span className="section-kicker">Source bias & confidence</span><h3>How much to trust the coverage</h3><p><b>Average source quality:</b> {averageQuality}/100</p><p><b>Average independence:</b> {averageIndependence}/100</p><p className="muted">Source roles remain separate: evidence, safety signals, regulatory context and athlete certification are not interchangeable.</p>{biasRows.map((row) => <p className="small" key={row.role}><b>{row.role}:</b> {row.bias_flags}</p>)}</section><section className="panel decision-card"><span className="section-kicker">Product provenance</span><h3>Catalogue identity</h3><p><b>Brand:</b> {product.brand}</p><p><b>Region:</b> {product.region}</p><p><b>Catalogue source:</b> {product.catalogueSource || 'Prototype catalogue'}</p><p><b>Last updated:</b> {product.updatedAt ? new Date(product.updatedAt).toLocaleString() : 'Not available'}</p></section></div><div className="panel decision-card" style={{ marginTop: '16px' }}><span className="section-kicker">Open issues</span><h3>What still needs checking</h3><ul className="risk-list"><li><span className="dot watch" />Confirm the exact formulation and dose.</li><li><span className="dot watch" />Verify the current product batch before athlete use.</li><li><span className="dot watch" />Treat source counts as coverage, not proof of efficacy.</li><li><span className="dot watch" />Review licence and freshness conditions before commercial reuse.</li></ul></div></section>
}

function ProductSourceManager({ product }) {
  const [sources, setSources] = useState([])
  const [form, setForm] = useState({ sourceType: 'Product label', url: '', region: 'Global', status: 'Pending review', reviewer: '' })
  const [message, setMessage] = useState('')
  useEffect(() => { fetch(`/api/products/${product.id}/sources`).then((response) => response.json()).then(setSources).catch(() => setSources([])) }, [product.id])
  async function addSource(event) {
    event.preventDefault()
    const response = await fetch(`/api/products/${product.id}/sources`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    if (!response.ok) { setMessage('Unable to save source record.'); return }
    setSources((current) => [{ ...form, createdAt: new Date().toISOString() }, ...current])
    setForm({ ...form, url: '' })
    setMessage('Source record saved for review.')
  }
  return <section className="panel decision-card source-manager"><span className="section-kicker">Product verification workflow</span><h3>Source records</h3><p className="muted">Attach label, regulatory, batch or manufacturer sources to this exact product. Ingredient references do not verify a specific product.</p><form className="source-form" onSubmit={addSource}><select aria-label="Source type" value={form.sourceType} onChange={(event) => setForm({ ...form, sourceType: event.target.value })}><option>Product label</option><option>Manufacturer</option><option>Regulatory record</option><option>Batch certificate</option><option>Clinical evidence</option></select><input aria-label="Source URL" required type="url" placeholder="https://..." value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} /><select aria-label="Source status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option>Pending review</option><option>Verified</option><option>Rejected</option><option>Outdated</option></select><button className="button primary" type="submit">Add source</button></form>{message && <p className="status" role="status">{message}</p>}{sources.length ? <div className="saved-sources">{sources.map((source, index) => <div className="saved-source" key={`${source.id || source.url}-${index}`}><a href={source.url} target="_blank" rel="noreferrer">{source.sourceType}</a><span>{source.status} · {source.region || 'Global'}</span></div>)}</div> : <p className="muted">No product-specific sources attached yet.</p>}</section>
}

function StackBuilder({ products, stack, onToggleStack }) {
  const [productId, setProductId] = useState('')
  const analysis = analyseStack(stack)
  const available = products.filter((product) => !stack.some((item) => item.id === product.id))
  const starterNames = ['Creatine Monohydrate', 'Whey Protein', 'Vitamin D3', 'Magnesium', 'Omega-3 Fish Oil']
  const missing = starterNames.map((name) => products.find((product) => product.name === name)).filter((product) => product && !stack.some((item) => item.id === product.id))
  return <section className="panel decision-card stack-builder"><div className="section-heading"><div><span className="section-kicker">4 · Supplement stack</span><h3>Build My Stack</h3></div><span className="badge">{stack.length} product{stack.length === 1 ? '' : 's'}</span></div><div className="stack-controls"><label>Add a product<select value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Choose from the catalogue</option>{available.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="button primary" disabled={!productId} onClick={() => { const item = available.find((candidate) => String(candidate.id) === productId); if (item) onToggleStack(item); setProductId('') }}>Add to stack</button><button className="button" disabled={!missing.length} onClick={() => missing.forEach(onToggleStack)}>Add example stack</button></div><p className="muted">Example: creatine, whey protein, vitamin D, magnesium and omega-3. Review the exact formulation before use.</p>{stack.length ? <><div className="stack-list">{stack.map((item) => <div className="stack-item" key={item.id}><span><b>{item.name}</b><small>Evidence {item.evidence}/100 · safety {item.safety}/100 · value {item.value}/100</small></span><button className="button" onClick={() => onToggleStack(item)} aria-label={`Remove ${item.name} from stack`}>Remove</button></div>)}</div><div className="stack-summary"><div><span>Cost</span><strong>{analysis.dailyCost === null ? 'Incomplete' : `£${analysis.dailyCost.toFixed(2)}`}</strong><small>per day, one listed serving each</small></div><div><span>Evidence</span><strong>{analysis.evidence}/100</strong><small>mean catalogue score, not combined efficacy</small></div><div><span>Risk</span><strong className={analysis.lowestSafety < 60 || analysis.highestContamination > 50 ? 'risk' : 'watch'}>{analysis.lowestSafety < 60 || analysis.highestContamination > 50 ? 'Review' : 'Check suitability'}</strong><small>lowest safety {analysis.lowestSafety}/100; highest contamination {analysis.highestContamination}/100</small></div><div><span>Interactions</span><strong>{analysis.cautions.length ? `${analysis.cautions.length} caution${analysis.cautions.length === 1 ? '' : 's'}` : 'Unconfirmed'}</strong><small>pairwise interactions not assessed</small></div><div><span>Value</span><strong>{analysis.value}/100</strong><small>mean catalogue score</small></div></div><p className="muted">Indicative pack total: {analysis.packCost === null ? 'incomplete' : `£${analysis.packCost.toFixed(2)}`}. Prices use the lowest listed cost per serving for each product; availability and daily doses are not verified.</p>{analysis.unpriced.length > 0 && <p className="status">No comparable offer for: {analysis.unpriced.join(', ')}.</p>}<div className="stack-findings"><article><h4>Possible overlap</h4>{analysis.overlaps.length ? <ul>{analysis.overlaps.map((overlap) => <li key={overlap.group}>{overlap.group}: {overlap.products.join(' and ')}. Check the labels and combined dose.</li>)}</ul> : <p>No obvious name-based category overlap identified. This does not rule out shared ingredients.</p>}</article><article><h4>Potential interactions</h4>{analysis.cautions.length ? <ul>{analysis.cautions.map((caution) => <li key={caution.product}><b>{caution.product}:</b> {caution.note}</li>)}</ul> : <p>No product-specific interaction notes available; combinations and medicines have not been checked.</p>}</article><article><h4>Duplicate ingredients</h4><p>Not confirmed. The catalogue does not contain verified ingredient lists and doses for these exact products. Compare labels or certificates before combining them.</p></article></div><p className="notice">This is a screening aid, not a supplement interaction checker or personal safety clearance. Discuss medicines, conditions, dose and the exact products with a qualified professional.</p></> : <p className="muted">Add products to see cost, evidence, risk, possible overlap and known product-specific cautions.</p>}</section>
}

function DecisionWorkspace({ product, products, profile, setProfile, stack, onToggleStack }) {
  if (!product) return <section className="tab-content empty">Select a product from the Dashboard before opening the decision workspace.</section>
  const profileComplete = profile.goal && profile.country && profile.medications
  const highRisk = product.safety < 60 || product.contamination > 50
  const recommendation = highRisk ? 'Seek professional review before using this product.' : profileComplete ? 'Suitable for consideration, subject to the checks below.' : 'Complete your profile to personalise this decision.'
  const evidenceOutcome = profile.goal || product.bestFor
  const sourceContext = product.sourceContext || {}
  const openfoodtox = 0
  sourceContext.efsa = sourceContext['efsa-openfoodtox'] || 0
  const [monitoring, setMonitoring] = useState({ plans: [], observations: [] })
  const [monitorForm, setMonitorForm] = useState({ outcome: product.bestFor, startDate: '', reviewDate: '', baselineValue: '', metric: '', confounders: '' })
  const [monitorMessage, setMonitorMessage] = useState('')
  useEffect(() => { fetch(`/api/products/${product.id}/monitoring`).then((response) => response.json()).then(setMonitoring).catch(() => setMonitoring({ plans: [], observations: [] })) }, [product.id])
  async function saveMonitoringPlan(event) {
    event.preventDefault()
    const response = await fetch(`/api/products/${product.id}/monitoring`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(monitorForm) })
    if (!response.ok) { setMonitorMessage('Unable to save monitoring plan.'); return }
    setMonitorMessage('Monitoring plan saved.')
    const refreshed = await fetch(`/api/products/${product.id}/monitoring`).then((result) => result.json())
    setMonitoring(refreshed)
  }
  const activePlan = monitoring.plans[0]
  return <><section className="decision-layout">
    <div className="panel decision-hero"><span className="section-kicker">Personalised decision support</span><h2>{product.name}</h2><p>{recommendation}</p><div className={`decision-gate ${highRisk ? 'risk' : profileComplete ? 'good' : 'watch'}`}>{highRisk ? 'Professional review required' : profileComplete ? 'Profile-aware recommendation ready' : 'Profile incomplete'}</div></div>
    <SourceFeedback product={product} inline />
    <section className="panel decision-card"><div className="section-heading"><div><span className="section-kicker">1 · Personal context</span><h3>Your suitability profile</h3></div><span className="badge">Stored locally</span></div><div className="decision-form"><label>Primary outcome<select value={profile.goal} onChange={(event) => setProfile({ ...profile, goal: event.target.value })}><option value="">Choose an outcome</option><option>Strength and performance</option><option>Vitamin intake support</option><option>Stress-related outcomes</option><option>General health</option></select></label><label>Country / region<select value={profile.country} onChange={(event) => setProfile({ ...profile, country: event.target.value })}><option value="">Choose a region</option><option>UK</option><option>EU</option><option>US</option><option>Canada</option></select></label><label>Medicines<select value={profile.medications} onChange={(event) => setProfile({ ...profile, medications: event.target.value })}><option value="">Choose one</option><option value="none">None known</option><option value="review">Yes, needs interaction review</option></select></label><label>Conditions / allergies<input value={profile.conditions} onChange={(event) => setProfile({ ...profile, conditions: event.target.value })} placeholder="Optional notes" /></label></div></section>
    <div className="two-col"><section className="panel decision-card"><span className="section-kicker">2 · Outcome evidence</span><h3>Does it fit your goal?</h3><p><b>Selected outcome:</b> {evidenceOutcome || 'Not selected'}</p><p className="muted">This product is currently described as: {product.bestFor}. The evidence score is {product.evidence}/100, but outcome-specific evidence, dose and formulation must be verified before treating this as a recommendation.</p><div className="metric-inline"><span>Evidence strength</span><strong className={scoreTone(product.evidence)}>{product.evidence}/100</strong></div><div className="notice">Next check: confirm the clinically relevant dose and whether the evidence applies to this exact formulation.</div></section><section className="panel decision-card"><span className="section-kicker">3 · Safety gate</span><h3>Risks before purchase</h3><ul className="risk-list"><li><span className={`dot ${scoreTone(product.safety)}`} />Safety rating: {product.safety}/100</li><li><span className={`dot ${contaminationBand(product.contamination)[1]}`} />Contamination: {contaminationBand(product.contamination)[0]} ({product.contamination}/100)</li><li><span className={`dot ${profile.medications === 'review' ? 'risk' : 'watch'}`} />Medicine interaction review: {profile.medications === 'review' ? 'Required' : 'Not yet confirmed'}</li><li><span className="dot watch" />Check allergies, pregnancy status and relevant conditions with a qualified professional</li></ul></section></div>
    <section className="panel decision-card"><span className="section-kicker">Evidence trail</span><h3>What the source network says</h3><div className="source-evidence-grid"><div><b>Evidence</b><span>{sourceContext.europepmc || 0} linked records</span></div><div><b>Safety</b><span>{sourceContext.openfda || 0} FDA records</span></div><div><b>Regulatory</b><span>{(sourceContext.efsa-openfoodtox || 0) + (sourceContext['uk-fsa'] || 0) + (sourceContext['health-canada'] || 0)} records</span></div><div><b>Athlete certification</b><span>{sourceContext.informedSportMatches || 0} directory matches</span></div></div><p className="muted">Counts indicate source coverage, not proof of efficacy or a current batch certificate. Open the source registry to inspect freshness and licence conditions.</p></section>
    <StackBuilder products={products} stack={stack} onToggleStack={onToggleStack} />
    <section className="panel decision-card"><span className="section-kicker">5 · Monitor the outcome</span><h3>Intervention-to-outcome timeline</h3><p className="muted">Record a baseline before adding the product, define one outcome, and log confounders. Results are associations, not proof of causation.</p><form className="monitor-form" onSubmit={saveMonitoringPlan}><label>Outcome<input required value={monitorForm.outcome} onChange={(event) => setMonitorForm({ ...monitorForm, outcome: event.target.value })} /></label><label>Start date<input required type="date" value={monitorForm.startDate} onChange={(event) => setMonitorForm({ ...monitorForm, startDate: event.target.value })} /></label><label>Review date<input required type="date" value={monitorForm.reviewDate} onChange={(event) => setMonitorForm({ ...monitorForm, reviewDate: event.target.value })} /></label><label>Baseline value<input type="number" step="any" value={monitorForm.baselineValue} onChange={(event) => setMonitorForm({ ...monitorForm, baselineValue: event.target.value })} /></label><label>Metric<input required placeholder="Sleep score, pain score, performance..." value={monitorForm.metric} onChange={(event) => setMonitorForm({ ...monitorForm, metric: event.target.value })} /></label><label>Confounders<input placeholder="Training, caffeine, illness, medication changes" value={monitorForm.confounders} onChange={(event) => setMonitorForm({ ...monitorForm, confounders: event.target.value })} /></label><button className="button primary" type="submit">Save plan</button></form>{monitorMessage && <p className="status" role="status">{monitorMessage}</p>}<div className="notice">Stop and seek advice for unexpected symptoms. Change one product or dose at a time where practical. Track adherence and confounders before interpreting a result.</div>{activePlan ? <div className="monitor-timeline"><div><b>Baseline</b><span>{activePlan.baselineValue ?? 'Not recorded'}</span></div><div><b>Product added</b><span>{activePlan.startDate}</span></div><div><b>Review point</b><span>{activePlan.reviewDate}</span></div></div> : null}{monitoring.observations.length ? <div className="monitor-observations">{monitoring.observations.map((observation) => <div className="saved-source" key={observation.id}><span><b>{observation.observedAt}</b> · {observation.value ?? 'No value'} · adherence {observation.adherence ?? '—'}%</span><span className="watch">{observation.interpretation}</span></div>)}</div> : null}</section>
  </section>{activePlan ? <MonitorObservationForm plan={activePlan} productId={product.id} onSaved={async () => setMonitoring(await fetch(`/api/products/${product.id}/monitoring`).then((result) => result.json()))} /> : null}</>
}

function MonitorObservationForm({ plan, productId, onSaved }) {
  async function saveObservation(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const response = await fetch(`/api/monitoring/${plan.id}/observations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ observedAt: form.get('observedAt'), value: form.get('value'), adherence: form.get('adherence'), notes: form.get('notes'), interpretation: form.get('interpretation') }) })
    if (response.ok) { event.currentTarget.reset(); onSaved() }
  }
  return <section className="panel decision-card observation-entry"><span className="section-kicker">Observation log</span><h3>Record an outcome check-in</h3><form className="monitor-form" onSubmit={saveObservation}><label>Date<input required name="observedAt" type="date" /></label><label>Value<input name="value" type="number" step="any" /></label><label>Adherence %<input name="adherence" type="number" min="0" max="100" /></label><label>Interpretation<select name="interpretation"><option>Inconclusive</option><option>Possible association</option><option>No clear change</option><option>Possible worsening</option></select></label><label>Notes<input name="notes" placeholder="Symptoms, training, caffeine, illness..." /></label><button className="button primary" type="submit">Log observation</button></form><p className="muted">Interpretation remains cautious until the review period, adherence, baseline, and confounders are sufficient.</p></section>
}

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [products, setProducts] = useState([])
  const [summary, setSummary] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [filters, setFilters] = useState({ q: '', type: 'all', category: 'all', region: 'Global', outcome: 'all', productStatus: 'view-recommended', age: 'all' })
  const [dark, setDark] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState('')
  const [apiHealthy, setApiHealthy] = useState(true)
  const [profile, setProfile] = useState({ goal: '', country: '', medications: '', conditions: '' })
  const [stack, setStack] = useState([])
  const [compare, setCompare] = useState([])
  const [requestedProductId, setRequestedProductId] = useState(null)
  const latestCatalogueRequest = useRef(0)

  function connectionMessage(error) {
    if (error?.message === 'Failed to fetch') return 'Network unavailable. Check the TrustStack service connection.'
    if (error?.message === 'INVALID_CATALOGUE_RESPONSE') return 'Response format invalid. The source service returned an unexpected catalogue shape.'
    if (error?.message === 'EMPTY_CATALOGUE') return 'Catalogue returned no records. Previously reviewed data is not available in this session.'
    return `API unavailable. ${error?.message || 'The TrustStack data service did not respond.'}`
  }

  async function loadData(nextFilters = filters) {
    const requestId = ++latestCatalogueRequest.current
    try {
      const { outcome, ...apiFilters } = nextFilters
      const params = new URLSearchParams(apiFilters)
      const healthResponse = await fetch('/api/health', { cache: 'no-store' })
      if (!healthResponse.ok) throw new Error('API health check failed')
      const [productResponse, summaryResponse] = await Promise.all([fetch(`/api/products?${params}`, { cache: 'no-store' }), fetch('/api/summary', { cache: 'no-store' })])
      if (!productResponse.ok || !summaryResponse.ok) throw new Error('Unable to load dashboard data')
      const [nextProducts, nextSummary] = await Promise.all([productResponse.json(), summaryResponse.json()])
      if (requestId !== latestCatalogueRequest.current) return
      if (!Array.isArray(nextProducts)) throw new Error('INVALID_CATALOGUE_RESPONSE')
      setApiHealthy(true)
      setProducts(nextProducts)
      setSummary(nextSummary)
      setSelectedId((current) => nextProducts.some((product) => product.id === current) ? current : nextProducts[0]?.id ?? null)
    } catch (error) {
      if (requestId !== latestCatalogueRequest.current) return
      throw error
    }
  }

  useEffect(() => { loadData().catch((error) => { setApiHealthy(false); setMessage(connectionMessage(error)) }) }, [])
  useEffect(() => {
    const refreshCatalogue = () => loadData().catch(() => {})
    const timer = setInterval(refreshCatalogue, 60000)
    window.addEventListener('focus', refreshCatalogue)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refreshCatalogue)
    }
  }, [])
  useEffect(() => { const timer = setTimeout(() => loadData(filters).catch((error) => { setApiHealthy(false); setMessage(connectionMessage(error)) }), 180); return () => clearTimeout(timer) }, [filters])

  const allFilteredProducts = products.filter((product) => matchesCatalogueOutcome(product, filters.outcome) && matchesCatalogueCategory(product, filters.category))
  const productViewProducts = allFilteredProducts.filter((product) => matchesCatalogueView(product, filters.productStatus))
  const filteredProducts = productViewProducts.slice(0, 5)
  const selected = products.find((product) => product.id === selectedId) || filteredProducts[0]
  const selectedScoreTone = selected ? scoreTone(selected.score) : 'risk'
  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }))
  const navigateToTab = (tab) => {
    setActiveTab(tab)
    window.setTimeout(() => {
      if (tab === 'dashboard') window.scrollTo({ top: 0, behavior: 'smooth' })
      else document.querySelector('.container:not(.legacy-dashboard)')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }, 0)
  }
  const onToggleStack = (product) => setStack((current) => current.some((item) => item.id === product.id) ? current.filter((item) => item.id !== product.id) : [...current, product])
  const onToggleCompare = (product) => setCompare((current) => current.some((item) => item.id === product.id) ? current.filter((item) => item.id !== product.id) : current.length < 4 ? [...current, product] : current)

  useEffect(() => {
    const scoreElement = document.querySelector('.trust-score')
    if (!scoreElement || !selected) return
    const color = selectedScoreTone === 'good' ? 'var(--good)' : selectedScoreTone === 'watch' ? 'var(--watch)' : 'var(--risk)'
    scoreElement.style.color = color
    scoreElement.style.borderColor = color
    scoreElement.style.background = `color-mix(in srgb, ${color} 12%, var(--surface))`
  }, [selected?.score, selectedScoreTone])

  useEffect(() => {
    document.querySelectorAll('.product > strong').forEach((scoreElement) => {
      const score = Number(scoreElement.textContent)
      const color = scoreTone(score) === 'good' ? 'var(--good)' : scoreTone(score) === 'watch' ? 'var(--watch)' : 'var(--risk)'
      scoreElement.style.color = color
    })
  }, [filteredProducts, selectedId])

  async function refresh() {
    setRefreshing(true)
    setMessage('Refreshing the local catalogue from approved open-data adapters…')
    try {
      const response = await fetch('/api/ingestion/run', { method: 'POST' })
      const result = await response.json()
      await loadData()
      setMessage(`${result.message || 'Ingestion completed.'} ${result.totalRecords ?? 0} records observed across ${result.sources?.length ?? 0} feeds.`)
    } catch {
      setMessage('Refresh failed. Check that the Node API is running.')
    } finally { setRefreshing(false) }
  }

  return <div className={dark ? 'app dark' : 'app'} style={{ '--trust-color': selectedScoreTone === 'good' ? 'var(--good)' : selectedScoreTone === 'watch' ? 'var(--watch)' : 'var(--risk)' }}><style>{decisionStyles}</style><style>{`.app > .source-feedback{display:none}`}</style>{activeTab === 'dashboard' && selected ? <DecisionRiskPanels product={selected} /> : null}<SourceFeedback product={selected} />
    {!apiHealthy && <div className="container"><section className="panel decision-card" style={{ marginTop: '24px', padding: '24px' }}><span className="section-kicker">System status</span><h3>Data service unavailable</h3><p className="muted">The dashboard backend is not responding. Start it with <b>npm run dev:server</b> or run the watchdog script with <b>npm run start:watchdog</b> to restart it automatically.</p>{message && <div className="status" role="status">{message}</div>}<button className="button primary" onClick={() => { setApiHealthy(true); loadData().catch(() => setApiHealthy(false)) }}>Retry connection</button></section></div>}
    {apiHealthy && <><header className={activeTab === 'dashboard' ? 'topbar legacy-topbar' : 'topbar'}><div className="brand"><img className="brand-mark" src="/truststack-mark.png" alt="" /><div><h1>TrustStack</h1><p>Find · Verify · Compare · Build</p></div></div><nav className="analyst-top-tabs" aria-label="Dashboard sections">{tabs.map(([key, label]) => <button key={key} type="button" className={activeTab === key ? 'is-active' : ''} aria-current={activeTab === key ? 'page' : undefined} onClick={() => navigateToTab(key)}>{key === 'dashboard' ? 'Homepage' : label}</button>)}</nav><div className="actions"><span className="updated">Data updated<br /><b>{summary?.updatedAt ? new Date(summary.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Loading'}</b></span><button className="button primary" onClick={refresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : '↻ Refresh data'}</button><button className="button" onClick={() => setDark((value) => !value)}>{dark ? '☼ Light' : '◐ Dark'}</button></div></header>
    {activeTab === 'dashboard' ? <V3Marketplace products={productViewProducts} selected={selected} filters={filters} updateFilter={updateFilter} setSelectedId={setSelectedId} compare={compare} onToggleCompare={onToggleCompare} onClearCompare={() => setCompare([])} onNavigate={navigateToTab} requestedProductId={requestedProductId} onProductRequestHandled={() => setRequestedProductId(null)} /> : null}
    <main className={activeTab === 'dashboard' ? 'container legacy-dashboard hidden' : 'container'}>
      {activeTab === 'decisions' && <div className="notice">Analyst prototype: historical numbers and seller offers are illustrative, not reviewed product ratings or purchase recommendations.</div>}
      <section className="hero"><span className="eyebrow">GLOBAL EVIDENCE, SAFETY & VALUE INTELLIGENCE</span><h2>Make supplement decisions explainable, traceable and region-aware.</h2><p>A decision-support workspace for comparing evidence quality, safety, product verification, regulatory status, contamination risk and supplier value.</p>{message && <div className="status" role="status">{message}</div>}</section>
      {activeTab === 'dashboard' ? <DashboardCommandStrip selected={selected} products={products} summary={summary} onNavigate={(tab) => setActiveTab(tab === 'evidence' ? 'evidence' : tab === 'regulatory' ? 'regulatory' : tab === 'sources' ? 'sources' : 'dashboard')} /> : null}
      {activeTab === 'dashboard' ? <DashboardFuturisticDetails selected={selected} onNavigate={(tab) => setActiveTab(tab)} /> : null}
      {activeTab !== 'dashboard' && <button className="workspace-back" onClick={() => navigateToTab('dashboard')}>← Back to Homepage</button>}
      {activeTab === 'goals' && <MyGoalsPage products={products} onSelectProduct={(product) => { setSelectedId(product.id); setRequestedProductId(product.id) }} onNavigate={navigateToTab} />}
      {activeTab === 'dashboard' && <><ProductMarketplace products={productViewProducts} selected={selected} filters={filters} updateFilter={updateFilter} setSelectedId={setSelectedId} compare={compare} onToggleCompare={onToggleCompare} />
      <section className="workspace"><aside className="panel product-list"><div className="panel-heading"><h3>Products</h3><span>{filteredProducts.length} of {products.length}</span></div>{filteredProducts.length ? filteredProducts.map((product) => <button className={product.id === selected?.id ? 'product selected' : 'product'} key={product.id} onClick={() => setSelectedId(product.id)}><span><b>{product.name}</b><small>{product.type} · {product.brand}</small></span><strong>{product.score}</strong></button>) : <p className="muted">No products match this recommended outcome.</p>}</aside><div className="details">{selected ? <><section className="panel product-detail"><div><span className="muted">{selected.brand} · {selected.category}</span><h2>{selected.name}</h2><div className="badges"><span className="badge good">{selected.status}</span><span className="badge">{selected.confidence} confidence</span></div></div><div className="trust-score"><strong>{selected.score}</strong><span>Trust score</span></div><div className="metrics">{metricConfig.map(([label, key, icon]) => <Metric key={key} label={label} value={selected[key]} icon={icon} inverse={key === 'contamination'} />)}</div></section><div className="two-col"><section className="panel recommendation"><span className="section-kicker">Decision note</span><h3>Recommended use</h3><p><b>Best suited for:</b> {selected.bestFor}</p><p className="recommendation-copy">{selected.recommendation}</p><div className="notice">Decision support only. Confirm the exact product, dose, batch and personal suitability with a qualified healthcare professional.</div></section><section className="panel"><span className="section-kicker">Risk intelligence</span><h3>What needs attention</h3><ul className="risk-list"><li><span className="dot good" />Regulatory status: {selected.regulatory >= 70 ? 'No material demo alert' : 'Review required'}</li><li><span className={`dot ${contaminationBand(selected.contamination)[1]}`} />Contamination risk: {contaminationBand(selected.contamination)[0]} ({selected.contamination}/100)</li><li><span className="dot watch" />Athlete risk: verify sport certification by batch</li><li><span className="dot watch" />Interaction risk: review medicines and health conditions</li></ul></section></div><PriceTable product={selected} /></> : <div className="panel empty">Choose a supplement to inspect its trust profile.</div>}</div></section></>}
      {activeTab === 'ratings' && <RatingsTab products={products} />}
      {activeTab === 'decisions' && <DecisionWorkspace product={selected} products={products} profile={profile} setProfile={setProfile} stack={stack} onToggleStack={onToggleStack} />}
      {activeTab === 'methodology' && <SixLayerMethodology />}
      {activeTab === 'regulatory' && <section className="tab-content"><h2>Regulatory review</h2><p>Country-specific status has not been reviewed for the exact catalogue products. A general source listing does not constitute product approval.</p><RatingsTab products={products} /></section>}
      {activeTab === 'sources' && <><SourcesTab /><SourceMatchReviewQueue /></>}
      {activeTab === 'evidence' && selected && <><section className="tab-content"><h2>{selected.name}</h2><TrustProfile product={selected} /></section><ProductVariantsPanel product={selected} /><SourceCoveragePanel product={selected} /></>}
      <footer>Supplement Trust Intelligence · Local SQLite catalogue · License-free source adapters · Informational decision support only, not medical advice</footer>
      </main>
    </>}
  </div>
}

function MarketplaceTabs({ active, onSelect, compareCount }) {
  const destinations = [
    ['discover', 'Discover'], ['goals', 'My Goals'], ['products', 'Products'],
    ['compare', `Compare${compareCount ? ` (${compareCount})` : ''}`],
    ['decisions', 'Analyst prototype'], ['ratings', 'Trust Profiles'], ['methodology', 'Methodology'],
    ['evidence', 'Evidence'], ['sources', 'Sources'],
  ]
  return <nav className="v3-home-tabs tab-style-pill" aria-label="Marketplace navigation">{destinations.map(([key, label]) => <button key={key} type="button" className={active === key ? 'is-active' : ''} aria-current={active === key ? 'page' : undefined} onClick={() => onSelect(key)}>{label}</button>)}</nav>
}

function CatalogueCategories({ selected, onChange }) {
  return <nav className="catalogue-categories" aria-label="Product categories"><button className={selected === 'all' ? 'active' : ''} onClick={() => onChange('all')}>All products</button>{Object.keys(catalogueGroups).map((category) => <button key={category} className={selected === category ? 'active' : ''} onClick={() => onChange(category)}>{category}</button>)}</nav>
}

function V3Marketplace({ products, selected, filters, updateFilter, setSelectedId, compare, onToggleCompare, onClearCompare, onNavigate, requestedProductId, onProductRequestHandled }) {
  const [marketDark, setMarketDark] = useState(false)
  const [activeHomeTab, setActiveHomeTab] = useState('discover')
  const [detailProduct, setDetailProduct] = useState(null)
  const [detailTab, setDetailTab] = useState('overview')
  const [savedProducts, setSavedProducts] = useState([])
  const [utilityMessage, setUtilityMessage] = useState('')
  const [compareOpen, setCompareOpen] = useState(false)
  const goals = [['⚡', 'Performance', 'performance'], ['☾', 'Sleep', 'sleep'], ['↻', 'Recovery', 'joint-health'], ['♡', 'Wellbeing', 'stress'], ['☀', 'Vitamins', 'bone-health'], ['✓', 'Informed Sport Certified', 'view-athlete-verified']]
  const recommendations = products.filter((product) => product.ingredientEvidenceProfile?.publishable && product.ingredientEvidenceProfile.direction === 'Supports benefit' && ['ingredient_evidence_only', 'partial_assessment', 'full_assessment'].includes(product.trustProfile?.overallState)).slice(0, 3)
  const setSearch = (value) => updateFilter('q', value)
  const statusLabel = (product) => product.sourceReview?.registryMatchCount ? 'Source records found' : 'No linked source records'
  const openDetail = (product) => { setSelectedId(product.id); setDetailProduct(product); setDetailTab('overview') }
  const toggleSaved = (product) => setSavedProducts((current) => current.some((item) => item.id === product.id) ? current.filter((item) => item.id !== product.id) : [...current, product])
  const selectHomeTab = (key) => {
    setActiveHomeTab(key)
    if (key === 'discover' || key === 'products') document.querySelector(key === 'discover' ? '.v3-discover' : '.v3-market')?.scrollIntoView({ behavior: 'smooth' })
    else if (key === 'compare') setCompareOpen(true)
    else onNavigate(key)
  }
  useEffect(() => {
    if (detailProduct) window.requestAnimationFrame(() => document.querySelector('.v3-detail-view')?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }, [detailProduct])
  useEffect(() => {
    const clearButton = document.querySelector('.v3-filter-panel .v3-clear')
    const resetRegion = () => updateFilter('region', 'Global')
    clearButton?.addEventListener('click', resetRegion)
    return () => clearButton?.removeEventListener('click', resetRegion)
  }, [updateFilter])
  useEffect(() => {
    const requestedProduct = products.find((product) => product.id === requestedProductId)
    if (requestedProduct) {
      setDetailProduct(requestedProduct)
      setDetailTab('overview')
      onProductRequestHandled()
    }
  }, [requestedProductId, products, onProductRequestHandled])
  return <div className={marketDark ? 'v3-marketplace v3-dark' : 'v3-marketplace'}>
    <div className="v3-topnote">Interactive trust catalogue · Demonstration and live source data · Informational decision support, not medical advice</div>
    <header className="v3-header"><div className="v3-header-inner"><button className="v3-brand" onClick={() => { setSearch(''); updateFilter('outcome', 'all'); selectHomeTab('discover') }}><img className="brand-mark" src="/truststack-mark.png" alt="" /><span><b>TrustStack</b><small>Find · Verify · Compare · Build</small></span></button><MarketplaceTabs active={activeHomeTab} onSelect={selectHomeTab} compareCount={compare.length} /><div className="v3-head-actions"><button className="v3-icon-button" onClick={() => document.querySelector('.v3-search')?.focus()} aria-label="Focus search">⌕</button><button className="v3-icon-button" onClick={() => setMarketDark((value) => !value)} aria-label="Toggle marketplace theme">◐</button></div></div></header>
    <section className="v3-hero v3-discover"><div className="v3-inner"><span className="v3-eyebrow">INDEPENDENT SUPPLEMENT INTELLIGENCE</span><h1>See what we know about supplements.</h1><p>Explore evidence, safety and verification status, including what has not been reviewed.</p><div className="v3-search-shell"><input className="v3-search" value={filters.q} onChange={(event) => setSearch(event.target.value)} placeholder="Search an ingredient or goal" aria-label="Search supplements" /><button onClick={() => document.querySelector('.v3-market')?.scrollIntoView()}>Search</button></div><div className="v3-hero-actions"><button onClick={() => document.querySelector('.v3-market')?.scrollIntoView()}>Browse entries</button></div><div className="v3-popular">Popular: <button onClick={() => setSearch('Creatine')}>Creatine</button><button onClick={() => setSearch('Vitamin D')}>Vitamin D</button><button onClick={() => setSearch('Magnesium')}>Magnesium</button><button onClick={() => setSearch('Protein')}>Protein</button></div><div className="v3-trust-strip"><span>Reviewed evidence stays separate</span><span>Product and batch status separated</span><span>Missing information is visible</span></div>{utilityMessage && <div className="v3-utility-message" role="status">{utilityMessage}</div>}</div></section>
    <section className="v3-section"><div className="v3-inner"><div className="v3-section-head"><div><span className="v3-eyebrow">BROWSE BY NEED</span><h2>What are you exploring?</h2></div><span>Choose a goal to refine the catalogue</span></div><div className="v3-goal-grid">{goals.map(([icon, label, value]) => <button key={label} onClick={() => updateFilter(value.startsWith('view-') ? 'productStatus' : 'outcome', value)}><i>{icon}</i><b>{label}</b></button>)}</div></div></section>
    {recommendations.length > 0 && <section className="v3-section v3-recommended"><div className="v3-inner"><h2>Reviewed starting points</h2><div className="v3-card-grid">{recommendations.map((product) => <V3ProductCard key={product.id} product={product} selected={product.id === selected?.id} onSelect={() => openDetail(product)} compare={compare} onCompare={onToggleCompare} saved={savedProducts.some((item) => item.id === product.id)} onSave={() => toggleSaved(product)} />)}</div></div></section>}
    <CatalogueCategories selected={filters.category} onChange={(category) => updateFilter('category', category)} />
    <section className="v3-section v3-market" id="v3-market"><div className="v3-inner"><div className="v3-section-head"><div><span className="v3-eyebrow">TRUST INTELLIGENCE</span><h2>Compare what we know</h2><p>Review evidence, verified documents and missing information for each ingredient entry.</p></div><span className="v3-catalogue-count">{products.length} entries in view</span></div><div className="v3-summary"><V3Stat value={products.length} label="Entries in view" /><V3Stat value={products.filter((product) => product.trustProfile?.evidence !== 'Unknown').length} label="Evidence reviewed" /><V3Stat value={products.filter((product) => product.trustProfile?.transparency === 'Label candidates identified').length} label="Label leads" /><V3Stat value={products.filter((product) => product.trustProfile?.recommendation === 'Assessment Pending').length} label="Assessment pending" /></div><div className="v3-market-layout"><aside className="v3-filter-panel"><h3>Filters</h3><label>Search<input value={filters.q} onChange={(event) => setSearch(event.target.value)} placeholder="Ingredient or category" /></label><label>Outcome<Select label="Outcome" value={filters.outcome} onChange={(value) => updateFilter('outcome', value)} options={outcomeOptions} /></label><label>Region<Select label="Region" value={filters.region} onChange={(value) => updateFilter('region', value)} options={['Global', 'UK', 'EU', 'US', 'Canada']} /></label><label>View<Select label="View" value={filters.productStatus} onChange={(value) => updateFilter('productStatus', value)} options={productStatusOptions} /></label><button className="v3-clear" onClick={() => { setSearch(''); updateFilter('outcome', 'all'); updateFilter('category', 'all'); updateFilter('productStatus', 'view-recommended') }}>Clear filters</button></aside><div className="v3-results"><div className="v3-results-head"><div><b>{filters.q ? `Results for “${filters.q}”` : 'Catalogue entries'}</b><small>{products.length} entries · View: {productStatusOptions.find((option) => option[0] === filters.productStatus)?.[1] || 'All entries'}</small></div><span>{compare.length ? `${compare.length}/4 selected` : 'Select entries to compare'}</span></div>{products.length ? products.map((product) => <V3ResultCard key={product.id} product={product} selected={product.id === selected?.id} status={statusLabel(product)} onSelect={() => openDetail(product)} compare={compare} onCompare={onToggleCompare} />) : <div className="v3-empty"><b>No entries match these filters</b><p>Try clearing a filter or searching another ingredient.</p></div>}</div></div>{compare.length > 0 && <div className="v3-compare-tray"><b>Compare</b>{compare.map((product) => <span key={product.id}>{product.name}</span>)}<small>Select 2–4 entries</small><button className="v3-secondary-button" onClick={() => setCompareOpen(true)}>Compare selected</button><button className="v3-text-button v3-clear-compare" onClick={onClearCompare}>Clear selection</button></div>}</div></section>
    <section className="v3-section v3-why"><div className="v3-inner"><span className="v3-eyebrow">WHY TRUST THE PLATFORM?</span><h2>Confidence without hiding complexity.</h2><div className="v3-why-grid"><article><i>▤</i><h3>Traceable evidence</h3><p>See what supports an assessment, what remains uncertain and when source information was reviewed.</p></article><article><i>⌾</i><h3>Verification separated</h3><p>Ingredient evidence, product transparency, batch records and seller status are shown as different questions.</p></article><article><i>£</i><h3>Comparable value</h3><p>Compare total price and cost per equivalent serving, with limitations disclosed.</p></article></div></div></section>
    {selected && <section className="v3-selected"><div className="v3-inner"><span className="v3-eyebrow">SELECTED ENTRY</span><h2>{selected.name}</h2><TrustProfile product={selected} compact /><button className="v3-primary-button" onClick={() => openDetail(selected)}>Inspect profile</button></div></section>}
    {detailProduct && <V3ProductDetail key={detailProduct.id} product={detailProduct} tab={detailTab} setTab={setDetailTab} saved={savedProducts.some((item) => item.id === detailProduct.id)} onSave={() => toggleSaved(detailProduct)} onClose={() => setDetailProduct(null)} onNavigate={onNavigate} onCompare={() => { if (!compare.some((item) => item.id === detailProduct.id)) onToggleCompare(detailProduct); setCompareOpen(true) }} onSimilar={() => { setSearch(''); updateFilter('outcome', 'all'); updateFilter('productStatus', 'view-recommended'); updateFilter('region', 'Global'); updateFilter('category', detailProduct.categories?.[0] || 'all'); setDetailProduct(null); document.querySelector('.v3-market')?.scrollIntoView({ behavior: 'smooth' }) }} />}
    {detailProduct && detailTab === 'testing' && <BatchRecords product={detailProduct} />}
    {compareOpen && <V3ComparePanel products={compare} onClose={() => setCompareOpen(false)} onInspect={(product) => { setCompareOpen(false); openDetail(product) }} />}
    <footer className="v3-footer"><div className="v3-inner">Supplement Trust Intelligence · Local catalogue · Informational decision support only, not medical advice</div></footer>
  </div>
}

function V3Stat({ value, label, tone }) { if (label === 'Assessment pending') return null; return <div className={tone ? `v3-stat toned ${tone}` : 'v3-stat'}><strong>{value ?? '—'}</strong><span>{label}{tone ? ` · ${productRating(value)[0]}` : ''}</span></div> }
function V3Value({ label, value }) { return <span className={`metric-chip ${scoreTone(value)}`}><i />{label} {value}</span> }
function V3Rating({ score }) { const [label, tone] = productRating(score); return <span className={`v3-rating ${tone}`}><i />{label} rating</span> }
function IngredientBadge({ assessment }) {
  const current = assessment?.score != null && assessment.context?.outcome && assessment.context?.region
    && (!assessment.nextReviewAt || Date.parse(assessment.nextReviewAt) >= Date.now())
  return <span className={current ? `ingredient-badge ${scoreTone(assessment.score)}` : 'ingredient-badge pending'} title="Any human-reviewed profile is separate from TrustStack's source-record mapping.">{current ? `Separate human-reviewed profile · ${assessment.context.outcome} · ${assessment.context.region}` : 'No human-reviewed ingredient profile on file'}</span>
}
function TrustProfile({ product, compact = false }) {
  const profile = product.trustProfile
  if (!profile) return <p>Trust profile unavailable</p>
  const evidence = product.ingredientEvidenceProfile
  const mappedAreas = product.sourceReview?.layerScores?.filter((layer) => layer.weight > 0 && layer.score > 0).length || 0
  return <div className="trust-profile">
    <div className="best-case"><small>INFORMATION AVAILABILITY</small><strong>{mappedAreas ? `${mappedAreas} source areas contain records` : 'No linked source records'}</strong><span>Source presence does not imply efficacy, safety or product quality.</span></div>
    <div className="status-row"><span className="pill published">{evidence?.publishable ? 'Separate human-reviewed profile on file' : 'No human-reviewed profile on file'}</span><span className="pill product-state">{product.trustProfile?.productTransparencyProfile?.labelAvailable ? 'Exact label record on file' : product.trustProfile?.transparency === 'Label candidates identified' ? 'Label candidates found' : 'No exact label record found'}</span></div>
    {evidence?.publishable && <div className="evidence-profile-summary"><small>INGREDIENT EVIDENCE PROFILE · {evidence.outcome} · {evidence.region}</small><strong>{evidence.certainty} certainty · {evidence.direction}</strong><span>Safety: {evidence.safety} · Directness: {evidence.directness} · Consistency: {evidence.consistency}</span></div>}
    <span>Information Coverage {profile.completeness.percent}% ({profile.completeness.completed}/{profile.completeness.required} weighted domains with information)</span>
    {!compact && <>
      <dl>{[['Evidence', profile.evidence], ['Safety', profile.safety], ['Transparency', profile.transparency], ['Independent verification', profile.verification], ['Regulatory', profile.regulatory], ['Exact batch', profile.batch]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {evidence?.publishable && <div className="evidence-profile-details"><b>Search strategy</b><span>{evidence.searchStrategy} · Last searched {evidence.lastSearched} · Reviewed {evidence.reviewedAt} · {evidence.methodologyVersion}</span><b>Included evidence</b>{evidence.sources?.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.source || source.sourceType || 'Source'} · {source.title || source.id || source.url}</a>)}</div>}
      <p>{profile.completeness.scope} A research lead is not evidence of benefit or a recommendation to buy.</p>
      <ul>{profile.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
    </>}
  </div>
}
function recommendationTone(decision) {
  return { 'Worth Comparing': 'strong', 'Evidence Available': 'information', 'Needs More Evidence': 'partial', 'Hold For Now': 'unknown', 'Review Warning': 'warning' }[decision] || 'unknown'
}

function EntryCardContent({ product }) {
  const profile = product.trustProfile || {}
  const sourceReview = product.sourceReview || {}
  const decision = profile.overallState === 'material_warning' ? 'Review Warning' : sourceReview.recommendationClass || 'Hold For Now'
  const decisionTone = recommendationTone(decision)
  const coverage = Math.max(0, Math.min(100, Number(profile.completeness?.percent) || 0))
  const recordSummary = sourceAvailabilitySummary(product)
  const cardLayerKeys = new Set(['ingredientEvidence', 'productQuality', 'safety', 'transparency'])
  const fields = sourceReview.layerScores?.length
    ? sourceReview.layerScores.filter((layer) => cardLayerKeys.has(layer.key))
    : assessmentLayerRows(product).map(([label, status]) => ({ label, status, tone: 'unknown' }))
  const checkedDate = sourceReview.checkedAt && Number.isFinite(Date.parse(sourceReview.checkedAt)) ? new Date(sourceReview.checkedAt).toLocaleDateString() : null
  return <>
    <div className="entry-top"><span className="category">{product.categories?.join(' · ') || 'Catalogue entry'}</span><div className="entry-title-row"><h3>{product.name}</h3><span className="decision-chip" data-tone={decisionTone}>{decision}</span></div></div>
    <div className="card-status" aria-label="TrustStack information statuses">{fields.map(({ key, label, status, tone }) => <div className="status-item" key={key || label} data-tone={tone || 'unknown'}><b>{label}</b><span><i aria-hidden="true" />{status || 'Unknown'}</span></div>)}</div>
    <div className="coverage"><div className="coverage-head"><span>Information Coverage</span><span>{coverage}%</span></div><div className="coverage-track" role="meter" aria-label="Information Coverage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={coverage}><div className="coverage-fill" style={{ width: `${coverage}%` }} /></div></div>
    <p className="card-note" aria-label="Linked information summary" title={recordSummary}>{recordSummary}</p>
  </>
}
function assessmentLayerRows(product) {
  const layers = product.trustProfile?.layers || {}
  const ingredient = product.ingredientEvidenceProfile || {}
  const safety = layers.safety || {}
  const value = layers.value || {}
  const costDetails = value.costPerServing != null ? [
    `${value.currency || ''} ${value.costPerServing.toFixed(2)} per serving`,
    value.costPerEffectiveServing != null && `${value.currency || ''} ${value.costPerEffectiveServing.toFixed(2)} per reviewed effective serving`,
    value.costPerGram != null && `${value.currency || ''} ${value.costPerGram.toFixed(2)} per gram`,
    value.subscriptionCost != null && `${value.currency || ''} ${value.subscriptionCost.toFixed(2)} subscription`,
    value.deliveryCost != null && `${value.currency || ''} ${value.deliveryCost.toFixed(2)} delivery`,
  ].filter(Boolean).join(' · ') : 'No reviewed comparable exact-product offer.'
  return [
    ['Ingredient evidence', ingredient.publishable ? 'Separate human-reviewed profile on file' : 'No human-reviewed profile on file', 'Linked source records do not establish benefit.'],
    ['Product quality', layers.productQuality?.status || 'Unknown', layers.productQuality?.level ? `${layers.productQuality.provider} · ${layers.productQuality.level} · ${layers.productQuality.scope || 'Reviewed product scope'}` : 'No independent testing is confirmed for an exact retail product.'],
    ['Batch verification', layers.batchVerification?.status || 'Batch Unknown', layers.batchVerification?.batchNumber ? `Lot ${layers.batchVerification.batchNumber} · report ${layers.batchVerification.reportDate || 'date unavailable'}` : 'No reviewed certificate covers an identified lot.'],
    ['Safety', safety.status || 'Unknown', [safety.context, safety.interactionRisk === true && 'Medicine interactions flagged', safety.sportsWarning === true && 'Sport suitability warning'].filter(Boolean).join(' · ') || 'Dose, population, medicines and duration need review.'],
    ['Transparency', layers.transparency?.status || 'Unknown', layers.transparency?.status === 'Label candidates only' ? 'Name-matched labels do not verify this product.' : layers.transparency?.details?.length ? layers.transparency.details.join(' · ') : 'Review exact ingredients, amounts, manufacturer and test disclosure.'],
    ['Value', value.status || 'Unknown', costDetails],
  ]
}
function V3ProductCard({ product, selected, onSelect, compare, onCompare, saved, onSave }) {
  return <article className={selected ? 'v3-product-card decision-entry selected' : 'v3-product-card decision-entry'}><EntryCardContent product={product} /><div className="card-actions"><button className="v3-primary-button" onClick={onSelect}>See evidence and limitations</button><button className="v3-secondary-button" onClick={onSave} title={`${saved ? 'Remove' : 'Save'} ${product.name}`} aria-label={`${saved ? 'Remove' : 'Save'} ${product.name}`}>{saved ? '♥' : '♡'}</button><label><input type="checkbox" checked={compare.some((item) => item.id === product.id)} onChange={() => onCompare(product)} /> Compare</label></div></article>
}
function V3ResultCard({ product, selected, status, onSelect, compare, onCompare }) {
  return <article className={selected ? 'v3-result-card decision-entry selected' : 'v3-result-card decision-entry'}><EntryCardContent product={product} /><div className="card-actions"><button className="v3-primary-button" onClick={onSelect}>See evidence and limitations</button><label><input type="checkbox" checked={compare.some((item) => item.id === product.id)} onChange={() => onCompare(product)} /> Compare</label></div></article>
  if (product.status === 'Not assessed') return <article className="v3-result-card"><div className="v3-result-image">◇</div><div><span className="v3-muted">{product.categories?.join(' · ')}</span><h3>{product.name}</h3><span className="v3-badge">Product not assessed</span><div><IngredientBadge assessment={product.ingredientAssessment} /></div><p className="v3-alert-line">No product-specific assessment, verified batch or price has been recorded.</p></div><div className="v3-result-actions"><strong>—<small> product trust</small></strong><button className="v3-primary-button" onClick={onSelect}>View</button><label><input type="checkbox" checked={compare.some((item) => item.id === product.id)} onChange={() => onCompare(product)} /> Compare</label></div></article>
  const [, tone] = productRating(product.score)
  return <article className={selected ? 'v3-result-card selected' : 'v3-result-card'}><div className="v3-result-image">{product.type === 'Vitamin' ? '☀' : product.type === 'Botanical' ? '✦' : '◈'}</div><div><span className="v3-muted">{product.brand}</span><h3>{product.name}</h3><IngredientBadge assessment={product.ingredientAssessment} /><V3Rating score={product.score} /><div className="v3-badge green">Product {product.score} · {status}</div><div className="metric-chip-row"><V3Value label="Evidence" value={product.evidence} /><V3Value label="Safety" value={product.safety} /><V3Value label="Quality" value={product.quality} /><V3Value label="Transparency" value={product.transparency} /><V3Value label="Regulatory" value={product.regulatory} /></div><p className="v3-good-line">✓ {product.bestFor}</p><p className="v3-alert-line">! {product.evidenceProfile?.nextVerification || 'Confirm the exact product, dose and current batch.'}</p></div><div className="v3-result-actions"><strong className={`v3-trust-value ${tone}`}>{product.score}<small> product trust</small></strong><button className="v3-primary-button" onClick={onSelect}>View</button><label><input type="checkbox" checked={compare.some((item) => item.id === product.id)} onChange={() => onCompare(product)} /> Compare</label></div></article>
}

function V3ComparePanel({ products, onClose, onInspect }) {
  return <CompareSummary products={products} onClose={onClose} onInspect={onInspect} />
  return <div className="v3-modal-backdrop" role="dialog" aria-modal="true" aria-label="Compare selected products"><section className="v3-compare-modal"><div className="v3-modal-head"><div><span className="v3-eyebrow">PRODUCT COMPARISON</span><h2>Compare selected products</h2></div><button className="v3-icon-button" onClick={onClose} aria-label="Close comparison">×</button></div>{products.length < 2 ? <div className="v3-empty"><b>Select at least two products</b><p>Use the Compare checkboxes on product cards to build a comparison.</p></div> : <div className="v3-compare-table"><div className="v3-compare-row header"><b>Trust dimension</b>{products.map((product) => <b key={product.id}>{product.name}</b>)}</div>{[['Ingredient Trust Rating', (product) => <IngredientBadge assessment={product.ingredientAssessment} />], ['Product rating', (product) => product.status === 'Not assessed' ? 'Not assessed' : <V3Rating score={product.score} />], ['Product Trust', (product) => product.status === 'Not assessed' ? '—' : product.score], ['Evidence', (product) => product.status === 'Not assessed' ? '—' : <V3Value label="" value={product.evidence} />], ['Safety', (product) => product.status === 'Not assessed' ? '—' : <V3Value label="" value={product.safety} />], ['Quality', (product) => product.status === 'Not assessed' ? '—' : <V3Value label="" value={product.quality} />], ['Transparency', (product) => product.status === 'Not assessed' ? '—' : <V3Value label="" value={product.transparency} />], ['Regulatory', (product) => product.status === 'Not assessed' ? '—' : <V3Value label="" value={product.regulatory} />], ['Value', (product) => product.status === 'Not assessed' ? '—' : product.value], ['Key limitation', (product) => product.evidenceProfile?.nextVerification || 'Confirm exact product and batch.']].map(([label, render]) => <div className="v3-compare-row" key={label}><b>{label}</b>{products.map((product) => <span key={product.id}>{render(product)}</span>)}</div>)}</div>}</section></div>
}

function SellerBuyLink({ offer }) {
  return offer.sellerUrl
    ? <a className="seller-buy-link" href={offer.sellerUrl} target="_blank" rel="noopener noreferrer" aria-label={`Buy it now at ${offer.supplier} (opens seller website in a new tab)`}>Buy it now ↗</a>
    : <span className="muted">Seller link unavailable</span>
}

function OfficialReferenceFindings({ references = [], generalReferences = [] }) {
  if (!references.length && !generalReferences.length) return null
  return <details className="v3-profile-source-disclosure"><summary>Official reference findings</summary>
    <ul className="source-screen-leads">{references.map((reference, index) => <li key={`${reference.url}-${index}`}>
      <a href={reference.url} target="_blank" rel="noopener noreferrer">{reference.title}</a>
      <span>{reference.source}{reference.sourceUpdatedAt ? ` · source updated ${reference.sourceUpdatedAt}` : ''}{reference.analysedAt ? ` · analysed ${reference.analysedAt}` : ''}</span>
      {reference.referenceScope && <p>{reference.referenceScope}</p>}
      {reference.evidenceSummary && <p><b>Evidence context: </b>{reference.evidenceSummary}</p>}
      {reference.safetySummary && <p><b>Safety documentation: </b>{reference.safetySummary}</p>}
      {reference.retrievalMethod && <span>{reference.retrievalMethod}. Ingredient guidance only, not product certification or personal suitability.</span>}
    </li>)}</ul>
    {generalReferences.map((reference) => <div key={reference.url}><h4><a href={reference.url} target="_blank" rel="noopener noreferrer">{reference.title}</a></h4><p>{reference.summary}</p><p>{reference.scope}</p></div>)}
  </details>
}

function V3ProductDetail({ product, tab, setTab, saved, onSave, onClose, onNavigate, onCompare, onSimilar }) {
  return <TrustProfileDetail product={product} tab={tab} setTab={setTab} saved={saved} onSave={onSave} onClose={onClose} onNavigate={onNavigate} onCompare={onCompare} onSimilar={onSimilar} VariantsPanel={ProductVariantsPanel} />
  const trustProfile = product.trustProfile || {}
  const sourceReview = product.sourceReview || {}
  const ingredientEvidence = product.ingredientEvidenceProfile || {}
  const layerRows = sourceReview.layerScores || []
  const coverageValue = sourceReview.informationCoverageScore ?? trustProfile.completeness?.percent ?? 0
  const decisionText = sourceReview.recommendationNote || 'Current information is not sufficient to support a stronger classification.'
  const checkedDate = sourceReview.checkedAt && Number.isFinite(Date.parse(sourceReview.checkedAt)) ? new Date(sourceReview.checkedAt).toLocaleDateString() : null
  return <section className="v3-detail-view"><div className="v3-inner">
    <div className="v3-detail-top"><span>Trust profile · {product.categories?.join(' · ')}</span><button className="v3-icon-button" onClick={onClose} aria-label="Close evidence and limitations" title="Close">×</button></div>
    <div className="v3-profile-heading"><div><span className="v3-eyebrow">TRUSTSTACK INFORMATION PROFILE</span><h2>{product.name}</h2><div className="v3-profile-tags"><span className="v3-profile-tag">{sourceReview.registryMatchCount || sourceReview.researchLeadCount || sourceReview.labelCandidateCount ? 'Source records found' : 'No mapped source records'}</span><span className="v3-profile-tag recommendation-label" data-tone="unknown">Information availability</span></div></div><div className="v3-profile-coverage"><strong>{coverageValue}%</strong><span>Information Coverage</span></div></div>
    <div className="v3-detail-panel v3-trust-profile-panel">
      <div className="v3-trust-layer-grid">{layerRows.map((layer) => <div className="v3-trust-layer-cell" key={layer.key} data-tone={layer.tone || 'unknown'}><b>{layer.label}</b><strong><i aria-hidden="true" />{layer.status}</strong></div>)}</div>
      <div className="v3-profile-decision" data-tone={recommendationTone(sourceReview.recommendationClass)}><small>DECISION NOTE</small><strong>{sourceReview.recommendationClass || 'Hold For Now'}</strong><span>{decisionText}</span></div>
      <section className="v3-profile-evidence"><span className="v3-eyebrow">INGREDIENT EVIDENCE PROFILE</span><h3>{ingredientEvidence.publishable ? `${ingredientEvidence.direction} · ${ingredientEvidence.certainty} certainty` : 'Evidence information'}</h3><p>{ingredientEvidence.publishable ? `${ingredientEvidence.outcome || 'Defined outcome'} · ${ingredientEvidence.region || 'Region not specified'} · ${ingredientEvidence.population || 'Population not specified'} · ${ingredientEvidence.doseRange || 'Dose not specified'}` : `${sourceReview.researchLeadCount || 0} research leads are available for screening. Their titles and registry details describe information availability; they do not establish effectiveness or suitability.`}</p></section>
      <section className="v3-profile-product-questions"><h3>Separate product questions</h3><ul><li>Product verification: {layerRows.find((layer) => layer.key === 'productQuality')?.status || 'Unknown'}</li><li>Batch verification: {layerRows.find((layer) => layer.key === 'batchVerification')?.status || 'Unknown'}</li><li>Label candidates: {sourceReview.labelCandidateCount || 0}; exact product association is not established by a name match.</li></ul></section>
      <OfficialReferenceFindings references={sourceReview.officialReferences} generalReferences={sourceReview.generalReferences} />
      <details className="v3-profile-source-disclosure"><summary>Source records and methodology notes{checkedDate ? ` · checked ${checkedDate}` : ''}</summary><p>{sourceReview.researchLeadCount || 0} research leads · {sourceReview.registryMatchCount || 0} registry matches · {sourceReview.labelCandidateCount || 0} label candidates. Batch Verification and Value are separate from the four-layer coverage formula. Safety bands describe documentation availability, not clinical risk.</p><ul className="source-layer-notes">{(sourceReview.layerInterpretations || []).map((item) => <li key={item.layer}><b>{item.layer}: {item.signal}</b><span>{item.interpretation}</span></li>)}</ul>{sourceReview.researchLeads?.length > 0 && <><h4>Research leads</h4><ul className="source-screen-leads">{sourceReview.researchLeads.map((lead) => <li key={lead.url}><a href={lead.url} target="_blank" rel="noopener noreferrer">{lead.title}</a><span>{lead.source}{[lead.journal, lead.year].filter(Boolean).length ? ` · ${[lead.journal, lead.year].filter(Boolean).join(' · ')}` : ''}</span></li>)}</ul></>}{sourceReview.registryMatches?.length > 0 && <><h4>Registry matches</h4><ul className="source-screen-leads">{sourceReview.registryMatches.map((match, index) => <li key={`${match.source}-${index}`}>{match.url ? <a href={match.url} target="_blank" rel="noopener noreferrer">{match.title}</a> : <b>{match.title}</b>}<span>{match.source} · {match.role}</span></li>)}</ul></>}{<ProductVariantsPanel product={product} />}<SourceCoveragePanel product={product} /></details>
      <div className="v3-profile-actions"><button className="v3-secondary-button" onClick={onSave}>{saved ? 'Saved' : 'Save profile'}</button><button className="v3-text-button" onClick={() => onNavigate('methodology')}>View methodology</button></div>
    </div>
  </div></section>
  const tabs = ['overview', 'evidence', 'safety', 'testing', 'prices', 'seller', 'reviews']
  const prices = product.prices || []
  const [batch, setBatch] = useState('')
  const batchVerified = product.evidenceProfile?.sourceRecords?.some((record) => record.type === 'Batch certificate' && record.status === 'Verified')
  const [, tone] = productRating(product.score)
  if (product.status === 'Not assessed') return <section className="v3-detail-view"><div className="v3-inner"><div className="v3-detail-top"><button className="v3-text-button" onClick={onClose}>← Products</button></div><div className="v3-detail-panel"><span className="v3-eyebrow">CATALOGUE ENTRY</span><h2>{product.name}</h2><p>{product.categories?.join(' · ')}</p><div className="v3-empty"><h3>Not assessed</h3><p>This entry has no product-specific scoring, supplier offer or batch evidence. A zero placeholder is not a safety or efficacy rating.</p><button className="v3-secondary-button" onClick={() => onNavigate('sources')}>View source registry</button></div></div></div></section>
  return <section className="v3-detail-view"><div className="v3-inner"><div className="v3-detail-top"><button className="v3-text-button" onClick={onClose}>← Products</button><span className="v3-muted">/ {product.category} / {product.name}</span></div><div className="v3-detail-hero"><div className="v3-detail-image">{product.type === 'Vitamin' ? '☀' : product.type === 'Botanical' ? '✦' : '◈'}</div><div><span className="v3-eyebrow">{product.brand}</span><h2>{product.name}</h2><V3Rating score={product.score} /><div className="v3-detail-score"><div className={`v3-score-ring ${tone}`}>{product.score}</div><div><b>{product.score >= 80 ? 'Strong catalogue candidate' : product.score >= 60 ? 'Consider with conditions' : 'Further review required'}</b><small>Trust score · {product.confidence} source confidence</small></div><button className="v3-text-button" onClick={() => onNavigate('methodology')}>Why this score? →</button></div><div className="v3-detail-notes"><div><b>Why it stands out</b><span>{product.bestFor}</span></div><div className="warning"><b>Key limitation</b><span>{product.evidenceProfile?.nextVerification || 'Confirm the exact product, dose and current batch.'}</span></div></div><div className="v3-detail-actions"><button className="v3-primary-button" onClick={() => setTab('prices')}>Compare prices</button><button className="v3-secondary-button" onClick={onSave}>{saved ? '♥ Saved' : '♡ Save product'}</button><button className="v3-secondary-button" onClick={() => setTab('testing')}>Check batch</button></div></div></div><nav className="v3-detail-tabs" aria-label="Product detail sections">{tabs.map((item) => <button className={tab === item ? 'active' : ''} key={item} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</nav>{tab === 'overview' && <div className="v3-detail-panel"><div className="v3-detail-grid"><V3DetailCard title="Why it stands out" text={product.recommendation} /><V3DetailCard title="Check before use" text={product.evidenceProfile?.interactionStatus || 'Review medicines, health conditions, age and intended dose with an appropriately qualified professional.'} warning /><V3DetailCard title="Verification status" text={batchVerified ? 'A verified batch record is linked.' : 'The exact retail batch is not currently verified.'} /></div><h3>Data completeness</h3><div className="v3-completeness"><V3Stat value={product.evidence} label="Evidence" tone={scoreTone(product.evidence)} /><V3Stat value={product.safety} label="Safety" tone={scoreTone(product.safety)} /><V3Stat value={product.transparency} label="Transparency" tone={scoreTone(product.transparency)} /><V3Stat value={product.quality} label="Quality" tone={scoreTone(product.quality)} /><V3Stat value={product.regulatory} label="Regulatory" tone={scoreTone(product.regulatory)} /><V3Stat value={batchVerified ? 'Verified' : 'Unknown'} label="Batch" /><V3Stat value={product.value} label="Value" /></div></div>}{tab === 'evidence' && <div className="v3-detail-panel"><span className={`metric-chip ${scoreTone(product.evidence)}`}><i />Evidence {product.evidence} / 100</span><h3>What current evidence supports</h3><p>{product.evidenceProfile?.evidenceMatch || product.recommendation}</p><h3>What remains uncertain</h3><p>Evidence may not apply to every population, formulation, dose, duration or individual circumstance. Product experience does not alter the evidence rating.</p></div>}{tab === 'safety' && <div className="v3-detail-panel"><span className="v3-badge amber">Personal context required</span><h3>Review before use</h3><p>{product.evidenceProfile?.interactionStatus || 'Review potential interactions and personal suitability before use.'}</p><p>{product.evidenceProfile?.populationWarnings || 'Age, life stage, health conditions, dose and duration can affect suitability.'}</p></div>}{tab === 'testing' && <div className="v3-detail-panel"><span className="v3-badge grey">Product and batch</span><h3>Verification status</h3><p>{batchVerified ? 'A verified batch record is linked to this product.' : 'No verified product-specific batch information is currently available.'}</p><div className="v3-batch-check"><h4>Check your product batch</h4><div><input value={batch} onChange={(event) => setBatch(event.target.value)} placeholder="Enter batch number" /><button className="v3-primary-button" onClick={() => setBatch(batch.trim() ? `Checked: ${batch.trim()} · no verified match found` : 'Enter a batch number to check')}>Check</button></div>{batch && <p role="status">{batch.includes('DEMO') ? `Demonstration batch ${batch} found. Confirm certificate scope.` : `Batch ${batch} is not in the verified local catalogue.`}</p>}</div></div>}{tab === 'prices' && <div className="v3-detail-panel"><h3>Compare offers</h3><p>Indicative catalogue prices only. Buy it now opens the seller website, not a verified product listing. Check the exact product, batch, price and availability there.</p>{prices.length ? <div className="v3-price-table">{prices.map((price) => <div key={price.supplier}><div><b>{price.supplier}</b><small className="seller-inline-status">{price.sellerIdentityStatus || 'Seller profile pending'}</small></div><span>£{price.price.toFixed(2)}</span><small>£{(price.price / price.servings).toFixed(2)} per serving</small><span className="seller-inline-score">Seller Trust {price.sellerTrustScore ?? '—'}/100</span><div className="seller-offer-actions"><button className="v3-secondary-button" onClick={() => setTab('seller')}>View seller</button><SellerBuyLink offer={price} /></div></div>)}</div> : <p>No offers are available for this product yet.</p>}</div>}{tab === 'seller' && <SellerTrustPanel prices={prices} product={product} />}{tab === 'reviews' && <div className="v3-detail-panel"><h3>Customer experience</h3><p>Reviews are kept separate from scientific evidence and do not change the Trust Score.</p><V3DetailCard title="Seller service" text="Seller identity, delivery, returns and exact batch should be assessed separately." /></div>}</div></section>
}
function SellerTrustPanel({ prices, product }) {
  const sellers = [...new Map(prices.map((price) => [price.supplier, price])).values()]
  const bestSeller = sellers.sort((left, right) => (right.sellerTrustScore || 0) - (left.sellerTrustScore || 0))[0]
  if (!bestSeller) return <div className="v3-detail-panel"><h3>Seller Trust</h3><p>No seller profiles are available for this product yet.</p></div>
  const dimensions = [['Authenticity history', bestSeller.authenticityHistory], ['Returns', bestSeller.returnsScore], ['Documentation', bestSeller.documentationScore], ['Response time', bestSeller.responseTimeScore]]
  return <div className="v3-detail-panel seller-panel"><div className="seller-panel-hero"><div><span className="v3-eyebrow">SELLER TRUST</span><h3>{bestSeller.supplier}</h3><p>{bestSeller.sellerEvidenceNote || 'Catalogue seller assessment. Product and batch verification remain separate.'}</p></div><div className="seller-trust-score"><strong>{bestSeller.sellerTrustScore}/100</strong><span>Seller Trust</span></div></div><div className="seller-status-grid"><span><b>Identity</b>{bestSeller.sellerIdentityStatus}</span><span><b>Manufacturer relationship</b>{bestSeller.manufacturerRelationship}</span><span><b>Last reviewed</b>{bestSeller.sellerLastReviewed ? new Date(bestSeller.sellerLastReviewed).toLocaleDateString() : 'Not available'}</span></div><div className="seller-dimensions">{dimensions.map(([label, value]) => <div key={label}><span><b>{label}</b><small>{value}/5</small></span><div className="seller-stars" aria-label={`${label}: ${value} out of 5`}>{'★'.repeat(value || 0)}<i>{'★'.repeat(Math.max(0, 5 - (value || 0)))}</i></div></div>)}</div><div className="seller-separation"><b>Trust separation</b><span>Product: assessed separately · Batch: verify the exact batch · Seller: {bestSeller.supplier} catalogue assessment</span></div><h3>Other sellers for this product</h3><div className="seller-list">{sellers.map((seller) => <div key={seller.supplier}><b>{seller.supplier}</b><span>Seller Trust {seller.sellerTrustScore ?? '—'}/100</span><small>{seller.sellerIdentityStatus || 'Profile pending'}</small></div>)}</div></div>
}

function BatchRecords({ product }) {
  const [batches, setBatches] = useState([])
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ batchNumber: '', manufacturer: '', manufactureDate: '', expiryDate: '', laboratory: '', certificateUrl: '', testMethod: '', results: '' })
  useEffect(() => { fetch(`/api/products/${product.id}/batches`).then((response) => response.json()).then(setBatches).catch(() => setMessage('Batch records could not be loaded.')) }, [product.id])
  async function saveBatch(event) {
    event.preventDefault()
    const response = await fetch(`/api/products/${product.id}/batches`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-reviewer': 'local reviewer' }, body: JSON.stringify(form) })
    const result = await response.json()
    if (!response.ok) { setMessage(result.message || 'Batch record could not be saved.'); return }
    setBatches((current) => [{ ...form, id: result.id, batchNumber: form.batchNumber, status: 'Pending review', createdAt: new Date().toISOString() }, ...current])
    setForm({ batchNumber: '', manufacturer: '', manufactureDate: '', expiryDate: '', laboratory: '', certificateUrl: '', testMethod: '', results: '' })
    setMessage('Batch record saved for human review. It is not verified yet.')
  }
  return <section className="v3-batch-records"><div className="v3-section-head"><div><span className="v3-eyebrow">PRODUCT-SPECIFIC BATCH DATA</span><h2>Check the exact batch</h2><p>Record a batch certificate or laboratory report against {product.name}. A saved record remains unverified until an authorised reviewer checks the evidence.</p></div><span className="v3-badge grey">{batches.length} record{batches.length === 1 ? '' : 's'}</span></div><form className="v3-batch-form" onSubmit={saveBatch}><label>Batch number<input required value={form.batchNumber} onChange={(event) => setForm({ ...form, batchNumber: event.target.value })} placeholder="e.g. ABC-2026-01" /></label><label>Manufacturer<input value={form.manufacturer} onChange={(event) => setForm({ ...form, manufacturer: event.target.value })} /></label><label>Manufacture date<input type="date" value={form.manufactureDate} onChange={(event) => setForm({ ...form, manufactureDate: event.target.value })} /></label><label>Expiry date<input type="date" value={form.expiryDate} onChange={(event) => setForm({ ...form, expiryDate: event.target.value })} /></label><label>Laboratory<input value={form.laboratory} onChange={(event) => setForm({ ...form, laboratory: event.target.value })} /></label><label>Certificate URL<input type="url" value={form.certificateUrl} onChange={(event) => setForm({ ...form, certificateUrl: event.target.value })} placeholder="https://..." /></label><label>Test method<input value={form.testMethod} onChange={(event) => setForm({ ...form, testMethod: event.target.value })} placeholder="e.g. HPLC" /></label><label>Results<textarea value={form.results} onChange={(event) => setForm({ ...form, results: event.target.value })} placeholder="Record the certificate or laboratory result summary" /></label><button className="v3-primary-button" type="submit">Save batch record</button></form>{message && <p className="v3-utility-message" role="status">{message}</p>}{batches.length ? <div className="v3-batch-list">{batches.map((batch) => <article className="v3-batch-card" key={batch.id}><div><b>{batch.batchNumber}</b><span>{batch.manufacturer || 'Manufacturer not recorded'} · {batch.laboratory || 'Laboratory not recorded'}</span><small>{batch.results || 'No result summary recorded.'}</small></div><span className={`v3-batch-status ${batch.status === 'Verified' ? 'verified' : batch.status === 'Rejected' ? 'rejected' : 'pending'}`}>{batch.status}</span></article>)}</div> : <div className="v3-empty"><b>No product-specific batch records yet</b><p>Upload or record the exact batch certificate details above.</p></div>}</section>
}
function V3DetailCard({ title, text, warning = false }) { return <article className={warning ? 'v3-detail-card warning' : 'v3-detail-card'}><b>{title}</b><p>{text}</p></article> }

function ProductMarketplace({ products, selected, filters, updateFilter, setSelectedId, compare, onToggleCompare }) {
  const groups = [
    ['Recommended for you', products.filter((product) => product.score >= 80)],
    ['Worth a closer look', products.filter((product) => product.score >= 60 && product.score < 80)],
    ['Needs verification', products.filter((product) => product.score < 60)],
  ].filter(([, items]) => items.length)
  return <section className="marketplace" aria-label="Supplement marketplace"><div className="marketplace-intro"><div><span className="eyebrow">TRUST-LED PRODUCT DISCOVERY</span><h2>Find the right supplement for your outcome.</h2><p>Start with your goal, then compare the evidence, safety signals, verification status and value behind each product.</p></div><div className="marketplace-count"><strong>{products.length}</strong><span>products in view</span></div></div><div className="marketplace-toolbar"><input value={filters.q} onChange={(event) => updateFilter('q', event.target.value)} placeholder="Search by supplement, brand or ingredient" aria-label="Search the product catalogue" /><Select label="Outcome" value={filters.outcome} onChange={(value) => updateFilter('outcome', value)} options={outcomeOptions} /><Select label="Region" value={filters.region} onChange={(value) => updateFilter('region', value)} options={['Global', 'UK', 'EU', 'US', 'Canada']} /><Select label="Sort" value={filters.productStatus} onChange={(value) => updateFilter('productStatus', value)} options={productStatusOptions} /></div><div className="marketplace-meta"><span>Showing products with a traceable trust profile</span><span>{compare.length ? `${compare.length} selected for comparison` : 'Select up to four to compare'}</span></div><div className="marketplace-groups">{groups.map(([label, items]) => <div className="marketplace-group" key={label}><div className="marketplace-group-heading"><h3>{label}</h3><span>{items.length}</span></div><div className="marketplace-cards">{items.map((product) => <article className={product.id === selected?.id ? 'market-card selected' : 'market-card'} key={product.id}><button className="market-card-main" onClick={() => setSelectedId(product.id)}><span className="market-card-type">{product.type} · {product.category}</span><h4>{product.name}</h4><p>{product.bestFor}</p><div className="market-card-footer"><span><b className={scoreTone(product.score)}>{product.score}</b><small>trust</small></span><span><b>{product.evidence}</b><small>evidence</small></span><span><b>{product.safety}</b><small>safety</small></span></div></button><label className="compare-toggle"><input type="checkbox" checked={compare.some((item) => item.id === product.id)} onChange={() => onToggleCompare(product)} /> Compare</label></article>)}</div></div>)}</div>{!groups.length && <p className="muted marketplace-empty">No products match these filters. Try broadening the outcome or search.</p>}</section>
}

function MyGoalsPage({ products, onSelectProduct, onNavigate }) {
  const [goal, setGoal] = useState('performance')
  const [age, setAge] = useState('43')
  const [location, setLocation] = useState('UK')
  const [testedSport, setTestedSport] = useState(true)
  const [budget, setBudget] = useState('30')
  const [submitted, setSubmitted] = useState(false)
  const goalTopics = { performance: 'strength and exercise performance', 'muscle-growth': 'strength and exercise performance', sleep: 'sleep', stress: 'stress and mood', 'joint-health': 'joint health', energy: 'metabolic health', 'heart-health': 'cardiovascular health' }
  const goalLeads = products.filter((product) => product.bestCase?.goal === goalTopics[goal])
  return <section className="goals-page"><section className="goals-hero"><span className="section-kicker">YOUR CONTEXT</span><h2>Explore by goal</h2><p>Research leads are a starting point, not evidence that an ingredient works for you.</p></section><div className="goals-form panel"><div className="goals-fields"><label>Goal<select value={goal} onChange={(event) => setGoal(event.target.value)}><option value="performance">Increase strength</option><option value="muscle-growth">Build muscle</option><option value="sleep">Improve sleep</option><option value="stress">Manage stress</option><option value="joint-health">Support joint health</option><option value="energy">Support energy</option><option value="heart-health">Support heart health</option></select></label><label>Age<input type="number" min="13" max="120" value={age} onChange={(event) => setAge(event.target.value)} /></label><label>Location<select value={location} onChange={(event) => setLocation(event.target.value)}><option>UK</option><option>EU</option><option>US</option><option>Canada</option><option>Global</option></select></label><label>Budget (£)<input type="number" min="0" value={budget} onChange={(event) => setBudget(event.target.value)} /></label><label className="goal-toggle"><input type="checkbox" checked={testedSport} onChange={(event) => setTestedSport(event.target.checked)} /><span>Tested sport priority</span></label></div></div><div className="goals-results"><h3>Research leads for this goal</h3><p>{goalLeads.length ? `These ${goalLeads.length} entries have a study lead related to this goal; benefit, suitability and products remain unverified for ${location}.` : 'No relevant human-study lead passed this search for the selected goal. That does not establish ineffectiveness.'}</p><div className="goal-recommendation-grid">{goalLeads.map((product) => <article className="goal-recommendation" key={product.id}><h4>{product.name}</h4><TrustProfile product={product} compact /><button className="button" onClick={() => { onSelectProduct(product); onNavigate('dashboard') }}>Inspect profile</button></article>)}</div></div></section>
  const filtered = products.filter((product) => product.ingredientEvidenceProfile?.publishable === true && matchesCatalogueOutcome(product, goal))
  const budgetValue = Number(budget) || 0
  const unitCost = (product) => product.prices?.length ? Math.min(...product.prices.map((price) => price.price / price.servings)) : Infinity
  const verified = (product) => product.evidenceProfile?.sourceRecords?.some((record) => record.type === 'Batch certificate' && record.status === 'Verified') || product.sourceContext?.informedSportMatches > 0
  const bestOverall = [...filtered].sort((left, right) => right.score - left.score)[0]
  const bestVerified = [...filtered].filter(verified).sort((left, right) => right.score - left.score)[0] || [...filtered].sort((left, right) => right.transparency - left.transparency)[0]
  const bestValue = [...filtered].filter((product) => unitCost(product) !== Infinity && (!budgetValue || product.prices?.some((price) => price.price <= budgetValue))).sort((left, right) => unitCost(left) - unitCost(right))[0] || [...filtered].sort((left, right) => right.value - left.value)[0]
  const recommendations = [['Best Overall', bestOverall, 'Highest trust score for your selected goal.', 'overall'], ['Best Verified', bestVerified, verified(bestVerified || {}) ? 'Product or batch evidence is currently linked.' : 'Closest available verification profile; confirm the exact batch.', 'verified'], ['Best Value', bestValue, bestValue && unitCost(bestValue) !== Infinity ? `From £${unitCost(bestValue).toFixed(2)} per comparable serving.` : 'No comparable price is currently available.', 'value']]
  return <section className="goals-page"><section className="goals-hero"><span className="section-kicker">PERSONALISED PRODUCT DISCOVERY</span><h2>Build a goal-based recommendation.</h2><p>Tell us what you want to achieve and the context that changes suitability. We will rank the catalogue transparently, not make a medical diagnosis.</p></section><section className="goals-form panel"><div className="goals-form-heading"><div><span className="section-kicker">YOUR CONTEXT</span><h3>What are you working towards?</h3></div><span className="badge">{submitted ? 'Recommendations updated' : 'Step 1 of 1'}</span></div><div className="goals-fields"><label>Goal<select value={goal} onChange={(event) => { setGoal(event.target.value); setSubmitted(false) }}><option value="performance">Increase strength</option><option value="muscle-growth">Build muscle</option><option value="sleep">Improve sleep</option><option value="stress">Manage stress</option><option value="joint-health">Support joint health</option><option value="energy">Support energy</option><option value="heart-health">Support heart health</option></select></label><label>Age<input type="number" min="13" max="120" value={age} onChange={(event) => setAge(event.target.value)} /></label><label>Location<select value={location} onChange={(event) => setLocation(event.target.value)}><option>UK</option><option>EU</option><option>US</option><option>Canada</option><option>Global</option></select></label><label>Budget (£)<input type="number" min="0" step="1" value={budget} onChange={(event) => setBudget(event.target.value)} /></label><label className="goal-toggle"><input type="checkbox" checked={testedSport} onChange={(event) => setTestedSport(event.target.checked)} /><span>Tested sport priority</span><small>Prioritise athlete certification where available.</small></label></div><div className="goals-context-summary"><span><b>Goal</b>{goal === 'performance' ? 'Increase strength' : outcomeOptions.find((option) => option[0] === goal)?.[1] || goal}</span><span><b>Age</b>{age || 'Not supplied'}</span><span><b>Location</b>{location}</span><span><b>Budget</b>{budgetValue ? `£${budgetValue}` : 'Not set'}</span><span><b>Tested sport</b>{testedSport ? 'Yes' : 'No'}</span></div><button className="button primary goals-submit" onClick={() => setSubmitted(true)}>Generate recommendations</button></section><section className="goals-results"><div className="section-heading"><div><span className="section-kicker">YOUR RECOMMENDATIONS</span><h3>{submitted ? 'Recommendations based on your context' : 'Preview your recommendation lanes'}</h3><p>Goal: {goal === 'performance' ? 'Increase strength' : outcomeOptions.find((option) => option[0] === goal)?.[1] || goal} · {location} · age {age || 'not supplied'} · {testedSport ? 'tested sport priority' : 'general catalogue'} · budget {budgetValue ? `£${budgetValue}` : 'not set'}</p></div><button className="button" onClick={() => onNavigate('dashboard')}>Browse full catalogue</button></div><div className="goal-recommendation-grid">{recommendations.map(([label, product, explanation, tone]) => <article className={`goal-recommendation ${tone}`} key={label}><div className="goal-recommendation-head"><span>{label}</span><b>{product ? product.score : '—'}</b></div>{product ? <><h4>{product.name}</h4><small>{product.brand} · {product.bestFor}</small><p>{explanation}</p><div className="goal-recommendation-facts"><V3Value label="Evidence" value={product.evidence} /><V3Value label="Safety" value={product.safety} /><V3Value label="Quality" value={product.quality} /><V3Value label="Transparency" value={product.transparency} /><V3Value label="Regulatory" value={product.regulatory} /><span>{verified(product) ? 'Verification linked' : 'Verification pending'}</span></div><button className="button primary" onClick={() => { onSelectProduct(product); onNavigate('dashboard') }}>View product</button></> : <p>No matching product is currently available for this goal and context. Try a broader goal or remove the budget constraint.</p>}</article>)}</div><p className="muted goals-disclosure">Recommendations are decision support only. They do not account for medicines, diagnoses, allergies, pregnancy, or all individual circumstances. Confirm suitability and the exact product, dose, seller, and batch with an appropriately qualified professional.</p></section></section>
}

function Summary({ icon, value, label }) { return <article className="summary panel"><span>{icon}</span><strong>{value}</strong><small>{label}</small></article> }
function DashboardCommandStrip({ selected, products, summary, onNavigate }) {
  if (!selected) return null
  const context = selected.sourceContext || {}
  const evidence = context.europepmc || 0
  const safety = context.openfda || 0
  const regulatory = (context['efsa-openfoodtox'] || 0) + (context['uk-fsa'] || 0) + (context['health-canada'] || 0)
  const confidenceChanges = products.filter((product) => product.evidenceProfile?.confidenceChange).length
  const signals = [
    ['Evidence', evidence, 'records', 'evidence'],
    ['Safety', safety, 'FDA signals', 'evidence'],
    ['Regulatory', regulatory, 'records', 'regulatory'],
    ['Sources', selected.evidenceProfile?.sourceRecords?.filter((record) => record.status !== 'Not verified').length || 0, 'linked', 'sources'],
    ['Batch status', selected.evidenceProfile?.sourceRecords?.some((record) => record.type === 'Batch certificate' && record.status === 'Verified') ? 'Verified' : 'Not verified', '', 'evidence'],
  ]
  return <section className="command-strip" aria-label="Dashboard intelligence summary"><div className="command-strip-heading"><span className="section-kicker">Live intelligence layer</span><span className="command-updated">{confidenceChanges ? `${confidenceChanges} confidence change${confidenceChanges === 1 ? '' : 's'}` : 'No recent confidence changes'}</span></div><div className="command-metrics">{signals.map(([label, value, suffix, tab]) => <button className="signal-chip" key={label} onClick={() => onNavigate(tab)}><span>{label}</span><strong>{value}</strong><small>{suffix}</small></button>)}</div><div className="evidence-rail"><span className="rail-label">Selected product</span><b>{selected.name}</b><span className="rail-dot" /><span>{selected.confidence} confidence</span><span className="rail-dot" /><span>{selected.ageGroups || 'Adults'}</span><span className="rail-dot" /><span>{selected.marketInterest || 'Medium'} market interest</span></div></section>
}
function DashboardFuturisticDetails({ selected, onNavigate }) {
  if (!selected) return null
  const context = selected.sourceContext || {}
  const evidenceProfile = selected.evidenceProfile || {}
  const evidence = context.europepmc || 0
  const safety = context.openfda || 0
  const regulatory = (context['efsa-openfoodtox'] || 0) + (context['uk-fsa'] || 0) + (context['health-canada'] || 0)
  const coverage = Math.min(100, Math.round(((evidence + safety + regulatory) / 6) * 100))
  const weights = [['Evidence', selected.evidence, 40], ['Safety', selected.safety, 20], ['Quality', selected.quality, 15], ['Transparency', selected.transparency, 10], ['Regulatory', selected.regulatory, 5], ['Contamination', 100 - selected.contamination, 5], ['Value', selected.value, 5]]
  const badges = [...new Set(['catalogue', selected.catalogueSource, context.europepmc ? 'Europe PMC' : null, context.openfda ? 'openFDA' : null, context.informedSportMatches ? 'Informed Sport' : null].filter(Boolean))]
  return <section className="futuristic-details" aria-label="Advanced product intelligence"><div className="freshness-line"><span className="freshness-pulse" />Live source monitor <b>{selected.updatedAt ? `recalculated ${new Date(selected.updatedAt).toLocaleDateString()}` : 'awaiting recalculation'}</b><span className="freshness-status">{evidenceProfile.confidenceChange ? 'Confidence changed' : 'Stable profile'}</span></div><div className="composition-row"><div><span className="section-kicker">Weighted trust composition</span><div className="composition-bar">{weights.map(([label, value, weight]) => <span key={label} title={`${label}: ${weight}%`} style={{ width: `${weight}%`, opacity: Math.max(.35, value / 100) }} />)}</div><div className="composition-legend">{weights.map(([label, , weight]) => <span key={label}><i />{label} {weight}%</span>)}</div></div><div className="coverage-readout"><strong>{coverage}%</strong><span>evidence coverage</span></div></div><div className="provenance-row"><span>Provenance</span>{badges.map((badge) => <button key={badge} className="provenance-badge" onClick={() => onNavigate(badge === 'openFDA' || badge === 'Informed Sport' ? 'sources' : 'evidence')}>{badge}</button>)}<span className="timeline-marker">{evidenceProfile.confidenceChange ? `Last change: ${new Date(evidenceProfile.confidenceChange.changedAt).toLocaleDateString()}` : 'No confidence changes recorded'}</span></div></section>
}
function Select({ label, value, onChange, options }) { return <label><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => { const optionValue = Array.isArray(option) ? option[0] : option; const optionLabel = Array.isArray(option) ? option[1] : option === 'all' ? `All ${label.toLowerCase()}` : option; return <option key={optionValue} value={optionValue}>{optionLabel}</option> })}</select></label> }
 function PriceTable({ product }) { const rows = product.prices || []; const cheapest = rows.length ? Math.min(...rows.map((row) => row.price / row.servings)) : 0; return <section className="panel"><div className="price-heading"><div><span className="section-kicker">Supplier comparison</span><h3>Value at a glance</h3></div><span className="badge good">Value rating {product.value}/100</span></div>{rows.map((row) => { const unit = row.price / row.servings; return <tr key={row.supplier}><td><b>{row.supplier}</b></td><td>£{row.price.toFixed(2)}</td><td>£{unit.toFixed(2)}</td><td>{unit === cheapest && <span className="best">Best buy</span>}</td><td><SellerBuyLink offer={row} /></td></tr> })}
  <p className="muted">Indicative UK market snapshot in GBP; prices and availability should be checked on the seller website before purchase. Buy it now opens the seller homepage, not a verified product listing.</p>
  </section> }

export default App
