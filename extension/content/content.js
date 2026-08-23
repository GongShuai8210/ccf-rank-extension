(function annotateAcademicPages() {
  "use strict";

  const data = globalThis.CCF_RANK_DATA;
  const engine = globalThis.CCFRankSearch;
  const scholar = globalThis.CCFRankScholar;
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

  function tooltip(venue, note = "") {
    const category = engine.categoryFor(index, venue);
    const typeZh = venue.type === "journal" ? "期刊" : "会议";
    const lines = [
      `CCF ${venue.rank} · ${typeZh} · 第七版（2026）`,
      `${venue.abbr ? `${venue.abbr} — ` : ""}${venue.name}`,
    ];
    if (category) lines.push(`${category.zh}\n${category.en}`);
    if (note) lines.push(note);
    lines.push("点击查看目录中的来源链接");
    return lines.join("\n");
  }

  function setBadgeTooltip(badge, value) {
    badge.title = value;
    badge.setAttribute("aria-label", value.replace(/\n/g, ". "));
  }

  function createBadge(venue, options = {}) {
    const badge = document.createElement(venue.url ? "a" : "span");
    badge.className = [
      BADGE_CLASS,
      `${BADGE_CLASS}--${venue.rank.toLowerCase()}`,
      `${BADGE_CLASS}--${configuration.id}`,
    ].join(" ");
    badge.textContent = `CCF ${venue.rank}`;
    setBadgeTooltip(badge, tooltip(venue, options.note));
    badge.dataset.ccfVenueId = venue.id;
    if (options.resolvedVia) badge.dataset.ccfResolvedVia = options.resolvedVia;
    if (venue.url) {
      badge.href = venue.url;
      badge.target = "_blank";
      badge.rel = "noopener noreferrer";
    }
    return badge;
  }

  function createPreprintBadge() {
    const badge = document.createElement("span");
    badge.className = [
      BADGE_CLASS,
      `${BADGE_CLASS}--preprint`,
      `${BADGE_CLASS}--${configuration.id}`,
    ].join(" ");
    badge.textContent = "Preprint";
    badge.dataset.ccfStatus = "preprint";
    badge.setAttribute("aria-busy", "true");
    setBadgeTooltip(
      badge,
      "Preprint · Google 学术当前显示为预印本\n正在检查“所有版本”中的正式发表记录",
    );
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

  const scholarDetailCache = new Map();
  const scholarVersionCache = new Map();
  const scholarCandidates = new WeakMap();
  const scholarQueue = [];
  let scholarActiveRequests = 0;

  function runScholarQueue() {
    while (scholarActiveRequests < 2 && scholarQueue.length) {
      const job = scholarQueue.shift();
      scholarActiveRequests += 1;
      Promise.resolve()
        .then(job.task)
        .then(job.resolve, job.reject)
        .finally(() => {
          scholarActiveRequests -= 1;
          runScholarQueue();
        });
    }
  }

  function enqueueScholarRequest(task) {
    return new Promise((resolve, reject) => {
      scholarQueue.push({ task, resolve, reject });
      runScholarQueue();
    });
  }

  async function fetchScholarDocument(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        method: "GET",
        credentials: "omit",
        cache: "force-cache",
        redirect: "follow",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
        headers: { Accept: "text/html,application/xhtml+xml" },
      });
      if (!response.ok) throw new Error(`Google Scholar returned ${response.status}`);
      const html = await response.text();
      if (!html || html.length > 2_000_000) {
        throw new Error("Unexpected Google Scholar response size");
      }
      const parsed = new DOMParser().parseFromString(html, "text/html");
      if (
        parsed.querySelector("#gs_captcha_f, #recaptcha") ||
        /unusual traffic|异常流量/i.test(parsed.title || "")
      ) {
        throw new Error("Google Scholar requested verification");
      }
      return parsed;
    } finally {
      clearTimeout(timeout);
    }
  }

  function clusterUrlForCard(card) {
    return scholar?.findClusterUrl(card, location.origin) || null;
  }

  function detailUrlForCard(card) {
    return scholar?.findCitationDetailUrl(card, location.origin) || null;
  }

  function clusterFromDetail(detailUrl) {
    if (!scholarDetailCache.has(detailUrl)) {
      scholarDetailCache.set(
        detailUrl,
        enqueueScholarRequest(async () => {
          const detail = await fetchScholarDocument(detailUrl);
          return scholar.findClusterUrl(detail, location.origin);
        }),
      );
    }
    return scholarDetailCache.get(detailUrl);
  }

  function resolutionFromCluster(clusterUrl) {
    if (!scholarVersionCache.has(clusterUrl)) {
      scholarVersionCache.set(
        clusterUrl,
        enqueueScholarRequest(async () => {
          const versions = await fetchScholarDocument(clusterUrl);
          return scholar.analyzeVersionsDocument(versions, index, engine);
        }),
      );
    }
    return scholarVersionCache.get(clusterUrl);
  }

  async function resolveScholarPreprint(card) {
    let clusterUrl = clusterUrlForCard(card);
    if (!clusterUrl) {
      const detailUrl = detailUrlForCard(card);
      if (!detailUrl) return { kind: "preprint", checkedVersions: 1 };
      clusterUrl = await clusterFromDetail(detailUrl);
    }
    if (!clusterUrl) return { kind: "preprint", checkedVersions: 1 };
    return resolutionFromCluster(clusterUrl);
  }

  function currentFingerprint(card) {
    const text = metadataText(card);
    const urls = linkedUrls(card);
    return `${text}\u241f${urls.join("\u241e")}`;
  }

  async function applyScholarResolution(card, candidate) {
    let result;
    try {
      result = await resolveScholarPreprint(card);
    } catch (_error) {
      result = { kind: "unavailable" };
    }
    if (!card.isConnected || currentFingerprint(card) !== candidate.fingerprint) {
      return;
    }

    const badge = card.querySelector(
      `:scope .${BADGE_CLASS}[data-ccf-status="preprint"]`,
    );
    if (!badge) return;

    badge.removeAttribute("aria-busy");
    if (result.kind === "ccf") {
      const replacement = createBadge(result.match.venue, {
        resolvedVia: "scholar-versions",
        note: `通过 Google 学术“所有版本”识别（检查 ${result.checkedVersions} 个版本）`,
      });
      badge.replaceWith(replacement);
      return;
    }
    if (result.kind === "published-unranked") {
      badge.remove();
      return;
    }
    if (result.kind === "preprint") {
      setBadgeTooltip(
        badge,
        `Preprint · 已检查 Google 学术中的 ${result.checkedVersions || 1} 个版本\n未识别到正式 CCF 会议或期刊版本`,
      );
      badge.dataset.ccfPreprintVerified = "true";
      return;
    }
    setBadgeTooltip(
      badge,
      "Preprint · Google 学术当前显示为预印本\n暂时无法检查其他版本",
    );
  }

  const scholarVisibilityObserver =
    configuration.id === "google-scholar" &&
    scholar &&
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              scholarVisibilityObserver.unobserve(entry.target);
              const candidate = scholarCandidates.get(entry.target);
              if (candidate) void applyScholarResolution(entry.target, candidate);
            }
          },
          { rootMargin: "350px 0px" },
        )
      : null;

  function scheduleScholarResolution(card, fingerprint) {
    if (!scholar || configuration.id !== "google-scholar") return;
    scholarCandidates.set(card, { fingerprint });
    if (scholarVisibilityObserver) scholarVisibilityObserver.observe(card);
    else void applyScholarResolution(card, { fingerprint });
  }

  function processCard(card) {
    const text = metadataText(card);
    const urls = linkedUrls(card);
    const fingerprint = `${text}\u241f${urls.join("\u241e")}`;
    if (processed.get(card) === fingerprint) return;

    const priorBadge = card.querySelector(`:scope .${BADGE_CLASS}`);
    const match = findMatch(card, text, urls);
    if (!match) {
      if (
        configuration.id === "google-scholar" &&
        scholar?.isPreprintText(text)
      ) {
        let preprintBadge = priorBadge;
        if (preprintBadge?.dataset.ccfStatus !== "preprint") {
          priorBadge?.remove();
          preprintBadge = createPreprintBadge();
          placeBadge(card, preprintBadge);
        }
        processed.set(card, fingerprint);
        scheduleScholarResolution(card, fingerprint);
        return;
      }
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
