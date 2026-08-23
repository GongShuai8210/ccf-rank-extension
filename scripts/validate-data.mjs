import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = path.join(ROOT, "data", "ccf-2026.json");

const EXPECTED = Object.freeze({
  venues: 681,
  journals: 295,
  conferences: 386,
  ranks: { A: 95, B: 245, C: 341 },
  categories: {
    architecture: 95,
    networks: 55,
    security: 63,
    software: 82,
    data: 65,
    theory: 53,
    graphics: 63,
    ai: 107,
    hci: 41,
    interdisciplinary: 57,
  },
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function countBy(values, key) {
  const counts = {};
  for (const value of values) counts[value[key]] = (counts[value[key]] || 0) + 1;
  return counts;
}

function sameCounts(actual, expected, label) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} counts differ: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
  );
}

export async function loadAndValidateData() {
  const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
  assert(data.schemaVersion === 1, "Unsupported data schema");
  assert(data.source?.edition === 7, "Expected CCF seventh edition");
  assert(data.source?.version === "2026-03", "Expected 2026-03 source version");
  assert(Array.isArray(data.categories), "Missing category list");
  assert(data.categories.length === 10, "Expected 10 CCF categories");
  assert(Array.isArray(data.venues), "Missing venue list");
  assert(data.venues.length === EXPECTED.venues, "Unexpected venue count");

  const categoryIds = new Set(data.categories.map((category) => category.id));
  const ids = new Set();
  for (const venue of data.venues) {
    assert(typeof venue.id === "string" && venue.id, "Venue ID is required");
    assert(!ids.has(venue.id), `Duplicate venue ID: ${venue.id}`);
    ids.add(venue.id);
    assert(["A", "B", "C"].includes(venue.rank), `Invalid rank: ${venue.id}`);
    assert(
      ["conference", "journal"].includes(venue.type),
      `Invalid venue type: ${venue.id}`,
    );
    assert(categoryIds.has(venue.category), `Unknown category: ${venue.id}`);
    assert(typeof venue.abbr === "string", `Invalid abbreviation: ${venue.id}`);
    assert(typeof venue.name === "string" && venue.name, `Missing name: ${venue.id}`);
    assert(Array.isArray(venue.aliases), `Missing aliases array: ${venue.id}`);
    assert(
      venue.aliases.every((alias) => typeof alias === "string" && alias),
      `Invalid alias: ${venue.id}`,
    );
    assert(Number.isInteger(venue.sourcePage), `Missing source page: ${venue.id}`);
    assert(Number.isInteger(venue.sourceRow), `Missing source row: ${venue.id}`);
    if (venue.url) {
      const parsed = new URL(venue.url);
      assert(["http:", "https:"].includes(parsed.protocol), `Invalid URL: ${venue.id}`);
    }
  }

  const typeCounts = countBy(data.venues, "type");
  assert(typeCounts.journal === EXPECTED.journals, "Unexpected journal count");
  assert(
    typeCounts.conference === EXPECTED.conferences,
    "Unexpected conference count",
  );
  sameCounts(countBy(data.venues, "rank"), EXPECTED.ranks, "Rank");
  sameCounts(countBy(data.venues, "category"), EXPECTED.categories, "Category");

  const sourcePath = path.join(ROOT, data.source.file);
  try {
    const sourceBytes = await readFile(sourcePath);
    const digest = createHash("sha256").update(sourceBytes).digest("hex");
    assert(digest === data.source.sha256, "Source PDF SHA-256 does not match data");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  return data;
}

export { DATA_PATH, EXPECTED, ROOT };

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  const data = await loadAndValidateData();
  const summary = {
    version: data.source.version,
    venues: data.venues.length,
    journals: data.venues.filter((venue) => venue.type === "journal").length,
    conferences: data.venues.filter((venue) => venue.type === "conference").length,
    ranks: countBy(data.venues, "rank"),
  };
  console.log(JSON.stringify(summary, null, 2));
}
