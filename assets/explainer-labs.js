const LETTERS = "ABCDE";
const SVG_NS = "http://www.w3.org/2000/svg";
const ridgeStrengths = [1e-6, 1e-4, 1e-2, 1e-1, 1, 10, 100];

const orderName = (order) => order.map((task) => LETTERS[task]).join("");
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const score = (value) => value.toFixed(2);
const pct = (value) => `${Math.round(value * 100)}%`;
const signed = (value) => `${value < -0.0005 ? "−" : value > 0.0005 ? "+" : ""}${Math.abs(value).toFixed(3)}`;
const minIndex = (values) => values.reduce((best, value, index) => value < values[best] ? index : best, 0);

function html(parent, tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  parent.append(node);
  return node;
}

function svg(parent, tag, attributes, label) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (label) node.textContent = label;
  parent.append(node);
  return node;
}

function button(parent, text, className) {
  const node = html(parent, "button", text, className);
  node.type = "button";
  return node;
}

function table(parent, headers, description) {
  const grid = html(parent, "table", undefined, "lab-table");
  if (description) html(grid, "caption", description, "lab-visually-hidden");
  const head = html(html(grid, "thead"), "tr");
  for (const title of headers) html(head, "th", title).scope = "col";
  return html(grid, "tbody");
}

function tableRow(body, label, values) {
  const row = html(body, "tr");
  html(row, "th", label).scope = "row";
  for (const value of values) html(row, "td", value);
  return row;
}

function dataView(parent, headers, description) {
  const details = html(parent, "details", undefined, "lab-data");
  html(details, "summary", "View data table");
  const scroll = html(details, "div", undefined, "lab-table-region");
  scroll.tabIndex = 0;
  scroll.setAttribute("role", "region");
  scroll.setAttribute("aria-label", description);
  return table(scroll, headers, description);
}

function installOrder(host, data, tasks) {
  const { perms, F, mean: means, summary, seed_labels: seeds } = data;
  const orderLookup = new Map(perms.map((order, index) => [orderName(order), index]));
  const max = Math.ceil(Math.max(...F.flat()) * 4) / 4;
  const x = (value) => 20 + value / max * 560;
  let picked = [];
  let displayed = 0;

  host.classList.add("lab-panel", "lab-order");
  const actions = html(host, "div", undefined, "lab-order-controls");
  const board = html(actions, "div");
  html(board, "p", "Build an order", "lab-kicker");
  const slots = html(board, "ol", undefined, "lab-order-slots");
  slots.setAttribute("aria-label", "Chosen task sequence");
  const slotNodes = tasks.map(() => html(slots, "li"));
  const options = html(board, "div", undefined, "lab-task-options");
  options.setAttribute("role", "group");
  options.setAttribute("aria-label", "Available tasks");
  const taskButtons = tasks.map((label, task) => {
    const chip = button(options, LETTERS[task], "lab-chip");
    chip.title = label;
    chip.addEventListener("click", () => {
      if (picked.length === tasks.length) picked = [];
      if (picked.includes(task)) return;
      picked.push(task);
      if (picked.length === tasks.length) displayed = orderLookup.get(orderName(picked));
      render();
    });
    return chip;
  });
  const edit = html(actions, "div", undefined, "lab-actions");
  const undo = button(edit, "Undo", "lab-quiet-button");
  const clear = button(edit, "Clear", "lab-quiet-button");
  undo.addEventListener("click", () => {
    if (!picked.length) return;
    picked.pop();
    render();
  });
  clear.addEventListener("click", () => {
    if (!picked.length) return;
    picked = [];
    render();
  });

  const status = html(host, "p", undefined, "lab-note lab-order-status");
  status.setAttribute("aria-live", "polite");
  const chart = html(host, "figure", undefined, "lab-order-chart");
  html(chart, "figcaption", "Total forgetting by run", "lab-kicker");
  const plot = svg(chart, "svg", { viewBox: "0 0 600 112", role: "img" });
  svg(plot, "line", { x1: x(0), x2: x(max), y1: 93, y2: 93, class: "lab-chart-baseline" });
  for (const value of [0, max / 4, max / 2, max * 3 / 4, max]) {
    svg(plot, "line", { x1: x(value), x2: x(value), y1: 17, y2: 99, class: "lab-chart-line" });
  }
  for (const value of [summary.min_mean, summary.max_mean]) {
    svg(plot, "line", { x1: x(value), x2: x(value), y1: 15, y2: 93, class: "lab-chart-benchmark" });
  }
  const markers = svg(plot, "g", {});
  const ticks = html(chart, "div", undefined, "lab-axis-ticks");
  ticks.setAttribute("aria-hidden", "true");
  for (const value of [0, max / 4, max / 2, max * 3 / 4, max]) {
    html(ticks, "span", value.toFixed(2)).style.setProperty("--lab-tick", `${x(value) / 6}%`);
  }
  const metrics = html(host, "dl", undefined, "lab-compare-grid");
  const marker = (label, value) => {
    const wrap = html(metrics, "div");
    html(wrap, "dt", label);
    return html(wrap, "dd", value);
  };
  const average = marker("Shown order · mean", "");
  marker("Best order · mean", `${orderName(summary.best_order)}  ${score(summary.min_mean)}`);
  marker("Worst order · mean", `${orderName(summary.worst_order)}  ${score(summary.max_mean)}`);
  const rows = dataView(host, ["Run", "Total forgetting"], "Forgetting by run for the order shown");
  let lastChart;

  function render() {
    slotNodes.forEach((node, index) => {
      const task = picked[index];
      node.textContent = task === undefined ? "–" : LETTERS[task];
      node.classList.toggle("is-filled", task !== undefined);
      node.setAttribute("aria-label", task === undefined ? "Empty" : `Task ${LETTERS[task]}`);
    });
    taskButtons.forEach((chip, task) => {
      const used = picked.length < tasks.length && picked.includes(task);
      chip.setAttribute("aria-disabled", String(used));
      chip.setAttribute("aria-label", `Task ${LETTERS[task]}, ${tasks[task]}${used ? ", already placed" : ""}`);
    });
    for (const option of [undo, clear]) option.setAttribute("aria-disabled", String(!picked.length));

    const order = orderName(perms[displayed]);
    status.textContent = picked.length === tasks.length
      ? `Showing ${order} · ${score(means[displayed])} mean forgetting. Choose any task to start another order.`
      : picked.length
        ? `Place ${tasks.length - picked.length} more task${tasks.length - picked.length === 1 ? "" : "s"} to update the chart.`
        : `Tap or select tasks to change the order. The chart shows ${order}.`;
    if (lastChart === displayed) return;
    lastChart = displayed;
    plot.setAttribute("aria-label", `Total forgetting across ${seeds.length} runs for ${order}. Mean ${score(means[displayed])}.`);
    markers.replaceChildren();
    F[displayed].forEach((value, index) => {
      const dot = svg(markers, "circle", {
        cx: x(value), cy: 52 + ((index * 3) % 7 - 3) * 8, r: 5.5, class: "lab-seed-dot",
      });
      svg(dot, "title", {}, `Run ${index + 1} · ${value.toFixed(4)}`);
    });
    const at = x(means[displayed]);
    svg(markers, "line", { x1: at, x2: at, y1: 14, y2: 93, class: "lab-order-mean" });
    const diamond = svg(markers, "path", {
      d: `M${at} 7l8 7-8 7-8-7z`, class: "lab-order-marker",
    });
    svg(diamond, "title", {}, `Mean · ${means[displayed].toFixed(4)}`);
    average.textContent = `${order}  ${score(means[displayed])}`;
    rows.replaceChildren();
    F[displayed].forEach((value, index) => tableRow(rows, `Run ${index + 1}`, [value.toFixed(4)]));
    tableRow(rows, "Mean", [means[displayed].toFixed(4)]);
    tableRow(rows, `Best mean · ${orderName(summary.best_order)}`, [summary.min_mean.toFixed(4)]);
    tableRow(rows, `Worst mean · ${orderName(summary.worst_order)}`, [summary.max_mean.toFixed(4)]);
  }

  render();
}

function installNoise(host, data) {
  const { F, perms, mean: means, seed_labels: seeds } = data;
  const rankings = means.map((_, index) => index).sort((a, b) => means[a] - means[b]);
  const allRuns = rankings.map((index) => means[index]);
  const yMax = Math.ceil(Math.max(...F.flat()) * 4) / 4;
  const chartWidth = 1000;
  const chartHeight = 100;
  const x = (index) => index / (rankings.length - 1) * chartWidth;
  const y = (value) => chartHeight * (0.94 - value / yMax * 0.88);
  const trace = (values) => values.map((value, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(value)}`).join(" ");
  const tooltip = html(host, "div", undefined, "lab-tooltip");
  tooltip.hidden = true;
  host.classList.add("lab-panel", "lab-noise");
  const plots = html(host, "div", undefined, "lab-seed-grid");
  const left = createPlot(plots, "Left run", 0);
  const right = createPlot(plots, "Right run", 1);
  const controls = html(host, "div", undefined, "lab-noise-controls");
  const rangeLabel = html(controls, "div", undefined, "lab-range-label");
  const sliderLabel = html(rangeLabel, "label", "Runs averaged", "lab-kicker");
  sliderLabel.htmlFor = "noise-seed-count";
  const output = html(rangeLabel, "output", undefined, "lab-kicker");
  output.setAttribute("for", "noise-seed-count");
  const slider = html(controls, "input");
  slider.type = "range";
  slider.id = "noise-seed-count";
  slider.min = "1";
  slider.max = seeds.length;
  slider.value = "1";
  const endpoints = html(controls, "div", undefined, "lab-range-endpoints");
  endpoints.setAttribute("aria-hidden", "true");
  html(endpoints, "span", "1 run");
  html(endpoints, "span", `${seeds.length} runs`);
  const combined = createPlot(host, "Averaged landscape", undefined, true);
  const legend = html(host, "div", undefined, "lab-plot-legend");
  html(legend, "span", "Selected average", "lab-legend-measured");
  html(legend, "span", "All-run average", "lab-legend-reference");
  html(host, "p", "The slider averages runs from Run 1 onward. Each chart ranks task orders by their average forgetting over all runs.", "lab-note");
  const rows = dataView(host, ["Order", "Left run", "Right run", "Average", "All runs"], "Forgetting at each ranked order");

  function createPlot(parent, label, defaultIndex, reference = false) {
    const figure = html(parent, "figure", undefined, "lab-noise-figure");
    const top = html(figure, "figcaption", undefined, "lab-noise-caption");
    html(top, "span", label, "lab-kicker");
    let select;
    if (defaultIndex !== undefined) {
      select = html(top, "select", undefined, "lab-run-select");
      select.setAttribute("aria-label", label);
      seeds.forEach((_, index) => {
        html(select, "option", `Run ${index + 1}`).value = index;
      });
      select.value = defaultIndex;
      select.addEventListener("change", update);
    }
    const frame = html(figure, "div", undefined, "lab-noise-frame");
    const axis = html(frame, "div", undefined, "lab-y-axis");
    axis.setAttribute("aria-hidden", "true");
    for (const value of [yMax, yMax / 2, 0]) html(axis, "span", value.toFixed(1));
    const chart = svg(frame, "svg", {
      class: "lab-noise-plot", viewBox: `0 0 ${chartWidth} ${chartHeight}`,
      preserveAspectRatio: "none", role: "img", "aria-label": `${label} total forgetting, aligned by order.`,
    });
    for (const value of [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax]) {
      svg(chart, "line", { x1: 0, x2: chartWidth, y1: y(value), y2: y(value), class: "lab-chart-line" });
    }
    if (reference) svg(chart, "path", { d: trace(allRuns), class: "lab-chart-reference" });
    const path = svg(chart, "path", { class: "lab-chart-trace" });
    const focus = svg(chart, "line", { x1: 0, x2: 0, y1: 0, y2: chartHeight, class: "lab-chart-cursor" });
    const state = { select, chart, path, values: [] };

    function hideTip() {
      tooltip.hidden = true;
      focus.classList.remove("is-visible");
    }

    function showTip(event) {
      if (!state.values.length) return;
      const rect = chart.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const slot = Math.round(fraction * (rankings.length - 1));
      focus.setAttribute("x1", x(slot));
      focus.setAttribute("x2", x(slot));
      focus.classList.add("is-visible");
      tooltip.textContent = `${orderName(perms[rankings[slot]])} · ${state.values[slot].toFixed(4)}`;
      tooltip.hidden = false;
      tooltip.style.left = `${Math.max(8, Math.min(event.clientX + 12, window.innerWidth - tooltip.offsetWidth - 8))}px`;
      const top = event.clientY - tooltip.offsetHeight - 10;
      tooltip.style.top = `${top < 8 ? event.clientY + 12 : top}px`;
    }

    chart.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "touch") showTip(event);
    });
    chart.addEventListener("click", showTip);
    chart.addEventListener("pointerleave", hideTip);
    chart.addEventListener("pointercancel", hideTip);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideTip();
    });
    return state;
  }

  function update() {
    const leftIndex = Number(left.select.value);
    const rightIndex = Number(right.select.value);
    const n = Number(slider.value);
    output.value = `${n} / ${seeds.length}`;
    slider.setAttribute("aria-valuetext", `${n} of ${seeds.length} runs averaged`);
    left.values = rankings.map((order) => F[order][leftIndex]);
    right.values = rankings.map((order) => F[order][rightIndex]);
    combined.values = n === seeds.length
      ? allRuns
      : rankings.map((order) => mean(F[order].slice(0, n)));
    for (const part of [left, right, combined]) part.path.setAttribute("d", trace(part.values));
    left.chart.setAttribute("aria-label", `Run ${leftIndex + 1} total forgetting by order.`);
    right.chart.setAttribute("aria-label", `Run ${rightIndex + 1} total forgetting by order.`);
    combined.chart.setAttribute("aria-label", `Average total forgetting across the first ${n} runs and across all ${seeds.length} runs.`);

    rows.replaceChildren();
    rankings.forEach((order, rank) => tableRow(rows, orderName(perms[order]), [
      left.values[rank], right.values[rank], combined.values[rank], allRuns[rank],
    ].map((value) => value.toFixed(4))));
  }

  slider.addEventListener("input", update);
  update();
}

function installTaskEffects(host, data, tasks) {
  const { position_table: positions, pair_fit: fit } = data;
  host.classList.add("lab-panel", "lab-task-effects");
  html(host, "h3", "Where a task lands", "lab-heading");
  const positionBody = table(host, ["Task", ...tasks.map((_, index) => String(index + 1))], "Centered position effects by task and position");
  positionBody.parentElement.classList.add("lab-position-map");
  const extent = Math.max(...positions.flat().map(Math.abs));
  positions.forEach((row, task) => {
    const cells = tableRow(positionBody, LETTERS[task], row.map(signed)).cells;
    cells[0].title = tasks[task];
    row.forEach((value, index) => {
      const cell = cells[index + 1];
      const strength = Math.abs(value) / extent;
      cell.className = value < -0.0005 ? "lab-effect-lower" : value > 0.0005 ? "lab-effect-higher" : "lab-effect-neutral";
      cell.style.setProperty("--lab-effect-strength", `${Math.round(strength * 56)}%`);
      cell.title = `Task ${LETTERS[task]} · Position ${index + 1} · ${signed(value)} forgetting`;
    });
  });
  const bestForD = minIndex(positions[3]) + 1;
  html(host, "p", `Minus means lower fitted forgetting and plus means higher. For task D, slot ${bestForD} has the lowest forgetting in this layer.`, "lab-note");

  const pairs = html(host, "div", undefined, "lab-pairs");
  html(pairs, "h3", "Which tasks sit together", "lab-heading");
  const strongest = [...fit.pairs].sort((a, b) => Math.abs(b.together) - Math.abs(a.together)).slice(0, 3);
  const list = html(pairs, "ul", undefined, "lab-pair-list");
  for (const { a, b, together } of strongest) {
    const item = html(list, "li");
    html(item, "strong", `${LETTERS[a]} + ${LETTERS[b]}`);
    html(item, "span", `${together < 0 ? "Lower" : "Higher"} fitted forgetting when adjacent`);
    html(item, "span", signed(together), "lab-pair-value");
  }
  html(pairs, "p", `This fit explains ${pct(fit.share)} of the layer for pairs together in the all-run average. Each estimate compares neighbouring tasks with the same pair separated.`, "lab-note");
  const rows = dataView(pairs, ["Pair", "Adjacent minus separated"], "Fitted adjacency effects within the symmetric-pair layer");
  for (const { a, b, together } of fit.pairs) tableRow(rows, `${LETTERS[a]} + ${LETTERS[b]}`, [signed(together)]);
}

// The same centered ridge fit, lambda grid and leave-one-out criterion as tol.scoring._ridge_loo.
function solve(matrix, values) {
  const size = matrix.length;
  const rows = matrix.map((row, index) => [...row, values[index]]);
  for (let col = 0; col < size; col++) {
    let pivot = col;
    for (let row = col + 1; row < size; row++) {
      if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    }
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    for (let row = 0; row < size; row++) {
      if (row === col) continue;
      const scale = rows[row][col] / rows[col][col];
      for (let k = col; k <= size; k++) rows[row][k] -= scale * rows[col][k];
    }
  }
  return rows.map((row, index) => row[size] / row[index]);
}

const dot = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0);

function ridgeLooPredict(basis, measured, values) {
  const features = measured.map((order) => basis[order]);
  const targetMean = mean(values);
  const featureMean = features[0].map((_, col) => mean(features.map((row) => row[col])));
  const centered = features.map((row) => row.map((value, col) => value - featureMean[col]));
  const target = values.map((value) => value - targetMean);
  const columns = featureMean.map((_, index) => centered.map((row) => row[index]));
  const gram = columns.map((left) => columns.map((right) => dot(left, right)));
  const cross = columns.map((col) => dot(col, target));
  let bestError = Infinity;
  let fittedWeights;

  for (const lambda of ridgeStrengths) {
    const penalty = gram.map((row, a) => row.map((value, b) => value + (a === b ? lambda : 0)));
    const weights = solve(penalty, cross);
    const error = mean(centered.map((row, index) => {
      const leverage = dot(row, solve(penalty, row));
      return ((target[index] - dot(row, weights)) / Math.max(1 - leverage, 1e-9)) ** 2;
    }));
    if (error < bestError) {
      bestError = error;
      fittedWeights = weights;
    }
  }

  return basis.map((row) => targetMean + dot(row.map((value, col) => value - featureMean[col]), fittedWeights));
}

function gameMeans(data, heldoutSeeds) {
  const trainSeeds = data.seed_labels.map((_, index) => index).filter((index) => !heldoutSeeds.includes(index));
  return {
    trainMeans: data.F.map((row) => mean(trainSeeds.map((seed) => row[seed]))),
    heldoutMeans: data.F.map((row) => mean(heldoutSeeds.map((seed) => row[seed]))),
  };
}

export function scoreOrderGame(data, heldoutSeeds, measured, choice) {
  const { trainMeans, heldoutMeans } = gameMeans(data, heldoutSeeds);
  const trainingScores = measured.map((order) => trainMeans[order]);
  const bestOfBudget = measured[minIndex(trainingScores)];
  const modelPrediction = ridgeLooPredict(data.pwo_basis, measured, trainingScores);
  const model = minIndex(modelPrediction);
  const optimum = minIndex(heldoutMeans);
  const floor = heldoutMeans[optimum];
  const spread = Math.max(...heldoutMeans) - floor;
  const regret = (order) => (heldoutMeans[order] - floor) / spread;
  return {
    trainMeans, heldoutMeans, modelPrediction, bestOfBudget, model, optimum,
    regrets: { you: regret(choice), bestOfBudget: regret(bestOfBudget), model: regret(model) },
  };
}

function installGame(host, data, tasks) {
  const budget = data.summary.game_n;
  const heldoutCount = Math.floor(data.seed_labels.length / 2);
  const tally = { games: 0, beatBest: 0, beatModel: 0 };
  let heldoutSeeds, trainMeans, measured, choice;
  let activeTile = 0;

  host.classList.add("lab-panel", "lab-game");
  const actions = html(host, "div", undefined, "lab-game-actions");
  const status = html(actions, "p", undefined, "lab-game-status");
  status.setAttribute("aria-live", "polite");
  const restart = button(actions, "New game", "lab-quiet-button");
  html(host, "p", tasks.map((task, index) => `${LETTERS[index]} · ${task.replace("digits ", "")}`).join("   "), "lab-note lab-game-task-key");
  const grid = html(host, "div", undefined, "lab-game-grid");
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", "Task orders. Use arrow keys to move among orders.");
  const results = html(host, "div", undefined, "lab-game-results");
  results.hidden = true;

  const tiles = data.perms.map((order, index) => {
    const tile = button(grid, undefined, "lab-game-tile");
    html(tile, "span", orderName(order));
    const value = html(tile, "span", "", "lab-game-tile-value");
    tile.addEventListener("click", () => play(index));
    tile.addEventListener("focus", () => {
      tiles[activeTile].tile.tabIndex = -1;
      activeTile = index;
      tile.tabIndex = 0;
    });
    return { tile, value };
  });

  function start() {
    const seeds = data.seed_labels.map((_, index) => index);
    for (let end = seeds.length - 1; end > 0; end--) {
      const selected = Math.floor(Math.random() * (end + 1));
      [seeds[end], seeds[selected]] = [seeds[selected], seeds[end]];
    }
    heldoutSeeds = seeds.slice(0, heldoutCount).sort((a, b) => a - b);
    ({ trainMeans } = gameMeans(data, heldoutSeeds));
    measured = [];
    choice = null;
    activeTile = 0;
    grid.scrollTop = 0;
    results.replaceChildren();
    results.hidden = true;
    render();
  }

  function render() {
    const left = budget - measured.length;
    tiles.forEach(({ tile, value }, index) => {
      const trained = measured.includes(index);
      tile.tabIndex = index === activeTile ? 0 : -1;
      tile.classList.toggle("is-measured", trained);
      tile.classList.toggle("is-chosen", index === choice);
      const unavailable = (trained && left > 0) || choice !== null;
      tile.setAttribute("aria-disabled", String(unavailable));
      value.textContent = trained ? score(trainMeans[index]) : "";
      if (index === choice) tile.setAttribute("aria-description", "Your choice");
      else if (trained) tile.setAttribute("aria-description", "Measured forgetting");
      else tile.removeAttribute("aria-description");
    });
    if (left) status.textContent = `Train ${left} more order${left === 1 ? "" : "s"}. Pick a tile to measure its forgetting.`;
    else if (choice === null) status.textContent = `Pick the order you think will forget the least. We’ll score it on ${heldoutCount} unseen runs.`;
    else {
      const gameCount = `${tally.games} ${tally.games === 1 ? "game" : "games"}`;
      const winCount = wins => wins === 1 ? "once" : `${wins} times`;
      status.textContent = `You’ve played ${gameCount}. You beat best-of-${budget} ${winCount(tally.beatBest)} and the fitted model ${winCount(tally.beatModel)}.`;
    }
  }

  function showResults() {
    const result = scoreOrderGame(data, heldoutSeeds, measured, choice);
    const { regrets, bestOfBudget, model, optimum, heldoutMeans } = result;
    tally.games++;
    if (regrets.you < regrets.bestOfBudget) tally.beatBest++;
    if (regrets.you < regrets.model) tally.beatModel++;
    results.hidden = false;
    const title = html(results, "h3", "Your results on unseen runs", "lab-heading");
    title.tabIndex = -1;
    const body = table(results, ["Player", "Order", "Forgetting", "Regret"], "Game results on the unseen runs");
    const add = (label, order, regret) => tableRow(body, label, [orderName(data.perms[order]), score(heldoutMeans[order]), pct(regret)]);
    add("You", choice, regrets.you);
    add(`Best of ${budget}`, bestOfBudget, regrets.bestOfBudget);
    add("Fitted model", model, regrets.model);
    add("Best possible", optimum, 0);
    html(results, "p", "Regret is how far the chosen order sits from the best possible, as a share of the gap between the best and worst.", "lab-note");
    render();
    title.focus();
  }

  function play(index) {
    if (choice !== null || (measured.length < budget && measured.includes(index))) return;
    if (measured.length < budget) {
      measured.push(index);
      render();
      return;
    }
    choice = index;
    showResults();
  }

  grid.addEventListener("keydown", (event) => {
    const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns };
    if (!(event.key in move)) return;
    event.preventDefault();
    const next = Math.max(0, Math.min(tiles.length - 1, activeTile + move[event.key]));
    tiles[next].tile.focus();
  });
  restart.addEventListener("click", start);
  start();
}

export function installLabs(data) {
  const { k5, tasks } = data;
  installOrder(document.getElementById("lab-order"), k5, tasks);
  installNoise(document.getElementById("lab-noise"), k5);
  installTaskEffects(document.getElementById("lab-task-effects"), k5, tasks);
  installGame(document.getElementById("lab-game"), k5, tasks);
}

