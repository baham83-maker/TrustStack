import { expect, it } from 'vitest'
import { assessmentReview, bestCaseForEntry, bestCaseUse } from './assessmentReview.js'

it('returns evidence screening, not a benefit recommendation, from title matches and label leads', () => {
  const plan = assessmentReview({
    name: 'Creatine',
    candidates: [{ source: 'PubMed', title: 'Creatine in exercise', url: 'https://pubmed.ncbi.nlm.nih.gov/123/' }, { source: 'PubChem', title: 'Creatine', url: 'https://pubchem.ncbi.nlm.nih.gov/compound/1' }],
    labels: [{ brand: 'Example', name: 'Creatine', dsld_id: 20, label_url: 'https://api.ods.od.nih.gov/dsld/v9/label/20' }],
    sources: { pubmed: 'fulfilled', nihOds: 'rejected' },
  })
  expect(plan).toMatchObject({ recommendation: 'Assessment Pending', reviewStage: 'Research relevance screening', publicationBlocked: true })
  expect(plan.leads.research).toHaveLength(1)
  expect(plan.actions).toContainEqual(expect.stringContaining('Retry unavailable sources'))
  expect(plan.actions).toContainEqual(expect.stringContaining('Match a labelled child'))
})

it('treats missing search results and adverse-event reports as review gaps, not clinical conclusions', () => {
  const plan = assessmentReview({ sources: { pubmed: 'rejected' }, registry: [{ source: 'openFDA', title: 'Report 123' }] })
  expect(plan).toMatchObject({ recommendation: 'Assessment Pending', reviewStage: 'Source discovery' })
  expect(plan.actions).toContainEqual(expect.stringContaining('reports do not establish causality'))
  expect(plan.rationale).toContain('source failures')
})

it('provides a conditional goal only from a linked human-study lead, never a food or mechanistic match', () => {
  expect(bestCaseUse('Creatine', [{ source: 'PubMed', title: 'Randomized trial of creatine in resistance training strength', url: 'https://pubmed.ncbi.nlm.nih.gov/123/' }])).toMatchObject({ label: 'Explore for strength and exercise performance', goal: 'strength and exercise performance' })
  expect(bestCaseUse("Lion's Mane", [{ source: 'PubMed', title: "Lion's mane mushroom steak sensory characterization", url: 'https://pubmed.ncbi.nlm.nih.gov/456/' }])).toMatchObject({ label: 'Hold for now', goal: null })
  expect(bestCaseUse('Magnesium', [{ source: 'ClinicalTrials.gov', title: 'Sleep and magnesium', studyType: 'OBSERVATIONAL', url: 'https://clinicaltrials.gov/study/NCT123' }]).label).toBe('Hold for now')
  expect(bestCaseUse('Casein', [{ source: 'ClinicalTrials.gov', title: 'Casein prior to sleep and morning metabolism', studyType: 'INTERVENTIONAL', url: 'https://clinicaltrials.gov/study/NCT456' }]).label).toBe('Hold for now')
  expect(bestCaseUse('Caffeine', [{ source: 'ClinicalTrials.gov', title: 'Caffeine and strength in adolescents', studyType: 'INTERVENTIONAL', url: 'https://clinicaltrials.gov/study/NCT789' }]).label).toBe('Hold for now')
  expect(bestCaseUse('Vitamin C', [{ source: 'PubMed', title: 'Randomized vitamin C trial for oxidative stress', url: 'https://pubmed.ncbi.nlm.nih.gov/789/' }]).label).toBe('Hold for now')
  expect(bestCaseUse('Whey Protein', [{ source: 'ClinicalTrials.gov', title: 'Leucine or protein supplementation and strength', studyType: 'INTERVENTIONAL', url: 'https://clinicaltrials.gov/study/NCT111' }]).label).toBe('Hold for now')
  expect(bestCaseUse('Glucosamine', [{ source: 'ClinicalTrials.gov', title: 'Glucosamine phonophoresis for joint function', studyType: 'INTERVENTIONAL', url: 'https://clinicaltrials.gov/study/NCT222' }]).label).toBe('Hold for now')
  expect(bestCaseUse('Creatine', [{ source: 'PubMed', title: 'Creatine and strength in postmenopausal women: a systematic review', url: 'https://pubmed.ncbi.nlm.nih.gov/222/' }]).label).toBe('Hold for now')
  expect(bestCaseUse('L-Theanine', [{ source: 'ClinicalTrials.gov', title: 'L-Theanine and Hericium Erinaceus Gummies on Sleep Quality', studyType: 'INTERVENTIONAL', url: 'https://clinicaltrials.gov/study/NCT333' }]).label).toBe('Hold for now')
  expect(bestCaseUse('Ashwagandha', [{ source: 'Europe PMC', title: 'Randomised ashwagandha extract trial for anti-stress and anti-fatigue in stressed adults', url: 'https://europepmc.org/article/MED/123' }]).label).toBe('Explore for stress and mood')
  expect(bestCaseUse('Creatine', [], { pubmed: 'rejected', europePmc: 'fulfilled', clinicalTrials: 'fulfilled' }).reason).toContain('lookup incomplete')
})

it('lets a completed no-benefit assessment override a positive research title lead', () => {
  const lead = [{ source: 'PubMed', title: 'Randomized creatine trial in strength', url: 'https://pubmed.ncbi.nlm.nih.gov/123/' }]
  const reviewed = { publishable: true, direction: 'No meaningful benefit demonstrated', outcome: 'Strength', population: 'Adults', doseRange: '3 g daily', sources: [] }
  expect(bestCaseForEntry('Creatine', reviewed, lead)).toMatchObject({ label: 'Hold for now', goal: null, evidenceUrl: null })
  expect(bestCaseForEntry('Creatine', { ...reviewed, direction: 'Supports benefit' }, lead).label).toBe('Reviewed use: Strength')
})