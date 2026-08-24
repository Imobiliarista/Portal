// worker/uploads.js
//
// Media upload/delete HTTP layer (§56-57, §25, Etapa 5 — §90). Browser never
// gets an R2 credential (§56): this is the only place a multipart upload
// touches storage/media.js#putMedia, after requireTenant + per-file
// validation. Video is out of scope here (see storage/media.js's header
// comment) — a listing's `video` field is a YouTube URL, validated by
// business/listings.js, not a file this module ever sees.
//
// §58: uploading here does NOT touch any public projection (R2 DATA) — the
// resulting URL is only written into the private draft's gallery/profile
// field. Making it show up publicly is the publisher's job (Etapa 6).

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
  PROVISIONAL_MAX_GALLERY_ITEMS,
} from "../business/listings.js";
import { updateBrokerProfile } from "../business/brokers.js";
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
    if (currentGallery.length >= PROVISIONAL_MAX_GALLERY_ITEMS) {
      return conflict(`Limite de ${PROVISIONAL_MAX_GALLERY_ITEMS} fotos por anúncio atingido.`);
    }

    const key = mediaKeys.listingGalleryItem(listingId, newFileName(extension));
    await putMedia(env, key, buffer, { contentType, byteLength });
    const url = buildMediaUrl(key);

    try {
      await updateListing(env, listing.brokerId, listingId, { gallery: [...currentGallery, url] });
    } catch (error) {
      if (error instanceof ListingNotFoundError) return notFound(error.message);
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
    return success({ deleted: true });
  }

  return badRequest("Identificador de mídia não reconhecido.");
}
