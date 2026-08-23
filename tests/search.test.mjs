import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataset = JSON.parse(await readFile(path.join(root, "data", "ccf-2026.json"), "utf8"));
const source = await readFile(path.join(root, "extension", "shared", "search.js"), "utf8");
const sandbox = { URL, module: { exports: {} } };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: "search.js" });
const engine = sandbox.CCFRankSearch;
const index = engine.createIndex(dataset);

test("loads the complete official 2026 dataset", () => {
  assert.equal(index.items.length, 681);
  assert.equal(dataset.venues.filter((venue) => venue.type === "journal").length, 295);
  assert.equal(dataset.venues.filter((venue) => venue.type === "conference").length, 386);
});

test("finds a venue by current abbreviation", () => {
  const [result] = engine.search(index, "CVPR");
  assert.equal(result.venue.abbr, "CVPR");
  assert.equal(result.venue.rank, "A");
  assert.equal(result.reason, "abbreviation-exact");
});

test("finds renamed venues by former abbreviation and name", () => {
  const [eitee] = engine.search(index, "FITEE");
  assert.equal(eitee.venue.abbr, "EITEE");
  const [discover] = engine.search(index, "Information Retrieval Journal");
  assert.equal(discover.venue.name, "Discover Computing");
  assert.equal(discover.venue.rank, "C");
});

test("matches DBLP record URLs without a network request", () => {
  const match = engine.matchUrl(
    index,
    "https://dblp.org/rec/conf/cvpr/Example2026.html",
  );
  assert.equal(match.venue.abbr, "CVPR");
  assert.equal(match.confidence, 1);
});

test("matches reordered full venue wording using significant tokens", () => {
  const match = engine.matchVenueText(
    index,
    "Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition, 2026",
  );
  assert.equal(match.venue.abbr, "CVPR");
  assert.equal(match.venue.rank, "A");
});

test("does not guess when a bare abbreviation is genuinely ambiguous", () => {
  assert.equal(engine.matchVenueText(index, "TCC 2026"), null);
});

test("matches an explicitly printed former full name", () => {
  const match = engine.matchVenueText(index, "Information Retrieval Journal, 2024");
  assert.equal(match.venue.name, "Discover Computing");
});
