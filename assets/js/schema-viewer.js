/* OpenMock — interactive JSON Schema viewer.
 * Reads the embedded schema (#schema-data) and renders a master/detail
 * explorer: a searchable model list, and a detail pane with Properties
 * (drill into referenced child models), a relationship Graph, and Source.
 * Dependency-free; uses window.OM.highlight for the source view. */
(function () {
  "use strict";

  var dataEl = document.getElementById("schema-data");
  var listEl = document.getElementById("sv-models");
  var detailEl = document.getElementById("sv-detail");
  var searchEl = document.getElementById("sv-search");
  if (!dataEl || !listEl || !detailEl) return;

  var schema = JSON.parse(dataEl.textContent);
  var defs = schema.$defs || {};

  var ROOT = "__root__";
  function nodeOf(name) { return name === ROOT ? schema : defs[name]; }
  function labelOf(name) { return name === ROOT ? "OpenMock document" : name; }

  var GROUPS = [
    { title: "Document", names: [ROOT] },
    { title: "Metadata", names: ["info", "serverName", "serverPort"] },
    { title: "Servers", names: ["httpServer", "grpcServer", "graphqlServer", "websocketServer"] },
    { title: "Operations", names: ["httpOperation", "grpcUnaryOperation", "grpcStreamOperation", "graphqlOperation", "websocketOperation"] },
    { title: "Scenarios", names: ["httpScenario", "grpcUnaryScenario", "grpcStreamScenario", "graphqlScenario", "websocketScenario"] },
    { title: "Request matching (when)", names: ["httpWhen", "grpcWhen", "graphqlWhen", "websocketWhen", "callsMatcher"] },
    { title: "Responses", names: ["httpResponse", "grpcUnaryResponse", "grpcStreamResponse", "graphqlResponse", "graphqlError", "websocketResponse", "grpcStatus"] },
    { title: "Matchers & helpers", names: ["stringMap", "existsMatcher", "patternMatcher", "valueMatcher", "matcherMap", "payloadMatcher", "queryMatcherMap", "headerMap"] },
  ];
  // Any defs not grouped above land in "Other".
  (function () {
    var placed = {};
    GROUPS.forEach(function (g) { g.names.forEach(function (n) { placed[n] = 1; }); });
    var other = Object.keys(defs).filter(function (d) { return !placed[d]; });
    if (other.length) GROUPS.push({ title: "Other", names: other });
  })();

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function refName(ref) { return ref.replace("#/$defs/", ""); }

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
  var outgoing = {}, incoming = {};
  [ROOT].concat(Object.keys(defs)).forEach(function (n) { outgoing[n] = Object.keys(collectRefs(nodeOf(n), {})); });
  Object.keys(outgoing).forEach(function (from) {
    outgoing[from].forEach(function (to) { (incoming[to] = incoming[to] || []).push(from); });
  });

  /* ---- Type labels & constraints ---------------------------------------- */
  function refLink(name) { return '<a class="sv-ref" href="#' + name + '">' + esc(name) + "</a>"; }
  function typeLabel(node) {
    if (!node) return "any";
    if (node.$ref) return refLink(refName(node.$ref));
    if (node.const !== undefined) return "const";
    if (node.enum) return "enum";
    if (node.oneOf) return node.oneOf.map(typeLabel).join(" | ");
    if (node.anyOf) return node.anyOf.map(typeLabel).join(" | ");
    if (node.allOf) return "object";
    if (node.type === "array") return "array&lt;" + typeLabel(node.items || {}) + "&gt;";
    if (Array.isArray(node.type)) return node.type.join(" | ");
    if (node.type) return node.type;
    if (node.properties || node.additionalProperties) return "object";
    return "any";
  }
  // The single model a property drills into, if any.
  function drillTarget(node) {
    if (!node) return null;
    if (node.$ref) return refName(node.$ref);
    if (node.type === "array" && node.items && node.items.$ref) return refName(node.items.$ref);
    if (node.additionalProperties && node.additionalProperties.$ref) return refName(node.additionalProperties.$ref);
    return null;
  }
  function chips(node) {
    var c = [];
    if (node.const !== undefined) c.push('<span class="chip"><b>const</b> ' + esc(JSON.stringify(node.const)) + "</span>");
    if (node.enum) c.push('<span class="chip chip--enum">' + node.enum.map(function (e) { return esc(JSON.stringify(e)); }).join(" · ") + "</span>");
    if (node.pattern) c.push('<span class="chip"><b>pattern</b> ' + esc(node.pattern) + "</span>");
    if (node.format) c.push('<span class="chip"><b>format</b> ' + esc(node.format) + "</span>");
    if (node.minimum !== undefined) c.push('<span class="chip"><b>min</b> ' + node.minimum + "</span>");
    if (node.maximum !== undefined) c.push('<span class="chip"><b>max</b> ' + node.maximum + "</span>");
    if (node.minItems !== undefined) c.push('<span class="chip"><b>minItems</b> ' + node.minItems + "</span>");
    if (node.default !== undefined) c.push('<span class="chip"><b>default</b> ' + esc(JSON.stringify(node.default)) + "</span>");
    if (node.additionalProperties === false) c.push('<span class="chip">no additional properties</span>');
    return c.length ? '<div class="prop__meta">' + c.join("") + "</div>" : "";
  }

  /* ---- Property list (with drill-down) ----------------------------------- */
  function propEntries(node) {
    var out = [];
    var req = node.required || [];
    var props = node.properties || {};
    Object.keys(props).forEach(function (k) { out.push({ name: k, node: props[k], required: req.indexOf(k) !== -1 }); });
    if (node.patternProperties && node.patternProperties["^x-"] !== undefined)
      out.push({ name: "x-*", node: { description: "Specification extension — any property starting with x- is allowed and ignored by validation." }, kind: "ext" });
    if (node.additionalProperties && typeof node.additionalProperties === "object")
      out.push({ name: "* (map value)", node: node.additionalProperties, kind: "map" });
    return out;
  }

  function propRow(entry) {
    var node = entry.node || {};
    var drill = drillTarget(node);
    var badge = entry.kind === "ext" ? '<span class="badge-opt">extension</span>'
      : entry.kind === "map" ? '<span class="badge-opt">map value</span>'
      : entry.required ? '<span class="badge-req">required</span>' : '<span class="badge-opt">optional</span>';
    var caret = drill ? '<button class="tp__exp" type="button" data-ref="' + esc(drill) + '" aria-label="Expand ' + esc(drill) + '"></button>' : '<span class="tp__nocaret"></span>';
    var desc = node.description ? '<p class="prop__desc">' + esc(node.description) + "</p>" : "";
    return '<div class="tp">' +
      '<div class="tp__row">' + caret +
      '<span class="prop__name">' + esc(entry.name) + "</span>" +
      '<span class="prop__type">' + typeLabel(node) + "</span>" + badge +
      "</div>" + desc + chips(node) +
      '<div class="tp__child" hidden></div>' +
      "</div>";
  }

  function modelBody(name) {
    var node = nodeOf(name);
    if (!node) return '<p class="prop__desc">Unknown model.</p>';
    var entries = propEntries(node);
    if (entries.length) return entries.map(propRow).join("");
    // union / scalar / enum
    if (node.allOf || node.oneOf || node.anyOf) {
      var parts = node.allOf || node.oneOf || node.anyOf;
      var refs = parts.map(function (p) { return (p.then && p.then.$ref) || p.$ref; }).filter(Boolean).map(refName);
      return '<div class="tp"><div class="tp__row"><span class="tp__nocaret"></span><span class="prop__desc">A discriminated shape — one of: ' +
        (refs.map(refLink).join(", ") || "see source") + ".</span></div></div>";
    }
    return '<div class="tp"><div class="tp__row"><span class="tp__nocaret"></span><span class="prop__type">' + typeLabel(node) + "</span></div>" + chips(node) + "</div>";
  }

  /* ---- Graph ------------------------------------------------------------- */
  function graphSvg(name) {
    var outs = (outgoing[name] || []).filter(function (n, i, a) { return a.indexOf(n) === i && n !== name; });
    var ins = (incoming[name] || []).filter(function (n, i, a) { return a.indexOf(n) === i && n !== name; });
    var CAP = 9;
    var outMore = Math.max(0, outs.length - CAP), inMore = Math.max(0, ins.length - CAP);
    outs = outs.slice(0, CAP); ins = ins.slice(0, CAP);
    var rows = Math.max(outs.length, ins.length, 1);
    var W = 900, rowH = 46, padY = 40;
    var H = padY * 2 + rows * rowH;
    var cx = W / 2, cy = H / 2;
    var nodeW = 190, nodeH = 30, colX_in = 20, colX_out = W - 20 - nodeW;

    function node(x, y, label, isCenter) {
      var cls = isCenter ? "g-node g-node--c" : "g-node";
      var href = isCenter ? "" : ' data-model="' + esc(label) + '"';
      var t = label.length > 24 ? label.slice(0, 23) + "…" : label;
      return '<g class="' + cls + '"' + href + ' transform="translate(' + x + ',' + y + ')">' +
        '<rect width="' + nodeW + '" height="' + nodeH + '" rx="7"/>' +
        '<text x="' + nodeW / 2 + '" y="' + (nodeH / 2 + 4) + '" text-anchor="middle">' + esc(t) + "</text></g>";
    }
    function edge(x1, y1, x2, y2) {
      var mx = (x1 + x2) / 2;
      return '<path class="g-edge" d="M' + x1 + " " + y1 + " C" + mx + " " + y1 + " " + mx + " " + y2 + " " + x2 + " " + y2 + '"/>';
    }
    var svg = [];
    // edges first
    ins.forEach(function (n, i) {
      var y = padY + i * rowH + nodeH / 2 + (rows - ins.length) * rowH / 2;
      svg.push(edge(colX_in + nodeW, y, cx - nodeW / 2, cy + nodeH / 2));
    });
    outs.forEach(function (n, i) {
      var y = padY + i * rowH + nodeH / 2 + (rows - outs.length) * rowH / 2;
      svg.push(edge(cx + nodeW / 2, cy + nodeH / 2, colX_out, y));
    });
    // nodes
    ins.forEach(function (n, i) {
      var y = padY + i * rowH + (rows - ins.length) * rowH / 2;
      svg.push(node(colX_in, y, n, false));
    });
    outs.forEach(function (n, i) {
      var y = padY + i * rowH + (rows - outs.length) * rowH / 2;
      svg.push(node(colX_out, y, n, false));
    });
    svg.push(node(cx - nodeW / 2, cy - nodeH / 2, labelOf(name), true));

    var legend = '<div class="g-legend"><span><b>' + ins.length + (inMore ? "+" : "") + "</b> referenced by</span>" +
      "<span><b>" + outs.length + (outMore ? "+" : "") + "</b> references</span></div>";
    if (!ins.length && !outs.length)
      return '<div class="sv-empty">This model has no references to or from other models.</div>';
    return legend + '<div class="g-scroll"><svg viewBox="0 0 ' + W + " " + H + '" class="g-svg" role="img" aria-label="Relationship graph for ' + esc(name) + '">' + svg.join("") + "</svg></div>";
  }

  /* ---- Source ------------------------------------------------------------ */
  function sourceHtml(name) {
    var raw = JSON.stringify(nodeOf(name), null, 2);
    var escd = esc(raw);
    var hl = (window.OM && window.OM.highlight) ? window.OM.highlight("json", escd) : escd;
    return '<div class="codeblock"><button class="codeblock__copy" type="button">Copy</button><pre><code>' + hl + "</code></pre></div>";
  }

  /* ---- Detail render ----------------------------------------------------- */
  var state = { model: ROOT, tab: "props" };

  function renderDetail() {
    var name = state.model, node = nodeOf(name);
    if (!node) { detailEl.innerHTML = '<div class="sv-empty">Unknown model: ' + esc(name) + "</div>"; return; }
    var typeStr = node.type ? (Array.isArray(node.type) ? node.type.join(" | ") : node.type) : (node.enum ? "enum" : (node.oneOf || node.allOf || node.anyOf ? "union" : "object"));
    var desc = node.description ? '<p class="sv__desc">' + esc(node.description) + "</p>" : "";
    var body;
    if (state.tab === "graph") body = graphSvg(name);
    else if (state.tab === "source") body = sourceHtml(name);
    else body = '<div class="tp-tree">' + modelBody(name) + "</div>";

    detailEl.innerHTML =
      '<header class="sv__head">' +
        '<h2>' + esc(labelOf(name)) + '<span class="sv__kind">' + esc(typeStr) + "</span></h2>" + desc +
      "</header>" +
      '<div class="sv__tabs" role="tablist">' +
        tabBtn("props", "Properties") + tabBtn("graph", "Graph") + tabBtn("source", "Source") +
      "</div>" +
      '<div class="sv__panel">' + body + "</div>";

    // wire copy buttons in source panel
    detailEl.querySelectorAll(".codeblock__copy").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var pre = btn.parentNode.querySelector("pre");
        if (pre && navigator.clipboard) navigator.clipboard.writeText(pre.innerText).then(function () {
          var t = btn.textContent; btn.textContent = "Copied!"; setTimeout(function () { btn.textContent = t; }, 1500);
        });
      });
    });
    detailEl.scrollTop = 0;
  }
  function tabBtn(id, label) {
    return '<button class="sv__tab' + (state.tab === id ? " active" : "") + '" type="button" data-tab="' + id + '">' + label + "</button>";
  }

  /* ---- Model list -------------------------------------------------------- */
  function renderList() {
    listEl.innerHTML = GROUPS.map(function (g) {
      var items = g.names.filter(function (n) { return n === ROOT || defs[n]; });
      if (!items.length) return "";
      return '<div class="sv__group"><p class="sv__group-t">' + esc(g.title) + "</p>" +
        items.map(function (n) {
          return '<a class="sv__item' + (n === state.model ? " active" : "") + '" href="#' + (n === ROOT ? "" : n) + '" data-model="' + esc(n) + '">' + esc(labelOf(n)) + "</a>";
        }).join("") + "</div>";
    }).join("");
  }

  function filterList(q) {
    q = (q || "").toLowerCase().trim();
    listEl.querySelectorAll(".sv__group").forEach(function (grp) {
      var any = false;
      grp.querySelectorAll(".sv__item").forEach(function (a) {
        var show = !q || a.textContent.toLowerCase().indexOf(q) !== -1;
        a.style.display = show ? "" : "none";
        if (show) any = true;
      });
      grp.style.display = any ? "" : "none";
    });
  }

  /* ---- Events ------------------------------------------------------------ */
  function selectFromHash() {
    var h = decodeURIComponent((location.hash || "").replace(/^#/, ""));
    state.model = (h && defs[h]) ? h : ROOT;
    state.tab = "props";
    renderList();
    renderDetail();
  }

  // Model links (list + inline refs) go through the hash.
  document.addEventListener("click", function (e) {
    var tab = e.target.closest && e.target.closest(".sv__tab");
    if (tab) { state.tab = tab.getAttribute("data-tab"); renderDetail(); return; }

    var exp = e.target.closest && e.target.closest(".tp__exp");
    if (exp) {
      var child = exp.closest(".tp").querySelector(".tp__child");
      var ref = exp.getAttribute("data-ref");
      if (child.hidden && !child.dataset.loaded) { child.innerHTML = modelBody(ref); child.dataset.loaded = "1"; }
      child.hidden = !child.hidden;
      exp.classList.toggle("open", !child.hidden);
      return;
    }

    var g = e.target.closest && e.target.closest("[data-model]");
    if (g && (g.classList.contains("g-node") || g.tagName === "A" && g.classList.contains("sv-ref") === false)) {
      var m = g.getAttribute("data-model");
      if (m) { location.hash = m === ROOT ? "#" : "#" + m; }
    }
  });

  window.addEventListener("hashchange", selectFromHash);
  if (searchEl) searchEl.addEventListener("input", function () { filterList(searchEl.value); });

  selectFromHash();
})();
