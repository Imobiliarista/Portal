// core/auth.js
//
// Password hashing/verification only (§27). Login orchestration — resolving
// the private index, loading the auth object, issuing the session — is
// wired up in Etapa 4 once storage/indexes has real login lookups; this
// module stays a pure, dependency-free primitive so it is trivially
// testable and reusable from both the Worker and rebuild scripts.
//
// Uses PBKDF2-SHA256 via Web Crypto (available in Workers and modern
// Node), never SHA-256 alone (§27 explicitly forbids "SHA-256 puro").

const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const KEY_LENGTH_BITS = 256;
const ALGORITHM_TAG = "pbkdf2-sha256";

function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveHash(password, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    KEY_LENGTH_BITS,
  );
  return new Uint8Array(derived);
}

/**
 * Hashes a plaintext password into a self-describing, storable string:
 * "pbkdf2-sha256$<iterations>$<saltB64>$<hashB64>"
 */
export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Senha deve ter ao menos 8 caracteres.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveHash(password, salt, PBKDF2_ITERATIONS);
  return [
    ALGORITHM_TAG,
    PBKDF2_ITERATIONS,
    toBase64(salt),
    toBase64(hash),
  ].join("$");
}

/** Verifies a plaintext password against a `hashPassword` output. */
export async function verifyPassword(password, stored) {
  if (typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== ALGORITHM_TAG) return false;

  const [, iterationsRaw, saltB64, hashB64] = parts;
  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;

  const salt = fromBase64(saltB64);
  const expected = fromBase64(hashB64);
  const actual = await deriveHash(password, salt, iterations);

  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
