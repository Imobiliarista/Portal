import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fetchJson,
  PublicDataNotFoundError,
  PublicDataHttpError,
  PublicDataNetworkError,
  PublicDataContractError,
  classifyPublicDataErrorReason,
} from "../../../frontend/shared/public-data-errors.js";

async function withFetch(fetchImpl, fn) {
  const previous = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = previous;
  }
}

test("classifyPublicDataErrorReason maps each error class to its render.js reason", () => {
  assert.equal(classifyPublicDataErrorReason(new PublicDataContractError("url", new Error())), "contract");
  assert.equal(classifyPublicDataErrorReason(new PublicDataHttpError("url", 500)), "http");
  assert.equal(classifyPublicDataErrorReason(new PublicDataNetworkError("url", new Error())), "network");
});

test("classifyPublicDataErrorReason defaults to network for anything unrecognized (never throws)", () => {
  assert.equal(classifyPublicDataErrorReason(new Error("plain")), "network");
  assert.equal(classifyPublicDataErrorReason(undefined), "network");
  assert.equal(classifyPublicDataErrorReason(new PublicDataNotFoundError("url")), "network");
});

test("fetchJson aborts and throws PublicDataNetworkError when the request exceeds timeoutMs", async () => {
  await withFetch(
    (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
    async () => {
      await assert.rejects(() => fetchJson("https://example/x.json", { timeoutMs: 10 }), PublicDataNetworkError);
    },
  );
});

test("fetchJson never rejects with anything other than one of the 4 typed errors", async () => {
  await withFetch(
    () => {
      throw "a non-Error thrown value"; // eslint-disable-line no-throw-literal
    },
    async () => {
      await assert.rejects(() => fetchJson("https://example/x.json"), PublicDataNetworkError);
    },
  );
});
