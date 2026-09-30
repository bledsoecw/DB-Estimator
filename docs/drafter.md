# Drafting a budget from the templates

The auditor asks whether an estimate is priced right, and the scope review
asks whether the right lines are on it. Both need an estimate to exist. The
drafter is for the step before that: the rep has done the site visit, the
notes and photos are on the job, and nobody has two hours to build the
budget. It produces the budget the way a rep does, and nothing else.

Status: built and tested offline on 2026-09-30 against job 261323
Haag_Remodel; not yet run live, because that needs an Anthropic API key on
the machine that runs it. Writes nothing to JobTread.

## How DB builds an estimate today, and what the drafter reproduces

An estimate at Deitemeyer Brothers is built in JobTread from **budget
templates**. In the API a budget template is a top-level catalog cost group
(`Bathroom Remodel`, `Deck`, `X-Division 09 Finishes`; 44 of them on
2026-09-30). The rep:

1. adds a template group to the job's Budget tab;
2. deletes the lines the job does not need;
3. sets quantities;
4. adds a second template only for lines the first lacks, and deletes its
   extras too;
5. and when no template has the line, tells Carl, who decides.

Two facts about the templates decide the design, both VERIFIED by query:

- **Template lines carry no price.** Every line in a template has
  `unitCost: null` and points through `organizationCostItem` at an
  ungrouped, priced catalog item, the price of record. When the rep adds the
  template, JobTread prices the copied lines from those items. On job
  261457 the budget's `Window` line links to catalog item `22PCCE2YsEvY`,
  the same item the Bathroom Remodel template's `Window` line points at.
- **Every budget starts with the job template's own groups.** `CLOCK IN
  ITEMS`, `BURDEN` and `GENERAL AND ADMINISTRATIVE` are on 261323 before any
  estimate exists: 41 zero-cost lines for time tracking and fees. They are
  not scope and the drafter never touches them.

So the drafter's output is not a list of invented lines. It is: **which
templates to add, which of their lines to keep with what quantity, which to
delete, and what has no template line at all.** The model chooses and
quantifies. The code prices, from the catalog item each kept line points at,
with the same exact arithmetic the auditor uses. A line id the model names
that is not in the chosen templates is rejected and listed on the page.
That is the "out of thin air" case Carl asked to see, and it is never
silently added or silently dropped.

## Two calls

**Pick.** The model reads the job (description, the whole conversation,
the site photos, any drawings or quotes) and the list of all 44 templates
with their descriptions and group names, and picks a primary template plus
at most three supplements, or says nothing fits. A basement paint-and-floor
refresh has no job-type template, so the expected pick is `X-Division 09
Finishes` with `X-Division 01 General Requirements` beside it.

**Draft.** The model reads the job again beside every line of the chosen
templates (id, group, unit, cost type, description; no prices) and returns
the lines to keep, each with a quantity, the basis for it, the evidence it
rests on, an option name when the customer is choosing between alternatives,
and a confidence. It also returns the gaps, the questions for the rep, and
the scope-of-work text for the General Description line.

Rules the model is held to, from the roadmap's "failures must be visible":

- quantities come from measurements or counts written in the notes, counts
  visible in photos, or arithmetic on written dimensions, shown; nothing is
  measured from a photo;
- labor hours are its estimate, with a stated basis and an honest
  confidence, because the rep will check those first;
- when a line's description already includes waste, none is added;
- an option named "Group — Choice" is one of several the customer picks
  between; a bare name is a yes-or-no add-on the customer may decline;
- a non-monetized time-tracking line (Sales On-Site Support) is kept at
  quantity 0, not treated as scope;
- at most six questions, ordered by how much the answer changes the price;
- pricing, markup and margin are not its business and are not mentioned.

## What the rep gets

`review/<jobId>-draft.html`, one self-contained page:

- the base scope's price, cost and margin, and each option's on its own
  (`Flooring — LVP` against `Flooring — Epoxy`, so the customer can pick);
- per template: the lines to keep with quantity, unit price, extension and
  basis, and the list to delete;
- **Not in any template**: the gaps, flagged red, for Carl;
- **Confirm before it goes out**: the questions;
- **Named by the model, not in the templates**: rejected ids, if any;
- the General Description text;
- **Build it in JobTread**: the numbered steps, with a Copy button.

`review/<jobId>-draft.json` holds the same draft as data. It is the payload
the write path (roadmap §7) will one day push as a job budget; today a
person follows the steps.

## Why not JobTread's own AI

Tried 2026-09-30, on 261323, with the prompt below pasted into the "Build with
AI" panel on the Budget tab. It never produced a budget. It found the discovery
note and summarised it correctly, then spent the rest of the session re-reading
JobTread's API help pages, reported that "the catalog search isn't filtering
properly — it's returning all items regardless of the search term", and looped.

The panel is a general assistant that has to rediscover the Pave API on every
question. It did not know that a budget template is a top-level cost group with
no parent, that a template line carries no price and points at a priced catalog
item, or how to filter the catalog. Those are the verified facts this repository
exists to hold (`jobtread-api-field-notes.md`), and the drafter has them written
down. The panel is also not reachable from the API, so nothing it does can be
tested against a fixture, priced by code, or gated on ten of Robert's jobs.

The prompt, for the record:

> Build this job's budget only from our budget templates in the Catalog, the way
> our reps do. Read the discovery notes in Messages and the photos in Files first.
> Pick the template that fits this job, add it, delete the lines the job does not
> need, and set quantities from the measurements in the notes (18'4" x 38'6", 8'
> walls). Add a second template only for lines the first does not have. Do not
> create any line that is not in a template. If the job needs something no
> template has, list it separately for Carl instead of adding it.

Decision: the drafter runs on the Anthropic API with a capped key. The write
path, when it comes, is roadmap §7 against the Pave API directly, not a chat
panel asked to type.

## The first live run — 261323, 2026-09-30

Two calls, about fifty cents. The picker chose `X-Division 09 Finishes` with
`01 General Requirements` and `02 Site Construction` beside it, which is what
a rep would reach for on a basement refresh. The draft kept 12 lines across
the three, every quantity traced to the measurement in Robert's note with
the arithmetic shown, and it read the photos: steel posts, a block pier, the
sump pit and the laundry platform slowing the LVP install; peeling paint and
cracks on the walls; an old coating on the slab. It split flooring into LVP
and epoxy for the customer to choose and made ceiling paint and contents
moving optional. It flagged two gaps rather than bend a line: skim-coating
concrete walls has no template line, and it would not use the drywall mud
lines for it. That is a real catalog question for Carl.

Four things were wrong, all fixed the same day:

1. The base price left the skim coat out, because the skim coat was in the
   gaps, and said nothing about it. The total now says how many flagged items
   it leaves out, and the page says so beside the number.
2. Ceiling paint and contents moving are yes-or-no add-ons, not either-or
   choices, but every option was rendered as "one choice required". The
   option name now carries the difference ("Flooring — LVP" is one of
   several; "Ceiling paint" is an add-on) and the steps build each the right
   way.
3. It deleted Sales On-Site Support, the $0 time-tracking line every
   construction budget carries. Non-monetized lines are now kept at
   quantity 0 and shown as tracking, not as unpriced.
4. Ten questions. Six changed the price; the rest were things the estimate
   already handles. Capped at six, ordered by what they change.

## Running it

```
cd /c/dev/DB-Estimator && git pull && npm install
npm run draft -- 261323 --dry-run                 # sends nothing; writes what the model would read
npm run draft -- 261323 --out review              # needs ANTHROPIC_API_KEY in .env
npm run draft -- 261323 --templates 22PLCZU3cbqS,22PF3gnGCuiB   # skip the picker
npm run draft -- 261323 --capture test/fixtures/haag-live.json  # save the job and templates
npm run draft -- --fixture test/fixtures/haag-basement.json     # replay offline (still calls the model)
```

The job is the six-digit number that starts its name, the hyphenated number
JobTread stores, or the job id. The dry run needs only the JobTread key.

Before the first paid call the CLI asks Anthropic for the model's record,
which is free and fails exactly where a paid call would: a key scoped to the
organization rather than a workspace (add `ANTHROPIC_WORKSPACE_ID` to `.env`,
or create the key inside a workspace), a bad key, or a console with no credit.
It stops there with a plain sentence, and nothing is spent.

## Cost

Two calls on Claude Opus 5.5 at $4 per million input tokens and $20 per
million output. The pick reads the job and 18 photos plus the template list
(about 40,000 tokens); the draft reads the job and photos again plus two
templates' lines (about 45,000 tokens) and writes perhaps 6,000. Roughly
$0.50 for a job like 261323; a large addition against the 350-line
`Addition/House Build` template might be $1.50. The page prints the actual
figure. Twenty drafts a month is on the order of $10 to $30.

## What leaves the building

Nothing, until a key is set. With one, the job's description, comments,
photos and files, and the chosen templates' line names, units and
descriptions go to Anthropic's API under its commercial terms. No prices go,
and nothing is written back to JobTread. The rendered page and JSON stay
local like the other reports.

## Gate

The same shape as the auditor's Stage 1. Robert drafts his next ten
construction jobs through it and, for each, records three numbers on the
page: lines the draft kept that he deleted, lines he had to add by hand, and
quantities he changed by more than a quarter. Kristen grades the gaps and
questions Real or Not real. The prompt is fixed for each class of miss
until eight of ten drafts need under ten minutes of the rep's work to become
the budget he would have built. Until then it is a draft he reads, not one
he trusts.

## Not built yet

- **The write path.** The JSON is the payload; pushing it as a job budget
  is roadmap §7, still off. The steps on the page are what the rep does by
  hand today.
- **Gaps against the whole catalog.** A gap is flagged with a unit, a
  quantity and a cost type. It does not yet search the 718 priced but
  ungrouped catalog items for one that already exists; that is a cheap
  addition once the first live drafts show what the gaps look like.
- **The auditor on the draft.** Every kept line is priced from the catalog,
  so the pricing checks pass by construction; the comparables band (this
  draft's margin against approved jobs of its size) is the one worth
  wiring in.
- **Work orders, purchase orders, the project folder.** Kristen's work after
  the contract is signed: the same lines regrouped by who does them, on the
  `Work Order` and `Purchase Order` document templates. Next, after the
  drafter has been used live.
