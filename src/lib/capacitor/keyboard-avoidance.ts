/**
 * Robust on-screen-keyboard avoidance for the native iOS webview (and mobile
 * web). Capacitor's keyboard events alone were insufficient — on list/card
 * screens like Passwords the focused field stayed under the keyboard because
 * the layout viewport (100vh) doesn't shrink when iOS shows the keyboard, so
 * the browser thinks a field in the lower half is already "visible" and won't
 * scroll it.
 *
 * Primary signal here is `window.visualViewport`, which reports the ACTUAL
 * visible area. From it we derive the keyboard overlap, publish CSS vars
 * (`--keyboard-height`, `--visual-viewport-height`) so scroll containers can
 * reserve room, and manually scroll the focused field above the keyboard —
 * retried across the keyboard animation because iOS reports dimensions late.
 *
 * Capacitor keyboard events (wired in native-bridge.ts) call into here as an
 * extra trigger; the visualViewport path stays authoritative when present.
 */

// Ignore small viewport changes (URL bar collapse, etc.) so we only react to a
// real keyboard.
const KB_THRESHOLD_PX = 80;

let cleanupFns: Array<() => void> = [];

function isEditable(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return (el as HTMLElement).isContentEditable === true;
}

/** Nearest scrollable ancestor, falling back to the document scroller. */
function getScrollParent(el: HTMLElement): HTMLElement {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    const oy = style.overflowY;
    if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement;
}

/** How many px of the layout viewport the keyboard currently covers. */
function readKeyboardHeight(): number {
  const vv = window.visualViewport;
  if (!vv) return 0;
  const overlap = window.innerHeight - vv.height - vv.offsetTop;
  return overlap > KB_THRESHOLD_PX ? Math.round(overlap) : 0;
}

/** Publish viewport-derived CSS vars + the keyboard-open marker class. */
export function applyViewportVars(): void {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  const vv = window.visualViewport;
  const kb = readKeyboardHeight();
  root.style.setProperty("--keyboard-height", `${kb}px`);
  if (vv) {
    root.style.setProperty("--visual-viewport-height", `${Math.round(vv.height)}px`);
  }
  root.classList.toggle("keyboard-open", kb > 0);
}

/** Scroll the focused editable above the keyboard using visualViewport math. */
function scrollFocusedIntoView(): void {
  const el = document.activeElement as HTMLElement | null;
  if (!isEditable(el)) return;
  const vv = window.visualViewport;
  const visibleTop = vv ? vv.offsetTop : 0;
  const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const bottomMargin = 24;
  // Guard the top against sticky headers (~56px tall) so we don't tuck the
  // field under the header when correcting an upward overshoot.
  const topGuard = visibleTop + 64;

  // Prefer scrolling a whole "keep visible" wrapper (e.g. the Passwords
  // add-login form) above the keyboard so the field AND its primary action
  // (Add button) are shown together; fall back to the focused element itself.
  const wrapper =
    (el.closest("[data-keyboard-keep-visible]") as HTMLElement | null) ?? el;
  const wrapRect = wrapper.getBoundingClientRect();
  const inputRect = el.getBoundingClientRect();

  // Positive delta scrolls content up (rects move up by `delta`).
  let delta = 0;
  if (wrapRect.bottom > visibleBottom - bottomMargin) {
    delta = wrapRect.bottom - (visibleBottom - bottomMargin);
  } else if (wrapRect.top < topGuard) {
    delta = wrapRect.top - topGuard;
  }

  // Never let showing the wrapper hide the focused field itself: a tall wrapper
  // takes a back seat to keeping the active input within view.
  if (inputRect.top - delta < topGuard) {
    delta = inputRect.top - topGuard;
  }
  if (inputRect.bottom - delta > visibleBottom - bottomMargin) {
    delta = inputRect.bottom - (visibleBottom - bottomMargin);
  }

  if (Math.abs(delta) < 1) return;
  getScrollParent(el).scrollBy({ top: delta, behavior: "smooth" });
}

/**
 * Re-apply vars + scroll across the keyboard animation. iOS fires events and
 * settles dimensions over a few hundred ms, so we retry at intervals.
 */
export function nudgeScrollToFocused(): void {
  [0, 80, 200, 400].forEach((d) =>
    setTimeout(() => {
      applyViewportVars();
      scrollFocusedIntoView();
    }, d),
  );
}

export function initKeyboardAvoidance(): void {
  if (typeof window === "undefined" || cleanupFns.length) return;

  const vv = window.visualViewport;
  if (vv) {
    const onViewport = () => {
      applyViewportVars();
      scrollFocusedIntoView();
    };
    vv.addEventListener("resize", onViewport);
    vv.addEventListener("scroll", onViewport);
    cleanupFns.push(() => {
      vv.removeEventListener("resize", onViewport);
      vv.removeEventListener("scroll", onViewport);
    });
  }

  const onFocusIn = (e: FocusEvent) => {
    if (isEditable(e.target as Element)) nudgeScrollToFocused();
  };
  document.addEventListener("focusin", onFocusIn);
  cleanupFns.push(() => document.removeEventListener("focusin", onFocusIn));

  applyViewportVars();
}

export function teardownKeyboardAvoidance(): void {
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
}
