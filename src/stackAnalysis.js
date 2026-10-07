const overlapGroups = [
  ['Protein sources', /\b(?:whey protein|plant protein|protein blend)\b/i],
  ['Omega oils', /\b(?:omega-3|omega 3|fish oil|triple omega)\b/i],
  ['Vitamin D sources', /\b(?:vitamin d|multivitamin)\b/i],
  ['Magnesium sources', /\b(?:magnesium|multivitamin)\b/i],
]

export function analyseStack(products) {
  const priced = products.map((product) => ({
    product,
    lowest: (product.prices || [])
      .filter((offer) => Number(offer.price) > 0 && Number(offer.servings) > 0)
      .reduce((best, offer) => !best || offer.price / offer.servings < best.price / best.servings ? offer : best, null),
  }))
  const fullyPriced = priced.every(({ lowest }) => lowest)
  const overlaps = overlapGroups.flatMap(([group, pattern]) => {
    const matches = products.filter((product) => pattern.test(product.name))
    return matches.length > 1 ? [{ group, products: matches.map((product) => product.name) }] : []
  })
  const cautions = products.flatMap((product) => {
    const note = product.evidenceProfile?.interactionStatus
    return note && !/^(not captured|interaction profile is not captured)/i.test(note)
      ? [{ product: product.name, note }]
      : []
  })

  return {
    dailyCost: fullyPriced ? priced.reduce((sum, { lowest }) => sum + lowest.price / lowest.servings, 0) : null,
    packCost: fullyPriced ? priced.reduce((sum, { lowest }) => sum + lowest.price, 0) : null,
    unpriced: priced.filter(({ lowest }) => !lowest).map(({ product }) => product.name),
    evidence: products.length ? Math.round(products.reduce((sum, product) => sum + product.evidence, 0) / products.length) : null,
    value: products.length ? Math.round(products.reduce((sum, product) => sum + product.value, 0) / products.length) : null,
    lowestSafety: products.length ? Math.min(...products.map((product) => product.safety)) : null,
    highestContamination: products.length ? Math.max(...products.map((product) => product.contamination)) : null,
    overlaps,
    cautions,
  }
}