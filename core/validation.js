// core/validation.js
//
// Allowlist-based validation (§78). The Worker never persists a raw request
// body — every write goes through `pickAllowed` plus field-level checks
// here first.

export class ValidationError extends Error {
  constructor(errors) {
    super("Validation failed");
    this.name = "ValidationError";
    this.errors = errors;
  }
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isNonEmptyString(value, { maxLength = 10000 } = {}) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

export function isSlug(value) {
  return typeof value === "string" && SLUG_PATTERN.test(value);
}

export function isEmail(value) {
  return typeof value === "string" && EMAIL_PATTERN.test(value);
}

/** Strips everything but digits — accepts CPF typed with or without dots/hyphen. */
export function normalizeCpf(value) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function cpfCheckDigit(digits) {
  let sum = 0;
  let weight = digits.length + 1;
  for (const digit of digits) {
    sum += Number(digit) * weight;
    weight -= 1;
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** Validates CPF format (11 digits) and the standard mod-11 check digits — rejects e.g. "000.000.000-00" repeated-digit CPFs, which pass the digit-count check but are never real. */
export function isCpf(value) {
  const digits = normalizeCpf(value);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const base = digits.slice(0, 9);
  const d1 = cpfCheckDigit(base);
  const d2 = cpfCheckDigit(base + d1);
  return digits === `${base}${d1}${d2}`;
}

export function isInteger(value) {
  return typeof value === "number" && Number.isInteger(value);
}

export function isPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Prices/condominium/IPTU are stored as integer cents-free BRL values. */
export function isPrice(value) {
  return isPositiveNumber(value);
}

export function isLatitude(value) {
  return typeof value === "number" && value >= -90 && value <= 90;
}

export function isLongitude(value) {
  return typeof value === "number" && value >= -180 && value <= 180;
}

/** Brazilian CEP — 8 digits, hyphen after the 5th optional (corretor may type either form; the OLX feed formatter strips non-digits itself per its own spec, so storage/business keeps whatever was typed as-is). */
export function isZipcode(value) {
  return typeof value === "string" && /^\d{5}-?\d{3}$/.test(value);
}

export function isUrl(value, { protocols = ["https:", "http:"] } = {}) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol);
  } catch {
    return false;
  }
}

export function isEnum(value, allowed) {
  return allowed.includes(value);
}

export function isBoolean(value) {
  return typeof value === "boolean";
}

/**
 * Keeps only allowlisted keys from `input`, dropping everything else.
 * This is the primary defense against persisting an unreviewed request body.
 */
export function pickAllowed(input, allowedKeys) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      out[key] = input[key];
    }
  }
  return out;
}

/**
 * Runs a field -> validator map against an object.
 * `rules[field]` is `(value) => boolean`. Missing required fields fail too.
 *
 * Returns { valid: boolean, errors: { field: string }[] }.
 */
export function validate(input, rules, { required = [] } = {}) {
  const errors = [];

  for (const field of required) {
    const value = input?.[field];
    if (value === undefined || value === null) {
      errors.push({ field, message: "campo obrigatório" });
    }
  }

  for (const [field, check] of Object.entries(rules)) {
    const value = input?.[field];
    if (value === undefined || value === null) continue; // handled by `required`
    if (!check(value)) {
      errors.push({ field, message: "valor inválido" });
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Throws ValidationError if `validate(...)` fails; otherwise returns the picked object. */
export function assertValid(input, allowedKeys, rules, opts) {
  const picked = pickAllowed(input, allowedKeys);
  const result = validate(picked, rules, opts);
  if (!result.valid) {
    throw new ValidationError(result.errors);
  }
  return picked;
}
