# Judge and product-market-fit evidence

## Judge-facing differentiation

Anima already describes result/document triggers, task creation, routing,
messaging, booking, workflow templates, and learning from corrections. A demo that
only detects an abnormal result and creates follow-up work repeats the platform.

Care Covenant's defensible additions are:

- explicit, attributed acceptance before ownership transfer;
- current evidence rather than a sent task as the closure condition;
- a versioned operational protocol patch tested against the identical synthetic
  trace;
- deterministic safety and workload invariants;
- a visible human approval and rollback boundary.

The strongest reveal is not a status animation. It is one trace failing under the
baseline protocol and improving under the candidate while every clinical input is
unchanged and deployment remains disabled.

## Product-market-fit hypothesis

The primary user is a clinician or care-operations lead working in an existing
Anima Documents, Tasks, or Collaboration workflow. Care Covenant must appear in
that work surface and return only exceptions; a separate monitoring inbox would
undermine adoption.

The first buyer hypothesis is an organisation or neighbourhood already accountable
for cross-team result-pathway reliability. The prototype's measurable value is
operational:

- time from result availability to accepted owner;
- minutes the orderer remains accountable without a receiver;
- manual chases and duplicate alerts/tasks;
- successful patient-contact evidence;
- time to action and outcome evidence;
- closures blocked by missing evidence;
- reopen and timeout counts.

These are simulator regression measures, not clinical causal outcomes.

## Evidence and limits

The broader need is credible. NHS safety investigation describes harm risk,
unclear post-discharge accountability, incomplete interoperability, and the fact
that technology alone does not repair workflow or resourcing:

- [HSSIB: workforce and patient safety investigation](https://www.hssib.org.uk/patient-safety-investigations/workforce-and-patient-safety/fifth-investigation-report/)

The Discharge Medicines Service demonstrates that cross-boundary referral,
acknowledgement, staged evidence, and named escalation can form a deployable NHS
pathway:

- [NHS England DMS toolkit](https://www.england.nhs.uk/wp-content/uploads/2021/01/B0366-discharge-medicines-toolkit.pdf)
- [NICE medicines reconciliation quality statement](https://www.nice.org.uk/guidance/qs120/chapter/quality-statement-5-medicines-reconciliation-in-primary-care)

However, DMS evidence does not establish Care Covenant's effect. Observational
readmission results are confounded, and controlled evidence for related
transfer-of-care interventions is mixed:

- [Controlled transfer-of-care medicines evaluation](https://pmc.ncbi.nlm.nih.gov/articles/PMC10584716/)
- [NIHR Your Care Needs You trial](https://www.journalslibrary.nihr.ac.uk/pgfar/KMNG5684)

Therefore do not claim that the prototype prevents harm, saves lives, reduces
readmissions, releases cash, improves clinical outcomes, or proves national
deployability. Do not transfer national medication-error burden estimates or
illustrative impact models to this product.

## Objections the demo must answer

- **“Anima already does this.”** Show the ownership handshake, evidence closure,
  exact protocol diff, identical-trace replay, and approval gate.
- **“The selected patient is staged.”** Display the deterministic eligibility rule,
  current source ID, and version.
- **“The model changed clinical care.”** Lock the source classification and
  clinician plan; show that only operational fields can change.
- **“A sent task is enough.”** Keep submission, visibility, acceptance, and
  evidence visibly separate.
- **“The improvement is generated theatre.”** Calculate every comparison from the
  replayed event trace and show failed/passed invariants.
- **“You built another inbox.”** Launch from the existing workflow and write one
  deduplicated exception back to it.
- **“This is production-ready.”** State the synthetic boundary and the governance,
  integration, capacity, and evaluation work still required.
