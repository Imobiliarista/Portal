// business/plans.js
//
// Private plan-catalog domain (§52, §53, Etapa 8b + Etapa 10 — §90). Owns
// the plan records that live in R2 PRIVATE (`plans/{planId}.json`) plus
// the plan registry that lists them without scanning the bucket (§26),
// same pattern as business/brokers.js/business/cities.js.
//
// Etapa 8b built CRUD + the gallery-photo limit only. This lot (Etapa 10,
// §52) widens the plan record's shape — monthly/setup price, an active-
// listings limit (reverses the "fora de escopo" call from Etapa 8b, see
// docs/CHANGELOG.md), and a `modules` map of per-plan feature toggles —
// without touching the CRUD functions' signatures or the registry. All
// new fields are optional with safe defaults, so a plan created before
// this lot (including the seeded DEFAULT_PLAN_ID one) still resolves
// correctly through `getPlanForBroker` below. `modules/plans/` (§52,
// catalog/eligibility/features) is the read-only query layer other
// modules use instead of reaching into this file directly — see that
// package's README for what is and isn't wired up yet. Billing/Asaas
// itself is `modules/financial/` — a separate piece, built in Etapa 10
// (behind `FINANCIAL_ENABLED`, see modules/financial/README.md), which
// reads `monthlyPrice`/`setupPrice` from the plan resolved by
// `getPlanForBroker` below but never imports anything else from this file.
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
import { isNonEmptyString, isSlug, isInteger, isPrice, assertValid, ValidationError } from "../core/validation.js";
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

/**
 * The only module keys a plan's `modules` map may toggle (§52). Kept here
 * — not in `modules/plans/` — because §39 forbids business/ depending on
 * modules/; `modules/plans/features.js` imports this list back out to
 * attach display labels for SuperAdmin/eligibility consumers.
 *
 * Only `publications` (§47) and `feeds` (§46) are included. The other
 * Etapa 9 modules were evaluated and left out — see this lot's PR
 * description for the per-module reasoning (in short: appointments/
 * tour-360/video-youtube are per-listing fields with no broker-level
 * enable/disable structure to gate; comparison/financing-calculator/
 * saved-search/pwa have no broker association at all, or are platform-
 * wide; ai-search is still an unbuilt placeholder). `financial` (§51) is
 * deliberately excluded too, even though it's built now (Etapa 10, behind
 * `FINANCIAL_ENABLED`, see modules/financial/README.md) — it's a
 * platform-wide kill switch, not a per-plan grant, so it has no business
 * being a boolean a plan's `modules` map could toggle per broker. Adding a
 * module here later is additive — no migration needed for existing plans.
 */
export const PLAN_MODULE_KEYS = ["publications", "feeds"];

function isPlanModules(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, val]) => PLAN_MODULE_KEYS.includes(key) && typeof val === "boolean");
}

const CREATE_ALLOWED_FIELDS = ["planId", "name", "monthlyPrice", "setupPrice", "maxGalleryItems", "maxActiveListings", "modules"];
const UPDATE_ALLOWED_FIELDS = ["name", "monthlyPrice", "setupPrice", "maxGalleryItems", "maxActiveListings", "modules"];

const FIELD_RULES = {
  planId: isSlug,
  name: (v) => isNonEmptyString(v, { maxLength: 200 }),
  monthlyPrice: isPrice,
  setupPrice: isPrice,
  maxGalleryItems: (v) => isInteger(v) && v >= 1,
  // Nullable — `null`/omitted means unlimited (core/validation.js#validate
  // skips the rule for null/undefined values, so this only runs when a
  // real value was sent).
  maxActiveListings: (v) => isInteger(v) && v >= 1,
  modules: isPlanModules,
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
    monthlyPrice: 0,
    setupPrice: 0,
    maxGalleryItems: DEFAULT_PLAN_MAX_GALLERY_ITEMS,
    maxActiveListings: null,
    modules: {},
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
    monthlyPrice: picked.monthlyPrice ?? 0,
    setupPrice: picked.setupPrice ?? 0,
    maxGalleryItems: picked.maxGalleryItems,
    maxActiveListings: picked.maxActiveListings ?? null,
    modules: picked.modules ?? {},
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
 * that silently vanished — `getPlanForBroker` above only falls back to
 * the default plan for a *stale/unknown* planId, not as a substitute for
 * this guard).
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

// --- resolução de plano/limites por corretor (§52, §56-57) -----------------

/**
 * Resolves the plan record that applies to `brokerId` right now: its
 * assigned plan, falling back to the seeded DEFAULT_PLAN_ID plan when the
 * broker has no plan assigned, the broker itself can't be resolved, or its
 * assigned planId no longer exists (e.g. legacy `plan` free text from
 * before Etapa 8b, or a since-deleted plan). Never returns null/undefined.
 * Shared resolver behind every per-broker plan lookup below, and behind
 * modules/plans/eligibility.js's module-toggle checks.
 */
export async function getPlanForBroker(env, brokerId) {
  const broker = await getBrokerById(env, brokerId);
  const planId = isNonEmptyString(broker?.plan) ? broker.plan : DEFAULT_PLAN_ID;

  return (await getPlanById(env, planId)) ?? (await ensureDefaultPlan(env));
}

/**
 * Resolves the gallery-photo limit for `brokerId`'s plan. This is the
 * single source of truth business/listings.js and worker/uploads.js both
 * call into — no more separate hardcoded cap (substitui
 * PROVISIONAL_MAX_GALLERY_ITEMS).
 */
export async function getGalleryLimitForBroker(env, brokerId) {
  const plan = await getPlanForBroker(env, brokerId);
  return plan.maxGalleryItems;
}

/**
 * Resolves the active-listings limit for `brokerId`'s plan — `null` means
 * unlimited (the field is optional; a plan created before this lot, or
 * the seeded default plan, has no value for it). Reverses the "fora de
 * escopo" call Etapa 8b made on this exact limit (docs/CHANGELOG.md) —
 * the field is real now, mirroring `getGalleryLimitForBroker` above.
 *
 * NOT enforced anywhere yet. No caller in business/listings.js — wiring a
 * cap into `createListing` would change already-shipped listing-creation
 * behavior, which needs confirmation first (same posture this lot took
 * for modules/plans/eligibility.js not being wired into
 * modules/publications or modules/feeds). This resolver only exists so
 * that decision, once made, doesn't also need a resolver written from
 * scratch.
 */
export async function getActiveListingLimitForBroker(env, brokerId) {
  const plan = await getPlanForBroker(env, brokerId);
  return plan.maxActiveListings ?? null;
}
