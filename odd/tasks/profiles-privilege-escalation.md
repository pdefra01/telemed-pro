# Profiles privilege escalation (security)
Objective: a logged-in user must not be able to grant themselves admin/doctor role, a plan, coverage or verification flags. Branch: fix/profiles-privilege-escalation. Delivery: single PR, prod migration with explicit authorization. Runners: pgTAP (`supabase test db --local`), Vitest.

## Specs
- S1 (finding, reproduced locally): RLS "Self manage" (ALL, auth.uid() = id) + authenticated UPDATE grant on profiles + trigger on_profile_role_change → sync_user_role() (SECURITY DEFINER) upserting user_roles, which is_admin() reads. A patient running `update profiles set role = 'admin' where id = me` becomes admin. Must be rejected.
- S2 (finding): the same path lets a user set their own plan_id / plan_status / is_active / family_group_id and other privileged columns. Must be rejected for non-admin direct writes.
- S3 (finding): handle_new_user takes the role from raw_user_meta_data, which a public `auth.signUp` caller controls; a self-signup with `data: { role: 'admin' }` would create an admin profile. Self-signup must never create a non-patient profile.
- S4: legitimate flows keep working: admin screens, the server (service role), SECURITY DEFINER RPCs, and self-service edits of non-privileged personal columns.

## Tasks
- [x] T1 S1,S2,S4: BEFORE INSERT OR UPDATE guard trigger on profiles + pgTAP. Risk: items 1, 2. RED 12 escalations succeeded → GREEN 24/24; full pgTAP PASS.
- [x] T2 S3,S4: role at signup only from trusted metadata; server createUser passes it. Risk: item 2. RED (self-signup admin) → GREEN; server.js passes app_metadata; Vitest only the 5 pre-existing failures.

## Log
- L1 (2026-10-25): "si, arreglalo ya" (after the report that any logged-in affiliate can become admin by editing profiles.role)
- L2 (2026-10-25): explorer found self-service writes to family_group_id (FamilyMemberRepository.ensureFamilyGroup), current_period_quota_used (AffiliateRepository.incrementQuotaUsed) and phone/email_verified (ContactVerificationRepository.verifyOtp, client-side OTP). Decision: allow own-group links and quota increments only; leave phone/email_verified for a follow-up (needs a server-side OTP). Prod audit: 1 admin + 4 doctors, all legitimate.
- L3 (2026-10-25): verifier blockers: B1 GoTrue writes app_metadata after the auth.users insert, so server-created doctors/admins/patients would become inactive patients; B2 delete + re-insert of own profile bypassed the insert checks. Fix: server/profileAccess.js sets role/is_active with the service role after createUser (rollback deletes the auth user); direct inserts by API roles are always rejected. pgTAP 465 PASS; server test 3/3.
- L4 (2026-10-25): verifier recheck: B1 and B2 fixed (probes + pgTAP 465 PASS). Deploy order: server (Coolify) first, then the migration.
