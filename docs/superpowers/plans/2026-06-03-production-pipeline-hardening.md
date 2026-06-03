# Production Pipeline Hardening — Plan

**Date:** 2026-06-03
**Branch:** `claude/kind-clarke-RmxT8`
**Driver:** Production pipeline audit (job board, shop floor, sign-off gates, handoffs).

This plan addresses the audit findings. Product decisions taken with Tom:

1. **Shop-floor access** — introduce a per-worker `staff` role with scoped RLS, and give the
   shop floor its own chrome-free layout (move it out of the `(portal)` group, mirroring
   `/backshop` §2b).
2. **Gates** — *soft*: warn + allow override, recording who overrode. No hard blocks.
3. **Sign-off model** — *two separate checks*: the `/production-sign-off` token =
   "approved to fabricate" (release readiness); the shop-floor guided check = "built
   correctly" as-built QC, stored in its **own** column.
4. **Scope** — everything (blockers + gaps + polish), phased.

Migrations allocated up front (so numbering never races): **061** staff role/RLS,
**062** as-built QC + sign-off split, **063** notification kinds + misc.

---

## Phase 1 — Shop-floor access & layout  *(B1, G7-layout/identity)*
- [ ] Migration **061**: add `staff` to `user_role` enum; `is_staff()` SQL helper
  (`role IN ('staff','super_admin')`); scoped RLS for `staff` on `job_items` (SELECT+UPDATE),
  `production_jobs` (SELECT), `job_stage_log` (INSERT), `artwork_jobs`/`artwork_components`
  (SELECT), `artwork_component_items` (SELECT+UPDATE).
- [ ] `lib/auth.ts`: `isStaff()` + `requireStaffOrError()`.
- [ ] Move `app/(portal)/shop-floor/**` → `app/shop-floor/**` with its own `layout.tsx`
  (`requireAuth` + staff/admin gate, no portal sidebar/topbar, large touch targets).
- [ ] Keep `/shop-floor` href in the sidebar; update CLAUDE.md §2 to document the move.
- [ ] Persist department selection (localStorage); land on a real fabrication stage, not Order Book.

## Phase 2 — Sign-off model: separate as-built QC from approve-to-fabricate  *(B5, B4, B3, G6, G7-changes)*
- [ ] Migration **062**: `artwork_component_items.as_built_signed_off_at` / `as_built_signed_off_by`
  (+ index). Token flow keeps writing `production_signed_off_at`.
- [ ] Repoint shop-floor `submitSubItemProduction` → writes `as_built_*` (not `production_*`);
  allow QC sign-off when spec dims are null (B4); record measured dims as before.
- [ ] Surface `production_changes_requested_at` + comment on the shop floor (G7).
- [ ] Delete dead `signOffProduction` + `submitProductionMeasurements` (G6).
- [ ] Guided check no longer collides with the token gate; rollups stay token-only.

## Phase 3 — Release gate: soft warnings + override + client-approval awareness  *(B2, B3, G10)*
- [ ] `computeReleaseGaps` → split **hard** (no sub-items / no `target_stage_id` — can't route)
  vs **soft** (design / fabricate-approval / client-approval not done).
- [ ] Add client-approval signal (`artwork_approvals.status === 'approved'` / per-component decisions).
- [ ] `completeArtworkAndAdvanceItem(artworkJobId, { override?: { reason } })`: proceed past soft
  gaps only with an acknowledged override; record override in stage log / audit.
- [ ] Card-level shop-floor "Complete" → confirm + record override when as-built QC not done (B3).
- [ ] Make release atomic via an RPC (or compensating writes) so routing+status don't half-apply (G10).

## Phase 4 — Handoff data integrity  *(B6, G1, G3, G5, G9)*
- [ ] `createManualJob` creates a `job_items` row + routing so manual jobs appear on the board (B6).
- [ ] `createJobFromQuote` skips `is_production_work = false` lines (match artwork side); clear
  message for services-only quotes (G1).
- [ ] Migration **063**: extend `notifications.kind` with `delivery_autocreate_failed`. Auto-delivery
  failure raises a notification instead of being swallowed (G3).
- [ ] `advanceItemToNextRoutedStage`: stop silently completing on empty/mismatched routing — flag
  for admin instead (G5).
- [ ] `createJobFromQuote`: refuse to create a job with no resolvable org rather than using a free
  dropdown pick as the inheritance root (G9).

## Phase 5 — Cross-module + ergonomics  *(G8, G2-doc)*
- [ ] Job board reads `?item=`/`?job=` and opens/scrolls to it; flags "open in board" works (G8).
- [ ] `shop_floor_flags` → realtime publication (live flags inbox) (G8).
- [ ] Fix "Start Artwork Pack" swallowed error (G8).
- [ ] Quote page: order/prompt the accept→job→artwork steps (G2). Correct CLAUDE.md claims.

## Phase 6 — Polish
- [ ] Board search + priority/overdue filter; show `assigned_initials`.
- [ ] Editable routing post-create (detail panel).
- [ ] De-dupe the three card renderers; remove unused imports; parent-job realtime; empty-state CTAs.
- [ ] Migrate production server actions to `Result<T>`.

## Verification
- `npm run test` (vitest) green; extend `computeReleaseGaps` / shop-floor util tests.
- `npm run build` / typecheck clean.
- Migrations are file-only (applied on deploy); not executed against the live project here.
