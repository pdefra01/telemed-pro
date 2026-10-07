// On-screen captions and click highlights for the demo recordings.
// Injected into the page by Playwright only: the app source is untouched.

// Runs inside the page on every document load. The current caption lives in
// sessionStorage so it survives the full reload the app does after booking.
// With the overlay off (phone recordings) only the tap indicator is
// installed; the compose step draws the captions below the phone instead.
function overlayScript({ roleLabel, overlay, touch }) {
  const KEY = '__demoCaption';
  const STYLE = `
    #__demo-caption { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%);
      z-index: 2147483647; pointer-events: none; max-width: 86vw; display: flex; align-items: center;
      gap: 14px; padding: 14px 26px; border-radius: 18px; background: rgba(2, 6, 23, 0.86);
      border: 1px solid rgba(16, 185, 129, 0.55); box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
      font: 600 22px/1.35 'Segoe UI', system-ui, sans-serif; color: #f8fafc; transition: opacity .35s; }
    #__demo-caption[data-empty="true"] { opacity: 0; }
    #__demo-caption[data-pos="top"] { top: 28px; bottom: auto; }
    #__demo-caption .tag { flex: none; font-size: 13px; letter-spacing: .14em; text-transform: uppercase;
      color: #022c22; background: #34d399; padding: 5px 10px; border-radius: 999px; }
    .__demo-click { position: fixed; z-index: 2147483646; pointer-events: none; width: 44px; height: 44px;
      margin: -22px 0 0 -22px; border-radius: 50%; border: 3px solid #34d399;
      background: rgba(52, 211, 153, 0.25); animation: __demo-ripple .7s ease-out forwards; }
    @keyframes __demo-ripple { from { transform: scale(.4); opacity: 1; } to { transform: scale(1.6); opacity: 0; } }
    .__demo-click.touch { width: 46px; height: 46px; margin: -23px 0 0 -23px; border: 2px solid rgba(255, 255, 255, 0.9);
      background: rgba(100, 116, 139, 0.55); box-shadow: 0 0 0 4px rgba(15, 23, 42, 0.18);
      animation: __demo-touch .65s ease-out forwards; }
    @keyframes __demo-touch { 0% { transform: scale(.7); opacity: .95; } 45% { transform: scale(1); opacity: .9; }
      100% { transform: scale(1.25); opacity: 0; } }
  `;

  function ensureStyle() {
    if (document.getElementById('__demo-style')) return;
    const style = document.createElement('style');
    style.id = '__demo-style';
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  function ensure() {
    if (!document.body) return null;
    ensureStyle();
    let box = document.getElementById('__demo-caption');
    if (!box) {
      box = document.createElement('div');
      box.id = '__demo-caption';
      box.innerHTML = '<span class="tag"></span><span class="text"></span>';
      box.querySelector('.tag').textContent = roleLabel;
      document.body.appendChild(box);
    }
    return box;
  }

  function render(text, position) {
    const box = ensure();
    if (!box) return;
    box.querySelector('.text').textContent = text || '';
    box.dataset.empty = text ? 'false' : 'true';
    box.dataset.pos = position === 'top' ? 'top' : 'bottom';
  }

  function saved() {
    try {
      return [sessionStorage.getItem(KEY) || '', sessionStorage.getItem(`${KEY}Pos`) || 'bottom'];
    } catch {
      return ['', 'bottom'];
    }
  }

  window.__demoCaption = (text, position) => {
    try {
      sessionStorage.setItem(KEY, text || '');
      sessionStorage.setItem(`${KEY}Pos`, position || 'bottom');
    } catch {
      /* storage unavailable: caption still renders for this document */
    }
    render(text, position);
  };

  const restore = () => {
    if (!overlay) return;
    render(...saved());
    // React may replace body children on mount; keep the overlay attached.
    new MutationObserver(() => {
      if (!document.getElementById('__demo-caption')) render(...saved());
    }).observe(document.body, { childList: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restore);
  else restore();

  window.addEventListener(
    'pointerdown',
    (event) => {
      ensureStyle();
      const dot = document.createElement('div');
      dot.className = touch ? '__demo-click touch' : '__demo-click';
      dot.style.left = `${event.clientX}px`;
      dot.style.top = `${event.clientY}px`;
      document.body.appendChild(dot);
      setTimeout(() => dot.remove(), 800);
    },
    true
  );
}

// Contexts whose captions are logged as timed cues instead of drawn in the page.
const cueLogs = new WeakMap();

/**
 * Installs the overlay on every page the context opens. With
 * { overlay: false } caption() logs { at, text } cues instead (read them with
 * captionCues) for the compose step; { touch: true } shows a finger-tap
 * indicator instead of the click ripple.
 */
export async function installCaptions(context, roleLabel, { overlay = true, touch = false } = {}) {
  if (!overlay) cueLogs.set(context, []);
  await context.addInitScript(overlayScript, { roleLabel, overlay, touch });
}

/** The cues logged for a context installed with { overlay: false }. */
export function captionCues(context) {
  return cueLogs.get(context) ?? [];
}

// Long enough to read a one-line caption on video without pausing it.
export const READ_MS = 3800;

/**
 * Shows a caption and holds it long enough to be read on video. Pass
 * { position: 'top' } when the bottom of the screen holds the action shown.
 */
export async function caption(page, text, holdMs = READ_MS, { position = 'bottom' } = {}) {
  const cues = cueLogs.get(page.context());
  if (cues) cues.push({ at: Date.now(), text });
  else await page.evaluate(([t, pos]) => window.__demoCaption?.(t, pos), [text, position]);
  if (holdMs > 0) await page.waitForTimeout(holdMs);
}

/**
 * Same as caption(), for a page that may be navigating on its own (e.g. the
 * patient's room when the doctor ends the call). If the document is replaced
 * mid-call, retry once on the new one; a caption never fails the recording.
 */
export async function captionSafely(page, text, holdMs = 0) {
  try {
    await caption(page, text, 0);
  } catch {
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await caption(page, text, 0).catch((err) => console.warn(`[captions] skipped "${text}": ${err.message}`));
  }
  if (holdMs > 0) await page.waitForTimeout(holdMs);
}
