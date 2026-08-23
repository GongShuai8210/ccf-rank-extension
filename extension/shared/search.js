(function attachCCFRankSearch(root, factory) {
  const api = factory();
  root.CCFRankSearch = api;
  if (typeof module === "object" && module && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createApi() {
  "use strict";

  const RANK_ORDER = Object.freeze({ A: 0, B: 1, C: 2 });
  const STOP_WORDS = new Set([
    "a",
    "an",
    "the",
    "of",
    "on",
    "in",
    "for",
    "to",
    "and",
    "with",
    "by",
    "at",
    "from",
    "international",
    "annual",
    "conference",
    "symposium",
    "workshop",
    "journal",
    "transactions",
    "proceedings",
    "meeting",
    "acm",
    "ieee",
  ]);

  function asString(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function normalize(value) {
    return asString(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " and ")
      .replace(/[‐‑‒–—―]/g, "-")
      .toLowerCase()
      .replace(/\b(?:19|20)\d{2}\b/g, " ")
      .replace(/\b\d+(?:st|nd|rd|th)\b/g, " ")
      .replace(/[^a-z0-9+#]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function compact(value) {
    return normalize(value).replace(/[^a-z0-9+#]/g, "");
  }

  function rawCompact(value) {
    return asString(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9+#]/g, "");
  }

  function tokens(value) {
    return normalize(value).split(" ").filter(Boolean);
  }

  function significantTokens(value) {
    return tokens(value).filter(
      (token) => token.length > 1 && !STOP_WORDS.has(token),
    );
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function urlKeys(value) {
    if (!value) return [];
    let parsed;
    try {
      parsed = new URL(value, "https://dblp.org");
    } catch (_error) {
      return [];
    }

    const path = parsed.pathname.replace(/\/{2,}/g, "/").toLowerCase();
    const matches = [
      path.match(/\/(?:db|rec)\/(conf|journals?)\/([^/]+)/),
      path.match(/\/(conf|journals?)\/([^/]+)/),
    ].filter(Boolean);
    return unique(
      matches.map((match) => {
        const type = match[1].startsWith("journal") ? "journal" : "conference";
        return `${type}:${match[2].replace(/[^a-z0-9+-]/g, "")}`;
      }),
    );
  }

  function createIndex(dataset) {
    if (!dataset || !Array.isArray(dataset.venues)) {
      throw new TypeError("A CCF dataset with a venues array is required");
    }

    const abbreviationGroups = new Map();
    const byUrl = new Map();
    const categories = new Map(
      (dataset.categories || []).map((category) => [category.id, category]),
    );
    const items = dataset.venues.map((venue, position) => {
      const aliases = Array.isArray(venue.aliases) ? venue.aliases : [];
      const item = {
        venue,
        position,
        abbrNorm: normalize(venue.abbr),
        abbrKeys: unique([compact(venue.abbr), rawCompact(venue.abbr)]),
        nameNorm: normalize(venue.name),
        nameCompact: compact(venue.name),
        nameTokens: significantTokens(venue.name),
        aliases: aliases.map((alias) => ({
          original: alias,
          norm: normalize(alias),
          compact: compact(alias),
          rawCompact: rawCompact(alias),
          tokens: significantTokens(alias),
        })),
        urlKeys: urlKeys(venue.url),
      };

      for (const key of item.abbrKeys) {
        if (!key) continue;
        const group = abbreviationGroups.get(key) || [];
        group.push(item);
        abbreviationGroups.set(key, group);
      }
      for (const key of item.urlKeys) {
        const group = byUrl.get(key) || [];
        group.push(item);
        byUrl.set(key, group);
      }
      return item;
    });

    return Object.freeze({
      dataset,
      items,
      categories,
      abbreviationGroups,
      byUrl,
    });
  }

  function filterItem(item, options) {
    const { venue } = item;
    return (
      (!options.rank || options.rank === "all" || venue.rank === options.rank) &&
      (!options.type || options.type === "all" || venue.type === options.type) &&
      (!options.category ||
        options.category === "all" ||
        venue.category === options.category)
    );
  }

  function scoreSearchItem(item, query) {
    const queryNorm = normalize(query);
    const queryCompact = compact(query);
    const queryRawCompact = rawCompact(query);
    if (!queryNorm && !queryCompact) return null;

    let best = -1;
    let reason = "tokens";
    const abbrExact = item.abbrKeys.some(
      (key) => key && (key === queryCompact || key === queryRawCompact),
    );
    if (abbrExact) {
      best = 140;
      reason = "abbreviation-exact";
    }

    for (const alias of item.aliases) {
      if (
        alias.compact === queryCompact ||
        alias.rawCompact === queryRawCompact
      ) {
        const score = alias.original.length <= 16 ? 136 : 126;
        if (score > best) {
          best = score;
          reason = "alias-exact";
        }
      }
    }

    if (item.nameCompact === queryCompact) {
      best = Math.max(best, 132);
      reason = "name-exact";
    }
    if (item.abbrNorm && item.abbrNorm.startsWith(queryNorm)) {
      const score = 117 - Math.min(12, item.abbrNorm.length - queryNorm.length);
      if (score > best) {
        best = score;
        reason = "abbreviation-prefix";
      }
    }
    if (item.nameNorm.startsWith(queryNorm)) {
      const score = 112 - Math.min(12, item.nameNorm.length - queryNorm.length) / 4;
      if (score > best) {
        best = score;
        reason = "name-prefix";
      }
    }
    if (queryNorm.length >= 3 && item.nameNorm.includes(queryNorm)) {
      const score = 101 - item.nameNorm.indexOf(queryNorm) / 50;
      if (score > best) {
        best = score;
        reason = "name-contains";
      }
    }

    for (const alias of item.aliases) {
      if (queryNorm.length >= 2 && alias.norm.includes(queryNorm)) {
        const score = 99 - alias.norm.indexOf(queryNorm) / 50;
        if (score > best) {
          best = score;
          reason = "alias-contains";
        }
      }
    }

    const queryTokens = significantTokens(queryNorm);
    if (queryTokens.length) {
      const targetTokens = new Set([
        ...item.nameTokens,
        ...tokens(item.venue.abbr),
        ...item.aliases.flatMap((alias) => alias.tokens),
      ]);
      const matched = queryTokens.filter((token) => targetTokens.has(token)).length;
      const coverage = matched / queryTokens.length;
      if (coverage === 1) {
        const score = 82 + Math.min(12, matched * 2);
        if (score > best) {
          best = score;
          reason = "tokens";
        }
      }
    }

    return best >= 0 ? { score: best, reason } : null;
  }

  function search(index, query, options = {}) {
    const limit = Number.isFinite(options.limit)
      ? Math.max(1, Math.min(200, options.limit))
      : 50;
    const results = [];
    for (const item of index.items) {
      if (!filterItem(item, options)) continue;
      const match = scoreSearchItem(item, query);
      if (!match) continue;
      results.push({ venue: item.venue, ...match });
    }
    results.sort(
      (left, right) =>
        right.score - left.score ||
        RANK_ORDER[left.venue.rank] - RANK_ORDER[right.venue.rank] ||
        left.venue.name.localeCompare(right.venue.name, "en"),
    );
    return results.slice(0, limit);
  }

  function chooseUrlMatch(items) {
    if (!items || !items.length) return null;
    const sorted = [...items].sort(
      (left, right) =>
        RANK_ORDER[left.venue.rank] - RANK_ORDER[right.venue.rank] ||
        left.position - right.position,
    );
    return {
      venue: sorted[0].venue,
      alternates: sorted.slice(1).map((item) => item.venue),
      confidence: 1,
      reason: "url",
    };
  }

  function matchUrl(index, value) {
    for (const key of urlKeys(value)) {
      const match = chooseUrlMatch(index.byUrl.get(key));
      if (match) return match;
    }
    return null;
  }

  function containsPhrase(paddedText, phrase) {
    return Boolean(phrase) && paddedText.includes(` ${phrase} `);
  }

  function tokenCoverage(itemTokens, textTokenSet) {
    if (!itemTokens.length) return 0;
    let matched = 0;
    for (const token of itemTokens) {
      if (textTokenSet.has(token)) matched += 1;
    }
    return matched / itemTokens.length;
  }

  function exactPhraseScore(phrase, phraseTokens, contextText) {
    const ratio = Math.min(1, phrase.length / Math.max(1, contextText.length));
    if (phraseTokens.length >= 3) return 0.96 + ratio * 0.04;
    return 0.8 + ratio * 0.1;
  }

  function abbreviationUnique(index, item) {
    return item.abbrKeys.every((key) => {
      const group = index.abbreviationGroups.get(key) || [];
      return group.length <= 1;
    });
  }

  function scoreVenueText(index, item, context) {
    const { textNorm, paddedText, textTokens } = context;
    let score = 0;
    let reason = "";

    if (item.nameNorm.length >= 7 && containsPhrase(paddedText, item.nameNorm)) {
      score = exactPhraseScore(item.nameNorm, item.nameTokens, textNorm);
      reason = "name-exact";
    }
    for (const alias of item.aliases) {
      if (alias.norm.length >= 7 && containsPhrase(paddedText, alias.norm)) {
        const aliasScore = exactPhraseScore(alias.norm, alias.tokens, textNorm) - 0.005;
        if (aliasScore > score) {
          score = aliasScore;
          reason = "alias-exact";
        }
      }
    }

    const abbrLength = rawCompact(item.venue.abbr).length;
    const abbrPresent =
      abbrLength >= 3 &&
      (containsPhrase(paddedText, item.abbrNorm) ||
        item.aliases.some(
          (alias) =>
            alias.original.length <= 16 && containsPhrase(paddedText, alias.norm),
        ));
    if (abbrPresent) {
      const uniqueAbbreviation = abbreviationUnique(index, item);
      const abbrScore = uniqueAbbreviation
        ? abbrLength >= 4
          ? 0.95
          : 0.91
        : 0.78;
      if (abbrScore > score) {
        score = abbrScore;
        reason = uniqueAbbreviation ? "abbreviation" : "abbreviation-ambiguous";
      }
    }

    if (item.nameTokens.length >= 3) {
      const coverage = tokenCoverage(item.nameTokens, textTokens);
      const matchedCount = Math.round(coverage * item.nameTokens.length);
      if (coverage >= 0.8 && matchedCount >= 3) {
        const fuzzyScore = 0.72 + Math.min(0.14, coverage * 0.14);
        if (fuzzyScore > score) {
          score = fuzzyScore;
          reason = "name-tokens";
        }
      }
    }

    if (!textNorm || score < 0.76) return null;
    return { item, score, reason };
  }

  function matchVenueText(index, text) {
    const textNorm = normalize(text);
    if (!textNorm) return null;
    const context = {
      textNorm,
      paddedText: ` ${textNorm} `,
      textTokens: new Set(significantTokens(textNorm)),
    };
    const candidates = [];
    for (const item of index.items) {
      const candidate = scoreVenueText(index, item, context);
      if (candidate) candidates.push(candidate);
    }
    if (!candidates.length) return null;
    candidates.sort(
      (left, right) =>
        right.score - left.score ||
        RANK_ORDER[left.item.venue.rank] - RANK_ORDER[right.item.venue.rank] ||
        left.item.position - right.item.position,
    );

    const best = candidates[0];
    const second = candidates[1];
    if (
      second &&
      second.item.venue.id !== best.item.venue.id &&
      Math.abs(best.score - second.score) < 0.015
    ) {
      return null;
    }
    return {
      venue: best.item.venue,
      confidence: best.score,
      reason: best.reason,
    };
  }

  function categoryFor(index, venue) {
    return index.categories.get(venue.category) || null;
  }

  return Object.freeze({
    RANK_ORDER,
    normalize,
    compact,
    rawCompact,
    createIndex,
    search,
    matchUrl,
    matchVenueText,
    categoryFor,
  });
});
