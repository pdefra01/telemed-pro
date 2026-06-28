# Proposal: Permitir actualizar datos del afiliado desde su perfil

## Intent

Currently, patients cannot update their personal details (Full Name, Phone, Address) from the UI. Adding a dedicated Profile page will empower patients to manage their contact info, keeping data fresh and reducing administrative overhead.

## Scope

### In Scope
- Create a new interactive profile screen: `src/pages/patient/Profile.tsx` with premium teal styles, allowing patients to view and update Full Name, Phone, and Address.
- Register `/profile` route in `src/App.tsx` wrapped in `ProtectedRoute` for patients.
- Wire view to `affiliateRepository.updateAffiliate()` to persist changes in Supabase.
- Update `PatientDashboard.tsx` link trigger to load `/profile`.
- Synchronize updated user data in `localStorage` so header reflects changes instantly.

### Out of Scope
- Editing identity columns like DNI or Email (only admins can change these).
- Modifying plans or billing information (out of scope for profile updates).

## Capabilities

### New Capabilities
- `patient-profile-update`: Provides patient users the interface and transactional flow to update their contact details.

### Modified Capabilities
None

## Approach

1. **Routing**: Add the `/profile` patient-only route inside `src/App.tsx`.
2. **UI Implementation**: Create `src/pages/patient/Profile.tsx`. Design with premium card layout, validation (non-empty name), state management, and toast alerts.
3. **Local Sync**: On successful save, update the active user context (`localStorage` + layout update callback) to sync active session details.
4. **Testing**: Write unit and integration tests under `src/pages/patient/__tests__/Profile.test.tsx` using Vitest and React Testing Library.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/App.tsx` | Modified | Register `/profile` route |
| `src/pages/patient/Profile.tsx` | New | Form interface to edit profile fields |
| `src/pages/patient/__tests__/Profile.test.tsx` | New | Vitest UI and logic unit tests |
| `src/pages/patient/PatientDashboard.tsx` | Modified | Correct profile button link destination |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Context out of sync | Low | Sync layout via local storage update and state callbacks immediately. |

## Rollback Plan

`git checkout` modified files and remove the new `Profile.tsx` and test files.

## Dependencies

- Existing `AffiliateRepository` and local Supabase database.

## Success Criteria

- [ ] Patient can edit and save Name, Phone, and Address.
- [ ] Active session is updated instantly without manual refresh.
- [ ] Vitest test suite passes successfully.
