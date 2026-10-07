import { mentionsName } from './sourceCoverage.js'

export function labelCandidates(name, payload, limit = 5) {
  return (payload.hits || []).map((hit) => {
    const label = hit._source || {}
    const id = Number(label.id || hit._id)
    if (!Number.isSafeInteger(id) || id <= 0 || !mentionsName(label.fullName, name) || label.offMarket === 1) return null
    return {
      source: 'NIH DSLD', type: 'Label candidate', brand: label.brandName || 'Brand unavailable',
      title: label.fullName, id, url: `https://api.ods.od.nih.gov/dsld/v9/label/${id}`,
      upc: label.upcSku || null, entryDate: label.entryDate || null,
      note: 'US label listing; catalogue product and current formulation not verified',
    }
  }).filter(Boolean).slice(0, limit)
}

export function directoryCandidates(name, records, limit = 5) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const absent = new RegExp(`\\b(?:zero|no|without|free from|decaf)\\s+${escaped}\\b|\\b${escaped}[ -]free\\b`, 'i')
  return records.filter((record) => mentionsName(record.product, name) && !absent.test(record.product))
    .slice(0, limit).map((record) => ({
      source: 'Informed Sport', type: 'Directory candidate', brand: record.brand || 'Brand unavailable',
      title: record.product, url: record.directory_url || 'https://sport.wetestyoutrust.com/certified-products',
      observedAt: record.observedAt || null,
      note: 'Directory name candidate; exact product, certification status and batch not verified',
    }))
}

function comparable(value) {
  return String(value || '').toLowerCase().replace(/\b(?:inc|ltd|foods|food|sports|sport|nutrition|nutritional)\b/g, '').replace(/[^a-z0-9]/g, '')
}

export function documentedChildren(labels, directory) {
  const matches = []
  for (const label of labels) {
    const related = directory.find((item) => comparable(item.brand) && comparable(item.brand) === comparable(label.brand)
      && comparable(item.title) && comparable(item.title) === comparable(label.title))
    if (!related || matches.some((item) => item.labelId === label.id)) continue
    matches.push({ brand: label.brand, name: label.title, labelId: label.id, labelUrl: label.url,
      directoryUrl: related.url, upc: label.upc || null, entryDate: label.entryDate || null,
      status: 'Candidate for identity review', qualityStatus: 'Directory candidate; no product or batch certificate verified' })
  }
  return matches.slice(0, 3)
}

export function childFromLabel(parent, candidate, label) {
  const upc = String(label.upcSku || '').replace(/\D/g, '')
  const version = String(label.productVersionCode || '').trim()
  if (Number(label.id) !== candidate.id || label.offMarket !== 0
    || !label.fullName || !label.brandName || comparable(label.fullName) !== comparable(candidate.title)
    || comparable(label.brandName) !== comparable(candidate.brand)
    || !mentionsName(label.fullName, parent.name) || (!upc && (!version || version === 'Not Present'))
    || !label.servingSizes?.length || !label.ingredientRows?.length) return null
  const serving = label.servingSizes[0]
  return {
    parentId: parent.id, dsldId: label.id, brand: label.brandName, name: label.fullName,
    upc: upc || null, labelVersion: version === 'Not Present' ? null : version || null,
    serving: `${serving.minQuantity}${serving.maxQuantity !== serving.minQuantity ? `-${serving.maxQuantity}` : ''} ${serving.unit || ''}`.trim(),
    ingredientCount: label.ingredientRows.length, labelEntryDate: label.entryDate || null,
    labelUrl: candidate.url, identityStatus: 'Label identified; catalogue association pending review',
    qualityStatus: 'Not verified', region: 'US',
  }
}