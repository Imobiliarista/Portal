// core/permissions.js
//
// Role/permission checks for the two roles the architecture defines so far
// (§53 SuperAdmin, §54 Painel do Corretor). Module-specific permission
// checks (plans, financial) stay in their own module per §39 — core must
// never import from modules/.

export const ROLES = Object.freeze({
  SUPERADMIN: "superadmin",
  BROKER: "broker",
});

export class ForbiddenError extends Error {
  constructor(message = "Acesso negado.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function hasRole(session, role) {
  return session?.role === role;
}

export function isSuperadmin(session) {
  return hasRole(session, ROLES.SUPERADMIN);
}

/** Throws ForbiddenError unless the session carries one of `allowedRoles`. */
export function requireRole(session, allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (!session || !roles.includes(session.role)) {
    throw new ForbiddenError();
  }
  return session;
}

export function requireSuperadmin(session) {
  return requireRole(session, ROLES.SUPERADMIN);
}

export function requireBroker(session) {
  return requireRole(session, ROLES.BROKER);
}

/**
 * Broker-facing actions a session with role=broker may take on its own
 * resources. SuperAdmin actions (§53) are broader and always allowed.
 * This is intentionally small — it grows as Etapa 5/8 add real handlers.
 */
const BROKER_ACTIONS = new Set([
  "listing:create",
  "listing:update",
  "listing:delete",
  "profile:update",
  "media:upload",
  "media:delete",
]);

/**
 * `can(session, action)` — coarse action-level check used before a handler
 * even looks at tenant ownership (`core/tenant.js` handles the ownership
 * check separately).
 */
export function can(session, action) {
  if (!session) return false;
  if (isSuperadmin(session)) return true;
  if (hasRole(session, ROLES.BROKER)) return BROKER_ACTIONS.has(action);
  return false;
}
