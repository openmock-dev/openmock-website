/* OpenMock — schema graph explorer.
 * A dependency-free, pannable/zoomable ER-style diagram of the JSON Schema
 * (like schema.opencollection.com): every model is a node card of fields,
 * connected by edges to the models its fields reference. Clicking a node opens
 * a detail drawer with Properties and Source. */
(function () {
  "use strict";

  var dataEl = document.getElementById("schema-data");
  var canvas = document.getElementById("svx-canvas");
  var world = document.getElementById("svx-world");
  var edgesSvg = document.getElementById("svx-edges");
  var searchEl = document.getElementById("svx-search");
  var panel = document.getElementById("svx-panel");
  if (!dataEl || !canvas || !world) return;

  var schema = JSON.parse(dataEl.textContent);
  var defs = schema.$defs || {};
  var ROOT = "__root__";
  function nodeOf(n) { return n === ROOT ? schema : defs[n]; }
  function labelOf(n) { return n === ROOT ? "OpenMock" : n; }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function refName(r) { return r.replace("#/$defs/", ""); }

  var NAMES = [ROOT].concat(Object.keys(defs));

  /* ---- Field extraction & short type labels ------------------------------ */
  function shortType(node) {
    if (!node) return "any";
    if (node.$ref) return refName(node.$ref);
    if (node.const !== undefined) return "const";
    if (node.enum) return "enum";
    if (node.oneOf) return node.oneOf.map(shortType).join(" | ");
    if (node.anyOf) return node.anyOf.map(shortType).join(" | ");
    if (node.allOf) return "object";
    if (node.type === "array") return shortType(node.items || {}) + "[]";
    if (Array.isArray(node.type)) return node.type.join(" | ");
    if (node.type) return node.type;
    if (node.properties || node.additionalProperties) return "object";
    return "any";
  }
  function fieldRef(node) {
    if (!node) return null;
    if (node.$ref) return refName(node.$ref);
    if (node.type === "array" && node.items && node.items.$ref) return refName(node.items.$ref);
    if (node.additionalProperties && node.additionalProperties.$ref) return refName(node.additionalProperties.$ref);
    return null;
  }
  function fieldsOf(name) {
    var node = nodeOf(name), out = [];
    if (!node) return out;
    var req = node.required || [];
    var props = node.properties || {};
    Object.keys(props).forEach(function (k) { out.push({ name: k, type: shortType(props[k]), ref: fieldRef(props[k]), required: req.indexOf(k) !== -1 }); });
    if (node.additionalProperties && node.additionalProperties.$ref) out.push({ name: "«value»", type: refName(node.additionalProperties.$ref), ref: refName(node.additionalProperties.$ref) });
    else if (node.additionalProperties && typeof node.additionalProperties === "object") out.push({ name: "«value»", type: shortType(node.additionalProperties), ref: null });
    if (node.patternProperties && node.patternProperties["^x-"] !== undefined) out.push({ name: "x-*", type: "extension", ref: null });
    // union server type (allOf/oneOf discriminator) — surface the target refs
    var union = node.allOf || node.oneOf || node.anyOf;
    if (union && !out.length) union.forEach(function (p) {
      var r = (p.then && p.then.$ref) || p.$ref; if (r) out.push({ name: "→", type: refName(r), ref: refName(r) });
    });
    return out;
  }
  function kindOf(name) {
    var n = nodeOf(name);
    if (!n) return "";
    if (n.enum) return "enum";
    if (n.oneOf || n.allOf || n.anyOf) return "union";
    if (n.type && n.type !== "object" && !n.properties) return Array.isArray(n.type) ? n.type.join("|") : n.type;
    return "object";
  }

  /* ---- Reference graph --------------------------------------------------- */
  function collectRefs(node, out) {
    if (!node || typeof node !== "object") return out;
    if (node.$ref) out[refName(node.$ref)] = true;
    Object.keys(node).forEach(function (k) {
      if (k === "$ref") return;
      var v = node[k];
      if (Array.isArray(v)) v.forEach(function (x) { collectRefs(x, out); });
      else if (v && typeof v === "object") collectRefs(v, out);
    });
    return out;
  }
  var outEdges = {}; // name -> [targets]
  NAMES.forEach(function (n) { outEdges[n] = Object.keys(collectRefs(nodeOf(n), {})).filter(function (t) { return t !== n && (t === ROOT || defs[t]); }); });

  /* ---- Layered layout ---------------------------------------------------- */
  var NODE_W = 244, HEAD_H = 39, ROW_H = 25.6, PAD_B = 0, MAX_ROWS = 9;
  var HGAP = 110, VGAP = 34;

  function nodeHeight(name) {
    var rows = Math.min(fieldsOf(name).length, MAX_ROWS);
    var extra = fieldsOf(name).length > MAX_ROWS ? ROW_H : 0;
    return HEAD_H + rows * ROW_H + extra + PAD_B;
  }

  // longest-path layering from ROOT via relaxation (cycle-safe, bounded).
  var layer = {}; NAMES.forEach(function (n) { layer[n] = 0; });
  for (var it = 0; it < NAMES.length; it++) {
    var changed = false;
    NAMES.forEach(function (u) {
      outEdges[u].forEach(function (v) {
        if (layer[v] < layer[u] + 1) { layer[v] = layer[u] + 1; changed = true; }
      });
    });
    if (!changed) break;
  }
  // group by layer
  var cols = {};
  NAMES.forEach(function (n) { (cols[layer[n]] = cols[layer[n]] || []).push(n); });
  var pos = {}; // name -> {x,y,w,h}
  var maxX = 0, maxY = 0, curX = 40;
  Object.keys(cols).map(Number).sort(function (a, b) { return a - b; }).forEach(function (L) {
    var list = cols[L].sort();
    var y = 40, w = NODE_W;
    list.forEach(function (n) {
      var h = nodeHeight(n);
      pos[n] = { x: curX, y: y, w: w, h: h };
      y += h + VGAP;
      maxY = Math.max(maxY, y);
    });
    curX += NODE_W + HGAP;
    maxX = Math.max(maxX, curX);
  });

  /* ---- Render nodes ------------------------------------------------------ */
  function nodeCard(name) {
    var p = pos[name], fields = fieldsOf(name);
    var shown = fields.slice(0, MAX_ROWS);
    var rows = shown.map(function (f) {
      var req = f.required ? '<span class="req">*</span>' : "";
      return '<div class="nd__f"' + (f.ref ? ' data-ref="' + esc(f.ref) + '"' : "") + '>' +
        '<span class="nd__fn">' + esc(f.name) + req + '</span>' +
        '<span class="nd__ft">' + esc(f.type) + "</span></div>";
    }).join("");
    if (fields.length > MAX_ROWS) rows += '<div class="nd__more">+' + (fields.length - MAX_ROWS) + " more…</div>";
    return '<div class="nd" id="nd-' + esc(name) + '" data-node="' + esc(name) + '" style="left:' + p.x + "px;top:" + p.y + "px;width:" + p.w + 'px">' +
      '<div class="nd__h"><span class="nd__name">' + esc(labelOf(name)) + '</span><span class="nd__kind">' + esc(kindOf(name)) + "</span></div>" +
      '<div class="nd__b">' + rows + "</div></div>";
  }
  world.insertAdjacentHTML("beforeend", NAMES.map(nodeCard).join(""));

  /* ---- Render edges ------------------------------------------------------ */
  edgesSvg.setAttribute("width", maxX);
  edgesSvg.setAttribute("height", maxY);
  var edgeEls = [];
  var edgesHtml = "";
  NAMES.forEach(function (u) {
    outEdges[u].forEach(function (v) {
      var a = pos[u], b = pos[v];
      if (!a || !b) return;
      var forward = b.x >= a.x;
      var x1 = forward ? a.x + a.w : a.x, y1 = a.y + Math.min(a.h / 2, 24);
      var x2 = forward ? b.x : b.x + b.w, y2 = b.y + Math.min(b.h / 2, 24);
      var dx = Math.max(40, Math.abs(x2 - x1) * 0.5) * (forward ? 1 : -1);
      var d = "M" + x1 + " " + y1 + " C" + (x1 + dx) + " " + y1 + " " + (x2 - dx) + " " + y2 + " " + x2 + " " + y2;
      edgesHtml += '<path data-u="' + esc(u) + '" data-v="' + esc(v) + '" d="' + d + '"/>';
    });
  });
  edgesSvg.innerHTML = edgesHtml;
  edgeEls = Array.prototype.slice.call(edgesSvg.querySelectorAll("path"));

  /* ---- Pan / zoom -------------------------------------------------------- */
  var tx = 0, ty = 0, scale = 1;
  function apply() { world.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")"; }
  function clampScale(s) { return Math.max(0.2, Math.min(2.2, s)); }
  function fit() {
    var cw = canvas.clientWidth, ch = canvas.clientHeight;
    var pad = 60;
    var s = clampScale(Math.min((cw - pad) / (maxX + 40), (ch - pad) / (maxY + 40)));
    scale = s;
    tx = (cw - (maxX + 40) * s) / 2;
    ty = Math.max(20, (ch - maxY * s) / 2);
    apply();
  }
  function zoomAt(cx, cy, factor) {
    var ns = clampScale(scale * factor);
    tx = cx - (cx - tx) * (ns / scale);
    ty = cy - (cy - ty) * (ns / scale);
    scale = ns; apply();
  }

  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    var r = canvas.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 0.89);
  }, { passive: false });

  var dragging = false, sx = 0, sy = 0, moved = false;
  function down(x, y, target) {
    if (target.closest && target.closest(".nd, .svx__zoom, .svx__panel")) return; // let cards/controls handle
    dragging = true; moved = false; sx = x - tx; sy = y - ty; canvas.classList.add("grabbing");
  }
  function move(x, y) { if (!dragging) return; tx = x - sx; ty = y - sy; moved = true; apply(); }
  function up() { dragging = false; canvas.classList.remove("grabbing"); }

  canvas.addEventListener("mousedown", function (e) { down(e.clientX, e.clientY, e.target); });
  window.addEventListener("mousemove", function (e) { move(e.clientX, e.clientY); });
  window.addEventListener("mouseup", up);
  canvas.addEventListener("touchstart", function (e) { var t = e.touches[0]; down(t.clientX, t.clientY, e.target); }, { passive: true });
  canvas.addEventListener("touchmove", function (e) { if (dragging) { e.preventDefault(); var t = e.touches[0]; move(t.clientX, t.clientY); } }, { passive: false });
  canvas.addEventListener("touchend", up);

  document.getElementById("svx-zoom-in").addEventListener("click", function () { var r = canvas.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1.2); });
  document.getElementById("svx-zoom-out").addEventListener("click", function () { var r = canvas.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 0.83); });
  document.getElementById("svx-zoom-fit").addEventListener("click", fit);

  /* ---- Selection & focus ------------------------------------------------- */
  var selected = null;
  function highlightEdges(name) {
    edgeEls.forEach(function (p) {
      var on = name && (p.getAttribute("data-u") === name || p.getAttribute("data-v") === name);
      p.classList.toggle("hot", !!on);
    });
  }
  function select(name, opts) {
    selected = name;
    world.querySelectorAll(".nd").forEach(function (n) { n.classList.toggle("sel", n.getAttribute("data-node") === name); });
    highlightEdges(name);
    openPanel(name);
    if (opts && opts.center) centerOn(name);
    if (name === ROOT) location.hash = "#"; else location.hash = "#" + name;
  }
  function centerOn(name) {
    var p = pos[name]; if (!p) return;
    var panelW = (window.innerWidth > 760) ? Math.min(410, canvas.clientWidth * 0.5) : 0;
    var effW = canvas.clientWidth - panelW;
    scale = clampScale(Math.max(scale, 0.75));
    tx = effW / 2 - (p.x + p.w / 2) * scale;
    ty = canvas.clientHeight / 2 - (p.y + p.h / 2) * scale;
    apply();
  }

  /* ---- Detail drawer ----------------------------------------------------- */
  var panelTab = "props";
  function chipHtml(node) {
    var c = [];
    if (node.const !== undefined) c.push('<span class="chip"><b>const</b> ' + esc(JSON.stringify(node.const)) + "</span>");
    if (node.enum) c.push('<span class="chip chip--enum">' + node.enum.map(function (e) { return esc(JSON.stringify(e)); }).join(" · ") + "</span>");
    if (node.pattern) c.push('<span class="chip"><b>pattern</b> ' + esc(node.pattern) + "</span>");
    if (node.format) c.push('<span class="chip"><b>format</b> ' + esc(node.format) + "</span>");
    if (node.minimum !== undefined) c.push('<span class="chip"><b>min</b> ' + node.minimum + "</span>");
    if (node.maximum !== undefined) c.push('<span class="chip"><b>max</b> ' + node.maximum + "</span>");
    if (node.default !== undefined) c.push('<span class="chip"><b>default</b> ' + esc(JSON.stringify(node.default)) + "</span>");
    return c.length ? '<div class="prop__meta">' + c.join("") + "</div>" : "";
  }
  function propsPanel(name) {
    var node = nodeOf(name), fields = fieldsOf(name);
    var head = node.description ? '<p class="prop__desc" style="margin-bottom:14px">' + esc(node.description) + "</p>" : "";
    if (!fields.length) return head + '<div class="tp-tree"><div class="tp"><div class="tp__row"><span class="tp__nocaret"></span><span class="prop__type">' + esc(shortType(node)) + "</span></div>" + chipHtml(node) + "</div></div>";
    var props = node.properties || {};
    var rows = fields.map(function (f) {
      var pn = props[f.name] || {};
      var link = f.ref ? '<a class="sv-ref" href="#' + esc(f.ref) + '">' + esc(f.type) + "</a>" : esc(f.type);
      var badge = f.required ? '<span class="badge-req">required</span>' : '<span class="badge-opt">optional</span>';
      var desc = pn.description ? '<p class="prop__desc">' + esc(pn.description) + "</p>" : "";
      return '<div class="tp"><div class="tp__row"><span class="tp__nocaret"></span><span class="prop__name">' + esc(f.name) +
        '</span><span class="prop__type">' + link + "</span>" + badge + "</div>" + desc + chipHtml(pn) + "</div>";
    }).join("");
    return head + '<div class="tp-tree">' + rows + "</div>";
  }
  function sourcePanel(name) {
    var raw = esc(JSON.stringify(nodeOf(name), null, 2));
    var hl = (window.OM && window.OM.highlight) ? window.OM.highlight("json", raw) : raw;
    return '<div class="codeblock"><button class="codeblock__copy" type="button">Copy</button><pre><code>' + hl + "</code></pre></div>";
  }
  function openPanel(name) {
    if (!panel) return;
    var node = nodeOf(name);
    var body = panelTab === "source" ? sourcePanel(name) : propsPanel(name);
    panel.innerHTML =
      '<div class="svx__panel-head"><h3>' + esc(labelOf(name)) + '<span class="kind">' + esc(kindOf(name)) + '</span></h3>' +
        '<button class="svx__close" type="button" aria-label="Close">×</button></div>' +
      '<div class="svx__tabs"><button class="svx__tab' + (panelTab === "props" ? " active" : "") + '" data-ptab="props">Properties</button>' +
        '<button class="svx__tab' + (panelTab === "source" ? " active" : "") + '" data-ptab="source">Source</button></div>' +
      '<div class="svx__panel-body">' + body + "</div>";
    panel.classList.add("open");
    panel.querySelectorAll(".codeblock__copy").forEach(function (b) {
      b.addEventListener("click", function () { var pre = b.parentNode.querySelector("pre"); if (pre && navigator.clipboard) navigator.clipboard.writeText(pre.innerText).then(function () { var t = b.textContent; b.textContent = "Copied!"; setTimeout(function () { b.textContent = t; }, 1400); }); });
    });
  }
  function closePanel() { if (panel) { panel.classList.remove("open"); } selected = null; highlightEdges(null); world.querySelectorAll(".nd.sel").forEach(function (n) { n.classList.remove("sel"); }); }

  /* ---- Events ------------------------------------------------------------ */
  world.addEventListener("click", function (e) {
    if (moved) return;
    var f = e.target.closest(".nd__f[data-ref]");
    if (f) { var r = f.getAttribute("data-ref"); select(r, { center: true }); return; }
    var card = e.target.closest(".nd");
    if (card) select(card.getAttribute("data-node"), { center: true });
  });
  if (panel) panel.addEventListener("click", function (e) {
    if (e.target.closest(".svx__close")) { closePanel(); return; }
    var pt = e.target.closest(".svx__tab");
    if (pt) { panelTab = pt.getAttribute("data-ptab"); openPanel(selected || ROOT); return; }
    var ref = e.target.closest(".sv-ref");
    if (ref) { e.preventDefault(); select(decodeURIComponent(ref.getAttribute("href").slice(1)) || ROOT, { center: true }); }
  });

  if (searchEl) searchEl.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    var q = searchEl.value.toLowerCase().trim(); if (!q) return;
    var hit = NAMES.filter(function (n) { return labelOf(n).toLowerCase().indexOf(q) !== -1; })[0];
    if (hit) select(hit, { center: true });
  });

  window.addEventListener("hashchange", function () {
    var h = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    var name = (h && defs[h]) ? h : (h === "" ? ROOT : null);
    if (name && name !== selected) select(name, { center: true });
  });

  /* ---- Init -------------------------------------------------------------- */
  fit();
  var h0 = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  if (h0 && defs[h0]) select(h0, { center: true });
  // Otherwise show the whole diagram first; the drawer opens on click.
})();
