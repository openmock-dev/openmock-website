/* OpenMock — schema explorer (modeled on schema.opencollection.com).
 * Three views over the embedded JSON Schema:
 *   Explorer — Miller columns: each column is a model's property list; clicking
 *              a reference opens that model as a new column to the right.
 *   Schema   — an interactive left-to-right expandable tree (node cards with
 *              +/- toggles, colored by type, elbow connectors), pan/zoom.
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

  /* ===== Shared model helpers =========================================== */
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
  function leafType(node) {
    if (!node) return "any";
    if (node.const !== undefined) return "const";
    if (node.enum) return "enum";
    if (node.type === "array") return "array";
    if (Array.isArray(node.type)) return node.type.join(" | ");
    if (node.type) return node.type;
    return "any";
  }
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
  function typeClass(node) {
    if (!node) return "gt--any";
    if (node.$ref) return "gt--obj";
    if (node.type === "array") return "gt--arr";
    if (node.enum) return "gt--enum";
    if (node.const !== undefined || node.type === "string") return "gt--str";
    if (node.type === "integer" || node.type === "number") return "gt--num";
    if (node.type === "boolean") return "gt--bool";
    if (node.oneOf || node.anyOf || node.allOf || node.properties || node.type === "object") return "gt--obj";
    return "gt--any";
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
  function rowsOf(node) {
    var out = [], req = node.required || [], props = node.properties || {};
    Object.keys(props).forEach(function (k) { out.push({ prop: k, node: props[k], required: req.indexOf(k) !== -1 }); });
    var union = node.oneOf || node.anyOf || (node.allOf && node.allOf.filter(function (p) { return p.if; }).length ? node.allOf : null);
    if (union) union.forEach(function (p) {
      var r = (p.then && p.then.$ref) || p.$ref;
      if (r) out.push({ prop: refName(r), node: { $ref: r }, branch: true });
    });
    if (node.additionalProperties && typeof node.additionalProperties === "object")
      out.push({ prop: "{ key }", node: node.additionalProperties, mapValue: true });
    if (node.patternProperties && node.patternProperties["^x-"] !== undefined)
      out.push({ prop: "x-*", node: { description: "Specification extension — properties starting with x- are allowed and ignored by validation." }, ext: true });
    return out;
  }

  /* ===== View switching ================================================= */
  var views = {
    explorer: document.getElementById("view-explorer"),
    graph: document.getElementById("view-graph"),
    source: document.getElementById("view-source"),
  };
  var hintEl = document.getElementById("svx-hint");
  var HINTS = {
    explorer: "Click a property to open the referenced model in a new column",
    graph: "Click ＋ to expand a model · drag to pan · scroll to zoom",
    source: "The complete schema document",
  };
  var graphInited = false, sourceInited = false;
  function showView(v) {
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

  /* ===== Explorer (Miller columns) ====================================== */
  var xp = views.explorer;
  var crumbEl = document.getElementById("svx-crumb");
  var path = [{ prop: "root", name: ROOT, node: schema }];

  function rowHtml(r, colIdx) {
    var t = targetOf(r.node);
    var right = '<span class="xr__type">' + esc(shortType(r.node));
    if (t && t.name) right += ' <span class="xr__ref">' + esc(t.name) + "</span>";
    right += "</span>" + (t ? '<span class="xr__arrow">→</span>' : "");
    var badge = r.required ? '<span class="xr__req" title="required">*</span>' : "";
    var desc = r.node && r.node.description ? '<p class="xr__desc">' + esc(r.node.description) + "</p>" : "";
    return '<div class="xr' + (t ? " xr--nav" : "") + '" data-col="' + colIdx + '" data-prop="' + esc(r.prop) + '">' +
      '<div class="xr__line">' + iconFor(r.node) + '<span class="xr__name">' + esc(r.prop) + badge + "</span>" + right + "</div>" + desc + chipHtml(r.node || {}) + "</div>";
  }
  function columnHtml(entry, idx) {
    var node = entry.node;
    var title = idx === 0 ? "root" : entry.prop + " → " + (entry.name || shortType(node));
    var rows = rowsOf(node);
    var body = "";
    if (idx > 0 && node.description) body += '<div class="xc__sec">Description</div><p class="xc__desc">' + esc(node.description) + "</p>";
    if (rows.length) body += '<div class="xc__sec">Properties</div>' + rows.map(function (r) { return rowHtml(r, idx); }).join("");
    else body += '<div class="xc__sec">Type</div><div class="xr"><div class="xr__line">' + iconFor(node) + '<span class="xr__name">' + esc(kindOf(node)) + "</span></div>" + chipHtml(node) + "</div>";
    return '<section class="xc" data-idx="' + idx + '"><header class="xc__head">' + iconFor(node) + '<b class="xc__title">' + esc(title) + '</b><span class="xc__kind">' + esc(kindOf(node)) + "</span>" +
      (idx > 0 ? '<button class="xc__close" type="button" aria-label="Close column">×</button>' : "") +
      '</header><div class="xc__scroll">' + body + "</div></section>";
  }
  function renderExplorer() {
    xp.innerHTML = path.map(columnHtml).join("");
    for (var i = 1; i < path.length; i++) {
      var col = xp.querySelector('.xc[data-idx="' + (i - 1) + '"]');
      if (!col) continue;
      var row = Array.prototype.find.call(col.querySelectorAll(".xr"), function (r) { return r.getAttribute("data-prop") === path[i].sel; });
      if (row) row.classList.add("sel");
    }
    renderCrumb();
    xp.scrollLeft = xp.scrollWidth;
    var last = path[path.length - 1];
    if (last.name && last.name !== ROOT) history.replaceState(null, "", "#" + last.name);
    else if (path.length === 1) history.replaceState(null, "", location.pathname + location.search);
  }
  function renderCrumb() {
    if (!crumbEl) return;
    crumbEl.innerHTML = path.map(function (e, i) {
      var label = i === 0 ? "root" : e.prop + " → " + (e.name || shortType(e.node));
      return '<button class="crumb" type="button" data-idx="' + i + '">' + esc(label) + "</button>";
    }).join('<span class="crumb__sep">/</span>');
  }
  xp.addEventListener("click", function (e) {
    var close = e.target.closest(".xc__close");
    if (close) { path = path.slice(0, Number(close.closest(".xc").getAttribute("data-idx"))); if (!path.length) path = [{ prop: "root", name: ROOT, node: schema }]; renderExplorer(); return; }
    var row = e.target.closest(".xr--nav");
    if (!row) return;
    var colIdx = Number(row.getAttribute("data-col")), propKey = row.getAttribute("data-prop");
    var r = rowsOf(path[colIdx].node).filter(function (x) { return x.prop === propKey; })[0];
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

  /* ===== Source ========================================================= */
  function initSource() {
    var raw = esc(JSON.stringify(schema, null, 2));
    var hl = (window.OM && window.OM.highlight) ? window.OM.highlight("json", raw) : raw;
    views.source.innerHTML = '<div class="codeblock"><button class="codeblock__copy" type="button">Copy</button><pre><code>' + hl + "</code></pre></div>";
    views.source.querySelector(".codeblock__copy").addEventListener("click", function () {
      var pre = views.source.querySelector("pre");
      if (navigator.clipboard) navigator.clipboard.writeText(pre.innerText).then(function () {
        var b = views.source.querySelector(".codeblock__copy"); var t = b.textContent; b.textContent = "Copied!"; setTimeout(function () { b.textContent = t; }, 1400);
      });
    });
  }

  /* ===== Schema — expandable tree ======================================= */
  function initGraph() {
    var canvas = views.graph;
    var world = document.getElementById("svx-world");
    var edgesSvg = document.getElementById("svx-edges");
    if (!canvas || !world || !edgesSvg) return;
    var nodesLayer = document.createElement("div");
    nodesLayer.className = "gt-layer";
    world.appendChild(nodesLayer);

    var nodes = {}, seq = 0;
    function make(parentKey, prop, sNode, isRoot) {
      var key = isRoot ? "root" : parentKey + "/" + prop + "#" + (seq++);
      var t = isRoot ? { name: ROOT, node: schema } : targetOf(sNode);
      var target = t && t.node ? t.node : null;
      nodes[key] = {
        key: key, parent: parentKey, prop: prop, schema: isRoot ? schema : sNode,
        target: target, targetName: t && t.name, expandable: !!(target && rowsOf(target).length),
        expanded: false, childKeys: [], isRoot: !!isRoot, tclass: typeClass(isRoot ? schema : sNode),
      };
      return key;
    }
    var rootKey = make(null, "root", schema, true);
    function ensureChildren(key) {
      var n = nodes[key];
      if (n.childKeys.length || !n.target) return;
      rowsOf(n.target).forEach(function (r) { n.childKeys.push(make(key, r.prop, r.node)); });
    }
    nodes[rootKey].expanded = true; ensureChildren(rootKey);

    var NW = 216, HGAP = 66, VGAP = 16;
    function nodeH(n) { return (!n.expanded && n.expandable) ? 58 : 44; }
    function layout() {
      function walk(key, depth, top) {
        var n = nodes[key]; n.x = depth * (NW + HGAP); n.w = NW; n.h = nodeH(n);
        if (!n.expanded || !n.childKeys.length) { n.y = top; return n.h + VGAP; }
        var y = top, first = null, last = 0;
        n.childKeys.forEach(function (ck) {
          var h = walk(ck, depth + 1, y);
          var c = nodes[ck]; if (first === null) first = c.y + c.h / 2; last = c.y + c.h / 2; y += h;
        });
        n.y = (first + last) / 2 - n.h / 2;
        return Math.max(y - top, n.h + VGAP);
      }
      walk(rootKey, 0, 0);
    }
    function visible() { var out = []; (function rec(k) { out.push(k); if (nodes[k].expanded) nodes[k].childKeys.forEach(rec); })(rootKey); return out; }

    function labelFor(n) {
      var s = n.schema;
      if (n.isRoot) return { icon: iconFor(schema), text: "root", sub: n.expanded ? "" : rowsOf(schema).length + " properties" };
      if (n.expandable) {
        var cnt = rowsOf(n.target).length;
        return { icon: iconFor(s), text: esc(n.prop), sub: n.expanded ? "" : cnt + " propert" + (cnt === 1 ? "y" : "ies") };
      }
      return { icon: iconFor(s), text: esc(n.prop) + '<span class="gt__t">:' + esc(leafType(s)) + "</span>", sub: "" };
    }

    function render() {
      layout();
      var keys = visible(), maxX = 0, maxY = 0, minY = 1e9;
      keys.forEach(function (k) { var n = nodes[k]; maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h); minY = Math.min(minY, n.y); });
      var offY = 40 - minY;
      var eh = "";
      keys.forEach(function (k) {
        var n = nodes[k]; if (!n.expanded) return;
        n.childKeys.forEach(function (ck) {
          var c = nodes[ck];
          var px = n.x + n.w, py = n.y + n.h / 2 + offY, cx = c.x, cy = c.y + c.h / 2 + offY, mx = px + (cx - px) / 2;
          eh += '<path class="gt-edge" d="M' + px + " " + py + " H" + mx + " V" + cy + " H" + cx + '"/>' +
            '<circle class="gt-dot" cx="' + px + '" cy="' + py + '" r="3"/><circle class="gt-dot" cx="' + cx + '" cy="' + cy + '" r="3"/>';
        });
      });
      edgesSvg.setAttribute("width", maxX + 60); edgesSvg.setAttribute("height", maxY + offY + 60); edgesSvg.innerHTML = eh;
      nodesLayer.innerHTML = keys.map(function (k) {
        var n = nodes[k], L = labelFor(n);
        return '<div class="gt ' + n.tclass + (n.expanded ? " open" : "") + '" data-key="' + k + '" style="left:' + n.x + "px;top:" + (n.y + offY) + "px;width:" + n.w + 'px">' +
          '<div class="gt__row">' + L.icon + '<span class="gt__name">' + L.text + "</span>" +
          (n.expandable ? '<button class="gt__tog" type="button" data-key="' + k + '" aria-label="Toggle">' + (n.expanded ? "−" : "+") + "</button>" : "") + "</div>" +
          (L.sub ? '<div class="gt__sub">' + L.sub + "</div>" : "") + "</div>";
      }).join("");
    }

    nodesLayer.addEventListener("click", function (e) {
      var el = e.target.closest(".gt__tog") || e.target.closest(".gt");
      if (!el) return;
      var n = nodes[el.getAttribute("data-key")];
      if (!n || !n.expandable) return;
      n.expanded = !n.expanded;
      if (n.expanded) ensureChildren(n.key);
      render();
    });

    /* pan / zoom */
    var tx = 0, ty = 0, scale = 1;
    function apply() { world.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")"; }
    function clampScale(s) { return Math.max(0.25, Math.min(2, s)); }
    function fit() {
      render();
      var w = Number(edgesSvg.getAttribute("width")), h = Number(edgesSvg.getAttribute("height"));
      var cw = canvas.clientWidth, ch = canvas.clientHeight, pad = 50;
      scale = clampScale(Math.min((cw - pad) / w, (ch - pad) / h, 1));
      tx = 30; ty = Math.max(20, (ch - h * scale) / 2); apply();
    }
    function zoomAt(cx, cy, f) { var ns = clampScale(scale * f); tx = cx - (cx - tx) * (ns / scale); ty = cy - (cy - ty) * (ns / scale); scale = ns; apply(); }
    canvas.addEventListener("wheel", function (e) { e.preventDefault(); var r = canvas.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 0.89); }, { passive: false });
    var dragging = false, sx = 0, sy = 0;
    function down(x, y, target) { if (target.closest && target.closest(".gt, .svx__zoom")) return; dragging = true; sx = x - tx; sy = y - ty; canvas.classList.add("grabbing"); }
    function mv(x, y) { if (!dragging) return; tx = x - sx; ty = y - sy; apply(); }
    function up() { dragging = false; canvas.classList.remove("grabbing"); }
    canvas.addEventListener("mousedown", function (e) { down(e.clientX, e.clientY, e.target); });
    window.addEventListener("mousemove", function (e) { mv(e.clientX, e.clientY); });
    window.addEventListener("mouseup", up);
    canvas.addEventListener("touchstart", function (e) { var t = e.touches[0]; down(t.clientX, t.clientY, e.target); }, { passive: true });
    canvas.addEventListener("touchmove", function (e) { if (dragging) { e.preventDefault(); var t = e.touches[0]; mv(t.clientX, t.clientY); } }, { passive: false });
    canvas.addEventListener("touchend", up);
    document.getElementById("svx-zoom-in").addEventListener("click", function () { var r = canvas.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1.2); });
    document.getElementById("svx-zoom-out").addEventListener("click", function () { var r = canvas.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 0.83); });
    document.getElementById("svx-zoom-fit").addEventListener("click", fit);
    fit();
  }

  /* ===== Init =========================================================== */
  var h0 = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  if (h0 && defs[h0]) path.push({ prop: h0, name: h0, node: defs[h0], sel: null });
  renderExplorer();
  showView("explorer");
})();
