import { test } from "node:test";
import assert from "node:assert/strict";
import { assertValidMedia, MediaValidationError, MAX_IMAGE_BYTES } from "../../storage/media.js";

test("accepts allowlisted image types within size limits (§57)", () => {
  const { extension } = assertValidMedia("image/webp", 1024);
  assert.equal(extension, "webp");
});

test("rejects a MIME type outside the allowlist, including video (Etapa 5: vídeo é link, nunca upload — §50)", () => {
  assert.throws(() => assertValidMedia("application/octet-stream", 1024), MediaValidationError);
  assert.throws(() => assertValidMedia("image/svg+xml", 1024), MediaValidationError);
  assert.throws(() => assertValidMedia("video/mp4", 1024), MediaValidationError);
  assert.throws(() => assertValidMedia("video/webm", 1024), MediaValidationError);
});

test("rejects images over the size limit", () => {
  assert.throws(() => assertValidMedia("image/webp", MAX_IMAGE_BYTES + 1), MediaValidationError);
});

test("rejects a zero or negative byte length", () => {
  assert.throws(() => assertValidMedia("image/webp", 0), MediaValidationError);
  assert.throws(() => assertValidMedia("image/webp", -5), MediaValidationError);
});
