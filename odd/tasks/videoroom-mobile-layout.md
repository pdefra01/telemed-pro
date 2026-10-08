# Feature: VideoRoom fits a phone screen

## Objective
On a phone (~390–412 px wide) the patient's video room must keep every header
element on screen and never cover status text with the self-view.

## Problem (found while recording the phone demo, 2026-10-06)
- The header row overflows to the right: the duration card shows only
  "DURA 00:" and the right-side panel tab is clipped
  (`src/pages/VideoRoom.tsx` around 281, "DURACIÓN").
- While waiting for the doctor, the self-view overlaps the "…negociando
  códecs" text (`src/pages/VideoRoom.tsx` around 334).
- Evidence frame: phone demo `t5-51.jpg` (scratchpad of 2026-10-06 session).

## Scope
- Responsive layout fixes in `src/pages/VideoRoom.tsx` only (Tailwind classes;
  no behavior change). Desktop layout must look the same.
- Re-record `paciente-celular.mp4` (and the desktop videos) to verify.
- Out of scope: other mobile issues, "Dra." title, Historia clínica formats.

## Tasks
- [x] T1 Fix header overflow and self-view overlap at phone width; verify at
  390 and 412 px and at desktop width; re-record the demo videos.
  Route: delegated direct (preparation trigger: reading a large component to
  prepare the write, plus visual verification runs).

## Acceptance criteria
- At 390 and 412 px: duration card fully visible ("DURACIÓN 00:00:xx"), panel
  tab visible, no horizontal page scroll; waiting text not covered.
- At 1280 px the room looks as before.
- `npx tsc --noEmit` clean; VideoRoom tests no worse than master (3 known
  pre-existing failures).

## Checks
- Test-first exception: layout overflow is not observable in jsdom; verified
  with Playwright screenshots / recorded frames instead (before and after).

## Progress
- Branch `fix/videoroom-mobile-layout` from master (953981d).

- T1 done (delegated direct). `src/pages/VideoRoom.tsx` Tailwind classes only
  (16+/16-): phone base classes, `sm:` restores originals. Header stacks the
  doctor card and duration on phones, hides SECURE badge and CONEXIÓN/CIFRADO
  card below 640 px, smaller X; waiting text gets `pt-36 pb-60`; self-view
  `w-24 h-32` on phones.
  - Evidence (2026-10-08): before, duration card at x 316-465 (off-screen) at
    390/412 px; after, x 28-157, panel tab fully visible, waiting text ends at
    y 506/522 and self-view starts at y 582/587. 1280 px positions identical to
    baseline for both roles. `npx tsc --noEmit` clean (parent re-ran).
    VideoRoom tests 5 pass / 3 fail, same 3 fail on master. Parent checked
    `vr-after-celular-call.jpg` ("DURACIÓN 00:00:36" fully visible).
  - Videos re-recorded (09:40 local; Atención inmediata now appears):
    paciente-celular 149.4 s, paciente 229.8 s, medico 186.3 s,
    consulta-completa 221.5 s (README says 170-190 s; longer due to the extra
    step and wait, unconfirmed).
  - Teardown: supabase stop, docker desktop stop, wsl --shutdown; parent
    confirmed 0 heavy processes.
  - Caveat: doctor at phone width only checked by resizing a desktop session
    (notes panel open state is read once at mount).

## Next step
- Review assess, push/PR (user decision).
