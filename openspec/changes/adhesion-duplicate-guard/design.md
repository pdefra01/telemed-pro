# Design: Anti-Duplicate Guards in the Adhesion Form

## Technical Approach

Enforce uniqueness of **two independent identifiers per person — DNI and CUIL —**
in **two layers**: (1) an app-layer check that runs in a new `supabaseAdmin`-backed
`server.js` endpoint (primary source of truth), and (2) partial unique indexes on
`adhesion_requests` (one per identifier) as a race-condition backstop. The public
form keeps its existing anon `insert()` path untouched; it only gains a pre-insert
call to the endpoint and two new fields (`cuil`) in its payload.
`POST /api/approve-adhesion` re-validates and now also persists CUIL.

## Architecture Decisions

### Decision: Where the check runs

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Anon query from `AdhesionRepository` | RLS blocks it — `adhesion_requests` SELECT is admin-only, `profiles`/`family_members` are `authenticated`-only. Anon reads nothing; also exposes PII. | Rejected |
| New `POST /api/adhesion/check-duplicates` (service role) before the anon insert | Bypasses RLS; keeps the hand-built insert object intact (avoids re-introducing the field-drop bug); minimal blast radius | **Chosen** |
| Move whole submit server-side | Re-builds the insert by hand → high field-drop risk | Rejected |

### Decision: Where the active-affiliate CUIL lives (proposal open question)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Reuse `profiles.cuit` | `cuit` is the **doctor's** billing tax ID (UNIQUE, migrations `...27000002`/`...28000007`) — different semantics, would cross-contaminate | Rejected |
| **Add new `profiles.cuil TEXT`** + normalized partial unique index; populate at approval time | Represents real affiliate identity, mirrors how `profiles.dni` is set today; unique index (like `cuit` has) enforces one affiliate per CUIL, tolerant of NULLs (doctors) | **Chosen** |

**Rationale**: The affiliate CUIL did not exist anywhere. `profiles` is the
authenticated-affiliate table, so it is the correct home — parallel to `profiles.dni`.
Populated only at `POST /api/approve-adhesion`, mirroring the existing `dni` write.

### Decision: Independent DNI/CUIL check (OR, not AND)

Reject if **any** identifier of **any** person (titular or up to 4 family) matches
**any** record. DNI and CUIL are evaluated independently — a lone DNI match OR a lone
CUIL match is enough. (Confirmed by product; conservative anti-duplication.)

### Decision: Normalization

Canonical = `String(v).replace(/\D/g,'')` (digits only) for both DNI (7–8 digits)
and CUIL (11 digits, format `NN-DDDDDDDD-C`). Compare normalized-to-normalized;
indexes use `regexp_replace(...,'\D','','g')`. App also validates CUIL is 11 digits.

### Decision: `family_members` constraint

No DB unique on `family_members.dni`/`.cuil` — app-layer only. Dependents are not
auth identities; DB unique is too rigid (legacy dupes, valid NULLs).

## Data Flow

    AdhesionForm.handleSubmit  { titularDni, titularCuil, family:[{dni,cuil,name}] }
        ▼
    AdhesionRepository.submitApplication → POST /api/adhesion/check-duplicates
        ▼
    server.js (service role) — per table, one .or() over dnis + cuils:
        ├─ profiles(dni|cuil)                       ─┐
        ├─ family_members(dni|cuil)                  ├─ 3 queries, OR semantics
        └─ adhesion_requests pending(titular_dni|titular_cuil) ─┘
        │  200 {ok} | 409 {conflicts[]}
        ▼
    (if ok) existing anon .insert() (now incl. titular_cuil + cuil in family jsonb)
        ▼
    Partial unique indexes (titular_dni, titular_cuil) = atomic backstop

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `server.js` | Modify | Add `POST /api/adhesion/check-duplicates` (DNI+CUIL). In `/api/approve-adhesion`: re-run check; add `cuil: request.titular_cuil?.trim()` to the profiles `.update()` (line ~608); add `cuil` to each `family_members` insert row (line ~667) |
| `src/repositories/AdhesionRepository.ts` | Modify | Call endpoint before existing `insert()`; throw returned message on 409. Insert object kept as-is structurally — only **add** `titular_cuil` field and `cuil` to each family-member jsonb entry |
| `src/pages/AdhesionForm.tsx` | Modify | Add CUIL input for titular + each family member (validate `NN-DDDDDDDD-C`); surface per-person message via existing `toast` |
| `supabase/migrations/2026071904xxxx_adhesion_dni_cuil_guards.sql` | Create | New columns + dedupe + partial unique indexes (below) |

## Interfaces / Contracts

Request `POST /api/adhesion/check-duplicates`:
```json
{ "titularDni": "30111222", "titularCuil": "20-30111222-3",
  "family": [{ "dni": "40555666", "cuil": "27-40555666-1", "name": "María Pérez" }] }
```
Response 200 `{ "ok": true }`; 409:
```json
{ "ok": false, "conflicts": [
  { "identifier": "cuil", "value": "20-30111222-3", "person": "titular",
    "name": "Juan Pérez", "reason": "affiliate",
    "message": "Este CUIL ya se encuentra afiliado a Medinex." }] }
```
`identifier` ∈ `dni|cuil`; `reason` ∈ `affiliate|family_member|pending_request`.
Matched column is derived by testing the returned row's normalized `dni`/`cuil`
against the input sets. Messages (mirror per identifier):
- affiliate: `Este {DNI|CUIL} ya se encuentra afiliado a Medinex.`
- family_member: `Este {DNI|CUIL} ya está registrado como integrante de otro grupo familiar.`
- pending_request: `Ya existe una solicitud pendiente con este {DNI|CUIL}.`

Per-table query (PostgREST `.or()` keeps it at 3):
```
profiles         .select('id,dni,cuil').or(`dni.in.(${dnis}),cuil.in.(${cuils})`)
family_members   .select('id,dni,cuil,full_name').or(`dni.in.(${dnis}),cuil.in.(${cuils})`)
adhesion_requests.select('id,titular_dni,titular_cuil').eq('status','pending')
                 .or(`titular_dni.in.(${dnis}),titular_cuil.in.(${cuils})`)
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `normalize` (dots/dashes/spaces) for DNI + CUIL; CUIL 11-digit validation | Pure function tests |
| Integration | Endpoint: DNI-only match, CUIL-only match, family match, pending, rejected-reapply | Seed tables, assert 409/200 + identifier/reason |
| Integration | Concurrent identical pending titular_cuil → 23505 | Two parallel inserts |
| E2E | Form shows correct Spanish message per person + identifier | Playwright/staging |

## Migration / Rollout

Pre-launch tables are small — no `CONCURRENTLY`:
```sql
ALTER TABLE public.profiles          ADD COLUMN IF NOT EXISTS cuil TEXT;
ALTER TABLE public.family_members    ADD COLUMN IF NOT EXISTS cuil TEXT;
ALTER TABLE public.adhesion_requests ADD COLUMN IF NOT EXISTS titular_cuil TEXT;

-- dedupe pending for BOTH identifiers before unique indexes
WITH ranked AS (
  SELECT id, greatest(
    row_number() OVER (PARTITION BY regexp_replace(titular_dni,'\D','','g')  ORDER BY created_at DESC),
    row_number() OVER (PARTITION BY regexp_replace(titular_cuil,'\D','','g') ORDER BY created_at DESC)
  ) AS rn
  FROM public.adhesion_requests WHERE status='pending')
UPDATE public.adhesion_requests a SET status='rejected'
FROM ranked r WHERE a.id=r.id AND r.rn>1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_adhesion_pending_titular_dni
  ON public.adhesion_requests ((regexp_replace(titular_dni,'\D','','g')))  WHERE status='pending';
CREATE UNIQUE INDEX IF NOT EXISTS uq_adhesion_pending_titular_cuil
  ON public.adhesion_requests ((regexp_replace(titular_cuil,'\D','','g')))
  WHERE status='pending' AND titular_cuil IS NOT NULL;

-- affiliate identity: one profile per CUIL (mirrors profiles.cuit UNIQUE), NULL-tolerant
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_cuil
  ON public.profiles ((regexp_replace(cuil,'\D','','g'))) WHERE cuil IS NOT NULL;
```
`titular_cuil` added nullable so existing rows survive; app enforces presence going
forward. Rollback: `DROP INDEX` (3) + `DROP COLUMN cuil/titular_cuil` + revert code. No data loss.

## Open Questions

- [ ] Should pending requests' **family** DNIs/CUILs (JSONB) also block? Proposal
      scopes DB/pending checks to `titular_*` only — kept out unless product disagrees.

## Follow-up

tasks/archive must update root `PRD.md` to document DNI+CUIL duplicate prevention
and the new CUIL collection requirement.
