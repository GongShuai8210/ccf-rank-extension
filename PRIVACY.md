# Privacy policy

Last updated: 2026-08-23

CCF Rank PLus does not collect, store, sell, transmit, or share personal data with the project developer or any analytics, advertising, or backend service.

## What the extension reads

On the academic websites explicitly listed in `manifest.json`, the content script reads conference or journal text and links that are already rendered in the current page. It uses those values only to find a matching entry in the bundled CCF dataset and insert a visible rank badge. The CCF dataset and all rank matching remain bundled and local.

The toolbar popup reads the query typed into its own search field. The query is matched against the bundled dataset in memory and is not persisted or transmitted.

## Google Scholar preprint-version checks

When a visible Google Scholar result is labelled as a preprint and has no direct CCF match, the extension may make same-origin public `GET` requests to Google Scholar to inspect that paper's citation-detail page and its “All versions” page. This allows a row that currently says arXiv to be annotated using a formally published conference or journal version.

- Requests stay on the Google Scholar regional origin already open in the tab.
- The extension derives the citation and version URLs from links Google Scholar already placed on the page. It does not submit the paper title or a new search query to a separate ranking service.
- Requests omit browser credentials and the referring page, are limited to two concurrent requests, and are made only for visible or near-visible preprint rows.
- Results are cached only in memory for the lifetime of that content script and are never written to persistent storage.
- As with any web request, Google receives ordinary network information such as the requesting IP address. The developer of CCF Rank PLus does not receive these requests or their contents.

If the version check is unavailable, the extension leaves the neutral `Preprint` label in place and does not guess a CCF rank.

## What the extension does not do

- No analytics, telemetry, advertising, crash reporting, or tracking.
- No backend or third-party ranking API calls; every CCF lookup is performed against the bundled dataset.
- No transmission of popup search terms, page content, URLs, or browsing history to the project developer, analytics providers, or advertisers.
- No account, cookie, tab-history, clipboard, location, or file access.
- No remotely hosted JavaScript or executable code.
- No use of `chrome.storage`, local storage, or a backend database.

Outside the limited Google Scholar preprint-version checks described above, network navigation initiated by the extension occurs only when the user explicitly clicks a source link or a venue's published URL.

## Permissions

The extension requests site access only through the `content_scripts.matches` entries needed for automatic annotation. It requests no additional WebExtension API permissions.

Firefox's manifest declares `data_collection_permissions.required = ["browsingActivity"]` because Mozilla classifies sending a page URL outside the local browser as browsing-activity transmission. This declaration covers only the same-origin Google Scholar citation-detail and “All versions” requests described above. It does not mean that the project developer collects browsing history, and the extension does not transmit activity from any other supported site.

Questions or reports may be filed at [GitHub Issues](https://github.com/GongShuai8210/ccf-rank-extension/issues).
