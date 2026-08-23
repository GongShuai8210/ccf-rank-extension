(function attachCCFRankScholar(root, factory) {
  const api = factory();
  root.CCFRankScholar = api;
  if (typeof module === "object" && module && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createApi() {
  "use strict";

  const PREPRINT_PATTERN =
    /\b(?:arxiv|biorxiv|medrxiv|chemrxiv|techrxiv|ssrn|openreview|research\s+square|working\s+paper|preprint(?:\s+server)?)\b|预印本|工作论文/i;

  function asString(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function isScholarHost(hostname) {
    return /^scholar\.google\./i.test(asString(hostname));
  }

  function isPreprintText(value) {
    return PREPRINT_PATTERN.test(asString(value));
  }

  function sameOriginScholarUrl(value, currentOrigin) {
    let origin;
    let parsed;
    try {
      origin = new URL(currentOrigin);
      parsed = new URL(value, origin);
    } catch (_error) {
      return null;
    }
    if (
      origin.protocol !== "https:" ||
      !isScholarHost(origin.hostname) ||
      parsed.protocol !== "https:" ||
      !isScholarHost(parsed.hostname)
    ) {
      return null;
    }

    const normalized = new URL(origin.origin);
    normalized.pathname = parsed.pathname;
    normalized.search = parsed.search;
    normalized.hash = "";
    return normalized;
  }

  function candidateAnchors(root, selectors) {
    const anchors = [];
    const seen = new Set();
    for (const selector of selectors) {
      for (const anchor of root.querySelectorAll(selector)) {
        if (seen.has(anchor)) continue;
        seen.add(anchor);
        anchors.push(anchor);
      }
    }
    return anchors;
  }

  function findClusterUrl(root, currentOrigin) {
    const anchors = candidateAnchors(root, [
      ".gs_fl a[href*='cluster=']",
      ".gsc_oms_link[href*='cluster=']",
      "a[href*='oi=bibs'][href*='cluster=']",
      "a[href*='cluster=']",
    ]);
    for (const anchor of anchors) {
      const normalized = sameOriginScholarUrl(
        anchor.getAttribute("href"),
        currentOrigin,
      );
      if (!normalized || normalized.pathname !== "/scholar") continue;
      const cluster = normalized.searchParams.get("cluster");
      if (!/^\d+$/.test(cluster || "")) continue;
      normalized.searchParams.delete("btnI");
      return normalized.href;
    }
    return null;
  }

  function findCitationDetailUrl(root, currentOrigin) {
    const anchors = candidateAnchors(root, [
      "a.gsc_a_at[href*='view_citation']",
      "a[href*='view_op=view_citation'][href*='citation_for_view']",
    ]);
    for (const anchor of anchors) {
      const normalized = sameOriginScholarUrl(
        anchor.getAttribute("href"),
        currentOrigin,
      );
      if (!normalized || normalized.pathname !== "/citations") continue;
      if (
        normalized.searchParams.get("view_op") !== "view_citation" ||
        !normalized.searchParams.get("citation_for_view")
      ) {
        continue;
      }
      return normalized.href;
    }
    return null;
  }

  function compactText(element) {
    return asString(element?.textContent).replace(/\s+/g, " ").trim();
  }

  function looksLikePublishedMetadata(value) {
    const text = asString(value).replace(/\s+/g, " ").trim();
    if (!text || isPreprintText(text)) return false;
    return (
      /\s[-–—]\s/.test(text) ||
      /\b(?:journal|conference|proceedings|transactions|symposium|workshop|volume|vol\.)\b/i.test(
        text,
      )
    );
  }

  function analyzeVersionsDocument(root, index, engine) {
    const cards = [...root.querySelectorAll(".gs_r, .gs_scl")];
    if (!cards.length) return { kind: "unavailable", checkedVersions: 0 };

    let hasPublishedVersion = false;
    let preprintVersions = 0;
    for (const card of cards) {
      const metadata = compactText(card.querySelector(".gs_a"));
      if (!metadata) continue;

      const match = engine.matchVenueText(index, metadata);
      if (match) {
        return {
          kind: "ccf",
          match,
          metadata,
          checkedVersions: cards.length,
        };
      }
      if (isPreprintText(metadata)) {
        preprintVersions += 1;
      } else if (looksLikePublishedMetadata(metadata)) {
        hasPublishedVersion = true;
      }
    }

    if (hasPublishedVersion) {
      return { kind: "published-unranked", checkedVersions: cards.length };
    }
    if (preprintVersions > 0) {
      return { kind: "preprint", checkedVersions: cards.length };
    }
    return { kind: "unavailable", checkedVersions: cards.length };
  }

  return Object.freeze({
    isScholarHost,
    isPreprintText,
    sameOriginScholarUrl,
    findClusterUrl,
    findCitationDetailUrl,
    looksLikePublishedMetadata,
    analyzeVersionsDocument,
  });
});
