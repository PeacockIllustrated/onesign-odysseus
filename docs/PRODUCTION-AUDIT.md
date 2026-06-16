# Onesign Odysseus — Production-Readiness Audit & Remediation Plan

*Date: 2026-06-16. Method: five parallel read-only audits (auth/RLS, server-action contracts, pipeline completeness, consistency/dead-code, testing/build/ops) plus direct probes. Evidence is cited as `file:line` against `master`.*

---

## TL;DR

Odysseus is **feature-complete and structurally sound** where it counts: the quote → artwork → production → delivery pipeline works end-to-end, RLS is enabled on **all 67 tables**, `tsc --noEmit` is clean, the 426-test engine suite is green, and the service-role key never reaches the client bundle. This is a real product, close to robust.

The holes are in the **production-hardening seams** that a fast feature-sprint outran — and they cluster into five themes:

1. **A class of ungated server actions** (auth holes) — the headline risk.
2. **No outbound email** — every external touchpoint is a manual copy-paste.
3. **No CI and no observability** — nothing enforces quality; prod errors are invisible.
4. **Contract/test debt** — half the modules predate the `Result<T>`/Zod conventions; the data-mutation + RLS layer is untested.
5. **Consistency cruft** — wording drift, legacy multi-tenant routes, dead code, a few half-wired flows.

The plan below is phased by **risk × impact × dependency**, starting with the security fixes (no external dependencies, unambiguous, urgent).

---

## Findings

### CRITICAL — fix immediately

| ID | Finding | Evidence | Fix |
|----|---------|----------|-----|
| **C1** | Unauthenticated admin API route mutates data via the service role. The `PATCH` handler does **zero** auth checks before writing `architect_leads`. Any anonymous caller can change lead state. (Its sibling `generate-deliverables/route.ts` checks correctly.) | `app/api/admin/architect-leads/[id]/route.ts:4-9` | Add `getUser()` + `profile.role === 'super_admin'` (or `requireAdmin`) before any DB call. |
| **C2** | `getActiveProductionApprovalForJob` is an ungated `'use server'` action that **returns the live 64-hex production sign-off token** for any job ID. Enumerate job UUIDs → harvest tokens → call the whitelisted `signOffSubItemProduction` to release jobs to fabrication. | `lib/artwork/production-approval-actions.ts:154` | Add `requireSuperAdminOrError()` gate at the top. |

### HIGH — security (ungated `'use server'` actions = public HTTP endpoints that bypass RLS via service role)

| ID | Finding | Evidence |
|----|---------|----------|
| **H1** | Client CRM read wrappers ungated — full org/contact/site data exposed to anonymous POST. (Write actions in the same file *are* gated.) | `lib/clients/actions.ts:38,45,51,57,467` → `lib/clients/queries.ts:14,102,154,171` |
| **H2** | Delivery read actions ungated; planning mutations (`assignDriverToDelivery`, `rescheduleDelivery`, `autoCreateDeliveryForCompletedJob`) only `getUser()` with no super-admin gate. | `lib/deliveries/actions.ts:25,32,38,48,188,619,652` |
| **H3** | Geocode actions ungated; `geocodeAllSites` is wired to a client button → anyone can force postcodes.io lookups + bulk-write `org_sites`. | `lib/geo/actions.ts:11,57`; `app/(portal)/admin/deliveries/components/GeocodeBackfillButton.tsx:20` |
| **H4** | Driver roster read actions ungated → names/contact details exposed. | `lib/drivers/actions.ts:16,26` |
| **H5** | `getMaintenanceVisits` ungated → all maintenance visits across all clients. | `lib/maintenance/actions.ts:21` |
| **H6** | PostgREST `.or()` search-filter injection: `getDesignPacks` does no sanitisation; production-packs + artwork strip `%`/`,` but **leave parentheses** (filter-group injection). Most other list queries correctly strip `[,()]`. | `lib/design-packs/actions.ts:555`; `lib/production-packs/actions.ts:218`; `lib/artwork/actions.ts:1481` |

### HIGH — functional / operational

| ID | Finding | Evidence |
|----|---------|----------|
| **H7** | **No outbound email anywhere.** Zero Resend/SMTP/etc. "Send for approval" / "Send for production approval" / PoD buttons **only copy the link to the clipboard** — the labels are misleading. Tokens are minted (incl. a snapshotted contact email) but never sent. | `lib/artwork/approval-actions.ts:98,179`; `ApprovalLinkSection.tsx:51,241`; `lib/deliveries/actions.ts:399`; `DeliveryDetail.tsx:79`; `ProductionApprovalLinkSection.tsx:54,155` |
| **H8** | **No CI.** `.github/` is absent — nothing runs `tsc`/test/lint/build on push or PR. The lint gate is already red and nothing caught it. | (no `.github/workflows`) |
| **H9** | **No observability.** No Sentry/structured logging; 198 raw `console.*` calls. Error boundaries exist (`app/error.tsx`, `app/(portal)/error.tsx`) with a "replace with Sentry" TODO, but no capture sink and **no `app/global-error.tsx`** (root-layout throws bypass both boundaries). | `app/error.tsx` |

### MEDIUM

| ID | Finding | Evidence |
|----|---------|----------|
| **M1** | `createPortalUser` is untyped, unvalidated, and derives the password deterministically as `` `${orgName}@2026` `` — guessable account credentials. | `app/(portal)/admin/actions.ts:10` |
| **M2** | PoD tokens (`deliveries.pod_token`) and production-sign-off tokens (`artwork_production_approvals.token`) **never expire** (artwork-approval tokens expire in 7 days). A forwarded link stays exploitable forever. | migrations `035`, `057`; cf. `approval-actions.ts:167` |
| **M3** | `Result<T>` adoption is only **13/30 modules**. Legacy core (whole `artwork/*` suite, `quoter`, `production`, `invoices`, `purchase-orders`, `deliveries`, `clients`) returns ad-hoc `{error}`/untyped shapes. | per-module table in audit |
| **M4** | Zod gaps on structured input: `createPortalUser`, `quoter/actions.ts` mutations, public `requestApprovalChanges`/`signOffSubItemProduction` (unbounded text), thumbnail/cover uploads (no size/type guard). | `quoter/actions.ts:94+`; `approval-actions.ts:643`; `artwork/actions.ts:914,977` |
| **M5** | `external_orders` "convert" status is defined + styled but has **no action and no button** — unreachable dead status. | `lib/external-orders/types.ts:10`; `ExternalOrdersClient.tsx:67` |
| **M6** | Purchase orders are orphaned from the pipeline: `createPoAction` accepts `quote_id`/`production_job_id` but the create UI never passes them; supplier is free-text with no entity. | `purchase-orders/actions.ts:49`; `PurchaseOrdersClient.tsx:197` |
| **M7** | **Lint fails: 459 problems (291 errors, 168 warnings)** across 135 files — mostly `no-explicit-any` (252) and `no-unused-vars` (124); also 1 `react-hooks/rules-of-hooks` (possible real bug). Vercel doesn't run eslint on build, so this is invisible today. | `npm run lint` |
| **M8** | Data-mutation/RLS/trigger layer is **largely untested**. Action-level tests exist only for `production`, `drivers`, `artwork`. Financial/CRM modules (invoices, POs, clients, deliveries) test only pure utils; `design-requests` (public unauth write) has no test. No live-Supabase integration tests in the suite (only the manual `scripts/e2e-crud.mjs`). | coverage map in audit |
| **M9** | **18 user-facing "Organisation"/"Organisation" strings** violate the "UI says client" rule. | subscriptions, reports, orgs, deliverables, leads modals + `app/login/page.tsx:73` |
| **M10** | Migration `004` has an **unguarded destructive `DROP COLUMN`** + non-idempotent `CREATE TYPE` (no `IF NOT EXISTS`/guard) — unsafe to re-apply. | `004_deliverables_workflow.sql:9,12,49` |
| **M11** | Public `/design` spam guard is a per-instance in-memory rate limit (resets on serverless cold start → ineffective) + a single static honeypot. | `lib/design-requests/actions.ts:32-53,72` |

### LOW

- **L1** Legacy multi-tenant client-facing routes are orphaned: `/dashboard`, `/assets`, `/billing` (a "coming soon" stub), `/deliverables`, `/reports` are not in the sidebar and exist from the pre-single-tenant era; `/admin/orgs` is a dead `redirect('/admin/clients')`. (`/settings` is still used by staff.)
- **L2** Dead code: the documented unused `variant='public'` branch in `VisualiserClient.tsx` (lines ~1046/1348/1386/1483/1493); legacy `/admin/leads`, `/admin/subscriptions`.
- **L3** `lib/geo/actions.ts` comment says postcodes.io but the code calls Mapbox — doc/impl mismatch (also affects the README/CLAUDE geocoding claim).
- **L4** `recalcInvoiceTotals`/`recalcPoTotal` ignore `.error` on their writes → silent stale totals.
- **L5** Structural drift: inconsistent SSR-only vs `*Client.tsx` split; modal/component placement; nested-route conventions.
- **L6** Legacy public lead intake (`api/leads`, `api/architect-leads`) writes via service role with no rate limit/honeypot.

**What's already right (no action):** RLS on all 67 tables; CSPRNG tokens (`randomBytes(32)`); service-role key contained (`server-only`, never `NEXT_PUBLIC_*`); the documented unauth token flows correctly whitelisted; the notifications "Needs Attention" feed fully wired to Realtime; invoice-from-quote complete; all four pipeline legs implemented; `tsc` clean; engines well-tested.

---

## Remediation plan (phased)

### Phase 0 — Security hotfixes  ·  *now · low risk · no external deps*
Close the auth holes. All are small, localised, and don't change the happy path (the admin pages already sit behind the admin layout — these gates are correct-by-policy and defence-in-depth).
- **C1**: auth-gate the architect-leads `PATCH` route.
- **C2**: gate `getActiveProductionApprovalForJob` (stop token disclosure).
- **H1–H5**: add `requireSuperAdminOrError()` to the ungated read actions + planning mutations (clients, deliveries, geo, drivers, maintenance). Prefer pushing the gate into the `queries.ts` helpers so it can't be forgotten.
- **H6**: apply the `.replace(/[,()]/g,'')` search sanitiser to the three `.or()` sites.
- **M1**: Zod-validate `createPortalUser` and generate a random initial password.
- **M2**: add `expires_at` to PoD + production-sign-off tokens and enforce it (migration + check).
- **DoD:** every `createAdminClient` call site is either gated or a documented unauth flow; `tsc` + tests green.

### Phase 1 — Outbound communications  ·  *high impact · needs `RESEND_API_KEY`*
This is the single biggest functional gap and the thing that makes the product feel finished.
- Add a small `lib/email/` transport (Resend) behind an env flag; no-op + log when the key is absent (so dev/CI don't break).
- Wire the three token sends (artwork sign-off, PoD, production sign-off) and relabel the buttons honestly ("Copy link" vs "Email to client", with the email path active when configured).
- Fill the `// TODO: Email seam` points (report uploaded, deliverables generated, lead invite) and replace the `OrgDetailModal` password `alert()` with a real invite email.
- **DoD:** a staff click actually sends; graceful no-op without a key; templated, branded emails.

### Phase 2 — Quality gates  ·  *protects everything else*
- Add **CI** (`.github/workflows`): `npm ci` → `tsc --noEmit` → `vitest run` → `next build` (with dummy env), plus `lint` (non-blocking until M7 is paid down, then blocking).
- Pay down **lint** (M7): autofix the trivial, type the `any` hotspots, fix the `rules-of-hooks` error.
- Add `app/global-error.tsx` and wire **Sentry** behind a DSN env (H9); replace the boundary TODOs.
- **DoD:** green CI required to merge; lint at zero (or an agreed baseline); errors captured in prod.

### Phase 3 — Contract & test hardening  ·  *durability*
- Finish the **`Result<T>` migration** (M3) module by module, starting with the highest-traffic legacy core (artwork suite, quoter, production, invoices/PO/deliveries/clients); close the **Zod gaps** (M4); fix the ignored-error writes (L4).
- Add **action-level tests** (mock factory) for the financial/CRM modules and `design-requests`; promote `scripts/e2e-crud.mjs` into a gated **live-Supabase integration job** against a disposable project (M8).
- **DoD:** every server action is `Result<T>` + Zod-validated + has at least a mocked-action test; RLS/triggers covered by an integration job.

### Phase 4 — Unification & cleanup  ·  *one coherent product*
- **Wording** (M9): "Organisation" → "client" across the 18 user-facing strings.
- **Legacy routes** (L1): decide per route — delete `/dashboard` `/assets` `/billing` `/deliverables` `/reports` and the `/admin/orgs` redirect, or guard + relabel as internal. Remove dead `variant='public'` (L2) and the orphaned `/admin/leads` `/admin/subscriptions` (or move to a clearly-labelled "Legacy" section).
- **Half-wired flows**: implement the `external_orders` "convert" leg (M5); wire PO ↔ quote/job linkage + a supplier entity (M6).
- **Hygiene**: guard migration `004` (M10); fix the geo doc/provider mismatch (L3); strengthen the `/design` spam guard with a shared store/Turnstile (M11); standardise the module structure (L5).
- **DoD:** no dead/duplicate surfaces; sidebar reaches every live tool; "client" everywhere; no documented "standalone/unwired" seams left dangling.

---

## North star — "the best version of itself"

> Every external touchpoint communicates itself automatically. Every server action is gated, typed (`Result<T>`), validated, and tested. CI enforces a green `tsc` + tests + lint + build on every PR, and production errors land in Sentry with context. There is exactly one coherent staff product — no dead routes, no duplicate surfaces, no half-wired flows — and it says "client" everywhere a human can read it.

Phases 0–2 get it to *robust*. Phases 3–4 get it to *unified*.
