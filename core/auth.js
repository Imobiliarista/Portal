// core/auth.js
//
// Password-verifier primitives for the browser-side PBKDF2 flow (§27
// hotfix). The Worker itself never runs PBKDF2 anymore — 600k iterations
// routinely takes >100ms, far past Workers Free's 10ms CPU budget per
// request (the original bug this file fixes: the old single-call
// hashPassword/verifyPassword ran that derivation server-side on every
// login). Only two cheap operations happen here, both safe inside a Worker
// request:
//   - salt handling: a fresh random salt for a new credential, or a
//     deterministic "dummy" salt (one HMAC) for the anti-enumeration path
//     of the salt-lookup endpoint.
//   - applying PASSWORD_PEPPER (HMAC-SHA256) to the PBKDF2 result the
//     browser already computed, and comparing it to the stored verifier.
//
// The actual PBKDF2 derivation (600k iterations, Web Crypto) runs in the
// browser (frontend/painel/auth.js) — or, for admin/script provisioning
// with no browser involved, via `deriveClientPbkdf2` below, which must
// only ever be called from a script/CLI context, never from inside a
// Worker request handler.

const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const PBKDF2_KEY_LENGTH_BITS = 256;
const SALT_ALGORITHM_TAG = "pbkdf2-sha256";
const VERIFIER_ALGORITHM_TAG = "hmac-sha256";

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

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

// Both HMAC uses below (dummy-salt derivation and pepper-over-PBKDF2-result)
// share PASSWORD_PEPPER as their key. That's safe: the two message spaces
// never collide (a literal "dummy-salt:" text prefix vs. 32 raw PBKDF2
// output bytes), so there's no cross-purpose forgery risk — but keep this
// in mind before adding a third HMAC use of the same secret.
async function hmac(secret, messageBytes) {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, messageBytes);
  return new Uint8Array(signature);
}

/** Generates a fresh random PBKDF2 salt for a new credential record. */
export function generateSalt() {
  return toBase64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/**
 * Deterministic salt for an identifier with no credential record — the
 * salt-lookup endpoint's half of the "resposta genérica" requirement
 * (§26): stable across repeated calls for the same identifier (unlike a
 * fresh random salt each time), so probing an unknown CPF can't be told
 * apart from a real one just by calling twice and comparing.
 */
export async function deriveDummySalt(identifierHash, pepper) {
  const signature = await hmac(pepper, new TextEncoder().encode(`dummy-salt:${identifierHash}`));
  return toBase64(signature.slice(0, SALT_BYTES));
}

/** Shapes the response the /api/auth/salt endpoint returns, real or dummy alike. */
export function buildSaltPayload(saltB64, iterations = PBKDF2_ITERATIONS) {
  return { algorithm: SALT_ALGORITHM_TAG, iterations, salt: saltB64 };
}

/**
 * Applies PASSWORD_PEPPER to the browser's PBKDF2 result and returns a
 * self-describing, storable verifier string. Never the PBKDF2 output
 * itself, never the password (§27/§79) — only this HMAC survives to
 * `auth/{userId}.json`.
 */
export async function hashPbkdf2Result(pbkdf2ResultB64, pepper) {
  const signature = await hmac(pepper, fromBase64(pbkdf2ResultB64));
  return `${VERIFIER_ALGORITHM_TAG}$${toBase64(signature)}`;
}

/** Verifies a browser-submitted PBKDF2 result against a stored verifier. */
export async function verifyPbkdf2Result(pbkdf2ResultB64, pepper, stored) {
  if (typeof stored !== "string" || typeof pbkdf2ResultB64 !== "string") return false;
  const [tag, verifierB64] = stored.split("$");
  if (tag !== VERIFIER_ALGORITHM_TAG || !verifierB64) return false;

  try {
    const expected = fromBase64(verifierB64);
    const actual = await hmac(pepper, fromBase64(pbkdf2ResultB64));
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * Runs the full client-side derivation locally — for admin/script
 * provisioning ONLY (`business/auth.js#setAuthPassword`, rebuild/seed
 * scripts). Never call this from a Worker request handler: 600k PBKDF2
 * iterations is exactly the CPU-budget problem this file exists to avoid.
 */
export async function deriveClientPbkdf2(password, saltB64, iterations = PBKDF2_ITERATIONS) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Senha deve ter ao menos 8 caracteres.");
  }
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromBase64(saltB64), iterations, hash: "SHA-256" },
    keyMaterial,
    PBKDF2_KEY_LENGTH_BITS,
  );
  return toBase64(new Uint8Array(derived));
}

export { PBKDF2_ITERATIONS, SALT_BYTES };
