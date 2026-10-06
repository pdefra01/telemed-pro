# Feature: Recorded demo videos — patient requests care, doctor attends

## Objective
Produce sales demo videos (for prospective clients) of the flow "patient
requests an immediate consultation → doctor attends them in a video call",
recorded automatically with Playwright against a LOCAL environment with demo
data. Never against production.

## Decisions (user-confirmed 2026-10-06)
- Automated recording, including the video call.
- Camera feeds come from free stock footage (Pexels license, commercial use OK)
  until the user provides own clips:
  - Doctor: https://www.pexels.com/video/a-doctor-having-online-consultation-on-her-laptop-8375484/
    (female doctor facing camera; crop to webcam framing)
  - Patient: https://www.pexels.com/video/pregnant-woman-on-a-video-call-7156550/
    (woman at home, waves, faces camera)

## Defaults chosen by the assistant (change on request)
- Demo personas match the clips: doctor "Dra. Lucía Fernández" (Clínica
  médica), patient "Camila Rodríguez". Fictional DNI/emails.
- Spanish on-screen captions describing each step (injected overlay, demo only).
- Outputs: `paciente.mp4`, `medico.mp4`, and `consulta-completa.mp4`
  (sequenced with a side-by-side section during the call). 1280x720.
- Stock clips are downloaded by a script into a git-ignored cache, not
  committed. Outputs are git-ignored.

## Flow evidence (explorer map)
- No on-demand queue: "requesting care" = booking a `confirmed` appointment in
  "Agendar Turno" (PatientDashboard "Nuevo Turno" → specialty → doctor → slot →
  "CONFIRMAR TURNO"), then "Ingresar a la Consulta" → `/#/room/:id`.
- Doctor: "Sala de Espera" (view `doctor_queue`, realtime) → "Iniciar Llamada"
  → VideoRoom (tabs Evolución/Receta/Reco.) → "Finalizar Turno" →
  PostConsultation (`#diagnosis` required) → "Finalizar Consulta".
- LiveKit: `POST /api/livekit-token` signs `room-<appointmentId>` with
  `LIVEKIT_API_KEY/SECRET`; client uses `VITE_LIVEKIT_URL`. Local
  `livekit-server --dev` (devkey/secret, ws://localhost:7880) is compatible.
- Local blockers: no appointments INSERT policy in migrations (only
  `scripts/fix-rls.js`); seeded doctor availability reset to `[]`; new patients
  inactive; `server.js` falls back to the production Supabase URL; WhatsApp
  send after finalize fails without WAHA (skip indications/prescription).

## Tasks
- [x] T1 Demo harness: media prep (ffmpeg → y4m/wav), local LiveKit, local
  seed (doctor/patient/availability/RLS for local only), env guard that refuses
  any non-local Supabase URL.
- [ ] T2 Playwright recording script (two browsers with distinct fake cameras,
  captions overlay, per-role videos) + ffmpeg composition.
- [ ] T3 README for re-running and swapping in own clips; produce the videos.

## Route
- Delegated direct (writer; multi-file, needs iterative runs).
- T1: delegated direct (writer trigger: 5+ non-trivial files; resumed after a
  crashed session).

## Checks
- Script runs end to end locally and produces the 3 MP4s; frames inspected.

## Progress
- Branch `feat/demo-videos` from master (b21f23d). ffmpeg 9.0.2 installed (scoop).
- T1 done. Files: `demo/fetch-media.mjs`, `demo/prepare-media.mjs`,
  `demo/start-livekit.mjs`, `demo/seed-local.mjs`, `demo/lib/local-env.mjs`,
  `demo/lib/local-env.guard-test.mjs`; `npm run demo:{media,livekit,seed,test}`;
  `demo/.cache/` and `demo/output/` git-ignored.
  - Guard: `assertLocalUrl` accepts only 127.0.0.1/localhost/::1; the seed
    asserts both API and DB URLs before any connection. Test file uses
    `node:test` and is named `*.guard-test.mjs` so vitest (jsdom) skips it.
  - LiveKit: not in scoop/winget (winget only has the `lk` CLI). The script
    downloads pinned v1.13.8 from GitHub releases into `demo/.cache/livekit/`,
    verifies SHA-256 against `checksums.txt`, and extracts with Windows bsdtar.
  - Seed INSERT policy is matched by name, so an unrelated ALL policy cannot
    suppress it.
  - Evidence (2026-10-06):
    - `npm run demo:test` → 4/4 pass (remote, look-alike, userinfo-trick and
      malformed URLs refused; seed rejects remote API/DB before connecting).
    - `node demo/prepare-media.mjs` → no-op (stamps fresh), outputs listed.
    - `node demo/seed-local.mjs` ×2 against local stack (API 127.0.0.1:54321)
      → same doctor/patient IDs, exit 0; readback: doctor active, 7-day
      availability; patient active with plan; insert policy present.
    - `node demo/start-livekit.mjs` → dev mode on 127.0.0.1:7880, HTTP 200.
  - Commit: `feat(demo): add local demo harness for recording sales videos`
    (first commit on `feat/demo-videos` after b21f23d; hash in `git log`).
  - Native review: not run by the writer (RDD assess left to the parent).

## Next step
- T2 Playwright recording script via writer.
