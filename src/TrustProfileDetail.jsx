import { ArrowLeft, ArrowRight, ArrowLeftRight, BookOpen, CheckCircle2, ChevronRight, CircleHelp, ExternalLink, FileText, Heart, Home, Info, Search, ShieldCheck, X } from 'lucide-react'
import './TrustProfileDetail.css'
import { decisionUseCaseSummary, evidenceAnalysisSummary } from './decisionUseCase.js'

const sections = [['overview', 'Overview'], ['evidence', 'Evidence'], ['safety', 'Safety'], ['details', 'Product details'], ['regulatory', 'Regulatory'], ['sources', 'Sources']]

function coverageBand(score) {
  if (score >= 80) return 'High coverage'
  if (score >= 50) return 'Moderate coverage'
  if (score >= 20) return 'Limited coverage'
  return 'Minimal coverage'
}

function SourceLinks({ records = [] }) {
  return records.length ? <ul className="tp-sources">{records.map((record, index) => <li key={`${record.url}-${index}`}>
    {record.url ? <a href={record.url} target="_blank" rel="noopener noreferrer">{record.title || record.source}<ExternalLink size={14} /></a> : <strong>{record.title || record.source}</strong>}
    <small>{[record.source, record.sourceUpdatedAt && `Updated ${record.sourceUpdatedAt}`, record.analysedAt && `Analysed ${record.analysedAt}`].filter(Boolean).join(' · ')}</small>
    {record.referenceScope && <p>{record.referenceScope}</p>}{record.evidenceSummary && <p>{record.evidenceSummary}</p>}{record.safetySummary && <p>{record.safetySummary}</p>}{record.role && <p>{record.role}</p>}{record.retrievalMethod && <small>{record.retrievalMethod}</small>}
  </li>)}</ul> : <p className="tp-muted">No linked records are available for this entry.</p>
}

function sourceStatus(count, { connecting = false, warning = false, subject = 'source records' } = {}) {
  if (warning) return { status: 'Warning identified', tone: 'warning', description: `An explicit ${subject} warning record is linked. Read its original source and scope.` }
  if (!count && connecting) return { status: 'Sources being connected', tone: 'partial', description: `A source search for ${subject} is active; no matching records are linked yet.` }
  if (!count) return { status: 'Information unavailable', tone: 'unknown', description: `No ${subject} records are linked. Missing records are not a conclusion about the ingredient or product.` }
  if (count < 3) return { status: 'Limited information available', tone: 'partial', description: `${count} ${subject} record${count === 1 ? '' : 's'} linked. This is record availability, not an assessment.` }
  return { status: 'Information available', tone: 'information', description: `${count} ${subject} records linked. Their presence does not establish efficacy, safety, approval or product quality.` }
}

function oneLineStatusNote(status, count, subject) {
  if (status === 'Information available') return `${count} ${subject} records are linked; conclusions are not assessed.`
  if (status === 'Limited information available') return `${count} ${subject} record${count === 1 ? '' : 's'} are linked; other records may be missing.`
  if (status === 'Sources being connected') return `A source search is active; no matching ${subject} records are linked yet.`
  if (status === 'Warning identified') return `An explicit ${subject} warning record is linked; check its scope.`
  return `No ${subject} records are linked.`
}

export default function TrustProfileDetail({ product, tab, setTab, saved, onSave, onClose, onNavigate, onCompare, onSimilar, VariantsPanel }) {
  const profile = product.trustProfile || {}
  const review = product.sourceReview || {}
  const evidence = product.ingredientEvidenceProfile || {}
  const layers = (review.layerScores || []).filter((layer) => layer.weight > 0)
  const references = review.officialReferences || []
  const registryMatches = review.registryMatches || []
  const variants = Number(review.labelCandidateCount) || 0
  const coverage = Math.max(0, Math.min(100, review.informationCoverageScore ?? profile.completeness?.percent ?? 0))
  const humanEvidenceRecordOnFile = evidence.publishable === true
  const transparencyProfile = profile.productTransparencyProfile || {}
  const sourceContext = product.sourceContext || {}
  const evidenceRecordCount = (Number(review.researchLeadCount) || 0) + references.filter((reference) => reference.evidenceInformationAvailable).length + (evidence.sources?.length || 0)
  const safetyRecordCount = references.filter((reference) => reference.safetySectionAvailable || reference.interactionInfoAvailable || reference.contraindicationInfoAvailable).length + (Number(sourceContext.openfda) || 0)
  const regulatoryRecordCount = ['uk-fsa', 'health-canada', 'efsa-openfoodtox'].reduce((count, key) => count + (Number(sourceContext[key]) || 0), 0)
  const verificationRecordCount = registryMatches.length + Number(Boolean(transparencyProfile.qualityDocumentsAvailable))
  const exactLabelFields = [transparencyProfile.manufacturerIdentified, transparencyProfile.ingredientsDisclosed, transparencyProfile.doseDeclared, transparencyProfile.contactDetailsDeclared, Boolean(transparencyProfile.manufacturingCountry)]
  const exactLabelFieldPercent = transparencyProfile.labelAvailable ? Math.round(exactLabelFields.filter(Boolean).length / exactLabelFields.length * 100) : 0
  const declaredTransparencyFieldCount = transparencyProfile.labelAvailable ? exactLabelFields.filter(Boolean).length : 0
  const transparencyRecordCount = transparencyProfile.labelAvailable ? declaredTransparencyFieldCount : variants
  const safetyInformationCount = safetyRecordCount
  const informationAreaAvailability = [evidenceRecordCount, variants || transparencyProfile.labelAvailable, safetyInformationCount, regulatoryRecordCount, verificationRecordCount]
  const availableAreaCount = informationAreaAvailability.filter(Boolean).length
  const sourceStatuses = Object.values(review.sources || {})
  const sourcesConnecting = review.status === 'Sources connecting' || sourceStatuses.some((status) => ['pending', 'loading', 'connecting'].includes(String(status).toLowerCase()))
  const hasExplicitWarning = (records = []) => records.some((record) => record?.warningIdentified === true || record?.isWarning === true || record?.warning === true || record?.alert === true)
  const warningsFor = (dimension) => [
    ...(review.warningRecords || []).filter((record) => record.dimension === dimension),
    ...(review[`${dimension}Warnings`] || []),
    ...references.filter((reference) => reference.dimension === dimension && (reference.warningIdentified === true || reference.warning === true || reference.alert === true)),
  ]
  const hasWarning = hasExplicitWarning([...references, ...(review.warningRecords || []), ...(review.safetyWarnings || []), ...(review.regulatoryWarnings || []), ...(review.evidenceWarnings || []), ...(review.transparencyWarnings || []), ...(review.verificationWarnings || [])])
  const useCase = decisionUseCaseSummary(product)
  const evidenceAnalysis = evidenceAnalysisSummary(product)
  const decisionTone = useCase.tone
  const activeTab = sections.some(([key]) => key === tab) ? tab : 'overview'
  const missing = []
  if (!evidenceRecordCount) missing.push('No literature or ingredient-reference records are linked to this entry')
  if (!transparencyProfile.labelAvailable && !variants) missing.push('No exact product-label record was found')
  else if (!transparencyProfile.labelAvailable) missing.push('Label candidates are not confirmed as this exact product')
  if (!verificationRecordCount && !transparencyProfile.qualityDocumentsAvailable) missing.push('No directory or independent quality-document records were found')
  if (!safetyRecordCount && !(layers.find((layer) => layer.key === 'safety')?.score > 0)) missing.push('No safety-specific source records were found')
  if (!regulatoryRecordCount) missing.push('No jurisdiction-specific product records were found')
  const productTransparency = transparencyProfile
  const keyInformation = [
    ['Ingredient form', productTransparency.labelAvailable && productTransparency.ingredientFormDeclared ? 'Declared on exact label record' : 'No exact-label declaration found'],
    ['Dose information', productTransparency.labelAvailable && productTransparency.doseDeclared ? 'Declared on exact label record' : 'No exact-label declaration found'],
    ['Catalogue description', product.bestFor || 'Not listed'],
    ['Population scope', humanEvidenceRecordOnFile && evidence.population ? `Separate human-reviewed record: ${evidence.population}` : 'TrustStack does not assess individual suitability'],
    ['Evidence context', humanEvidenceRecordOnFile ? `Separate human-reviewed record on file · ${evidence.outcome || 'Scope not specified'}` : 'Source records only · no TrustStack efficacy assessment'],
  ]
  const connecting = sourcesConnecting
  const isWarning = (records = []) => records.some((record) => record?.warningIdentified === true || record?.isWarning === true || record?.warning === true || record?.alert === true)
  const evidenceStatus = sourceStatus(evidenceRecordCount, { connecting, warning: isWarning(warningsFor('evidence')), subject: 'evidence' })
  const transparencyStatus = isWarning(warningsFor('transparency'))
    ? sourceStatus(declaredTransparencyFieldCount, { warning: true, subject: 'product-transparency' })
    : exactLabelFieldPercent >= 80
      ? sourceStatus(5, { subject: 'product transparency' })
      : exactLabelFieldPercent >= 40
        ? sourceStatus(1, { subject: 'product-transparency' })
        : transparencyProfile.labelAvailable || variants > 0
          ? sourceStatus(1, { subject: 'unconfirmed label-candidate' })
          : sourceStatus(0, { connecting, subject: 'product-transparency' })
  const safetyStatus = sourceStatus(safetyInformationCount, { connecting, warning: isWarning(warningsFor('safety')), subject: 'safety' })
  const regulatoryStatus = sourceStatus(regulatoryRecordCount, { connecting, warning: isWarning(warningsFor('regulatory')), subject: 'regulatory' })
  const verificationStatus = transparencyProfile.qualityDocumentsAvailable && profile.verificationProfile?.product === 'verified'
    ? sourceStatus(3, { subject: 'verification' })
    : sourceStatus(verificationRecordCount, { connecting, warning: isWarning(warningsFor('verification')), subject: 'verification' })
  const informationAreas = [
    [BookOpen, 'Ingredient evidence', humanEvidenceRecordOnFile ? 'Human-reviewed profile on file' : evidenceStatus.status, humanEvidenceRecordOnFile ? 'A separate human-reviewed profile is on file; TrustStack does not assess its conclusion.' : oneLineStatusNote(evidenceStatus.status, evidenceRecordCount, 'evidence'), 'evidence', humanEvidenceRecordOnFile ? 'information' : evidenceStatus.tone],
    [FileText, 'Product transparency', transparencyStatus.status, exactLabelFieldPercent >= 80 ? `${exactLabelFieldPercent}% of tracked exact-label fields are populated; these describe declarations, not product quality.` : variants > 0 && !transparencyProfile.labelAvailable ? `${variants} label candidate${variants === 1 ? '' : 's'} ${variants === 1 ? 'is' : 'are'} linked; the exact product is unconfirmed.` : oneLineStatusNote(transparencyStatus.status, transparencyRecordCount, 'transparency'), 'details', transparencyStatus.tone],
    [ShieldCheck, 'Safety information', safetyStatus.status, oneLineStatusNote(safetyStatus.status, safetyInformationCount, 'safety'), 'safety', safetyStatus.tone],
    [CircleHelp, 'Regulatory status', regulatoryStatus.status, oneLineStatusNote(regulatoryStatus.status, regulatoryRecordCount, 'jurisdiction-specific'), 'regulatory', regulatoryStatus.tone],
    [CheckCircle2, 'Verification', verificationStatus.status, verificationRecordCount ? `${registryMatches.length} directory/document records are linked; exact product or batch verification is not established.` : oneLineStatusNote(verificationStatus.status, verificationRecordCount, 'verification'), 'details', verificationStatus.tone],
  ]
   return <section className="v3-detail-view tp-detail" data-decision-tone={decisionTone} aria-label={`${product.name} Trust Profile`}><div className="v3-inner">
    <div className="tp-breadcrumb"><button onClick={onClose} aria-label="Back to catalogue" title="Back to catalogue"><Home size={17} /></button><span>Supplements</span><ChevronRight size={14} /><span>{product.categories?.[0] || 'Catalogue'}</span><ChevronRight size={14} /><strong>{product.name}</strong><button className="tp-close" onClick={onClose} aria-label="Close evidence and limitations" title="Close profile"><X size={20} /></button></div>
    <header className="tp-header"><div className="tp-identity"><div className="tp-visual"><img src="/truststack-mark.png" alt="TrustStack ingredient profile" /><small>Ingredient profile</small></div><div><h2>{product.name}</h2><p>{product.categories?.join(' · ')}</p><div className="tp-tags"><span>{product.type || 'Supplement'}</span></div></div></div><div className="tp-actions"><button onClick={onSave} aria-pressed={saved}><Heart size={18} fill={saved ? 'currentColor' : 'none'} />{saved ? 'Saved' : 'Save'}</button><button onClick={onCompare}><ArrowLeftRight size={18} />Compare</button><button className="tp-primary" onClick={onSimilar}>View similar entries</button></div></header>
    <div className="tp-layout"><main className="tp-main">
      <section className="tp-review-banner tp-use-case" data-source-tone={useCase.tone}><span className="tp-banner-icon"><Info size={25} /></span><div><h3>Decision Use-Case</h3><p><b>What information is available: </b>{useCase.available}</p><p><b>What important information is missing: </b>{useCase.missing}</p><p><b>What the user should consider next: </b>{useCase.next}</p><button onClick={() => setTab('sources')}>Review linked sources <ArrowRight size={15} /></button></div></section>
      <nav className="tp-tabs" role="tablist" aria-label="Trust Profile sections">{sections.map(([key, label]) => <button key={key} role="tab" aria-selected={activeTab === key} aria-controls={`tp-panel-${product.id}`} id={`tp-tab-${product.id}-${key}`} tabIndex={activeTab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={(event) => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const index = sections.findIndex(([value]) => value === key); const next = event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + sections.length) % sections.length; setTab(sections[next][0]); event.currentTarget.parentElement.children[next].focus() }}>{label}</button>)}</nav>
      <div className="tp-information-areas" aria-label="Profile information areas">{informationAreas.map(([Icon, label, status, note, target, tone]) => <article className="tp-area-box" key={label} data-tone={tone}><span className="tp-mini-icon"><Icon size={18} /></span><h3>{label}</h3><strong className="tp-area-status"><i aria-hidden="true" />{status}</strong><p title={note}>{note}</p><button onClick={() => setTab(target)} aria-label={`View ${label.toLowerCase()}`}>View details <ArrowRight size={14} /></button></article>)}</div>
      <div className="tp-tab-content" role="tabpanel" id={`tp-panel-${product.id}`} aria-labelledby={`tp-tab-${product.id}-${activeTab}`}>
        {activeTab === 'overview' && <div className="tp-overview-grid">
          <section className="tp-information"><h3>Key information</h3><dl>{keyInformation.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
          <section className="tp-evidence-analysis" aria-labelledby={`tp-evidence-analysis-${product.id}`}><h3 id={`tp-evidence-analysis-${product.id}`}>What We know from the Evidence</h3><div className="tp-evidence-analysis-grid">{evidenceAnalysis.map(({ topic, summary }) => <article key={topic}><h4>{topic}</h4><p>{summary}</p></article>)}</div></section>
        </div>}
        {activeTab === 'evidence' && <section className="tp-tab-section"><h3>Ingredient source records</h3><p>TrustStack checks whether literature and reference records are linked to this entry. It does not determine whether an ingredient works. A separate human-reviewed evidence profile {humanEvidenceRecordOnFile ? 'is on file and displayed as a separate record' : 'is not on file'}.</p>{humanEvidenceRecordOnFile && <div className="tp-record-note"><b>Separate human-reviewed profile record</b><p>{[evidence.direction, evidence.certainty && `${evidence.certainty} certainty`, evidence.outcome, evidence.reviewer && `Reviewer: ${evidence.reviewer}`, evidence.reviewedAt && `Recorded: ${evidence.reviewedAt}`].filter(Boolean).join(' · ')}</p><small>TrustStack displays this record; it does not independently assess the conclusion.</small></div>}<SourceLinks records={references.filter((reference) => reference.evidenceInformationAvailable)} /><h4>Research records</h4><SourceLinks records={review.researchLeads} /></section>}
        {activeTab === 'safety' && <section className="tp-tab-section"><h3>Safety-source information</h3><p>{safetyRecordCount ? `${safetyRecordCount} safety-related source records are linked. Their presence does not establish safety or personal suitability.` : 'No safety-specific source records were found in the mapped sources. This is missing information, not a safety conclusion.'} TrustStack does not assess safety, medicines or individual suitability.</p><SourceLinks records={references.filter((reference) => reference.safetySectionAvailable || reference.interactionInfoAvailable || reference.contraindicationInfoAvailable)} />{humanEvidenceRecordOnFile && evidence.safety && <div className="tp-record-note"><b>Separate human-reviewed profile record</b><p>{evidence.safety}{evidence.population ? ` · ${evidence.population}` : ''}{evidence.doseRange ? ` · ${evidence.doseRange}` : ''}</p><small>TrustStack displays the recorded scope; it does not independently assess it.</small></div>}</section>}
        {activeTab === 'details' && <section className="tp-tab-section"><h3>Product evidence fit</h3><p><b>Match to any ingredient evidence:</b> Cannot determine from the catalogue data. This entry does not contain a confirmed product formulation and serving matched to a human-reviewed evidence profile.</p><dl className="tp-detail-list"><div><dt>Exact product label</dt><dd>{productTransparency.labelAvailable ? 'Label record on file' : variants ? `${variants} label candidate${variants === 1 ? '' : 's'}; exact product not confirmed` : 'No exact label record found'}</dd></div><div><dt>Ingredient form declaration</dt><dd>{productTransparency.labelAvailable && productTransparency.ingredientFormDeclared ? 'Declared on label record' : 'No confirmed exact-label declaration'}</dd></div><div><dt>Amounts and serving</dt><dd>{productTransparency.labelAvailable && productTransparency.doseDeclared ? 'Declared on label record' : 'No confirmed exact-label declaration'}</dd></div><div><dt>Manufacturer</dt><dd>{productTransparency.labelAvailable && productTransparency.manufacturerIdentified ? 'Identified in label record' : 'No confirmed manufacturer record'}</dd></div><div><dt>Product/batch verification</dt><dd>{registryMatches.length ? 'Directory listings found; no exact-SKU conclusion' : 'No directory or quality-document record found. TrustStack does not authenticate batches.'}</dd></div></dl><p>Transparency fields describe declarations found in records. They do not establish product quality.</p>{VariantsPanel && <VariantsPanel product={product} />}<h4>Directory source records</h4><SourceLinks records={registryMatches} /></section>}
        {activeTab === 'regulatory' && <section className="tp-tab-section"><h3>Jurisdiction-specific source records</h3><p>{regulatoryRecordCount ? `${regulatoryRecordCount} jurisdiction-specific records are linked to this entry.` : 'No jurisdiction-specific product records were found in linked sources.'} TrustStack does not assess regulatory approval. A record in one jurisdiction does not establish global approval, clinical benefit or batch quality.</p>{(review.generalReferences || []).map((reference) => <article key={reference.url}><h4><a href={reference.url} target="_blank" rel="noopener noreferrer">{reference.title} <ExternalLink size={14} /></a></h4><p>{reference.summary}</p><small>{reference.scope} This is general context, not an entry-specific regulatory record.</small></article>)}</section>}
        {activeTab === 'sources' && <section className="tp-tab-section"><h3>Linked source records</h3><p>{review.researchLeadCount || 0} research records · {registryMatches.length} directory matches · {variants} label candidates. Counts describe record presence, not source quality or an efficacy/safety conclusion.</p>{review.checkedAt && <small>Source snapshot checked {new Date(review.checkedAt).toLocaleDateString()}</small>}<h4>Official references</h4><SourceLinks records={references} /><h4>Research records</h4><SourceLinks records={review.researchLeads} /><h4>Directory records</h4><SourceLinks records={registryMatches} /><h4>Information coverage by area</h4><ul className="tp-coverage-list">{layers.map((layer) => <li key={layer.key}><div><b>{layer.label}</b><small>{layer.weight}% coverage weight · {layer.score > 0 ? 'Records mapped' : 'No records mapped'}</small></div><strong>{layer.score}%</strong></li>)}</ul><p>Coverage reflects information mapped by TrustStack. It does not measure effectiveness, safety, regulatory approval or product quality. Batch records are outside TrustStack verification.</p>{(review.layerInterpretations || []).map((item) => <details key={item.layer}><summary>{item.layer} source interpretation</summary><p>{item.interpretation}</p></details>)}</section>}
      </div>
    </main><aside className="tp-sidebar">
        <section className="tp-coverage"><div className="tp-coverage-ring" style={{ '--coverage': `${coverage}%` }}><strong>{coverage}%</strong></div><div><h3>Information coverage</h3><strong className="tp-coverage-band">{coverageBand(coverage)}</strong><p>{availableAreaCount} of {informationAreaAvailability.length} source areas have linked records</p><small>Coverage measures mapped information, not effectiveness, safety or quality.</small><button onClick={() => setTab('sources')}>See full breakdown <ArrowRight size={15} /></button></div></section>
      <section className="tp-unknown"><h3><CircleHelp size={23} />What we don’t know yet</h3><ul>{missing.map((item) => <li key={item}>{item}</li>)}<li>Exact-product identity and quality are not established by directory name matches</li><li>Batch verification is not provided by TrustStack</li></ul></section>
      <section className="tp-next"><h3>Next steps</h3><button onClick={() => setTab('sources')}><Search size={18} />Inspect linked records <ChevronRight size={15} /></button><button onClick={onSimilar}><ArrowLeftRight size={18} />Compare another entry <ChevronRight size={15} /></button><button onClick={() => setTab('details')}><FileText size={18} />Check label information <ChevronRight size={15} /></button><button onClick={() => onNavigate('methodology')}><BookOpen size={18} />How records are matched <ArrowRight size={15} /></button></section>
    </aside></div>
    <footer className="tp-disclaimer"><Info size={22} /><p><b>Important: </b>TrustStack identifies whether information and source records are present and links to those records. It does not assess efficacy, safety, personal suitability or regulatory approval, nor verify product quality or batches.</p></footer>
    <button className="tp-back" onClick={onClose}><ArrowLeft size={16} />Back to entries</button>
  </div></section>
}