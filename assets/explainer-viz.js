(() => {
  "use strict";

  const SVG = "http://www.w3.org/2000/svg";
  const letters = "ABCDE";
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const canAnimate = () => (document.documentElement.dataset.motion ?? (motion.matches ? "off" : "on")) === "on";
  const orderName = order => order.map(task => letters[task]).join("");
  const decimal = value => value.toFixed(3);
  const percent = value => (100 * value).toFixed(value > 0 && value < 0.001 ? 2 : 1) + "%";
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function html(tag, content, className) {
    const element = document.createElement(tag);
    if (content !== undefined) element.textContent = content;
    if (className) element.className = className;
    return element;
  }

  function svg(tag, attributes, content) {
    const element = document.createElementNS(SVG, tag);
    set(element, attributes);
    if (content !== undefined) element.textContent = content;
    return element;
  }

  function set(element, attributes) {
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  }

  function button(label, action, className = "widget-button") {
    const control = html("button", label, className);
    control.type = "button";
    control.addEventListener("click", action);
    return control;
  }

  function labelControl(name, control) {
    const label = html("label", undefined, "viz-control-label");
    control.setAttribute("aria-label", name);
    label.append(html("span", name), control);
    return label;
  }

  function dataTable(title, headers, rows) {
    const details = html("details", undefined, "chart-table");
    const scroller = html("div", undefined, "table-scroll");
    const table = html("table");
    const head = table.createTHead().insertRow();
    const body = table.createTBody();

    for (const name of headers) {
      const cell = html("th", name);
      cell.scope = "col";
      head.append(cell);
    }

    function render(nextRows) {
      const fragment = document.createDocumentFragment();
      for (const [first, ...values] of nextRows) {
        const row = document.createElement("tr");
        const rowHeader = html("th", first);
        rowHeader.scope = "row";
        row.append(rowHeader);
        for (const value of values) row.append(html("td", value));
        fragment.append(row);
      }
      body.replaceChildren(fragment);
    }

    scroller.append(table);
    details.append(html("summary", title), scroller);
    render(rows);
    return { details, render };
  }

  function localPointer(element, event) {
    const point = element.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = element.getScreenCTM();
    return matrix ? point.matrixTransform(matrix.inverse()) : point;
  }

  function installPermutohedron(root, data) {
    root.classList.add("explainer-widget", "viz-permutohedron");
    const frame = html("div", undefined, "chart-frame viz-solid-frame");
    const chart = svg("svg", {
      viewBox: "0 0 520 360",
      tabindex: 0,
      "aria-label": "Interactive shape of four-task orders. Use the arrow keys to rotate."
    });
    const order = html("select");
    const swap = html("select");
    const orders = data.perms.map(orderName);
    const values = data.F;
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const orderIndex = new Map(orders.map((name, index) => [name, index]));
    const lowFill = "color-mix(in srgb, var(--muted) 48%, var(--panel) 52%)";
    const start = { yaw: -0.49, pitch: 0.40 };
    let yaw = start.yaw;
    let pitch = start.pitch;
    let points = [];
    let selected = 0;
    let hover = null;
    let drag = null;

    orders.forEach((name, index) => swapOption(order, name, index));
    swapOption(swap, "None", "");
    data.perms[0].slice(1).forEach((_, index) => swapOption(swap, "Positions " + (index + 1) + " and " + (index + 2), index));
    function swapOption(select, name, value) {
      const option = html("option", name);
      option.value = value;
      select.append(option);
    }

    const controls = html("div", undefined, "widget-controls viz-solid-controls");
    const rotation = html("div", undefined, "viz-rotation");
    rotation.setAttribute("role", "group");
    rotation.setAttribute("aria-label", "Rotate the shape");
    rotation.append(
      button("Left", () => rotate(-0.23, 0)),
      button("Right", () => rotate(0.23, 0)),
      button("Up", () => rotate(0, -0.23)),
      button("Down", () => rotate(0, 0.23)),
      button("Reset view", () => {
        yaw = start.yaw;
        pitch = start.pitch;
        draw();
      })
    );
    controls.append(labelControl("Order", order), labelControl("Highlight a swap", swap), rotation);
    const help = html("p", "Drag to rotate. Hover or pick an order to see its forgetting.", "widget-note");
    const info = html("p", undefined, "viz-order-readout");
    info.setAttribute("aria-live", "polite");

    const edgeLayer = svg("g", { "aria-hidden": "true" });
    const nodes = svg("g", { "aria-hidden": "true" });
    const highlighted = svg("path", {
      fill: "none", stroke: "var(--ink)", "stroke-width": 3, "stroke-linecap": "round",
      "vector-effect": "non-scaling-stroke", visibility: "hidden"
    });
    const edges = data.edges.map(() => svg("line", {
      stroke: "var(--ink)", "stroke-width": 1, "vector-effect": "non-scaling-stroke"
    }));
    const vertices = values.map(value => {
      const weight = (value - minimum) / (maximum - minimum || 1);
      const fill = "color-mix(in srgb, var(--ink) " + (weight * 100) + "%, " + lowFill + ")";
      return svg("circle", { r: 5, fill, stroke: "var(--muted)", "stroke-width": 0.75 });
    });
    const selectionRing = svg("circle", {
      r: 10, fill: "none", stroke: "var(--ink)", "stroke-width": 1.5, "pointer-events": "none"
    });
    const targetRing = selectionRing.cloneNode();
    targetRing.setAttribute("stroke-dasharray", "3 2");
    const tag = svg("g", { "pointer-events": "none", "aria-hidden": "true" });
    const tagText = svg("text", { x: 8, y: 17, fill: "var(--ink)", class: "viz-solid-tag" });
    tag.append(svg("rect", { width: 114, height: 25, fill: "var(--panel)", stroke: "var(--line-strong)" }), tagText);

    const crosshair = svg("path", {
      d: "M 18 36 V 18 H 36 M 484 18 H 502 V 36 M 502 324 V 342 H 484 M 36 342 H 18 V 324",
      fill: "none", stroke: "var(--line-strong)", "aria-hidden": "true"
    });
    edgeLayer.append(...edges, highlighted);
    chart.append(crosshair, edgeLayer, nodes, selectionRing, targetRing, tag);
    frame.append(chart);

    const legend = html("div", undefined, "chart-legend viz-scale");
    const gradient = html("span", undefined, "viz-scale-gradient");
    gradient.style.background = "linear-gradient(90deg, " + lowFill + ", var(--ink))";
    gradient.setAttribute("aria-hidden", "true");
    legend.append(html("span", "Mean forgetting", "viz-scale-label"), html("span", decimal(minimum)), gradient, html("span", decimal(maximum)));

    const seedHeaders = data.seed_labels.map(label => "Seed " + label);
    const table = dataTable("View order and seed values", ["Order", "Mean", ...seedHeaders],
      orders.map((name, index) => [name, decimal(values[index]), ...data.seeds[index].map(decimal)]));
    root.append(controls, frame, legend, info, help, table.details);

    function neighbor() {
      if (swap.value === "") return null;
      const index = Number(swap.value);
      const next = [...data.perms[selected]];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return orderIndex.get(orderName(next));
    }

    function showOrder(index) {
      selected = index;
      hover = null;
      order.value = index;
      updateInfo();
      draw();
    }

    function updateInfo() {
      const adjacent = neighbor();
      const selectedText = orders[selected] + " · " + decimal(values[selected]) + " mean forgetting";
      if (adjacent === null) {
        info.textContent = selectedText;
        return;
      }
      const difference = values[adjacent] - values[selected];
      const direction = difference < 0 ? "lower" : "higher";
      const change = Math.abs(difference) >= 0.0005 ? decimal(Math.abs(difference)) + " " + direction : "same mean at this precision";
      info.textContent = selectedText + " / " + orders[adjacent] + " · " + decimal(values[adjacent]) + " (" + change + ")";
    }

    function project([x, y, z]) {
      const across = x * Math.cos(yaw) + z * Math.sin(yaw);
      const depth = z * Math.cos(yaw) - x * Math.sin(yaw);
      const down = y * Math.cos(pitch) - depth * Math.sin(pitch);
      const far = y * Math.sin(pitch) + depth * Math.cos(pitch);
      const scale = 124 / (1 + far * 0.13);
      return { x: 260 + scale * across, y: 180 + scale * down, depth: far };
    }

    function draw() {
      points = data.xyz.map(project);
      data.edges.forEach(([a, b], index) => {
        const first = points[a];
        const second = points[b];
        const opacity = clamp(0.34 - 0.13 * (first.depth + second.depth), 0.15, 0.68);
        set(edges[index], { x1: first.x, y1: first.y, x2: second.x, y2: second.y, opacity });
      });
      const drawOrder = points.map((_, index) => index).sort((a, b) => points[b].depth - points[a].depth);
      for (const index of drawOrder) {
        const { x, y, depth } = points[index];
        set(vertices[index], { cx: x, cy: y, r: 5.4 - 1.6 * depth });
      }
      nodes.append(...drawOrder.map(index => vertices[index]));
      const point = points[selected];
      set(selectionRing, { cx: point.x, cy: point.y });

      const adjacent = neighbor();
      const other = adjacent === null ? null : points[adjacent];
      set(highlighted, { visibility: other ? "visible" : "hidden" });
      set(targetRing, { visibility: other ? "visible" : "hidden" });
      if (other) {
        set(highlighted, { d: "M " + point.x + " " + point.y + " L " + other.x + " " + other.y });
        set(targetRing, { cx: other.x, cy: other.y });
      }

      const label = hover ?? selected;
      const labelPoint = points[label];
      const tagX = labelPoint.x > 345 ? labelPoint.x - 126 : labelPoint.x + 12;
      const tagY = labelPoint.y > 310 ? labelPoint.y - 32 : labelPoint.y - 29;
      tag.setAttribute("transform", "translate(" + tagX + " " + tagY + ")");
      tagText.textContent = orders[label] + "  " + decimal(values[label]);
    }

    function rotate(horizontal, vertical) {
      yaw += horizontal;
      pitch = clamp(pitch + vertical, -1.55, 1.55);
      draw();
    }

    function closest(event) {
      const point = localPointer(chart, event);
      let found = null;
      let distance = event.pointerType === "touch" ? 27 : 16;
      points.forEach((candidate, index) => {
        const current = Math.hypot(candidate.x - point.x, candidate.y - point.y);
        if (current < distance) {
          found = index;
          distance = current;
        }
      });
      return found;
    }

    order.addEventListener("change", () => showOrder(Number(order.value)));
    swap.addEventListener("change", () => {
      updateInfo();
      draw();
    });
    chart.addEventListener("keydown", event => {
      const rotationSteps = { ArrowLeft: [-0.23, 0], ArrowRight: [0.23, 0], ArrowUp: [0, -0.23], ArrowDown: [0, 0.23] };
      if (event.key in rotationSteps) {
        event.preventDefault();
        rotate(...rotationSteps[event.key]);
      }
    });
    chart.addEventListener("pointerdown", event => {
      if (!event.isPrimary || event.button !== 0) return;
      chart.setPointerCapture(event.pointerId);
      drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch, moved: false };
      hover = null;
    });
    chart.addEventListener("pointermove", event => {
      if (drag?.pointer === event.pointerId) {
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        drag.moved ||= Math.hypot(dx, dy) > 4;
        if (drag.moved) {
          yaw = drag.yaw + dx * 0.012;
          pitch = clamp(drag.pitch + dy * 0.012, -1.55, 1.55);
          draw();
        }
        return;
      }
      const candidate = closest(event);
      if (hover !== candidate) {
        hover = candidate;
        draw();
      }
    });
    chart.addEventListener("pointerup", event => {
      if (drag?.pointer !== event.pointerId) return;
      if (!drag.moved) {
        const selectedOrder = closest(event);
        if (selectedOrder !== null) showOrder(selectedOrder);
      }
      drag = null;
    });
    chart.addEventListener("lostpointercapture", () => { drag = null; });
    chart.addEventListener("pointerleave", () => {
      if (hover === null) return;
      hover = null;
      draw();
    });
    showOrder(selected);
  }

  function sharedOrder(data, curves) {
    const minimum = Math.min(0, ...curves.flat());
    const maximum = Math.max(...curves.flat());
    const step = maximum - minimum > 1.2 ? 0.25 : 0.2;
    const low = Math.floor(minimum / step) * step;
    const high = Math.ceil(maximum / step) * step;
    const indexes = data.mean.map((_, index) => index).sort((a, b) => data.mean[a] - data.mean[b]);
    return { data, indexes, low, high, step };
  }

  function comparisonPlot(config, projectionName) {
    const { data, indexes, low, high, step } = config;
    const width = 620;
    const height = 264;
    const left = 62;
    const right = 597;
    const top = 20;
    const bottom = 220;
    const x = rank => left + (right - left) * rank / (indexes.length - 1);
    const y = value => bottom - (bottom - top) * (value - low) / (high - low);
    const sorted = values => indexes.map(index => values[index]);
    const actual = sorted(data.mean);
    const frame = html("div", undefined, "chart-frame viz-comparison");
    const legend = html("div", undefined, "chart-legend viz-line-legend");
    const measuredKey = html("span", "Measured mean", "viz-key viz-key-measured");
    const projectionKey = html("span", projectionName, "viz-key viz-key-projected");
    legend.append(measuredKey, projectionKey);
    const chart = svg("svg", { viewBox: "0 0 " + width + " " + height, "aria-hidden": "true" });

    const axes = svg("g", { class: "viz-axis" });
    for (let n = 0; n <= Math.round((high - low) / step); n++) {
      const value = low + n * step;
      const tickY = y(value);
      axes.append(
        svg("line", { x1: left, y1: tickY, x2: right, y2: tickY, stroke: "var(--line)" }),
        svg("text", { x: left - 10, y: tickY + 4.5, "text-anchor": "end" }, Math.abs(value) < 1e-9 ? "0.0" : value.toFixed(2).replace(/0$/, ""))
      );
    }
    axes.append(
      svg("text", { x: left, y: 250 }, "Less forgetting"),
      svg("text", { x: right, y: 250, "text-anchor": "end" }, "More forgetting")
    );

    function plotPath(values) {
      return values.map((value, rank) => (rank === 0 ? "M " : "L ") + x(rank).toFixed(1) + " " + y(value).toFixed(1)).join(" ");
    }

    const actualPath = svg("path", {
      d: plotPath(actual), fill: "none", stroke: "var(--ink)", "stroke-width": 1.8,
      "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke"
    });
    const projectionPath = svg("path", {
      fill: "none", stroke: "var(--soft)", "stroke-width": 1.8, "stroke-dasharray": "4 3",
      "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke"
    });
    const cursor = svg("line", { y1: top, y2: bottom, stroke: "var(--line-strong)", "stroke-dasharray": "2 4" });
    const measuredDot = svg("circle", { r: 4.5, fill: "var(--ink)" });
    const projectionDot = svg("circle", { r: 5, fill: "var(--panel)", stroke: "var(--soft)", "stroke-width": 2 });
    const popup = svg("g", { visibility: "hidden", "pointer-events": "none" });
    const popupLabel = svg("text", { x: 10, y: 20, class: "viz-solid-tag", fill: "var(--ink)" });
    const popupValues = svg("text", { x: 10, y: 42, class: "viz-solid-tag", fill: "var(--soft)" });
    popup.append(svg("rect", { width: 149, height: 52, fill: "var(--panel)", stroke: "var(--line-strong)" }), popupLabel, popupValues);
    chart.append(axes, cursor, actualPath, projectionPath, projectionDot, measuredDot, popup);

    const readout = html("p", undefined, "viz-order-readout");
    const range = html("input");
    range.type = "range";
    range.min = 1;
    range.max = indexes.length;
    range.value = Math.ceil(indexes.length / 2);
    const inspector = html("div", undefined, "viz-plot-inspector");
    inspector.append(labelControl("Inspect an order", range), readout);
    frame.append(legend, chart, inspector);
    const tableHeaders = ["Order", "Measured mean", projectionName];
    const table = dataTable("View curve as a table", tableHeaders, []);
    let selected = Number(range.value) - 1;
    let displayed = actual;
    let aim = null;
    let animation = 0;
    let label = projectionName;

    function updateCursor() {
      const name = orderName(data.perms[indexes[selected]]);
      const observation = decimal(actual[selected]);
      const estimate = decimal((aim ?? displayed)[selected]);
      range.setAttribute("aria-valuetext", name + ", measured " + observation + ", estimated " + estimate);
      readout.textContent = name + " · " + observation + " measured · " + estimate + " " + label.toLowerCase();
      const marker = x(selected);
      set(cursor, { x1: marker, x2: marker });
      set(measuredDot, { cx: marker, cy: y(actual[selected]) });
      set(projectionDot, { cx: marker, cy: y(displayed[selected]) });
      popupLabel.textContent = name + " · mean / fit";
      popupValues.textContent = observation + " / " + estimate;
      const popupX = marker > right - 160 ? marker - 158 : marker + 9;
      const popupY = clamp(y(actual[selected]) - 65, top, bottom - 52);
      popup.setAttribute("transform", "translate(" + popupX + " " + popupY + ")");
    }

    function select(index) {
      selected = clamp(index, 0, indexes.length - 1);
      range.value = selected + 1;
      updateCursor();
    }

    function scrub(event) {
      const point = localPointer(chart, event);
      select(Math.round((point.x - left) * (indexes.length - 1) / (right - left)));
    }

    range.addEventListener("input", () => select(Number(range.value) - 1));
    chart.addEventListener("pointermove", event => {
      if (event.pointerType === "mouse") {
        scrub(event);
        popup.setAttribute("visibility", "visible");
      }
    });
    chart.addEventListener("pointerleave", () => popup.setAttribute("visibility", "hidden"));
    chart.addEventListener("click", scrub);

    function paint(values) {
      displayed = values;
      projectionPath.setAttribute("d", plotPath(values));
      set(projectionDot, { cx: x(selected), cy: y(values[selected]) });
    }

    function update(values, { animate = true, nextLabel = projectionName } = {}) {
      aim = sorted(values);
      label = nextLabel;
      projectionKey.textContent = nextLabel;
      cancelAnimationFrame(animation);
      const from = displayed;
      if (animate && canAnimate()) {
        const started = performance.now();
        function drawFrame(now) {
          const t = clamp((now - started) / 260, 0, 1);
          const progress = 1 - (1 - t) ** 3;
          if (t < 1 && canAnimate()) {
            paint(from.map((value, index) => value + (aim[index] - value) * progress));
            animation = requestAnimationFrame(drawFrame);
          } else {
            paint(aim);
          }
        }
        animation = requestAnimationFrame(drawFrame);
      } else {
        paint(aim);
      }
      table.render(indexes.map((index, rank) => [orderName(data.perms[index]), decimal(actual[rank]), decimal(aim[rank])]));
      updateCursor();
    }

    return { frame, table: table.details, update };
  }

  function installWaveform(root) {
    const frame = html("div", undefined, "chart-frame viz-wave-frame");
    const header = html("div", undefined, "viz-wave-header");
    const title = html("strong", "A waveform and its frequencies");
    const chart = svg("svg", { viewBox: "0 0 620 144", "aria-hidden": "true" });
    const frequencies = [1.5, 3, 7];
    const amplitudes = [12, 8, 4];
    const samples = Array.from({ length: 241 }, (_, index) => index / 240);
    const lines = frequencies.map((_, index) => svg("path", {
      fill: "none", stroke: "var(--ink)", "stroke-opacity": 0.82 - index * 0.14, "stroke-width": 1.3,
      "vector-effect": "non-scaling-stroke"
    }));
    const sum = svg("path", {
      fill: "none", stroke: "var(--ink)", "stroke-width": 1.65, "vector-effect": "non-scaling-stroke"
    });
    const labels = ["Mixed", "Low", "Mid", "High"].map((name, index) => svg("text", {
      x: 14, y: 34 + index * 32, class: "viz-axis"
    }, name));
    const guides = labels.map((_, index) => svg("path", {
      d: "M 64 " + (31 + index * 32) + " H 603", fill: "none",
      stroke: "var(--line)", "stroke-dasharray": "2 4"
    }));
    let fraction = 0;
    let open = false;
    let animation = 0;

    let interacted = false;
    const control = button("Split waveform", () => {
      interacted = true;
      split(!open);
    });
    control.setAttribute("aria-expanded", "false");
    const caption = html("p", "This example separates a mixed waveform into frequency components. The same idea lets us add the effects of task order back together, one layer at a time.", "widget-note");
    header.append(title, control);
    chart.append(...guides, ...labels, sum, ...lines);
    frame.append(header, chart, caption);
    root.append(frame);

    function wave(component, at) {
      return amplitudes[component] * Math.sin(2 * Math.PI * (frequencies[component] * at + 0.063 * component));
    }

    function draw(amount) {
      fraction = amount;
      const path = (baseline, measure) => samples.map((sample, index) => {
        return (index === 0 ? "M " : "L ") + (64 + 539 * sample).toFixed(1) + " " + (baseline - measure(sample)).toFixed(2);
      }).join(" ");
      sum.setAttribute("d", path(31, at => frequencies.reduce((value, _, component) => value + wave(component, at), 0)));
      lines.forEach((line, component) => {
        set(line, {
          d: path(31 + 32 * (component + 1) * amount, at => wave(component, at)),
          opacity: amount
        });
      });
      labels.slice(1).forEach(label => label.setAttribute("opacity", amount));
    }

    function split(next, animate = true) {
      open = next;
      control.setAttribute("aria-expanded", String(open));
      const aim = open ? 1 : 0;
      control.textContent = open ? "Combine waveform" : "Split waveform";
      cancelAnimationFrame(animation);
      if (!animate || !canAnimate()) {
        draw(aim);
        return;
      }
      const from = fraction;
      const started = performance.now();
      function step(now) {
        const t = clamp((now - started) / 720, 0, 1);
        const progress = t * t * (3 - 2 * t);
        if (t < 1 && canAnimate()) {
          draw(from + (aim - from) * progress);
          animation = requestAnimationFrame(step);
        } else {
          draw(aim);
        }
      }
      animation = requestAnimationFrame(step);
    }

    draw(fraction);
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        if (!interacted && canAnimate()) split(true);
      }, { threshold: 0.55 });
      observer.observe(frame);
    }
  }

  function cumulativeCurves(data) {
    const flat = data.mean.map(() => data.summary.mean);
    const curves = [flat];
    for (const layer of data.layers) {
      const previous = curves.at(-1);
      curves.push(previous.map((value, index) => value + layer.values[index]));
    }
    return curves;
  }

  function installLayers(root, data, curves, chartConfig) {
    root.classList.add("explainer-widget", "viz-layers");
    installWaveform(root);
    const label = html("h3", "Build the forgetting curve", "viz-widget-heading");
    const explanation = html("p", "Choose a layer to add it and all the earlier layers. Bar lengths show each layer’s share of the reproducible effect across seeds.", "widget-note");
    const controls = html("div", undefined, "viz-layer-controls");
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Add layers");
    const display = html("p", undefined, "viz-layer-summary");
    display.setAttribute("aria-live", "polite");
    const plot = comparisonPlot(chartConfig, "Selected layers");
    const baseline = button("Base mean", () => select(0), "widget-button viz-base-button");
    const layNames = {
      position: "Task positions",
      sym: "Pairs in either order",
      dir: "Which task comes first",
      high: "Three tasks",
      sign: "All five tasks"
    };
    const choices = data.layers.map((layer, index) => {
      const control = button("", () => select(index + 1), "viz-layer-button");
      const track = html("span", undefined, "viz-share-track");
      const fill = html("span", undefined, "viz-share-fill");
      fill.style.width = 100 * layer.signal_share + "%";
      track.setAttribute("aria-hidden", "true");
      track.append(fill);
      const name = layNames[layer.key] ?? layer.name;
      control.append(html("span", name, "viz-layer-name"), track, html("span", percent(layer.signal_share), "viz-layer-share"));
      return control;
    });
    controls.append(baseline, ...choices);
    const note = html("p", "The dashed curve adds the chosen components of the average across seeds. Its horizontal axis keeps the orders sorted by measured forgetting.", "widget-note");
    root.append(label, explanation, controls, display, plot.frame, note, plot.table);
    select(1, false);

    function select(count, animate = true) {
      baseline.setAttribute("aria-pressed", String(count === 0));
      choices.forEach((control, index) => {
        control.setAttribute("aria-pressed", String(index + 1 === count));
        control.classList.toggle("is-included", index < count);
      });
      const share = data.layers.slice(0, count).reduce((total, layer) => total + layer.signal_share, 0);
      display.textContent = percent(share) + " of the reproducible effect in the selected layers";
      plot.update(curves[count], { animate });
    }
  }

  function installTheories(root, data, chartConfig) {
    root.classList.add("explainer-widget", "viz-theories");
    const shortNames = {
      position: "Position effects",
      pwo: "“A before B”",
      triplet: "Triplet model",
      symmetric_pairs: "Symmetric pairs",
      ccs_spacing: "CCS spacing",
      ccs_clustering: "CCS clustering"
    };
    const shortLayers = { position: "Place", sym: "Pairs", dir: "Before", high: "Three", sign: "Five" };
    const table = html("table", undefined, "viz-footprint");
    const caption = html("caption", "Select a model to see its reconstruction.");
    table.append(caption);
    const headings = table.createTHead().insertRow();
    const modelHeading = html("th", "Model");
    modelHeading.scope = "col";
    headings.append(modelHeading);
    data.layers.forEach(layer => {
      const cell = html("th");
      cell.scope = "col";
      cell.title = layer.name;
      cell.append(html("span", layer.name, "viz-footprint-label"), html("span", shortLayers[layer.key], "viz-footprint-short"));
      headings.append(cell);
    });

    const signal = table.tHead.insertRow();
    const signalHeading = html("th", "Measured share");
    signalHeading.scope = "row";
    signal.append(signalHeading);
    for (const layer of data.layers) signal.append(html("td", percent(layer.signal_share)));
    signal.classList.add("viz-footprint-signal");

    const body = html("tbody");
    const plot = comparisonPlot(chartConfig, "Model estimate");
    const share = html("p", undefined, "viz-model-share");
    share.setAttribute("aria-live", "polite");
    const note = html("p", "Each fraction counts how much of a layer’s mathematical space the model can cover. The score below measures how much of the observed, repeatable effect it captures.", "widget-note");
    const fitNote = html("p", "The dashed curve shows the model’s best fit to the average across seeds. Orders remain sorted by measured forgetting.", "widget-note");
    const rows = data.models.map((model, index) => {
      const row = body.insertRow();
      const rowHeader = html("th");
      rowHeader.scope = "row";
      const name = shortNames[model.key] ?? model.label;
      const control = button(name, () => select(index), "viz-model-button");
      control.setAttribute("aria-label", model.label.includes(name) ? model.label : name + " (" + model.label + ")");
      rowHeader.append(control);
      row.append(rowHeader);
      model.ranks.forEach((rank, column) => {
        const layer = data.layers[column];
        const maximum = layer.max_rank;
        const status = rank === 0 ? "Blind" : rank === maximum ? "Full" : "Partly";
        const cell = html("td", undefined, "viz-rank viz-rank-" + status.toLowerCase());
        const rankLabel = rank + "/" + maximum;
        cell.title = layer.name + " · " + status + " · rank " + rankLabel;
        cell.append(html("span", status), html("small", rankLabel));
        row.append(cell);
      });
      return { row, control };
    });
    table.append(body);
    const scroller = html("div", undefined, "viz-footprint-frame");
    scroller.append(table);
    root.append(scroller, note, share, plot.frame, fitNote, plot.table);
    select(Math.max(0, data.models.findIndex(model => model.key === "pwo")), false);

    function select(index, animate = true) {
      const model = data.models[index];
      rows.forEach(({ row, control }, rowIndex) => {
        const selected = rowIndex === index;
        row.classList.toggle("is-selected", selected);
        control.setAttribute("aria-pressed", String(selected));
      });
      share.replaceChildren(html("strong", percent(model.share)), document.createTextNode(" of the reproducible effect captured by " + model.label));
      plot.update(model.recon, { animate });
    }
  }

  function installStyles() {
    const style = html("style", undefined);
    style.textContent = `
      :is(.viz-permutohedron, .viz-layers, .viz-theories) > * { min-width: 0; }
      .viz-comparison svg, .viz-solid-frame svg, .viz-wave-frame svg {
        display: block; width: 100%; height: auto;
      }
      .viz-axis {
        fill: var(--muted); font: 15px var(--mono, monospace);
      }
      .viz-solid-tag {
        font: 15px var(--mono, monospace);
      }
      .viz-solid-frame {
        overflow: hidden; padding: 0;
        background-image: radial-gradient(var(--line-strong) .7px, transparent .8px);
        background-position: center; background-size: 13px 13px;
      }
      .viz-solid-frame svg { cursor: grab; max-height: 29rem; touch-action: pan-y; }
      .viz-solid-frame svg:active { cursor: grabbing; }
      .viz-solid-frame svg:focus-visible { outline-offset: -4px; }
      .viz-solid-controls {
        display: grid; grid-template-columns: minmax(5rem, .5fr) minmax(10rem, 1fr); gap: .8rem;
      }
      .viz-rotation {
        grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: .3rem;
      }
      .viz-rotation .widget-button { flex: 0 1 auto; }
      .viz-control-label { display: flex; flex-direction: column; gap: .35rem; min-width: 0; }
      .viz-control-label > span { color: var(--soft); font-size: .8125rem; }
      .viz-control-label select {
        appearance: none; color: var(--ink); border: 1px solid var(--line-strong);
        border-radius: 0; background-color: var(--panel); font: inherit;
        padding: .48rem 1.75rem .48rem .58rem; min-height: 2.65rem;
        background-image: linear-gradient(45deg, transparent 50%, var(--muted) 50%), linear-gradient(135deg, var(--muted) 50%, transparent 50%);
        background-position: calc(100% - 14px) 50%, calc(100% - 9px) 50%;
        background-size: 5px 5px; background-repeat: no-repeat;
      }
      .viz-scale, .viz-line-legend {
        display: flex; align-items: center; flex-wrap: wrap; gap: .5rem .75rem;
        color: var(--soft); font: .8125rem var(--mono, monospace);
      }
      .viz-scale { margin-top: .9rem; }
      .viz-scale-gradient { min-width: 3rem; width: 20%; max-width: 7rem; height: .45rem; border: 1px solid var(--line-strong); }
      .viz-wave-header {
        display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .65rem;
      }
      .viz-wave-header strong { font-size: .94rem; font-weight: 500; }
      .viz-order-readout, .viz-layer-summary, .viz-model-share { color: var(--ink); }
      .viz-order-readout {
        margin: .55rem 0; font: .875rem/1.55 var(--mono, monospace); min-height: 1.7rem;
      }
      .viz-widget-heading { margin: 1.6rem 0 .4rem; }
      .viz-layer-controls {
        display: grid; align-items: start; justify-items: start; gap: 1px;
        border: 1px solid var(--line); margin: .8rem 0;
      }
      .viz-base-button { margin: .45rem .65rem; }
      .viz-layer-button {
        width: 100%; display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(2rem, 1fr) 3.65rem; gap: .65rem;
        align-items: center; border: 0; border-top: 1px solid var(--line); border-left: 2px solid transparent; border-radius: 0;
        background: var(--panel); color: var(--soft); text-align: left; padding: .65rem;
        font: inherit; font-size: .875rem; cursor: pointer;
      }
      .viz-layer-button:hover, .viz-layer-button:focus-visible { background: var(--panel-raised); }
      .viz-layer-button.is-included { border-left-color: var(--line-strong); color: var(--ink); }
      .viz-layer-button[aria-pressed="true"] {
        background: var(--panel-raised); border-left-color: var(--ink);
      }
      .viz-base-button[aria-pressed="true"] { border-color: var(--ink); color: var(--ink); }
      .viz-share-track { position: relative; height: .3rem; background: var(--line); }
      .viz-share-fill { position: absolute; height: 100%; background: var(--muted); min-width: 1px; }
      .viz-layer-button.is-included .viz-share-fill { background: var(--ink); }
      .viz-layer-share { font-family: var(--mono, monospace); font-size: .8125rem; text-align: right; }
      .viz-layer-summary, .viz-model-share {
        font-family: var(--mono, monospace); font-size: .875rem; margin: .8rem 0;
      }
      .viz-line-legend { margin: 0 0 .5rem; }
      .viz-key { display: inline-flex; gap: .4rem; align-items: center; }
      .viz-key::before { content: ""; width: 1.45rem; border-top: 2px solid var(--ink); }
      .viz-key-projected::before { border-color: var(--soft); border-top-style: dashed; }
      .viz-comparison svg { cursor: crosshair; }
      .viz-plot-inspector {
        border-top: 1px solid var(--line); margin-top: .15rem; padding-top: .5rem;
        display: grid; grid-template-columns: minmax(5rem, 1fr) minmax(0, 1.5fr); align-items: center; gap: .75rem;
      }
      .viz-plot-inspector input {
        width: 100%; margin: 0; min-height: 1.7rem; accent-color: var(--ink); cursor: pointer;
      }
      .viz-plot-inspector .viz-order-readout { margin: 0; }
      .viz-footprint-frame { border: 1px solid var(--line); }
      .viz-footprint {
        width: 100%; border-collapse: collapse; margin: 0; table-layout: fixed;
        font-size: .8125rem; line-height: 1.35;
      }
      .viz-footprint caption { text-align: left; color: var(--soft); border-bottom: 1px solid var(--line); padding: .6rem .65rem; }
      .viz-footprint :is(th, td) {
        padding: .5rem .28rem; border-bottom: 1px solid var(--line); text-align: center; vertical-align: middle;
        overflow-wrap: anywhere;
      }
      .viz-footprint :is(th, td):first-child { width: 27%; padding-left: .65rem; text-align: left; }
      .viz-footprint thead th { font-weight: 600; color: var(--soft); }
      .viz-footprint-short { display: none; }
      .viz-footprint tbody tr:last-child :is(th, td) { border-bottom: 0; }
      .viz-footprint-signal td, .viz-footprint .viz-rank small { font-family: var(--mono, monospace); }
      .viz-footprint .viz-rank small { display: block; color: var(--muted); font-size: .75rem; }
      .viz-footprint .viz-rank-blind > span { color: var(--muted); }
      .viz-footprint .viz-rank-full > span { font-weight: 650; color: var(--ink); }
      .viz-footprint .is-selected { background: var(--panel-raised); }
      .viz-footprint .is-selected th { box-shadow: inset 2px 0 var(--ink); }
      .viz-model-button {
        display: block; width: 100%; text-align: left; background: transparent; border: 0; color: var(--ink);
        cursor: pointer; font: inherit; font-weight: 500; padding: .35rem 0; min-height: 2.2rem;
      }
      .viz-model-button:hover { text-decoration: underline; }
      .viz-model-button[aria-pressed="true"] { font-weight: 700; }
      .viz-permutohedron .chart-table .table-scroll { max-height: 22rem; }
      @media (max-width: 640px) {
        .viz-footprint-label { display: none; }
        .viz-footprint-short { display: inline; }
        .viz-footprint :is(th, td) { padding-inline: .1rem; }
        .viz-footprint :is(th, td):first-child { width: 27%; padding-left: .35rem; }
        .viz-footprint { font-size: .75rem; }
        .viz-axis { font-size: 19px; }
        .viz-wave-frame .viz-axis { font-size: 17px; }
        .viz-solid-tag { font-size: 16px; }
      }
      @media (max-width: 420px) {
        .viz-plot-inspector { grid-template-columns: 1fr; gap: .25rem; }
        .viz-layer-button { grid-template-columns: minmax(0, 1.7fr) minmax(1.5rem, .75fr) 3.3rem; gap: .4rem; }
        .viz-scale { column-gap: .4rem; }
      }
    `;
    document.head.append(style);
  }

  window.installViz = data => {
    installStyles();
    const curves = cumulativeCurves(data.k5);
    const chartConfig = sharedOrder(data.k5, [data.k5.mean, ...curves, ...data.k5.models.map(model => model.recon)]);
    installPermutohedron(document.getElementById("permutohedron-widget"), data.k4);
    installLayers(document.getElementById("layers-widget"), data.k5, curves, chartConfig);
    installTheories(document.getElementById("theories-widget"), data.k5, chartConfig);
  };
})();

