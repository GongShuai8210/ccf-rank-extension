(function initializePopup() {
  "use strict";

  const dataset = globalThis.CCF_RANK_DATA;
  const engine = globalThis.CCFRankSearch;
  if (!dataset || !engine) return;

  const index = engine.createIndex(dataset);
  const isChinese = /^zh\b/i.test(navigator.language || "zh-CN");
  const messages = isChinese
    ? {
        local: "本地查询",
        placeholder: "输入简称或全称，例如 CVPR、TPAMI",
        searchLabel: "搜索 CCF 会议或期刊",
        all: "全部",
        allTypes: "会议 + 期刊",
        conferenceOnly: "仅会议",
        journalOnly: "仅期刊",
        allCategories: "全部学科",
        total: (count) => `${count} 条会议与期刊`,
        matches: (count) => `${count} 条匹配结果`,
        clear: "清空",
        privacy: "不收集数据 · 全程本地匹配",
        source: "数据来源",
        welcomeTitle: "查简称，也查完整名称",
        welcomeBody:
          "输入会议或期刊简称、全称或曾用名。扩展也会在支持的学术搜索页面自动添加等级标记。",
        rankCount: (rank, count) => `CCF ${rank} · ${count} 条`,
        noResultTitle: "没有找到匹配项",
        noResultBody: "试试简称、英文全称，或取消部分筛选条件。",
        conference: "会议",
        journal: "期刊",
        former: "曾用名",
      }
    : {
        local: "On-device",
        placeholder: "Search CVPR, TPAMI, or a full venue name",
        searchLabel: "Search CCF conferences and journals",
        all: "All",
        allTypes: "Conferences + journals",
        conferenceOnly: "Conferences",
        journalOnly: "Journals",
        allCategories: "All fields",
        total: (count) => `${count} conferences and journals`,
        matches: (count) => `${count} matching result${count === 1 ? "" : "s"}`,
        clear: "Clear",
        privacy: "No collection · matched entirely on device",
        source: "Data source",
        welcomeTitle: "Search abbreviations or full names",
        welcomeBody:
          "Enter a current or former venue name. Supported academic sites are annotated automatically, too.",
        rankCount: (rank, count) => `CCF ${rank} · ${count}`,
        noResultTitle: "No matching venue",
        noResultBody: "Try an abbreviation, an English full name, or fewer filters.",
        conference: "Conference",
        journal: "Journal",
        former: "Formerly",
      };

  const elements = {
    input: document.querySelector("#searchInput"),
    rankFilter: document.querySelector("#rankFilter"),
    typeFilter: document.querySelector("#typeFilter"),
    categoryFilter: document.querySelector("#categoryFilter"),
    status: document.querySelector("#resultStatus"),
    clear: document.querySelector("#clearButton"),
    results: document.querySelector("#results"),
    localBadge: document.querySelector("#localBadge"),
    privacyText: document.querySelector("#privacyText"),
    sourceLink: document.querySelector("#sourceLink"),
  };

  const state = {
    query: "",
    rank: "all",
    type: "all",
    category: "all",
    activeIndex: -1,
    resultElements: [],
  };

  function setLocalizedLabels() {
    document.documentElement.lang = isChinese ? "zh-CN" : "en";
    elements.localBadge.textContent = messages.local;
    elements.input.placeholder = messages.placeholder;
    elements.input.setAttribute("aria-label", messages.searchLabel);
    elements.rankFilter.querySelector("[data-rank='all']").textContent = messages.all;
    elements.typeFilter.options[0].textContent = messages.allTypes;
    elements.typeFilter.options[1].textContent = messages.conferenceOnly;
    elements.typeFilter.options[2].textContent = messages.journalOnly;
    elements.categoryFilter.options[0].textContent = messages.allCategories;
    elements.clear.textContent = messages.clear;
    elements.privacyText.textContent = messages.privacy;
    elements.sourceLink.textContent = messages.source;
  }

  function populateCategories() {
    for (const category of dataset.categories) {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = isChinese ? category.zh : category.en;
      elements.categoryFilter.append(option);
    }
  }

  function countByRank(rank) {
    return dataset.venues.filter((venue) => venue.rank === rank).length;
  }

  function createSummaryCard(rank) {
    const card = document.createElement("div");
    card.className = `summary-card rank-${rank.toLowerCase()}`;
    const strong = document.createElement("strong");
    const count = countByRank(rank);
    strong.textContent = count.toLocaleString();
    const label = document.createElement("span");
    label.textContent = messages.rankCount(rank, count);
    card.append(strong, label);
    return card;
  }

  function renderOverview() {
    const overview = document.createElement("div");
    overview.className = "overview";

    const summaries = document.createElement("div");
    summaries.className = "rank-summary";
    summaries.append(
      createSummaryCard("A"),
      createSummaryCard("B"),
      createSummaryCard("C"),
    );

    const welcome = document.createElement("div");
    welcome.className = "welcome-card";
    const title = document.createElement("h2");
    title.textContent = messages.welcomeTitle;
    const body = document.createElement("p");
    body.textContent = messages.welcomeBody;
    const suggestions = document.createElement("div");
    suggestions.className = "suggestions";
    for (const value of ["CVPR", "NeurIPS", "ICML", "TPAMI", "TSE", "SIGMOD"]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "suggestion";
      button.textContent = value;
      button.addEventListener("click", () => {
        elements.input.value = value;
        state.query = value;
        render();
        elements.input.focus();
      });
      suggestions.append(button);
    }
    welcome.append(title, body, suggestions);
    overview.append(summaries, welcome);
    elements.results.replaceChildren(overview);
    elements.status.textContent = messages.total(dataset.venues.length);
    state.resultElements = [];
  }

  function categoryLabel(venue) {
    const category = engine.categoryFor(index, venue);
    return category ? (isChinese ? category.zh : category.en) : venue.category;
  }

  function createResultCard(result, position) {
    const { venue } = result;
    const card = document.createElement(venue.url ? "a" : "div");
    card.className = "result-card";
    card.dataset.position = String(position);
    card.tabIndex = 0;
    if (venue.url) {
      card.href = venue.url;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
    }

    const rank = document.createElement("span");
    rank.className = `rank-pill rank-${venue.rank.toLowerCase()}`;
    rank.textContent = `CCF ${venue.rank}`;

    const copy = document.createElement("div");
    copy.className = "result-copy";
    const title = document.createElement("h2");
    title.className = "result-title";
    if (venue.abbr) {
      const abbreviation = document.createElement("span");
      abbreviation.className = "result-abbr";
      abbreviation.textContent = venue.abbr;
      title.append(abbreviation);
    }
    title.append(document.createTextNode(venue.name));

    const meta = document.createElement("div");
    meta.className = "result-meta";
    const typeLabel = venue.type === "journal" ? messages.journal : messages.conference;
    meta.textContent = `${typeLabel} · ${categoryLabel(venue)}`;
    copy.append(title, meta);

    if (venue.aliases && venue.aliases.length) {
      const aliases = document.createElement("div");
      aliases.className = "result-alias";
      aliases.textContent = `${messages.former}: ${venue.aliases.slice(0, 2).join(" · ")}`;
      copy.append(aliases);
    }

    const external = document.createElement("span");
    external.className = "external-mark";
    external.textContent = venue.url ? "↗" : "";
    external.setAttribute("aria-hidden", "true");
    card.append(rank, copy, external);
    card.addEventListener("focus", () => setActive(position, false));
    return card;
  }

  function renderNoResults() {
    const box = document.createElement("div");
    box.className = "no-results";
    const content = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = messages.noResultTitle;
    const body = document.createElement("span");
    body.textContent = messages.noResultBody;
    content.append(title, body);
    box.append(content);
    elements.results.replaceChildren(box);
    state.resultElements = [];
  }

  function setActive(position, moveFocus = true) {
    if (!state.resultElements.length) return;
    const bounded = Math.max(0, Math.min(position, state.resultElements.length - 1));
    state.activeIndex = bounded;
    state.resultElements.forEach((element, indexValue) => {
      element.classList.toggle("is-active", indexValue === bounded);
    });
    if (moveFocus) state.resultElements[bounded].focus();
  }

  function renderResults(results) {
    const fragment = document.createDocumentFragment();
    state.resultElements = results.map((result, position) => {
      const card = createResultCard(result, position);
      fragment.append(card);
      return card;
    });
    elements.results.replaceChildren(fragment);
    elements.status.textContent = messages.matches(results.length);
    state.activeIndex = -1;
  }

  function hasFilters() {
    return state.rank !== "all" || state.type !== "all" || state.category !== "all";
  }

  function render() {
    const query = state.query.trim();
    elements.clear.hidden = !query && !hasFilters();
    if (!query) {
      if (!hasFilters()) {
        renderOverview();
        return;
      }
      const filtered = dataset.venues
        .filter(
          (venue) =>
            (state.rank === "all" || venue.rank === state.rank) &&
            (state.type === "all" || venue.type === state.type) &&
            (state.category === "all" || venue.category === state.category),
        )
        .slice(0, 80)
        .map((venue) => ({ venue, score: 0, reason: "filter" }));
      if (filtered.length) renderResults(filtered);
      else renderNoResults();
      return;
    }

    const results = engine.search(index, query, {
      rank: state.rank,
      type: state.type,
      category: state.category,
      limit: 80,
    });
    if (results.length) renderResults(results);
    else {
      renderNoResults();
      elements.status.textContent = messages.matches(0);
    }
  }

  function reset() {
    state.query = "";
    state.rank = "all";
    state.type = "all";
    state.category = "all";
    elements.input.value = "";
    elements.typeFilter.value = "all";
    elements.categoryFilter.value = "all";
    for (const button of elements.rankFilter.querySelectorAll("button")) {
      const active = button.dataset.rank === "all";
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    render();
    elements.input.focus();
  }

  elements.input.addEventListener("input", () => {
    state.query = elements.input.value;
    render();
  });
  elements.input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(state.activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(state.activeIndex <= 0 ? 0 : state.activeIndex - 1);
    } else if (event.key === "Enter" && state.activeIndex >= 0) {
      event.preventDefault();
      state.resultElements[state.activeIndex]?.click();
    } else if (event.key === "Escape") {
      reset();
    }
  });
  elements.rankFilter.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-rank]");
    if (!button) return;
    state.rank = button.dataset.rank;
    for (const candidate of elements.rankFilter.querySelectorAll("button")) {
      const active = candidate === button;
      candidate.classList.toggle("is-active", active);
      candidate.setAttribute("aria-pressed", String(active));
    }
    render();
  });
  elements.typeFilter.addEventListener("change", () => {
    state.type = elements.typeFilter.value;
    render();
  });
  elements.categoryFilter.addEventListener("change", () => {
    state.category = elements.categoryFilter.value;
    render();
  });
  elements.clear.addEventListener("click", reset);
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== elements.input) {
      event.preventDefault();
      elements.input.focus();
    }
  });

  setLocalizedLabels();
  populateCategories();
  render();
  elements.input.focus();
})();
