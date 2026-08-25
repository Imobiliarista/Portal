// tests/support/cpf.js
//
// Deterministic, checksum-valid CPFs for tests. Since the §27 hotfix (PR
// #19), business/brokers.js#createBroker requires a real CPF —
// core/validation.js#isCpf enforces the standard mod-11 check digits, so a
// placeholder like "00000000000" is rejected. nextCpf() returns a fresh
// one on every call so multiple brokers created in the same test env never
// collide on the broker-CPF index.

function checkDigit(digits) {
  let sum = 0;
  let weight = digits.length + 1;
  for (const digit of digits) {
    sum += Number(digit) * weight;
    weight -= 1;
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

let seed = 100000000;

export function nextCpf() {
  const base = String(seed).padStart(9, "0");
  seed += 1;
  const d1 = checkDigit(base);
  const d2 = checkDigit(base + d1);
  return `${base}${d1}${d2}`;
}
