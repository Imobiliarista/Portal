// core/session.js
//
// Stateless, HMAC-signed session tokens (§28). Claims: userId, brokerId,
// slug, role, authVersion, iat, exp. No server-side session store — the
// signature is what makes the cookie trustworthy, so R2/D1 lookups are
// never required just to check "is this request logged in".
//
// Functions here are pure and take `secret` explicitly rather than reaching
// into `env` themselves, so they stay unit-testable outside the Worker
// runtime and core never depends on how the secret is provisioned.

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(padded + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
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

/**
 * Creates a compact signed token: base64url(payload) + "." + base64url(signature).
 * `claims` must already contain userId, brokerId, slug, role, authVersion.
 */
export async function createSessionToken(claims, secret, { ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    ...claims,
    iat: now,
    exp: now + ttlSeconds,
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, payloadBytes);
  return `${toBase64Url(payloadBytes)}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Verifies and decodes a session token. Returns claims or `null` if the
 * signature is invalid, malformed, or the token has expired.
 */
export async function verifySessionToken(token, secret) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) return null;

  let payloadBytes;
  let signatureBytes;
  try {
    payloadBytes = fromBase64Url(payloadPart);
    signatureBytes = fromBase64Url(signaturePart);
  } catch {
    return null;
  }

  const key = await importHmacKey(secret);
  const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, payloadBytes);
  if (!valid) return null;

  let claims;
  try {
    claims = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp < now) return null;

  return claims;
}

const SESSION_COOKIE_NAME = "imob_session";

/** Builds a Set-Cookie header value per §28 (HttpOnly, Secure, SameSite, expiração). */
export function buildSessionCookie(token, { maxAgeSeconds = DEFAULT_TTL_SECONDS } = {}) {
  const attrs = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
  ];
  return attrs.join("; ");
}

/** Builds a Set-Cookie header value that immediately expires the session cookie. */
export function buildLogoutCookie() {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/** Parses a `Cookie` request header into a plain key/value map. */
export function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const pair of cookieHeader.split(";")) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function getSessionTokenFromRequest(request) {
  const cookies = parseCookies(request.headers.get("Cookie"));
  return cookies[SESSION_COOKIE_NAME] ?? null;
}

export { SESSION_COOKIE_NAME };
