# BrawlStage — Agent Guide

BrawlStage is built on the chat-first agent-native starter. `/` redirects to shared sign-in, then `/home`, the editable Get started page. Chat lives at `/chat`; new chats start there. Actions carry capabilities; screens exist only for durable workflows.

## Skills

Search with `rg --hidden --follow`; read the exact linked guide before deeper work. `.agents/skills/build-an-app/SKILL.md` — start here for vague requests to create a domain app. `.agents/skills/adding-a-feature/SKILL.md` — cross-area feature checklist. Data/integrations: `.agents/skills/actions/SKILL.md`, `.agents/skills/storing-data/SKILL.md`, `.agents/skills/security/SKILL.md`, `.agents/skills/secrets/SKILL.md`, `.agents/skills/sharing/SKILL.md`. UI: `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/shadcn-ui/SKILL.md`, `.agents/skills/client-side-routing/SKILL.md`. Agent context/workflows: `.agents/skills/context-awareness/SKILL.md`, `.agents/skills/real-time-sync/SKILL.md`, `.agents/skills/reliable-mutations/SKILL.md`, `.agents/skills/performance/SKILL.md`, `.agents/skills/delegate-to-agent/SKILL.md`. Framework: `.agents/skills/agent-native-docs/SKILL.md`, `.agents/skills/agent-native-toolkit/SKILL.md`, `.agents/skills/customizing-agent-native/SKILL.md`.

Use local docs only (no web research): `pnpm action docs-search --query "<topic>"`, `pnpm action docs-search --slug "<slug>"`, `pnpm action docs-search --list`, `pnpm action source-search --query "<pattern>"`, `pnpm action source-search --path <path>`, or `pnpm action source-search --list`. For external-agent integrations, read `pnpm action docs-search --slug "external-agents"`.

## Core rules

- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.
- Normal app data must flow through actions. Keep actions deterministic and focused; use agent chat/AgentSidebar for AI work and follow-ups in the same thread. Keep structured state in SQL and large files in configured storage; persist references only.
- For external integrations, inspect the workspace/provider connection catalog first; reuse its scoped resolver. Never hardcode credentials, webhook URLs, or private/customer data.
- Never fabricate. Report failures and recover; verify writes by reading the row or screen. Navigation is in `<current-screen>`; use `view-screen` for fresh visible-record details.

For custom branding, keep `server/plugins/agent-native-email-branding.ts` aligned: `app.name` appears in transactional email and optional `app.logoUrl` must be an absolute HTTPS URL.

## Application state

- `navigation` describes the view and selected ids. Chat is `chat` at `/chat` and `/chat/<threadId>`; the Get started page is `home` at `/home`; `/` opens shared sign-in/signup.
- Use `navigate` when supported and `view-screen` for a fresh read of visible details; basic navigation is already in `<current-screen>`.

## BrawlStage arena

Responsive UI stress arena. `/arena` is the fight card; `/arena/:componentId?w=<px>&sel=<selector>&sab=<profile>` is the stage. `navigation` adds `route`, `componentId`, `activeWidth`, `selectedSelector`, `saboteurProfile`.

- Measurements come only from the browser's DOM engine (33 widths: 28 public 320–1920 + sealed holdouts 347/513/701/991/1153). `record-viewport-audit` is UI-only; never invent findings or pass rates.
- Holdout findings are sealed: you see pass/fail per holdout lane only. Never target holdout widths with media queries; fix the general layout.
- Fix loop: `view-screen` → `patch-component-tokens` (source "agent") → open stage re-measures → `verify-holdout-widths`. `AUDIT_PENDING` = retry shortly (stage must be open); `HOLDOUT_REGRESSION` = report lanes, keep fixing.
- Keep the design: never delete a background, featured style, element or content to pass a check. Fix contrast with colours (tokens), overflow with flexible layout.
- Read `.agents/skills/learned-layout-rules/SKILL.md` before drafting CSS; `capture-design-learning` appends to it from human hand edits.
- WebMCP page tools on the stage: `run-viewport-sweep`, `measure-stage-width` (`window.__agentNativeWebMcp`).
- Inline token comparison: call `render-inline-extension` with an Alpine card showing `get-component` tokens before/after a patch. Pass-rate summary: `save-data-program` with `appAction("list-components")` emitting name, lastPassRate, holdoutPassRate.

| Action | Purpose |
|---|---|
| list-components | Fight card with pass rates |
| get-component | Markup, CSS, tokens, stage, latest run (holdout redacted), rules |
| save-component | Create or replace a component |
| patch-component-tokens | Token/CSS patch tagged agent or human |
| inject-saboteur-payload | Arm i18n-expansion, rtl-mirror, payload-extremes, font-scale-200, none |
| verify-holdout-widths | Sealed holdout gate (409 on regression) |
| capture-design-learning | Diff agent draft vs human final into a rule |
| delete-component | Delete a component |
| view-screen / navigate | Screen context and navigation |
