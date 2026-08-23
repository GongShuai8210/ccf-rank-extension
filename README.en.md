# CCF Rank 2026

[中文](README.md) · [Changelog](CHANGELOG.md) · [Privacy](PRIVACY.md) · [Contributing](CONTRIBUTING.md)

CCF Rank 2026 is an open-source Chrome and Firefox extension for looking up and annotating ranks from the China Computer Federation's seventh-edition recommended international conference and journal list (2026).

![CCF Rank 2026 popup](docs/images/popup.png)

Google Scholar search results and profile publication tables are annotated directly at the end of each paper title:

![Google Scholar profile annotations](docs/images/google-scholar-profile.png)

## Highlights

- 681 entries extracted from the repository's official PDF: 386 conferences and 295 journals.
- Search by abbreviation, full English name, or an explicitly documented former name.
- Filter by CCF A/B/C, venue type, and all ten CCF subject categories.
- Annotate DBLP, Google Scholar search results and profile publication tables, Semantic Scholar, Connected Papers, Web of Science, ACM DL, IEEE Xplore, and Springer Link.
- Prefer exact DBLP path matches; use conservative, entirely local text matching elsewhere.
- Handle dynamically loaded results with a MutationObserver.
- Share one Manifest V3 WebExtension codebase across Chrome and Firefox.
- No server, telemetry, advertising, remote code, or persistent browsing data.

The dataset includes 95 A entries, 245 B entries, and 341 C entries. It retains documented renames such as `IR → Discover Computing`, `CASA → CASAXR`, and `FITEE → EITEE`. It also includes HotSec, the security-category continuation-row entry that is easy for table extractors to miss.

## Install

Download the browser-specific ZIP from [GitHub Releases](https://github.com/GongShuai8210/ccf-rank-extension/releases).

For Chrome, extract the Chrome ZIP, open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**. For Firefox development installs, extract the Firefox ZIP, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `manifest.json`.

Stable Firefox only permits permanent installation of AMO-signed packages. The GitHub package is intended for source auditing, development, and temporary loading; the same ZIP is ready for AMO submission.

Build from source:

```bash
git clone https://github.com/GongShuai8210/ccf-rank-extension.git
cd ccf-rank-extension
npm ci
npm run check
```

Outputs are written to `dist/chrome/`, `dist/firefox/`, and `artifacts/`.

## Data maintenance

Install the extraction dependency and regenerate from the official PDF:

```bash
python -m pip install -r requirements-dev.txt
python scripts/extract_ccf_pdf.py "path/to/official-ccf.pdf" --output data/ccf-2026.json
npm run check
```

The extractor reads coordinate-bounded table cells, validates every section's row sequence, checks the expected total, and records the source PDF SHA-256. If a future PDF changes pagination, update the explicit `SECTIONS` map rather than bypassing validation. See [the maintenance notes](docs/data-maintenance.md).

## Privacy and permissions

The extension reads only venue text already displayed on the academic sites named in its manifest and adds a rank badge to the current page. All matching is performed locally. It does not transmit queries, page content, browsing history, or personal information, and requests no storage, tabs, cookies, or analytics permissions. See [PRIVACY.md](PRIVACY.md).

## Verification

```bash
npm test
npm run data:check
npm run lint:firefox
npm run check
```

The current release has been loaded in Google Chrome 151 and Firefox 154. CI repeats the data, unit, Mozilla lint, build, and packaging checks for every push and pull request.

## License and disclaimer

The code is released under the [MIT License](LICENSE). The CCF directory, venue names, and trademarks remain the property of their respective owners and are not relicensed by this repository. This project is not affiliated with or endorsed by CCF. Always treat the [official CCF directory](https://www.ccf.org.cn/Academic_Evaluation/By_category/2026-03-05/861526.shtml) as authoritative. See [NOTICE.md](NOTICE.md).
