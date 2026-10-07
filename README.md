# Supplement Trust Intelligence

This folder now contains a React/Vite dashboard with an Express/SQLite local API.

## Local development

Requirements: Node.js 20+ and npm 10+.

On macOS, install the current Node.js LTS release from [nodejs.org](https://nodejs.org/) or with Homebrew:

```bash
brew install node
```

Verify the installation:

```bash
node --version
npm --version
```

```bash
npm install
npm run dev
```

Open `http://localhost:5175`. The Vite development server proxies `/api` requests to the Node service on port 54321, keeping it separate from other local services.

To run the services separately:

```bash
npm run dev:server
npm run dev:client
```

Generate the production bundle with `npm run build`. This local build is a
prototype and currently has no authentication, reviewer roles, audit log, or
production database migration system. Do not use its scores as clinical advice
or treat a missing verification record as proof of safety.

### Supplied source findings

The NSF search-results adapter imports official product-detail links and keeps product names separate from brands. Ingredient associations are name-matched leads, not certification of the generic entry or an exact SKU. NSF and Informed Sport each contribute one verification-availability criterion; pooled name matches alone cannot receive a `Verified` status. Unlinked grouped flavors are not included.

The two supplied NIH ODS fact sheets were retrieved with the web review tool. Dated, ingredient-scoped findings are saved in `reports/ods-supplied-page-analysis.json` and imported through the `ods-supplied-page-analysis` source. This import has `analysed` status, not successful live retrieval: direct ingestion requests returned HTTP 403. Documented cited study types and safety sections contribute availability criteria, never an efficacy conclusion or a personal dose recommendation. Protein-family and formulation limitations remain explicit. Trust Profiles expose source dates, findings and retrieval provenance.

The European Commission's 2026 food-safety campaign is general educational context. It contributes no entry score, product certification, recall or ingredient warning. Refresh these sources independently with `POST /api/ingestion/run` and a JSON `sourceId` of `nsf-sport`, `ods-supplied-page-analysis`, or `eu-food-safety-campaign`.

The local database is created at `server/supplements.db` on first start and is seeded with the current prototype catalogue. The refresh endpoint is intentionally a local ingestion boundary for license-free open-data adapters; it does not embed API keys or scrape restricted sources.

Unscored catalogue entries are checked on demand against Europe PMC, PubMed E-Utilities, ClinicalTrials.gov, OpenAlex, NCCIH Herbs at a Glance, OPSS ingredient references, NIH ODS fact sheets and PubChem PUG REST. Open Food Facts is queried by candidate barcode when available. Literature and official-reference records contribute only to the information layers they describe; barcode matches are transparency candidates, not quality certificates. NCCIH and OPSS are public reference pages rather than query APIs. The NIH DSID endpoint returned HTTP 403 during the latest refresh, and the GS1 UK lookup requires an authorized service account. Open Food Facts ingredient search returned HTTP 503, though barcode lookups can still succeed. Matches populate the per-entry information coverage assessment but do not establish exact-product quality, batch status or clinical effectiveness. PubMed works without a key at the NCBI three-request-per-second limit. For identified or higher-volume use, set:

```bash
export NCBI_API_KEY="your-key"
export NCBI_TOOL="TrustStack"
export NCBI_EMAIL="developer@example.com"
```

To persist candidate snapshots for every ingredient without a reviewed assessment while the API is running, use `npm run import:ingredient-candidates`. This does not insert rows into `ingredient_assessments` or update `products`. Empty snapshots are refreshed more often because an upstream outage can look like no matching evidence. To publish a rating, review a specific ingredient, outcome, form, dose, population and region, then use `npm run import:ingredient -- /absolute/path/to/reviewed-assessment.json`.

To search the catalogue for product-label and athlete-directory leads, run `npm run search:product-documents`. It writes `reports/catalogue-document-candidates.json` with DSLD label IDs and Informed Sport directory name matches. Most catalogue brands are placeholders, so these are **not associated product documents**: an exact brand, SKU/UPC, formulation and current batch must be checked before a label or quality certificate is attached as verified. For other independent documentation, inspect the [USP Verified Product Finder](https://www.quality-supplements.org/usp_verified_products) and the [NSF Certified for Sport directory](https://www.nsfsport.com/certified-products/) using the exact brand and product identity; request lot-specific certificates from the manufacturer or testing laboratory. A directory listing alone is not a batch certificate.

After searching, run `npm run import:product-variants` to add up to three distinct-brand US label records under each catalogue entry. The importer rechecks each DSLD detail record for on-market status, matching brand and title, a UPC or label version, serving size, and listed ingredients. These children are labelled as identity-review candidates, not verified matches to the generic parent; they have no Product Trust score and no verified quality or batch status. The importer does not change parent scores or verified source records. Some entries may have fewer than three qualifying labels. Independent quality documents and exact brand/variant/batch confirmation require separate review before product scoring.

## Buyer-facing Trust Profiles

The marketplace presents six independent layers, never one composite buyer-facing trust score:

| Layer | Decision | Publication boundary |
| --- | --- | --- |
| Ingredient evidence | Published, mixed, insufficient, under review or not assessed | Outcome-, form-, dose- and population-specific human review; no retail or batch inference |
| Product quality | Verified by Tier 1, verified by Tier 2, partially verified, unverified or unknown | Reviewed independent record for the exact product and certification/testing scope. Tier 1 requires a current NSF, Informed Sport or Informed Choice listing; Tier 2 requires a dated independent COA or laboratory report. Manufacturer claims alone do not verify quality. |
| Batch verification | Current batch verified, previous batch verified, mismatch or unknown | Certificate authenticity, issuer and test-scope checks, report date and exact lot match; previous-lot records do not verify the current lot |
| Safety | Well characterised, context required, significant warning or unknown | Reviewed dose, population, medicine, pregnancy and duration context; never a universal safety score |
| Transparency | Excellent, good, partial, limited, label candidates only or unknown | Exact current formulation disclosure and reviewer confirmation; DSLD name matches are candidates only |
| Value | Reviewed class or unknown | Exact-product offer dated within 30 days, stated serving size, currency and delivery cost. A comparative class needs a recorded comparison basis; cost per effective serving also needs a reviewed beneficial use and matching dose. |

**Information Coverage** is calculated from four information-availability scores: Ingredient Evidence 40%, Product Verification 15%, Safety Documentation 25%, and Transparency 20%. Batch Verification and Value remain separate statuses and are not included in this weighted score. The card shows layer statuses and the weighted coverage percentage, not the underlying layer scores. Coverage is not a trust, efficacy, suitability or safety rating.

Source matches contribute only to the information domains they describe. Literature and trial records can contribute to ingredient-evidence availability; directory listings contribute limited product-verification information; label candidates contribute transparency information; exact-lot records contribute batch information; and safety documents contribute safety-documentation information. A name match does not establish an exact product, batch, result or clinical conclusion. Missing information reduces coverage but is not treated as evidence of poor quality, danger or ineffectiveness. Material warnings require an explicit warning, recall or regulatory-warning record; an adverse-event name match alone is not a warning.

Product-card classification priority is explicit: **Review Warning** (red) overrides everything when an explicit warning applies; **Worth Comparing** (green) requires evidence ≥70, verification ≥50 and coverage ≥70; **Evidence Available** (blue) requires evidence ≥70 with verification <50, even when other missing information lowers coverage; **Needs More Evidence** (amber) applies to remaining entries with evidence ≥30 or coverage ≥40; **Hold For Now** (gray) applies to the remaining low-information entries. Candidate title matches are information leads, not findings that a supplement works. Cards, decision notes and profile recommendation labels use the same category colors.

Run `npm run review:catalogue-sources` to regenerate `reports/catalogue-assessment-review.json` from the ingested registry, ingredient research snapshots and DSLD label candidates. Each entry receives linked source leads, source availability, a review stage and specific next actions. **Research relevance screening** means only that the name appeared in linked research; irrelevant food or mechanistic records must be rejected before evidence review. **Source discovery** means this snapshot lacked a usable study link, not that no research exists. Neither stage changes Product Trust, Ingredient Trust or batch verification.

Expanded card details show linked research and registry candidates, the API check date and the source limitations. These are not recommendations to take a supplement. Search titles do not establish results, safety, dose suitability or benefit; failed APIs and narrow terms can also leave relevant information undiscovered.

To publish an independently reviewed Ingredient Evidence Profile, create JSON with `ingredient`, `canonicalIngredient`, `ingredientForm`, `doseRange`, `population`, `outcome`, `region`, `searchStrategy`, `lastSearched`, `sources`, `certainty`, `direction`, `consistency`, `directness`, `safety`, `limitations`, `reviewer`, `reviewedAt` and `reviewStatus: "Human reviewed"`, then run `npm run import:ingredient-evidence -- /absolute/path/to/profile.json`. This publishes ingredient evidence only; it does not publish an ITR score, verify a retail product, certify quality or verify a batch. `sources` should contain deduplicated PMID, PMCID, DOI or registry links, with licence checks for full text.

## API

NIH ODS fact-sheet discovery uses `https://ods.od.nih.gov/factsheets/list-all/`, with matched Health Professional documents supplying ingredient/nutrient-family evidence context, safety sections, interactions and recommended intakes. Refresh its source status with `POST /api/ingestion/run` and JSON `{ "sourceId": "nih-ods-factsheets" }`; per-entry document retrieval runs through the ingredient-candidate importer. The index and direct Vitamin D professional sheet returned HTTP 403 in the October 2 access check. An index link or blocked page earns no documentation points; ODS fact sheets do not establish product certification or manufacturer transparency.

The latest official Informed Sport certified-list PDF is discovered from its certified-brands page on each refresh. Run `POST /api/ingestion/run` with JSON `{ "sourceId": "informed-sport-certified-list" }`, or use the normal full registry refresh. The adapter records the advertised download URL, PDF SHA-256 hash, list month and observation timestamp. Only the most recent successfully ingested PDF snapshot contributes matches; failed refreshes leave the previous snapshot available. PDF text-line matches do not resolve column-layout brand associations, certify an exact SKU or batch, or add duplicate points alongside the web directory. Coverage is recalculated on catalogue requests.

- `GET /api/health`
- `GET /api/summary`
- `GET /api/products?q=&type=&category=&region=`
- `POST /api/refresh`
- `GET /api/products/:id/sources`
- `POST /api/products/:id/sources`
- `GET /api/ingestion/status`
- `POST /api/ingestion/run`

The dashboard is decision-support software, not medical advice. Product scores and recommendations require methodology, clinical and regulatory review before production use.

Production deployment guide for the Supplement Trust Intelligence dashboard and its supporting evidence, safety, regulatory, contamination-risk and value-data services.

> **Important:** This product is decision-support software, not medical advice. Product recommendations and trust scores must not be treated as clinical diagnoses, prescriptions, or guarantees of safety or efficacy.

## 1. Solution overview

The solution contains two deployable components:

1. **Static HTML dashboard** hosted on Azure Static Web Apps.
2. **TypeScript API and ingestion services** hosted on Azure Functions.

Recommended production architecture:

```text
Users
  |
Azure Front Door Premium + WAF
  |
Azure Static Web Apps Standard
  |
Azure API Management
  |
Azure Functions Flex Consumption
  |
  +-- Azure Blob Storage: raw and curated data
  +-- Azure Queue Storage: transformation and review queues
  +-- Azure SQL Database: products, evidence, scores and audit records
  +-- Azure Key Vault: API keys and operational secrets
  +-- Application Insights + Log Analytics

External data feeds
  +-- NIH DSLD
  +-- PubMed / PMC Open Access
  +-- openFDA CAERS
  +-- UK Food Standards Agency
  +-- Health Canada LNHPD
  +-- Approval-gated licensed sources
```

Azure Static Web Apps can deploy static front ends through GitHub Actions and can connect to an API backend. Azure Functions Flex Consumption is the recommended serverless hosting plan for new Functions workloads and supports virtual-network integration, per-function scaling and optional always-ready instances.

## 2. Repository structure

```text
supplement-trust-intelligence/
├── frontend/
│   ├── index.html
│   └── staticwebapp.config.json
├── api/
│   ├── src/
│   │   ├── connectors/
│   │   ├── functions/
│   │   ├── scoring/
│   │   └── shared/
│   ├── host.json
│   ├── package.json
│   └── tsconfig.json
├── database/
│   ├── schema.sql
│   └── migrations/
├── infra/
│   ├── main.bicep
│   ├── alerts.bicep
│   └── parameters/
├── tests/
├── .github/workflows/
│   ├── deploy-nonprod.yml
│   └── deploy-production.yml
└── README.md
```

The supplied `index.html` is a standalone front end with no build step. It can be placed directly in the `frontend` directory.

## 3. Required Azure services

### Essential

- Azure Static Web Apps Standard
- Azure Functions Flex Consumption
- Azure API Management
- Azure Storage Account
- Azure SQL Database
- Azure Key Vault
- Microsoft Entra ID
- Application Insights
- Log Analytics Workspace
- Azure Monitor alerts and Action Groups

### Recommended for public production

- Azure Front Door Premium
- Web Application Firewall
- Private Endpoints and Private DNS
- Virtual Network integration
- Microsoft Defender for Cloud
- Azure Policy
- Azure Backup or SQL point-in-time restore configuration

## 4. Local prerequisites

Install:

```text
Git
Node.js 22 LTS
Azure CLI
Azure Developer CLI
Azure Functions Core Tools v4
Bicep CLI
Azure Static Web Apps CLI
```

Verify:

```bash
node --version
npm --version
az version
azd version
func --version
az bicep version
swa --version
```

Authenticate:

```bash
az login
azd auth login
az account show
```

Select the intended subscription:

```bash
az account set --subscription "<subscription-id>"
```

## 5. Environment strategy

Use separate subscriptions or resource groups for:

```text
dev
nonprod / test
uat
production
```

Minimum production naming example:

```text
rg-supplement-intelligence-prod
swa-supplement-intelligence-prod
func-supplement-intelligence-prod
apim-supplement-intelligence-prod
sql-supplement-intelligence-prod
kv-supplement-intelligence-prod
st-supplement-intelligence-prod
appi-supplement-intelligence-prod
```

Do not share production storage, Key Vault secrets or databases with non-production environments.

## 6. Configuration and secrets

Required configuration:

```text
AZURE_SUBSCRIPTION_ID
AZURE_TENANT_ID
AZURE_RESOURCE_GROUP
AZURE_LOCATION
ENVIRONMENT_NAME
OPERATIONS_EMAIL
METHODOLOGY_VERSION
```

Potential connector secrets:

```text
NCBI_API_KEY
DSLD_API_KEY
EFSA_SUBSCRIPTION_KEY
NICE_API_KEY
WHO_PERMISSION_REFERENCE
```

Store secrets in Azure Key Vault. Use a managed identity for the Function App and grant only the minimum required Azure RBAC roles.

Recommended Function App access:

```text
Storage Blob Data Contributor
Storage Queue Data Contributor
Key Vault Secrets User
A restricted Azure SQL application role
```

Do not place credentials in the HTML, Git repository, Bicep parameter files, browser storage or unencrypted application settings.

## 7. External-source governance

### Automatically ingestible after technical validation

- NIH Dietary Supplement Label Database
- PubMed E-Utilities
- PMC Open Access records with eligible per-article licences
- openFDA CAERS
- UK FSA open-data APIs
- Health Canada LNHPD

### Keep disabled until rights are documented

- WHO content without an applicable commercial reuse permission
- NICE content outside the permitted licence and geography
- EFSA datasets requiring an API subscription or dataset-specific terms
- Cochrane content
- NSF, USP and Informed Sport registries
- Retailer pages and supplier prices without authorised API or data licensing

Every connector must record:

```text
Source name
Source URL
Licence identifier
Retrieved timestamp
Source version
Connector version
SHA-256 hash
Ingestion run ID
Transformation status
```

Do not bypass licensing controls by scraping publicly accessible webpages.

## 8. Database and data zones

Use three logical zones:

```text
Raw: exact source payloads, immutable and hash-verified
Curated: validated, normalised and deduplicated records
Serving: approved data used by dashboard APIs and score calculations
```

Recommended main tables:

```text
Products
Ingredients
Evidence
RegulatoryAlerts
SupplierPrices
Certifications
ContaminationReports
RegionalCompliance
TrustScores
IngestionRuns
RawDataAudit
ReviewQueue
AuditLog
```

Create database migrations and execute them through CI/CD rather than manually changing production tables.

## 9. Trust-score service

Recommended initial weighting:

```text
Scientific evidence       40%
Safety                    20%
Quality and purity        15%
Transparency              10%
Regulatory status          5%
Contamination protection   5%
Value rating               5%
```

Because contamination is represented as risk, convert it to a positive protection score during calculation:

```text
contaminationProtection = 100 - contaminationRisk
```

Store these fields with every calculated score:

```text
Methodology version
Source version
Connector version
Calculation timestamp
Input scores
Critical flags
Review decision ID
```

A recall, prohibited ingredient, falsified certification or critical contamination event should cap the trust score until a qualified reviewer resolves the case.

## 10. Human review workflow

Require human review before publishing:

- Product recalls
- Severe adverse-event signals
- Critical contamination reports
- Prohibited or undeclared ingredients
- Recommendation changes
- Manual score overrides
- Conflicting high-quality evidence

Suggested states:

```text
pending
in-review
approved
rejected
needs-more-evidence
superseded
```

Each decision must record reviewer identity, timestamp, reason, evidence references and methodology version.

## 11. Deploy the front end

Place `index.html` in `frontend/`.

Create `frontend/staticwebapp.config.json`:

```json
{
  "routes": [
    {
      "route": "/admin/*",
      "allowedRoles": ["administrator"]
    },
    {
      "route": "/api/*",
      "allowedRoles": ["authenticated"]
    }
  ],
  "navigationFallback": {
    "rewrite": "/index.html"
  },
  "globalHeaders": {
    "content-security-policy": "default-src 'self'; connect-src 'self' https:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()"
  }
}
```

For the current single-file HTML prototype, the inline script and style require `'unsafe-inline'`. Before final public launch, move JavaScript and CSS into fingerprinted external files and replace this with a nonce- or hash-based Content Security Policy.

Create the Static Web App and connect it to the GitHub repository. Configure:

```text
APP_LOCATION: frontend
API_LOCATION: api
OUTPUT_LOCATION: leave empty for raw HTML
```

Azure Static Web Apps can generate a GitHub Actions workflow automatically. If maintaining the workflow manually, pin third-party actions to tested commit SHAs.

## 12. Deploy the API

Build and test:

```bash
cd api
npm ci
npm run build
npm test
```

Use Azure Functions runtime 4.x, TypeScript, Node.js 22 and Flex Consumption.

Deploy non-production first:

```bash
az group create \
  --name rg-supplement-intelligence-nonprod \
  --location uksouth

az deployment group create \
  --resource-group rg-supplement-intelligence-nonprod \
  --template-file infra/main.bicep \
  --parameters environmentName=nonprod \
  --parameters operationsEmail="<operations-email>"
```

Deploy the Function package through GitHub Actions, `azd`, or the Azure Functions deployment action. Do not deploy directly to production from a developer workstation.

## 13. API endpoints

Recommended initial contract:

```text
GET  /api/v1/health
GET  /api/v1/products
GET  /api/v1/products/{id}
GET  /api/v1/products/{id}/prices
GET  /api/v1/products/{id}/regions
GET  /api/v1/ingestion/status
POST /api/v1/ingestion/run
POST /api/v1/reviews/decision
POST /api/v1/scores/recalculate
```

The dashboard refresh button calls:

```http
POST /api/v1/ingestion/run
Content-Type: application/json

{
  "feeds": ["dsld", "pubmed", "openfda", "fsa", "healthcanada"]
}
```

In production, prefer an asynchronous pattern:

1. Return `202 Accepted` with a run ID.
2. Poll `GET /api/v1/ingestion/runs/{runId}`.
3. Refresh dashboard data only when transformation and review states permit publication.

## 14. CI/CD

Pipeline stages:

```text
Checkout
Dependency restore
Lint
Unit tests
Contract tests
Build
Software composition analysis
Secret scan
Bicep validation
Deploy infrastructure to non-production
Deploy API and front end
Smoke tests
Integration tests
Manual approval
Production deployment
Post-deployment health validation
```

Use GitHub OpenID Connect/workload identity federation rather than a long-lived Azure client secret.

Protect the production GitHub environment with:

- Required approvers
- Branch protection
- Successful test requirements
- Restricted deployment branches
- Environment-specific secrets
- Deployment concurrency controls

## 15. Monitoring and alerts

Enable Application Insights and Log Analytics for Functions, API Management, Front Door, WAF, Key Vault, Storage and SQL.

Monitor:

```text
API availability and P95 latency
Function failures and duration
External dependency failures
HTTP 429 rate limiting
Feed freshness
Transformation queue backlog
Dead-letter queue growth
Pending critical reviews
Score-calculation failures
Authentication anomalies
Key Vault access failures
SQL capacity and failed connections
```

Recommended alerts:

```text
Critical feed stale beyond SLA
Any failed critical ingestion run
Three or more rate-limit responses within 15 minutes
Critical safety item pending longer than 30 minutes
Dead-letter queue contains any critical record
API error rate above 2%
P95 latency above 1.5 seconds
Database or storage capacity above 80%
```

For new workloads, use Azure Monitor OpenTelemetry export where supported and configure the Application Insights connection string.

## 16. Security controls

Before launch:

- Enforce HTTPS and TLS 1.2 or later.
- Use Entra ID authentication and role-based access.
- Place API Management in front of sensitive APIs.
- Validate JWTs, schemas, request sizes and allowed content types.
- Rate-limit public and administrative endpoints separately.
- Disable public access to SQL, Key Vault and Storage.
- Use private endpoints and managed identity.
- Enable WAF managed rules.
- Enable Defender for Cloud.
- Run SAST, dependency, secret, DAST and penetration testing.
- Log all administrative actions and score overrides.
- Define retention and deletion policies.

## 17. Privacy, clinical and legal governance

Complete before public release:

- Data Protection Impact Assessment
- Privacy notice and cookie assessment
- Terms of use
- Medical-information disclaimer
- Clinical and scientific methodology review
- Source and licensing register
- Advertising and health-claims review
- Product-liability review
- Accessibility statement
- Incident-response plan

Avoid collecting special-category health information unless it is necessary, lawful, minimised and protected by explicit controls.

## 18. Testing and release gates

### Automated

- Unit tests for all scoring boundaries
- Connector contract tests
- Hash and duplicate tests
- Transformation tests
- API authentication and authorisation tests
- Accessibility checks
- Performance tests
- Security scans

### Manual

- Clinical review of sample recommendations
- Data-steward review of provenance
- Regulatory review by region
- Browser and mobile testing
- Keyboard and screen-reader testing
- Backup and restore exercise
- Incident-response rehearsal

### Go-live criteria

- No unresolved critical security findings
- WCAG 2.2 AA target met
- All approved feeds meet freshness SLA
- Review workflow tested end to end
- Restore test completed
- Production alert routing verified
- Legal and clinical approvals recorded
- Operational runbook assigned to named owners

## 19. Production cutover

1. Freeze methodology and connector versions.
2. Take final non-production backup.
3. Deploy infrastructure.
4. Apply database migrations.
5. Deploy API.
6. Run health and smoke tests.
7. Run approved connectors.
8. Validate raw hashes and curated counts.
9. Complete human review of critical signals.
10. Deploy front end.
11. Enable Front Door and WAF routing.
12. Verify monitoring and alerts.
13. Open access gradually.
14. Monitor closely for the first 24 to 72 hours.

## 20. Operational runbook

### Daily

- Review failed and stale feeds.
- Review critical safety queue.
- Confirm dashboard health.
- Investigate data-quality exceptions.

### Weekly

- Review supplier-price anomalies.
- Reconcile connector record counts.
- Review security and access logs.
- Review recommendation changes.

### Monthly

- Patch dependencies.
- Review Azure cost and capacity.
- Test a sample database restore.
- Review licence and source-register changes.
- Review methodology performance and bias.

### Incident priorities

```text
P1: Incorrect harmful recommendation, critical recall not reflected, data breach
P2: Major source unavailable, widespread stale scores, authentication failure
P3: Individual connector failure, partial price outage, non-critical UI defect
P4: Cosmetic issue or low-impact enhancement
```

## 21. Cost controls

- Configure budgets and anomaly alerts.
- Use Flex Consumption scaling and only add always-ready instances where latency requires them.
- Set Application Insights sampling and retention deliberately.
- Use Azure SQL serverless or an appropriately sized provisioned tier for early stages.
- Add lifecycle rules for raw blobs and audit archives.
- Cache low-volatility reference data through API Management.

## 22. Rollback

Maintain:

- Versioned infrastructure templates
- Versioned database migrations
- Previous front-end artefacts
- Previous Function packages
- Versioned methodology configuration
- Feature flags for connectors and recommendations

A rollback must not delete raw audit evidence. Disable affected publication paths while preserving the source record and review history.

## 23. Reference documentation

- Azure Static Web Apps deployment with GitHub Actions: https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/azure-static-web-app
- Azure Functions Flex Consumption: https://learn.microsoft.com/azure/azure-functions/flex-consumption-plan
- Create and manage Flex Consumption apps: https://learn.microsoft.com/azure/azure-functions/flex-consumption-how-to
- Azure Key Vault authentication: https://learn.microsoft.com/azure/key-vault/general/authentication
- Azure Functions monitoring: https://learn.microsoft.com/azure/azure-functions/functions-monitoring

## 24. Production readiness status

```text
Standalone HTML front end              Included
Static Web Apps deployment guidance    Included
API and ingestion architecture         Defined
Infrastructure as code                 Available in production scaffold v2
Identity and Key Vault model            Defined
Raw and curated data pattern            Defined
Human review workflow                   Defined
Monitoring and alert requirements       Defined
Live Azure deployment                    Requires subscription access
Licensed source activation               Requires rights and credentials
Clinical and legal approval              Requires authorised reviewers
```
