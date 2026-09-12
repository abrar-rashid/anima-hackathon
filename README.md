# Care Covenant

Clinical reliability infrastructure for the Anima × OpenAI hackathon.

## Project context

Start with [`docs/context/README.md`](docs/context/README.md). It indexes the
curated hackathon brief, verified simulator capabilities, integration constraints,
Care Covenant safety model, evidence policy, and fixed five-hour build boundary.

The approved design is preserved at
[`docs/superpowers/specs/2026-09-12-care-covenant-design.md`](docs/superpowers/specs/2026-09-12-care-covenant-design.md).

## Local setup

1. Copy `.env.example` to a local-only environment file.
2. Add a team-scoped simulator API key locally; never use production NHS
   credentials or real patient data.
3. Keep credentials server-side and out of commits, logs, fixtures, screenshots,
   browser bundles, and agent context.
4. Bind actions from the live simulator OpenAPI document before making a write.

This repository intentionally contains documentation only at this stage.
