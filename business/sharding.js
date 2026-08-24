// business/sharding.js
//
// Etapa 7 — Escala (§90, §7-9, §32-36). Pure shard-placement logic used by
// business/publishing.js. Nothing here touches R2 — it only decides "does
// this card fit in this shard?" and "how do N cards split into shards?",
// which is what makes the decisions independently unit-testable
// (tests/business/sharding.test.js) without a FakeR2Bucket.
//
// §9's limit is hybrid and whichever comes first: 300 cards OR ~1MB
// compressed. The count check is free; the byte check is the interesting
// part — see `estimateCompressedSize` below for how it stays cheap in the
// common case (small cards, city nowhere near 1MB) while still doing a
// real gzip pass once a shard's uncompressed JSON gets close to the target.

import { MAX_CARDS_PER_SHARD, TARGET_COMPRESSED_SHARD_BYTES } from "../storage/keys.js";

/**
 * Estimates the gzip-compressed byte size of `value` (JSON-serialized).
 * Real card/JSON content only ever shrinks under gzip (repeated key names,
 * mostly ASCII text), so whenever the *uncompressed* JSON already fits
 * under the target, the compressed size is guaranteed to fit too — no need
 * to actually run gzip for the overwhelmingly common case of a shard far
 * below 1MB. Only once the uncompressed size crosses the target does this
 * pay for a real `CompressionStream("gzip")` pass, to get a true answer
 * instead of a guess.
 *
 * Falls back to the uncompressed length (a conservative overestimate) if
 * `CompressionStream` isn't available in the runtime — both the Workers
 * runtime and Node >=18 (this repo's minimum, per package.json#engines)
 * have it, so this is defensive, not an expected path.
 */
export async function estimateCompressedSize(value) {
  const json = JSON.stringify(value);
  if (json.length <= TARGET_COMPRESSED_SHARD_BYTES) return json.length;
  if (typeof CompressionStream === "undefined") return json.length;
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
  const compressed = await new Response(stream).arrayBuffer();
  return compressed.byteLength;
}

/** Would `card` fit into a shard that already holds `existingCards` (§9)? */
export async function cardFitsInShard(existingCards, card) {
  if (existingCards.length + 1 > MAX_CARDS_PER_SHARD) return false;
  const projectedSize = await estimateCompressedSize([...existingCards, card]);
  return projectedSize <= TARGET_COMPRESSED_SHARD_BYTES;
}

/**
 * Splits `cards` (in the given order) into shards, greedily filling each
 * shard until the next card wouldn't fit (§9), then starting a new one.
 * Used by `rebuildCity` to fully repartition a city from scratch — the
 * incremental publish path (`business/publishing.js#applyCardToCity`)
 * never resplits an existing shard, it only ever appends to the last one
 * or opens a new one (see that file's header for why).
 *
 * Returns `[]` for an empty city (§77 — a manifest with `shards: []`), not
 * `[[]]`.
 */
export async function partitionCardsIntoShards(cards) {
  if (cards.length === 0) return [];
  const shards = [];
  let current = [];
  for (const card of cards) {
    if (current.length > 0 && !(await cardFitsInShard(current, card))) {
      shards.push(current);
      current = [];
    }
    current.push(card);
  }
  shards.push(current);
  return shards;
}
