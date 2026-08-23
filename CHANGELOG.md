# Changelog

All notable changes to CCF Rank PLus are documented here.

## 1.2.0 — 2026-08-23

- Rename the extension to the exact product name `CCF Rank PLus`.
- Detect preprint-only metadata on Google Scholar and show a neutral `Preprint` badge.
- Lazily inspect each visible paper's Google Scholar “All versions” page; replace the preprint badge with `CCF A/B/C` when a ranked published version is found.
- Remove the preprint badge when a formal but non-CCF version is found, so it is not mislabelled as a preprint.
- Cache Scholar detail and version lookups in memory and limit requests to two at a time.
- Declare Firefox's `browsingActivity` data category for the limited same-origin Scholar version-page requests.
- Add regression fixtures for CCF-ranked, true-preprint, and published-but-unranked version sets.

## 1.1.0 — 2026-08-23

- Add Google Scholar profile publication-table support (`tr.gsc_a_tr`).
- Read venue text from profile-row `.gs_gray` metadata.
- Place CCF badges after paper titles instead of before them.
- Refresh A/B/C pill colors and spacing to match Scholar's inline title layout.
- Add regression coverage for TIP, TCSVT, ESWA, TIFS, and AAAI profile rows.
- Add a browser-rendered Google Scholar profile fixture and screenshot.

## 1.0.0 — 2026-08-23

- Initial Chrome and Firefox Manifest V3 release.
- Add 681 seventh-edition CCF venue records and the reproducible PDF extraction pipeline.
- Add local lookup, filters, aliases, academic-site annotations, privacy documentation, CI, and release packaging.
