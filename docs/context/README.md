# Care Covenant project context

This directory is the concise, durable briefing for local Cursor agents. Read the
approved design first when requirements conflict; these topic notes explain its
evidence base and operating constraints without preserving obsolete alternatives.

## Source-of-truth order

1. [Approved Care Covenant design](../superpowers/specs/2026-09-12-care-covenant-design.md)
2. [Five-hour build and demo boundary](five-hour-build-and-demo.md)
3. [Product and clinical safety](care-covenant-product-and-safety.md)
4. [Anima ADK and API integration](anima-adk-api-integration.md)
5. [Verified Anima simulator capabilities](anima-simulator-capabilities.md)
6. [Hackathon brief and decisions](hackathon-brief-and-decisions.md)
7. [Judge and product-market-fit evidence](judge-and-pmf-evidence.md)

## Working principles

- Build one abnormal-result reliability pathway, not a general platform.
- Visibility, submission, acceptance, and evidence are distinct states.
- The ordering team remains accountable until a named receiver accepts.
- Agents propose structured operational work; humans approve every external
  write and all clinical decisions.
- Discover actions from the live OpenAPI contract and prove writes by readback
  plus Activity evidence.
- Use only fictional simulator patients. Keep credentials and sensitive values
  out of repositories, prompts, logs, fixtures, and browser code.
- Label simulator replay evidence honestly. Do not claim reduced harm,
  readmissions, mortality, cost, or workforce without a controlled evaluation.
