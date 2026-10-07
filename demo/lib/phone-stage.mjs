// HTML for the still layers of the vertical phone video, rendered to PNG by
// demo/compose-mobile.mjs: the branded background, the phone frame with the
// Medinex header (transparent where the screen goes) and one image per caption.
// Colors follow the desktop compose titles: dark navy with teal accents.

const FONT = "'Segoe UI', 'Plus Jakarta Sans', system-ui, sans-serif";

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const page = (width, height, body, css) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: transparent; font-family: ${FONT}; }
  ${css}
</style></head><body>${body}</body></html>`;

/** Opaque branded background (sits under the phone screen). */
export function backgroundHtml({ canvas }) {
  return page(
    canvas.width,
    canvas.height,
    '<div class="bg"></div>',
    `.bg { position: absolute; inset: 0;
      background:
        radial-gradient(circle at 12% 8%, rgba(20, 184, 166, 0.30), transparent 38%),
        radial-gradient(circle at 92% 62%, rgba(14, 165, 233, 0.20), transparent 40%),
        radial-gradient(circle at 20% 96%, rgba(52, 211, 153, 0.18), transparent 36%),
        linear-gradient(170deg, #071226 0%, #020617 55%, #041a24 100%); }`
  );
}

/** Header (logo, name, tagline) and phone bezel; the screen area stays transparent. */
export function frameHtml({ canvas, header, phone, screen }, logoDataUrl) {
  const bezel = screen.x - phone.x;
  return page(
    canvas.width,
    canvas.height,
    `<header>
       <div class="logo"><img src="${logoDataUrl}" alt=""></div>
       <div><div class="name">Medi<span>nex</span></div><div class="tag">Tu médico en casa, al instante.</div></div>
     </header>
     <div class="phone"></div><div class="side a"></div><div class="side b"></div><div class="cam"></div>`,
    `header { position: absolute; left: 0; right: 0; top: ${header.y}px; height: ${header.height}px;
        display: flex; align-items: center; justify-content: center; gap: 34px; }
      .logo { width: 150px; height: 150px; border-radius: 36px; background: #fff; overflow: hidden;
        box-shadow: 0 0 0 3px rgba(45, 212, 191, 0.55), 0 18px 50px rgba(0, 0, 0, 0.45); }
      .logo img { width: 100%; height: 100%; object-fit: contain; }
      .name { font-size: 88px; font-weight: 800; letter-spacing: -1px; color: #f8fafc; line-height: 1; }
      .name span { color: #2dd4bf; }
      .tag { margin-top: 14px; font-size: 31px; font-weight: 600; color: #5eead4; }
      .phone { position: absolute; left: ${phone.x}px; top: ${phone.y}px; width: ${phone.width}px; height: ${phone.height}px;
        box-sizing: border-box; border: ${bezel}px solid #0b1120; border-radius: ${phone.radius}px;
        box-shadow: 0 0 0 2px #334155, 0 0 70px rgba(45, 212, 191, 0.28), 0 40px 90px rgba(0, 0, 0, 0.6); }
      .side { position: absolute; left: ${phone.x + phone.width}px; width: 6px; border-radius: 0 4px 4px 0; background: #334155; }
      .side.a { top: ${phone.y + 220}px; height: 110px; }
      .side.b { top: ${phone.y + 360}px; height: 70px; }
      .cam { position: absolute; left: ${canvas.width / 2 - 9}px; top: ${screen.y + 10}px; width: 18px; height: 18px;
        border-radius: 50%; background: #020617; box-shadow: 0 0 0 2px rgba(51, 65, 85, 0.8); }`
  );
}

/** One caption, centered in the band below the phone. */
export function captionHtml({ canvas, captions }, text, roleLabel = 'Paciente') {
  return page(
    canvas.width,
    captions.height,
    `<div class="wrap"><div class="cap"><span class="role">${escapeHtml(roleLabel)}</span><span class="text">${escapeHtml(text)}</span></div></div>`,
    `.wrap { position: absolute; inset: 0; display: flex; align-items: flex-start; justify-content: center; padding-top: 6px; }
      .cap { max-width: 940px; box-sizing: border-box; padding: 26px 40px 30px; border-radius: 32px; text-align: center;
        background: rgba(2, 6, 23, 0.88); border: 2px solid rgba(45, 212, 191, 0.6);
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45); }
      .role { display: inline-block; margin-bottom: 12px; padding: 6px 16px; border-radius: 999px; background: #2dd4bf;
        color: #022c22; font-size: 22px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; }
      .text { display: block; color: #f8fafc; font-size: 44px; font-weight: 600; line-height: 1.25; }`
  );
}
