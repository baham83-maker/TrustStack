import { describe, expect, it } from 'vitest'
import { catalogueGroups, catalogueNames, categoriesFor, matchesCatalogueCategory, matchesCatalogueOutcome, matchesCatalogueRegion, matchesCatalogueSearch, matchesCatalogueView } from './catalogue.js'

describe('requested catalogue', () => {
  it('has exactly the requested sections and no duplicate product rows', () => {
    expect(Object.keys(catalogueGroups)).toHaveLength(8)
    expect(catalogueNames).toHaveLength(44)
    expect(new Set(catalogueNames).size).toBe(catalogueNames.length)
  })

  it('places shared products into each relevant category', () => {
    expect(categoriesFor('Creatine Monohydrate')).toEqual(['Sports Performance', "Men's Health"])
    expect(categoriesFor('Omega-3 Fish Oil')).toEqual(['Essential Health Supplements', "Women's Health", "Men's Health"])
    expect(categoriesFor('L-Theanine')).toEqual(['Sleep', 'Cognitive Performance'])
    expect(categoriesFor('Pre-Workout Blend')).toEqual([])
  })

  it('searches catalogue categories and filters only entries assigned to the selected category', () => {
    const creatine = { name: 'Creatine Monohydrate', categories: categoriesFor('Creatine Monohydrate') }
    expect(matchesCatalogueSearch(creatine, 'sports performance')).toBe(true)
    expect(matchesCatalogueCategory(creatine, 'Sports Performance')).toBe(true)
    expect(matchesCatalogueCategory(creatine, 'Sleep')).toBe(false)
  })

  it('matches regions only from reviewed evidence context, not numeric legacy region values', () => {
    const unreviewed = { region: '57.0', ingredientEvidenceProfile: { region: null } }
    expect(matchesCatalogueRegion(unreviewed, 'Global')).toBe(true)
    expect(matchesCatalogueRegion(unreviewed, 'US')).toBe(false)
    expect(matchesCatalogueRegion({ ingredientAssessment: { context: { region: 'United States' } } }, 'US')).toBe(true)
    expect(matchesCatalogueRegion({ ingredientEvidenceProfile: { region: 'European Union' } }, 'EU')).toBe(true)
  })

  it('uses entry purpose text for outcomes without substring matches from generic recommendations', () => {
    expect(matchesCatalogueOutcome({ bestFor: 'Exercise-performance support', recommendation: 'Market-interest category' }, 'sleep')).toBe(false)
    expect(matchesCatalogueOutcome({ bestFor: 'Unassessed sleep product' }, 'sleep')).toBe(true)
    expect(matchesCatalogueOutcome({ bestFor: 'Omega-3 intake and cardiovascular nutrition support' }, 'blood-pressure')).toBe(false)
  })

  it('requires a reviewed complete product label for verified-formulation filtering', () => {
    expect(matchesCatalogueOutcome({ recommendation: 'transparent simple formulation' }, 'verified-formulation')).toBe(false)
    expect(matchesCatalogueOutcome({ trustProfile: { productTransparencyProfile: { status: 'reviewed_complete', labelAvailable: true, ingredientsDisclosed: true, doseDeclared: true, manufacturerIdentified: true } } }, 'verified-formulation')).toBe(true)
  })

  it('uses the selected evidence, label, review or Informed Sport state for View filters', () => {
    const entry = { ingredientEvidenceProfile: { state: 'published' }, trustProfile: { transparency: 'Label candidates identified' }, sourceReview: { registryMatches: [{ source: 'Informed Sport' }] } }
    expect(matchesCatalogueView(entry, 'view-evidence-published')).toBe(true)
    expect(matchesCatalogueView(entry, 'view-label-candidates')).toBe(true)
    expect(matchesCatalogueView(entry, 'view-athlete-verified')).toBe(true)
    expect(matchesCatalogueView(entry, 'view-evidence-mixed')).toBe(false)
  })
})