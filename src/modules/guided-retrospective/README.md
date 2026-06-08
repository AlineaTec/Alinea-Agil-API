# Guided retrospective (Retro Guiada) — API v1

Backend module for facilitated, structured retrospectives: templates, authenticated participation (including optional short session codes), grouping into themes, **voting on themes**, improvement actions inside the session, and additive notes after close.

## What this is / is not

- **Is** a system-of-work module for team process improvement (agreements, themes, actions).
- **Is not** individual performance evaluation, people ranking, formal climate surveys, a fully free-form mural, or a points-based game.
- **Is not** backlog automation: actions are first-class retro entities; promotion to backlog is explicitly out of v1 per contracts.

## Facilitator and roles

Creation of topics, merging themes, changing session header/phase, and close (plus additive notes after close) require **facilitator-class** roles aligned with other guided modules: administrative `admin` / `operator`, or methodological `agility_lead`, `scrum_master`, or `product_owner` (PO acting as facilitator).

Contributions and votes use **Scrum backlog read** policy (developers, coaches, auditors, etc., as implemented today).

## Interactive code mode

When `retrospectiveMode` is `interactive_code`, a short `sessionCode` is generated while the session is open. `POST /v1/workspaces/:workspacePublicId/guided-retrospective/join-by-code` lets an **authenticated** workspace member attach as a participant. External guest accounts are **not** in v1.

## Partial anonymity

Contributions support `visibilityMode`:

- `visible_to_all` — author visible to readers who may see the contribution.
- `hidden_from_peers` — content visible; **author UUID omitted for peers** in list payloads; facilitator-class roles still see the author in the service layer (no promise of “blind” anonymity for facilitators).

## Templates

Fixed v1 catalog (`start_stop_continue`, `mad_sad_glad`, `four_ls`, `went_well_didnt_go_well_actions`, `sailboat`) defines columns and default vote settings (`votesPerParticipant`, `allowMultipleVotesPerTopic`). Template text localization is a UI concern; keys are stable.

## Voting

Votes attach to **topics**, not raw contributions. Stickers are capped per participant; trimming removes older allocations on other topics when the budget is exceeded (unless `allowMultipleVotesPerTopic` allows stacking on one theme).

## Session lifecycle

- One logical row per `(project, sessionDate, sessionSlot)`; lazy create on first substantive write; idempotent on race.
- Phases: `planned` → `open` → `collecting` → `voting` → `closing` → `closed` | `closed_without_actions`.
- **No reopen** after close; `sessionCode` cleared on close.
- **Additive notes** after close are audited and allowed only when status is terminal.

## Operational approaches

- **Scrum**: full support; optional sprint binding and light context hints (e.g. active sprint goal).
- **Kanban**: same structure with `retrospectivePeriod` window (default single-day window from `sessionDate`).
- **Predictive**: read-only bootstrap reports non-operable; writes return `guided_retrospective_unsupported`.

## Explicitly deferred (v1)

External guests, backlog promotion, heavy AI narrative, PDF export, advanced cross-session action tracking, person-level scoring.

See `contracts-docs/docs/modules/guided-retrospective/` for the binding product decisions.
