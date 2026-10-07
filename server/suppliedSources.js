import { load } from 'cheerio'

export function nsfListingRecords(html, pageUrl) {
  const $ = load(html)
  const records = new Map()
  $('a[href]').each((index, element) => {
    let url
    try { url = new URL($(element).attr('href'), pageUrl) } catch { return }
    const productName = ($(element).find('.results__product-name').text() || $(element).text()).replace(/\s+/g, ' ').trim()
    const brand = $(element).find('.results__company-name').text().replace(/\s+/g, ' ').trim()
    const title = brand ? `${productName} (${brand})` : productName
    if (url.origin !== 'https://www.nsfsport.com' || url.pathname !== '/certified-products/listing-detail.php' || !/^\d+$/.test(url.searchParams.get('id') || '') || !title) return
    records.set(url.searchParams.get('id'), { id: url.searchParams.get('id'), title, productName, brand, url: url.href, scope: 'Named NSF directory listing; association to ingredient entry is a name match, not exact-SKU certification' })
  })
  if (!records.size) throw new Error('NSF page returned no recognizable product-detail listings.')
  return [...records.values()]
}

export function suppliedPageCandidates(name, records) {
  return records.filter((record) => record.source === 'ods-supplied-page-analysis').flatMap((record) => {
    let payload
    try { payload = JSON.parse(record.payload) } catch { return [] }
    return payload.ingredient === name ? [{ ...payload, source: 'NIH ODS', observedAt: record.observedAt }] : []
  })
}

export function foodSafetyCampaignRecord(html, pageUrl) {
  const $ = load(html)
  const text = $('body').text().replace(/\s+/g, ' ').toLowerCase()
  if (!text.includes('traceability') || !text.includes('food safety')) throw new Error('Campaign content was not recognizable.')
  return { id: 'campaign-2026', source: 'European Commission', title: 'Food Safety Campaign 2026', url: pageUrl, scope: 'General food-safety context only; no entry scoring', summary: 'Explains food-safety controls including additives, contaminants, allergens, labelling, packaging, hygiene, traceability and import controls. It does not provide ingredient findings, product certification or a supplement-specific warning.' }
}