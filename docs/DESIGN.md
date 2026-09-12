---
name: Care Covenant
description: Duty-signage operate system for always-owned abnormal-result handovers.
colors:
  surface-canvas: "#DDE1E6"
  surface-raised: "#F4F6F8"
  surface-inset: "#CED3DA"
  surface-owned: "#C5D4EE"
  surface-awaiting: "#F0DFC0"
  surface-proven: "#C5E0CF"
  surface-blocked: "#F0D0D4"
  surface-unverified: "#D5D8DE"
  surface-disabled: "#C8CDD4"
  surface-secondary: "#C9D0D8"
  surface-secondary-hover: "#B8BFC8"
  surface-action: "#163A8A"
  surface-action-hover: "#0B2F6E"
  surface-danger: "#9B1D32"
  surface-danger-hover: "#7A1628"
  text-ink: "#14181F"
  text-muted: "#3D4553"
  text-on-action: "#F4F6F8"
  text-owned: "#163A8A"
  text-awaiting: "#7A4E00"
  text-proven: "#145C32"
  text-blocked: "#9B1D32"
  text-unverified: "#3D4450"
  text-disabled: "#353C4A"
  text-placeholder: "#4A5160"
  border-default: "#5C6472"
  border-strong: "#14181F"
  border-owned: "#163A8A"
  border-awaiting: "#7A4E00"
  border-proven: "#145C32"
  border-blocked: "#9B1D32"
  border-focus: "#0B3D91"
  shadow-ink-12: "#14181F1F"
  shadow-ink-10: "#14181F1A"
  shadow-ink-14: "#14181F24"
typography:
  scale:
    meta: "0.8125rem"
    body: "1rem"
    lead: "1.25rem"
    title: "1.5625rem"
    hero: "1.953125rem"
  body:
    fontFamily: "Atkinson Hyperlegible, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0"
  lead:
    fontFamily: "Atkinson Hyperlegible, Segoe UI, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: "0"
  title:
    fontFamily: "Atkinson Hyperlegible, Segoe UI, sans-serif"
    fontSize: "1.5625rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  hero:
    fontFamily: "Atkinson Hyperlegible, Segoe UI, sans-serif"
    fontSize: "1.953125rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  data:
    fontFamily: "Red Hat Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0"
rounded:
  sm: "3px"
  md: "6px"
  lg: "8px"
spacing:
  2xs: "4px"
  xs: "8px"
  sm: "12px"
  md: "20px"
  lg: "32px"
  xl: "52px"
components:
  button-primary:
    backgroundColor: "{colors.surface-action}"
    textColor: "{colors.text-on-action}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.surface-action-hover}"
    textColor: "{colors.text-on-action}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-secondary:
    backgroundColor: "{colors.surface-secondary}"
    textColor: "{colors.text-ink}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-disabled:
    backgroundColor: "{colors.surface-disabled}"
    textColor: "{colors.text-disabled}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-danger:
    backgroundColor: "{colors.surface-danger}"
    textColor: "{colors.text-on-action}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  state-badge-owned:
    backgroundColor: "{colors.surface-owned}"
    textColor: "{colors.text-owned}"
    rounded: "{rounded.sm}"
    padding: "2px 7px"
  hero-fact:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-ink}"
    rounded: "{rounded.lg}"
    padding: "20px 32px"
---

## Overview

Duty Signage is the visual world for Care Covenant. The product makes a cross-team abnormal-result handover an explicit, always-owned covenant. The interface is an Operate surface: a clinician or safety lead working fast, often on a poor monitor or a projector, must see the owner and the one available action without reading eleven equally loud panels.

The cultural source is British Worboys / ISO 3864 wayfinding, not a medical-device skin and not a civic-gov template. Meaning is carried by **shape plus text**. Colour is a second channel. The field is cool enamel, the ink is iron, the one accent is mandatory cobalt. Atkinson Hyperlegible is the UI face because letter disambiguation (I / l / 1, O / 0) is the actual job on a washed projector; Red Hat Mono is reserved for evidence identifiers.

Scene forces light: fluorescent GP back offices and projectors wash dark charcoal UIs. The incumbent interface (`src/app/globals.css`, `CaseHeader`, `ProposalPane`, `case-workspace.module.css`) is the anti-reference: a generic dark card soup with system-ui, equal panel weight, and colour-only badges.

### Hierarchy doctrine

1. **First:** who is accountable right now, and the single action that is or is not available.
2. **Second:** the abnormal fact the source already classified, and the acknowledgement deadline.
3. **Third:** the evidence strip (id, version, actor, time), tables, and technical detail.

If a later screen gives those three layers the same type size, the same border, and the same padding, it has left this system.

### What this world rejected

- The incumbent dark SaaS dashboard (`#0f1115` / `#171a21`, system sans, 10px cards, colour pills).
- NHS App teal and GOV.UK blue-on-white. Those are the UK clinical/civic defaults.
- Warm cream paper plus display serif plus terracotta. That is the current AI cluster, not a duty book.
- Near-black plus neon glow. That is the other AI cluster and fails on a projector.
- Broadsheet editorial hairlines and italic serif heroes.
- Equal-weight panel grids. That is the diagnosed information-hierarchy failure.
- Colour-only status. Colour-blind clinicians on bad projectors cannot use it.
- Skeletons that look like names, values, or owners. A hatched bar plus the sentence "No records have been returned yet" is honest; a grey line that looks like "Dr Ada Sim" is a lie.

### Token layer

Import `src/design/tokens.css` once, or wrap a tree in `DesignRoot`. Tokens are named by role (`--ds-surface-owned`, `--ds-text-blocked`), never by hue. Motion durations collapse to `0ms` under `prefers-reduced-motion`. No motion is load-bearing.

## Colors

Restrained operate palette. Neutrals carry the field. Cobalt is reserved for ownership and the primary action. Semantic wells are tinted from their own hue so secondary text is never grey-on-colour.

| Token pair | Foreground | Background | Ratio | Minimum | Result |
|---|---|---|---|---|---|
| ink on canvas | `#14181F` | `#DDE1E6` | 13.55 | 4.5 | pass |
| muted on canvas | `#3D4553` | `#DDE1E6` | 7.35 | 4.5 | pass |
| ink on raised | `#14181F` | `#F4F6F8` | 16.42 | 4.5 | pass |
| muted on raised | `#3D4553` | `#F4F6F8` | 8.91 | 4.5 | pass |
| ink on inset | `#14181F` | `#CED3DA` | 11.82 | 4.5 | pass |
| muted on inset | `#3D4553` | `#CED3DA` | 6.42 | 4.5 | pass |
| on-action on action | `#F4F6F8` | `#163A8A` | 9.66 | 4.5 | pass |
| on-action on action-hover | `#F4F6F8` | `#0B2F6E` | 11.78 | 4.5 | pass |
| on-action on danger | `#F4F6F8` | `#9B1D32` | 7.41 | 4.5 | pass |
| on-action on danger-hover | `#F4F6F8` | `#7A1628` | 9.83 | 4.5 | pass |
| owned on canvas | `#163A8A` | `#DDE1E6` | 7.97 | 4.5 | pass |
| awaiting on canvas | `#7A4E00` | `#DDE1E6` | 5.48 | 4.5 | pass |
| proven on canvas | `#145C32` | `#DDE1E6` | 6.13 | 4.5 | pass |
| blocked on canvas | `#9B1D32` | `#DDE1E6` | 6.11 | 4.5 | pass |
| unverified on canvas | `#3D4450` | `#DDE1E6` | 7.47 | 4.5 | pass |
| owned on owned surface | `#163A8A` | `#C5D4EE` | 6.99 | 4.5 | pass |
| awaiting on awaiting surface | `#7A4E00` | `#F0DFC0` | 5.49 | 4.5 | pass |
| proven on proven surface | `#145C32` | `#C5E0CF` | 5.73 | 4.5 | pass |
| blocked on blocked surface | `#9B1D32` | `#F0D0D4` | 5.61 | 4.5 | pass |
| unverified on unverified surface | `#3D4450` | `#D5D8DE` | 6.87 | 4.5 | pass |
| disabled on disabled surface | `#353C4A` | `#C8CDD4` | 6.93 | 4.5 | pass |
| placeholder on raised | `#4A5160` | `#F4F6F8` | 7.35 | 4.5 | pass |
| placeholder on canvas | `#4A5160` | `#DDE1E6` | 6.06 | 4.5 | pass |
| focus on canvas | `#0B3D91` | `#DDE1E6` | 7.65 | 3.0 | pass |
| border on canvas | `#5C6472` | `#DDE1E6` | 4.54 | 3.0 | pass |
| border on raised | `#5C6472` | `#F4F6F8` | 5.51 | 3.0 | pass |
| ink on owned surface | `#14181F` | `#C5D4EE` | 11.88 | 4.5 | pass |
| ink on awaiting surface | `#14181F` | `#F0DFC0` | 13.58 | 4.5 | pass |
| ink on proven surface | `#14181F` | `#C5E0CF` | 12.66 | 4.5 | pass |
| ink on blocked surface | `#14181F` | `#F0D0D4` | 12.44 | 4.5 | pass |
| ink on secondary | `#14181F` | `#C9D0D8` | 11.44 | 4.5 | pass |
| ink on secondary-hover | `#14181F` | `#B8BFC8` | 9.60 | 4.5 | pass |
| action-hover on canvas | `#0B2F6E` | `#DDE1E6` | 9.71 | 4.5 | pass |
| on-action on ink | `#F4F6F8` | `#14181F` | 16.42 | 4.5 | pass |

Ratios are WCAG 2.2 relative luminance, computed in `src/design/contrast.ts` and asserted by `tests/unit/design/contrast.test.ts`. No pair in this table fails.

State colour is never the only channel:

| State | Shape | Text |
|---|---|---|
| idle | hollow circle | Idle |
| owned | filled diamond | Owned |
| awaiting | triangle | Awaiting acknowledgement |
| proven | square with check | Proven by readback |
| blocked | octagon with cross | Blocked |
| unverified | open diamond | Not verified by readback |

`HeroFact` refuses to render `proven` unless `verified` is true. A successful request is only submitted.

## Typography

One UI family. Five sizes, 1.25 ratio, fixed rem. No fluid headings.

- **Atkinson Hyperlegible** for interface, headings, and buttons. Chosen for projector-grade letter disambiguation, not as a display costume.
- **Red Hat Mono** only for ids, versions, and timestamps. Monospace is data, not atmosphere.
- Hero 1.953125rem / title 1.5625rem / lead 1.25rem / body 1rem / meta 0.8125rem.
- Body measure 70ch. Data and tables may run wider.
- Tracking floor is `-0.02em` on title and hero only. Meta text is not tracked and is not uppercase. Kickers above headings are banned.

## Layout

`Stack` is the default grouping. Tight `xs`/`sm` inside a fact; `md`/`lg` between the hero, the decision, and evidence. `Grid` collapses to one column below 40rem and uses `minmax(min(100%, min), 1fr)` so 200% zoom does not clip.

Do not rebuild the workspace as a card grid of equal panels. One `HeroFact`, one `DecisionBlock`, then quieter `EvidenceRow` and `Table` surfaces.

## Elevation & Depth

Two shadows, both offset plus blur, ink at low alpha, never a coloured halo.

- `--ds-shadow-raise`: `0 1px 2px #14181F1F, 0 6px 16px #14181F1A`
- `--ds-shadow-inset`: `inset 0 1px 2px #14181F24`

Raised windows hold the hero and popovers. Inset wells hold unfinished or secondary matter. Z-layers: base 0, sticky 20, popover 40, tooltip 50.

## Shapes

Instrument radii: 3 / 6 / 8px. No pills. Badges are slightly squared so they read as stamps, not chips.

Icons are authored SVG, one stroke, `currentColor`. Unicode bullets and emoji are out.

## Components

Wrap migrated screens in `DesignRoot` so tokens, focus rings, selection, caret, and scrollbars belong to this world.

### Primitive API

| Primitive | Props | Behaviour |
|---|---|---|
| `DesignRoot` | `children` | Applies the token world. |
| `Stack` | `as`, `gap`, `align`, `children` | Vertical rhythm. |
| `Grid` | `gap`, `columns`, `min`, `children` | Auto-fit or 1/2/3, collapses on narrow viewports. |
| `Surface` | `as`, `elevation`, `padding`, `labelledBy`, `children` | Flat / raised / inset panel. |
| `Text` | `as`, `size`, `tone`, `measure`, `data`, `children` | Body and meta copy. |
| `Heading` | `as`, `size`, `id`, `children` | The fact is the heading. No eyebrow. |
| `Button` | `variant`, `size`, `busy`, `disabled`, `children` | `primary` / `secondary` / `silent` / `danger`. Disabled is a distinct fill, not faded opacity. `busy` replaces the label with "Working. Outcome is not yet proven." |
| `StateBadge` | `label`, `tone`, `icon?` | Always renders a shape plus the label. |
| `DataList` | `items`, `compact` | Native `dl` / `dt` / `dd`. |
| `Table` | `caption`, `columns`, `rows`, `getRowKey` | Real `<th scope="col">`, required caption. |
| `Tabs` | `label`, `tabs`, `value?`, `defaultValue?`, `onChange?` | `tablist` / `tab` / `tabpanel`, arrow / Home / End. |
| `Segmented` | `label`, `options`, `value`, `onChange` | `radiogroup` / `radio`, arrow keys. |
| `Tooltip` | `content`, `children` | Opens on focus and hover, `role="tooltip"`, `aria-describedby`. |
| `Popover` | `triggerLabel`, `title`, `children` | Keyboard-reachable dialog, Escape returns focus. |
| `Skeleton` | `label?`, `bars?` | `role="status"`. Hatched bars. Says records have not returned. |
| `EmptyState` | `title`, `body`, `action?` | Hollow-circle mark plus teaching copy. |
| `ErrorState` | `title`, `body`, `recovery?`, `action?` | `role="alert"`. Octagon plus recovery. |
| `VisuallyHidden` | `children`, `as?` | Accessible name only. |

### Patterns

| Pattern | Props | Rule |
|---|---|---|
| `HeroFact` | `fact`, `meaning`, `state`, `verified?`, `headingAs?`, `headingId?`, `detail?` | The owner (or the missing-owner sentence) is the heading. Meaning sits beside the badge, never above. `proven` demotes to `unverified` unless `verified`. |
| `EvidenceRow` | `id`, `version`, `actor`, `time` | Labelled strip. Ids and versions use the data face. |
| `DecisionBlock` | `actionLabel`, `available`, `reason`, `onAction?`, `busy?` | The reason is always visible. An unavailable action is a disabled button plus an octagon, not a hidden control. |

### Composition

1. `DesignRoot` at the case workspace root.
2. `HeroFact` first. The heading is the owner, not the product name.
3. `DecisionBlock` second. If the write is blocked, the reason is the content.
4. `EvidenceRow` / `DataList` / `Table` third.
5. `Skeleton` while a read is outstanding. `EmptyState` when a compiler has not produced a proposal. `ErrorState` when a request failed.
6. Use `Tabs` or `Segmented` to switch evidence vs protocol, not a second card column of equal weight.

## Do's and Don'ts

- Do pair every state with a shape and a verb.
- Do keep the primary action visually unique. One cobalt button per view.
- Do write reasons in product language: "The ordering team remains accountable until the receiving team accepts."
- Do use `SIM-*` identifiers in examples. Never log credentials.
- Don't put a kicker above a heading.
- Don't communicate state with colour alone.
- Don't use a determinate progress bar for a write whose outcome is unproven.
- Don't nest surfaces inside surfaces.
- Don't migrate the old dark tokens into this system.
