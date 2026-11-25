const alphabet = " .,:-+*#%@";
const average = (vectors) => vectors[0].map((_, axis) => (
  vectors.reduce((sum, v) => sum + v[axis], 0) / vectors.length
));
const distance = (a, b) => Math.hypot(...a.map((value, axis) => value - b[axis]));

function sampleOrderSpace({ perms, xyz, edges, F }) {
  const lo = Math.min(...F), hi = Math.max(...F);
  const forgetting = F.map(value => (value - lo) / (hi - lo || 1));
  const faces = [];
  const positions = perms.map(perm => perm.map((_, task) => perm.indexOf(task)));

  function addFace(predicate) {
    const indices = positions.flatMap((position, index) => predicate(position) ? [index] : []);
    const vertices = indices.map(index => xyz[index]);
    faces.push({
      indices: new Set(indices),
      center: average(vertices),
      level: indices.reduce((sum, index) => sum + forgetting[index], 0) / indices.length,
    });
  }

  for (let task = 0; task < 4; task++) {
    for (const extreme of [0, 3]) addFace(position => position[task] === extreme);
  }
  for (let a = 0; a < 4; a++) {
    for (let b = a + 1; b < 4; b++) addFace(position => position[a] + position[b] === 1);
  }

  const points = [];
  for (const { indices, center, level } of faces) {
    const normal = center.map(value => value / Math.hypot(...center));
    for (const [a, b] of edges) {
      if (!indices.has(a) || !indices.has(b)) continue;
      const subdivisions = 23;
      for (let i = 0; i < subdivisions; i++) {
        for (let j = 0; j < subdivisions - i; j++) {
          const u = i / subdivisions, v = j / subdivisions;
          const coords = center.map((value, axis) => (
            value + u * (xyz[a][axis] - value) + v * (xyz[b][axis] - value)
          ));
          points.push({
            coords,
            normal,
            shade: level * (1 - u - v) + forgetting[a] * u + forgetting[b] * v,
            edge: i + j === subdivisions - 1,
          });
        }
      }
    }
  }

  for (const [a, b] of edges) {
    const subdivisions = Math.ceil(distance(xyz[a], xyz[b]) * 61);
    for (let step = 0; step <= subdivisions; step++) {
      const t = step / subdivisions;
      points.push({
        coords: xyz[a].map((value, axis) => value + t * (xyz[b][axis] - value)),
        normal: null,
        shade: .91,
        edge: true,
      });
    }
  }
  return points;
}

export function installAscii(canvas, k4, isStill) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const points = sampleOrderSpace(k4);
  let width = 0, height = 0, scale = 1;
  let time = 0, lastTime = 0, frame = 0;
  let visible = true;
  let ink = "#f3f3f1";

  function draw() {
    if (!width || !height) return;
    const angle = -.48 + .27 * Math.sin(time / 4.8);
    const tilt = .36 + .12 * Math.sin(time / 6.4);
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const cellWidth = width < 400 ? 5.2 : 6.8;
    const cellHeight = cellWidth * 1.48;
    const columns = Math.ceil(width / cellWidth);
    const rows = Math.ceil(height / cellHeight);
    const zBuffer = new Float32Array(columns * rows).fill(-Infinity);
    const chars = new Uint8Array(columns * rows);
    const light = new Uint8Array(columns * rows);
    const artScale = Math.min(width * .405, height * .441);
    const centerX = width * .51, centerY = height * .487;
    const scanY = rows * (.52 + .31 * Math.sin(time / 3.3 - .85));

    for (const { coords: [x, y, z], normal, shade, edge } of points) {
      const turnX = x * ca + z * sa;
      const turnZ = z * ca - x * sa;
      const turnY = y * ct - turnZ * st;
      const depth = y * st + turnZ * ct;
      const perspective = 1 / (1 - depth * .16);
      const col = Math.round((centerX + turnX * artScale * perspective) / cellWidth);
      const row = Math.round((centerY - turnY * artScale * perspective) / cellHeight);
      if (row < 0 || row >= rows || col < 0 || col >= columns) continue;
      const index = row * columns + col;
      const surfaceDepth = depth + (edge ? .035 : 0);
      if (surfaceDepth < zBuffer[index]) continue;
      zBuffer[index] = surfaceDepth;

      const grain = ((row * 17 + col * 31 + (row * col) % 41) % 37) / 37;
      const sweep = .13 * Math.exp(-(((row - scanY) / 2.9) ** 2));
      const lit = normal ? Math.max(0, .34 + .45 * normal[1] - .22 * normal[0] + .21 * normal[2]) : .64;
      const luminance = edge ? .47 + grain * .4 + sweep : .16 + shade * .19 + lit * .49 + grain * .22 + sweep;
      chars[index] = edge && grain > .82 ? 9 : Math.min(9, Math.floor(luminance * 10));
      light[index] = Math.min(10, Math.ceil(luminance * (edge ? 12 : 8)));
    }

    context.clearRect(0, 0, width, height);
    context.font = (cellHeight * 1.03) + "px Consolas, monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = ink;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const index = row * columns + col;
        const char = chars[index];
        if (!char) continue;
        context.globalAlpha = light[index] / 10;
        context.fillText(alphabet[char], col * cellWidth, row * cellHeight);
      }
    }
    context.globalAlpha = 1;
  }

  function schedule() {
    if (!frame && visible && !document.hidden && !isStill()) frame = requestAnimationFrame(tick);
  }

  function tick(now) {
    frame = 0;
    if (lastTime === 0) lastTime = now;
    if (now - lastTime >= 38) {
      time += Math.min(now - lastTime, 80) / 1000;
      lastTime = now;
      draw();
    }
    schedule();
  }

  function sync() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
    draw();
    schedule();
  }

  new ResizeObserver(() => {
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    scale = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    sync();
  }).observe(canvas);

  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }).observe(canvas);
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("explainer-motionchange", sync);
  window.addEventListener("explainer-themechange", () => requestAnimationFrame(sync));
}
