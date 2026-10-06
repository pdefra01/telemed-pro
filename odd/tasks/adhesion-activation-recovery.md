# Feature: Recover stuck adhesion activations + throttle the public activate endpoint

## Objective
Follow-up to `odd/tasks/adhesion-auto-activation.md` (shipped as #48/#49).
1. Give admins a way to unstick an adhesion whose activation crashed after the
   auth user was created (claim kept on purpose → row pending forever, public
   `/activate` answers 202 "processing" forever).
2. Rate-limit the public `POST /api/adhesion/:id/activate` (anonymous, runs a
   full duplicate scan per call).

## Decisions (user-confirmed 2026-10-06)
- Recovery = "Liberar y reaprobar": delete the orphan auth user (only if it is
  not linked to any approved adhesion and is a plain patient account), clear
  the claim, and leave the row pending for the normal "Aprobar".
- Delivery: same chain strategy as the parent feature (`stacked-to-main`).

## Design
- A claim is **stale** when `activation_claimed_at` is older than a threshold
  (10 min) and the row is still `pending`.
- `releaseStuckActivation(deps, adhesionId)` (server module): pending + stale
  claim required; locate the orphan account by the request's titular email;
  refuse if that user is referenced by any `adhesion_requests.approved_profile_id`
  or has a non-patient role; clean up what activation created for it (family
  group/members, MP subscription link) as needed; delete the auth user; clear
  the claim. Admin-only endpoint.
- Public `/activate`: a fresh claim keeps 202 "processing"; a stale claim
  answers a distinct status telling the form the row is pending admin review
  (no infinite "processing").
- Admin UI (Afiliados, pending list): badge for stale claims + "Liberar" action
  with confirmation.
- Rate limit: per-IP limiter on `/api/adhesion/:id/activate` (in-memory is
  fine: single Coolify instance), with `trust proxy` set correctly so the real
  client IP is used behind Coolify's proxy.

## Tasks
- [x] T1 Server: stale-claim detection, `releaseStuckActivation` + admin endpoint, `/activate` stale answer; tests.
- [ ] T2 Admin UI: stale badge + "Liberar" action in Afiliados; tests.
- [x] T3 Rate limit on public `/activate` (+ trust proxy); tests.
- [ ] T4 Docs: MANUAL_DE_USUARIO (admin recovery), COOLIFY_DEPLOYMENT if config changes.

## Route
- Delegated direct (writer trigger: multi-file).

## Checks
- `npm test`; `npx tsc --noEmit`. Known base failures: VideoRoom x3,
  DashboardRepository getMetrics, crypto tampered.

## Progress
- Branch `feat/adhesion-activation-recovery` from master (cdf5ffa).
- T1 done (delegated writer), commit `fb59b92`. `server/adhesionActivationRecovery.js`
  (`isActivationClaimStale`, `releaseStuckActivation`), admin route
  `POST /api/adhesion-requests/:id/release-activation` (requireAuth,
  requireAdmin), `/activate` answers 409 `{ ok:false, pendingReview:true, error }`
  on a stale claim (checked before the duplicate scan); fresh claim keeps 202.
  Orphan lookup: `profiles.email` (ilike, wildcards escaped, exact match after
  normalization). Delete only when: single match, role `patient`, profile
  created at/after the claim (2 min skew), not any `approved_profile_id`, no
  `appointments`, no `medical_records`. Cleanup order: MP subscription
  `profile_id` -> null (scoped to this adhesion), `profiles.family_group_id` ->
  null, delete `family_groups` (members cascade), `auth.admin.deleteUser`
  (profile cascades), clear claim guarded by `status='pending'`.
  RED observed (module missing + stale test 202). Checks: focused 47/47 pass;
  `npm test` 898 pass / 5 fail (known base failures only); `npx tsc --noEmit` exit 0.
- T3 done (delegated writer). `express-rate-limit` 8.7.1; `server/rateLimits.js`
  (`createActivateAdhesionLimiter`, 10 req / 15 min per IP, draft-7
  `RateLimit` headers, 429 `{ error }` in Spanish, in-memory store) applied only
  to `POST /api/adhesion/:id/activate`; `app.set('trust proxy', 1)` (no other
  code reads req.ip / X-Forwarded-For). Note in COOLIFY_DEPLOYMENT.md; no new
  env vars. RED observed (module missing). Checks: focused 28/28 pass; `npm test`
  903 pass / 5 fail (known base failures only); `npx tsc --noEmit` exit 0;
  `node --check server.js` ok.

## Next step
- T2 (admin UI), then T4.
