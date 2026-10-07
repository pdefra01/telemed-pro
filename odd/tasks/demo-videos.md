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
- [x] T2 Playwright recording script (two browsers with distinct fake cameras,
  captions overlay, per-role videos) + ffmpeg composition.
- [x] T3 README for re-running and swapping in own clips; cosmetic seed fixes;
  T2 review findings; slower pacing so `consulta-completa.mp4` runs ~2 min
  (user request 2026-10-06: "muy rápido pasa todo"); the doctor issues a
  prescription (user request 2026-10-06); produce the videos.
  - Prescription: `finalize-consultation` builds the PDF and only logs a mock
    WhatsApp message; the real send is `POST /api/prescriptions/:id/send-whatsapp`
    (server.js:174), which returns 503 `whatsapp_disabled` locally. Demo-only
    fix: Playwright `page.route` fulfills that call with success; no app change.
  Route: delegated direct (writer trigger: record/compose/seed/README).

- [x] T4 Stretch `consulta-completa.mp4` to ~3 min with real content, not
  slower pauses (user choice 2026-10-06): doctor reviews the patient's
  Historia Clínica before the call (seed a prior consultation), a longer call
  where she writes the evolution while talking, and the patient opens the
  receta PDF at the end (fix the `kong:8000` signed URL for local playback).
  Route: delegated direct (writer: record/compose/seed).

- [x] T5 Patient mobile video (user request 2026-10-06): patient flow
  (book → call → receta) recorded with Playwright mobile emulation (touch,
  phone viewport), composed vertical 9:16 (1080x1920) with a phone mockup
  centered on a Medinex-branded background (dark navy + teal, logo on top,
  captions below the phone). Starts after T4 (same recorder files).

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
  - Native review: assessed medium (`slice_budget_reached`); consent granted;
    one-lens (reliability) review approved and acknowledged (lineage
    `review-a5336b388e151426`). Reviewed boundary advances to the T1 commit.
  - Non-blocking review follow-ups (fold the warnings into T2):
    - WARNING `demo/lib/local-env.mjs:96`: DB URL passed to the app env is not
      re-asserted by the guard.
    - WARNING `demo/seed-local.mjs:83-100`: an update matching zero rows
      succeeds silently.
    - SUGGESTION `demo/fetch-media.mjs:45`: download is not atomic (write to a
      temp file, then rename).
    - SUGGESTION `demo/seed-local.mjs:30-33`: availability slots before 8 AM.

- T2 done (delegated direct, writer trigger: 3 new + 6 modified files).
  Files: `demo/record.mjs`, `demo/compose.mjs`, `demo/lib/captions.mjs`;
  modified guard/seed/fetch/package.json. `npm run demo:record` records and
  composes; `demo:compose` alone. Seed deletes prior demo appointments
  (idempotent). Network rule aborts any request to supabase.co/.in/railway.app.
  - T1 warnings fixed: `assertLocalDbUrl` (status reader, `buildAppEnv`,
    seed); seed profile updates must touch exactly 1 row. Suggestions: atomic
    download done; availability now 00:00–23:00 (lets recording run anytime;
    makes the booking modal tall).
  - Evidence (2026-10-06): RED (import of missing `assertLocalDbUrl`) → GREEN
    `npm run demo:test` 6/6 (parent re-ran: 6/6). `demo:record` ×2 → 3 MP4s
    1280x720 (paciente ~73 s, medico ~48 s, consulta-completa ~70 s); DB after
    run 2: exactly 1 completed demo appointment. Frames inspected (parent
    checked side-by-side `run2-45.jpg`: both stock feeds live, captions ok).
  - Teardown: app/LiveKit stopped, `supabase stop`, Docker Desktop stopped,
    `wsl --shutdown`.
  - Commit `2789003` feat(demo): record patient and doctor demo videos with
    Playwright. Review assess: medium, `slice_budget_reached` (610 lines);
    consent granted; one-lens (reliability) review approved and acknowledged
    (lineage `review-71abfb0e72f29602`, authority burned). Reviewed boundary
    advances to `2789003`.
  - Non-blocking review findings (fold into T3):
    - WARNING `demo/record.mjs:183-189` immediate-care probe for non-waiting state.
    - WARNING `demo/record.mjs:250` patient page evaluate after the call ends.
    - SUGGESTION `demo/record.mjs:316-322` stack teardown not guaranteed.
    - SUGGESTION `demo/record.mjs:138-139` timeline origin offset.
    - SUGGESTION `demo/seed-local.mjs:37-39` exactly-1-row guard untested.
  - Cosmetic follow-ups: "Dr. Dra. Lucía Fernández" (app prefixes "Dr."; seed
    first name "Dra. Lucía"); "Consultas Bonificadas: 1/null" (local plan
    quota missing); caption covers lower slots of the tall booking grid.

- T3 done (delegated direct). Commit `9b7ec73` feat(demo): issue a
  prescription and slow the demo pacing to about two minutes. Files:
  record/compose/seed/captions/guard-test, new `demo/README.md`.
  - Prescription: doctor adds Ibuprofeno 400 mg + Loratadina 10 mg in Receta,
    diagnosis "Rinosinusitis viral aguda", finalizes; recorder fulfills
    `**/api/prescriptions/*/send-whatsapp` with `200 {"status":"sent"}` (run
    fails if never hit); patient then sees "Mis Recetas".
  - Seed now creates private `prescriptions_pdfs` bucket (fresh local stack
    lacked it → finalize silently stored a dummy w3.org URL), a 30-day coverage
    window ("0/∞" instead of "1/null"), 6 slots around the current hour
    (`slotsAround`), first name "Lucía" → app shows "Dr. Lucía Fernández"
    ("Dra." needs an app change: hardcoded "Dr.", no gender/title column).
  - T2 findings fixed (probe waits, `captionSafely`, teardown on all failure
    paths + Ctrl+C, timeline origin before `newPage()`, `expectOneRow` test).
  - Evidence (2026-10-06): RED (missing exports) → GREEN `demo:test` 8/8
    (parent re-ran: 8/8). `demo:record` ×4; final: paciente 127.6 s, medico
    88.1 s, consulta-completa 126.4 s, 1280x720. DB: 1 completed appointment,
    1 prescription with 2 meds + PDF in storage (1848 bytes). Parent checked
    frame `t3-115.jpg` ("¡Consulta Finalizada!" + "Enviado por WhatsApp").
  - Teardown: supabase stop, docker desktop stop, wsl --shutdown; parent
    confirmed 0 heavy processes.
  - Review: medium, `slice_budget_reached` (497 lines); consent granted;
    reliability lens approved and acknowledged (lineage
    `review-70807c153e9f0b43`, authority burned). Boundary → `9b7ec73`.
  - Non-blocking follow-ups: WARNING `demo/record.mjs:381-388` signal during
    startup; WARNING `demo/record.mjs:216-218` selected-slot CSS coupling;
    SUGGESTION `demo/seed-local.mjs:123-136` coverage window untested. Known
    cosmetic: stored `pdf_url` signed with internal `kong:8000` host (demo
    never clicks it); caption slightly overlaps "CONFIRMAR TURNO"; brief blank
    patient dashboard load.

- T4 done (delegated direct; writer interrupted once by an API session limit
  and resumed with intact state). Commit `201742c` feat(demo): stretch the
  demo to three minutes with history, evolution and receta PDF.
  - Seed `priorConsultations(now)`: 2 prior completed visits (pharyngitis ~5
    months ago, annual checkup ~6 weeks ago). Doctor opens "Expediente" →
    Historia clínica; types and saves evolution ("Sincronización completa")
    during the side-by-side call; fills "Reco."; patient opens the receta PDF
    in full headless Chromium (`channel: 'chromium'`) with `kong:8000` URL
    rewritten by `toLocalStorageUrl` (refuses non-local hosts). Compose scales
    cuts by per-role video clock drift.
  - Evidence (2026-10-06): `demo:test` 12/12 (parent re-ran: 12/12; RED for
    `toLocalStorageUrl` and `priorConsultations`; `videoClock` test written
    after code). `demo:record` 8 runs (7 ok; run 5 failed on stale dashboard,
    fixed with one reload). Final: consulta-completa 176.6 s, paciente 180.9 s,
    medico 144.6 s, 1280x720. DB: appointment completed, 1 record, 1
    prescription + PDF; 2 prior visits intact. Parent checked `t4-final-171.jpg`
    (receta PDF rendered).
  - Teardown: supabase stop, docker desktop stop, wsl --shutdown; parent
    confirmed 0 heavy processes.
  - Review: medium, `slice_budget_reached` (437 lines); consent granted;
    reliability lens approved and acknowledged (lineage
    `review-bd252d77112cb8cc`). Boundary → `201742c`.
  - Non-blocking follow-ups: WARNING `demo/seed-local.mjs:176-189` prior
    records cleanup; SUGGESTION `demo/compose.mjs:124-132` cuts untested. App
    cosmetic (out of scope): Historia clínica shows raw ISO dates and English
    visit types ("CHECKUP") in `DoctorDashboard.tsx`.

- T5 done (delegated direct). Commit `9360367` feat(demo): record the
  patient's phone experience as a vertical video. New `demo/record-mobile.mjs`,
  `demo/compose-mobile.mjs`, `demo/lib/phone-layout.mjs`,
  `demo/lib/phone-stage.mjs` (+ guard test); `npm run demo:record:mobile`.
  - Mobile emulation 412x839, scaled 1.49x into a phone mockup on a branded
    1080x1920 stage; captions emitted as cues and rendered below the phone.
    PDF shown through a same-origin viewer page (`/__demo/receta`) because
    Chromium's mobile PDF viewer lays out a 980 px desktop page.
  - Evidence (2026-10-06): `demo:test` 17/17 (parent re-ran: 17/17; RED
    first). `demo:record:mobile` ×3 exit 0; final 132.8 s 1080x1920.
    `demo:record` re-run: consulta-completa 178.0 s. Parent checked
    `t5-51.jpg` (phone mockup, call, caption below).
  - Teardown: supabase stop, docker desktop stop, wsl --shutdown; parent
    confirmed 0 heavy processes.
  - Review: medium, `slice_budget_reached` (844 lines); consent granted;
    reliability lens approved and acknowledged (lineage
    `review-a9093fa86c269614`). Boundary → `9360367`.
  - Non-blocking follow-ups: WARNING `demo/compose-mobile.mjs:35-39` call cut
    overlap; WARNING `demo/compose-mobile.mjs:44` recetas overlap; WARNING
    `demo/record-mobile.mjs:153-161` markReached can hang; SUGGESTION
    `demo/compose-mobile.mjs:142` filter-script flag; SUGGESTION segments
    untested (`demo/compose-mobile.mjs:30-52`).
  - App issues found (out of scope): VideoRoom header card overflows at phone
    width ("DURA 00:"); self-view overlaps "negociando códecs" while waiting;
    after 21:00 local (UTC-3) the booking modal shows next-day slots (UTC/local
    date mix), hiding "Atención inmediata" — record before 21:00.

## Next step
- All tasks done. Optional (app changes, separate features): "Dra." title,
  mobile VideoRoom header overflow, booking UTC/local date bug, Historia
  clínica date/type formatting. Push/PR is the user's decision. Memory is tight (7.5 GB RAM): start local Supabase and LiveKit
  only when recording; tear down after, including Docker/WSL.
