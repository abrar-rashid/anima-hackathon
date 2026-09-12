# Clinical information standard

**Binding on every surface.** This is how Close The Loop speaks and formats
information. It exists because an audit of the previous build found the product
unusable by its intended user: a clinician met "covenant", "idempotency key",
"Operational Latency Twin" and "Crackmoss pixels: neglectMinutes 30–119" and
could not tell what the software was for.

The test for everything below: **would a duty GP, a ward registrar, or a
practice manager understand this on first sight, without anyone explaining it?**
If not, it is wrong, however technically accurate it is.

---

## 1. Vocabulary

Our internal type names are fine. Our *screen* words must be clinical or plain
English. Never show the left column to a user.

| Internal / engineering term | On screen |
|---|---|
| Covenant | Handover |
| Ownership state | Who is responsible |
| `ORDERER_OWNS` | Still with {real site name} |
| Transfer requested | Handover sent · awaiting acceptance |
| `ACCEPTED` | Accepted by {named person} |
| Closure state | Progress |
| Finding | Outstanding item / what needs doing |
| Detector | Why this was flagged |
| Breach / breached | Overdue |
| Due-soon | Due within the hour |
| Provenance | Audit trail |
| `provenance.changes[]` | Who did what, and when |
| Idempotency key | (hide — never a user-facing concept) |
| Duplicate-safe write | This cannot be sent twice |
| `SUBMITTED` | Sent |
| `provenByReadback: true` | Confirmed in the record |
| `provenByReadback: false` | Sent — not yet confirmed |
| Hard stop | Blocked: {plain reason} |
| Readback | Confirmation from the record |
| Scan window / denominator | Checked {n} records across {m} services |
| Operational Latency Twin | Where time is lost |
| Protocol v3 vs v4 | Current process vs proposed process |
| Immutable failure trace | A recorded case that went wrong |
| Effectuator | (hide — it is just the action button) |
| Action proposal | Suggested action |
| `ClinicalTaskEpisode` | (internal only — never rendered) |
| Site / district | Service (and use its real name) |
| Resource | Record |
| Stale | Last updated {relative time} |
| Phosphor plinth, crackmoss, stitch, phial | delete entirely |

**Banned on screen, without exception:** covenant, idempotency, effectuator,
detector, provenance, readback, breach, resource, denominator, projection,
reducer, invariant, schema-bound, source-classified, plinth, phial, stitch,
crackmoss, atlas, society.

## 2. Naming the product

One name everywhere: **Close The Loop**. One line under it that says what it
does in clinician language:

> Finds clinical tasks that were written down but never finished.

Root metadata, page titles, and the header must agree. The previous build had
`<title>Care Covenant</title>` over an `<h1>Close The Loop</h1>`.

## 3. Identity and demographics

Patient line, in this order, using only fields the API supplies:

```
Amira Khan · 74 · SIM-000001
Heart failure · CKD
```

- Age is computed from the API's `birthDate`. If absent, omit the age — do not
  guess.
- **There is no NHS number in this API. Never render one.** The previous build
  printed `NHS #942 104 8821`, which was invented.
- Sex is not supplied. Do not render it.
- Show local service IDs (`localIds.gp`, `.hospital`) only in a details view,
  labelled as the service's own reference.
- Always carry a visible "synthetic patient" marker. It is a fictional world and
  saying so builds trust rather than undermining it.

## 4. Time

Clinicians read a clock and an elapsed interval, not a timestamp.

- **Never render a raw epoch.** `1789374600000` is a defect.
- Absolute time: 24-hour with day when not today — `14:20`, `Fri 14:20`,
  `11 Sep 14:20`.
- Always pair absolute with relative against **simulator now**, not wall clock:
  `14:20 · 4h 20m overdue`, `09:00 · in 35 min`.
- Intervals are coarse and human: `35 min`, `4h 20m`, `3 days`, `6 weeks`.
  Never `14700000 ms`, never `4.0833 hours`.
- State the simulator clock once, prominently, because every interval is
  relative to it — and say when it is paused.

## 5. Results

Format like a real lab report, because that is what clinicians read.

```
White cell count    3.5 ×10⁹/L    (4–11)    Low
Haemoglobin          141 g/L      (115–165)  Normal
```

- Value, unit, the source's own reference range, then a flag.
- The flag is **arithmetic against the source's range**, which is permitted.
  Saying "Low" because `3.5 < 4` is not clinical interpretation. Saying
  "concerning" or "consistent with infection" is, and is forbidden.
- Serial results for the same analyte belong in one trend, oldest to newest,
  because the movement is the point. Do not editorialise the direction.
- Always name the panel and the laboratory from the source.
- Never invent a reference range. If the source omits one, show the value with
  no flag and say the range was not supplied.

## 6. Services

Use the real name from `GET /api/catalogue`, with its own subtitle:

- **Riverside Practice** — primary care
- **Northbank General** — secondary care
- **High Street Pharmacy**
- **Community visiting team**
- **Home Health**

Invented names such as "St. Jude's Acute Hospital", "City Pathology &
Diagnostics Lab" or "Amira Khan's Residence" are forbidden. Use each service's
catalogue colour consistently across every surface, including the town.

## 7. Priority and status

**Priority** uses the source's own word and nothing else: `emergency`,
`urgent`, `routine`/`standard`. We never compute it. If the source omits it,
show "Priority not recorded" rather than defaulting to routine.

Colour carries one meaning across the whole product:

| Meaning | Use |
|---|---|
| Overdue / emergency | red |
| Due within the hour / urgent | amber |
| On track | neutral, not green |
| Confirmed in the record | green |
| Blocked / cannot act | grey with a stated reason |

Green means *confirmed*, never merely *present*. The previous build used a green
"Live Sim" pill that stayed green even when the simulator was unreachable.

Status words on screen come from a short fixed list: **Open, In progress,
Awaiting result, Awaiting acceptance, Sent, Confirmed, Closed, Blocked.** Map
the API's seventeen raw statuses onto these; never print `filed`, `take`, or
`assessing` raw.

## 8. Numbers

Every count states what it was drawn from:

- Good: `18 overdue · checked 412 records across 7 services`
- Bad: `18 overdue`
- Good: `12 of 61 discharge letters were never reviewed`
- Bad: `20% unreviewed`

Fractions render as "n of m", with the percentage secondary if shown at all. Any
figure derived from a sample states the sample size. If a service could not be
read, say which one and that the number is therefore partial.

## 9. Layout and density

The prior page was called "a bit packed" and "a Bloomberg terminal". Rules:

- **One question per region.** A region answers exactly one thing, and its
  heading is that question in plain words: "What needs doing", "What happened",
  "Where time is lost".
- **Three levels, no more.** Page heading → region heading → row. Deeper nesting
  is a signal to split the region.
- **Progressive disclosure.** Raw JSON, record IDs, versions, keys and audit
  detail live behind an expander labelled in plain English ("Show technical
  detail"). They are never in the default view.
- **Scannable rows.** A worklist row is readable in one pass: who, what, how
  late, which service, one action. Anything else is in the detail view.
- **At most four headline numbers** on any screen.
- Generous whitespace and a real type hierarchy. If everything is 13px, nothing
  is important.

## 10. Actions

- Label a button with the clinical act, not the mechanism: **"Review letter"**,
  not "process_document". **"Book follow-up"**, not "book_appointment".
- One primary action per row and per screen region.
- A disabled control always states why, in plain words, next to it:
  "Blocked: this letter has changed since the suggestion was prepared."
- Before a write, show what will happen in a sentence a clinician can check:
  "This will create a task at Riverside Practice for Amira Khan, due in 24
  hours." The raw payload goes behind "Show technical detail".
- Writes take about six seconds. Show a real pending state that says what is
  happening: "Sending to Riverside Practice…".
- After a write, say plainly whether it is confirmed: "Confirmed in the record
  at 14:22" or "Sent, but not yet confirmed — retry to check".

## 11. Degradation

The simulator went down for ten minutes during this build. A blank page or an
unexplained spinner is a defect.

- Stale data renders with its age and a retry: "Showing data from 14:02 ·
  couldn't reach Northbank General · Retry".
- Partial failure names what is missing and shows the rest: "Pharmacy could not
  be reached, so pharmacy items are not included below."
- Empty states say what was checked and found nothing: "No outstanding items in
  the 412 records checked."
- Never substitute a plausible value for a missing one. Absence renders as
  "Not recorded by the source".

## 12. Accessibility

- Never encode meaning in colour alone — pair it with a word or shape.
- Contrast meets WCAG AA; the tokens in `src/design/contrast.ts` are already
  locked to pairs that pass.
- Every interactive element is keyboard reachable with a visible focus ring.
- Canvas views need a DOM equivalent carrying the same facts.
- Honour `prefers-reduced-motion`.

## 13. Use the design system

`src/design/**` is a complete, tested design system ("Duty Signage": Atkinson
Hyperlegible for UI, Red Hat Mono for data, a locked contrast palette, and
primitives for Button, Heading, Text, Surface, Stack, Grid, StateBadge,
DataList, Table, Tabs, Segmented, Skeleton, EmptyState, ErrorState, Popover,
Tooltip). An audit found **no page imports any of it**, which is why the product
looks like three different applications.

Every surface now uses it. Wrap pages in `DesignRoot`, import
`@/design/tokens.css`, and compose primitives rather than writing new buttons,
badges and tables. Extend the system if something is genuinely missing; do not
fork it.

One shell across all surfaces: same header, same product name and line, same
navigation, same simulator-clock display, same service colours.
