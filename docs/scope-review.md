# Scope review

The pricing checks ask whether the lines on an estimate are priced right. This
asks whether the right lines are on it: what the job's own record says the work
is, against what the estimate carries. It is the part of Kristen's review that
takes the time, and the part the roadmap names as where the money is actually
lost ("forgotten scope, not arithmetic, is the common loss").

Status: built and tested offline on 2026-09-29; not yet run against a live
estimate, because that needs an Anthropic API key on the machine that runs it.

## What it reads

For one estimate, the tool assembles what a reviewer would read, from JobTread
(read-only), and hands it to a model:

- the job: name, project type, description;
- the whole conversation on the job, oldest first: discovery notes, the
  selections meeting, supplier emails, "please review this";
- every line on the estimate with its description, quantity, unit, unit cost
  and unit price, in the groups the customer sees;
- the files on the job that existed when the estimate was issued: supplier
  quotes (PDF), site photos (CompanyCam). Receipts and delivery tickets
  uploaded after the issue date are left out, so an approved estimate is
  reviewed on what the rep knew, not on how the job went.

On 261209 Hunter_Bathroom that is 59 lines, 43 comments, four supplier quotes
and about 22 photos. The dry run lists exactly what would be sent and why the
rest was not.

## What it raises

Four kinds of finding, each with the comment, file or line it rests on, so it
can be checked in seconds and marked Real or Not real like everything else:

| Kind | Meaning |
|---|---|
| missing | scope the evidence says is part of the job that no line covers |
| quantity | a line whose quantity or hours does not fit the evidence |
| vendor | a supplier quote that disagrees with the estimate: item, model, quantity or price |
| question | something the rep should confirm because the evidence is unclear or contradicts itself |

Two rules the model is held to, from the roadmap's "failures must be visible":
it may count what it can see or read (fixtures in a photo, items on a quote,
dimensions in a note) but must not compute an area, a length or an hour count
from a photo; and it does not touch pricing, markup or margin, which the rules
already check.

The findings land on the same approver page as the pricing checks, as "Scope"
cards, with Real / Not real under each. The page's footer records the model,
the tokens, the dollars, and the model's own two-line summary of the job, which
is the quickest check that it read the material.

## Running it

```
cd /c/dev/DB-Estimator && git pull && npm install
npm run scope -- <documentId> --dry-run          # sends nothing; prints the packet
npm run scope -- <documentId> --out review        # runs the review; writes review/<id>.html
```

The document id is in the estimate's URL in JobTread. The dry run needs only
the JobTread key already in `.env`. The real run needs `ANTHROPIC_API_KEY` in
`.env` (see `.env.example`); create the key in the Anthropic Console and put a
monthly spending limit on it there.

## Cost

Claude Opus 5.5, at $4 per million input tokens and $20 per million output.
A bathroom remodel with 22 photos and four quotes is roughly 60,000 input
tokens and 3,000 output: about $0.30. A large addition with more photos might
be $1. Twenty construction estimates a month is on the order of $10 to $20.
The dry run prints the estimate before anything is spent; the page prints the
actual figure after.

## What leaves the building

Nothing, until a key is set. With one, the estimate, the job's comments, the
quotes and the photos are sent to Anthropic's API for the review, under the
API's commercial terms. Nothing is written back to JobTread. The rendered page
stays local like the others.

## Gate

Same as Stage 1 of the rollout: Kristen grades the scope findings Real or Not
real on twenty estimates, the log is pasted back, and the prompt is fixed for
each class of false positive until 80% or better holds. A model review that
cries wolf is dismissed within a week, exactly like a rule that does.

## Not built yet

- The batch: `npm run audit -- --recent N` does not run the scope review;
  `npm run scope` is one estimate at a time. Wiring it in is straightforward
  once the cost per estimate is known from real runs.
- History: "jobs of this project type usually include X". DB has about 70
  approved construction estimates across five project types; a prevalence
  check from them would give the model a checklist and catch the plainest
  omissions without a model at all.
- Plans. JobTread's Plans feature is empty on the jobs looked at; drawings
  arrive as photos or PDFs on the job and are read as such. Quantities from
  drawings are takeoff, which is Phase 4 of the roadmap, not this.
