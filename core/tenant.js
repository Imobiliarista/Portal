// core/tenant.js
//
// Multitenancy resolution (§55). The broker/tenant context always comes
// from the verified session, never from the request body or query string.
// A handler that needs "which broker owns this write" must call
// `resolveTenant`/`assertTenantMatch` — it must never read `brokerSlug`
// (or similar) out of client-supplied JSON as an authority.

export class TenantMismatchError extends Error {
  constructor(message = "Recurso pertence a outro tenant.") {
    super(message);
    this.name = "TenantMismatchError";
  }
}

/**
 * Derives the tenant (broker) context strictly from verified session claims.
 * `session` is the object returned by `core/session.js#verifySessionToken`.
 */
export function resolveTenant(session) {
  if (!session || !session.brokerId) {
    return null;
  }
  return {
    brokerId: session.brokerId,
    slug: session.slug ?? null,
  };
}

/**
 * Throws unless the resource's owning brokerId matches the session's tenant,
 * or the session is a superadmin (superadmins act across tenants by design,
 * see §53).
 */
export function assertTenantMatch(session, resourceBrokerId) {
  if (session?.role === "superadmin") return;

  const tenant = resolveTenant(session);
  if (!tenant || tenant.brokerId !== resourceBrokerId) {
    throw new TenantMismatchError();
  }
}
