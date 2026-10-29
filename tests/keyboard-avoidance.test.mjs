import assert from "node:assert/strict";
import { test } from "node:test";
import { initKeyboardAvoidance, teardownKeyboardAvoidance, applyViewportVars, setNativeKeyboardHeight } from "../src/lib/capacitor/keyboard-avoidance.ts";

function setup(t) {
  const vars = new Map();
  const classes = new Set();
  const frames = new Map();
  let frameId = 0;
  const root = {
    style: { setProperty: (key, value) => vars.set(key, value), getPropertyValue: (key) => vars.get(key) ?? "", removeProperty: (key) => vars.delete(key) },
    classList: { toggle: (key, on) => on ? classes.add(key) : classes.delete(key), remove: (key) => classes.delete(key) },
  };
  const scroller = { parentElement: null, scrollHeight: 1200, clientHeight: 400, scrollTop: 0, scrollBy({ top, behavior }) { assert.equal(behavior, "instant"); this.scrollTop += top; } };
  const input = { tagName: "INPUT", type: "text", parentElement: scroller, closest: () => null, getBoundingClientRect: () => ({ top: 640 - scroller.scrollTop, bottom: 684 - scroller.scrollTop }) };
  const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
  const window = Object.assign(new EventTarget(), { innerHeight: 844, visualViewport: viewport });
  const document = Object.assign(new EventTarget(), { documentElement: root, activeElement: input, scrollingElement: scroller });
  const globals = {
    window,
    document,
    getComputedStyle: () => ({ overflowY: "auto" }),
    requestAnimationFrame: (callback) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  const descriptors = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const flush = () => { const work = [...frames.values()]; frames.clear(); work.forEach((callback) => callback()); };
  initKeyboardAvoidance();
  t.after(() => {
    teardownKeyboardAvoidance();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return { vars, classes, viewport, window, document, scroller, frames, flush };
}

test("Safari viewport shrink scrolls the active field above the keyboard", (t) => {
  const env = setup(t);
  env.viewport.height = 500;
  env.viewport.dispatchEvent(new Event("resize"));
  env.viewport.dispatchEvent(new Event("scroll"));
  assert.equal(env.frames.size, 1, "events share one layout update per frame");
  env.flush();
  assert.equal(env.vars.get("--visual-viewport-height"), "500px");
  assert.equal(env.vars.get("--keyboard-height"), "344px");
  assert.ok(env.classes.has("keyboard-open"));
  assert.equal(env.scroller.scrollTop, 208);
  env.viewport.height = 844;
  env.viewport.dispatchEvent(new Event("resize"));
  env.flush();
  assert.equal(env.vars.get("--visual-viewport-height"), "844px");
  assert.ok(!env.classes.has("keyboard-open"));
});

test("native body resizing is detected even when visualViewport stays full size", (t) => {
  const env = setup(t);
  setNativeKeyboardHeight(344);
  applyViewportVars();
  assert.equal(env.vars.get("--visual-viewport-height"), "500px");
  assert.ok(env.classes.has("keyboard-open"));
  env.viewport.height = 500;
  applyViewportVars();
  assert.equal(env.vars.get("--visual-viewport-height"), "500px", "keyboard is not subtracted twice");
  setNativeKeyboardHeight(0);
  env.viewport.height = 844;
  applyViewportVars();
  assert.ok(!env.classes.has("keyboard-open"));
});

test("browser chrome and pinch zoom do not hide navigation", (t) => {
  const env = setup(t);
  env.viewport.height = 790;
  applyViewportVars();
  assert.ok(!env.classes.has("keyboard-open"));
  env.viewport.height = 450;
  env.viewport.scale = 2;
  applyViewportVars();
  assert.ok(!env.classes.has("keyboard-open"));
});

test("a non-editable control does not count as a software keyboard", (t) => {
  const env = setup(t);
  env.document.activeElement.type = "checkbox";
  env.viewport.height = 500;
  applyViewportVars();
  assert.ok(!env.classes.has("keyboard-open"));
});

test("cleanup removes viewport state and pending animation callbacks", (t) => {
  const env = setup(t);
  env.viewport.dispatchEvent(new Event("resize"));
  teardownKeyboardAvoidance();
  assert.equal(env.frames.size, 0);
  assert.equal(env.vars.size, 0);
  env.viewport.dispatchEvent(new Event("resize"));
  assert.equal(env.frames.size, 0);
});
