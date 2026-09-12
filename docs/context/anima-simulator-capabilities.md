# Verified Anima simulator capabilities

## What the simulator is

The Anima hackathon simulator is a fictional, multi-service NHS neighbourhood with
isolated team worlds. It links GP, hospital, pharmacy, community, and home
workspaces through shared synthetic records, resource versions, Activity history,
and a controllable simulation clock. It is suitable for integration and workflow
demonstrations, not clinical validation.

All patients are fictional and marked synthetic. Use a single patient identifier
across sites to follow a pathway.

## Verified surfaces

- Public: plan explorer, handbook/documentation, service catalogue, health check,
  OpenAPI document, and API explorer.
- Team-key protected: patient workspaces, records, appointments, site actions,
  clock state/control, Activity/request history, and live reception.
- Operator-only: organiser inspection and controls. These require a separate
  operator token and are not participant application features.

The participant architecture is an external application using a team bearer key
and the OpenAPI contract. No participant-facing hosted agent deployment surface
has been verified. Operator-controlled scripted world workers are deterministic
simulation processes, not participant AI agents.

## Service and API capability map

- **Hospital:** attendances, discharge documents, and handover context.
- **GP:** documents, visible records, appointments, and schema-supported actions.
- **Pharmacy:** referral/workspace, stock, and dispensing evidence where exposed.
- **Community:** visits and completion/shared-note evidence.
- **Home:** readings and patient/home messages.
- **Shared infrastructure:** catalogue, team context, simulator clock, resource
  versions, pagination, staff attribution, and Activity.

Core discovery/read routes include:

- `GET /openapi.json`
- `GET /api/catalogue`
- `GET /api/team`
- `GET /api/clock`
- `GET /api/sites/{site}/view`
- `GET /api/sites/{site}/appointments`
- `GET /api/sites/gp/documents`
- `GET /api/sites/hospital/documents`
- `GET /api/sites/hospital/attendances`

Mutations are routed through `POST /api/sites/{site}/actions`; clock changes use
`POST /api/clock`. Exact action names and payloads must be discovered from the
live contract.

## Known scenario facts

- Amira Khan is `SIM-000001` in the hospital-to-community scenario.
- Eleanor Chen is `SIM-000006` in both the analogue-to-digital and
  sickness-to-prevention plan scenarios.
- Documented timing includes a first watch reading after 10 simulator minutes,
  hourly readings thereafter, community visit completion after 90 minutes, and
  hospital laboratory collection after 120 or 240 minutes depending on round.

Do not repeat earlier claims of 18-hour discharge, 24-hour community-note, or
48-hour laboratory delays; they were not supported by the verified material.

## Reliability constraints

- Workspace access needs an existing full-scope team key.
- Creating a team mutates hosted state; do not do it during read-only exploration.
- Site lists can be paginated; never assume the first page is complete.
- HTTP success proves only submission. Re-read the relevant source and destination
  records and correlate Activity before advancing a domain state.
- Never invent a record, completion, acceptance, simulator delay, or receipt.
