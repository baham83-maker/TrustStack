import { useEffect, useState } from 'react'

export default function ProductVariantsPanel({ product }) {
  const [variants, setVariants] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setVariants([])
    setError('')
    fetch(`/api/products/${product.id}/variants`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('Product labels could not be loaded.'); return response.json() })
      .then(setVariants)
      .catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message) })
    return () => controller.abort()
  }, [product.id])

  if (error) return <p className="variant-panel" role="alert">{error}</p>
  return <section className="variant-panel" aria-label={`Label-identified products for ${product.name}`}>
    <span className="v3-eyebrow">REAL PRODUCT LABELS</span>
    <h3>Label-identified candidates for {product.name}</h3>
    <p>US label records are starting points, not verified matches to this catalogue entry. They have no Product Trust score, independent quality result or batch certificate.</p>
    {variants.length ? <div className="variant-list">{variants.map((variant) => <article key={variant.id}>
      <div><b>{variant.brand} · {variant.name}</b><span>{variant.serving} per serving · {variant.region} label · DSLD #{variant.dsldId}</span><small>{variant.upc ? `UPC ${variant.upc} · ` : ''}Label version {variant.labelVersion || 'not provided'} · {variant.ingredientCount} listed ingredient{variant.ingredientCount === 1 ? '' : 's'}</small></div>
      <div><span>Product score pending</span><small>Identity review pending · Quality not verified · Batch not verified</small><a href={variant.labelUrl} target="_blank" rel="noopener noreferrer">Inspect label</a></div>
    </article>)}</div> : <p>No qualifying product label has been added for this entry.</p>}
  </section>
}