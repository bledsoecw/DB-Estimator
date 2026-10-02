# DB Estimator: standing rules

Deitemeyer Brothers (DB), Van Wert, Ohio. Tools that read JobTread, audit
estimates, and draft budgets from DB's budget templates (`npm run draft`) and
build them into a job (`npm run build-budget`). Carl Bledsoe decides; Kristen
May reviews estimates. See README.md and docs/drafter.md.

## How estimating evidence is read

These are rules Carl taught; they apply to every trade on every job, not to
one quote.

- **Read the subs' and vendors' quotes behind past work.** When past costs
  are looked up, the quote, bid or invoice files on those jobs are read for
  every size, quantity, unit price and total written on them. That is what
  turns a sub's lump sum into a per-unit cost for a new estimate
  (`src/draft/readings.ts`).
- **The sub's own paper first.** A file on a work order, purchase order,
  vendor bill or bid request outranks DB's own change order or invoice scan
  (`fileRank` in `src/draft/history.ts`).
- **Never say a size or quantity is "not shown" without having read the
  quotes on that job.** If a quote could not be read, say so and name it.
- **New quotes are read.** A learned price yields to new sub paper for that
  trade; a lump sum that could not be put per unit is searched again every
  run.
- **A unit conflict between a template line and its catalog item is flagged,
  never switched automatically.**

## How a draft is put together

Also from Carl, 25-0000, 2026-10-02:

- **A learned answer belongs to the line it was found for.** The price book
  keeps answers per search word and line; a template line reuses only its own
  line's answer. Only facts about the past work are kept; what it meant for
  that job (`thisJob`) is shown once and never carried to the next job
  (`src/draft/learned.ts`).
- **A general line stays in its own section.** Crew Labor filed under Roofing
  is the roofing crew's time; base-scope hours for other work go in as a gap
  so DB's Crew Labor is placed where the work is. Option lines are built in
  their choice group, so they are exempt (`borrowedLines` in
  `src/draft/checks.ts`, rule 16 in `src/draft/prompt.ts`).
- **The construction line, not the roofing division's.** A line ending (R)
  is the roofing division's, booked to Roofing; on a job with no roofing work
  its (C) twin is kept (Project Management (C)), and the draft swaps a kept
  (R) line for the (C) one in the same section (`constructionTwins` in
  `src/draft/draft.ts`, rule 16 in `src/draft/prompt.ts`).
- **"Choose one" means two or more choices.** An open item (a gap with an
  option) is a choice; a "Group — Choice" with no other choice is flagged
  (`totalsByOption` in `src/draft/draft.ts`, `optionFlags` in
  `src/draft/render.ts`).
- **Every material needs labor to install it, counted once.** A labor line
  of its own trade or the sub line that installs it, in the same choice.
  Wainscot gets its own labor line, Wainscot Labor (catalog item
  `22PfZZt5r3C2`, $55 cost / $100 price, beside Wainscoting in X-Division 06,
  Bathroom Remodel and Addition/House Build), never Trim Labor (Trim Labor is
  the trim) (rule 17 in `src/draft/prompt.ts`, `uninstalledMaterials` in
  `src/draft/checks.ts`).
- **Contingency follows DB's policy conditions; the highest wins.** The
  model names the conditions, the code sets the rate
  (`CONTINGENCY_CONDITIONS` in `src/draft/contingency.ts`). An older home
  with signs of more hidden unknowns (water staining, cracks, efflorescence,
  peeling paint, old wiring or plumbing) is 10%.

## How a budget is laid out on the job

From Carl, 2026-10-02, with a picture of the NEW POOL HOUSE SCOPE budget:

- **Built on Addition/House Build.** Every non-roofing draft uses it alone
  (`BASE_TEMPLATE_ID`); a line it lacks comes from the catalog into the right
  phase and section.
- **One top group that reads what the job is** ("BASEMENT FINISH SCOPE",
  from the draft's `scopeTitle`), with the job's description (the scope of
  work) as its description. Under it the template's phases and sections, in
  the template's order. No General Description line.
- **Selections sit in the section of their work**, no CUSTOMER OPTIONS group.
- **A line created on the job takes its section's cost code** (the code the
  section's own lines carry), never General Requirements by default
  (`sectionCode` in `src/draft/build.ts`).
- **Contingency: a share in each choice and the base line at the end of
  Phase 1 - General Requirements. No Phase 5.** The seven phased templates
  carry the line there too (moved 2026-10-02, `docs/contingency.md`).

## What not to do

- Change catalog templates only when Carl asks. Leave roofing templates
  (Shawn's) alone.
- Writes to JobTread go only through `src/jobtread/writer.ts`, with the
  separate `JOBTREAD_WRITE_GRANT_KEY`; the read client stays read-only. Write
  to test jobs (e.g. 25-0000) unless `--live` is given.
- Secrets stay in `.env`. Pricing data, rendered review pages, and the
  learned store never go in git. The learned store is one shared file in
  Carl's OneDrive (`SHARED_LEARNED_PATH` in `src/draft-cli.ts`), falling back
  to `.db-estimator/` on a computer without that folder.
