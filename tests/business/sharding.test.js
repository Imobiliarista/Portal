// Etapa 7 — Escala (§9, §90). Testes puros sobre business/sharding.js —
// decisões de particionamento isoladas da leitura/escrita em R2 (essa parte
// é coberta em tests/publishing/sharding.test.js, contra o publicador de
// verdade).

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  estimateCompressedSize,
  cardFitsInShard,
  partitionCardsIntoShards,
} from "../../business/sharding.js";
import { MAX_CARDS_PER_SHARD, TARGET_COMPRESSED_SHARD_BYTES } from "../../storage/keys.js";

function tinyCard(id) {
  return { id, slug: `card-${id}`, title: "Card" };
}

// High-entropy hex filler barely compresses (gzip can't beat ~0.54x on true
// random bytes — no repeated substrings for LZ77, no skew for Huffman),
// unlike repeated JSON keys/values — this is how the tests below hit the
// ~1MB compressed limit (§9) with a handful of cards instead of needing
// hundreds of realistic ones.
function randomFiller(length) {
  return randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length);
}

function bulkyCard(id, fillerLength) {
  return { id, slug: `card-${id}`, title: randomFiller(fillerLength) };
}

// --- estimateCompressedSize ------------------------------------------------

test("estimateCompressedSize returns the exact uncompressed length when it already fits under the target (fast path, no gzip)", async () => {
  const value = { a: 1, b: "x".repeat(100) };
  const size = await estimateCompressedSize(value);
  assert.equal(size, JSON.stringify(value).length);
});

test("estimateCompressedSize actually compresses once the uncompressed size crosses the target, and highly-repetitive content shrinks well below it", async () => {
  const value = { filler: "a".repeat(TARGET_COMPRESSED_SHARD_BYTES + 500_000) };
  const uncompressedLength = JSON.stringify(value).length;
  const size = await estimateCompressedSize(value);
  assert.ok(size < uncompressedLength, "gzip must shrink highly repetitive content");
  assert.ok(size < TARGET_COMPRESSED_SHARD_BYTES, "a run of one repeated character compresses far below 1MB");
});

// --- cardFitsInShard ---------------------------------------------------------

test("cardFitsInShard rejects the 301st card by count alone, even though it is tiny (§9)", async () => {
  const shard = Array.from({ length: MAX_CARDS_PER_SHARD }, (_, i) => tinyCard(i));
  assert.equal(await cardFitsInShard(shard, tinyCard("extra")), false);
});

test("cardFitsInShard accepts a card that keeps the shard at exactly the count limit", async () => {
  const shard = Array.from({ length: MAX_CARDS_PER_SHARD - 1 }, (_, i) => tinyCard(i));
  assert.equal(await cardFitsInShard(shard, tinyCard("last")), true);
});

test("cardFitsInShard rejects a card that would push compressed size past ~1MB, well under the 300-card count limit", async () => {
  // 5 existing cards x 320KB of random-hex filler each compress to ~870KB
  // (comfortably under the target); adding a 6th pushes it to ~1.04MB —
  // over the limit purely on bytes, nowhere near MAX_CARDS_PER_SHARD.
  const shard = Array.from({ length: 5 }, (_, i) => bulkyCard(i, 320_000));
  assert.ok(shard.length < MAX_CARDS_PER_SHARD);
  const nextCard = bulkyCard("extra", 320_000);
  assert.equal(await cardFitsInShard(shard, nextCard), false);
});

test("cardFitsInShard accepts a normal, small card in a shard far under both limits", async () => {
  assert.equal(await cardFitsInShard([tinyCard(1), tinyCard(2)], tinyCard(3)), true);
});

// --- partitionCardsIntoShards ------------------------------------------------

test("partitionCardsIntoShards returns [] for an empty city (§77 — never [[]])", async () => {
  assert.deepEqual(await partitionCardsIntoShards([]), []);
});

test("partitionCardsIntoShards keeps a small city in a single shard", async () => {
  const cards = [tinyCard(1), tinyCard(2), tinyCard(3)];
  const shards = await partitionCardsIntoShards(cards);
  assert.equal(shards.length, 1);
  assert.deepEqual(shards[0], cards);
});

test("partitionCardsIntoShards splits by count once a shard would exceed 300 cards (§9)", async () => {
  const cards = Array.from({ length: MAX_CARDS_PER_SHARD + 5 }, (_, i) => tinyCard(i));
  const shards = await partitionCardsIntoShards(cards);
  assert.equal(shards.length, 2);
  assert.equal(shards[0].length, MAX_CARDS_PER_SHARD);
  assert.equal(shards[1].length, 5);
  assert.deepEqual(shards.flat(), cards);
});

test("partitionCardsIntoShards splits by compressed size well under the count limit (§9)", async () => {
  const cards = Array.from({ length: 12 }, (_, i) => bulkyCard(i, 180_000));
  const shards = await partitionCardsIntoShards(cards);
  assert.ok(shards.length >= 2, "12 x ~180KB near-random cards must not fit in a single ~1MB shard");
  for (const shard of shards) assert.ok(shard.length < MAX_CARDS_PER_SHARD);
  assert.deepEqual(shards.flat().map((c) => c.id), cards.map((c) => c.id));
});
