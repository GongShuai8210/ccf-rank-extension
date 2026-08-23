# Contributing

Issues and pull requests are welcome, especially for changed academic-site markup, missing aliases, accessibility, and reproducible data corrections.

## Development setup

```bash
npm ci
npm run check
```

`npm run check` validates the dataset, runs unit tests, performs Mozilla's strict `web-ext` lint, builds both browser variants, and creates ZIP packages.

## Data corrections

Every ranking change must be supported by the official CCF source. Include the PDF page, table row, venue type, category, and rank in the pull request. Do not change `data/ccf-2026.json` by hand when the source PDF can be parsed; update the extractor or a narrowly scoped, documented source-page override and regenerate.

Install the extraction dependency with:

```bash
python -m pip install -r requirements-dev.txt
```

Then run the extraction command documented in the README and commit both the extractor change and generated JSON.

## Site adapters

Keep selectors scoped to the academic site and prefer explicit venue metadata over the full result card. CCF rank matching must remain local and conservative: an omitted badge is better than a confidently wrong rank. Add or extend a smoke fixture when changing URL or name matching.

Google Scholar preprint-resolution changes must include fixtures for the citation-detail page and the “All versions” page. Keep requests same-origin, credential-free, visibility-gated, concurrency-limited, and memory-only; do not replace this workflow with title searches or a third-party ranking API.

## Pull requests

- Keep unrelated changes separate.
- Add tests for matching behavior and aliases.
- Do not add remote code, telemetry, analytics, or unnecessary permissions.
- Confirm `npm run check` passes.
