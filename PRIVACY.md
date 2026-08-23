# Privacy policy

Last updated: 2026-08-23

CCF Rank 2026 does not collect, store, sell, transmit, or share personal data.

## What the extension reads

On the academic websites explicitly listed in `manifest.json`, the content script reads conference or journal text and links that are already rendered in the current page. It uses those values only to find a matching entry in the bundled CCF dataset and insert a visible rank badge.

The toolbar popup reads the query typed into its own search field. The query is matched against the bundled dataset in memory and is not persisted or transmitted.

## What the extension does not do

- No analytics, telemetry, advertising, crash reporting, or tracking.
- No remote API calls for ranking or matching.
- No transmission of search terms, page content, URLs, or browsing history.
- No account, cookie, tab-history, clipboard, location, or file access.
- No remotely hosted JavaScript or executable code.
- No use of `chrome.storage`, local storage, or a backend database.

The only network navigation initiated by the extension occurs when the user explicitly clicks a source link or a venue's published URL.

## Permissions

The extension requests site access only through the `content_scripts.matches` entries needed for automatic annotation. It requests no additional WebExtension API permissions. Firefox's manifest declares `data_collection_permissions.required = ["none"]`.

Questions or reports may be filed at [GitHub Issues](https://github.com/GongShuai8210/ccf-rank-extension/issues).
