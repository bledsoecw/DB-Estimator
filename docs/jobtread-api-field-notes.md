# JobTread API — Field Notes

**Status:** verified directly against the live Deitemeyer Brothers organization
**Date of observation:** 2026-09-18
**Organization:** Deitemeyer Brothers — `22PBAjem8SSC`

Everything in this document was confirmed by querying the live API, not inferred from
documentation. Where a claim is unverified it is marked **UNVERIFIED**. Figures here are the
baseline that the estimator's JobTread integration is designed against; re-verify before
relying on any of it after a JobTread release.

> **Read-only discipline.** All observations below came from read queries and schema
> introspection. No mutation was executed against the live organization. Keep it that way
> outside of a dedicated test job.

---

## 1. API shape

JobTread exposes the **Pave API**: a JSON-graph API, GraphQL-like in spirit but queried with
plain JSON objects rather than a query language.

```jsonc
// Top-level keys are root field names. Scalars are selected with an empty object.
// Arguments go under the special "$" key.
{ "organization": { "$": { "id": "22PBAjem8SSC" },
                    "id": {},
                    "jobs": { "$": { "size": 10 }, "count": {}, "nodes": { "name": {} } } } }
```

Introspection is first-class and the fastest way to answer any question:

```jsonc
{ "schema": { "$": { "path": "root" } } }                              // root fields
{ "schema": { "$": { "path": "root", "search": "costItem" } } }        // keyword search
{ "schema": { "$": { "expand": true, "path": "root.createDocument.$" } } } // an input
{ "schema": { "$": { "expand": true, "path": "costItem" } } }          // a global type
```

Path rules: append `.<key>` for an object key, `.$` for an input, `._on_<key>` for a `oneOf`
variant.

### Hard limits and conventions confirmed

| Property | Value | Notes |
|---|---|---|
| Connection page size | **100 max** | `size: 250` is rejected outright. Every sweep must paginate. |
| Pagination | `nextPage` / `previousPage` opaque cursors | Token strings, not offsets. |
| `createDocument` `lineItems` | **1500 max** | Nested groups count toward the same cap. |
| `createWebhook` `eventTypes` | **43 max** | Exactly the number of event types that exist. |
| `profitBreakdown` | 10 entries max | |
| `references` | 1000 max | |
| `scheduledDocuments` | 20 max | |
| `document.externalId` | 32 chars max, nullable | See §5. |
| Auth | `grantKey` passed in the request input | Also `notify: false` to suppress notifications, `timeZone` for TZ-aware data. |
| Rate limits | **UNVERIFIED** | Nothing observable from normal use; assume none documented and throttle defensively. |

Aggregation exists on connections: `count`, `sum`, `avg`, `min`, `max`, `values`, plus a
`group` argument taking `{ by, firstIdBy, aggs, where }`. Field aliasing via `"_"` lets one
query pull several differently-filtered views of the same connection:

```jsonc
{ "organization": { "$": { "id": "22PBAjem8SSC" },
    "catalog":  { "_": "costItems", "$": { "where": [["job","id"], "=", null] }, "count": {} },
    "onJobs":   { "_": "costItems", "$": { "where": [["job","id"], "!=", null] }, "count": {} } } }
```

`where` takes expression trees: `[["field","subfield"], "=", value]`, combined with
`{"and": [...]}` / `{"or": [...]}`.

---

## 2. Live data volumes

| Entity | Count |
|---|---|
| Jobs | 3,987 |
| Documents | 8,462 (of which 2,181 `customerOrder`) |
| Accounts (customers + vendors) | 3,550 |
| Cost items — **all** | 176,155 |
| Cost items — `document = null` (catalog + job budgets) | 81,473 |
| Cost items — **true priced catalog** (`document = null` ∧ `job = null` ∧ prices > 0) | **709** |
| Cost groups | 46,248 |
| Cost codes | 62 |
| Cost types | 5 |
| Units | 28 |
| Document templates | 30 |
| Custom fields | 70 |

### The 176k figure needs restating precisely

The organization does **not** have a 176,000-item catalog. It has roughly **709 curated,
priced catalog items** plus ~175,000 *instances* of those items priced onto real jobs and
documents. Both are assets, for different purposes:

- the **709 items** are the line-item vocabulary to build assemblies on top of;
- the **~175k instances** are the historical pricing corpus to mine for unit-cost
  distributions and productivity rates.

Any plan that claims "a 176,000-item catalog no competitor can match" is misreading the
shape of the data. The real, defensible asset is the instance history.

---

## 3. Taxonomy

**5 cost types:** Labor, Materials, Subcontractor, Other, Clock In.

**28 units:** Square Foot, Square, Linear Feet, Feet, Lump Sum, Each, Hours, Day, Week,
Sheet, Panel, Board, Bundle, Roll, Box, Bag, Carton, Pack, Set, Piece, Room, Cubic Yard,
Ton, Pounds, Gallons, Quart, Tub, Can.

**62 cost codes** — a loose CSI-like division set mixed with labor and overhead codes:
General Requirements, Site Construction, Concrete, Masonry, Metals, Woods & Plastics,
Roofing, Thermal & Moisture, Doors, Windows, Siding, Finishes, `Specialites` *(sic)*,
Appliances, Cabinetry, Special Construction, Conveying/Lifts, Mechanical (Plumbing & HVAC),
Electrical, Demolition, Excavation, Site Prep/Clean Up, Utility Connection, Framing/Sheeting,
Doors & Windows, Interior Trim/Casing/Paneling, Deck, Drywall, Painting, Flooring, Tiling,
Shower/Tub, Fireplace, Closet Organization, Project Management, Design, Team Management,
Site Supervisor, Sales On-Site Support, Service Repair Labor, Service Repair Materials,
Shop Work/Maintenance, Warranty Work, Hauling & Disposal (Direct), Hauling & Disposal
(Rental), Permits, Travel Related Costs, Promotional, Credit Card/ACH Processing Fee,
Lender Processing/Distribution Fee, In House- Monroe, In House- Bonnewitz, Morning Clock-In,
Training, Clock In and Out, Administrative, Holiday, PTO, Sick, Unpaid, Bereavement,
Uncategorized.

> **`Specialites` is misspelled in the live cost-code table.** It is load-bearing across
> every historical record. Match cost codes by `id`, never by name, and do not "fix" the
> spelling without a deliberate migration.

**Document types observed:** `customerOrder`, `customerInvoice`, `vendorBill`,
`vendorOrder`, `bidRequest`. Their 30 templates map onto these — e.g. Estimate / Change
Order / Warranty / PBA / Punchlist / Insurance Restoration Agreement are all
`customerOrder`; Purchase Order / Work Order are `vendorOrder`; Pricing Request is
`bidRequest`.

**Custom fields relevant to estimating** — on `costItem`: SKU, Internal Notes, Supplier,
Status, Room, Specifications, Date Ordered, Projected Delivery Date, Actual Delivery Date.
On `job`: Status, Job Type, Project Type, Sales Rep, Project Manager, Insurance Claim,
Insurance Carrier, Claim Number, Adjuster Name/Phone/Email, Lead Source, City Job Is
Located, Job Is Within City Limits, Reconciled On / Revenue / Cost / Est Cost / Est Margin,
Final Margin %, Production Note, Material Drop Location, Service Zone.

The `job` reconciliation fields (Reconciled Cost, Reconciled Revenue, Final Margin %) are
the hook for the estimate→actuals feedback loop.

---

## 4. `costItem` — the central type

Selected fields (full type has ~45):

| Field | Type | Notes |
|---|---|---|
| `name` | string | |
| `description` | string, ≤4096 | |
| `quantity` | number, nullable | |
| `quantityFormula` | string, nullable | **null everywhere in live data** |
| `unitCost` / `unitPrice` | number, nullable | |
| `unitCostFormula` / `unitPriceFormula` | string, nullable | **null everywhere in live data** |
| `cost` / `price` / `priceWithTax` | number | Derived. |
| `isTaxable` | boolean | `false` everywhere in live data |
| `costCode` / `costType` / `unit` | relations | |
| `jobArea` | string, nullable | **null everywhere in live data** |
| `costGroup` | relation, nullable | Parent group. |
| `organizationCostItem` | relation, nullable | Link back to the catalog item. **Set on every line observed.** |
| `sourceCostItem` / `jobCostItem` | relation, nullable | Provenance chains. |
| `globalId` | string, nullable | Stable external identity per line item. |
| `position` | string, nullable | **Lexicographic fractional index** — see below. |
| `isSelected` / `isSpecification` | boolean | Selections / allowances behaviour. |
| `allowanceType` | enum, nullable | |
| `customFieldValues` | connection | |
| `files` | connection | |
| `timeEntries` | connection | Actual labor against the line. |

### `position` is a fractional index, not an integer

Observed values on a real document: `"j"`, `"k"`, `"l"`, `"m"`, `"n"`. Ordering and
insertion must generate lexicographically-sortable keys (an order-key / fractional-indexing
scheme), not integers. Sorting by `position` requires `sortBy: [{"field": "position"}]`.

---

## 5. Idempotency — `externalId` works, and is the single most important primitive

`document.externalId` is a nullable string of at most 32 characters. Two properties were
verified:

1. **It is readable.** It is `null` on every existing document, so the namespace is clean
   and entirely ours to use.
2. **It is filterable**, which is what actually matters:

```jsonc
{ "organization": { "$": { "id": "22PBAjem8SSC" },
    "documents": { "$": { "size": 2,
                          "where": [["externalId"], "=", "dbest-probe-nonexistent"] },
                   "count": {}, "nodes": { "id": {}, "externalId": {} } } } }
// => { "documents": { "count": 0, "nodes": [] } }
```

Because a miss returns `count: 0` cheaply, both halves of a reliable write are available:
a **pre-create lookup** and a **post-timeout verification**. This is what makes an
at-least-once push safe against double-creating a customer contract — the failure mode
that would otherwise be catastrophic.

Budget the 32 characters deliberately; they are tight. Whatever scheme is chosen must be
deterministic from our own estimate revision identity so a retry regenerates the identical
key.

### `globalId` gives per-line idempotency too — with 100 characters to work with

`costItem.globalId` is a nullable string with **`maxLength: 100`** on `createCostItem`, and
it was verified to be **filterable** the same way `externalId` is:

```jsonc
{ "organization": { "$": { "id": "22PBAjem8SSC" },
    "byGlobalId": { "_": "costItems",
                    "$": { "size": 2, "where": [["globalId"], "=", "dbest-probe-none"] },
                    "count": {} } } }
// => { "byGlobalId": { "count": 0 } }
```

It is also **null across all 176,155 cost items** — entirely unused, so the namespace is
ours.

This is a materially stronger position than document-level idempotency alone. Combining the
two gives:

| Level | Key | Budget | Use |
|---|---|---|---|
| Document | `externalId` | 32 chars | "Did this estimate revision already get pushed?" |
| Line item | `globalId` | 100 chars | "Which of my lines made it, and which need repair?" |

A push that times out halfway can therefore be reconciled **line by line** rather than
all-or-nothing, and our own line identity survives round-trips through JobTread's UI.
Whether uniqueness is server-enforced on either field is still **UNVERIFIED** — assume it is
not, and treat both as advisory keys that we enforce ourselves.

---

## 6. Webhooks — 43 event types, with one critical gap

`createWebhook` takes `{ organizationId, url, eventTypes[] }`. The complete verified list:

```
accountCreated  accountDeleted  accountUpdated
commentCreated  commentDeleted  commentUpdated
contactCreated  contactDeleted  contactUpdated
dailyLogCreated dailyLogDeleted dailyLogUpdated
documentCreated documentDeleted documentSent    documentUpdated
documentPaymentCreated   documentPaymentDeleted   documentPaymentUpdated
documentRecipientCreated documentRecipientDeleted documentRecipientUpdated
fileCreated     fileUpdated     fileDeleted
formSubmissionCreated formSubmissionDeleted formSubmissionUpdated
jobCreated      jobDeleted      jobUpdated
locationCreated locationDeleted locationUpdated
paymentCreated  paymentDeleted  paymentUpdated
taskCreated     taskDeleted     taskUpdated
timeEntryCreated timeEntryDeleted timeEntryUpdated
```

### The gap that shapes the whole sync design

There is **no `costItemCreated` / `costItemUpdated` / `costItemDeleted` event, and no
`costGroup` event of any kind.**

Line-item level changes inside a document are therefore **invisible to webhooks**. If an
estimator opens a pushed estimate in JobTread and edits a quantity or a unit price, no
webhook describes that change.

Consequences, which are not optional:

- Round-trip edit detection must key off `documentUpdated` and then **re-read the document
  and diff a content hash** of its line items. The event is a hint that something changed,
  never a description of what.
- A **periodic reconciliation sweep** is mandatory, not a nice-to-have. Webhooks alone
  cannot keep our copy honest.
- `documentUpdated` will also fire for changes we caused ourselves, so events must be
  filtered against our own recent writes to avoid a feedback loop.

---

## 7. The write path

`createDocument` builds an entire nested estimate in **one atomic mutation**:

```jsonc
{ "createDocument": { "$": {
    "jobId": "<jobId>",
    "type": "customerOrder",
    "name": "Estimate",
    "externalId": "<=32 chars, deterministic>",
    "taxRate": 0,
    "lineItems": [
      { "_type": "newCostGroup", "name": "Phase 1 - General Requirements",
        "lineItems": [
          { "_type": "newCostGroup", "name": "Demolition",
            "lineItems": [
              { "_type": "newCostItem",
                "name": "Demolition",
                "organizationCostItemId": "22PCCDherj6a",
                "costCodeId": "22PMwLcyPZBN",
                "costTypeId": "22PBAjfWNQr6",
                "unitId": "22PBAjfWNQqP",
                "quantity": 24,
                "quantityFormula": "...",
                "unitCost": 55,
                "unitPrice": 100,
                "isTaxable": false,
                "globalId": "<our stable line id>",
                "customFieldValues": { }
              }
            ] }
        ] }
    ]
  },
  "createdDocument": { "id": {}, "externalId": {}, "price": {}, "cost": {} } } }
```

`lineItems` entries are a `oneOf` over `newCostItem`, `newCostGroup`, `existingCostItem`,
`existingCostGroup`; groups nest recursively through their own `lineItems`. The 1500 cap is
generous — the largest observed real estimate uses 72 items and 28 groups, about 7% of it.

Also accepted on `createDocument`: `profitBreakdown` (≤10 `{name, percentage}`), `files`,
`references` (≤1000), `scheduledDocuments` (≤20), `requireSignature`,
`signatureDisclaimer`, `dueDate` / `dueDays` / `issueDate`, `taxName` /
`nonRecoverableTax`, `showProfit` / `showQuantity` / `showChildCosts` /
`showLinesAtDepth` / `groupsStartCollapsed`, `includeInBudget`, `coverPageTitle` /
`coverPageSubtitle` / `coverPagePhoto` / `coverPageTemplate`, `description` and `footer`
(plus `descriptionPdf` / `footerPdf`), `emailMessage`, `subject`, from/to contact fields,
`paymentMethods`, `allowPartialPayments`, and the QuickBooks fields (`qboAccountId`,
`qboClassId`, `qboDocumentType`, `qboTaxCodeId`, `qboIsBillable`, `qboIsIgnored`).

`createJob` and `updateJob` also accept `lineItems`, which is how a job **budget** is set as
opposed to a customer-facing document. `createCostItem` can target `organizationId`
(catalog), `jobId` (budget), `documentId` (document) or `costGroupId` (nested).

### Attaching the marked-up plan

1. `createUploadRequest` → returns `{ url, method, headers }` for a direct upload (or it can
   source a publicly reachable URL instead).
2. `createFile` attaches the upload to a resource.

Document and line-item `files` entries accept both `uploadRequestId` and
**`annotatedUploadRequestId`**, so an annotated takeoff markup can be attached to an
individual cost item — the mechanism for making every number on the estimate traceable back
to the region of plan it came from.

### Create-time defaults that will silently corrupt data

`createCostItem` input defaults, read straight off the schema:

| Field | Default | Live data reality | Risk |
|---|---|---|---|
| `isTaxable` | **`true`** | `false` on **every** observed line | **Every line we create is taxable unless we say otherwise.** Must be set explicitly on every write. |
| `requireSpecificationApproval` | `true` | — | Silently puts lines into an approval workflow. |
| `showDescription` | `true` | — | Affects customer-facing output. |
| `showQuantity` | `true` | — | Affects customer-facing output. |
| `isEditable` | `false` | — | |

The `isTaxable` default is the dangerous one: it is the opposite of this organization's
universal convention, and the divergence would appear only as a tax line on a customer
proposal. Never rely on a create-time default — write every field that matters explicitly,
and assert the round-tripped values match what was sent.

Other constraints worth knowing: `name` ≤ 250 chars, `description` ≤ 4096, `files` ≤ 10 per
cost item. `positionAfter` takes `{ type, id }` for ordering a new item relative to an
existing one, which is easier and safer than generating raw fractional `position` strings
by hand.

### Mapping endpoints

`createCostCodeMapping`, `createCostTypeMapping`, `createUnitMapping` and
`createCustomFieldMapping` exist for reconciling an external system's taxonomy against
JobTread's. Worth evaluating before hand-rolling mapping tables. Their exact semantics are
**UNVERIFIED** — introspect `root.createCostCodeMapping.$` before committing to them.

### Other notable roots

`signQuery` signs a query with the current grant and returns a token to execute it later —
potentially useful for granting a narrow, pre-authorized read to a browser client without
exposing the `grantKey`. `whoCan` / `can` expose permissions. `pdf` renders documents.
`dataView` / `dashboard` / `workflow` / `createWorkflowRun` expose their automation layer.

---

## 8. Money is returned as IEEE floats

Verified values straight off the wire:

```
8.206999999999999      121.78549999999998     869.9999999999999
119.34949999999999     67.6715                217.49999999999997
28.999999999999996     6.999899999999999      2900
```

JobTread stores and returns prices as binary floats, not decimals. Therefore:

- store currency as decimal internally (integer minor units or an arbitrary-precision
  decimal), never as a float;
- normalize and round on **both** read and write;
- **never compare JobTread numbers with `==`** — drift detection has to use an epsilon, or
  every reconciliation sweep will report phantom differences.

---

## 9. How Deitemeyer Brothers actually estimates today

From a real in-flight estimate (`22PejfgufCkY`, $277,971.02 price / $177,437.36 cost —
28 cost groups, 72 cost items):

**Group structure is phase-based, not CSI-based**, nested two to three deep:

```
LARGE RENOVATION
├── Phase 1 - General Requirements
│   ├── Permits · Measurements · Project/Site Management · Rentals
│   └── Site Preparation · Demolition · Site Clean Up
├── Phase 2 - Rough-In
│   └── Framing Materials · Insulation · Windows
└── Phase 3 - Interiors
    ├── MECHANICAL (HVAC/PLUMB) · HVAC
    ├── Electrical - Rough-In · Plumbing - Rough-In
    ├── Drywall/Plaster · Paint · Cabinetry
    └── Toilet · Lighting/Outlets/Switches · Plumbing - Fixtures
```

Assembly output must map onto **this** shape — a construction-sequence phase tree — or
estimators will not recognize their own estimates. Cost codes carry the CSI-ish
classification separately, and the two are orthogonal.

Also true of live estimates: `taxRate` 0, `isTaxable` false on all lines,
`profitBreakdown` null, `showProfit` false, `jobArea` null, all three formula fields null.
They do **zero** formula-driven estimating today; formulas would be the first such data in
the organization.

### The implicit markup schedule (measured, n = 46 priced catalog items)

| Cost type | Modal multiplier | Range | Implied gross margin |
|---|---|---|---|
| Materials | **×1.450** | 1.45 only — *zero variance* | 31.03% |
| Subcontractor | ×1.450 | 1.30 – 1.45 | 31.03% |
| Labor | **×1.818** | 1.25 – 2.27 | 45.00% |
| Other | ×1.450 | 1.45 – 2.50 | 31.03% |

Exceptions are semantic rather than sloppy: designer/CAD labor at ×1.25 (a pass-through
rate), service-repair labor $55→$125 and emergency labor $85→$190 (premium rates),
warranty products at ×2.33–2.50 (product margin). Standard crew, PM and trade labor is
uniformly $55 cost → $100 billed.

So there **is** a coherent markup schedule by cost type. It is simply encoded item by item
in 709 catalog rows instead of expressed as a rule — which is exactly what a markup engine
should formalize.

### The markup-vs-margin ambiguity is already in their live data

- Materials use **×1.45** — a 45% **markup**, i.e. a 31.03% margin.
- Labor uses **×1.818** — a 45% **margin**, i.e. an 81.8% markup.

Both are "45%". Their own production pricing already contains **both readings of the same
number**. This is not a hypothetical UI hazard; it is a live, load-bearing ambiguity. The
estimator must display markup and margin simultaneously, force an explicit choice of which
one any rule means, and reproduce today's numbers exactly under both readings during
parallel-run — otherwise the migration will look wrong to the people who have to trust it.

### They already pay for automated takeoff

Catalog rows prove existing per-job spend on measurement services:

| Item | Price |
|---|---|
| HOVER Roof Only — Simple / Average / Complex | $58.99 each |
| HOVER Complete — Simple / Average / Complex | $112.61 each |
| CANVAS Report | $0.40 / SF |

Build-vs-buy has to be argued against **~$59–113 per job for exterior measurement**, not
against a per-seat subscription alone. It also means the roofing/exterior side already has
a working answer, which is an argument for doing general-construction interiors first —
that is where they currently have no tool at all.

---

## 10. Data-quality problems that block naive reuse

These are real, verified, and each one breaks an obvious-looking implementation.

**1. Cost codes are frequently semantically wrong.**
`Insulation - Batt` → **Siding** (should be Thermal & Moisture). `Fastener - Framing Nails`
→ **Roofing**, inside a *Framing Materials* group. `Walk-In Shower` → `Specialites`.
`Perforated Corrugated Drainage Pipe` → General Requirements. `Disposal` → Site
Construction.
→ Do not treat `costCode` as a trustworthy semantic label when mining. Infer from name +
group + cost type, and *propose* corrections rather than inheriting errors.

**2. Units are used as a catch-all.**
`Drywall Board - Mat` qty 120 unit **Each** (it means sheets). `Framing - Wall` qty 530
**Each**. `Insulation - Batt` qty 40 **Each**. Only some lines carry real units
(Electrical Materials in SF, Cabinetry in LF).
→ Unit normalization is a required migration step, not polish.

**3. The same catalog item carries many different prices.**
`Drywall Board - Mat` appears three times in a *single* group at $27.98, $26.18 and $21.68,
all linked to the same `organizationCostItem` `22PCCE2cGYqw`.
→ Mining historical unit costs yields a **distribution**, not a value. Use median plus a
spread measure and surface the variance; a single "historical cost" number would lie.

**4. Duplicates are pervasive.**
Same name differing only by cost type: `3x4 Downspouts`, `6" Gutters`, `6" Gutter Corner`,
`Angled Gutter Brackets`. Pure duplicates: `8x8 Step Flashing`, `B-Vent Kit 3/4/5/6 Inch`,
`Broan Roof Cap 6`, `Broan Roof Cap 8`, `Butyl Tape`, `Cabinet Knob/Pull`,
`Aluminum Trim Coil`. Typo twins: `Broan Roof Cap 3-4` / `BroanRoof Cap 3-4`,
`Cabinet - Misc. Accessories` / `Cabinet Misc Accessories`. Same-price near-dupes:
`Aluminum Gutter Coil` / `Aluminum Gutter Stock` (both $2.84). Same name, different price:
`Bubble Underlayment` at $150 and $177.29. Mis-typed rows: `Chimney Removal` exists both as
costType=**Materials** with unit=Hours at $55/hr *and* as Subcontractor at $265/Each.
→ A scoped catalog reconciliation pass is required work. The good news: at ~709 priced
items it is small enough to review by hand with tooling assistance.

**5. Many catalog rows have null prices** — `Delivery`, `Specialty Labor`, `Late Fee`,
`DB Warranty` are placeholders carrying no unit cost or price.

---

## 11. Open questions to resolve before building the integration

- Rate limits and quotas: nothing observable or documented. Design defensively (client-side
  token bucket, exponential backoff, batching) and confirm with JobTread support.
- Exact semantics of `createCostCodeMapping` / `createUnitMapping` / `createCostTypeMapping`
  / `createCustomFieldMapping`.
- ~~Whether `globalId` on `costItem` is filterable~~ — **resolved: it is**, with a 100-char
  budget and currently null everywhere. Whether uniqueness is *server-enforced* on
  `globalId` or `externalId` remains **UNVERIFIED**; assume not and enforce it ourselves.
- Whether webhook deliveries are signed, retried, and ordered — and what the retry policy
  is on our 5xx.
- Whether a sandbox or second organization can be provisioned for integration testing.
  Absent one, all write testing must be confined to a dedicated disposable test job.
- `updateDocument` semantics on `lineItems`: full replace or merge? This determines the
  entire round-trip update strategy and must be tested on a throwaway document before any
  design depends on it.

---

## 12. Reproducing these observations

```jsonc
// Grant context and organization id
{ "currentGrant": { "organization": { "id": {}, "name": {} }, "user": { "id": {}, "name": {} } } }

// Volumes, taxonomy
{ "organization": { "$": { "id": "22PBAjem8SSC" },
    "costItems":  { "$": { "size": 1 }, "count": {} },
    "costGroups": { "$": { "size": 1 }, "count": {} },
    "costCodes":  { "$": { "size": 100 }, "count": {}, "nodes": { "id": {}, "name": {} } },
    "costTypes":  { "$": { "size": 50  }, "count": {}, "nodes": { "id": {}, "name": {} } },
    "units":      { "$": { "size": 100 }, "count": {}, "nodes": { "id": {}, "name": {} } } } }

// The true priced catalog
{ "organization": { "$": { "id": "22PBAjem8SSC" },
    "c": { "_": "costItems",
           "$": { "size": 100,
                  "where": { "and": [ [["document","id"], "=", null],
                                      [["job","id"], "=", null],
                                      [["unitCost"], ">", 0],
                                      [["unitPrice"], ">", 0] ] },
                  "sortBy": [ { "field": "name" } ] },
           "count": {}, "nextPage": {},
           "nodes": { "name": {}, "unitCost": {}, "unitPrice": {},
                      "unit": { "name": {} }, "costType": { "name": {} },
                      "costCode": { "name": {} } } } } }

// Webhook event types
{ "eventTypes": {} }

// externalId filterability
{ "organization": { "$": { "id": "22PBAjem8SSC" },
    "documents": { "$": { "size": 2, "where": [["externalId"], "=", "probe"] },
                   "count": {}, "nodes": { "id": {}, "externalId": {} } } } }
```
