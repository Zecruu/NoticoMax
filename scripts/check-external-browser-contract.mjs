import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openExternalBrowserUrl } from "../src/lib/external-browser.ts";

const productionWrapper = await readFile(
  new URL("../src/lib/capacitor/auth-helpers.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(productionWrapper, /window\.location(?:\.href)?\s*=/);
assert.match(productionWrapper, /Browser\.open/);
assert.match(productionWrapper, /window\.open/);

const webCalls = [];
let webNativeCalls = 0;
const openedWindow = { opener: "original" };
const currentLocation = { href: "https://app.noticomax.com/assistant" };

const webOpened = await openExternalBrowserUrl("https://example.com/source", {
  native: false,
  openNative: async () => {
    webNativeCalls += 1;
  },
  openWindow: (...args) => {
    webCalls.push(args);
    return openedWindow;
  },
});

assert.equal(webOpened, true);
assert.equal(webNativeCalls, 0);
assert.deepEqual(webCalls, [["https://example.com/source", "_blank", "noopener,noreferrer"]]);
assert.equal(openedWindow.opener, null);
assert.equal(currentLocation.href, "https://app.noticomax.com/assistant");

const nativeCalls = [];
let nativeWindowCalls = 0;
const nativeOpened = await openExternalBrowserUrl("https://example.com/native", {
  native: true,
  openNative: async (url) => {
    nativeCalls.push(url);
  },
  openWindow: () => {
    nativeWindowCalls += 1;
    return null;
  },
});

assert.equal(nativeOpened, true);
assert.deepEqual(nativeCalls, ["https://example.com/native"]);
assert.equal(nativeWindowCalls, 0);

let invalidCalls = 0;
const invalidOpened = await openExternalBrowserUrl("javascript:alert(1)", {
  native: false,
  openNative: async () => {
    invalidCalls += 1;
  },
  openWindow: () => {
    invalidCalls += 1;
    return null;
  },
});

assert.equal(invalidOpened, false);
assert.equal(invalidCalls, 0);
console.log("external browser contract: ok");
