import { describe, expect, it } from 'vitest'
import { analyseStack } from './stackAnalysis.js'

const product = (name, overrides = {}) => ({ name, evidence: 80, safety: 85, value: 75, contamination: 12, prices: [{ price: 20, servings: 40 }], ...overrides })

describe('analyseStack', () => {
  it('totals the lowest cost per serving without treating it as a verified dose', () => {
    const result = analyseStack([
      product('Creatine Monohydrate', { prices: [{ price: 30, servings: 30 }, { price: 20, servings: 40 }] }),
      product('Whey Protein', { prices: [{ price: 25, servings: 25 }] }),
    ])
    expect(result.dailyCost).toBe(1.5)
    expect(result.packCost).toBe(45)
  })

  it('marks totals incomplete when a product has no usable price', () => {
    const result = analyseStack([product('Vitamin D3'), product('Omega-3 Fish Oil', { prices: [{ price: 8, servings: 0 }] })])
    expect(result.dailyCost).toBeNull()
    expect(result.unpriced).toEqual(['Omega-3 Fish Oil'])
  })

  it('reports possible category overlap and existing product-specific cautions only', () => {
    const result = analyseStack([
      product('Whey Protein'),
      product('Plant Protein Blend'),
      product('Vitamin K2', { evidenceProfile: { interactionStatus: 'Review anticoagulant medicines.' } }),
    ])
    expect(result.overlaps).toEqual([{ group: 'Protein sources', products: ['Whey Protein', 'Plant Protein Blend'] }])
    expect(result.cautions).toEqual([{ product: 'Vitamin K2', note: 'Review anticoagulant medicines.' }])
  })
})