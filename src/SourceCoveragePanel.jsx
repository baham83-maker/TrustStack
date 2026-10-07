import { useEffect, useState } from 'react'

export default function SourceCoveragePanel({ product }) {
  const [coverage, setCoverage] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setCoverage(null)
    setError('')
    fetch(`/api/products/${product.id}/source-coverage`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Source coverage could not be loaded.')
        return response.json()
      })
      .then(setCoverage)
      .catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message) })
    return () => controller.abort()
  }, [product.id])

  return <section className="source-coverage-panel" aria-label={`Source coverage for ${product.name}`}>
    <span className="v3-eyebrow">SOURCE REGISTRY REVIEW</span>
    <h3>What we can check for {product.name}</h3>
    <p className="muted">These are name-based candidates from ingested feeds, not verified links to this product. No Trust Score or recommendation can be derived from a match alone.</p>
    {error && <p role="alert">{error}</p>}
    {!coverage && !error && <p role="status">Loading registry coverage…</p>}
    {coverage && <>
      <div className="coverage-scoring"><h4>Ingredient Trust Rating: {product.trustProfile?.evidence === 'Unknown' ? 'Pending' : `${coverage.ingredientAssessment.score}/100 · ${coverage.ingredientAssessment.rating}`}</h4><p>Separate from Product Trust. Confidence: {coverage.ingredientAssessment.confidence.level} ({coverage.ingredientAssessment.confidence.score}/100). A buyer-facing rating requires reviewed Evidence 40%, Safety 20%, Regulatory confidence 15%, Transparency 10%, Evidence consistency 10% and Biological plausibility 5%.</p>{product.trustProfile?.evidence !== 'Unknown' && coverage.ingredientAssessment.score !== null && <p>Outcome: {coverage.ingredientAssessment.context.outcome} · Region: {coverage.ingredientAssessment.context.region} · Form: {coverage.ingredientAssessment.context.ingredientForm} · Dose: {coverage.ingredientAssessment.context.doseRange} · Population: {coverage.ingredientAssessment.context.population} · Reviewed {new Date(coverage.ingredientAssessment.reviewedAt).toLocaleDateString()}</p>}</div>
      <div className="coverage-scoring"><h4>Product assessment: Pending</h4><p>Registry candidates do not verify the exact formulation, independent quality testing or batch. Prototype product scores are excluded from this buyer-facing profile.</p></div>
      <div className="coverage-scoring"><h4>Automated assessment support: {coverage.research.readiness?.status || 'Unavailable'}</h4><p>No numerical rating is generated from automated matches. These fields identify reviewable evidence for an assessor.</p><ul>{coverage.research.readiness?.dimensions.map((item) => <li key={item.dimension}><b>{item.dimension}</b><span>{item.status}</span><small>{item.detail}</small></li>)}</ul></div>
      {coverage.reviewPlan && <div className="coverage-review"><span className="v3-eyebrow">BEST-CASE USE</span><h4>{coverage.reviewPlan.bestCase.label}</h4><p>{coverage.reviewPlan.bestCase.reason}</p>{coverage.reviewPlan.bestCase.evidenceUrl && <a href={coverage.reviewPlan.bestCase.evidenceUrl} target="_blank" rel="noopener noreferrer">View the research lead</a>}<p>Product recommendation: {coverage.reviewPlan.recommendation}. No exact product or batch has been verified.</p><details><summary>Source review and documentation</summary><ol>{coverage.reviewPlan.actions.map((action) => <li key={action}>{action}</li>)}</ol><div className="coverage-review-links">{coverage.reviewPlan.leads.research.slice(0, 3).map((lead) => <a key={lead.url} href={lead.url} target="_blank" rel="noopener noreferrer">{lead.source}: {lead.title}</a>)}{coverage.reviewPlan.leads.labels.slice(0, 2).map((lead) => <a key={lead.labelUrl} href={lead.labelUrl} target="_blank" rel="noopener noreferrer">NIH DSLD: {lead.brand} · {lead.name}</a>)}</div></details><small>Source check: {coverage.reviewPlan.checkedAt ? new Date(coverage.reviewPlan.checkedAt).toLocaleString() : 'not available'}. A search lead does not establish benefit.</small></div>}
      <div className="coverage-research"><h4>Research, guidance and identity candidates</h4><p className="source-health">{Object.entries(coverage.research.sources || {}).map(([source, status]) => <span className={status === 'fulfilled' ? 'available' : 'unavailable'} key={source}>{source.replace(/([A-Z])/g, ' $1')} · {status === 'fulfilled' ? 'available' : 'unavailable'}</span>)}</p>{coverage.research.status === 'unavailable' ? <p>The research feeds could not be checked. No study conclusion is available.</p> : coverage.research.candidates.length ? <ul>{coverage.research.candidates.map((item) => <li key={`${item.source}-${item.url}`}><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a><small>{item.source} · {[item.journal, item.year].filter(Boolean).join(' · ') || 'Record details not available'} · {item.role}</small>{(item.molecularFormula || item.molecularWeight || item.studyType || item.enrollment) && <small>{[item.molecularFormula && `Formula ${item.molecularFormula}`, item.molecularWeight && `Molecular weight ${item.molecularWeight}`, item.studyType, item.enrollment && `${item.enrollment} enrolled`, item.resultsAvailable && 'Results posted'].filter(Boolean).join(' · ')}</small>}</li>)}</ul> : <p>No matching record was found across the five on-demand sources. This does not establish that evidence is absent.</p>}</div>
      <div className="coverage-grid">
        <div><h4>Registry candidates</h4>{coverage.candidates.length ? <ul>{coverage.candidates.map((item, index) => <li key={`${item.source}-${index}`}><b>{item.source}</b> · {item.role}<span>{item.title}</span><small>Observed {item.observedAt ? new Date(item.observedAt).toLocaleDateString() : 'date unavailable'}</small></li>)}</ul> : <p>No name-based candidate appears in the current ingested snapshot. This is not evidence of absence.</p>}</div>
        <div><h4>Still required for an assessment</h4><ul>{Object.entries(coverage.gaps).filter(([, detail]) => detail).map(([dimension, detail]) => <li key={dimension}><b>{dimension}</b><span>{detail}</span></li>)}</ul></div>
      </div>
      <p className="muted coverage-disclosure">Price requires a product-specific seller offer. Literature, trial registration, ODS guidance, PubChem identity, directory presence and general alerts cannot establish the exact product formulation, batch or local regulatory status. Source feeds may be incomplete or stale.</p>
    </>}
  </section>
}