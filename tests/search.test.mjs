import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataset = JSON.parse(await readFile(path.join(root, "data", "ccf-2026.json"), "utf8"));
const source = await readFile(path.join(root, "extension", "shared", "search.js"), "utf8");
const scholarSource = await readFile(
  path.join(root, "extension", "shared", "scholar.js"),
  "utf8",
);
const contentSource = await readFile(
  path.join(root, "extension", "content", "content.js"),
  "utf8",
);
const manifest = JSON.parse(
  await readFile(path.join(root, "extension", "manifest.json"), "utf8"),
);
const zhMessages = JSON.parse(
  await readFile(
    path.join(root, "extension", "_locales", "zh_CN", "messages.json"),
    "utf8",
  ),
);
const sandbox = { URL, module: { exports: {} } };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: "search.js" });
vm.runInNewContext(scholarSource, sandbox, { filename: "scholar.js" });
const engine = sandbox.CCFRankSearch;
const scholar = sandbox.CCFRankScholar;
const index = engine.createIndex(dataset);

test("loads the complete official 2026 dataset", () => {
  assert.equal(index.items.length, 681);
  assert.equal(dataset.venues.filter((venue) => venue.type === "journal").length, 295);
  assert.equal(dataset.venues.filter((venue) => venue.type === "conference").length, 386);
});

test("ships the exact CCF Rank PLus name and Scholar resolver", () => {
  assert.equal(zhMessages.extName.message, "CCF Rank PLus");
  assert.equal(manifest.action.default_title, "CCF Rank PLus");
  assert.deepEqual(
    manifest.browser_specific_settings.gecko.data_collection_permissions.required,
    ["browsingActivity"],
  );
  const scholarScript = manifest.content_scripts[0].js.indexOf("shared/scholar.js");
  const contentScript = manifest.content_scripts[0].js.indexOf("content/content.js");
  assert.ok(scholarScript >= 0);
  assert.ok(scholarScript < contentScript);
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

test("matches venue lines shown on Google Scholar profile rows", () => {
  const cases = [
    ["IEEE Transactions on Image Processing 34, 1427-1440", "TIP", "A"],
    [
      "IEEE Transactions on Circuits and Systems for Video Technology 34 (6), 4887-4898",
      "TCSVT",
      "B",
    ],
    ["Expert Systems with Applications 245, 123092", "ESWA", "C"],
    ["IEEE Transactions on Information Forensics and Security", "TIFS", "A"],
    [
      "Proceedings of the AAAI Conference on Artificial Intelligence 39 (6), 6099-6107",
      "AAAI",
      "A",
    ],
  ];

  for (const [text, abbreviation, rank] of cases) {
    const match = engine.matchVenueText(index, text);
    assert.equal(match?.venue.abbr, abbreviation, text);
    assert.equal(match?.venue.rank, rank, text);
  }
});

test("Google Scholar adapter covers profile rows and appends badges after titles", () => {
  assert.match(contentSource, /tr\.gsc_a_tr/);
  assert.match(contentSource, /\.gsc_a_t \.gs_gray/);
  assert.match(contentSource, /a\.gsc_a_at/);
  assert.match(contentSource, /hasTruncatedVenueMetadata/);
  assert.match(contentSource, /insertAdjacentElement\("afterend", badge\)/);
});

test("does not confuse a title-cased venue word with an uppercase abbreviation", () => {
  const match = engine.matchVenueText(
    index,
    "IEEE Transactions on Image Processing 34, 1427-1440",
  );
  assert.equal(match.venue.abbr, "TIP");
  assert.notEqual(match.venue.abbr, "IMAGE");
});

test("recognizes common English and Chinese preprint metadata", () => {
  assert.equal(scholar.isPreprintText("arXiv preprint arXiv:2508.05987"), true);
  assert.equal(scholar.isPreprintText("bioRxiv 2026.01.02.12345"), true);
  assert.equal(scholar.isPreprintText("OpenReview preprint"), true);
  assert.equal(
    scholar.isPreprintText(
      "Forty-first International Conference - openreview.net",
    ),
    false,
  );
  assert.equal(scholar.isPreprintText("尚未正式发表的预印本"), true);
  assert.equal(scholar.isPreprintText("IEEE Transactions on Software Engineering"), false);
});

test("keeps Scholar version lookups on the current Scholar origin", () => {
  const normalized = scholar.sameOriginScholarUrl(
    "https://scholar.google.com/scholar?cluster=9572779028990265097&hl=en",
    "https://scholar.google.com.hk",
  );
  assert.equal(normalized.origin, "https://scholar.google.com.hk");
  assert.equal(normalized.searchParams.get("cluster"), "9572779028990265097");
  assert.equal(
    scholar.sameOriginScholarUrl("https://example.com/scholar?cluster=1", "https://scholar.google.com"),
    null,
  );
});

function fakeVersionDocument(metadataValues) {
  return {
    querySelectorAll(selector) {
      assert.equal(selector, ".gs_r, .gs_scl");
      return metadataValues.map((entry) => {
        const value =
          typeof entry === "string" ? { metadata: entry, urls: [] } : entry;
        return {
          querySelector(innerSelector) {
            assert.equal(innerSelector, ".gs_a");
            return { textContent: value.metadata };
          },
          querySelectorAll(innerSelector) {
            assert.equal(innerSelector, "a[href]");
            return (value.urls || []).map((url) => ({
              getAttribute(attribute) {
                assert.equal(attribute, "href");
                return url;
              },
            }));
          },
        };
      });
    },
  };
}

test("does not confuse truncated TMLR metadata with the Machine Learning journal", () => {
  const truncated =
    "S Diao, Z Huang, R Xu - … on Machine Learning …, 2023 - experts.illinois.edu";
  const broadMatch = engine.matchVenueText(index, truncated);
  assert.equal(broadMatch.venue.name, "Machine Learning");
  assert.equal(scholar.matchVenueMetadata(index, engine, truncated), null);

  const fullTmlr =
    "S Diao, Z Huang, R Xu - Transactions on Machine Learning Research, 2023 - openreview.net";
  assert.equal(scholar.matchVenueMetadata(index, engine, fullTmlr), null);

  const actualJournal =
    "A Author - Machine Learning 114 (2), 2025 - link.springer.com";
  assert.equal(
    scholar.matchVenueMetadata(index, engine, actualJournal).venue.name,
    "Machine Learning",
  );
});

test("uses conservative publication URLs for truncated ICML and TASLP records", () => {
  const icml2022 = scholar.matchTrustedVenueUrl(
    index,
    engine,
    "https://proceedings.mlr.press/v162/sun22e.html",
  );
  assert.equal(icml2022.venue.abbr, "ICML");
  assert.equal(icml2022.venue.rank, "A");

  const icml2024 = scholar.matchTrustedVenueUrl(
    index,
    engine,
    "https://raw.githubusercontent.com/mlresearch/v235/main/assets/sun24j/sun24j.pdf",
  );
  assert.equal(icml2024.venue.abbr, "ICML");

  const taslp = scholar.matchTrustedVenueUrl(
    index,
    engine,
    "https://dl.acm.org/doi/abs/10.1109/TASLP.2024.3407519",
  );
  assert.equal(taslp.venue.abbr, "TASLP");
  assert.equal(taslp.venue.rank, "B");
  assert.equal(
    scholar.matchTrustedVenueUrl(
      index,
      engine,
      "https://proceedings.mlr.press/v999/unknown.html",
    ),
    null,
  );
});

test("resolves the supplied arXiv Scholar cluster to its ECAI CCF rank", () => {
  const result = scholar.analyzeVersionsDocument(
    fakeVersionDocument([
      "C Zhang, H Zhao, C Cui, Q Song - arXiv preprint arXiv:2508.05987, 2025 - arxiv.org",
      "C Zhang, H Zhao, C Cui, Q Song - ECAI 2025, 2025 - ebooks.iospress.nl",
      "C Zhang, H Zhao, C Cui - arXiv e-prints, 2025 - ui.adsabs.harvard.edu",
    ]),
    index,
    engine,
  );
  assert.equal(result.kind, "ccf");
  assert.equal(result.match.venue.abbr, "ECAI");
  assert.equal(result.match.venue.rank, "B");
  assert.equal(result.checkedVersions, 3);
});

test("distinguishes a true preprint from a published non-CCF version", () => {
  const preprint = scholar.analyzeVersionsDocument(
    fakeVersionDocument([
      "A Author - arXiv preprint arXiv:2601.00001, 2026 - arxiv.org",
      "A Author - bioRxiv 2026.01.02.12345, 2026 - biorxiv.org",
      "A Author - personal.example.edu",
    ]),
    index,
    engine,
  );
  assert.equal(preprint.kind, "preprint");

  const published = scholar.analyzeVersionsDocument(
    fakeVersionDocument([
      "A Author - arXiv preprint arXiv:2601.00001, 2026 - arxiv.org",
      "A Author - Journal of Deliberately Unlisted Results 4, 2026 - example.org",
    ]),
    index,
    engine,
  );
  assert.equal(published.kind, "published-unranked");
});

test("classifies the live TMLR cluster as published but outside the CCF list", () => {
  const result = scholar.analyzeVersionsDocument(
    fakeVersionDocument([
      {
        metadata:
          "S Diao, Z Huang, R Xu - arXiv preprint arXiv:2201.08531, 2022 - arxiv.org",
        urls: ["https://arxiv.org/abs/2201.08531"],
      },
      {
        metadata: "S Diao, Z Huang, R Xu, X Li - shizhediao.github.io",
        urls: ["https://shizhediao.github.io/docs/bdpl_v2.pdf"],
      },
      {
        metadata:
          "S Diao, Z Huang, R Xu - … on Machine Learning … - openreview.net",
        urls: ["https://openreview.net/forum?id=IvsGP7xRvm"],
      },
      {
        metadata:
          "S Diao, Z Huang, R Xu - … on Machine Learning …, 2023 - experts.illinois.edu",
        urls: [
          "https://experts.illinois.edu/en/publications/black-box-prompt-learning-for-pre-trained-language-models/",
        ],
      },
    ]),
    index,
    engine,
  );
  assert.equal(result.kind, "published-unranked");
});

test("resolves the live ICML 2024 and TASLP version links", () => {
  const icml = scholar.analyzeVersionsDocument(
    fakeVersionDocument([
      {
        metadata:
          "J Sun, Z Xu, H Yin - arXiv preprint arXiv:2310.01467, 2023 - arxiv.org",
        urls: ["https://arxiv.org/abs/2310.01467"],
      },
      {
        metadata:
          "J Sun, Z Xu, H Yin - International …, 2024 - proceedings.mlr.press",
        urls: ["https://proceedings.mlr.press/v235/sun24j.html"],
      },
    ]),
    index,
    engine,
  );
  assert.equal(icml.kind, "ccf");
  assert.equal(icml.match.venue.abbr, "ICML");
  assert.equal(icml.match.venue.rank, "A");

  const taslp = scholar.analyzeVersionsDocument(
    fakeVersionDocument([
      {
        metadata:
          "Y Zheng, Z Tan, P Li - IEEE/ACM Transactions on Audio, Speech …, 2024 - dl.acm.org",
        urls: ["https://dl.acm.org/doi/abs/10.1109/TASLP.2024.3407519"],
      },
    ]),
    index,
    engine,
  );
  assert.equal(taslp.kind, "ccf");
  assert.equal(taslp.match.venue.abbr, "TASLP");
  assert.equal(taslp.match.venue.rank, "B");
});
