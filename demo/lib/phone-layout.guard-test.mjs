// Layout and caption-timing math for the vertical phone video.
// Run with `npm run demo:test`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captionTrack, phoneLayout } from './phone-layout.mjs';

const VIEWPORT = { width: 412, height: 839 };

test('phoneLayout centers a phone with the viewport aspect ratio on a 1080x1920 canvas', () => {
  const { canvas, screen, phone, captions, header } = phoneLayout(VIEWPORT);
  assert.deepEqual(canvas, { width: 1080, height: 1920 });
  // ffmpeg's yuv420p needs even sizes and offsets.
  for (const v of [screen.x, screen.y, screen.width, screen.height]) assert.equal(v % 2, 0, String(v));
  assert.ok(Math.abs(screen.width / screen.height - VIEWPORT.width / VIEWPORT.height) < 0.005, 'aspect ratio kept');
  assert.equal(phone.x * 2 + phone.width, canvas.width, 'phone centered');
  assert.equal(screen.x - phone.x, screen.y - phone.y, 'even bezel');
  // Header (logo) above the phone, captions below it, all inside the canvas.
  assert.ok(header.y + header.height <= phone.y);
  assert.ok(phone.y + phone.height <= captions.y);
  assert.ok(captions.y + captions.height <= canvas.height);
});

test('phoneLayout scales the screen up from the CSS viewport', () => {
  const { screen } = phoneLayout(VIEWPORT);
  assert.ok(screen.width > VIEWPORT.width * 1.3 && screen.width < VIEWPORT.width * 1.7, String(screen.width));
});

test('captionTrack maps cues onto the cut segments of the output', () => {
  const cues = [
    { at: 1_000, text: 'A' },
    { at: 5_000, text: 'B' },
    { at: 20_000, text: 'C' },
    { at: 31_000, text: 'D' },
  ];
  // Two segments of 10 s each: [2 s, 12 s] and [25 s, 35 s] of the recording.
  const segments = [
    { start: 2_000, end: 12_000 },
    { start: 25_000, end: 35_000 },
  ];
  assert.deepEqual(captionTrack(cues, segments), [
    // A was already showing when the first segment starts.
    { text: 'A', from: 0, to: 3_000 },
    { text: 'B', from: 3_000, to: 10_000 },
    // C started during the cut gap and is still the current caption.
    { text: 'C', from: 10_000, to: 16_000 },
    { text: 'D', from: 16_000, to: 20_000 },
  ]);
});

test('captionTrack merges a caption that spans a cut and skips cut-away cues', () => {
  const cues = [
    { at: 0, text: 'A' },
    { at: 4_000, text: 'gone' },
    { at: 6_000, text: 'B' },
  ];
  const segments = [
    { start: 0, end: 3_000 },
    { start: 7_000, end: 9_000 },
    { start: 9_500, end: 10_000 },
  ];
  assert.deepEqual(captionTrack(cues, segments), [
    { text: 'A', from: 0, to: 3_000 },
    { text: 'B', from: 3_000, to: 5_500 },
  ]);
});

test('captionTrack with no cues is empty', () => {
  assert.deepEqual(captionTrack([], [{ start: 0, end: 1000 }]), []);
});
