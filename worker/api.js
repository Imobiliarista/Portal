// worker/api.js
//
// Private /api/me/* handlers (§72, §54, Etapa 5 — §90). Every handler here
// starts with `requireTenant` (worker/auth.js) so the broker/tenant context
// always comes from the verified session (§55) — never from the request
// body or a route param. This file is intentionally thin: it parses the
// request, calls into business/brokers.js or business/listings.js (already
// built in Etapa 3), and maps the result/errors onto core/response.js
// envelopes. No CRUD logic is reimplemented here.

import { requireTenant } from "./auth.js";
import { can } from "../core/permissions.js";
import { ForbiddenError } from "../core/permissions.js";
import {
  getBrokerById,
  updateBrokerProfile,
  BrokerNotFoundError,
  BrokerConflictError,
} from "../business/brokers.js";
import {
  createListing,
  updateListing,
  getListingById,
  listListingsByBroker,
  ListingNotFoundError,
  ListingConflictError,
} from "../business/listings.js";
import { assertTenantMatch } from "../core/tenant.js";
import { success, notFound, conflict } from "../core/response.js";
import { ValidationError } from "../core/validation.js";
import { publishListing, publishBroker } from "../business/publishing.js";
import { hasAnyFeedSubmoduleEnabled, regenerateFeeds, FEED_SUBMODULE_IDS } from "../modules/feeds/index.js";

// Etapa 9 (§46, módulo feeds, "Modo Exportação"): a full feed
// regeneration scans every opted-in corretor's listings, per submódulo
// (modules/feeds/generator.js#collectFeedItems) — cheap relative to
// rebuildAll (bounded by opt-in count, not "todas as cidades"), but
// still real work this file's hot paths shouldn't pay on every single
// write from every corretor, opted in or not. Gated below on whichever
// corretor the write actually touches having ANY submódulo enabled right
// now — the common case (a corretor who never touched this module) costs
// one already-in-hand object read, not a bucket-wide scan.
async function maybeRegenerateFeeds(env, broker) {
  if (broker && hasAnyFeedSubmoduleEnabled(broker, FEED_SUBMODULE_IDS)) {
    await regenerateFeeds(env);
  }
}

async function readJsonBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    throw new ValidationError([{ field: "body", message: "JSON inválido." }]);
  }
}

/** A broker (or superadmin) session is required for every /api/me/* route — these act on "my own" resources, which only makes sense for a broker's own tenant. */
function requireOwnBrokerId(session, tenant) {
  if (!tenant) {
    throw new ForbiddenError("Esta conta não possui um corretor associado.");
  }
  return tenant.brokerId;
}

// --- GET /api/me/profile ----------------------------------------------------
export async function handleGetProfile(request, env) {
  const { session, tenant } = await requireTenant(request, env);
  const brokerId = requireOwnBrokerId(session, tenant);

  const profile = await getBrokerById(env, brokerId);
  if (!profile) return notFound("Perfil de corretor não encontrado.");
  return success(profile);
}

// --- PUT /api/me/profile ----------------------------------------------------
export async function handlePutProfile(request, env) {
  const { session, tenant } = await requireTenant(request, env);
  const brokerId = requireOwnBrokerId(session, tenant);
  if (!can(session, "profile:update")) throw new ForbiddenError();

  const body = await readJsonBody(request);
  try {
    // §27 hotfix pt.3 — LOGIN_INDEX_SECRET only actually gets used by
    // business/brokers.js#updateBrokerProfile when the patch touches
    // email/cpf; passed through as-is (possibly undefined) rather than
    // eagerly required here, so a profile edit that never touches either
    // field (phone, about, logo, ...) isn't blocked on it — the function's
    // own guard throws a clear ValidationError if it's actually needed.
    const updated = await updateBrokerProfile(env, brokerId, body, { loginIndexSecret: env.LOGIN_INDEX_SECRET });
    // Etapa 6 (§31-32): keep brokers/{slug}/profile.json in sync with the
    // private profile right away — publishBroker() itself skips the write
    // when nothing publish-relevant changed (staleness check) or the
    // broker isn't approved yet (status "pending").
    await publishBroker(env, brokerId);
    // Etapa 9 (§46): `modules` (when present in the patch) replaces the
    // whole object (business/brokers.js#updateBrokerProfile — no deep
    // merge), so it's the only way `modules.feeds.enabled` can change here.
    // Regenerate unconditionally when it was touched at all — covers both
    // turning the module on (must appear in the feed) and off (must be
    // removed from it), which a single "is it enabled now" check on
    // `updated` alone would miss for the "just turned off" case.
    if (body.modules !== undefined) {
      await regenerateFeeds(env);
    }
    return success(updated);
  } catch (error) {
    if (error instanceof BrokerNotFoundError) return notFound(error.message);
    if (error instanceof BrokerConflictError) return conflict(error.message);
    throw error;
  }
}

// --- GET /api/me/listings ----------------------------------------------------
export async function handleListListings(request, env) {
  const { session, tenant } = await requireTenant(request, env);
  const brokerId = requireOwnBrokerId(session, tenant);

  const listings = await listListingsByBroker(env, brokerId);
  return success(listings);
}

// --- POST /api/me/listings ---------------------------------------------------
export async function handleCreateListing(request, env) {
  const { session, tenant } = await requireTenant(request, env);
  const brokerId = requireOwnBrokerId(session, tenant);
  if (!can(session, "listing:create")) throw new ForbiddenError();

  const body = await readJsonBody(request);
  try {
    const draft = await createListing(env, brokerId, body);
    // Etapa 6 (§32): a new listing is usually created as status:"draft" —
    // publishListing() no-ops for that case (nothing to publish yet). If
    // the caller set an explicit publishable status at creation, this
    // takes it live immediately.
    await publishListing(env, draft.listingId);
    await maybeRegenerateFeeds(env, await getBrokerById(env, brokerId));
    return success(draft, { status: 201 });
  } catch (error) {
    if (error instanceof ListingConflictError) return conflict(error.message);
    throw error;
  }
}

// --- GET /api/me/listings/:id -------------------------------------------------
// Cross-tenant access is blocked the same way every other private write in
// this codebase blocks it (§55): `assertTenantMatch` -> `TenantMismatchError`
// -> 403, handled centrally by core/app.js. Same mechanism PUT/DELETE below
// get "for free" from business/listings.js#updateListing itself.
export async function handleGetListing(request, env, ctx, params) {
  const { session, tenant } = await requireTenant(request, env);
  requireOwnBrokerId(session, tenant);

  const listing = await getListingById(env, params.id);
  if (!listing) return notFound("Anúncio não encontrado.");
  assertTenantMatch(session, listing.brokerId);
  return success(listing);
}

// --- PUT /api/me/listings/:id -------------------------------------------------
export async function handlePutListing(request, env, ctx, params) {
  const { session, tenant } = await requireTenant(request, env);
  const brokerId = requireOwnBrokerId(session, tenant);
  if (!can(session, "listing:update")) throw new ForbiddenError();

  const body = await readJsonBody(request);
  try {
    const updated = await updateListing(env, brokerId, params.id, body);
    // Etapa 6 (§32) — the trigger this section of the doc names first:
    // "quando o corretor salva/edita via Etapa 5". Publishes the full
    // listing + updates only this listing's city shard/index/manifest.
    await publishListing(env, updated.listingId);
    await maybeRegenerateFeeds(env, await getBrokerById(env, brokerId));
    return success(updated);
  } catch (error) {
    if (error instanceof ListingNotFoundError) return notFound(error.message);
    // Etapa 8b (§52/§53): a `gallery` patch here goes through the same
    // plan-derived limit as worker/uploads.js's own upload flow
    // (business/listings.js#updateListing -> GalleryLimitExceededError,
    // a ListingConflictError subclass) — a broker PUTting a full gallery
    // array directly must be capped exactly like uploading one photo at a
    // time is.
    if (error instanceof ListingConflictError) return conflict(error.message);
    throw error;
  }
}

// --- DELETE /api/me/listings/:id ----------------------------------------------
// Soft-delete (§93 non-regression doesn't forbid this, and it's the
// project's existing pattern — see LISTING_STATUSES including "removed" in
// business/listings.js): a broker's own listing is marked status:"removed"
// rather than the R2 object being deleted. Publishing that removal (§64 —
// pulling the card/public listing out of R2 DATA) is the publisher's job,
// Etapa 6.
export async function handleDeleteListing(request, env, ctx, params) {
  const { session, tenant } = await requireTenant(request, env);
  const brokerId = requireOwnBrokerId(session, tenant);
  if (!can(session, "listing:delete")) throw new ForbiddenError();

  try {
    const updated = await updateListing(env, brokerId, params.id, { status: "removed" });
    // Etapa 6 (§64): pulls the card out of the city shard/index right away.
    // listings/{slug}.json is NOT deleted — it's rewritten with
    // status:"removed" (publishListing/normalizeListingForPublic), so the
    // public URL keeps resolving instead of 404ing silently.
    await publishListing(env, updated.listingId);
    await maybeRegenerateFeeds(env, await getBrokerById(env, brokerId));
    return success(updated);
  } catch (error) {
    if (error instanceof ListingNotFoundError) return notFound(error.message);
    throw error;
  }
}
