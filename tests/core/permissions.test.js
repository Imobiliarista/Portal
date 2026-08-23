import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES,
  ForbiddenError,
  hasRole,
  isSuperadmin,
  requireRole,
  requireSuperadmin,
  requireBroker,
  can,
} from "../../core/permissions.js";

test("hasRole/isSuperadmin read the session role", () => {
  assert.equal(hasRole({ role: "broker" }, ROLES.BROKER), true);
  assert.equal(isSuperadmin({ role: "superadmin" }), true);
  assert.equal(isSuperadmin({ role: "broker" }), false);
});

test("requireRole throws ForbiddenError when the role doesn't match", () => {
  assert.throws(() => requireRole({ role: "broker" }, ROLES.SUPERADMIN), ForbiddenError);
  assert.throws(() => requireRole(null, ROLES.BROKER), ForbiddenError);
});

test("requireRole accepts an array of allowed roles", () => {
  const session = { role: "broker" };
  assert.equal(requireRole(session, [ROLES.BROKER, ROLES.SUPERADMIN]), session);
});

test("requireSuperadmin/requireBroker are role-specific shortcuts", () => {
  assert.throws(() => requireSuperadmin({ role: "broker" }), ForbiddenError);
  assert.throws(() => requireBroker({ role: "superadmin" }), ForbiddenError);
});

test("can() grants superadmin every action, broker only its allowlist", () => {
  assert.equal(can({ role: "superadmin" }, "anything"), true);
  assert.equal(can({ role: "broker" }, "listing:create"), true);
  assert.equal(can({ role: "broker" }, "rebuild:city"), false);
  assert.equal(can(null, "listing:create"), false);
});
