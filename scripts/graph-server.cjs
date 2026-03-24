#!/usr/bin/env node

/**
 * graph-server.cjs — Minimal HTTP server for interactive ZED knowledge graph
 *
 * Reads graph JSON from a temp file (path passed as argv[1]),
 * serves an HTML5 Canvas visualization on localhost.
 * Tries ports 7847, 7848, 7849 in order.
 */

'use strict';

const http = require('http');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Read graph data
// ---------------------------------------------------------------------------

const dataFile = process.argv[2];
if (!dataFile || !fs.existsSync(dataFile)) {
  console.error('Usage: graph-server.cjs <graph-data.json>');
  process.exit(1);
}

const graphJson = fs.readFileSync(dataFile, 'utf-8');

// ---------------------------------------------------------------------------
// HTML page with Canvas renderer — ZED branded dark theme
// ---------------------------------------------------------------------------

function buildHtml(graphJsonString) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ZED Knowledge Graph</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0a0a1a; overflow: hidden;
    font-family: 'SF Mono', Menlo, Monaco, 'Cascadia Code', 'Courier New', monospace;
  }
  canvas { display: block; cursor: grab; }
  canvas:active { cursor: grabbing; }
  #header {
    position: absolute; top: 0; left: 0; right: 0; height: 44px;
    background: rgba(10, 10, 26, 0.92); border-bottom: 1px solid #1a1a3e;
    display: flex; align-items: center; padding: 0 20px; z-index: 20;
    backdrop-filter: blur(8px);
  }
  #header .title {
    color: #e0e0e0; font-size: 14px; font-weight: 700; letter-spacing: 1.5px;
  }
  #header .title span { color: #00d4ff; }
  #header .stats {
    margin-left: 28px; color: #555; font-size: 11px; letter-spacing: 0.5px;
  }
  #header .stats b { color: #777; }
  #tooltip {
    position: absolute; display: none; padding: 10px 14px;
    background: rgba(10, 10, 26, 0.95); color: #ccc;
    border: 1px solid #1a1a3e; border-radius: 6px; font-size: 12px;
    pointer-events: none; max-width: 300px; z-index: 30;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  }
  #tooltip .tt-title { color: #fff; font-weight: 700; font-size: 13px; margin-bottom: 4px; }
  #tooltip .tt-type { color: #00d4ff; text-transform: uppercase; font-size: 10px; letter-spacing: 1px; }
  #tooltip .tt-meta { color: #666; font-size: 11px; margin-top: 4px; }
  #legend {
    position: absolute; bottom: 16px; left: 16px; display: flex; gap: 16px;
    background: rgba(10, 10, 26, 0.85); padding: 8px 14px; border-radius: 8px;
    font-size: 11px; color: #555; z-index: 20;
    border: 1px solid #1a1a3e;
  }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .legend-dot { width: 10px; height: 10px; border-radius: 3px; }
  #version {
    position: absolute; bottom: 16px; right: 16px; color: #333; font-size: 10px;
    letter-spacing: 1px; z-index: 20;
  }
  #controls {
    position: absolute; top: 56px; right: 16px; color: #444; font-size: 10px;
    background: rgba(10, 10, 26, 0.8); padding: 6px 10px; border-radius: 6px;
    z-index: 20; border: 1px solid #1a1a3e;
  }
  #search {
    position: absolute; top: 56px; left: 16px;
    background: rgba(10, 10, 26, 0.9); border: 1px solid #1a1a3e;
    color: #e0e0e0; padding: 6px 12px; border-radius: 6px;
    font-family: inherit; font-size: 12px; width: 200px;
    z-index: 20; outline: none;
  }
  #search:focus { border-color: #00d4ff; }
  #search::placeholder { color: #555; }
</style>
</head>
<body>
<div id="header">
  <div class="title"><span>ZED</span> Knowledge Graph</div>
  <div class="stats" id="stats-bar"></div>
</div>
<input id="search" type="text" placeholder="Filter nodes...">
<canvas id="c"></canvas>
<div id="tooltip"></div>
<div id="legend"></div>
<div id="version">ZED v7.0.0</div>
<div id="controls">scroll zoom &middot; drag pan &middot; hover inspect &middot; click lock &middot; dbl-click path &middot; <b>r</b> reset</div>

<script>
'use strict';

const graphData = ${graphJsonString};

// --- Theme colors ---
const nodeColors = {
  decision: '#1a5fb4',
  pattern:  '#2d7d46',
  project:  '#6c3fa0',
  session:  '#444444',
};
const defaultNodeColor = '#333333';
const edgeColor = 'rgba(255,255,255,0.2)';
const edgeHighlight = '#00d4ff';

// --- Excalidraw color -> type mapping (reverse lookup) ---
const excalidrawColorToType = {
  '#a5d8ff': 'decision',
  '#b2f2bb': 'pattern',
  '#d0bfff': 'project',
  '#dee2e6': 'session',
  '#ffffff': 'note',
};

// --- Parse graph data ---
const rectElements = graphData.elements.filter(e => e.type === 'rectangle');
const textElements = graphData.elements.filter(e => e.type === 'text');
const arrowElements = graphData.elements.filter(e => e.type === 'arrow');

const textByContainer = {};
for (const t of textElements) {
  if (t.containerId) textByContainer[t.containerId] = t.text;
}

const nodes = rectElements.map(r => {
  const origColor = r.backgroundColor || '#ffffff';
  const type = excalidrawColorToType[origColor] || 'note';
  return {
    id: r.id,
    x: 0, y: 0, // will be set by force layout
    w: r.width,
    h: r.height,
    color: nodeColors[type] || defaultNodeColor,
    type: type,
    label: textByContainer[r.id] || r.id,
    vx: 0, vy: 0, // velocity for force sim
  };
});

const nodeById = {};
for (const n of nodes) nodeById[n.id] = n;

const edges = [];
for (const a of arrowElements) {
  const srcId = a.startBinding ? a.startBinding.elementId : null;
  const tgtId = a.endBinding ? a.endBinding.elementId : null;
  if (srcId && tgtId && nodeById[srcId] && nodeById[tgtId]) {
    edges.push({ src: srcId, tgt: tgtId });
  }
}

const adjacency = {};
for (const n of nodes) adjacency[n.id] = new Set();
for (const e of edges) {
  adjacency[e.src].add(e.tgt);
  adjacency[e.tgt].add(e.src);
}

// --- Force-directed layout ---
// Seed positions in a circle by type cluster
const typeGroups = {};
for (const n of nodes) {
  if (!typeGroups[n.type]) typeGroups[n.type] = [];
  typeGroups[n.type].push(n);
}
const typeKeys = Object.keys(typeGroups);
const radius = Math.max(300, nodes.length * 12);
typeKeys.forEach((type, ti) => {
  const groupAngle = (ti / typeKeys.length) * 2 * Math.PI;
  const cx = Math.cos(groupAngle) * radius;
  const cy = Math.sin(groupAngle) * radius;
  const group = typeGroups[type];
  group.forEach((n, ni) => {
    const spread = Math.min(200, group.length * 15);
    const a = (ni / group.length) * 2 * Math.PI;
    n.x = cx + Math.cos(a) * spread + (Math.random() - 0.5) * 50;
    n.y = cy + Math.sin(a) * spread + (Math.random() - 0.5) * 50;
  });
});

// Run force simulation (synchronous, ~200 iterations)
const SIM_ITERATIONS = 250;
const REPULSION = 80000;
const ATTRACTION = 0.0008;
const IDEAL_LENGTH = 180;
const DAMPING = 0.92;
const CENTER_PULL = 0.001;

for (let iter = 0; iter < SIM_ITERATIONS; iter++) {
  const cooling = 1 - iter / SIM_ITERATIONS;
  // Repulsion (all pairs)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = REPULSION / (dist * dist) * cooling;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx -= fx; a.vy -= fy;
      b.vx += fx; b.vy += fy;
    }
  }
  // Attraction (edges)
  for (const e of edges) {
    const a = nodeById[e.src], b = nodeById[e.tgt];
    if (!a || !b) continue;
    let dx = b.x - a.x, dy = b.y - a.y;
    let dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = (dist - IDEAL_LENGTH) * ATTRACTION * cooling;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    a.vx += fx; a.vy += fy;
    b.vx -= fx; b.vy -= fy;
  }
  // Center pull
  for (const n of nodes) {
    n.vx -= n.x * CENTER_PULL * cooling;
    n.vy -= n.y * CENTER_PULL * cooling;
  }
  // Apply velocity
  for (const n of nodes) {
    n.vx *= DAMPING; n.vy *= DAMPING;
    n.x += n.vx; n.y += n.vy;
  }
}
// Clean up velocity props
for (const n of nodes) { delete n.vx; delete n.vy; }

// --- Stats bar ---
const typeCounts = {};
for (const n of nodes) { typeCounts[n.type] = (typeCounts[n.type] || 0) + 1; }
document.getElementById('stats-bar').innerHTML =
  '<b>' + nodes.length + '</b> nodes &middot; <b>' + edges.length + '</b> edges &middot; ' +
  Object.entries(typeCounts).map(([t, c]) => c + ' ' + t + 's').join(' &middot; ');

// --- Legend (with counts) ---
const legendEl = document.getElementById('legend');
const allColors = { decision: '#1a5fb4', pattern: '#2d7d46', project: '#6c3fa0', session: '#444444', note: '#333333' };
for (const [type, color] of Object.entries(allColors)) {
  if (typeCounts[type]) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    item.innerHTML = '<span class="legend-dot" style="background:' + color + '"></span>' + type + 's (' + typeCounts[type] + ')';
    legendEl.appendChild(item);
  }
}

// --- Canvas ---
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let W, H;
function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  draw();
}
window.addEventListener('resize', resize);

// --- Camera ---
let camX = 0, camY = 0, zoom = 1;
let targetCamX = 0, targetCamY = 0, targetZoom = 1;
let animating = false;

if (nodes.length > 0) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x + n.w > maxX) maxX = n.x + n.w;
    if (n.y + n.h > maxY) maxY = n.y + n.h;
  }
  const gw = maxX - minX, gh = maxY - minY;
  setTimeout(() => {
    const z = Math.min(W / (gw + 200), H / (gh + 200), 2);
    zoom = targetZoom = Math.max(z, 0.1);
    camX = targetCamX = minX + gw / 2;
    camY = targetCamY = minY + gh / 2;
    draw();
  }, 0);
}

// --- Interaction ---
let hoveredNode = null;
let lockedNode = null;
let searchFilter = '';
let dragging = false;
let dragStartX = 0, dragStartY = 0;
let camStartX = 0, camStartY = 0;

// --- Search filter ---
const searchInput = document.getElementById('search');
searchInput.addEventListener('input', () => {
  searchFilter = searchInput.value.toLowerCase();
  draw();
});

// --- Click to lock focus ---
canvas.addEventListener('mousedown', e => {
  dragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  camStartX = camX;
  camStartY = camY;
});

canvas.addEventListener('click', e => {
  const mx = (e.clientX - W / 2) / zoom + camX;
  const my = (e.clientY - H / 2) / zoom + camY;
  let found = null;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (mx >= n.x && mx <= n.x + n.w && my >= n.y && my <= n.y + n.h) {
      found = n; break;
    }
  }
  lockedNode = found; // lock to clicked node, or clear if background
  draw();
});

// --- Double-click to show path ---
canvas.addEventListener('dblclick', e => {
  const mx = (e.clientX - W / 2) / zoom + camX;
  const my = (e.clientY - H / 2) / zoom + camY;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (mx >= n.x && mx <= n.x + n.w && my >= n.y && my <= n.y + n.h) {
      console.log('[ZED Graph] Node: ' + n.label + ' | Type: ' + n.type + ' | ID: ' + n.id);
      break;
    }
  }
});

// --- Keyboard: r to reset view ---
window.addEventListener('keydown', e => {
  if (e.target === searchInput) return; // don't capture when typing in search
  if (e.key === 'r' || e.key === 'R') {
    if (nodes.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x + n.w > maxX) maxX = n.x + n.w;
      if (n.y + n.h > maxY) maxY = n.y + n.h;
    }
    const gw = maxX - minX, gh = maxY - minY;
    const z = Math.min(W / (gw + 200), H / (gh + 200), 2);
    zoom = targetZoom = Math.max(z, 0.1);
    camX = targetCamX = minX + gw / 2;
    camY = targetCamY = minY + gh / 2;
    lockedNode = null;
    hoveredNode = null;
    searchInput.value = '';
    searchFilter = '';
    draw();
  }
});

canvas.addEventListener('mousemove', e => {
  if (dragging) {
    camX = targetCamX = camStartX - (e.clientX - dragStartX) / zoom;
    camY = targetCamY = camStartY - (e.clientY - dragStartY) / zoom;
    draw();
    return;
  }
  const mx = (e.clientX - W / 2) / zoom + camX;
  const my = (e.clientY - H / 2) / zoom + camY;
  let found = null;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (mx >= n.x && mx <= n.x + n.w && my >= n.y && my <= n.y + n.h) {
      found = n;
      break;
    }
  }
  if (found !== hoveredNode) {
    hoveredNode = found;
    const tooltip = document.getElementById('tooltip');
    if (hoveredNode) {
      const conns = adjacency[hoveredNode.id] ? adjacency[hoveredNode.id].size : 0;
      tooltip.innerHTML =
        '<div class="tt-title">' + hoveredNode.label + '</div>' +
        '<div class="tt-type">' + hoveredNode.type + '</div>' +
        '<div class="tt-meta">' + conns + ' connection' + (conns !== 1 ? 's' : '') + '</div>';
      tooltip.style.display = 'block';
    } else {
      tooltip.style.display = 'none';
    }
    draw();
  }
  if (hoveredNode) {
    const tooltip = document.getElementById('tooltip');
    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top = (e.clientY + 14) + 'px';
  }
});

canvas.addEventListener('mouseup', () => { dragging = false; });
canvas.addEventListener('mouseleave', () => {
  dragging = false;
  hoveredNode = null;
  document.getElementById('tooltip').style.display = 'none';
  draw();
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  zoom = targetZoom = Math.max(0.1, Math.min(5, zoom * factor));
  draw();
}, { passive: false });

// --- Drawing ---
function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, W, H);

  // Grid pattern
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-camX, -camY);

  // Draw subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 0.5;
  const gridSize = 50;
  const viewLeft = camX - W / 2 / zoom;
  const viewTop = camY - H / 2 / zoom;
  const viewRight = camX + W / 2 / zoom;
  const viewBottom = camY + H / 2 / zoom;
  const startX = Math.floor(viewLeft / gridSize) * gridSize;
  const startY = Math.floor(viewTop / gridSize) * gridSize;
  for (let x = startX; x <= viewRight; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, viewTop); ctx.lineTo(x, viewBottom); ctx.stroke();
  }
  for (let y = startY; y <= viewBottom; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(viewLeft, y); ctx.lineTo(viewRight, y); ctx.stroke();
  }

  // Determine the active focus node (locked takes priority over hovered)
  const focusNode = lockedNode || hoveredNode;

  const highlightSet = new Set();
  if (focusNode) {
    highlightSet.add(focusNode.id);
    if (adjacency[focusNode.id]) {
      for (const id of adjacency[focusNode.id]) highlightSet.add(id);
    }
  }

  // Search filter: set of node ids that match the filter text
  const searchMatchSet = new Set();
  if (searchFilter) {
    for (const n of nodes) {
      if (n.label.toLowerCase().includes(searchFilter)) {
        searchMatchSet.add(n.id);
      }
    }
  }

  // Draw edges
  for (const e of edges) {
    const src = nodeById[e.src];
    const tgt = nodeById[e.tgt];
    if (!src || !tgt) continue;

    const highlighted = highlightSet.has(e.src) && highlightSet.has(e.tgt);
    const focusDimmed = focusNode && !highlighted;
    const searchDimmed = searchFilter && !(searchMatchSet.has(e.src) && searchMatchSet.has(e.tgt));
    const dimmed = focusDimmed || searchDimmed;

    ctx.strokeStyle = dimmed ? 'rgba(255,255,255,0.05)' : (highlighted ? edgeHighlight : edgeColor);
    ctx.lineWidth = highlighted ? 2 : 0.8;
    ctx.beginPath();
    // Connect from center to center, clipped to node edges
    const sx = src.x + src.w / 2;
    const sy = src.y + src.h / 2;
    const ex = tgt.x + tgt.w / 2;
    const ey = tgt.y + tgt.h / 2;
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(ey - sy, ex - sx);
    const aLen = highlighted ? 10 : 6;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - aLen * Math.cos(angle - 0.35), ey - aLen * Math.sin(angle - 0.35));
    ctx.lineTo(ex - aLen * Math.cos(angle + 0.35), ey - aLen * Math.sin(angle + 0.35));
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  }

  // Draw nodes
  for (const n of nodes) {
    const isFocused = focusNode && n.id === focusNode.id;
    const isConnected = highlightSet.has(n.id);
    const focusDimmed = focusNode && !isConnected;
    const searchDimmed = searchFilter && !searchMatchSet.has(n.id);
    const dimmed = focusDimmed || searchDimmed;

    // Glow effect on focus
    if (isFocused) {
      const glowR = 12;
      ctx.save();
      ctx.shadowColor = edgeHighlight;
      ctx.shadowBlur = 25;
      ctx.fillStyle = 'rgba(0, 212, 255, 0.15)';
      roundRect(ctx, n.x - glowR / 2, n.y - glowR / 2, n.w + glowR, n.h + glowR, 12);
      ctx.fill();
      ctx.restore();
    }

    ctx.globalAlpha = dimmed ? 0.15 : 1;

    // Node rectangle
    ctx.fillStyle = n.color;
    roundRect(ctx, n.x, n.y, n.w, n.h, 6);
    ctx.fill();

    ctx.strokeStyle = isFocused ? edgeHighlight : 'rgba(255,255,255,0.08)';
    ctx.lineWidth = isFocused ? 1.5 : 0.5;
    roundRect(ctx, n.x, n.y, n.w, n.h, 6);
    ctx.stroke();

    // Label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px "SF Mono", Menlo, Monaco, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const maxChars = Math.floor(n.w / 8);
    const label = n.label.length > maxChars ? n.label.slice(0, maxChars - 1) + '\\u2026' : n.label;
    ctx.fillText(label, n.x + n.w / 2, n.y + n.h / 2);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

resize();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const PORTS = [7847, 7848, 7849];
const html = buildHtml(graphJson);

function tryListen(portIndex) {
  if (portIndex >= PORTS.length) {
    console.error('Error: All ports (7847-7849) are in use.');
    process.exit(1);
  }

  const port = PORTS[portIndex];
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      tryListen(portIndex + 1);
    } else {
      console.error(`Server error: ${err.message}`);
      process.exit(1);
    }
  });

  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}`;
    console.log(`Graph running at ${url} — Ctrl+C to stop`);

    // Auto-open browser
    const { exec } = require('child_process');
    const platform = process.platform;
    const openCmd = platform === 'darwin' ? 'open'
      : platform === 'win32' ? 'start'
      : 'xdg-open';
    exec(`${openCmd} ${url}`);
  });
}

tryListen(0);
