// Geometry and caption timing for the vertical (9:16) phone video. Pure
// functions, so the compose step stays testable without ffmpeg.

const CANVAS = { width: 1080, height: 1920 };
const HEADER = { y: 70, height: 190 }; // Medinex logo and tagline
const GAP = 30; // between the header and the phone
const SCREEN_HEIGHT = 1250;
const BEZEL = 16;
const CAPTION_GAP = 40; // between the phone and the captions

// Multiple of 4: the screen is centered, so its offset (canvas - width) / 2
// must stay even for yuv420p as well.
const roundTo4 = (v) => Math.round(v / 4) * 4;

/**
 * Where the recorded phone screen, its bezel, the header and the captions
 * go on the 1080x1920 canvas. The screen keeps the viewport's aspect ratio.
 */
export function phoneLayout(viewport) {
  const height = SCREEN_HEIGHT;
  const width = roundTo4((height * viewport.width) / viewport.height);
  const phone = {
    x: (CANVAS.width - width) / 2 - BEZEL,
    y: HEADER.y + HEADER.height + GAP,
    width: width + 2 * BEZEL,
    height: height + 2 * BEZEL,
    radius: 64,
  };
  const screen = { x: phone.x + BEZEL, y: phone.y + BEZEL, width, height, radius: phone.radius - BEZEL };
  const captionsY = phone.y + phone.height + CAPTION_GAP;
  return {
    canvas: { ...CANVAS },
    header: { ...HEADER },
    phone,
    screen,
    captions: { y: captionsY, height: Math.min(260, CANVAS.height - captionsY - 40) },
  };
}

/**
 * Maps timed cues ({ at, text }, recording clock, ms) onto the output of a
 * cut made of `segments` ({ start, end }, same clock) played back to back.
 * Each caption lasts until the next cue or the end of its segment; the cue
 * already showing when a segment starts carries into it, and a caption that
 * continues across a cut becomes one entry. Returns { text, from, to } in
 * output milliseconds.
 */
export function captionTrack(cues, segments) {
  const sorted = [...cues].sort((a, b) => a.at - b.at);
  const track = [];
  let offset = 0;
  for (const { start, end } of segments) {
    const current = sorted.filter((c) => c.at <= start).at(-1);
    const points = [
      ...(current ? [{ text: current.text, at: start }] : []),
      ...sorted.filter((c) => c.at > start && c.at < end),
    ];
    points.forEach((point, i) => {
      const from = offset + point.at - start;
      const to = offset + (points[i + 1]?.at ?? end) - start;
      if (to <= from) return;
      const last = track.at(-1);
      if (last && last.text === point.text && last.to === from) last.to = to;
      else track.push({ text: point.text, from, to });
    });
    offset += end - start;
  }
  return track;
}
