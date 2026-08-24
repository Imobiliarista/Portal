// worker/uploads.js
//
// Media upload/delete HTTP layer (§56-57, §25, Etapa 5 — §90). Browser never
// gets an R2 credential (§56): this is the only place a multipart upload
// touches storage/media.js#putMedia, after requireTenant + per-file
// validation. Video is out of scope here (see storage/media.js's header
// comment) — a listing's `video` field is a YouTube URL, validated by
// business/listings.js, not a file this module ever sees.
//
// §58: uploading itself never writes a public projection directly (R2
// DATA) — the resulting URL is written into the private draft's
// gallery/profile field first, same as before Etapa 6. What's new this
// etapa: every mutation here also calls into business/publishing.js
// afterward, same as worker/api.js's listing/profile routes — a cover
// photo is explicitly one of §32's publish triggers ("mudou capa... →
// shard afetado"). Both publish calls are no-ops for a listing/broker that
// was never live (draft/pending) — see business/publishing.js's
// `shouldPublish`/status-mapping — so this is safe even for media attached
// to a not-yet-published draft.
//
// Etapa 8b (§52/§53) change to this Etapa-5 file: the gallery-full check
// below no longer reads the fixed `PROVISIONAL_MAX_GALLERY_ITEMS` constant
// (removed from business/listings.js) — it now asks
// business/plans.js#getGalleryLimitForBroker for the uploading broker's
// actual plan limit, falling back to a seeded default plan when none is
// assigned.

import { requireTenant } from "./auth.js";
import { can } from "../core/permissions.js";
import { ForbiddenError } from "../core/permissions.js";
import { assertTenantMatch } from "../core/tenant.js";
import { assertValidMedia, MediaValidationError, putMedia, deleteMedia } from "../storage/media.js";
import { mediaKeys } from "../storage/keys.js";
import {
  getListingById,
  updateListing,
  ListingNotFoundError,
  GalleryLimitExceededError,
} from "../business/listings.js";
import { updateBrokerProfile } from "../business/brokers.js";
import { getGalleryLimitForBroker } from "../business/plans.js";
import { publishListing, publishBroker } from "../business/publishing.js";
import { success, badRequest, notFound, conflict } from "../core/response.js";

// Hardcoded per the architecture doc's fixed domain map (§1) and matching
// the literal already baked into core/security.js's CSP — there's no other
// shared constant for it in the codebase to import instead.
const MEDIA_BASE_URL = "https://media.imobiliarista.net";

function buildMediaUrl(key) {
  return `${MEDIA_BASE_URL}/${key}`;
}

// The DELETE route needs an opaque single-segment id (router params can't
// contain "/"), but ownership checks need the real R2 key. Rather than add
// a new index just to map one to the other (§93 non-regression forbids
// reaching for new storage for this), the id IS the key, base64url-encoded
// — still derived deterministically from storage/keys.js, nothing new to
// keep in sync.
function encodeMediaId(key) {
  const bytes = new TextEncoder().encode(key);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeMediaId(id) {
  const padded = id.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(padded + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const UPLOAD_TARGETS = new Set(["listing-gallery", "broker-logo", "broker-cover"]);

function newFileName(extension) {
  return `${crypto.randomUUID()}.${extension}`;
}

function requireOwnBrokerId(tenant) {
  if (!tenant) throw new ForbiddenError("Esta conta não possui um corretor associado.");
  return tenant.brokerId;
}

// --- POST /api/me/media -------------------------------------------------
export async function handleUploadMedia(request, env) {
  const { session, tenant } = await requireTenant(request, env);
  const brokerId = requireOwnBrokerId(tenant);
  if (!can(session, "media:upload")) throw new ForbiddenError();

  let form;
  try {
    form = await request.formData();
  } catch {
    return badRequest("Corpo multipart/form-data inválido.");
  }

  const file = form.get("file");
  const target = form.get("target");
  const listingId = form.get("listingId");

  if (!file || typeof file.arrayBuffer !== "function") {
    return badRequest('Campo "file" ausente ou inválido.');
  }
  if (typeof target !== "string" || !UPLOAD_TARGETS.has(target)) {
    return badRequest('Campo "target" deve ser "listing-gallery", "broker-logo" ou "broker-cover".');
  }
  if (target === "listing-gallery" && (typeof listingId !== "string" || listingId.length === 0)) {
    return badRequest('Campo "listingId" é obrigatório para target "listing-gallery".');
  }

  const contentType = file.type;
  const buffer = await file.arrayBuffer();
  const byteLength = buffer.byteLength;

  let extension;
  try {
    ({ extension } = assertValidMedia(contentType, byteLength));
  } catch (error) {
    if (error instanceof MediaValidationError) return badRequest(error.message);
    throw error;
  }

  if (target === "listing-gallery") {
    const listing = await getListingById(env, listingId);
    if (!listing) return notFound("Anúncio não encontrado.");
    assertTenantMatch(session, listing.brokerId); // superadmin-exempt; throws TenantMismatchError -> 403 centrally

    const currentGallery = listing.gallery ?? [];
    const galleryLimit = await getGalleryLimitForBroker(env, listing.brokerId);
    if (currentGallery.length >= galleryLimit) {
      return conflict(`Limite de ${galleryLimit} fotos por anúncio atingido para o plano deste corretor.`);
    }

    const key = mediaKeys.listingGalleryItem(listingId, newFileName(extension));
    await putMedia(env, key, buffer, { contentType, byteLength });
    const url = buildMediaUrl(key);

    try {
      await updateListing(env, listing.brokerId, listingId, { gallery: [...currentGallery, url] });
      await publishListing(env, listingId);
    } catch (error) {
      if (error instanceof ListingNotFoundError) return notFound(error.message);
      // Defesa contra corrida entre o pré-check acima e esta escrita
      // (duas requisições concorrentes de upload) — mesma resposta 409 do
      // pré-check, não um 500.
      if (error instanceof GalleryLimitExceededError) return conflict(error.message);
      throw error;
    }

    return success({ id: encodeMediaId(key), url, target, listingId }, { status: 201 });
  }

  // broker-logo / broker-cover: a single slot, overwritten on each upload —
  // no quantity cap needed (there's only ever one).
  const key =
    target === "broker-logo"
      ? mediaKeys.brokerLogo(brokerId, extension)
      : mediaKeys.brokerCover(brokerId, extension);

  await putMedia(env, key, buffer, { contentType, byteLength });
  const url = buildMediaUrl(key);

  const field = target === "broker-logo" ? "logo" : "cover";
  await updateBrokerProfile(env, brokerId, { [field]: url });
  await publishBroker(env, brokerId);

  return success({ id: encodeMediaId(key), url, target }, { status: 201 });
}

// --- DELETE /api/me/media/:id -----------------------------------------------
const LISTING_GALLERY_KEY = /^listings\/([^/]+)\/gallery\/[^/]+$/;
const BROKER_LOGO_KEY = /^brokers\/([^/]+)\/logo\.[a-z0-9]+$/;
const BROKER_COVER_KEY = /^brokers\/([^/]+)\/cover\.[a-z0-9]+$/;

export async function handleDeleteMedia(request, env, ctx, params) {
  const { session, tenant } = await requireTenant(request, env);
  requireOwnBrokerId(tenant);
  if (!can(session, "media:delete")) throw new ForbiddenError();

  let key;
  try {
    key = decodeMediaId(params.id);
  } catch {
    return badRequest("Identificador de mídia inválido.");
  }

  const galleryMatch = LISTING_GALLERY_KEY.exec(key);
  if (galleryMatch) {
    const listingId = galleryMatch[1];
    const listing = await getListingById(env, listingId);
    if (!listing) return notFound("Anúncio não encontrado.");
    assertTenantMatch(session, listing.brokerId);

    const url = buildMediaUrl(key);
    const nextGallery = (listing.gallery ?? []).filter((item) => item !== url);
    await deleteMedia(env, key);
    await updateListing(env, listing.brokerId, listingId, { gallery: nextGallery });
    await publishListing(env, listingId);
    return success({ deleted: true });
  }

  const logoMatch = BROKER_LOGO_KEY.exec(key);
  const coverMatch = BROKER_COVER_KEY.exec(key);
  const brokerMatch = logoMatch ?? coverMatch;
  if (brokerMatch) {
    const brokerId = brokerMatch[1];
    assertTenantMatch(session, brokerId);

    await deleteMedia(env, key);
    await updateBrokerProfile(env, brokerId, { [logoMatch ? "logo" : "cover"]: null });
    await publishBroker(env, brokerId);
    return success({ deleted: true });
  }

  return badRequest("Identificador de mídia não reconhecido.");
}
