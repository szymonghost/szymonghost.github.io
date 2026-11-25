const GLIDER = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]];
const TOAD = [[1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1]];
const PENTOMINO = [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]];
const BEACON = [[0, 0], [1, 0], [0, 1], [1, 1], [2, 2], [3, 2], [2, 3], [3, 3]];
const PATTERNS = [GLIDER, BEACON, TOAD, GLIDER, PENTOMINO, TOAD];
const CELL_WIDTH = 10;
const CELL_HEIGHT = 12;
const GENERATION_MS = 260;

function seededBoard(columns, rows) {
  const cells = new Uint8Array(columns * rows);
  const across = Math.max(1, Math.floor(columns / 16));
  const down = Math.max(1, Math.floor(rows / 9));

  for (let row = 0; row < down; row++) {
    for (let col = 0; col < across; col++) {
      const pattern = PATTERNS[(row * 5 + col * 7) % PATTERNS.length];
      const x = Math.round((col + .28 + .08 * (row % 2)) * columns / across);
      const y = Math.round((row + .2 + .06 * (col % 3)) * rows / down);
      for (const [dx, dy] of pattern) {
        const a = (x + dx) % columns, b = (y + dy) % rows;
        cells[b * columns + a] = 1;
        cells[(rows - b - 1) * columns + columns - a - 1] = 1;
      }
    }
  }

  return cells;
}

// Wrapping the boundaries lets traveling patterns continue across the background.
function advance(cells, next, trails, columns, rows) {
  for (let row = 0; row < rows; row++) {
    const middle = row * columns;
    const above = (row === 0 ? rows - 1 : row - 1) * columns;
    const below = (row === rows - 1 ? 0 : row + 1) * columns;
    for (let col = 0; col < columns; col++) {
      const left = col === 0 ? columns - 1 : col - 1;
      const right = col === columns - 1 ? 0 : col + 1;
      const neighbors = cells[above + left] + cells[above + col] + cells[above + right]
        + cells[middle + left] + cells[middle + right]
        + cells[below + left] + cells[below + col] + cells[below + right];
      const i = middle + col;
      next[i] = Number(neighbors === 3 || (neighbors === 2 && cells[i]));
      trails[i] = next[i] ? 0 : cells[i] ? 3 : Math.max(0, trails[i] - 1);
    }
  }
}

export function installLife(canvas, isStill) {
  const context = canvas.getContext("2d");
  if (!context) return;

  let width = 0, height = 0, columns = 0, rows = 0;
  let cells, next, trails;
  let timer = 0, visible = false;

  function draw() {
    if (!cells) return;
    context.clearRect(0, 0, width, height);
    context.font = "11px Consolas, monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#f3f3f1";

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const i = row * columns + col;
        if (!cells[i] && !trails[i]) continue;
        context.globalAlpha = cells[i] ? .3 : trails[i] * .045;
        const glyph = cells[i] ? (next[i] ? "#" : "+") : ".";
        context.fillText(glyph, (col + .5) * CELL_WIDTH, (row + .5) * CELL_HEIGHT);
      }
    }

    context.globalAlpha = 1;
  }

  function step() {
    advance(cells, next, trails, columns, rows);
    [cells, next] = [next, cells];
    draw();
  }

  function sync() {
    const playing = cells && visible && !document.hidden && !isStill();
    if (playing && !timer) timer = window.setInterval(step, GENERATION_MS);
    if (!playing && timer) {
      window.clearInterval(timer);
      timer = 0;
    }
  }

  new ResizeObserver(() => {
    ({ width, height } = canvas.getBoundingClientRect());
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);

    const nextColumns = Math.max(3, Math.ceil(width / CELL_WIDTH));
    const nextRows = Math.max(3, Math.ceil(height / CELL_HEIGHT));
    if (columns !== nextColumns || rows !== nextRows) {
      columns = nextColumns;
      rows = nextRows;
      cells = seededBoard(columns, rows);
      next = new Uint8Array(cells.length);
      trails = new Uint8Array(cells.length);
    }
    draw();
    sync();
  }).observe(canvas);

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }).observe(canvas);

  document.addEventListener("visibilitychange", sync);
  window.addEventListener("explainer-motionchange", sync);
  window.addEventListener("explainer-themechange", () => requestAnimationFrame(draw));
}

