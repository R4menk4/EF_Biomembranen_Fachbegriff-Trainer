const STORAGE_KEY = "biomembranen-flashcards-progress";
const LEVELS = [
  { key: "easy", label: "Einfach", className: "easy" },
  { key: "medium", label: "Mittel", className: "medium" },
  { key: "hard", label: "Schwer", className: "hard" },
  { key: "unknown", label: "Noch nicht eingeordnet", className: "unknown" }
];

const state = {
  terms: [],
  topics: [],
  progress: {},
  view: "menu",
  selection: null,
  cards: [],
  currentIndex: 0,
  mode: "term",
  flipped: false
};

const app = document.querySelector("#app");
const templates = {
  menu: document.querySelector("#menu-template"),
  study: document.querySelector("#study-template"),
  progress: document.querySelector("#progress-template")
};

document.addEventListener("DOMContentLoaded", init);
document.addEventListener("click", handleDocumentClick);

async function init() {
  loadProgress();

  try {
    const response = await fetch("data/terms.json");
    if (!response.ok) {
      throw new Error("Terms file could not be loaded.");
    }

    const terms = await response.json();
    state.terms = normalizeTerms(terms);
    state.topics = getTopics(state.terms);
    renderMenu();
  } catch (error) {
    renderError();
  }
}

function normalizeTerms(terms) {
  if (!Array.isArray(terms)) {
    return [];
  }

  return terms.filter((term) => (
    term &&
    typeof term.id === "string" &&
    typeof term.term === "string" &&
    typeof term.definition === "string" &&
    Array.isArray(term.topics)
  ));
}

function getTopics(terms) {
  const topicSet = new Set();
  terms.forEach((term) => {
    term.topics.forEach((topic) => {
      if (typeof topic === "string" && topic.trim()) {
        topicSet.add(topic.trim());
      }
    });
  });
  return [...topicSet].sort((a, b) => a.localeCompare(b, "de"));
}

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.progress = saved && typeof saved === "object" ? saved : {};
  } catch (error) {
    state.progress = {};
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function handleDocumentClick(event) {
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) {
    return;
  }

  const action = actionTarget.dataset.action;

  if (action === "menu") {
    renderMenu();
  }

  if (action === "progress") {
    renderProgress();
  }

  if (action === "shuffle") {
    shuffleCurrentCards();
  }

  if (action === "reset-progress") {
    resetProgress();
  }
}

function renderMenu() {
  state.view = "menu";
  state.selection = null;
  state.flipped = false;

  const view = cloneTemplate("menu");
  const topicButtons = view.querySelector("#topic-buttons");
  const levelButtons = view.querySelector("#level-buttons");
  const topicsCount = view.querySelector("#topics-count");

  topicsCount.textContent = `${state.topics.length} Themen`;

  state.topics.forEach((topic) => {
    const count = state.terms.filter((term) => term.topics.includes(topic)).length;
    const button = createChoiceButton(topic, `${count} Begriffe`, () => startTopic(topic));
    topicButtons.append(button);
  });

  LEVELS.forEach((level) => {
    const count = getCardsByLevel(level.key).length;
    const button = createChoiceButton(level.label, `${count} Begriffe`, () => startLevel(level.key), level.className);
    levelButtons.append(button);
  });

  replaceApp(view);
}

function createChoiceButton(title, subtitle, onClick, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `choice-button ${className}`.trim();
  button.innerHTML = `<strong></strong><span></span>`;
  button.querySelector("strong").textContent = title;
  button.querySelector("span").textContent = subtitle;
  button.addEventListener("click", onClick);
  return button;
}

function startTopic(topic) {
  state.selection = { type: "topic", label: topic };
  state.cards = shuffleCards(state.terms.filter((term) => term.topics.includes(topic)));
  state.currentIndex = 0;
  state.flipped = false;
  renderStudy();
}

function startLevel(levelKey) {
  const level = LEVELS.find((item) => item.key === levelKey);
  state.selection = { type: "level", key: levelKey, label: level.label };
  state.cards = shuffleCards(getCardsByLevel(levelKey));
  state.currentIndex = 0;
  state.flipped = false;
  renderStudy();
}

function getCardsByLevel(levelKey) {
  if (levelKey === "unknown") {
    return state.terms.filter((term) => !state.progress[term.id]);
  }
  return state.terms.filter((term) => state.progress[term.id] === levelKey);
}

function renderStudy() {
  state.view = "study";

  const view = cloneTemplate("study");
  view.querySelector("#selection-type").textContent = state.selection.type === "topic" ? "Thema" : "Lernstand";
  view.querySelector("#selection-title").textContent = state.selection.label;

  const counter = view.querySelector("#card-counter");
  const content = view.querySelector("#study-content");
  const modeInputs = view.querySelectorAll("input[name='study-mode']");

  modeInputs.forEach((input) => {
    input.checked = input.value === state.mode;
    input.addEventListener("change", () => {
      state.mode = input.value;
      state.flipped = false;
      renderStudy();
    });
  });

  if (state.cards.length === 0) {
    counter.textContent = "Keine Karten";
    content.append(createEmptyState());
  } else {
    counter.textContent = `Karte ${state.currentIndex + 1} von ${state.cards.length}`;
    content.append(createFlashcard(state.cards[state.currentIndex]));
  }

  replaceApp(view);
}

function createFlashcard(card) {
  const frontLabel = state.mode === "term" ? "Fachbegriff" : "Definition";
  const backLabel = state.mode === "term" ? "Definition" : "Fachbegriff";
  const frontText = state.mode === "term" ? card.term : card.definition;
  const backText = state.mode === "term" ? card.definition : card.term;
  const frontTextClass = state.mode === "term" ? "" : "definition-text";
  const backTextClass = state.mode === "term" ? "definition-text" : "";

  const wrapper = document.createElement("div");
  wrapper.className = "flashcard-wrap";

  const cardSurface = document.createElement("div");
  cardSurface.className = `flashcard-button ${state.flipped ? "is-flipped" : ""}`.trim();
  cardSurface.setAttribute("role", "group");
  cardSurface.setAttribute("tabindex", "0");
  cardSurface.setAttribute("aria-label", state.flipped ? "Karteikarte, Rückseite sichtbar. Enter drücken zum Zurückdrehen." : "Karteikarte, Vorderseite sichtbar. Enter drücken zum Umdrehen.");
  cardSurface.innerHTML = `
    <span class="flashcard-inner">
      <span class="card-face card-front">
        <span class="card-label"></span>
        <span class="card-main ${frontTextClass}"></span>
        <span class="card-hint">Klicken oder Enter drücken zum Umdrehen</span>
      </span>
      <span class="card-face card-back">
        <span class="card-label"></span>
        <span class="card-main ${backTextClass}"></span>
        <span class="self-rating" aria-label="Selbsteinschätzung">
          <span>Wie sicher bist du?</span>
          <span class="rating-buttons"></span>
        </span>
      </span>
    </span>
  `;

  cardSurface.querySelector(".card-front .card-label").textContent = frontLabel;
  cardSurface.querySelector(".card-back .card-label").textContent = backLabel;
  cardSurface.querySelector(".card-front .card-main").textContent = frontText;
  cardSurface.querySelector(".card-back .card-main").textContent = backText;
  cardSurface.addEventListener("click", () => flipCard());
  cardSurface.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      flipCard();
    }
  });

  const ratingButtons = cardSurface.querySelector(".rating-buttons");
  LEVELS.filter((level) => level.key !== "unknown").forEach((level) => {
    const ratingButton = document.createElement("button");
    ratingButton.type = "button";
    ratingButton.className = `rating-button ${level.className}`;
    ratingButton.textContent = level.label;
    ratingButton.addEventListener("click", (event) => {
      event.stopPropagation();
      rateCard(card.id, level.key);
    });
    ratingButtons.append(ratingButton);
  });

  wrapper.append(cardSurface);
  return wrapper;
}

function flipCard() {
  state.flipped = !state.flipped;
  renderStudy();
}

function rateCard(cardId, levelKey) {
  state.progress[cardId] = levelKey;
  saveProgress();
  state.currentIndex = (state.currentIndex + 1) % state.cards.length;
  state.flipped = false;
  renderStudy();
}

function shuffleCurrentCards() {
  if (state.view !== "study") {
    return;
  }
  state.cards = shuffleCards(state.cards);
  state.currentIndex = 0;
  state.flipped = false;
  renderStudy();
}

function renderProgress() {
  state.view = "progress";
  state.flipped = false;

  const view = cloneTemplate("progress");
  const overallProgress = view.querySelector("#overall-progress");
  const topicProgress = view.querySelector("#topic-progress");

  const totals = countLevels(state.terms);
  LEVELS.forEach((level) => {
    overallProgress.append(createStatCard(level, totals[level.key]));
  });

  state.topics.forEach((topic) => {
    const topicTerms = state.terms.filter((term) => term.topics.includes(topic));
    topicProgress.append(createTopicCard(topic, topicTerms));
  });

  replaceApp(view);
}

function createStatCard(level, count) {
  const card = document.createElement("article");
  card.className = `stat-card ${level.className}`;
  card.innerHTML = `<strong></strong><span></span>`;
  card.querySelector("strong").textContent = count;
  card.querySelector("span").textContent = level.label;
  return card;
}

function createTopicCard(topic, terms) {
  const counts = countLevels(terms);
  const card = document.createElement("article");
  card.className = "topic-card";
  card.innerHTML = `
    <h3></h3>
    <p class="topic-total"></p>
    <div class="mini-stats"></div>
  `;
  card.querySelector("h3").textContent = topic;
  card.querySelector(".topic-total").textContent = `${terms.length} Karten`;

  const miniStats = card.querySelector(".mini-stats");
  LEVELS.forEach((level) => {
    const stat = document.createElement("div");
    stat.className = `mini-stat ${level.className}`;
    stat.innerHTML = `<strong></strong><span></span>`;
    stat.querySelector("strong").textContent = counts[level.key];
    stat.querySelector("span").textContent = level.label;
    miniStats.append(stat);
  });

  return card;
}

function countLevels(terms) {
  return terms.reduce((counts, term) => {
    const level = state.progress[term.id] || "unknown";
    counts[level] += 1;
    return counts;
  }, { easy: 0, medium: 0, hard: 0, unknown: 0 });
}

function resetProgress() {
  const confirmed = window.confirm("Möchtest du den gespeicherten Lernstand wirklich zurücksetzen?");
  if (!confirmed) {
    return;
  }

  state.progress = {};
  localStorage.removeItem(STORAGE_KEY);
  renderProgress();
}

function createEmptyState() {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.innerHTML = `
    <p>Für diese Auswahl gibt es aktuell keine Begriffe.<br>Wähle ein anderes Thema oder einen anderen Lernstand aus.</p>
    <button class="ghost-button" type="button" data-action="menu">Zum Menü</button>
  `;
  return empty;
}

function renderError() {
  const errorView = document.createElement("section");
  errorView.className = "error-view view-panel";
  errorView.innerHTML = `
    <p class="eyebrow">Fehler</p>
    <h1>Die Fachbegriffe konnten nicht geladen werden.</h1>
    <p>Bitte prüfe, ob die Datei data/terms.json vorhanden ist.</p>
  `;
  replaceApp(errorView);
}

function cloneTemplate(name) {
  return templates[name].content.firstElementChild.cloneNode(true);
}

function replaceApp(view) {
  app.replaceChildren(view);
  app.focus({ preventScroll: true });
}

function shuffleCards(cards) {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}
