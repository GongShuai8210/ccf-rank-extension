(function annotateAcademicPages() {
  "use strict";

  const data = globalThis.CCF_RANK_DATA;
  const engine = globalThis.CCFRankSearch;
  if (!data || !engine) return;

  const index = engine.createIndex(data);
  const processed = new WeakMap();
  const BADGE_CLASS = "ccfrank2026-badge";

  const configurations = [
    {
      id: "dblp",
      host: /(^|\.)dblp(?:2)?\.(?:org|uni-trier\.de|dagstuhl\.de)$/i,
      cards: ["li.entry"],
      metadata: ["[itemprop='isPartOf']", ".publ", "cite.data"],
      anchors: [".title", "[itemprop='headline']", "cite.data"],
      fallbackText: true,
    },
    {
      id: "google-scholar",
      host: /^scholar\.google\./i,
      cards: ["tr.gsc_a_tr", ".gs_r", ".gs_scl"],
      metadata: [".gsc_a_t .gs_gray", ".gs_a"],
      anchors: ["a.gsc_a_at", ".gs_rt", "h3"],
      fallbackText: false,
    },
    {
      id: "semantic-scholar",
      host: /(^|\.)semanticscholar\.org$/i,
      cards: [
        "[data-selenium-selector='paper-row']",
        ".cl-paper-row",
        "article[data-paper-id]",
      ],
      metadata: [
        "[data-selenium-selector='venue-metadata']",
        "[data-selenium-selector='paper-meta']",
        ".cl-paper-pubdates",
        ".venue",
      ],
      anchors: [
        "[data-selenium-selector='title-link']",
        "h2",
        "h3",
      ],
      fallbackText: true,
    },
    {
      id: "connected-papers",
      host: /(^|\.)connectedpapers\.com$/i,
      cards: [
        "[class*='SearchResult']",
        "[class*='PaperCard']",
        "[data-testid*='paper']",
        "article",
      ],
      metadata: [
        "[class*='Venue']",
        "[class*='Metadata']",
        "[class*='Publication']",
      ],
      anchors: ["h2", "h3", "[class*='Title']"],
      fallbackText: true,
    },
    {
      id: "web-of-science",
      host: /(^|\.)(?:webofscience\.com|webofscience\.clarivate\.cn)$/i,
      cards: ["app-record", "[data-ta='record']", ".search-results-item"],
      metadata: [
        "[data-ta='source-title']",
        ".source-title",
        ".journal-content-title",
      ],
      anchors: ["[data-ta='title']", "h2", "h3"],
      fallbackText: true,
    },
    {
      id: "acm-dl",
      host: /(^|\.)dl\.acm\.org$/i,
      cards: [".search__item", ".issue-item", ".result__item", "article"],
      metadata: [
        ".issue-item__detail",
        ".conference__name",
        ".epub-section__title",
        ".bookPubDate",
      ],
      anchors: [".issue-item__title", "h2", "h3"],
      fallbackText: true,
    },
    {
      id: "ieee-xplore",
      host: /(^|\.)ieeexplore\.ieee\.org$/i,
      cards: ["xpl-results-item", ".List-results-items", ".result-item"],
      metadata: [
        ".publisher-info-container",
        ".publisher-info",
        ".publication-title",
        ".description",
      ],
      anchors: ["h2", "h3", ".title"],
      fallbackText: true,
    },
    {
      id: "springer-link",
      host: /(^|\.)link\.springer\.com$/i,
      cards: [".app-card-open", ".c-card", ".result-item", "article"],
      metadata: [".c-meta", ".c-card__subtitle", ".app-card-open__publisher"],
      anchors: [".c-card__title", ".app-card-open__heading", "h2", "h3"],
      fallbackText: true,
    },
  ];

  const configuration = configurations.find((candidate) =>
    candidate.host.test(location.hostname),
  );
  if (!configuration) return;

  function combinedSelector(selectors) {
    return selectors.join(",");
  }

  function textWithoutBadges(element) {
    if (!element) return "";
    const clone = element.cloneNode(true);
    for (const badge of clone.querySelectorAll(`.${BADGE_CLASS}`)) badge.remove();
    return (clone.textContent || "").replace(/\s+/g, " ").trim();
  }

  function metadataText(card) {
    const values = [];
    for (const selector of configuration.metadata) {
      for (const element of card.querySelectorAll(selector)) {
        const value = textWithoutBadges(element);
        if (value && !values.includes(value)) values.push(value);
      }
    }
    if (!values.length && configuration.fallbackText) {
      const fallback = textWithoutBadges(card);
      if (fallback.length <= 2400) values.push(fallback);
    }
    return values.join(" · ");
  }

  function linkedUrls(card) {
    const values = [];
    for (const anchor of card.querySelectorAll("a[href]")) {
      const value = anchor.href;
      if (value && !values.includes(value)) values.push(value);
    }
    return values;
  }

  function findMatch(card, text, urls) {
    for (const url of urls) {
      const match = engine.matchUrl(index, url);
      if (match) return match;
    }
    return engine.matchVenueText(index, text);
  }

  function findAnchor(card) {
    for (const selector of configuration.anchors) {
      const target = card.querySelector(selector);
      if (target) return target;
    }
    return card.firstElementChild || card;
  }

  function tooltip(venue) {
    const category = engine.categoryFor(index, venue);
    const typeZh = venue.type === "journal" ? "期刊" : "会议";
    const lines = [
      `CCF ${venue.rank} · ${typeZh} · 第七版（2026）`,
      `${venue.abbr ? `${venue.abbr} — ` : ""}${venue.name}`,
    ];
    if (category) lines.push(`${category.zh}\n${category.en}`);
    lines.push("点击查看目录中的来源链接");
    return lines.join("\n");
  }

  function createBadge(venue) {
    const badge = document.createElement(venue.url ? "a" : "span");
    badge.className = [
      BADGE_CLASS,
      `${BADGE_CLASS}--${venue.rank.toLowerCase()}`,
      `${BADGE_CLASS}--${configuration.id}`,
    ].join(" ");
    badge.textContent = `CCF ${venue.rank}`;
    badge.title = tooltip(venue);
    badge.setAttribute("aria-label", badge.title.replace(/\n/g, ". "));
    badge.dataset.ccfVenueId = venue.id;
    if (venue.url) {
      badge.href = venue.url;
      badge.target = "_blank";
      badge.rel = "noopener noreferrer";
    }
    return badge;
  }

  function placeBadge(card, badge) {
    const anchor = findAnchor(card);
    const titleLink = anchor.matches("a") ? anchor : anchor.querySelector("a");
    if (titleLink) {
      titleLink.insertAdjacentElement("afterend", badge);
      return;
    }
    anchor.append(badge);
  }

  function processCard(card) {
    const text = metadataText(card);
    const urls = linkedUrls(card);
    const fingerprint = `${text}\u241f${urls.join("\u241e")}`;
    if (processed.get(card) === fingerprint) return;

    const priorBadge = card.querySelector(`:scope .${BADGE_CLASS}`);
    const match = findMatch(card, text, urls);
    if (!match) {
      priorBadge?.remove();
      processed.set(card, fingerprint);
      return;
    }
    if (priorBadge?.dataset.ccfVenueId === match.venue.id) {
      processed.set(card, fingerprint);
      return;
    }
    priorBadge?.remove();
    placeBadge(card, createBadge(match.venue));
    processed.set(card, fingerprint);
  }

  function processPage() {
    const cards = document.querySelectorAll(combinedSelector(configuration.cards));
    for (const card of Array.from(cards).slice(0, 600)) processCard(card);
  }

  let timer = 0;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(processPage, 120);
  }

  processPage();
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("pageshow", schedule, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) schedule();
  });
})();
