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
// Etapa 8b (§52/§53): adds `/api/admin/plans*` (CRUD over
// business/plans.js's catalog) and `PUT /api/admin/brokers/:id/plan`
// (assign/change a broker's plan). Not in §72's original route list — that
// section predates the plans system existing at all.
//
// Gestão completa de cliente/site: fills in the CRUD this file's own
// header used to call out of scope — `POST /api/admin/brokers` (create),
// `GET /api/admin/brokers/:id` (full private+public view) and
// `PUT /api/admin/brokers/:id` (edit) — plus `POST /api/admin/brokers/:id/delete`
// (logical delete, mirrors approve/suspend/reactivate's verb-suffixed
// route style rather than inventing a generic `/status` route this file
// doesn't otherwise use). Creation never accepts a plaintext password in
// the body — `{ salt, pbkdf2Result }` is the browser's own already-derived
// PBKDF2 result (frontend/admin/data.js, same shape `POST /api/auth/login`
// already uses), peppered here via
// business/auth.js#setAuthPasswordFromClientResult, never the
// script/CLI-only `setAuthPassword` (which needs the plaintext password to
// run 600k PBKDF2 iterations itself — unsafe inside a Worker request).

import { requireSession } from "./auth.js";
import { requireSuperadmin } from "../core/permissions.js";
import { success, notFound, conflict, badRequest } from "../core/response.js";
import {
  listBrokers,
  getBrokerById,
  createBroker,
  updateBrokerProfile,
  approveBroker,
  suspendBroker,
  reactivateBroker,
  deleteBroker,
  BrokerNotFoundError,
  BrokerConflictError,
} from "../business/brokers.js";
import { setAuthPasswordFromClientResult } from "../business/auth.js";
import { isNonEmptyString } from "../core/validation.js";
import { publishBroker, republishBrokerListings, rebuildCity, rebuildAll } from "../business/publishing.js";
import { UnknownCityError } from "../business/cities.js";
import { hasAnyFeedSubmoduleEnabled, regenerateFeeds, FEED_SUBMODULE_IDS } from "../modules/feeds/index.js";

// Etapa 9 (§46) — see worker/api.js's copy of this same helper for the
// full rationale (gate on the specific corretor being touched, so an
// admin action on a corretor who never opted into any feed submódulo
// doesn't pay for a full feed recompute).
async function maybeRegenerateFeeds(env, broker) {
  if (broker && hasAnyFeedSubmoduleEnabled(broker, FEED_SUBMODULE_IDS)) {
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

// Same pattern as worker/auth.js's own (module-private, not exported)
// secret helpers — duplicated rather than imported because worker/auth.js
// doesn't export them; both throw the same clear misconfiguration error
// instead of silently calling business/* with `undefined`.
function passwordPepper(env) {
  if (!env?.PASSWORD_PEPPER) {
    throw new Error("worker/admin: binding PASSWORD_PEPPER ausente em env.");
  }
  return env.PASSWORD_PEPPER;
}

function loginIndexSecret(env) {
  if (!env?.LOGIN_INDEX_SECRET) {
    throw new Error("worker/admin: binding LOGIN_INDEX_SECRET ausente em env.");
  }
  return env.LOGIN_INDEX_SECRET;
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

// --- POST /api/admin/brokers -------------------------------------------------
// Cria um cliente/site completo: todos os campos privados (cliente) e
// públicos (site), num único corpo (business/brokers.js#CREATE_ALLOWED_FIELDS
// já filtra pro allowlist real — este handler não reimplementa validação).
// `salt`/`pbkdf2Result` (obrigatórios) são a senha inicial já derivada no
// navegador — ver o cabeçalho deste arquivo; a senha crua nunca chega aqui.
export async function handleCreateBroker(request, env) {
  await requireAdmin(request, env);
  const body = await readJsonBody(request);
  const { salt, pbkdf2Result, ...brokerInput } = body;

  if (!isNonEmptyString(salt) || !isNonEmptyString(pbkdf2Result)) {
    return badRequest('Informe "salt" e "pbkdf2Result" (senha inicial derivada no navegador).');
  }

  try {
    const broker = await createBroker(env, brokerInput, { loginIndexSecret: loginIndexSecret(env) });
    await setAuthPasswordFromClientResult(env, broker.userId, { salt, pbkdf2Result }, { pepper: passwordPepper(env) });
    return success(broker, { status: 201 });
  } catch (error) {
    if (error instanceof BrokerConflictError) return conflict(error.message);
    throw error;
  }
}

// --- GET /api/admin/brokers/:id -----------------------------------------------
// SuperAdmin tem acesso total: devolve o registro privado inteiro (cliente
// + site juntos, exatamente como business/brokers.js os guarda) — não a
// projeção pública normalizada que o minisite vê.
export async function handleGetBroker(request, env, ctx, params) {
  await requireAdmin(request, env);
  const broker = await getBrokerById(env, params.id);
  if (!broker) return notFound(`Corretor "${params.id}" não encontrado.`);
  return success(broker);
}

// --- PUT /api/admin/brokers/:id -----------------------------------------------
// Edita qualquer campo das seções cliente/site (business/brokers.js#
// PROFILE_UPDATE_ALLOWED_FIELDS) — reaproveita a mesma
// `updateBrokerProfile` que o próprio corretor usaria, sem reimplementar
// validação/reindexação de e-mail/CPF.
export async function handleUpdateBroker(request, env, ctx, params) {
  await requireAdmin(request, env);
  const body = await readJsonBody(request);
  try {
    const broker = await updateBrokerProfile(env, params.id, body, { loginIndexSecret: loginIndexSecret(env) });
    return success(broker);
  } catch (error) {
    if (error instanceof BrokerNotFoundError) return notFound(error.message);
    if (error instanceof BrokerConflictError) return conflict(error.message);
    throw error;
  }
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

// --- POST /api/admin/brokers/:id/delete ---------------------------------------
// Exclusão LÓGICA (nunca física) de cliente/site — mesmo mecanismo de
// transição de estado que approve/suspend/reactivate acima já usam
// (business/brokers.js#deleteBroker), e o mesmo cascateamento de
// republicação mínima que suspend/reactivate já fazem: o corretor deletado
// vira a mesma publicação mínima de um corretor suspenso (business/
// publishing.js — "deleted" mapeia pro mesmo status público "suspended").
// Nenhum objeto privado ou público é apagado por esta rota.
export async function handleDeleteBroker(request, env, ctx, params) {
  await requireAdmin(request, env);
  try {
    const broker = await deleteBroker(env, params.id);
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
