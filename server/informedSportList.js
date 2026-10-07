import crypto from 'node:crypto'
import parsePdf from 'pdf-parse/lib/pdf-parse.js'

const officialOrigin = 'https://sport.wetestyoutrust.com'

export function certifiedListUrl(html) {
  for (const match of html.matchAll(/href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)) {
    const url = new URL(match[1].replaceAll('&amp;', '&'), officialOrigin)
    if (url.origin === officialOrigin && url.pathname.includes('/generated-pdf/')) return url.href
  }
  throw new Error('The official page did not advertise a certified-list PDF.')
}

export function certifiedListRecords(text, documentUrl, documentHash) {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const month = lines.find((line) => /^(January|February|March|April|May|June|July|August|September|October|November|December)[ -]\d{4}$/.test(line))
  if (!month || lines.length < 10) throw new Error('Certified list lacks a recognizable dated listing.')
  return [...new Set(lines.filter((line) => line !== month))].map((line) => ({
    id: crypto.createHash('sha256').update(line).digest('hex'),
    product: line,
    certification_month: month,
    directory_url: documentUrl,
    document_hash: documentHash,
    match_scope: 'PDF text-line candidate; brand and exact product identity not resolved',
  }))
}

export async function fetchCertifiedList(pageUrl) {
  const signal = AbortSignal.timeout(60000)
  const headers = { 'user-agent': 'TrustStack/1.0 (official certified list ingestion)' }
  const page = await fetch(pageUrl, { headers, signal })
  if (!page.ok) throw new Error(`Certified-brands page returned HTTP ${page.status}`)
  const documentUrl = certifiedListUrl(await page.text())
  const response = await fetch(documentUrl, { headers, signal })
  if (!response.ok) throw new Error(`Certified list returned HTTP ${response.status}`)
  if (new URL(response.url).origin !== officialOrigin) throw new Error('PDF redirected outside the official host.')
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > 10 * 1024 * 1024 || buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid or oversized certified PDF.')
  const documentHash = crypto.createHash('sha256').update(buffer).digest('hex')
  const document = await parsePdf(buffer)
  const records = certifiedListRecords(document.text, documentUrl, documentHash)
  return { status: 'success', records, message: `Parsed ${document.numpages} PDF pages; ${records.length} distinct text-line candidates; ${records[0].certification_month}` }
}