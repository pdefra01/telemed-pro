# Tasks: Permitir actualizar datos del afiliado desde su perfil

## Review Workload Forecast

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

| Field | Value |
|-------|-------|
| Estimated changed lines | ~300 lines |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception |

## Phase 1: Foundation & Routing

- [x] 1.1 Add `/profile` route to `src/App.tsx` mapped to `<Profile />` wrapped in `ProtectedRoute` with `patient` role.
- [x] 1.2 Update profile Link in `src/pages/patient/PatientDashboard.tsx` to link to `/profile` instead of fallback.

## Phase 2: Test-Driven Profile View Implementation (TDD)

- [x] 2.1 **[RED]** Create `src/pages/patient/__tests__/Profile.test.tsx` with Vitest unit tests verifying that the edit form displays patient info, validates empty full name, and displays validation error.
- [x] 2.2 **[RED]** Add test case in `src/pages/patient/__tests__/Profile.test.tsx` that asserts form submission calls `affiliateRepository.updateAffiliate` with updated data and triggers layout refresh.
- [x] 2.3 **[GREEN]** Create the high-fidelity `src/pages/patient/Profile.tsx` page using the premium glassmorphic UI. Implement form state, validation, and call repository `updateAffiliate`.
- [x] 2.4 **[GREEN]** Wire up successful update handling in `Profile.tsx` to update local storage and execute login callback, making sure Vitest tests pass 100% green.
- [x] 2.5 **[REFACTOR]** Polish `Profile.tsx` to match the exact spacing, transitions, and accessibility guidelines of other patient dashboard views.

## Phase 3: Integration & Manual Verification

- [x] 3.1 Run full Vitest test suite (`npm run test`) and verify all tests pass.
- [x] 3.2 Manually verify profile update using test patient `12345678@medinex-paciente.com` and ensure header name updates instantly upon saving.
