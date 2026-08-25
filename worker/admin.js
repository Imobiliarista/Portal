// worker/admin.js
//
// Private /api/admin/* handlers (§72, §53, Etapa 8 — §90). Every handler
// here starts by requiring a superadmin session — the one place in this
// lot that actually exercises the `superadmin` role that has existed since
// Etapa 4 but had no real route to guard until now. Thin by the same rule
// worker/api.js follows: parse the request, call into business/brokers.js
// or business/publishing.js (already built in Lote 3/6/7), map the
// result/errors onto core/response.js envelopes. No CRUD/publish/rebuild
// logic is reimplemented here.
//
// Scope of this lot (Etapa 8a — aprovação/suspensão + rebuild manual; ver
// PR): broker creation (`POST /api/admin/brokers`, listed in §72) is
// deliberately NOT wired up — there is no signup flow yet that would ever
// put a broker in "pending" status for a superadmin to approve, and the
// task's explicit scope for this lot is "aprovar cadastro pendente e
// suspender/reativar", not "criar corretor". `business/brokers.createBroker`
// still exists and is exercised by tests/scripts; see pendências no PR.
// `GET /api/admin/brokers/:id` and `PUT /api/admin/brokers/:id` (full
// admin edit) are likewise out of scope — the admin frontend this lot only
// needs list + approve/suspend/reactivate + rebuild.
//
// Etapa 8b (this update — §52/§53): adds `/api/admin/plans*` (CRUD over
// business/plans.js's catalog) and `PUT /api/admin/brokers/:id/plan`
// (assign/change a broker's plan). Not in §72's original route list — that
// section predates the plans system existing at all.

import { requireSession } from "./auth.js";
import { requireSuperadmin } from "../core/permissions.js";
import { success, notFound, conflict } from "../core/response.js";
import {
  listBrokers,
  getBrokerById,
  approveBroker,
  suspendBroker,
  reactivateBroker,
  BrokerNotFoundError,
  BrokerConflictError,
} from "../business/brokers.js";
import { publishBroker, republishBrokerListings, rebuildCity, rebuildAll } from "../business/publishing.js";
import { UnknownCityError } from "../business/cities.js";
import { readFeedsConfig, regenerateFeeds } from "../modules/feeds/index.js";

// Etapa 9 (§46) — see worker/api.js's copy of this same helper for the
// full rationale (gate on the specific corretor being touched, so an
// admin action on a corretor who never opted into feeds doesn't pay for a
// full feed recompute).
async function maybeRegenerateFeeds(env, broker) {
  if (broker && readFeedsConfig(broker).enabled) {
    await regenerateFeeds(env);
  }
}
import {
  listPlans,
  createPlan,
  updatePlan,
  getPlanById,
  deletePlan,
  assignBrokerPlan,
  PlanNotFoundError,
  PlanConflictError,
} from "../business/plans.js";

async function requireAdmin(request, env) {
  const session = await requireSession(request, env);
  requireSuperadmin(session);
  return session;
}

async function readJsonBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

// --- GET /api/admin/brokers --------------------------------------------------
// `?status=pending` (etc.) lets the admin frontend's "aprovar cadastros
// pendentes" view ask for just that slice instead of filtering client-side.
export async function handleListBrokers(request, env) {
  await requireAdmin(request, env);
  const status = new URL(request.url).searchParams.get("status") || undefined;
  const brokers = await listBrokers(env, { status });
  return success(brokers);
}

// --- POST /api/admin/brokers/:id/approve --------------------------------------
export async function handleApproveBroker(request, env, ctx, params) {
  await requireAdmin(request, env);
  try {
    const broker = await approveBroker(env, params.id);
    await publishBroker(env, broker.brokerId);
    await maybeRegenerateFeeds(env, broker);
    return success(broker);
  } catch (error) {
    if (error instanceof BrokerNotFoundError) return notFound(error.message);
    if (error instanceof BrokerConflictError) return conflict(error.message);
    throw error;
  }
}

// --- POST /api/admin/brokers/:id/suspend --------------------------------------
// Also republishes the broker's already-published listings right away
// (business/publishing.js#republishBrokerListings) so the suspension takes
// effect on the public portal immediately, not only on the broker's next
// individual edit — see decision 8 in business/publishing.js's header.
export async function handleSuspendBroker(request, env, ctx, params) {
  await requireAdmin(request, env);
  try {
    const broker = await suspendBroker(env, params.id);
    await publishBroker(env, broker.brokerId);
    await republishBrokerListings(env, broker.brokerId);
    await maybeRegenerateFeeds(env, broker);
    return success(broker);
  } catch (error) {
    if (error instanceof BrokerNotFoundError) return notFound(error.message);
    if (error instanceof BrokerConflictError) return conflict(error.message);
    throw error;
  }
}

// --- POST /api/admin/brokers/:id/activate -------------------------------------
// §72 names this route "activate" for the suspended->active move (§53
// "reativar"); kept distinct from "approve" (pending->active, §53
// "aprovar") even though both land the broker in the same status, because
// they mean different things to a human reading the admin UI/audit trail.
export async function handleReactivateBroker(request, env, ctx, params) {
  await requireAdmin(request, env);
  try {
    const broker = await reactivateBroker(env, params.id);
    await publishBroker(env, broker.brokerId);
    await republishBrokerListings(env, broker.brokerId);
    await maybeRegenerateFeeds(env, broker);
    return success(broker);
  } catch (error) {
    if (error instanceof BrokerNotFoundError) return notFound(error.message);
    if (error instanceof BrokerConflictError) return conflict(error.message);
    throw error;
  }
}

// --- POST /api/admin/brokers/:id/publish --------------------------------------
// §53 "republicar corretor": force-republishes the broker's profile plus
// every one of their listings, regardless of the staleness check
// publishBroker normally does. Useful after a manual R2 edit, a schema
// migration, or just to confirm a corretor's public footprint matches its
// private state right now.
export async function handlePublishBroker(request, env, ctx, params) {
  await requireAdmin(request, env);
  const broker = await getBrokerById(env, params.id);
  if (!broker) return notFound(`Corretor "${params.id}" não encontrado.`);

  await publishBroker(env, broker.brokerId, { force: true });
  const results = await republishBrokerListings(env, broker.brokerId);
  await maybeRegenerateFeeds(env, broker);
  return success({ broker, republishedListings: results.length });
}

// --- POST /api/admin/rebuild/city/:city ---------------------------------------
export async function handleRebuildCity(request, env, ctx, params) {
  await requireAdmin(request, env);
  try {
    const manifest = await rebuildCity(env, params.city);
    return success(manifest);
  } catch (error) {
    if (error instanceof UnknownCityError) return notFound(error.message);
    throw error;
  }
}

// --- POST /api/admin/rebuild/all ----------------------------------------------
// §34/§53 "rebuild global": one call processes one checkpointable batch
// (business/publishing.js#rebuildAll already owns the batching/checkpoint
// logic, Etapa 7) and returns `{ done, nextCursor }` — the caller (this
// lot's frontend "botão de rebuild manual") invokes it again while
// `done: false` to keep going.
export async function handleRebuildAll(request, env) {
  await requireAdmin(request, env);
  const body = await readJsonBody(request);
  const result = await rebuildAll(env, { cursor: body?.cursor });
  // Etapa 9 (§46): unlike the per-corretor actions above, a global rebuild
  // touches every city/corretor indiscriminately — there's no single
  // corretor to gate the check on, so this regenerates unconditionally,
  // but only once the whole batched rebuild actually finishes
  // (`result.done`), not on every intermediate batch call (§34's own
  // "checkpointable batches" already avoids doing all the work in one
  // Worker invocation; regenerating the feed on every batch would undo
  // that for no benefit — nothing feed-relevant is guaranteed consistent
  // until the last batch lands anyway).
  if (result.done) {
    await regenerateFeeds(env);
  }
  return success(result);
}

// --- planos (§52, §53, Etapa 8b) ----------------------------------------------

// --- GET /api/admin/plans ------------------------------------------------
export async function handleListPlans(request, env) {
  await requireAdmin(request, env);
  const plans = await listPlans(env);
  return success(plans);
}

// --- POST /api/admin/plans ------------------------------------------------
export async function handleCreatePlan(request, env) {
  await requireAdmin(request, env);
  const body = await readJsonBody(request);
  try {
    const plan = await createPlan(env, body);
    return success(plan, { status: 201 });
  } catch (error) {
    if (error instanceof PlanConflictError) return conflict(error.message);
    throw error;
  }
}

// --- GET /api/admin/plans/:id ---------------------------------------------
export async function handleGetPlan(request, env, ctx, params) {
  await requireAdmin(request, env);
  const plan = await getPlanById(env, params.id);
  if (!plan) return notFound(`Plano "${params.id}" não encontrado.`);
  return success(plan);
}

// --- PUT /api/admin/plans/:id ----------------------------------------------
export async function handleUpdatePlan(request, env, ctx, params) {
  await requireAdmin(request, env);
  const body = await readJsonBody(request);
  try {
    const plan = await updatePlan(env, params.id, body);
    return success(plan);
  } catch (error) {
    if (error instanceof PlanNotFoundError) return notFound(error.message);
    if (error instanceof PlanConflictError) return conflict(error.message);
    throw error;
  }
}

// --- DELETE /api/admin/plans/:id --------------------------------------------
export async function handleDeletePlan(request, env, ctx, params) {
  await requireAdmin(request, env);
  try {
    await deletePlan(env, params.id);
    return success({ deleted: true });
  } catch (error) {
    if (error instanceof PlanNotFoundError) return notFound(error.message);
    if (error instanceof PlanConflictError) return conflict(error.message);
    throw error;
  }
}

// --- PUT /api/admin/brokers/:id/plan ----------------------------------------
// §53 "gerenciar planos" applied to a specific corretor. Distinct from
// `handlePublishBroker`'s POST-action style (approve/suspend/etc.) because
// this sets a resource (the broker's plan), not an action — same
// convention as `PUT /api/me/profile` (worker/api.js).
export async function handleAssignBrokerPlan(request, env, ctx, params) {
  await requireAdmin(request, env);
  const body = await readJsonBody(request);
  try {
    const broker = await assignBrokerPlan(env, params.id, body?.planId);
    return success(broker);
  } catch (error) {
    if (error instanceof BrokerNotFoundError) return notFound(error.message);
    if (error instanceof PlanNotFoundError) return notFound(error.message);
    throw error;
  }
}
