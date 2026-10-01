# Contingency in the budget templates

Carl, 30 Sep 2026: *"add contingency with a formula rate based on whatever is
normal, and add the contingency line to every construction budget template
below phase 4 as a new group called something that makes sense."*

This page is the record of what that changed in JobTread, why it has the
shape it has, and how to undo it. It is the first thing this project has
ever written to JobTread.

## What is in JobTread now — VERIFIED 2026-09-30

One new ungrouped catalog item, the price of record for the line:

| | |
|---|---|
| Catalog item | `Project Contingency` — id `22PfSjaGc6sB` |
| Unit · cost type · cost code | Lump Sum · Other · General Requirements (01GR) |
| Unit cost · unit price | $1.00 · $1.00 (at cost) |

One new group in each of the seven templates that have a Phase 4, placed
right after `Phase 4 - Finishes` inside the template's scope group (position
`q`, Phase 4 being `p`), holding one line:

| Template | Scope group | Phase 4 | New group `Phase 5 - Contingency` | Line `Project Contingency` |
|---|---|---|---|---|
| Bathroom Remodel `22PLm4qjpyXG` | `22PLm7f9eikD` | `22PLm7f9eikr` | `22PfSmFvXZM2` | `22PfSmFvg9zb` |
| Kitchen Remodel `22PHGfWHCxJA` | `22PPzhrF95Ba` | `22PHGfWHEStx` | `22PfSmFyKDRP` | `22PfSmFySfP8` |
| Addition/House Build `22PLm9KJ7yJF` | `22PLm9SCEZdb` | `22PLm9SCEZdg` | `22PfSmG2biBX` | `22PfSmG2iSLg` |
| Covered Porch/Outdoor Living Area `22PLxKt8CEZX` | `22PLxKt8Jwig` | `22PLxKt8KgcH` | `22PfSmG4wZ8E` | `22PfSmG579kp` |
| Deck `22PLxQwYJN6D` | `22PLxQwYMMGW` | `22PLxQwYMiES` | `22PfSmG7pc5D` | `22PfSmG82nzn` |
| Door/Window Installation `22PM233XvGtS` | `22PM23DTA74g` | `22PM23fwBfbm` | `22PfSmGBLFDC` | `22PfSmGBSxNM` |
| Countertop Replacement `22PLxHbygz3M` | `22PLxHbz3H3N` | `22PLxHbz3H42` | `22PfSmGDij45` | `22PfSmGDrq7W` |

Each line points at the catalog item through `organizationCostItem` (so it
prices at $1.00 like every other template line prices from its item), and
carries the quantity formula

```
{Contingency Base} * {Contingency Rate} / 100
```

so the quantity is the dollar amount: a $12,000 base at 8% is a quantity of
960 Lump Sum at $1.00, $960 cost and $960 price.

The group's description tells the rep to set the two job parameters; the
line's description carries the rate guide (below) and the closeout rule.

Templates without a Phase 4 were left alone: Siding, Insurance Restoration,
the X-Division building blocks, the roofing templates. A draft built from
X-Division templates still gets a contingency step from the drafter, by hand
(below).

## Why this shape

**The rate.** Decided 28 Sep 2026 and accepted by Carl
(`docs/preconstruction-redesign.md` §9, decision 2, on the `zen-fermat`
branch): contingency is a visible line, **5%** when everything stays in
place, **8%** for a remodel where anything moves, **10%** for additions,
structural work or an older home with hidden conditions. Unforeseen
conditions draw on it first; the unused balance is credited at closeout.
Those are the normal residential-remodel figures, and they are DB's policy.

**At cost.** Same decision: "$1.00 at cost". The customer pays the
contingency dollars and gets back what is not spent, so marking it up would
make the credit hard to explain. DB's one earlier contingency line (261496
Lincolnview, "Project Contingency", $3,500 cost, $5,075 price) was a renamed
`Misc. Material` line and carried that item's ×1.45 by default, not by
decision. Kristen can change the unit price on a job if a marked-up
contingency is ever wanted; the catalog item stays $1.00 / $1.00.

**Two job parameters, not one.** JobTread formulas name job parameters in
braces and use `round`/`ceil` and arithmetic (every live formula in the
catalog is of the form `round({Area}/8.5)`); nothing found lets a template
line sum the rest of the budget. So the rate is a parameter the rep sets,
and the base is a parameter the rep types from the budget's cost total
before this line. The drafter prints both numbers on its page. A parameter
a formula names is created on the job when the template is added: job
25-0003 Chad Vorst carries `Depth` with no value for exactly that reason.
That the parameters appear for these lines too is REPORTED from that
example, not yet watched on a job — the first rep to add a template should
check, and add them by hand if they are missing.

**A template line, not a catalog price.** The first attempt created the line
with a cost formula and no item; JobTread refused: *"An organizationCostItemId
must be provided to create a cost item in a catalog cost group."* Template
lines must point at an ungrouped item, which is the rule the drafter was
already built on. Hence the $1.00 item and the formula on quantity.

## How it was done, and how to redo or undo it

Probe first: a throwaway top-level group `ZZ TEST - DB Estimator probe
(delete me)` with the same nested group and line, read back, then a second
child placed with `positionAfter` to see the position land after its
sibling, then `deleteCostGroup` on the throwaway. Then the seven
`createCostGroup` calls above, each returning the group and its line.

The repeatable version is `npm run contingency`:

```
npm run contingency                 # dry run: reads every template, writes review/contingency-plan.json
npm run contingency -- --apply      # needs JOBTREAD_WRITE_GRANT_KEY; skips templates that already have the group
```

It reads the templates with the read key, plans one group per template
that has a Phase 4 and no contingency yet, creates the catalog item if the
organization has none, issues the writes under a **separate write grant**
(`src/jobtread/writer.ts`, allowed mutations: `createCostItem`,
`createCostGroup`, `deleteCostGroup`; no retries, because a retried create
is a duplicate), reads each template back and verifies the group sits after
Phase 4 with the line on the item and the formula intact. Running it again
changes nothing.

To undo: `deleteCostGroup` on the seven group ids above removes the groups
and their lines. The catalog item `22PfSjaGc6sB` can stay (it is harmless
ungrouped) or be deleted in the catalog.

## What the drafter does with it

Every construction draft (job type not Roofing) ends its template steps with
a contingency step: the rate the model chose from the evidence under the
5 / 8 / 10 policy (snapped to one of the three), the base-scope cost it
applies to, the amount, and the two parameter values to type. When a chosen
template carries the line, the step says to keep it; when none does (an
X-Division draft), it says how to add the group and the catalog item by
hand. The amount is shown beside the base total, never inside it, and the
page says what the base is with contingency. Options carry their own share:
"add 8% of its cost to the base" if the customer takes one.

The line itself is never the model's to keep or drop. `scopeLines` leaves it
out of what the model sees and out of what the rep is told to delete, and a
model that names its id gets it rejected with the reason.

## On a job, through the API — VERIFIED 2026-10-01

The formula is stored on a job line but not evaluated by the API: a line
created with `quantityFormula` alone on job 25-0000 kept `quantity: null`
after both parameters were set, and a null quantity bills one unit, so the
line read $1.00. `npm run build-budget` therefore sends the quantity in
dollars with the formula (both are stored; the line then costs what the
quantity says), and sets the two job parameters first with `updateJob`,
merged with the job's existing parameters because the list replaces. The
rep who types the parameters in JobTread's own UI sees the line follow the
formula; the point of sending the quantity is that the budget is right the
moment it is built, before anyone opens it.

**Options.** The first build on 25-0000 put one contingency line on the base
scope only, and a basement whose walls and floor are both customer options
had a $440 base and a $44 contingency under a $30,000 budget. The build now
takes `Contingency Base` from the base-scope cost as built and puts a second
Project Contingency line inside every option's choice group, for
`contingency(base + choice) − contingency(base)`, so the shares add to the cent
and the budget's contingency follows the selection the way the rest of the
option does. The main line keeps the formula; the shares carry only their
dollars, since a formula cannot reference its group's cost.

**In the templates?** No, and it cannot be. A template has no customer
options in it: the selection groups are made on each job, from the draft, so
there is nothing in a template to hang an option's share on. What the
templates carry (Phase 5 - Contingency, the line on the formula) is right for
the base and stays as it is. The shares are made where the options are made:
`build-budget` writes them into every budget it builds, and the draft page's
hand-build step tells a rep building by hand to add a Project Contingency
line in each choice with its amount.

