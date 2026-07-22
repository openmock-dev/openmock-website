/* OpenMock — schema explorer (modeled on schema.opencollection.com).
 * Three views over the embedded JSON Schema:
 *   Explorer — Miller columns: each column is a model's property list; clicking
 *              a property that references another model opens that model as a
 *              new column to the right, with a breadcrumb of the path.
 *   Schema   — the pan/zoom ER diagram (node cards + edges).
 *   Source   — the raw schema JSON, highlighted.
 * Dependency-free. */
(function () {
  "use strict";

  var dataEl = document.getElementById("schema-data");
  if (!dataEl) return;
  var schema = JSON.parse(dataEl.textContent);
  var defs = schema.$defs || {};
  var ROOT = "__root__";

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function refName(r) { return r.replace("#/$defs/", ""); }
  function nodeOf(n) { return n === ROOT ? schema : defs[n]; }

  /* ======================================================================
     Shared model helpers
     ====================================================================== */
  function shortType(node) {
    if (!node) return "any";
    if (node.$ref) return "object";
    if (node.const !== undefined) return "const";
    if (node.enum) return "enum";
    if (node.oneOf) return "oneOf";
    if (node.anyOf) return "anyOf";
    if (node.allOf) return "object";
    if (node.type === "array") return "array";
    if (Array.isArray(node.type)) return node.type.join(" | ");
    if (node.type) return node.type;
    if (node.properties || node.additionalProperties) return "object";
    return "any";
  }
  // Where does a property navigate to? -> { name|null, node, label } or null.
  function targetOf(node) {
    if (!node) return null;
    if (node.$ref) { var n = refName(node.$ref); return { name: n, node: defs[n] }; }
    if (node.type === "array" && node.items) {
      if (node.items.$ref) { var m = refName(node.items.$ref); return { name: m, node: defs[m] }; }
      if (node.items.properties || node.items.allOf || node.items.oneOf || node.items.anyOf) return { name: null, node: node.items };
    }
    if (node.additionalProperties && typeof node.additionalProperties === "object") {
      if (node.additionalProperties.$ref) { var q = refName(node.additionalProperties.$ref); return { name: q, node: defs[q] }; }
      if (node.additionalProperties.properties) return { name: null, node: node.additionalProperties };
    }
    if (node.oneOf || node.anyOf || node.allOf) return { name: null, node: node };
    if (node.properties) return { name: null, node: node };
    return null;
  }
  function iconFor(node) {
    var t = node && node.$ref ? "object" : shortType(node);
    if (t === "object" || t === "oneOf" || t === "anyOf") return '<span class="xi xi--obj">{}</span>';
    if (t === "array") return '<span class="xi xi--arr">[]</span>';
    if (t === "string" || t === "const") return '<span class="xi xi--str">T</span>';
    if (t === "integer" || t === "number") return '<span class="xi xi--num">#</span>';
    if (t === "boolean") return '<span class="xi xi--bool">◑</span>';
    if (t === "enum") return '<span class="xi xi--enum">≡</span>';
    return '<span class="xi xi--any">?</span>';
  }
  function kindOf(node) {
    if (!node) return "";
    if (node.enum) return "enum";
    if (node.oneOf) return "oneOf";
    if (node.anyOf) return "anyOf";
    if (node.allOf) return "object";
    if (node.type) return Array.isArray(node.type) ? node.type.join("|") : node.type;
    if (node.properties) return "object";
    return "object";
  }
  function chipHtml(node) {
    var c = [];
    if (node.const !== undefined) c.push('<span class="chip"><b>const</b> ' + esc(JSON.stringify(node.const)) + "</span>");
    if (node.enum) c.push('<span class="chip chip--enum">' + node.enum.map(function (e) { return esc(JSON.stringify(e)); }).join(" · ") + "</span>");
    if (node.pattern) c.push('<span class="chip"><b>pattern</b> ' + esc(node.pattern) + "</span>");
    if (node.format) c.push('<span class="chip"><b>format</b> ' + esc(node.format) + "</span>");
    if (node.minimum !== undefined) c.push('<span class="chip"><b>min</b> ' + node.minimum + "</span>");
    if (node.maximum !== undefined) c.push('<span class="chip"><b>max</b> ' + node.maximum + "</span>");
    if (node.minItems !== undefined) c.push('<span class="chip"><b>minItems</b> ' + node.minItems + "</span>");
    if (node.default !== undefined) c.push('<span class="chip"><b>default</b> ' + esc(JSON.stringify(node.default)) + "</span>");
    if (node.additionalProperties === false) c.push('<span class="chip">no additional props</span>');
    return c.length ? '<div class="xr__chips">' + c.join("") + "</div>" : "";
  }
  // Rows of a model node: properties, union branches, map values, extensions.
  function rowsOf(node) {
    var out = [], req = node.required || [], props = node.properties || {};
    Object.keys(props).forEach(function (k) { out.push({ prop: k, node: props[k], required: req.indexOf(k) !== -1 }); });
    var union = node.oneOf || node.anyOf || (node.allOf && node.allOf.filter(function (p) { return p.if; }).length ? node.allOf : null);
    if (union) union.forEach(function (p) {
      var r = (p.then && p.then.$ref) || p.$ref;
      if (r) out.push({ prop: "one of", node: { $ref: r }, branch: true });
    });
    if (node.additionalProperties && typeof node.additionalProperties === "object")
      out.push({ prop: "{ key }", node: node.additionalProperties, mapValue: true });
    if (node.patternProperties && node.patternProperties["^x-"] !== undefined)
      out.push({ prop: "x-*", node: { description: "Specification extension — properties starting with x- are allowed and ignored by validation." }, ext: true });
    return out;
  }

  /* ======================================================================
     View switching
     ====================================================================== */
  var views = {
    explorer: document.getElementById("view-explorer"),
    graph: document.getElementById("view-graph"),
    source: document.getElementById("view-source"),
  };
  var hintEl = document.getElementById("svx-hint");
  var HINTS = {
    explorer: "Click a property to open the referenced model in a new column",
    graph: "Drag to pan · scroll to zoom · click a model for details",
    source: "The complete schema document",
  };
  var currentView = "explorer";
  var graphInited = false, sourceInited = false;

  function showView(v) {
    currentView = v;
    Object.keys(views).forEach(function (k) { if (views[k]) views[k].hidden = k !== v; });
    document.querySelectorAll(".viewswitch__btn").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-view") === v); });
    if (hintEl) hintEl.textContent = HINTS[v] || "";
    var crumb = document.getElementById("svx-crumb");
    if (crumb) crumb.style.display = v === "explorer" ? "" : "none";
    if (v === "graph" && !graphInited) { graphInited = true; initGraph(); }
    if (v === "source" && !sourceInited) { sourceInited = true; initSource(); }
  }
  document.querySelectorAll(".viewswitch__btn").forEach(function (b) {
    b.addEventListener("click", function () { showView(b.getAttribute("data-view")); });
  });

  /* ======================================================================
     Explorer (Miller columns)
     ====================================================================== */
  var xp = views.explorer;
  var crumbEl = document.getElementById("svx-crumb");
  // path[0] is always the root column; each further entry:
  // { prop, name (def name or null), node, sel: property key selected in the PREVIOUS column }
  var path = [{ prop: "root", name: ROOT, node: schema }];

  function rowHtml(r, colIdx) {
    var t = targetOf(r.node);
    var typeStr = shortType(r.node);
    var right = '<span class="xr__type">' + esc(typeStr);
    if (t && t.name) right += ' <span class="xr__ref">' + esc(t.name) + "</span>";
    right += "</span>" + (t ? '<span class="xr__arrow">→</span>' : "");
    var badge = r.required ? '<span class="xr__req" title="required">*</span>' : "";
    var desc = r.node && r.node.description ? '<p class="xr__desc">' + esc(r.node.description) + "</p>" : "";
    return '<div class="xr' + (t ? " xr--nav" : "") + '" data-col="' + colIdx + '" data-prop="' + esc(r.prop) + '">' +
      '<div class="xr__line">' + iconFor(r.node) +
      '<span class="xr__name">' + esc(r.prop) + badge + "</span>" + right + "</div>" + desc + chipHtml(r.node || {}) + "</div>";
  }

  function columnHtml(entry, idx) {
    var node = entry.node;
    var title = idx === 0 ? "root" : entry.prop + " → " + (entry.name || shortType(node));
    var rows = rowsOf(node);
    var body = "";
    if (idx > 0 && node.description) body += '<div class="xc__sec">Description</div><p class="xc__desc">' + esc(node.description) + "</p>";
    if (rows.length) {
      body += '<div class="xc__sec">Properties</div>' + rows.map(function (r) { return rowHtml(r, idx); }).join("");
    } else {
      body += '<div class="xc__sec">Type</div><div class="xr"><div class="xr__line">' + iconFor(node) +
        '<span class="xr__name">' + esc(kindOf(node)) + "</span></div>" + chipHtml(node) + "</div>";
    }
    return '<section class="xc" data-idx="' + idx + '">' +
      '<header class="xc__head">' + iconFor(node) + '<b class="xc__title">' + esc(title) + '</b>' +
      '<span class="xc__kind">' + esc(kindOf(node)) + "</span>" +
      (idx > 0 ? '<button class="xc__close" type="button" aria-label="Close column">×</button>' : "") +
      '</header><div class="xc__scroll">' + body + "</div></section>";
  }

  function renderExplorer() {
    xp.innerHTML = path.map(columnHtml).join("");
    // mark selected rows along the path
    for (var i = 1; i < path.length; i++) {
      var col = xp.querySelector('.xc[data-idx="' + (i - 1) + '"]');
      if (!col) continue;
      var row = Array.prototype.find.call(col.querySelectorAll(".xr"), function (r) { return r.getAttribute("data-prop") === path[i].sel; });
      if (row) row.classList.add("sel");
    }
    renderCrumb();
    xp.scrollLeft = xp.scrollWidth;
    var last = path[path.length - 1];
    if (last.name && last.name !== ROOT) { history.replaceState(null, "", "#" + last.name); }
    else if (path.length === 1) { history.replaceState(null, "", location.pathname + location.search); }
  }

  function renderCrumb() {
    if (!crumbEl) return;
    var parts = path.map(function (e, i) {
      var label = i === 0 ? "root" : e.prop + " → " + (e.name || shortType(e.node));
      return '<button class="crumb" type="button" data-idx="' + i + '">' + esc(label) + "</button>";
    });
    crumbEl.innerHTML = parts.join('<span class="crumb__sep">/</span>');
  }

  xp.addEventListener("click", function (e) {
    var close = e.target.closest(".xc__close");
    if (close) { path = path.slice(0, Number(close.closest(".xc").getAttribute("data-idx"))); if (!path.length) path = [{ prop: "root", name: ROOT, node: schema }]; renderExplorer(); return; }
    var row = e.target.closest(".xr--nav");
    if (!row) return;
    var colIdx = Number(row.getAttribute("data-col"));
    var propKey = row.getAttribute("data-prop");
    var colEntry = path[colIdx];
    var r = rowsOf(colEntry.node).filter(function (x) { return x.prop === propKey; })[0];
    if (!r) return;
    var t = targetOf(r.node);
    if (!t || !t.node) return;
    path = path.slice(0, colIdx + 1);
    path.push({ prop: propKey, name: t.name, node: t.node, sel: propKey });
    renderExplorer();
  });

  if (crumbEl) crumbEl.addEventListener("click", function (e) {
    var c = e.target.closest(".crumb");
    if (!c) return;
    path = path.slice(0, Number(c.getAttribute("data-idx")) + 1);
    renderExplorer();
  });

  /* ======================================================================
     Source view
     ====================================================================== */
  function initSource() {
    var raw = esc(JSON.stringify(schema, null, 2));
    var hl = (window.OM && window.OM.highlight) ? window.OM.highlight("json", raw) : raw;
    views.source.innerHTML = '<div class="codeblock"><button class="codeblock__copy" type="button">Copy</button><pre><code>' + hl + "</code></pre></div>";
    views.source.querySelector(".codeblock__copy").addEventListener("click", function () {
      var pre = views.source.querySelector("pre");
      if (navigator.clipboard) navigator.clipboard.writeText(pre.innerText).then(function () {
        var b = views.source.querySelector(".codeblock__copy");
        var t = b.textContent; b.textContent = "Copied!"; setTimeout(function () { b.textContent = t; }, 1400);
      });
    });
  }

  /* ======================================================================
     Graph view (ER diagram) — same behaviour as before, lazily initialised
     ====================================================================== */
  function initGraph() {
    var canvas = views.graph;
    var world = document.getElementById("svx-world");
    var edgesSvg = document.getElementById("svx-edges");
    var panel = document.getElementById("svx-panel");
    if (!canvas || !world || !edgesSvg) return;

    var NAMES = [ROOT].concat(Object.keys(defs));
    function labelOf(n) { return n === ROOT ? "OpenMock" : n; }

    function gShort(node) {
      if (!node) return "any";
      if (node.$ref) return refName(node.$ref);
      if (node.const !== undefined) return "const";
      if (node.enum) return "enum";
      if (node.oneOf) return node.oneOf.map(gShort).join(" | ");
      if (node.anyOf) return node.anyOf.map(gShort).join(" | ");
      if (node.allOf) return "object";
      if (node.type === "array") return gShort(node.items || {}) + "[]";
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
      Object.keys(props).forEach(function (k) { out.push({ name: k, type: gShort(props[k]), ref: fieldRef(props[k]), required: req.indexOf(k) !== -1 }); });
      if (node.additionalProperties && node.additionalProperties.$ref) out.push({ name: "«value»", type: refName(node.additionalProperties.$ref), ref: refName(node.additionalProperties.$ref) });
      else if (node.additionalProperties && typeof node.additionalProperties === "object") out.push({ name: "«value»", type: gShort(node.additionalProperties), ref: null });
      if (node.patternProperties && node.patternProperties["^x-"] !== undefined) out.push({ name: "x-*", type: "extension", ref: null });
      var union = node.allOf || node.oneOf || node.anyOf;
      if (union && !out.length) union.forEach(function (p) {
        var r = (p.then && p.then.$ref) || p.$ref; if (r) out.push({ name: "→", type: refName(r), ref: refName(r) });
      });
      return out;
    }
    function gKind(name) {
      var n = nodeOf(name);
      if (!n) return "";
      if (n.enum) return "enum";
      if (n.oneOf || n.allOf || n.anyOf) return "union";
      if (n.type && n.type !== "object" && !n.properties) return Array.isArray(n.type) ? n.type.join("|") : n.type;
      return "object";
    }
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
    var outEdges = {};
    NAMES.forEach(function (n) { outEdges[n] = Object.keys(collectRefs(nodeOf(n), {})).filter(function (t) { return t !== n && (t === ROOT || defs[t]); }); });

    var NODE_W = 244, HEAD_H = 39, ROW_H = 25.6, MAX_ROWS = 9, HGAP = 110, VGAP = 34;
    function nodeHeight(name) {
      var f = fieldsOf(name).length;
      return HEAD_H + Math.min(f, MAX_ROWS) * ROW_H + (f > MAX_ROWS ? ROW_H : 0);
    }
    var layer = {}; NAMES.forEach(function (n) { layer[n] = 0; });
    for (var it = 0; it < NAMES.length; it++) {
      var changed = false;
      NAMES.forEach(function (u) { outEdges[u].forEach(function (v) { if (layer[v] < layer[u] + 1) { layer[v] = layer[u] + 1; changed = true; } }); });
      if (!changed) break;
    }
    var cols = {};
    NAMES.forEach(function (n) { (cols[layer[n]] = cols[layer[n]] || []).push(n); });
    var pos = {}, maxX = 0, maxY = 0, curX = 40;
    Object.keys(cols).map(Number).sort(function (a, b) { return a - b; }).forEach(function (L) {
      var y = 40;
      cols[L].sort().forEach(function (n) {
        var h = nodeHeight(n);
        pos[n] = { x: curX, y: y, w: NODE_W, h: h };
        y += h + VGAP; maxY = Math.max(maxY, y);
      });
      curX += NODE_W + HGAP; maxX = Math.max(maxX, curX);
    });

    function nodeCard(name) {
      var p = pos[name], fields = fieldsOf(name);
      var rows = fields.slice(0, MAX_ROWS).map(function (f) {
        var req = f.required ? '<span class="req">*</span>' : "";
        return '<div class="nd__f"' + (f.ref ? ' data-ref="' + esc(f.ref) + '"' : "") + '><span class="nd__fn">' + esc(f.name) + req + '</span><span class="nd__ft">' + esc(f.type) + "</span></div>";
      }).join("");
      if (fields.length > MAX_ROWS) rows += '<div class="nd__more">+' + (fields.length - MAX_ROWS) + " more…</div>";
      return '<div class="nd" id="nd-' + esc(name) + '" data-node="' + esc(name) + '" style="left:' + p.x + "px;top:" + p.y + "px;width:" + p.w + 'px"><div class="nd__h"><span class="nd__name">' + esc(labelOf(name)) + '</span><span class="nd__kind">' + esc(gKind(name)) + '</span></div><div class="nd__b">' + rows + "</div></div>";
    }
    world.insertAdjacentHTML("beforeend", NAMES.map(nodeCard).join(""));

    edgesSvg.setAttribute("width", maxX);
    edgesSvg.setAttribute("height", maxY);
    var edgesHtml = "";
    NAMES.forEach(function (u) {
      outEdges[u].forEach(function (v) {
        var a = pos[u], b2 = pos[v];
        if (!a || !b2) return;
        var fwd = b2.x >= a.x;
        var x1 = fwd ? a.x + a.w : a.x, y1 = a.y + Math.min(a.h / 2, 24);
        var x2 = fwd ? b2.x : b2.x + b2.w, y2 = b2.y + Math.min(b2.h / 2, 24);
        var dx = Math.max(40, Math.abs(x2 - x1) * 0.5) * (fwd ? 1 : -1);
        edgesHtml += '<path data-u="' + esc(u) + '" data-v="' + esc(v) + '" d="M' + x1 + " " + y1 + " C" + (x1 + dx) + " " + y1 + " " + (x2 - dx) + " " + y2 + " " + x2 + " " + y2 + '"/>';
      });
    });
    edgesSvg.innerHTML = edgesHtml;
    var edgeEls = Array.prototype.slice.call(edgesSvg.querySelectorAll("path"));

    var tx = 0, ty = 0, scale = 1;
    function apply() { world.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")"; }
    function clampScale(s) { return Math.max(0.2, Math.min(2.2, s)); }
    function fit() {
      var cw = canvas.clientWidth, ch = canvas.clientHeight, pad = 60;
      var s = clampScale(Math.min((cw - pad) / (maxX + 40), (ch - pad) / (maxY + 40)));
      scale = s; tx = (cw - (maxX + 40) * s) / 2; ty = Math.max(20, (ch - maxY * s) / 2); apply();
    }
    function zoomAt(cx, cy, f) {
      var ns = clampScale(scale * f);
      tx = cx - (cx - tx) * (ns / scale); ty = cy - (cy - ty) * (ns / scale); scale = ns; apply();
    }
    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      var r = canvas.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 0.89);
    }, { passive: false });

    var dragging = false, sx = 0, sy = 0, moved = false;
    function down(x, y, target) {
      if (target.closest && target.closest(".nd, .svx__zoom, .svx__panel")) return;
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

    var selected = null, panelTab = "props";
    function highlightEdges(name) {
      edgeEls.forEach(function (p) {
        p.classList.toggle("hot", !!(name && (p.getAttribute("data-u") === name || p.getAttribute("data-v") === name)));
      });
    }
    function centerOn(name) {
      var p = pos[name]; if (!p) return;
      var panelW = (window.innerWidth > 760) ? Math.min(410, canvas.clientWidth * 0.5) : 0;
      scale = clampScale(Math.max(scale, 0.75));
      tx = (canvas.clientWidth - panelW) / 2 - (p.x + p.w / 2) * scale;
      ty = canvas.clientHeight / 2 - (p.y + p.h / 2) * scale;
      apply();
    }
    function propsPanel(name) {
      var node = nodeOf(name), fields = fieldsOf(name);
      var head = node.description ? '<p class="prop__desc" style="margin-bottom:14px">' + esc(node.description) + "</p>" : "";
      if (!fields.length) return head + '<div class="tp-tree"><div class="tp"><div class="tp__row"><span class="tp__nocaret"></span><span class="prop__type">' + esc(gShort(node)) + "</span></div>" + chipHtml(node) + "</div></div>";
      var props = node.properties || {};
      return head + '<div class="tp-tree">' + fields.map(function (f) {
        var pn = props[f.name] || {};
        var link = f.ref ? '<a class="sv-ref" href="#' + esc(f.ref) + '">' + esc(f.type) + "</a>" : esc(f.type);
        var badge = f.required ? '<span class="badge-req">required</span>' : '<span class="badge-opt">optional</span>';
        var desc = pn.description ? '<p class="prop__desc">' + esc(pn.description) + "</p>" : "";
        return '<div class="tp"><div class="tp__row"><span class="tp__nocaret"></span><span class="prop__name">' + esc(f.name) + '</span><span class="prop__type">' + link + "</span>" + badge + "</div>" + desc + chipHtml(pn) + "</div>";
      }).join("") + "</div>";
    }
    function sourcePanel(name) {
      var raw = esc(JSON.stringify(nodeOf(name), null, 2));
      var hl = (window.OM && window.OM.highlight) ? window.OM.highlight("json", raw) : raw;
      return '<div class="codeblock"><button class="codeblock__copy" type="button">Copy</button><pre><code>' + hl + "</code></pre></div>";
    }
    function openPanel(name) {
      var body = panelTab === "source" ? sourcePanel(name) : propsPanel(name);
      panel.innerHTML = '<div class="svx__panel-head"><h3>' + esc(labelOf(name)) + '<span class="kind">' + esc(gKind(name)) + '</span></h3><button class="svx__close" type="button" aria-label="Close">×</button></div>' +
        '<div class="svx__tabs"><button class="svx__tab' + (panelTab === "props" ? " active" : "") + '" data-ptab="props">Properties</button><button class="svx__tab' + (panelTab === "source" ? " active" : "") + '" data-ptab="source">Source</button></div>' +
        '<div class="svx__panel-body">' + body + "</div>";
      panel.classList.add("open");
      panel.querySelectorAll(".codeblock__copy").forEach(function (b) {
        b.addEventListener("click", function () { var pre = b.parentNode.querySelector("pre"); if (pre && navigator.clipboard) navigator.clipboard.writeText(pre.innerText).then(function () { var t = b.textContent; b.textContent = "Copied!"; setTimeout(function () { b.textContent = t; }, 1400); }); });
      });
    }
    function select(name, center) {
      selected = name;
      world.querySelectorAll(".nd").forEach(function (n) { n.classList.toggle("sel", n.getAttribute("data-node") === name); });
      highlightEdges(name);
      openPanel(name);
      if (center) centerOn(name);
    }
    world.addEventListener("click", function (e) {
      if (moved) return;
      var f = e.target.closest(".nd__f[data-ref]");
      if (f) { select(f.getAttribute("data-ref"), true); return; }
      var card = e.target.closest(".nd");
      if (card) select(card.getAttribute("data-node"), true);
    });
    panel.addEventListener("click", function (e) {
      if (e.target.closest(".svx__close")) { panel.classList.remove("open"); highlightEdges(null); world.querySelectorAll(".nd.sel").forEach(function (n) { n.classList.remove("sel"); }); return; }
      var pt = e.target.closest(".svx__tab");
      if (pt) { panelTab = pt.getAttribute("data-ptab"); openPanel(selected || ROOT); return; }
      var ref = e.target.closest(".sv-ref");
      if (ref) { e.preventDefault(); select(decodeURIComponent(ref.getAttribute("href").slice(1)) || ROOT, true); }
    });
    fit();
  }

  /* ======================================================================
     Init: deep-link #modelName opens root -> that model in the explorer
     ====================================================================== */
  var h0 = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  if (h0 && defs[h0]) path.push({ prop: h0, name: h0, node: defs[h0], sel: null });
  renderExplorer();
  showView("explorer");
})();
