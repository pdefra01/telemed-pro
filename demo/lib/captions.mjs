// On-screen captions and click highlights for the demo recordings.
// Injected into the page by Playwright only: the app source is untouched.

// Runs inside the page on every document load. The current caption lives in
// sessionStorage so it survives the full reload the app does after booking.
function overlayScript({ roleLabel }) {
  const KEY = '__demoCaption';
  const STYLE = `
    #__demo-caption { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%);
      z-index: 2147483647; pointer-events: none; max-width: 86vw; display: flex; align-items: center;
      gap: 14px; padding: 14px 26px; border-radius: 18px; background: rgba(2, 6, 23, 0.86);
      border: 1px solid rgba(16, 185, 129, 0.55); box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
      font: 600 22px/1.35 'Segoe UI', system-ui, sans-serif; color: #f8fafc; transition: opacity .35s; }
    #__demo-caption[data-empty="true"] { opacity: 0; }
    #__demo-caption .tag { flex: none; font-size: 13px; letter-spacing: .14em; text-transform: uppercase;
      color: #022c22; background: #34d399; padding: 5px 10px; border-radius: 999px; }
    .__demo-click { position: fixed; z-index: 2147483646; pointer-events: none; width: 44px; height: 44px;
      margin: -22px 0 0 -22px; border-radius: 50%; border: 3px solid #34d399;
      background: rgba(52, 211, 153, 0.25); animation: __demo-ripple .7s ease-out forwards; }
    @keyframes __demo-ripple { from { transform: scale(.4); opacity: 1; } to { transform: scale(1.6); opacity: 0; } }
  `;

  function ensure() {
    if (!document.body) return null;
    let box = document.getElementById('__demo-caption');
    if (!box) {
      const style = document.createElement('style');
      style.textContent = STYLE;
      document.head.appendChild(style);
      box = document.createElement('div');
      box.id = '__demo-caption';
      box.innerHTML = '<span class="tag"></span><span class="text"></span>';
      box.querySelector('.tag').textContent = roleLabel;
      document.body.appendChild(box);
    }
    return box;
  }

  function render(text) {
    const box = ensure();
    if (!box) return;
    box.querySelector('.text').textContent = text || '';
    box.dataset.empty = text ? 'false' : 'true';
  }

  window.__demoCaption = (text) => {
    try {
      sessionStorage.setItem(KEY, text || '');
    } catch {
      /* storage unavailable: caption still renders for this document */
    }
    render(text);
  };

  const restore = () => {
    let saved = '';
    try {
      saved = sessionStorage.getItem(KEY) || '';
    } catch {
      saved = '';
    }
    render(saved);
    // React may replace body children on mount; keep the overlay attached.
    new MutationObserver(() => {
      if (!document.getElementById('__demo-caption')) {
        let current = '';
        try {
          current = sessionStorage.getItem(KEY) || '';
        } catch {
          current = '';
        }
        render(current);
      }
    }).observe(document.body, { childList: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restore);
  else restore();

  window.addEventListener(
    'pointerdown',
    (event) => {
      const dot = document.createElement('div');
      dot.className = '__demo-click';
      dot.style.left = `${event.clientX}px`;
      dot.style.top = `${event.clientY}px`;
      document.body.appendChild(dot);
      setTimeout(() => dot.remove(), 800);
    },
    true
  );
}

/** Installs the overlay on every page the context opens. */
export async function installCaptions(context, roleLabel) {
  await context.addInitScript(overlayScript, { roleLabel });
}

/** Shows a caption and holds it long enough to be read on video. */
export async function caption(page, text, holdMs = 1800) {
  await page.evaluate((t) => window.__demoCaption?.(t), text);
  if (holdMs > 0) await page.waitForTimeout(holdMs);
}
