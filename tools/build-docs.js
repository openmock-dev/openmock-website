/* Build the OpenMock docs pages (Spec, Schema, Examples, Serving) as static
 * HTML from the source content in ./content. Run: `node tools/build-docs.js`
 * from the repo root. Requires `marked` (dev-only: npm i marked).
 *
 * Output: spec.html, schema.html, examples.html, serving.html at repo root,
 * plus a copy of the JSON Schema at openmock-0.2.0.json.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { marked } = require("marked");

const ROOT = path.resolve(__dirname, "..");
const CONTENT = path.join(ROOT, "content");
const read = (p) => fs.readFileSync(p, "utf8");
const write = (name, html) => { fs.writeFileSync(path.join(ROOT, name), html); console.log("wrote", name); };

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const attr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

// GitHub-compatible heading slug so the spec's own #anchors resolve.
function slug(text) {
  return text.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
}

/* --------------------------------------------------------------------------
   Shared chrome (nav + footer). Kept in sync with index.html.
   `base` prefixes homepage section anchors ("" on the homepage, "index.html"
   on subpages). `active` highlights the current top-level doc.
   -------------------------------------------------------------------------- */
const ICONS = {
  sun: '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  gh: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/></svg>',
  burger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
};

function nav(active, base) {
  base = base || "";
  const a = (id) => `${base}#${id}`;
  const on = (k) => (active === k ? ' aria-current="page"' : "");
  return `  <header class="nav">
    <div class="nav__inner">
      <a href="${base || "index.html"}" class="nav__brand" aria-label="OpenMock home">
        <img src="assets/img/icon.svg" alt="" width="26" height="26" />
        <span class="brand-word">open<b>mock</b></span>
      </a>
      <nav class="nav__links" aria-label="Primary">
        <a href="${a("how")}">How it works</a>
        <a href="${a("features")}">Features</a>
        <a href="spec.html"${on("spec")}>Spec</a>
        <a href="schema.html"${on("schema")}>Schema</a>
        <a href="examples.html"${on("examples")}>Examples</a>
        <a class="nav__mobile-only" href="https://github.com/openmock-dev/openmock">GitHub</a>
        <a class="nav__mobile-only nav__mobile-cta" href="${a("quickstart")}">Get started →</a>
      </nav>
      <div class="nav__actions">
        <button class="icon-btn theme-toggle" type="button" aria-label="Toggle color theme" title="Toggle theme">${ICONS.sun}${ICONS.moon}</button>
        <a class="icon-btn" href="https://github.com/openmock-dev/openmock" aria-label="OpenMock on GitHub" title="GitHub">${ICONS.gh}</a>
        <a class="btn btn--primary" href="${a("quickstart")}">Get started</a>
        <button class="icon-btn nav__burger" type="button" aria-label="Toggle menu">${ICONS.burger}</button>
      </div>
    </div>
  </header>`;
}

function footer() {
  return `  <footer class="footer">
    <div class="container">
      <div class="footer__grid footer__grid--docs">
        <div class="footer__brand">
          <a href="index.html" class="nav__brand" aria-label="OpenMock home">
            <img src="assets/img/icon.svg" alt="" width="26" height="26" />
            <span class="brand-word">open<b>mock</b></span>
          </a>
          <p>An open format for defining API mocks in a single, portable file. MIT licensed, community built.</p>
        </div>
        <div class="footer__col">
          <h4>Specification</h4>
          <a href="spec.html">Spec v0.2</a>
          <a href="schema.html">JSON Schema</a>
          <a href="examples.html">Examples</a>
          <a href="serving.html">Serving guide</a>
        </div>
        <div class="footer__col">
          <h4>Community</h4>
          <a href="https://github.com/openmock-dev/openmock">GitHub</a>
          <a href="https://github.com/openmock-dev/openmock/blob/main/CONTRIBUTING.md">Contributing</a>
          <a href="https://github.com/openmock-dev/openmock/issues">Issues</a>
          <a href="https://github.com/openmock-dev/openmock/blob/main/LICENSE">License (MIT)</a>
        </div>
      </div>
      <div class="footer__bottom">
        <span>© <span id="year">2026</span> OpenMock contributors. Released under the MIT License.</span>
        <div class="social">
          <a href="https://github.com/openmock-dev" aria-label="GitHub">${ICONS.gh}</a>
        </div>
      </div>
    </div>
  </footer>`;
}

function pageShell({ title, desc, active, hero, sidebar, main, rawContent, scripts }) {
  const inner = rawContent != null ? rawContent : `${hero}
    <div class="docs">
      <aside class="docs__side">
        <details class="docs__toc" open>
          <summary>On this page</summary>
          <p class="toc-title">On this page</p>
          <ul class="toc-list">
${sidebar}
          </ul>
        </details>
      </aside>
      <article class="docs__main">
${main}
      </article>
    </div>`;
  const extraScripts = (scripts || []).map((s) => `  <script src="${s}"></script>`).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${attr(desc)}" />
  <meta name="theme-color" content="#76C81D" />
  <link rel="icon" href="assets/img/icon.svg" type="image/svg+xml" />
  <script>(function(){try{var t=localStorage.getItem("om-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();</script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="assets/css/styles.css" />
  <link rel="stylesheet" href="assets/css/docs.css" />
</head>
<body>
${nav(active, "index.html")}
  <main>
${inner}
  </main>
${footer()}
  <script src="assets/js/highlight.js"></script>
  <script src="assets/js/main.js"></script>
  <script src="assets/js/docs.js"></script>
${extraScripts}
</body>
</html>
`;
}

function docHero(eyebrow, title, desc, meta) {
  const metaHtml = (meta || []).map((m) =>
    m.href ? `<a href="${attr(m.href)}">${m.label}</a>` : `<span>${m.label}</span>`).join("\n        ");
  return `    <section class="doc-hero">
      <div class="container">
        <span class="eyebrow">${escapeHtml(eyebrow)}</span>
        <h1>${title}</h1>
        <p>${desc}</p>
        <div class="doc-hero__meta">
        ${metaHtml}
        </div>
      </div>
    </section>`;
}

/* --------------------------------------------------------------------------
   Markdown pages (Spec, Serving)
   -------------------------------------------------------------------------- */
function rewriteLinks(md) {
  return md
    .replace(/\]\((?:\.\.?\/)?docs\/serving\.md\)/g, "](serving.html)")
    .replace(/\]\((?:\.\.?\/)?spec\/v0\.2\.md\)/g, "](spec.html)")
    .replace(/\]\((?:\.\.?\/)?schema\/openmock-0\.2\.0\.json\)/g, "](schema.html)")
    .replace(/\]\((?:\.\.?\/)?examples\/?\)/g, "](examples.html)")
    .replace(/\]\((?:\.\.?\/)?examples\)/g, "](examples.html)")
    .replace(/\]\((?:\.\.?\/)?conformance\/?\)/g, "](https://github.com/openmock-dev/openmock/tree/main/conformance)")
    .replace(/\]\((?:\.\.?\/)?conformance\/README\.md\)/g, "](https://github.com/openmock-dev/openmock/blob/main/conformance/README.md)")
    .replace(/\]\((?:\.\.?\/)?CONTRIBUTING\.md\)/g, "](https://github.com/openmock-dev/openmock/blob/main/CONTRIBUTING.md)")
    .replace(/\]\((?:\.\.?\/)?IMPLEMENTATIONS\.md\)/g, "](https://github.com/openmock-dev/openmock/blob/main/IMPLEMENTATIONS.md)")
    .replace(/\]\((?:\.\.?\/)?CHANGELOG\.md\)/g, "](https://github.com/openmock-dev/openmock/blob/main/CHANGELOG.md)")
    .replace(/\]\((?:\.\.?\/)?LICENSE\)/g, "](https://github.com/openmock-dev/openmock/blob/main/LICENSE)");
}

function renderMarkdown(md) {
  const html = marked.parse(md, { mangle: false, headerIds: false });
  const toc = [];
  const seen = {};
  const withIds = html.replace(/<h([234])>([\s\S]*?)<\/h\1>/g, (m, lvl, inner) => {
    let id = slug(inner);
    if (seen[id] != null) { seen[id]++; id = id + "-" + seen[id]; } else seen[id] = 0;
    if (lvl === "2" || lvl === "3") toc.push({ lvl: Number(lvl), id, text: inner });
    return `<h${lvl} id="${id}">${inner}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${lvl}>`;
  });
  return { html: withIds, toc };
}

function tocHtml(toc) {
  return toc.map((t) =>
    `            <li><a class="lvl-${t.lvl}" href="#${t.id}">${t.text.replace(/<a class="anchor"[\s\S]*?<\/a>/, "")}</a></li>`
  ).join("\n");
}

function buildSpec() {
  let md = read(path.join(CONTENT, "spec.md"));
  md = md.replace(/^#\s+OpenMock Specification\s*\n/, ""); // title lives in the hero
  md = rewriteLinks(md);
  const { html, toc } = renderMarkdown(md);
  const hero = docHero("Specification", "OpenMock Specification <span class=\"gradient-text\">v0.2</span>",
    "The normative specification for the OpenMock format: file structure, request matching, response shaping, delays, and templating across HTTP, gRPC, GraphQL, and WebSocket.",
    [
      { label: "Draft · v0.2" },
      { label: "Download Markdown", href: "https://github.com/openmock-dev/openmock/blob/main/spec/v0.2.md" },
      { label: "JSON Schema", href: "schema.html" },
    ]);
  write("spec.html", pageShell({
    title: "OpenMock Specification v0.2", desc: "The OpenMock format specification: servers, operations, scenarios, matching, responses, and templating across HTTP, gRPC, GraphQL, and WebSocket.",
    active: "spec", hero, sidebar: tocHtml(toc), main: `<div class="prose">\n${html}\n</div>`,
  }));
}

function buildServing() {
  let md = read(path.join(CONTENT, "serving.md"));
  md = md.replace(/^#\s+.*\n/, "");
  md = rewriteLinks(md);
  const { html, toc } = renderMarkdown(md);
  const hero = docHero("Guide", "Serving OpenMock documents",
    "Recommended practice for the implementations around the spec: port resolution, the discovery/admin API, and embedding the engine. Non-normative.",
    [{ label: "Non-normative" }, { label: "openmock-go", href: "https://github.com/openmock-dev/openmock-go" }]);
  write("serving.html", pageShell({
    title: "Serving OpenMock documents", desc: "Recommended serving practice for OpenMock: port resolution, the admin/discovery API, and embedding the engine.",
    active: null, hero, sidebar: tocHtml(toc), main: `<div class="prose">\n${html}\n</div>`,
  }));
}

/* --------------------------------------------------------------------------
   Examples page
   -------------------------------------------------------------------------- */
const GRPC_DESCRIPTOR_CMD = `# The gRPC server's \`descriptorSet\` (spec §3.4) is the compiled
# FileDescriptorSet the transport uses to decode/encode protobuf.
# Generate it from the .proto with protoc:
protoc \\
  --descriptor_set_out=06-grpc.binpb \\
  --include_imports \\
  06-grpc.proto`;

const EXAMPLES = [
  { file: "01-minimal.yml", extra: null },
  { file: "02-scenarios-when.yml", extra: null },
  { file: "03-templating-faker.yml", extra: null },
  { file: "04-delays-errors.yml", extra: null },
  { file: "05-polling-calls.yml", extra: null },
  { file: "06-grpc.yml", extra: { file: "06-grpc.proto", lang: "protobuf", label: "Protobuf schema (06-grpc.proto)" }, cmd: { code: GRPC_DESCRIPTOR_CMD, lang: "bash", label: "Generate the descriptor set (06-grpc.binpb)" } },
  { file: "07-graphql.yml", extra: { file: "07-graphql.graphql", lang: "graphql", label: "GraphQL schema (07-graphql.graphql)" } },
  { file: "08-websocket.yml", extra: null },
];

function metaFromYaml(src) {
  const title = (src.match(/^\s*title:\s*(.+)$/m) || [])[1] || "";
  const desc = (src.match(/^\s*description:\s*(.+)$/m) || [])[1] || "";
  return { title: title.trim(), desc: desc.trim() };
}

function rawCodeblock(src, lang, style) {
  return `<div class="codeblock"${style ? ` style="${style}"` : ""}>
              <button class="codeblock__copy" type="button">Copy</button>
              <pre><code class="language-${lang}">${escapeHtml(src)}</code></pre>
            </div>`;
}

function codeblock(src, lang, extra, cmd) {
  let html = `        <div class="codeblock">
          <button class="codeblock__copy" type="button">Copy</button>
          <pre><code class="language-${lang}">${escapeHtml(src)}</code></pre>`;
  if (cmd) {
    html += `
          <details open>
            <summary>${escapeHtml(cmd.label)}</summary>
            ${rawCodeblock(cmd.code, cmd.lang, "margin-top:8px")}
          </details>`;
  }
  if (extra) {
    html += `
          <details>
            <summary>${escapeHtml(extra.label)}</summary>
            ${rawCodeblock(extra.src, extra.lang, "margin-top:8px")}
          </details>`;
  }
  html += `
        </div>`;
  return html;
}

function buildExamples() {
  const items = EXAMPLES.map((ex) => {
    const src = read(path.join(CONTENT, "examples", ex.file));
    const meta = metaFromYaml(src);
    const id = "ex-" + ex.file.replace(/\.yml$/, "");
    let extra = null;
    if (ex.extra) extra = Object.assign({}, ex.extra, { src: read(path.join(CONTENT, "examples", ex.extra.file)) });
    return { id, file: ex.file, title: meta.title || ex.file, desc: meta.desc, src, extra, cmd: ex.cmd || null };
  });

  const sidebar = items.map((it) => `            <li><a class="lvl-2" href="#${it.id}">${escapeHtml(it.title)}</a></li>`).join("\n");
  const main = `<div class="prose"><p>Eight worked <code>openmock.yml</code> documents, from a minimal REST mock to a two-server gRPC topology. Each one runs with the <a href="https://github.com/openmock-dev/openmock-go">openmock-go</a> reference server. Copy any of them and adapt.</p></div>\n` +
    items.map((it) => `      <section class="example" id="${it.id}">
        <div class="example__head">
          <span class="example__badge">${escapeHtml(it.file)}</span>
          <h2 id="${it.id}-h">${escapeHtml(it.title)}</h2>
          <p>${escapeHtml(it.desc)}</p>
        </div>
${codeblock(it.src, "yaml", it.extra, it.cmd)}
      </section>`).join("\n");

  const hero = docHero("Examples", "OpenMock <span class=\"gradient-text\">examples</span>",
    "Runnable example documents covering scenarios, templating, delays, stateful polling, and all four protocols.",
    [{ label: "8 documents" }, { label: "On GitHub", href: "https://github.com/openmock-dev/openmock/tree/main/examples" }]);
  write("examples.html", pageShell({
    title: "OpenMock Examples", desc: "Runnable OpenMock example documents: scenarios, templating, delays, polling, and HTTP/gRPC/GraphQL/WebSocket.",
    active: "examples", hero, sidebar, main,
  }));
}

/* --------------------------------------------------------------------------
   JSON Schema viewer
   -------------------------------------------------------------------------- */
function refName(ref) { return ref.replace("#/$defs/", ""); }

function typeHtml(node) {
  if (!node) return "any";
  if (node.$ref) { const n = refName(node.$ref); return `<a href="#def-${n}">${n}</a>`; }
  if (node.const !== undefined) return `const`;
  if (node.enum) return "enum";
  if (node.oneOf) return node.oneOf.map(typeHtml).join(" | ");
  if (node.anyOf) return node.anyOf.map(typeHtml).join(" | ");
  if (node.allOf) return "object";
  if (node.type === "array") return "array&lt;" + typeHtml(node.items || {}) + "&gt;";
  if (Array.isArray(node.type)) return node.type.join(" | ");
  if (node.type) return node.type;
  if (node.properties || node.additionalProperties) return "object";
  return "any";
}

function constraintChips(node) {
  const chips = [];
  if (node.const !== undefined) chips.push(`<span class="chip"><b>const</b> ${escapeHtml(JSON.stringify(node.const))}</span>`);
  if (node.enum) chips.push(`<span class="chip chip--enum">${node.enum.map((e) => escapeHtml(JSON.stringify(e))).join(" · ")}</span>`);
  if (node.pattern) chips.push(`<span class="chip"><b>pattern</b> ${escapeHtml(node.pattern)}</span>`);
  if (node.format) chips.push(`<span class="chip"><b>format</b> ${escapeHtml(node.format)}</span>`);
  if (node.minimum !== undefined) chips.push(`<span class="chip"><b>min</b> ${node.minimum}</span>`);
  if (node.maximum !== undefined) chips.push(`<span class="chip"><b>max</b> ${node.maximum}</span>`);
  if (node.minItems !== undefined) chips.push(`<span class="chip"><b>minItems</b> ${node.minItems}</span>`);
  if (node.default !== undefined) chips.push(`<span class="chip"><b>default</b> ${escapeHtml(JSON.stringify(node.default))}</span>`);
  if (node.additionalProperties === false) chips.push(`<span class="chip">no additional properties</span>`);
  return chips.length ? `<div class="prop__meta">${chips.join("")}</div>` : "";
}

function propRow(name, node, required) {
  const desc = node.description ? `<p class="prop__desc">${escapeHtml(node.description)}</p>` : "";
  const badge = required
    ? `<span class="badge-req">required</span>`
    : `<span class="badge-opt">optional</span>`;
  return `          <div class="prop">
            <div class="prop__row">
              <span class="prop__name">${escapeHtml(name)}</span>
              <span class="prop__type">${typeHtml(node)}</span>
              ${badge}
            </div>
            ${desc}
            ${constraintChips(node)}
          </div>`;
}

function objectRows(node) {
  const req = node.required || [];
  const props = node.properties || {};
  let rows = Object.keys(props).map((k) => propRow(k, props[k], req.indexOf(k) !== -1)).join("\n");
  if (node.patternProperties && node.patternProperties["^x-"] !== undefined) {
    rows += `\n          <div class="prop">
            <div class="prop__row"><span class="prop__name">x-*</span><span class="prop__type">any</span><span class="badge-opt">extension</span></div>
            <p class="prop__desc">Specification extension. Any property whose name starts with <code>x-</code> is allowed and ignored by validation.</p>
          </div>`;
  }
  if (node.additionalProperties && typeof node.additionalProperties === "object") {
    rows += `\n          <div class="prop">
            <div class="prop__row"><span class="prop__name">*</span><span class="prop__type">${typeHtml(node.additionalProperties)}</span><span class="badge-opt">map value</span></div>
            <p class="prop__desc">Additional properties (map entries) of the type above.</p>
          </div>`;
  }
  return rows;
}

function defCard(name, node) {
  let inner = "";
  if (node.allOf || node.oneOf || node.anyOf) {
    const parts = node.allOf || node.oneOf || node.anyOf;
    const refs = parts.map((p) => (p.then && p.then.$ref) || p.$ref).filter(Boolean).map(refName);
    inner = `          <div class="prop"><p class="prop__desc">A discriminated shape resolved to one of: ${refs.map((r) => `<a href="#def-${r}">${r}</a>`).join(", ") || "see below"}.</p></div>`;
    if (node.properties) inner = objectRows(node) + "\n" + inner;
  } else if (node.properties || node.patternProperties || (node.additionalProperties && typeof node.additionalProperties === "object")) {
    inner = objectRows(node);
  } else {
    inner = `          <div class="prop">${constraintChips(node) || '<p class="prop__desc">See type above.</p>'}</div>`;
  }
  const typeLabel = node.type ? escapeHtml(Array.isArray(node.type) ? node.type.join(" | ") : node.type) : (node.enum ? "enum" : "object");
  const desc = node.description ? `<p>${escapeHtml(node.description)}</p>` : "";
  return `        <div class="def" id="def-${name}">
          <div class="def__head">
            <h3>${escapeHtml(name)}<span class="def__type">${typeLabel}</span></h3>
            ${desc}
          </div>
          <div class="def__body">
${inner}
          </div>
        </div>`;
}

const SCHEMA_GROUPS = [
  { id: "metadata", title: "Metadata", defs: ["info", "serverName", "serverPort"] },
  { id: "servers", title: "Servers", defs: ["httpServer", "grpcServer", "graphqlServer", "websocketServer"] },
  { id: "operations", title: "Operations", defs: ["httpOperation", "grpcUnaryOperation", "grpcStreamOperation", "graphqlOperation", "websocketOperation"] },
  { id: "scenarios", title: "Scenarios", defs: ["httpScenario", "grpcUnaryScenario", "grpcStreamScenario", "graphqlScenario", "websocketScenario"] },
  { id: "matching", title: "Request matching (when)", defs: ["httpWhen", "grpcWhen", "graphqlWhen", "websocketWhen", "callsMatcher"] },
  { id: "responses", title: "Responses", defs: ["httpResponse", "grpcUnaryResponse", "grpcStreamResponse", "graphqlResponse", "graphqlError", "websocketResponse", "grpcStatus"] },
  { id: "helpers", title: "Matchers & helpers", defs: ["stringMap", "existsMatcher", "patternMatcher", "valueMatcher", "matcherMap", "payloadMatcher", "queryMatcherMap", "headerMap"] },
];

function buildSchema() {
  const schema = JSON.parse(read(path.join(CONTENT, "schema.json")));
  fs.copyFileSync(path.join(CONTENT, "schema.json"), path.join(ROOT, "openmock-0.2.0.json"));

  // Embed the schema for the client-side viewer. Escape "<" so the JSON can
  // never terminate the <script> element.
  const embedded = JSON.stringify(schema).replace(/</g, "\\u003c");

  const hero = docHero("JSON Schema", "OpenMock <span class=\"gradient-text\">schema explorer</span>",
    "Browse the OpenMock JSON Schema (draft 2020-12) column by column. Click a property to open the model it references. Switch to the diagram for the big picture, or read the raw source.",
    [
      { label: "draft 2020-12" },
      { label: "Download JSON", href: "openmock-0.2.0.json" },
      { label: "Read the spec", href: "spec.html" },
    ]);

  const rawContent = `${hero}
    <div class="svx">
      <div class="svx__bar">
        <div class="viewswitch" role="tablist" aria-label="Schema views">
          <button class="viewswitch__btn active" type="button" data-view="explorer">Explorer</button>
          <button class="viewswitch__btn" type="button" data-view="graph">Schema</button>
          <button class="viewswitch__btn" type="button" data-view="source">Source</button>
        </div>
        <span class="svx__hint" id="svx-hint">Click a property to open the referenced model in a new column</span>
      </div>
      <div class="svx__crumb" id="svx-crumb"></div>

      <div class="xp" id="view-explorer"></div>

      <div class="svx__canvas" id="view-graph" hidden>
        <div class="svx__world" id="svx-world">
          <svg class="svx__edges" id="svx-edges" xmlns="http://www.w3.org/2000/svg"></svg>
        </div>
        <div class="svx__zoom">
          <button id="svx-zoom-in" type="button" aria-label="Zoom in" title="Zoom in">+</button>
          <button id="svx-zoom-out" type="button" aria-label="Zoom out" title="Zoom out">−</button>
          <button id="svx-zoom-fit" type="button" aria-label="Fit to view" title="Fit to view">⊡</button>
        </div>
      </div>

      <div class="svx__srcview" id="view-source" hidden></div>

      <noscript>
        <div class="prose" style="padding:24px 0">
          <p>This interactive schema explorer needs JavaScript. You can still <a href="openmock-0.2.0.json">download the raw JSON Schema</a> or <a href="spec.html">read the specification</a>.</p>
        </div>
      </noscript>
    </div>
    <script type="application/json" id="schema-data">${embedded}</script>`;

  write("schema.html", pageShell({
    title: "OpenMock JSON Schema", desc: "Interactive explorer for the OpenMock JSON Schema (draft 2020-12): models, properties, relationship graph, and source.",
    active: "schema", hero, rawContent, scripts: ["assets/js/schema-viewer.js"],
  }));
}

buildSpec();
buildServing();
buildExamples();
buildSchema();
console.log("done");
