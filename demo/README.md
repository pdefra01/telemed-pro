# Demo videos

Records the sales demo against a **local** stack: the patient books an
immediate consultation, the doctor reviews her clinical history, attends her
by video call (writing and saving the notes while they talk), issues a
prescription, and the patient opens the prescription PDF from her dashboard.

Outputs (1280x720, H.264, no audio) in `demo/output/`:

| File | Content | Length |
|------|---------|--------|
| `paciente.mp4` | Patient browser, start to end | ~3 min |
| `medico.mp4` | Doctor browser, start to end | ~2.5 min |
| `consulta-completa.mp4` | Booking → clinical history → side-by-side call while the notes are written and saved → prescription → patient opens the PDF | ~3 min (170–190 s) |

`demo/output/` and `demo/.cache/` are git-ignored.

## Prerequisites

- Node dependencies installed (`npm install`), including Playwright Chromium
  (`npx playwright install chromium`). The patient runs the full Chromium in
  new headless mode (`channel: 'chromium'`), because the headless shell has no
  PDF viewer.
- Docker Desktop and the Supabase CLI (`npx supabase`).
- `ffmpeg` and `ffprobe` on `PATH`.
- LiveKit needs no install: `demo:livekit` downloads a pinned, checksum-verified
  `livekit-server` into `demo/.cache/livekit/`.

## Run

```sh
npx supabase start     # local stack (Docker)
npm run demo:media     # download stock clips, convert to fake-camera inputs (cached)
npm run demo:record    # seed, start LiveKit + server.js + Vite, record, compose
```

| Command | What it does |
|---------|--------------|
| `npm run demo:media` | Downloads the stock clips (first run) and converts them to `.y4m`/`.wav` |
| `npm run demo:seed` | Seeds the demo doctor and patient; replaces previous demo consultations with two earlier visits (clinical history) |
| `npm run demo:livekit` | Starts a local LiveKit server in dev mode (`ws://127.0.0.1:7880`) |
| `npm run demo:record` | Seeds, records both browsers, then composes the MP4s |
| `npm run demo:compose` | Re-composes the MP4s from the last raw recording |
| `npm run demo:test` | Guard and seed unit tests (no database needed) |

`demo:record` runs on its own: it seeds, starts LiveKit, `server.js` and Vite,
and stops them at the end, also on failure or Ctrl+C. Ports 3000 and 3001 must
be free. On failure, screenshots and logs land in `demo/output/logs/`.

## Timing

`compose.mjs` cuts the raw videos at wall-clock marks from
`demo/output/timeline.json`. Under load the recorder's video clock can drift a
few seconds over a take, so each role's marks are scaled by its video length
over the time until its context closed (`videoClock`). The blank first seconds
of the PDF viewer are skipped (`PDF_PAINT_MS`). The final length varies a few
seconds between runs.

## Use your own clips

The camera feeds are free Pexels stock footage until you supply your own:

```sh
DEMO_DOCTOR_CLIP=/path/doctor.mp4 DEMO_PATIENT_CLIP=/path/patient.mp4 npm run demo:media
```

- Any format ffmpeg reads. Landscape, person facing the camera, webcam framing.
- Ideally 16.5 s or longer: 16 s starting at 0.5 s are used, and Chrome loops them.
- They are center-cropped to 16:9 and scaled to 960x540. The stock doctor clip
  gets an extra crop; your clips do not.
- Changing a clip re-converts automatically (the cache is keyed on path, size
  and modification time). The converted files are
  `demo/.cache/{doctor,patient}.{y4m,wav}`.

## Safety

- Local only: every Supabase URL (API and database) must be `127.0.0.1`,
  `localhost` or `::1`, or the scripts refuse to run. The browsers abort any
  request to `supabase.co`, `supabase.in` or `railway.app`.
- The seed only writes demo data to the local database. It also adds what a
  fresh local stack lacks: the appointments INSERT policy, the private
  `prescriptions_pdfs` bucket and the patient's coverage window.
- The prescription URL stored by the local edge runtime is signed with the
  Docker-internal host `http://kong:8000`. The recorder rewrites it to the
  local API (`toLocalStorageUrl`, which refuses any other host) and opens it in
  the same tab, so the PDF is part of the recording.
- WhatsApp is not configured locally, so the doctor's browser receives a
  success response for `POST /api/prescriptions/:id/send-whatsapp`. Nothing is
  sent; the app and server code are unchanged.

## Memory tips

Recording runs Docker, Supabase, LiveKit, Vite and two headless Chromium
processes. On a machine with little RAM:

- Start Docker and Supabase only to record, and stop other containers.
- Tear down when done:

  ```sh
  npx supabase stop
  docker desktop stop
  wsl --shutdown        # Windows: frees the WSL VM memory
  ```
