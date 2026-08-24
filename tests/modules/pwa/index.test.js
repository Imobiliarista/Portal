import { test } from "node:test";
import assert from "node:assert/strict";
import { registerServiceWorker } from "../../../modules/pwa/index.js";

function fakeDocument() {
  const appended = [];
  return {
    head: {
      appended,
      append(el) {
        appended.push(el);
      },
    },
    createElement: () => ({}),
  };
}

test("registerServiceWorker registers the generated service worker and links the manifest", async () => {
  let registeredUrl;
  const nav = { serviceWorker: { register: async (url) => ((registeredUrl = url), { scope: "/" }) } };
  const doc = fakeDocument();

  const result = await registerServiceWorker({ navigator: nav, document: doc });
  assert.equal(registeredUrl, "/service-worker.js");
  assert.deepEqual(result, { scope: "/" });
  assert.equal(doc.head.appended.length, 1);
  assert.equal(doc.head.appended[0].rel, "manifest");
  assert.equal(doc.head.appended[0].href, "/manifest.json");
});

test("registerServiceWorker returns null (never throws) when the browser has no serviceWorker support", async () => {
  const result = await registerServiceWorker({ navigator: {}, document: fakeDocument() });
  assert.equal(result, null);
});

test("registerServiceWorker returns null (never throws) when register() rejects — e.g. module removed", async () => {
  const nav = {
    serviceWorker: {
      register: async () => {
        throw new Error("404");
      },
    },
  };
  const result = await registerServiceWorker({ navigator: nav, document: fakeDocument() });
  assert.equal(result, null);
});

test("registerServiceWorker works with no document (still registers)", async () => {
  let registeredUrl;
  const nav = { serviceWorker: { register: async (url) => (registeredUrl = url) } };
  await registerServiceWorker({ navigator: nav });
  assert.equal(registeredUrl, "/service-worker.js");
});

test("registerServiceWorker honors custom URLs", async () => {
  let registeredUrl;
  const nav = { serviceWorker: { register: async (url) => (registeredUrl = url) } };
  const doc = fakeDocument();
  await registerServiceWorker({
    navigator: nav,
    document: doc,
    serviceWorkerUrl: "/custom-sw.js",
    manifestUrl: "/custom-manifest.json",
  });
  assert.equal(registeredUrl, "/custom-sw.js");
  assert.equal(doc.head.appended[0].href, "/custom-manifest.json");
});
