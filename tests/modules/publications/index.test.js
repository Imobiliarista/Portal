import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDefaultBloggerFeedUrl,
  looksLikeAtomFeed,
  discoverFeedUrlFromHtml,
  resolveBloggerFeedUrl,
  parseAtomFeed,
  formatPublicationDate,
  renderFrontendModuleSource,
} from "../../../modules/publications/index.js";

// --- buildDefaultBloggerFeedUrl ---------------------------------------------

test("buildDefaultBloggerFeedUrl builds the standard Blogger Atom feed path", () => {
  assert.equal(buildDefaultBloggerFeedUrl("https://fulano.blogspot.com"), "https://fulano.blogspot.com/feeds/posts/default");
});

test("buildDefaultBloggerFeedUrl ignores any path/query the corretor pasted along with the blog link", () => {
  assert.equal(
    buildDefaultBloggerFeedUrl("https://fulano.blogspot.com/2024/05/algum-post.html?x=1"),
    "https://fulano.blogspot.com/feeds/posts/default",
  );
});

test("buildDefaultBloggerFeedUrl returns null for empty/invalid/non-http input", () => {
  assert.equal(buildDefaultBloggerFeedUrl(""), null);
  assert.equal(buildDefaultBloggerFeedUrl("   "), null);
  assert.equal(buildDefaultBloggerFeedUrl(null), null);
  assert.equal(buildDefaultBloggerFeedUrl(undefined), null);
  assert.equal(buildDefaultBloggerFeedUrl("not a url"), null);
  assert.equal(buildDefaultBloggerFeedUrl("ftp://fulano.blogspot.com"), null);
});

// --- looksLikeAtomFeed -------------------------------------------------------

test("looksLikeAtomFeed recognizes an Atom root element", () => {
  assert.equal(looksLikeAtomFeed('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>'), true);
});

test("looksLikeAtomFeed rejects non-Atom content (HTML error page, RSS, garbage)", () => {
  assert.equal(looksLikeAtomFeed("<html><body>404</body></html>"), false);
  assert.equal(looksLikeAtomFeed("<rss><channel></channel></rss>"), false);
  assert.equal(looksLikeAtomFeed(""), false);
  assert.equal(looksLikeAtomFeed(null), false);
  assert.equal(looksLikeAtomFeed(undefined), false);
});

// --- discoverFeedUrlFromHtml -------------------------------------------------

const BLOG_HOME_HTML = `<!doctype html>
<html>
<head>
<link rel="alternate" type="application/rss+xml" title="RSS" href="/feeds/posts/default?alt=rss" />
<link rel="alternate" type="application/atom+xml" title="Fulano - Atom" href="https://fulano.blogspot.com/feeds/posts/default" />
</head>
<body></body>
</html>`;

test("discoverFeedUrlFromHtml finds the Atom autodiscovery link, ignoring an RSS one", () => {
  assert.equal(
    discoverFeedUrlFromHtml(BLOG_HOME_HTML, "https://fulano.blogspot.com"),
    "https://fulano.blogspot.com/feeds/posts/default",
  );
});

test("discoverFeedUrlFromHtml resolves a relative href against baseUrl", () => {
  const html = `<link rel="alternate" type="application/atom+xml" href="/feeds/posts/default" />`;
  assert.equal(discoverFeedUrlFromHtml(html, "https://fulano.blogspot.com/algum-post"), "https://fulano.blogspot.com/feeds/posts/default");
});

test("discoverFeedUrlFromHtml doesn't care about attribute order", () => {
  const html = `<link href="/feeds/posts/default" type="application/atom+xml" rel="alternate" />`;
  assert.equal(discoverFeedUrlFromHtml(html, "https://fulano.blogspot.com"), "https://fulano.blogspot.com/feeds/posts/default");
});

test("discoverFeedUrlFromHtml returns null when there's no Atom autodiscovery link", () => {
  assert.equal(discoverFeedUrlFromHtml("<html><head></head></html>", "https://fulano.blogspot.com"), null);
  assert.equal(discoverFeedUrlFromHtml("", "https://fulano.blogspot.com"), null);
  assert.equal(discoverFeedUrlFromHtml(null, "https://fulano.blogspot.com"), null);
});

// --- resolveBloggerFeedUrl ---------------------------------------------------

function fakeResponse(body, { ok = true } = {}) {
  return { ok, text: async () => body };
}

const ATOM_BODY = '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry></entry></feed>';

test("resolveBloggerFeedUrl accepts the default {origin}/feeds/posts/default path when it works", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return fakeResponse(ATOM_BODY);
  };
  const result = await resolveBloggerFeedUrl("https://fulano.blogspot.com", { fetchImpl });
  assert.equal(result, "https://fulano.blogspot.com/feeds/posts/default");
  assert.deepEqual(calls, ["https://fulano.blogspot.com/feeds/posts/default"]);
});

test("resolveBloggerFeedUrl falls back to autodiscovery when the default path doesn't look like Atom", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (calls.length === 1) return fakeResponse("<html>not a feed</html>"); // default guess: not Atom
    if (calls.length === 2) return fakeResponse(BLOG_HOME_HTML); // blog page: has the autodiscovery link
    return fakeResponse(ATOM_BODY); // verify the discovered feed
  };
  const result = await resolveBloggerFeedUrl("https://fulano.blogspot.com", { fetchImpl });
  assert.equal(result, "https://fulano.blogspot.com/feeds/posts/default");
  assert.deepEqual(calls, [
    "https://fulano.blogspot.com/feeds/posts/default", // 1) default guess
    "https://fulano.blogspot.com", // 2) blog page (autodiscovery)
    "https://fulano.blogspot.com/feeds/posts/default", // 3) verify the discovered url
  ]);
});

test("resolveBloggerFeedUrl returns null when the default path fails and the blog page has no autodiscovery link", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (calls.length === 1) return fakeResponse("not a feed", { ok: false }); // default guess: 404
    return fakeResponse("<html><head></head></html>"); // blog page: no <link rel=alternate>
  };
  assert.equal(await resolveBloggerFeedUrl("https://fulano.blogspot.com", { fetchImpl }), null);
});

test("resolveBloggerFeedUrl returns null when the discovered feed itself doesn't verify as Atom", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (calls.length === 1) return fakeResponse("not a feed", { ok: false }); // default guess: 404
    if (calls.length === 2) return fakeResponse(BLOG_HOME_HTML); // blog page: has the autodiscovery link
    return fakeResponse("<html>still not atom</html>"); // verify: 200 OK but not Atom
  };
  assert.equal(await resolveBloggerFeedUrl("https://fulano.blogspot.com", { fetchImpl }), null);
});

test("resolveBloggerFeedUrl never throws — a network error just resolves to null", async () => {
  const fetchImpl = async () => {
    throw new Error("network down");
  };
  assert.equal(await resolveBloggerFeedUrl("https://fulano.blogspot.com", { fetchImpl }), null);
});

test("resolveBloggerFeedUrl returns null for an invalid blogUrl without ever calling fetch", async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return fakeResponse(ATOM_BODY);
  };
  assert.equal(await resolveBloggerFeedUrl("not a url", { fetchImpl }), null);
  assert.equal(called, false);
});

// --- parseAtomFeed ------------------------------------------------------------

const SAMPLE_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Hello &amp; Welcome</title>
    <link rel="self" type="application/atom+xml" href="https://fulano.blogspot.com/feeds/posts/default/1"/>
    <link rel="alternate" type="text/html" href="https://fulano.blogspot.com/2024/05/hello.html"/>
    <published>2024-05-01T10:00:00.000-07:00</published>
    <updated>2024-05-02T10:00:00.000-07:00</updated>
    <summary type="html">&lt;p&gt;Some &lt;b&gt;summary&lt;/b&gt; text.&lt;/p&gt;</summary>
  </entry>
  <entry>
    <title><![CDATA[CDATA Title]]></title>
    <link href="https://fulano.blogspot.com/2024/04/second.html"/>
    <content type="html"><![CDATA[<div>Body without an explicit summary tag.</div>]]></content>
  </entry>
  <entry>
    <link rel="alternate" href="https://fulano.blogspot.com/2024/03/no-title.html"/>
  </entry>
  <entry>
    <title>No link at all</title>
  </entry>
</feed>`;

test("parseAtomFeed extracts title/url/date/summary, decoding entities and stripping tags", () => {
  const items = parseAtomFeed(SAMPLE_FEED);
  assert.equal(items.length, 2); // the two malformed entries (no title / no link) are skipped
  assert.deepEqual(items[0], {
    title: "Hello & Welcome",
    url: "https://fulano.blogspot.com/2024/05/hello.html",
    publishedAt: "2024-05-01T10:00:00.000-07:00",
    summary: "Some summary text.",
  });
});

test("parseAtomFeed unwraps CDATA and falls back to <content> when <summary> is absent", () => {
  const items = parseAtomFeed(SAMPLE_FEED);
  assert.equal(items[1].title, "CDATA Title");
  assert.equal(items[1].summary, "Body without an explicit summary tag.");
});

test("parseAtomFeed prefers rel=\"alternate\" over rel=\"self\"", () => {
  const items = parseAtomFeed(SAMPLE_FEED);
  assert.equal(items[0].url, "https://fulano.blogspot.com/2024/05/hello.html");
});

test("parseAtomFeed skips entries missing a title or a link", () => {
  const items = parseAtomFeed(SAMPLE_FEED);
  assert.ok(!items.some((item) => item.title === "No link at all"));
  assert.ok(!items.some((item) => item.url === "https://fulano.blogspot.com/2024/03/no-title.html"));
});

test("parseAtomFeed caps the number of entries via `limit`", () => {
  const manyEntries = Array.from(
    { length: 15 },
    (_, i) => `<entry><title>Post ${i}</title><link rel="alternate" href="https://fulano.blogspot.com/${i}.html"/></entry>`,
  ).join("\n");
  const feed = `<feed xmlns="http://www.w3.org/2005/Atom">${manyEntries}</feed>`;
  assert.equal(parseAtomFeed(feed).length, 10); // default limit
  assert.equal(parseAtomFeed(feed, { limit: 3 }).length, 3);
});

test("parseAtomFeed truncates a very long summary", () => {
  const longText = "a".repeat(400);
  const feed = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>T</title><link rel="alternate" href="https://fulano.blogspot.com/x.html"/><summary>${longText}</summary></entry></feed>`;
  const items = parseAtomFeed(feed);
  assert.equal(items[0].summary.length, 281); // 280 chars + ellipsis
  assert.ok(items[0].summary.endsWith("…"));
});

test("parseAtomFeed returns [] for non-Atom/empty/non-string input — never throws", () => {
  assert.deepEqual(parseAtomFeed("<html>not a feed</html>"), []);
  assert.deepEqual(parseAtomFeed(""), []);
  assert.deepEqual(parseAtomFeed(null), []);
  assert.deepEqual(parseAtomFeed(undefined), []);
  assert.deepEqual(parseAtomFeed(123), []);
});

test("parseAtomFeed returns [] for a well-formed but entry-less feed", () => {
  assert.deepEqual(parseAtomFeed('<feed xmlns="http://www.w3.org/2005/Atom"></feed>'), []);
});

// --- formatPublicationDate ----------------------------------------------------

test("formatPublicationDate formats an RFC3339 date as pt-BR", () => {
  assert.equal(formatPublicationDate("2024-05-01T10:00:00.000Z"), new Date("2024-05-01T10:00:00.000Z").toLocaleDateString("pt-BR"));
});

test("formatPublicationDate returns an empty string for missing/invalid input — never throws", () => {
  assert.equal(formatPublicationDate(""), "");
  assert.equal(formatPublicationDate(null), "");
  assert.equal(formatPublicationDate(undefined), "");
  assert.equal(formatPublicationDate("not a date"), "");
});

// --- renderFrontendModuleSource ------------------------------------------------

test("renderFrontendModuleSource embeds every exported function as a standalone ESM module", () => {
  const source = renderFrontendModuleSource();
  for (const name of [
    "readPublicationsConfig",
    "validatePublicationsConfig",
    "looksLikeAtomFeed",
    "buildDefaultBloggerFeedUrl",
    "discoverFeedUrlFromHtml",
    "resolveBloggerFeedUrl",
    "parseAtomFeed",
    "formatPublicationDate",
  ]) {
    assert.match(source, new RegExp(`export (async )?function ${name}`));
  }
  assert.doesNotMatch(source, /^import /m);
});

test("renderFrontendModuleSource output is loadable and behaves identically to the source functions", async () => {
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const dir = mkdtempSync(join(tmpdir(), "publications-generated-"));
  const path = join(dir, "publications.generated.js");
  writeFileSync(path, renderFrontendModuleSource());

  const generated = await import(`file://${path}`);

  assert.deepEqual(generated.parseAtomFeed(SAMPLE_FEED)[0], parseAtomFeed(SAMPLE_FEED)[0]);
  assert.equal(generated.buildDefaultBloggerFeedUrl("https://fulano.blogspot.com"), "https://fulano.blogspot.com/feeds/posts/default");
  assert.deepEqual(generated.readPublicationsConfig({}), { enabled: false, feedUrl: null });
  assert.deepEqual(
    generated.validatePublicationsConfig({ enabled: true, feedUrl: "https://fulano.blogspot.com/feeds/posts/default" }),
    { valid: true, config: { enabled: true, feedUrl: "https://fulano.blogspot.com/feeds/posts/default" } },
  );

  const fetchImpl = async () => ({ ok: true, text: async () => ATOM_BODY });
  assert.equal(
    await generated.resolveBloggerFeedUrl("https://fulano.blogspot.com", { fetchImpl }),
    "https://fulano.blogspot.com/feeds/posts/default",
  );
});
