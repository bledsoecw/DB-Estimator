# JobTread API — Field Notes

**Status:** verified directly against the live Deitemeyer Brothers organization
**Date of observation:** 2026-09-18
**Organization:** Deitemeyer Brothers — `22PBAjem8SSC`

Everything in this document was confirmed by querying the live API, not inferred from
documentation. Where a claim is unverified it is marked **UNVERIFIED**. Figures here are the
baseline that the estimator's JobTread integration is designed against; re-verify before
relying on any of it after a JobTread release.

> ### Revision 2 — corrections to Revision 1
>
> Revision 1 of this document generalized several claims from a single sampled estimate.
> An adversarial re-verification pass against org-wide counts found six of them wrong. They
> are corrected in place below; this notice records what changed, because Revision 1 was
> committed and may have been read.
>
> | Rev 1 claim | Reality | Where |
> |---|---|---|
> | `_type` discriminator is `"newCostItem"` / `"newCostGroup"` | **`"costItem"` / `"costGroup"`.** New vs. existing is decided by the presence of `id`, not the `_type` string. The Rev 1 payload example would be **rejected by validation**. | §7 |
> | `isTaxable` is `false` on every line | **80,462 of 176,156 cost items are `isTaxable: true` (46%).** | §4, §9 |
> | `taxRate` is 0 on live estimates | **60 documents carry `taxRate > 0`, including `customerOrder` "Estimate" at 0.0725 and 0.0685** (Ohio rates). | §9 |
> | All three formula fields are null everywhere | **`quantityFormula` is populated on 5,451 cost items** with a real named-variable syntax. Only `unitCostFormula`/`unitPriceFormula` are null (0 of 176,156). | §4, §9 |
> | `externalId` is null on every document | **2,156 of 8,463 documents carry one** — vendor invoice numbers on `vendorBill`. The *conclusion* survives: **0 of 2,181 `customerOrder` documents** have one. | §5 |
> | The 1500 `lineItems` cap is a document-wide node budget | **It is declared per level**, on the top-level array and on every nested group's array. True capacity is far larger. | §1, §7 |
> | `jobArea` is null org-wide | **6 cost items carry one** ("Master Bathroom", "Kitchen"). 99.997% free, not empty. | §4 |
>
> The lesson generalizes: **a single document is not a sample.** Every claim about
> org-wide state in this document is now backed by a `count` over the whole organization,
> not by inspection of one record.

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
| `createDocument` `lineItems` | **1500 max, per level** | Declared independently on the top-level array and on every nested group's array — not a document-wide node budget. |
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
| `quantityFormula` | string, nullable | **Populated on 5,451 items** — a real evaluator, see §9. |
| `unitCost` / `unitPrice` | number, nullable | |
| `unitCostFormula` / `unitPriceFormula` | string, nullable | Genuinely null — 0 of 176,156. |
| `cost` / `price` / `priceWithTax` | number | Derived. |
| `isTaxable` | boolean | **`true` on 80,462 of 176,156 (46%)** — not the false-everywhere of Rev 1. |
| `costCode` / `costType` / `unit` | relations | |
| `jobArea` | string, nullable | Non-null on only **6** of 176,156 items ("Master Bathroom", "Kitchen"). Effectively free, but do not assert it is empty. |
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

1. **It is readable — and already in use, but not where we need it.** 2,156 of 8,463
   documents carry a non-null `externalId`: 2,155 `vendorBill` and 1 `vendorOrder`, holding
   vendor invoice numbers (`"69420400"`, `"H26957"`, `"523815"`). Almost certainly written
   by their accounting integration.
   **But 0 of 2,181 `customerOrder` documents carry one.** The namespace we actually need
   is clean — and we must never write `externalId` on a `vendorBill`, where we would
   collide with a live accounting convention.
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
      { "_type": "costGroup", "name": "Phase 1 - General Requirements",
        "lineItems": [
          { "_type": "costGroup", "name": "Demolition",
            "lineItems": [
              { "_type": "costItem",
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

### The `_type` discriminator is the entity type, not the variant name

This is the single most dangerous detail on the write path, because the wrong value fails
validation rather than doing something subtly odd:

```jsonc
{ "schema": { "$": { "expand": true,
                     "path": "root.createDocument.$.lineItems._on_newCostItem._type" } } }
// => { "type": "constant", "typeInput": "costItem" }      // NOT "newCostItem"
// and _on_newCostGroup._type => constant "costGroup"      // NOT "newCostGroup"
```

`lineItems` entries are a `oneOf` over the schema variants `newCostItem`, `newCostGroup`,
`existingCostItem`, `existingCostGroup` — but the `_type` **value** you send is only ever
`"costItem"` or `"costGroup"`. New versus existing is discriminated by **the presence of an
`id`**, not by the `_type` string. Groups nest recursively through their own `lineItems`.

The **1500 cap is declared independently on each `lineItems` array** — the top-level one and
every nested group's. It is a per-level cap, not a document-wide node budget, so real
capacity is far larger than 1500. The largest observed real estimate uses 100 nodes total
(72 items + 28 groups). A conservative preflight assert on total node count is still worth
keeping, but it is our own discipline, not an API limit.

`positionAfter` exists on `createCostItem` but is **not present on any `createDocument` /
`updateDocument` lineItems variant**. Inside the atomic document mutation, ordering is by
**array index only** — which is simpler and is the path to prefer anyway.

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

---

## 7a. Capabilities worth building on that are easy to miss

These were found on a second introspection pass and several change design options
materially.

### JobTread has a full plan-annotation vector API — this is the differentiator

`root.createPlan` / `updatePlan` / `deletePlan` exist, and `updatePlan.$.annotations` takes
up to 1000 entries of `oneOf {path, text, point, meta}`. The `path` variant:

```jsonc
{ "type": "path",              // constant
  "page": 1,                   // int, gte 1
  "id": "<our annotation id>",
  "isNegative": false,         // optional — DEDUCTION regions are native
  "isClosed": true,            // optional — closed polygons
  "strokeWidth": 2,
  "strokeColor": "<color>",
  "fillColor": "<color>",      // optional
  "fillOpacity": 0.25,         // optional
  "points": [ /* freedraw: 2..2000 numbers, i.e. up to 1000 xy pairs */ ] }
```

`createUploadRequest.$.annotations` accepts the same shape.

This means takeoff polygons can be pushed back into JobTread as **native plan annotations**,
including negative/deduction regions and closed areas. A project manager opens the plan in
JobTread — no new tool, no new login — and sees exactly the regions the estimate was built
from. Neither STACK nor Togal can do that, because neither is inside JobTread. Treat this as
a first-class integration target rather than a nicety.

`plan.previousFilePages` (nullable array of `{file, page, updatedAt}`) means JobTread
**already tracks plan-page revision lineage**. Stale-takeoff detection on a plan revision can
seed from this instead of inventing it.

### Distinguishing our writes from human edits, natively

`document.events` is a **per-document** event connection (filterable, sortable, paginated),
not just the org-wide `organization.events`. Reconciling one document does not require
trawling a global feed. Each node carries `type`, `createdAt`, `createdByGrantId`,
`createdByGrantName` and `createdByUser`.

Observed on the live estimate `22PejfgufCkY` (9 events):

| `createdByGrantName` | `createdByGrantId` | `createdByUser` |
|---|---|---|
| `JobTread App` | `22PcWa26R9rb` | Kristin Holt |
| `JobTread App` | `22PdTim6CFBz` | Operations Account |
| `Deitemeyer Brothers Link Access Grant` | `22PawKHpYjTm` | John Sherman |
| *(null)* | *(null)* | John Sherman |

> **Correction to a plausible-sounding but wrong reading.** It is tempting to conclude that
> `createdByGrantId` is null for human UI actions and populated for API writes. **It is
> not.** Ordinary UI edits by staff carry a populated grant id under the grant name
> `JobTread App`, and null appears on some human actions too. Grant id presence does not
> separate humans from machines.

The **correct** loop-breaker is stronger anyway: our integration authenticates with **its
own named grant**, so our writes carry *our* `createdByGrantId`. Identify our own writes
**positively** by matching that id, and treat everything else — `JobTread App`, link-access
grants, null — as "not us, re-read and reconcile". A positive allowlist of one id beats any
heuristic about what null means.

This should still be confirmed by inspecting the events generated by our own first test
write, since the grant identity used by the integration is what matters and has not yet
been exercised.

### Reading a subtree in one call — confirmed

`costGroup.descendentCostItems` and `costGroup.descendentCostGroups` verified live: the
`Phase 1 - General Requirements` group returns its **10** descendant cost items and **7**
descendant groups in a single call, across nesting levels. Far better than paging
`document.costItems` at 100 and rebuilding the tree from leaves.

Note that `document` has **no `updatedAt` field**, which is why a content fingerprint —
rather than a timestamp comparison — is the correct drift-detection mechanism.

### Native allowances are three-valued, not a boolean

`allowanceType` is a `oneOf` enum with **three** values: `cost`, `costAndFee`, `price`.
Modelling allowances as a local `includes_markup` boolean is a lossy two-value encoding that
silently drops `costAndFee`. Use the native three-state enum. `document.allowanceCostItem`
and `document.allowanceDeductionCostItem` exist, and `createDocument.$.allowanceCostItemId`
lets a document be created *against* an allowance — native allowance reconciliation.

### Native selections / options

`newCostGroup` accepts `isSimpleSelection`, `minSelectionsRequired`, `maxSelectionsAllowed`
and `showChildDeltas`; `costItem` carries `isSelected` and `isSpecification`;
`document.isSimpleSelection` and `updateSelectionAssignment` exist. "Give the customer three
options" is a built-in, not something to rebuild.

#### `isSelected` does not tell you what is selected — **VERIFIED**

Read back on three documents, `isSelected` is `false` on **every** cost item and **every**
cost group, including the branches whose money is plainly in the document total:

| Document | Items | `isSelected: false` | Groups | `isSelected: false` |
|---|---|---|---|---|
| `22PfKxuR9Vrx` Jones_Bath/Kitchen | 26 | 26 | 13 | 13 |
| `22PNhaVC26Ma` Wright_Roof | 101 | 101 | 11 | 11 |
| `22PPQD68bhaX` Daeger_Roof | 67 | 0 | 7 | 0 |

Daeger has no selection groups at all, so nothing is ever marked — which is why its count
is zero rather than sixty-seven. Where selections *do* exist the field is uniformly false,
so it distinguishes nothing. A rule that trusts it either counts every branch or counts
none.

**What is reliable is the arithmetic.** The document's stored `price` is the sum of the
lines that count, so the branches left out are whichever combination makes up the
difference. On Wright_Roof the lines total $93,310.80 against a stored $80,552.24, and the
$12,758.56 gap is exactly `Full Shingle Roof Removal` ($8,996.86) + `Platinum Metals 20
Warranty` ($2,220.00) + `SS Steel Roof Texture` ($1,541.70) — three branches in three
separate groups, not one.

Two consequences worth stating, because both were wrong in the first implementation:

- **Alternatives appear as child groups OR as lines.** `Shingle Removal` picks between two
  child *groups*; `Standing Seam Roof Warranties` picks between two *lines* in the group
  itself; `Upgrades` (`minSelectionsRequired: 0`) offers a single line that may just not be
  taken. Enumerating only child groups misses two of Wright's three.
- **Tax is charged on the selected base only.** Wright has 57 taxable lines totalling
  $30,491.21, which at 6.85% would be $2,088.65 — but JobTread charges $1,958.35. The
  $130.30 difference is tax on $1,902.11 of taxable lines inside branches the customer did
  not take. Against the selected base it closes to the cent.

### Tax is configured almost nowhere, and `isTaxable` means nothing — **VERIFIED**

Counted across all **802 approved customer orders** in the organization:

| Count | What |
|---:|---|
| 4 | approved customer orders that carry a tax rate at all |
| 4,170 | cost items flagged `isTaxable` on a document whose rate is 0 |
| **0** | cost items flagged `isTaxable` on a document that has a rate |

`isTaxable` defaults to true on creation (see §7 create-time defaults), nobody clears it
because it has never changed what a customer pays, and the two are never seen together on
approved work. Any rule that treats the flag as an assertion about tax will fire on
thousands of items and mean nothing by it.

Where a rate *is* set, the arithmetic is exact — see the selected-base finding above — so
the flag is not useless, only unused.

### Customer-facing defaults are the opposite of what they look like — **VERIFIED**

Same 802 approved customer orders:

| Count | Share | Setting |
|---:|---:|---|
| 456 | 57% | `requireSignature: false` — **and all of these were accepted** |
| 658 | 82% | `showChildCosts: true`, so the customer sees every line price |
| 71 | 9% | signature required *and* line prices hidden |

The first row disproves a claim worth stating plainly, because a rule was built on it: a
customer order **can** be accepted with no signature requirement. It happens on the
majority of them.

### `references` for change-order lineage

`createDocument.$.references` (≤1000) feeds `document.referencedDocuments` and
`document.referencedTimeEntries`, reversible via `deleteDocumentReference`. A change order
can natively reference the baseline estimate it amends.

### `documentTemplate.templateName` disambiguates the six "Estimate" templates

`name` is not unique; `templateName` is the meaningful one:

| id | `name` | `templateName` |
|---|---|---|
| `22PByuQ6ivP5` | Estimate | **Const - Small** |
| `22PBz28funCv` | Estimate | **Const - Med** |
| `22PBz2nQunqm` | Estimate | **Const - Large** |
| `22PHqjjFH3XC` | Estimate | Ballpark |
| `22PBAjfWNQrV` | Estimate | Roof - No Terms/50% Down |
| `22PNbCYDRACT` | Estimate | Roof - SS No Terms/50% Down |

The general-construction targets are **Const - Small / Med / Large**, tiered by project
size, with Ballpark for early-stage numbers. The roofing pair is cleanly separable, which
supports doing general construction first.

### `includeInBudget` defaults to `true` — and is not a promotion signal

`createDocument.$.includeInBudget` has `defaultValue: true`, a document-level default trap
alongside the cost-item ones in §7. More importantly, the live in-flight estimate
`22PejfgufCkY` has `includeInBudget: true` while still `pending` — it is the *normal* state
of a working estimate, not a sign that it has been promoted to a contract. Any lifecycle
lock keyed on `includeInBudget` turning true would lock essentially every document
immediately. Use `status != draft`, a non-zero `documentRecipients` count, or a non-null
`signedAt` instead.

### `organizationCostItemId` is optional at the API level

It is `{nullable: jobtreadId}` on both `createCostItem` and the `newCostItem` line variant.
Its 100% presence in DB's live data is an organizational convention, **not** a server
constraint — so a dropped catalog link will not be caught by a server rejection. Enforce it
in our own preflight.

### `root.$.viaUserId`

A request-level "restrict results to a specific user scope" primitive. Potentially a
server-side way to enforce a price-only role rather than relying solely on our own cost
stripping. Semantics **UNVERIFIED**; worth a spike.

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

On *this* document: `taxRate` 0, `isTaxable` false on all lines, `profitBreakdown` null,
`showProfit` false, `jobArea` null. **None of those generalize** — see below.

### Tax is real, and not defaulted off

Org-wide counts, not a single sample:

| Query | Count |
|---|---|
| `costItems` where `isTaxable = true` | **80,462** |
| `costItems` where `isTaxable = false` | 95,694 |
| `documents` where `taxRate > 0` | **60** |

Observed taxed documents include `customerOrder` documents named "Estimate" at `taxRate`
0.0725 and 0.0685 — Ohio sales-tax rates — and a `vendorOrder` Work Order at 0.0725.

So roughly **46% of all cost items are marked taxable** and real customer estimates do
charge tax. Any design that hardcodes `isTaxable: false` / `taxRate: 0` "to match their
data" would **under-bill tax on a real subset of the work**. Taxability needs an actual
per-project rule, and the rule needs an accountant's sign-off, not a default.

Note also that `taxRate` is a **fraction in [0, 1]** (`gte: 0, lte: 1`), not a percentage —
0.0725, not 7.25. An easy and expensive off-by-100.

### They already do formula-driven estimating — just not on customer documents

`quantityFormula` is populated on **5,451 cost items**, with a working named-variable
syntax:

```
round({Area}/8.5)               → Demolition, in Hours
round(({Area}*{Depth})/27)      → Hand Excavation / Bulk Excavation / Gravel, in Cubic Yards
round(({Area}/5.5)/3)           → Framing/Sheathing Labor, in Hours
ceil({Area} / 8.5)              → Demolition, in Hours  (a `ceil` variant of the same rule)
```

These live on **catalog rows and job-budget lines**, and on **zero `customerOrder` lines** —
which is why a sample drawn from one customer estimate showed none. `unitCostFormula` and
`unitPriceFormula` genuinely are null across all 176,156 items.

Two consequences, both good:

1. **JobTread has a real formula evaluator with named `{Variable}` references, `round` and
   `ceil`, in production use.** Mirroring our computed quantities into `quantityFormula` is
   therefore plausible rather than speculative — though the exact grammar, variable
   binding, and evaluation timing are still **UNVERIFIED** and need a throwaway-document
   test before anything depends on them.
2. **Those ~101 catalog formulas are DB's own existing assembly logic, free to read.**
   `round({Area}/8.5)` is a productivity rate — 8.5 SF of demolition per labor hour —
   already encoded by their own estimators. That is the seed corpus for an assembly
   library, and it is far better evidence than anything derived from a generic cost book.

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

## 10a. Operational facts about the live environment

Verified 2026-09-19. These are about *this organization's setup*, not the API, and each one
has a direct consequence for a first write.

### Four webhooks already exist, and a push will trigger them

| Consumer | Subscribed events |
|---|---|
| Google Apps Script (`script.google.com/macros/…`) | `jobCreated`, `jobUpdated`, `commentCreated`, `documentRecipientUpdated`, **`documentUpdated`** |
| `closeout.deitemeyerbrothers.com` | `taskCreated`, `taskUpdated`, `taskDeleted`, `jobUpdated` |
| `db-zone-setter-…vercel.app` | `jobCreated`, `jobUpdated`, `locationCreated`, `locationUpdated`, **`documentCreated`**, **`documentUpdated`** |
| `ops.deitemeyerbrothers.com` | **`documentCreated`**, **`documentUpdated`** |

So **`documentCreated` fans out to 2 consumers and `documentUpdated` to 3.** The very first
estimate pushed by DB Estimator will immediately invoke a Google Apps Script, a Vercel
function and DB's own ops service — all written before this system existed and none aware
of it.

Every one of those handlers needs an explicit namespace skip for our documents **before**
push #1, and each needs a confirmed owner. This is a prerequisite, not a follow-up.

> **Credential hygiene.** Three of those webhook URLs embed a bearer token — in a query
> string (`?token=…`) or in the path. They are readable by anyone who can call
> `organization.webhooks`. Do not copy webhook URLs into documents, tickets, logs or commit
> messages, and treat them as rotatable secrets. They are deliberately omitted above.

### Pushing a `customerOrder` almost certainly does not reach QuickBooks

| Query | Count |
|---|---|
| `documents` where `qboId != null` | 1,106 (all `customerInvoice` / `vendorBill`) |
| `customerOrder` documents where `qboId != null` | **0** of 2,181 |

Estimates have never synced to QuickBooks in this organization; invoices and bills have.
Strong evidence that creating a `customerOrder` has no accounting side effect — but it is
inference from a pattern, so **confirm in writing** before the first push rather than
discovering otherwise on a real customer.

### Grants carry a scopable action list — VERIFIED 2026-09-28

`grant.allowedActions` is a **nullable array of `action`**, so a grant can be restricted to
an explicit list of permitted operations. The exploration grant carries 130+ actions,
including `updateCostType`, `updateCostCode` and `updateCatalog` — meaning it can change the
markup policy itself — plus `updateRole`, `updateUser`, `updateOrganization`,
`updateMembership` and `updateWebhook`. None of those belong on an agent's grant.

Useful distinctions in the vocabulary: `readCatalogCosts` and `readCatalogPrices` are
**separate actions**, so cost-blind access is enforceable server-side rather than by masking
fields in a UI; `draftDocument` is distinct from `updateDocument`; and
`readDocumentInternals` / `readJobInternals` / `readJobFinancialSummary` are separately
gateable. `deleteDocument` is absent from the exploration grant.

No explicit *send* action appeared in the vocabulary — see the open questions below.

### The current grant is shared, and expires on a rolling date

```jsonc
{ "currentGrant": { "id": {}, "name": {}, "expiresAt": {}, "createdAt": {} } }
// => id 22PXNFaV6ZW4, name "Access for claude.ai",
//    createdAt 2026-05-15T15:34:30Z, expiresAt 2026-12-27T19:00:20Z  (rolls — read 2026-12-18 nine days earlier)
```

All observations in this document were made through a **general-purpose grant named
"Access for claude.ai"**, whose expiry **rolls forward** — it read 2026-12-18 on
2026-09-19 and 2026-12-27 on 2026-09-28. It is not a fixed cliff, but it is shared. The integration must not inherit it. It needs its own named grant, because
grant identity is also the echo-suppression key (§7a) and a shared grant makes our writes
indistinguishable from anything else using the same credential.

There is **no `createGrant` mutation**, so provisioning is a manual step in the JobTread UI
and belongs on the critical path, not in a backlog. Plan for rotation from the start, and
retain historical grant ids so events written under a previous grant are still recognized
as ours.

---

## 11. Open questions to resolve before building the integration

- Rate limits and quotas: nothing observable or documented. Design defensively (client-side
  token bucket, exponential backoff, batching) and confirm with JobTread support.
- Exact semantics of `createCostCodeMapping` / `createUnitMapping` / `createCostTypeMapping`
  / `createCustomFieldMapping`.
- Whether `sendDocument` is governed by `draftDocument`, `updateDocument`, or an action not
  surfaced by schema search — test on a disposable document before relying on grant scoping
  to make sending impossible (§19.2).
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
