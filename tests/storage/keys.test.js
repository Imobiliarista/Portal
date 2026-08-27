import { test } from "node:test";
import assert from "node:assert/strict";
import {
  privateKeys,
  dataKeys,
  mediaKeys,
  shardFileName,
  MAX_CARDS_PER_SHARD,
  TARGET_COMPRESSED_SHARD_BYTES,
} from "../../storage/keys.js";

test("§9 shard limits match the documented constants", () => {
  assert.equal(MAX_CARDS_PER_SHARD, 300);
  assert.equal(TARGET_COMPRESSED_SHARD_BYTES, 1_000_000);
});

test("shardFileName zero-pads to 3 digits like the §12 example", () => {
  assert.equal(shardFileName(1), "001.json");
  assert.equal(shardFileName(23), "023.json");
  assert.equal(shardFileName(300), "300.json");
});

test("shardFileName rejects non-positive integers", () => {
  assert.throws(() => shardFileName(0));
  assert.throws(() => shardFileName(-1));
  assert.throws(() => shardFileName(1.5));
});

test("privateKeys build the §23 layout", () => {
  assert.equal(privateKeys.brokerManifest("broker_000123"), "brokers/broker_000123/manifest.json");
  assert.equal(privateKeys.listingDraft("listing_000456"), "listings/listing_000456/draft.json");
  assert.equal(privateKeys.authUser("user_000789"), "auth/user_000789.json");
  assert.equal(privateKeys.slugIndex("joao"), "indexes/slugs/joao.json");
  assert.equal(privateKeys.brokerEmailIndex("abc123"), "indexes/broker-emails/abc123.json");
  assert.equal(privateKeys.job("cities", "londrina"), "jobs/cities/londrina.json");
  assert.equal(privateKeys.plan("premium"), "plans/premium.json");
  assert.equal(privateKeys.planRegistry(), "indexes/plans.json");
});

// Etapa 2 (missão "materializa read models R2") — contrato canônico das 3
// chaves globais do portal. Este teste deve falhar se qualquer uma delas
// mudar de valor silenciosamente: frontend/portal/data.js,
// business/publishing.js#publishPortalCatalogs e
// business/r2ReadModelsAdapter.js dependem dos 3 literais exatos abaixo.
test("dataKeys.portal{Cities,Taxonomy,Modules} are the exact canonical global read model keys", () => {
  assert.equal(dataKeys.portalCities(), "portal/cities.json");
  assert.equal(dataKeys.portalTaxonomy(), "portal/taxonomy.json");
  assert.equal(dataKeys.portalModules(), "portal/modules.json");
});

test("dataKeys build the §24 layout, including city shards (§12)", () => {
  assert.equal(dataKeys.portalCities(), "portal/cities.json");
  assert.equal(dataKeys.cityManifest("sao-paulo"), "cities/sao-paulo/manifest.json");
  assert.equal(dataKeys.cityShard("sao-paulo", 3), "cities/sao-paulo/003.json");
  assert.equal(dataKeys.listingPublic("apartamento-centro-123"), "listings/apartamento-centro-123.json");
  assert.equal(dataKeys.brokerProfilePublic("joao"), "brokers/joao/profile.json");
  assert.equal(dataKeys.exportCity("londrina"), "exports/cities/londrina.json");
});

test("mediaKeys build the §25 layout", () => {
  assert.equal(mediaKeys.listingCover("listing_000456", 1), "listings/listing_000456/cover-v1.webp");
  assert.equal(
    mediaKeys.listingGalleryItem("listing_000456", "foto-01.webp"),
    "listings/listing_000456/gallery/foto-01.webp",
  );
  assert.equal(mediaKeys.brokerLogo("broker_000123"), "brokers/broker_000123/logo.webp");
});

test("key builders reject path-traversal attempts in any segment", () => {
  assert.throws(() => privateKeys.brokerManifest("../etc/passwd"));
  assert.throws(() => dataKeys.listingPublic("../../secret"));
  assert.throws(() => mediaKeys.listingGalleryItem("listing_1", "../escape.webp"));
  assert.throws(() => privateKeys.brokerManifest(""));
});
