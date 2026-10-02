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
