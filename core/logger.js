// core/logger.js
//
// Structured logging with mandatory redaction of sensitive fields.
// §79 — never log: senha, passwordHash, cookie, token, CPF integral, secrets.
//
// Core owns this because every layer (storage, business, worker) needs a
// safe place to log without re-deriving the redaction rules each time.

const REDACTED_VALUE = "[REDACTED]";

// Field names are matched case-insensitively and as substrings, so
// "passwordHash", "userPassword" and "PASSWORD" are all caught.
//
// §27 hotfix additions: `pbkdf2Result` (the browser's derived key — never
// the password itself, but a password-equivalent credential over the
// wire: whoever has it can log in without ever knowing the password) and
// `pbkdf2Salt`/`verifier`/`pepper` (the stored-record and secret-binding
// fields the new browser-side flow introduced). Salts aren't secret by
// design, but redacting them too costs nothing and stays consistent with
// this file's "when in doubt, redact" posture (§79).
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passwordhash/i,
  /pbkdf2/i,
  /verifier/i,
  /pepper/i,
  /\bcookie\b/i,
  /\btoken\b/i,
  /\bsecret/i,
  /\bcpf\b/i,
  /\bauthorization\b/i,
  /\bsession(id)?\b/i,
];

function isSensitiveKey(key) {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function redact(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[CIRCULAR]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = isSensitiveKey(key) ? REDACTED_VALUE : redact(val, seen);
  }
  return out;
}

function serialize(level, context, message, fields) {
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...(context ? { context } : {}),
    ...(fields ? redact(fields) : {}),
  };
  return entry;
}

/**
 * Creates a logger bound to a context label (e.g. "worker.api", "publisher").
 * Every call redacts sensitive fields before the entry is ever stringified.
 */
export function createLogger(context = "app") {
  const emit = (level, method) => (message, fields) => {
    const entry = serialize(level, context, message, fields);
    // eslint-disable-next-line no-console
    console[method](JSON.stringify(entry));
    return entry;
  };

  return {
    debug: emit("debug", "debug"),
    info: emit("info", "log"),
    warn: emit("warn", "warn"),
    error: emit("error", "error"),
  };
}

export { redact, isSensitiveKey };
