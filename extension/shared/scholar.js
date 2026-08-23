(function attachCCFRankScholar(root, factory) {
  const api = factory();
  root.CCFRankScholar = api;
  if (typeof module === "object" && module && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createApi() {
  "use strict";

  const PREPRINT_PATTERN =
    /\b(?:arxiv|biorxiv|medrxiv|chemrxiv|techrxiv|ssrn|research\s+square|working\s+paper|preprint(?:\s+server)?)\b|预印本|工作论文/i;
  const TRUNCATION_PATTERN = /…|\.{3}/;
  const VENUE_WRAPPER_WORDS = new Set([
    "the",
    "of",
    "on",
    "in",
    "at",
    "volume",
    "vol",
    "issue",
    "number",
    "no",
  ]);
  // Each listed PMLR volume is exclusively an ICML proceedings volume. Unknown
  // volumes are intentionally left unmatched instead of guessing from the host.
  const PMLR_VOLUME_VENUES = Object.freeze({
    37: "ICML",
    48: "ICML",
    70: "ICML",
    80: "ICML",
    97: "ICML",
    119: "ICML",
    139: "ICML",
    162: "ICML",
    202: "ICML",
    235: "ICML",
    267: "ICML",
  });

  function asString(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function isScholarHost(hostname) {
    return /^scholar\.google\./i.test(asString(hostname));
  }

  function isPreprintText(value) {
    return PREPRINT_PATTERN.test(asString(value));
  }

  function compactWhitespace(value) {
    return asString(value).replace(/\s+/g, " ").trim();
  }

  function venueMetadataFragment(value) {
    const text = compactWhitespace(value);
    if (!text) return "";

    const profileParts = text.split(/\s+·\s+/).filter(Boolean);
    if (profileParts.length > 1) return profileParts.at(-1);

    const scholarParts = text.split(/\s[-–—]\s/).filter(Boolean);
    if (scholarParts.length >= 3) {
      return scholarParts.slice(1, -1).join(" - ").trim();
    }
    if (scholarParts.length === 2) return scholarParts[1].trim();
    return text;
  }

  function hasTruncatedVenueMetadata(value) {
    return TRUNCATION_PATTERN.test(venueMetadataFragment(value));
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
    return compactWhitespace(element?.textContent);
  }

  function venueCore(value, engine) {
    return engine
      .normalize(value)
      .split(" ")
      .filter(
        (token) =>
          token &&
          !/^\d+$/.test(token) &&
          !VENUE_WRAPPER_WORDS.has(token),
      )
      .join(" ");
  }

  function isReliableMetadataMatch(metadata, match, engine) {
    if (!match) return false;
    if (match.reason === "url" || match.reason === "trusted-url") return true;

    const venueText = venueMetadataFragment(metadata);
    const truncated = TRUNCATION_PATTERN.test(venueText);
    if (match.reason === "abbreviation") {
      return match.confidence >= 0.9;
    }
    if (match.reason === "abbreviation-ambiguous" || truncated) return false;

    if (match.reason === "name-exact" || match.reason === "alias-exact") {
      const printedCore = venueCore(venueText, engine);
      const targetCores = [match.venue.name, ...(match.venue.aliases || [])]
        .map((value) => venueCore(value, engine))
        .filter(Boolean);
      if (targetCores.includes(printedCore)) return true;
      return (
        match.confidence >= 0.9 &&
        targetCores.some(
          (target) =>
            target.split(" ").length >= 3 &&
            ` ${printedCore} `.includes(` ${target} `),
        )
      );
    }

    if (match.reason === "name-tokens" && match.confidence >= 0.84) {
      const printedTokens = venueCore(venueText, engine)
        .split(" ")
        .filter(Boolean)
        .sort();
      const targetTokens = venueCore(match.venue.name, engine)
        .split(" ")
        .filter(Boolean)
        .sort();
      return printedTokens.join(" ") === targetTokens.join(" ");
    }
    return false;
  }

  function matchVenueMetadata(index, engine, metadata) {
    const venueText = venueMetadataFragment(metadata);
    if (!venueText) return null;
    const match = engine.matchVenueText(index, venueText);
    return isReliableMetadataMatch(metadata, match, engine) ? match : null;
  }

  function matchByAbbreviation(index, engine, abbreviation, evidence) {
    const key = engine.compact(abbreviation);
    const exact = engine
      .search(index, abbreviation, { limit: 10 })
      .filter((result) =>
        [result.venue.abbr, ...(result.venue.aliases || [])].some(
          (value) => engine.compact(value) === key,
        ),
      );
    const venues = [
      ...new Map(
        exact.map((result) => [result.venue.id, result.venue]),
      ).values(),
    ];
    if (venues.length !== 1) return null;
    return {
      venue: venues[0],
      confidence: 1,
      reason: "trusted-url",
      evidence,
    };
  }

  function matchTrustedVenueUrl(index, engine, value) {
    let parsed;
    try {
      parsed = new URL(value, "https://scholar.google.com");
    } catch (_error) {
      return null;
    }
    if (!/^https?:$/.test(parsed.protocol)) return null;

    const hostname = parsed.hostname.toLowerCase();
    let pathname = parsed.pathname;
    try {
      pathname = decodeURIComponent(pathname);
    } catch (_error) {
      // Keep the encoded path; malformed escapes must never stop annotation.
    }
    const officialHostVenues = [
      [/^(?:www\.)?icml\.cc$/, "ICML"],
      [/^(?:www\.)?(?:neurips|nips)\.cc$/, "NeurIPS"],
      [/^(?:www\.)?iclr\.cc$/, "ICLR"],
    ];
    for (const [pattern, abbreviation] of officialHostVenues) {
      if (pattern.test(hostname)) {
        return matchByAbbreviation(
          index,
          engine,
          abbreviation,
          `official host ${hostname}`,
        );
      }
    }

    const pmlrHost =
      hostname === "proceedings.mlr.press" ||
      hostname === "pmlr.com.cn" ||
      (hostname === "raw.githubusercontent.com" &&
        /^\/mlresearch\/v\d+\//i.test(pathname));
    if (pmlrHost) {
      const volume = pathname.match(/\/v(\d+)(?:\/|$)/i)?.[1];
      const abbreviation = PMLR_VOLUME_VENUES[volume];
      if (abbreviation) {
        return matchByAbbreviation(
          index,
          engine,
          abbreviation,
          `PMLR volume ${volume}`,
        );
      }
    }

    if (hostname === "dl.acm.org" || hostname === "doi.org") {
      const ieeeDoiAbbreviation = pathname.match(
        /\/10\.1109\/([a-z][a-z0-9+#-]{2,15})(?=[.\/])/i,
      )?.[1];
      if (ieeeDoiAbbreviation) {
        const match = matchByAbbreviation(
          index,
          engine,
          ieeeDoiAbbreviation,
          `IEEE DOI ${ieeeDoiAbbreviation.toUpperCase()}`,
        );
        if (match) return match;
      }
    }

    const cvfVenue = pathname.match(/\/content\/(CVPR|ICCV|ECCV)\d*/i)?.[1];
    if (hostname === "openaccess.thecvf.com" && cvfVenue) {
      return matchByAbbreviation(index, engine, cvfVenue, `CVF path ${cvfVenue}`);
    }
    return null;
  }

  function looksLikePublishedMetadata(value) {
    const text = compactWhitespace(value);
    if (!text || isPreprintText(text)) return false;
    const venueText = venueMetadataFragment(text);
    const separators = text.match(/\s[-–—]\s/g)?.length || 0;
    const hasVenueWords =
      /[a-z]{2}/i.test(venueText) && !/^\S+\.\S+$/.test(venueText);
    if (separators >= 2 && hasVenueWords) return true;
    return /\b(?:journal|conference|proceedings|transactions|symposium|workshop|volume|vol\.)\b/i.test(
      venueText,
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

      let match = null;
      for (const anchor of card.querySelectorAll("a[href]")) {
        const url = anchor.getAttribute("href");
        match =
          engine.matchUrl(index, url) ||
          matchTrustedVenueUrl(index, engine, url);
        if (match) break;
      }
      match ||= matchVenueMetadata(index, engine, metadata);
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
    venueMetadataFragment,
    hasTruncatedVenueMetadata,
    sameOriginScholarUrl,
    findClusterUrl,
    findCitationDetailUrl,
    isReliableMetadataMatch,
    matchVenueMetadata,
    matchTrustedVenueUrl,
    looksLikePublishedMetadata,
    analyzeVersionsDocument,
  });
});
