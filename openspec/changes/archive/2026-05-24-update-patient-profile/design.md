# Design: Permitir actualizar datos del afiliado desde su perfil

## Technical Approach

We will create a new patient-only page: `src/pages/patient/Profile.tsx`. This page will display patient fields (read-only: DNI, Email, Plan, Status; editable: Full Name, Phone, Address) inside a responsive glassmorphic card interface matching Medinex's premium styling. On form submission, we validate that the Full Name is not empty, call `affiliateRepository.updateAffiliate` to update the Supabase backend, and sync the local active session by writing to `localStorage` and executing the app-wide `onLogin` callback.

## Architecture Decisions

### Decision: Dedicated Profile Page
**Choice**: Create a separate `Profile.tsx` page under `src/pages/patient/`.
**Alternatives considered**: Integrating the profile edit form directly into `PatientDashboard.tsx` in a tab or drawer.
**Rationale**: Keeps concerns separate. A dedicated page simplifies routing, tests, and future additions (like security settings or multi-factor configuration).

### Decision: localSession Synchronization
**Choice**: Dispatch the updated user object via `onLogin` callback and update `localStorage` on success.
**Alternatives considered**: Relying on a full page reload (`window.location.reload()`).
**Rationale**: Triggering the layout's active session state creates a seamless, modern reactive update in the layout headers and avatar triggers instantly, with zero flickering.

## Data Flow

```
   [Profile.tsx (UI Form)] ──(Validate)──→ [AffiliateRepository] ──→ [Supabase ('profiles')]
            │                                                                  │
      (On Success)                                                             │
            │                                                                  │
            ▼                                                                  ▼
[Update localStorage & App state] ←────────────────────────────────────────────┘
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/pages/patient/Profile.tsx` | Create | New premium patient profile edit view |
| `src/pages/patient/__tests__/Profile.test.tsx` | Create | UI and behavioral unit tests |
| `src/App.tsx` | Modify | Add `/profile` route mapping to the new component |
| `src/pages/patient/PatientDashboard.tsx` | Modify | Update profile action trigger link destination |

## Interfaces / Contracts

No new database models or interfaces are required. We will use the existing `Patient` type defined in `src/types.ts`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Validation Logic | Verify empty name rejects form submission with visual warning |
| Integration | Supabase Sync | Mock `affiliateRepository.updateAffiliate` and verify form inputs propagate properly and call the update function |
| UI/UX | State Rendering | Verify read-only status on DNI, email, plan, and input fields for editable values |

## Migration / Rollout

No database schema migration is required. The `profiles` table in Supabase already contains `full_name`, `phone`, and `address` fields.
