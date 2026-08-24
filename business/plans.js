// business/plans.js
//
// Private plan-catalog domain (§52, §53, Etapa 8b — §90). Owns the plan
// records that live in R2 PRIVATE (`plans/{planId}.json`) plus the plan
// registry that lists them without scanning the bucket (§26), same pattern
// as business/brokers.js/business/cities.js.
//
// Scope of this lot: only the technical piece §53 lists under SuperAdmin
// ("gerenciar planos") — CRUD of a plan record, assigning a plan to a
// broker, and resolving the gallery-photo limit a broker's assigned plan
// grants. `modules/plans/` (§52, catalog/eligibility/features for
// checkout, Etapa 10) is a different, still-unbuilt piece — billing/Asaas
// never enters here. The architecture doc never defines a real plan
// catalog (names, prices, per-plan limits) — this file only builds the
// structure; real plan values are a product decision left as a pendência
// (see the PR).
//
// One plan is seeded automatically: DEFAULT_PLAN_ID ("free"). Every broker
// that has no plan assigned (or whose assigned plan no longer exists)
// resolves to it — confirmed with the requester before implementing,
// specifically to avoid a second, undocumented "cap" living outside the
// plan system (see docs/CHANGELOG.md). Its `maxGalleryItems` (50) is a
// placeholder carried over from the old PROVISIONAL_MAX_GALLERY_ITEMS
// constant (business/listings.js, Etapa 5) — a real name/price/limit for
// this plan is the same open product decision as any other plan.

import { getPrivate, putPrivate, deletePrivate } from "../storage/private.js";
import { privateKeys } from "../storage/keys.js";
import { getKnownPlanIds, registerPlanId, deregisterPlanId } from "../storage/indexes.js";
import { isNonEmptyString, isSlug, isInteger, assertValid, ValidationError } from "../core/validation.js";
import { getBrokerById, listBrokers, BrokerNotFoundError } from "./brokers.js";

export class PlanNotFoundError extends Error {
  constructor(planId) {
    super(`Plano "${planId}" não encontrado.`);
    this.name = "PlanNotFoundError";
  }
}

export class PlanConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "PlanConflictError";
  }
}

/**
 * The plan every broker without an explicit assignment falls back to
 * (decision confirmed with the requester — see this file's header comment
 * and docs/CHANGELOG.md). Never deletable (`deletePlan` below).
 */
export const DEFAULT_PLAN_ID = "free";
const DEFAULT_PLAN_NAME = "Gratuito (provisório)";
const DEFAULT_PLAN_MAX_GALLERY_ITEMS = 50; // same value PROVISIONAL_MAX_GALLERY_ITEMS used to hardcode

const CREATE_ALLOWED_FIELDS = ["planId", "name", "maxGalleryItems"];
const UPDATE_ALLOWED_FIELDS = ["name", "maxGalleryItems"];

const FIELD_RULES = {
  planId: isSlug,
  name: (v) => isNonEmptyString(v, { maxLength: 200 }),
  maxGalleryItems: (v) => isInteger(v) && v >= 1,
};

function now() {
  return new Date().toISOString();
}

/** Looks up a plan by id. Returns `null` if it doesn't exist. */
export async function getPlanById(env, planId) {
  if (!isNonEmptyString(planId)) return null;
  return getPrivate(env, privateKeys.plan(planId));
}

/**
 * Lists every known plan, for SuperAdmin's plan catalog (§53). Uses the
 * plan registry (storage/indexes.js#getKnownPlanIds) — never a bucket scan
 * (§26).
 */
export async function listPlans(env) {
  const planIds = await getKnownPlanIds(env);
  const plans = [];
  for (const planId of planIds) {
    const plan = await getPlanById(env, planId);
    if (!plan) continue; // defensivo — registro órfão não derruba a listagem
    plans.push(plan);
  }
  return plans;
}

/** Idempotently ensures DEFAULT_PLAN_ID exists, seeding it on first use. */
async function ensureDefaultPlan(env) {
  const existing = await getPlanById(env, DEFAULT_PLAN_ID);
  if (existing) return existing;

  const plan = {
    schemaVersion: 1,
    planId: DEFAULT_PLAN_ID,
    name: DEFAULT_PLAN_NAME,
    maxGalleryItems: DEFAULT_PLAN_MAX_GALLERY_ITEMS,
    updatedAt: now(),
  };
  await putPrivate(env, privateKeys.plan(DEFAULT_PLAN_ID), plan);
  await registerPlanId(env, DEFAULT_PLAN_ID);
  return plan;
}

/** Creates a new plan record (§52/§53). Returns the plan object. */
export async function createPlan(env, input) {
  const picked = assertValid(input, CREATE_ALLOWED_FIELDS, FIELD_RULES, {
    required: ["planId", "name", "maxGalleryItems"],
  });

  const existing = await getPlanById(env, picked.planId);
  if (existing) {
    throw new PlanConflictError(`Plano "${picked.planId}" já existe.`);
  }

  const plan = {
    schemaVersion: 1,
    planId: picked.planId,
    name: picked.name,
    maxGalleryItems: picked.maxGalleryItems,
    updatedAt: now(),
  };

  await putPrivate(env, privateKeys.plan(plan.planId), plan);
  await registerPlanId(env, plan.planId);

  return plan;
}

/** Updates an existing plan's name/limit. `planId` itself is immutable. */
export async function updatePlan(env, planId, patch) {
  if (!isNonEmptyString(planId)) {
    throw new ValidationError([{ field: "planId", message: "obrigatório" }]);
  }

  const current = await getPlanById(env, planId);
  if (!current) throw new PlanNotFoundError(planId);

  const picked = assertValid(patch, UPDATE_ALLOWED_FIELDS, FIELD_RULES);

  const updated = { ...current, ...picked, updatedAt: now() };
  await putPrivate(env, privateKeys.plan(planId), updated);
  return updated;
}

/**
 * Deletes a plan. Refuses to remove DEFAULT_PLAN_ID (every unassigned
 * broker depends on it existing) and refuses to remove a plan currently
 * assigned to any broker (so a broker never ends up pointing at a plan
 * that silently vanished — `getGalleryLimitForBroker` below only falls
 * back to the default plan for a *stale/unknown* planId, not as a
 * substitute for this guard).
 */
export async function deletePlan(env, planId) {
  if (!isNonEmptyString(planId)) {
    throw new ValidationError([{ field: "planId", message: "obrigatório" }]);
  }
  if (planId === DEFAULT_PLAN_ID) {
    throw new PlanConflictError(`Plano padrão "${DEFAULT_PLAN_ID}" não pode ser removido.`);
  }

  const current = await getPlanById(env, planId);
  if (!current) throw new PlanNotFoundError(planId);

  const brokersOnPlan = await listBrokers(env);
  if (brokersOnPlan.some((broker) => broker.plan === planId)) {
    throw new PlanConflictError(`Plano "${planId}" está em uso por ao menos um corretor e não pode ser removido.`);
  }

  await deletePrivate(env, privateKeys.plan(planId));
  await deregisterPlanId(env, planId);
}

// --- SuperAdmin: atribuir/trocar plano de corretor (§53) ------------------

/**
 * Assigns/changes a broker's plan. `planId` must reference an existing plan
 * — this is the one place a broker's `plan` field is guaranteed to point at
 * a real catalog entry (§29's `plan` was, since Etapa 3, just a free-text
 * string set at broker creation; this route is the actual "gerenciar
 * planos" SuperAdmin action §53 names).
 */
export async function assignBrokerPlan(env, brokerId, planId) {
  if (!isNonEmptyString(brokerId)) {
    throw new ValidationError([{ field: "brokerId", message: "obrigatório" }]);
  }
  if (!isNonEmptyString(planId)) {
    throw new ValidationError([{ field: "planId", message: "obrigatório" }]);
  }

  const plan = await getPlanById(env, planId);
  if (!plan) throw new PlanNotFoundError(planId);

  const broker = await getBrokerById(env, brokerId);
  if (!broker) throw new BrokerNotFoundError(brokerId);

  const updated = { ...broker, plan: planId, updatedAt: now() };
  await putPrivate(env, privateKeys.brokerProfileDraft(brokerId), updated);

  const manifestKey = privateKeys.brokerManifest(brokerId);
  const manifest = (await getPrivate(env, manifestKey)) ?? {};
  await putPrivate(env, manifestKey, { ...manifest, plan: planId });

  return updated;
}

// --- limite de fotos por anúncio (§56-57, substitui PROVISIONAL_MAX_GALLERY_ITEMS) ---

/**
 * Resolves the gallery-photo limit that applies to `brokerId` right now:
 * its assigned plan's `maxGalleryItems`, falling back to the seeded
 * DEFAULT_PLAN_ID plan when the broker has no plan assigned, the broker
 * itself can't be resolved, or its assigned planId no longer exists (e.g.
 * legacy `plan` free text from before this lot, or a since-deleted plan).
 * This is the single source of truth business/listings.js and
 * worker/uploads.js both call into — no more separate hardcoded cap.
 */
export async function getGalleryLimitForBroker(env, brokerId) {
  const broker = await getBrokerById(env, brokerId);
  const planId = isNonEmptyString(broker?.plan) ? broker.plan : DEFAULT_PLAN_ID;

  const plan = (await getPlanById(env, planId)) ?? (await ensureDefaultPlan(env));
  return plan.maxGalleryItems;
}
