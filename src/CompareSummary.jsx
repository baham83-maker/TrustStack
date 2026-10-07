import { useEffect, useRef } from 'react'
import { ArrowRight, Info, X } from 'lucide-react'
import './CompareSummary.css'

function layer(product, key) {
  return product.sourceReview?.layerScores?.find((item) => item.key === key)
}

function Rating({ item, fallback = 'Unknown', note }) {
  return <><strong className="cs-status" data-tone={item?.tone || 'unknown'}><i aria-hidden="true" />{item?.status || fallback}</strong>{note && <small>{note}</small>}</>
}

function EvidenceInformation({ product }) {
  const evidenceLayer = layer(product, 'ingredientEvidence')
  const score = evidenceLayer?.score || 0
  const status = score >= 70 ? 'Extensive research records' : score >= 30 ? 'Some research records' : score > 0 ? 'Limited research records' : 'No research records mapped'
  return <Rating item={{ ...evidenceLayer, status }} note={product.ingredientEvidenceProfile?.publishable ? `${product.ingredientEvidenceProfile.direction} · ${product.ingredientEvidenceProfile.certainty} certainty` : 'Source records, not a reviewed benefit conclusion'} />
}

function mainGap(product) {
  const review = product.sourceReview || {}
  if (review.recommendationClass === 'Review Warning' || product.trustProfile?.overallState === 'material_warning') return review.recommendationNote || 'A material warning needs review before considering this entry.'
  if (!product.ingredientEvidenceProfile?.publishable) return 'Outcome-specific benefit, dose and suitability are not established by the available source records.'
  if (product.trustProfile?.verificationProfile?.product !== 'verified') return 'Confirm the exact product identity, formulation and independent certification scope.'
  return product.ingredientEvidenceProfile.limitations || 'Check whether the reviewed population, dose and outcome match the intended use.'
}

const rows = [
  ['Current classification', (product) => <><strong className="cs-classification" data-tone={product.sourceReview?.recommendationTone || 'unknown'}>{product.sourceReview?.recommendationClass || 'Hold For Now'}</strong><small>{product.sourceReview?.recommendationNote || 'Too little information for a stronger comparison.'}</small></>],
  ['Information coverage', (product) => <><strong className="cs-percent">{product.sourceReview?.informationCoverageScore ?? product.trustProfile?.completeness?.percent ?? 0}%</strong><small>Available documentation, not a quality score</small></>],
  ['Use context', (product) => <span>{product.ingredientEvidenceProfile?.outcome || product.bestFor || 'Not documented'}</span>],
  ['Evidence information', (product) => <EvidenceInformation product={product} />],
  ['Safety documentation', (product) => <><strong>{!layer(product, 'safety')?.score ? 'No safety documentation mapped' : layer(product, 'safety').score >= 70 ? 'Safety and context records available' : 'Some safety records available'}</strong><small>Not a safety verdict or medicine-interaction clearance</small></>],
  ['Product verification', (product) => <Rating item={layer(product, 'productQuality')} fallback="Unverified" note={product.trustProfile?.verificationProfile?.product === 'verified' ? 'Exact-product record reviewed' : 'Name matches do not certify this ingredient entry'} />],
  ['Transparency', (product) => <Rating item={layer(product, 'transparency')} note="Exact current label and formulation need confirmation" />],
  ['What to check', (product) => <span>{mainGap(product)}</span>],
]

export default function CompareSummary({ products, onClose, onInspect }) {
  const modal = useRef(null)
  useEffect(() => {
    const previousFocus = document.activeElement
    modal.current?.querySelector('button')?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      previousFocus?.focus?.()
    }
  }, [])
  function handleKeyDown(event) {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); return }
    if (event.key !== 'Tab') return
    const targets = [...modal.current.querySelectorAll('button, a[href], summary, [tabindex="0"]')].filter((element) => element.getClientRects().length)
    const first = targets[0]
    const last = targets[targets.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  return <div className="v3-modal-backdrop cs-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}><section ref={modal} className="v3-compare-modal cs-modal" role="dialog" aria-modal="true" aria-label="Compare trust profiles" aria-describedby="cs-scope" onKeyDown={handleKeyDown}>
    <header className="cs-heading"><div><h2>Compare selected entries</h2><p id="cs-scope">Compare the information available, not which supplement works best. More coverage does not mean greater benefit or safety.</p></div><button className="cs-close" onClick={onClose} aria-label="Close comparison" title="Close comparison"><X size={20} /></button></header>
    {products.length < 2 ? <p>Select at least two entries to compare.</p> : <>
      <div className="cs-table-scroll" tabIndex={0} role="region" aria-label="Side-by-side entry comparison"><table className="cs-table"><thead><tr><th scope="col">Decision summary</th>{products.map((product) => <th scope="col" key={product.id}><h3>{product.name}</h3><small>{product.categories?.[0] || 'Ingredient entry'}</small>{onInspect && <button onClick={() => onInspect(product)}>Full profile <ArrowRight size={14} /></button>}</th>)}</tr></thead><tbody>{rows.map(([label, render]) => <tr key={label}><th scope="row">{label}</th>{products.map((product) => <td key={product.id}>{render(product)}</td>)}</tr>)}</tbody></table></div>
      <details className="cs-findings"><summary>Source findings and limitations</summary><div className="cs-findings-grid">{products.map((product) => <section key={product.id}><h3>{product.name}</h3>{product.sourceReview?.officialReferences?.length ? product.sourceReview.officialReferences.map((reference, index) => <article key={`${reference.url}-${index}`}><a href={reference.url} target="_blank" rel="noopener noreferrer">{reference.title}</a>{reference.referenceScope && <small>{reference.referenceScope}</small>}{reference.evidenceSummary && <p><b>Evidence: </b>{reference.evidenceSummary}</p>}{reference.safetySummary && <p><b>Safety context: </b>{reference.safetySummary}</p>}<small>{[reference.sourceUpdatedAt && `Source updated ${reference.sourceUpdatedAt}`, reference.analysedAt && `Analysed ${reference.analysedAt}`, reference.retrievalMethod].filter(Boolean).join(' · ')}</small></article>) : <p>No official ingredient findings have been mapped. Open the full profile for other research and directory records.</p>}</section>)}</div></details>
    </>}
    <footer className="cs-note"><Info size={17} /><p>These are ingredient-level entries. Product identity, dose, medicines and personal suitability still need checking. TrustStack does not verify batches or provide medical advice.</p></footer>
  </section></div>
}