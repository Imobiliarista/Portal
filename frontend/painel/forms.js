// frontend/painel/forms.js
//
// Pure FormData -> API payload builders for the painel's forms (§54). Kept
// separate from render.js (which only builds/reads DOM nodes) so the
// mapping onto business/brokers.js's/business/listings.js's allowlisted
// shapes is unit-testable without a DOM. Client-side "validation" here is
// only ever a UX nicety — assertValid/FIELD_RULES on the Worker (§78) is
// the actual source of truth and is never bypassed by anything this file
// does.

// modules/video-youtube (§50): parseYoutubeId is generated from
// modules/video-youtube/index.js — see frontend/shared/video-youtube.generated.js.
export { parseYoutubeId } from "../shared/video-youtube.generated.js";

/** Only forwards non-empty allowlisted fields — matches business/brokers.js#PROFILE_UPDATE_ALLOWED_FIELDS. */
export function buildProfilePatch(entries) {
  const patch = {};
  for (const key of ["name", "email", "creci", "phone", "whatsapp", "city", "about"]) {
    const value = typeof entries[key] === "string" ? entries[key].trim() : "";
    if (value) patch[key] = value;
  }
  return patch;
}

function numberOrUndefined(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Builds the business/listings.js create/update payload from a listing form's FormData. Empty optional fields are simply omitted (not sent as null) — clearing a value to null isn't a workflow this form exposes. */
export function buildListingPayload(formData) {
  const get = (name) => (formData.get(name) ?? "").toString();
  const payload = {};

  const setStr = (key) => {
    const value = get(key).trim();
    if (value) payload[key] = value;
  };
  const setNum = (key) => {
    const value = numberOrUndefined(get(key));
    if (value !== undefined) payload[key] = value;
  };

  setStr("title");
  const description = get("description").trim();
  if (description) payload.description = description;
  setStr("purpose");
  setStr("type");
  setStr("city");
  setStr("district");
  setNum("price");
  setNum("condominium");
  setNum("iptu");
  setNum("latitude");
  setNum("longitude");

  const bedrooms = numberOrUndefined(get("bedrooms"));
  const bathrooms = numberOrUndefined(get("bathrooms"));
  const parkingSpaces = numberOrUndefined(get("parkingSpaces"));
  const area = numberOrUndefined(get("area"));
  if ([bedrooms, bathrooms, parkingSpaces, area].every((value) => value !== undefined)) {
    payload.features = { bedrooms, bathrooms, parkingSpaces, area };
  }

  const status = get("status");
  if (status) payload.status = status;

  const videoId = parseYoutubeId(get("videoUrl"));
  payload.video = videoId ? { provider: "youtube", id: videoId } : null;

  const tourUrl = get("tour360Url").trim();
  payload.tour360 = tourUrl ? { url: tourUrl } : null;

  return payload;
}
