# Three-minute demonstration

Preparation: run `python scripts/demo.py`, start `python -m backend.server`, and open the local viewer. Keep `outputs/pitch/DEMO-005.html` available as an offline fallback. Start with **All active tasks**.

**0:00–0:20 — State the question.**

“Clinical instructions are scattered across notes, letters and messages. MedLatency turns those instructions into a task list with evidence. The key distinction is that a source record's status is not the status of every action inside it. These examples are entirely fictional authored fixtures, and the interpretations here are labelled replays.”

**0:20–1:00 — Alex Rowan / DEMO-001.**

“This discharge letter is sent, but its document task remains unresolved.” Expand **Stages, subtasks & dependencies**. Point to matching the referenced panel and requesting the medicines note as two prerequisites. The later note-request message addresses the request subtask; it does not show that the note arrived or medicines reconciliation occurred. Panel matching remains unresolved. Expand evidence to show the exact quotation, field path and source status.

**1:00–1:30 — Morgan Vale / DEMO-002.**

Switch patients using the selector. “The reminder was delivered, so that task's endpoint has evidence. Registration paperwork is a different action. There is evidence of communication progress, but its outcome is unknown.” Point to the separate **Work started** and **Outcome** columns.

**1:30–2:00 — Jamie Fern / DEMO-004.**

“This blood report contains collection information and numerical results. It does not establish an order, review or communication.” Expand stages. Show unknown earlier and later stages. “The review clarification here is an inferred follow-up candidate, not a documented clinician instruction.” The parent-task count is zero because inferred candidates are not counted as documented tasks.

**2:00–2:30 — Robin Ash / DEMO-006.**

Switch to **Ambiguous matches**. “Two repeat requests remain separate. A result with the same test name is older than both requests; similarity nominates it for inspection, but it does not complete either action.” Expand candidate evidence and show the date conflict and review requirement. Local review can reject that candidate without changing Anima.

**2:30–3:00 — Casey Linden / DEMO-005.**

Switch back to **All active tasks**. “This is an authored complete-workflow fixture, not something we observed in Anima. It demonstrates the product behavior when explicit request, order, collection, result, review and communication evidence is available.” Expand stages or open the standalone export. Close with: “MedLatency shows which follow-up actions are supported by evidence, which remain unresolved, and what needs clarification next.”

## Optional questions

- **Can it import real simulation data?** One directory-discovered Anima patient was fetched and imported during development. Its viewer is labelled live evidence / not analysed. The 15 requested source responses were collected; complete clinical history was not established.
- **Was an LLM run?** No live model inference was run for this delivery. The structured-output adapter is implemented and tested with mocks. The nine pitch analyses are authored fixture replays. Supply model credentials to run model-assisted extraction on an imported patient.
- **Can you show uncertainty and constraints?** Taylor Moss / DEMO-003 shows a booking with pending confirmation/access; transport preference is not an order. Drew Hazel / DEMO-007 distinguishes conditional referral from negated prescription. Sam Willow / DEMO-008 shows cancellation then reopening. Lee Brook / DEMO-009 shows a queued script without a completed conversation.
- **Can it prove a delay was reduced?** No. This demo tests evidence handling and presentation; clinical effectiveness and generalised extraction accuracy have not been evaluated.
