import { installAscii } from "./explainer-ascii.js";

const root = document.documentElement;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const getChoice = key => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const saveChoice = (key, value) => {
  try { localStorage.setItem(key, value); } catch { /* Preference is still applied to this page. */ }
};
const isStill = () => root.dataset.motion === "off";

function installControls() {
  const theme = document.querySelector("[data-theme-button]");
  const motion = document.querySelector("[data-motion-button]");
  let motionChoice = getChoice("explainer-motion");

  function applyTheme(value) {
    root.dataset.theme = value;
    const label = value === "light" ? "Switch to dark mode" : "Switch to light mode";
    theme.setAttribute("aria-label", label);
    theme.title = label;
    window.dispatchEvent(new Event("explainer-themechange"));
  }

  function applyMotion() {
    const value = motionChoice || (reduceMotion.matches ? "off" : "on");
    const label = value === "off" ? "Resume motion" : "Pause motion";
    root.dataset.motion = value;
    motion.setAttribute("aria-pressed", String(value === "off"));
    motion.title = label;
    motion.querySelector("[data-motion-label]").textContent = label;
    window.dispatchEvent(new Event("explainer-motionchange"));
  }

  applyTheme(getChoice("explainer-theme") === "light" ? "light" : "dark");
  theme.hidden = false;

  theme.addEventListener("click", () => {
    const value = root.dataset.theme === "light" ? "dark" : "light";
    saveChoice("explainer-theme", value);
    applyTheme(value);
  });
  if (!motion) return;
  applyMotion();
  motion.hidden = false;
  motion.addEventListener("click", () => {
    motionChoice = isStill() ? "on" : "off";
    saveChoice("explainer-motion", motionChoice);
    applyMotion();
  });
  reduceMotion.addEventListener("change", applyMotion);
}

const percent = (value, digits = 0) => new Intl.NumberFormat("en", {
  style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits,
}).format(value);

function populateText(data) {
  const summary = data.k5.summary;
  const geometry = data.k4.summary;
  const beyondPairs = data.k5.layers.slice(3).reduce((total, layer) => total + layer.signal_share, 0);
  const facts = { orders: summary.n_orders, seeds: summary.n_seeds, beyond: percent(beyondPairs, 1) };
  const prose = {
    range: " from " + summary.min_mean.toFixed(2) + " to " + summary.max_mean.toFixed(2),
    geometry: ", with " + geometry.n_orders + " corners and " + geometry.n_edges + " edges",
    seedVariation: " (a standard deviation of about " + summary.seed_sd.toFixed(2) + ", averaged over orders)",
    repeatShare: ": about " + percent(summary.reproducible_share) + " of the variation across orders repeats across seeds",
    beyondPair: percent(beyondPairs, 1),
    partitions: ". In order, the partitions are " + data.k5.layers.map(layer => layer.irreps.join(" and ")).join(", "),
    budget: summary.game_n,
  };

  for (const element of document.querySelectorAll("[data-fact]")) {
    element.textContent = facts[element.dataset.fact];
  }
  for (const element of document.querySelectorAll("[data-text]")) {
    element.textContent = prose[element.dataset.text];
  }
  document.querySelector("[data-facts]")?.removeAttribute("hidden");

  const game = document.querySelector("[data-game-summary]");
  if (game) {
    game.textContent = "In simulations on this five-task example, the best measured order was typically about "
      + percent(summary.game_best_of_n_median_regret) + " of the way from the ideal order to the worst. "
      + "The fitted model landed about " + percent(summary.game_pwo_median_regret)
      + " of the way and won " + percent(summary.game_pwo_win_rate) + " of games.";
  }
}

function installContents() {
  const links = [...document.querySelectorAll(".contents a")];
  if (!links.length) return;
  const sections = links.map(link => document.querySelector(link.hash));
  function update() {
    let current = -1;
    const marker = Math.min(window.innerHeight * .31, 235);
    sections.forEach((section, index) => {
      if (section.getBoundingClientRect().top < marker) current = index;
    });
    links.forEach((link, index) => {
      if (index === current) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  }
  let scheduled = false;
  window.addEventListener("scroll", () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { update(); scheduled = false; });
  }, { passive: true });
  update();
}

function reportError(error) {
  const message = document.querySelector("[data-load-error]");
  if (message) {
    message.textContent = "Some interactive figures could not load. The article and paper link are available.";
    message.hidden = false;
  }
  console.error(error);
}

async function start() {
  installControls();
  installContents();
  const life = document.querySelector("[data-life]");
  if (life) {
    import("./explainer-life.js").then(({ installLife }) => installLife(life, isStill)).catch(reportError);
  }
  const source = document.body.dataset.explainerSrc;
  if (!source) return;
  const response = await fetch(source);
  if (!response.ok) throw new Error("Could not fetch the explainer data (" + response.status + ")");
  const data = await response.json();
  populateText(data);
  installAscii(document.querySelector("[data-ascii]"), data.k4, isStill);

  if (document.querySelector(".story")) {
    const widgets = await Promise.allSettled([
      import("./explainer-labs.js").then(({ installLabs }) => installLabs(data)),
      import("./explainer-viz.js").then(() => window.installViz(data)),
    ]);
    widgets.filter(result => result.status === "rejected")
      .forEach(result => reportError(result.reason));
  }
}

start().catch(reportError);
