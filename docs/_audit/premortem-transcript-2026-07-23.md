# Premortem transcript: public /design studio launch

Date: 2026-07-23
Target: sending onesign-odysseus.vercel.app/design to the public
Classification: hybrid, software dominant (public feature launch that doubles as a lead generation front door)
Run mode: single pass, grounded in two deep code audits (capability parity audit and fulfilment data path audit) run against the live codebase at commit 6846540

## The frame

It is six months from now, January 2027. The public design studio has failed. The link went out, traffic arrived, and the tool did not turn visitors into signage jobs. We are looking back to understand what went wrong.

## Context gathered

- The /design wizard mounts the SAME store, ControlsPanel, SvgDropzone, Scene3D and derivation pipeline as the staff visualiser; the public experience is the staff engine reskinned by a `simplified` prop and a four step wizard shell.
- Submissions go through `submitDesignRequest` (service role, unauthenticated by design) into `design_requests`, then staff promote to a `visualiser_designs` row and export cut files from the visualiser. The promotion copies `params_json` verbatim; nothing is dropped.
- Full audit details are recorded in the failure cards below and in the report file alongside this transcript.

## Failure reasons generated

1. Leads land unseen and go stale. Nothing notified staff when a design_request row landed: no notifications trigger, no dashboard entry (the kind gate in `getAttentionItems` skipped unknown kinds), no badge, no email, and the Realtime publication added in migration 060 had no subscriber. The success card promises a reply "usually within 1 working day"; without a signal, requests submitted on a Friday sat until someone happened to open the inbox.

2. The honeypot silently swallowed real enquiries. The hidden field was labelled "Company website", which browser autofill and password managers will populate. A hit returned a fake success ("received") and wrote nothing. The customer saw the celebration card; no lead existed. Invisible in every metric.

3. Big designs failed at the last step. A retina (dpr 2) canvas capture could exceed the 4 MB thumbnail cap, and the whole submission was rejected by Zod with "String must contain at most 4000000 character(s)" after the customer had invested twenty minutes. The flattened SVG had the same failure mode at 5 MB. Neither was checked client side.

4. Internal leftovers read as broken software. The binder button (super admin only server actions) rendered on the public page and could only error; the trace panel linked into the login walled /admin vectoriser; help text pointed at a "Flat development tab" that does not exist publicly; the staff rail's step numbers (3 Artwork, 4 Materials) collided with the wizard's own 1 to 4 stepper.

5. Material selection confused laymen at the decisive moment. Production vocabulary leaked through the shared controls: "Returns on edges", "Material thickness drives the bend deduction", a free text "Material / finish" field expecting shop language, "Standoff distance", "Keyline offset", "Protrusion", "Extra face (cut from metal, laminated on front)", plus a shadow gap control nobody outside the shop understands.

6. A 3D tap on the wrong step armed an invisible edit. Path picking was live on every wizard step, but the finish editor only renders on the Artwork step; on mobile with the sheet collapsed a tap produced an orange flash and nothing else. Customers ended up in a half armed group edit state with no visible way out.

7. A crash was a dead end. /design had no error boundary; a WebGL failure (older Android, iOS Safari memory pressure) bubbled to the root boundary: staff toned copy, a "Go home" link into the login flow, and no way to still capture the enquiry.

8. The enquiry underspecified the premium job. The built up lettering spec (finish, depth, return length, welds) rode along in params_json but was displayed nowhere in the admin inbox, and the engine renders built up letters as flat stand off. A quote raised from the curated detail view missed the most expensive fabrication on the sign.

9. Customer previews carried production linework. The submitted thumbnail was captured with annotations on (register and keyline lines, artwork outlines), so the success card and the inbox preview looked like a draft, not a product.

10. Spam or throttling misbehaved under a marketing push. The rate limit is in memory per serverless instance (resets on cold start, not shared), and the global cap of 60 per minute is app wide; a link blast could throttle legitimate visitors while a distributed bot walks straight past the per instance counters. Turnstile remains the documented future toggle.

11. The lead path was untested. Zero tests covered `submitDesignRequest` and `assembleDesignPayload` while the surrounding engine had 562; a future store or compose refactor could break the one path nobody in the office exercises daily, discovered weeks later as "no leads this month".

12. One person owned the reply promise. "Usually within 1 working day" appears on the form and the success card. Tom is the single point of failure for triage; a holiday or an install week quietly broke the promise the software makes on the company's behalf.

13. Mobile ergonomics degraded to "fiddly". The size step opened on bare millimetre fields (numeric keyboard, no anchor for a layman), the dock plus the iOS keyboard could squeeze the stage to a sliver, and the tour cards can overlap their targets on small screens.

## The always on threads

- Scope and estimate: no new estimate was at risk here (the build shipped in PR 46); the risk was declaring "done" while the operational half (notification, triage, fulfilment visibility) was unbuilt. That is exactly where the failure surface concentrated.
- Capacity and dependency: reasons 1, 10 and 12; the notification fix converts the SLA from "someone remembers to check" to "the dashboard tells you", but the reply promise itself still needs an owner.

## Synthesis

Most likely failure: reason 1. Near certain without a fix; everything else about the tool could work perfectly and the launch still fails on response time.

Most dangerous failure: reasons 2 and 3 together, the send step silently eating real enquiries. No row, no error log, no metric; the better qualified the customer (business autofill, big proper artwork), the more likely they were eaten.

The hidden assumption: "the staff engine, relabelled, is safe to hand to the public." The wizard mounts staff components wholesale, so every staff affordance ships to customers by default; `simplified` is not a skin, it is a contract, and any control added to the shared components lands on the public page the day it merges unless it is gated.

## Revisions implemented in this change

- Migration 073 plus a `design_request` attention kind: every submission now drops a Needs Attention card on the admin dashboard (live via the existing notifications Realtime feed).
- Honeypot flags instead of drops (lead recorded with a triage note), and the hidden field no longer matches autofill heuristics.
- Thumbnails are captured clean (same captureClean flip as staff exports), trimmed, and downscaled to a small JPEG client side; the server strips an oversize thumbnail or flattened SVG instead of rejecting the lead; database errors return a human message with the email fallback.
- Binder hidden on the public page; admin vectoriser link hidden; Flat tab help text corrected; staff step numbering hidden; Materials section titled "Finish".
- Simplified language pass on the shared controls: "Folded edges", "Depth off the wall", quick size presets, colour only material section ("Sign colour", RAL explained in plain words), friendlier technical field labels in the finish editor, customer wording in the built up modal ("Metal sides to fold", "Welded corners"). Thickness, shadow gap and the centre panel override are now staff only.
- 3D path picking gated to the Artwork step and opens the sheet on a pick.
- /design error boundary with a warm recovery path and a mailto fallback.
- Built up lettering spec card on the admin request detail page with a "quote returns and welds, not flat stand off" warning.
- 16 new tests over the submission and assembly path (honeypot flag, oversize stripping, projecting sign round trip, built up passthrough).

## Revisions recommended, not in this change

- Apply migration 073 to the live project as part of the deploy (it is a file in the repo; it does nothing until applied).
- Real device pass on iPhone Safari and Android Chrome before the link goes out (build, finish, projecting sign, submit).
- Autofill test with a password manager on the details form.
- Decide the reply promise: keep "1 working day" only if someone owns the inbox on Fridays and holidays; otherwise soften the wording in PublicWizard (it appears twice).
- Turnstile (or hCaptcha) when volume justifies it; the seam is already documented in the actions file.
- Longer term: fabricate built up letters from the enquiry directly (the "asset instance" follow up already flagged in CLAUDE.md) instead of rebuilding in the returns tool.
