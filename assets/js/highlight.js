/* OpenMock — tiny dependency-free syntax highlighter shared by the docs pages
 * and the schema viewer. Input is code read from element.innerHTML, where only
 * &, <, > are entity-escaped and quotes are literal. Strings are matched FIRST
 * (before any class="..." markup is inserted) so inserted attribute quotes are
 * never re-matched. Exposes window.OM.highlight(lang, html) / OM.highlightEl. */
(function () {
  "use strict";

  var STR = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;

  function yaml(raw) {
    return raw.split("\n").map(function (line) {
      var m = line.match(/^(\s*)(#.*)$/);
      if (m) return m[1] + '<span class="c">' + m[2] + "</span>";
      var out = line.replace(STR, '<span class="s">$1</span>');
      out = out.replace(/^(\s*)(-)(\s)/, '$1<span class="p">-</span>$3');
      out = out.replace(/^(\s*(?:<span class="p">-<\/span>\s)?)([A-Za-z0-9_.$\/-]+)(\s*:)(\s|$)/,
        function (_, pre, key, colon, tail) { return pre + '<span class="k">' + key + '</span><span class="p">:</span>' + tail; });
      out = out.replace(/(<span class="p">:<\/span>\s)(-?\d+(?:\.\d+)*)\b/g, '$1<span class="n">$2</span>');
      out = out.replace(/(<span class="p">:<\/span>\s)(true|false|null)\b/g, '$1<span class="b">$2</span>');
      if (out.indexOf('<span class="s">') === -1) out = out.replace(/(\s)(#.*)$/, '$1<span class="c">$2</span>');
      return out;
    }).join("\n");
  }

  function json(raw) {
    var out = raw.replace(/("(?:[^"\\]|\\.)*")(\s*:)?/g, function (_, str, colon) {
      return colon ? '<span class="k">' + str + "</span>" + colon : '<span class="s">' + str + "</span>";
    });
    out = out.replace(/(:\s*)(-?\d+(?:\.\d+)?)/g, '$1<span class="n">$2</span>');
    out = out.replace(/(:\s*)(true|false|null)\b/g, '$1<span class="b">$2</span>');
    return out;
  }

  var PROTO_KW = /\b(syntax|package|import|public|weak|option|message|service|rpc|returns|stream|repeated|optional|required|reserved|oneof|map|enum|extend|group)\b/g;
  var PROTO_TY = /\b(double|float|int32|int64|uint32|uint64|sint32|sint64|fixed32|fixed64|sfixed32|sfixed64|bool|string|bytes)\b/g;
  function proto(raw) {
    return raw.split("\n").map(function (line) {
      var m = line.match(/^(\s*)(\/\/.*)$/);
      if (m) return m[1] + '<span class="c">' + m[2] + "</span>";
      var hasStr = STR.test(line); STR.lastIndex = 0;
      var out = line.replace(STR, '<span class="s">$1</span>');
      out = out.replace(PROTO_KW, '<span class="kw">$1</span>');
      out = out.replace(PROTO_TY, '<span class="ty">$1</span>');
      out = out.replace(/(=\s*)(\d+)/g, '$1<span class="n">$2</span>');
      if (!hasStr) out = out.replace(/(\s)(\/\/.*)$/, '$1<span class="c">$2</span>');
      return out;
    }).join("\n");
  }

  var GQL_KW = /\b(type|input|enum|interface|union|scalar|schema|extend|implements|directive|query|mutation|subscription|fragment|on)\b/g;
  function graphql(raw) {
    return raw.split("\n").map(function (line) {
      var m = line.match(/^(\s*)(#.*)$/);
      if (m) return m[1] + '<span class="c">' + m[2] + "</span>";
      var hasStr = STR.test(line); STR.lastIndex = 0;
      var out = line.replace(STR, '<span class="s">$1</span>');
      out = out.replace(GQL_KW, '<span class="kw">$1</span>');
      out = out.replace(/(@\w+)/g, '<span class="ty">$1</span>');
      if (!hasStr) out = out.replace(/(\s)(#.*)$/, '$1<span class="c">$2</span>');
      return out;
    }).join("\n");
  }

  function bash(raw) {
    return raw.split("\n").map(function (line) {
      var m = line.match(/^(\s*)(#.*)$/);
      if (m) return m[1] + '<span class="c">' + m[2] + "</span>";
      var out = line.replace(STR, '<span class="s">$1</span>');
      out = out.replace(/(^|\s)(--?[A-Za-z][\w-]*)/g, '$1<span class="ty">$2</span>');
      if (out.indexOf('<span class="s">') === -1) out = out.replace(/(\s)(#.*)$/, '$1<span class="c">$2</span>');
      return out;
    }).join("\n");
  }

  var MAP = { yaml: yaml, yml: yaml, json: json, protobuf: proto, proto: proto, graphql: graphql, gql: graphql, bash: bash, sh: bash, console: bash, shell: bash };

  window.OM = window.OM || {};
  window.OM.highlight = function (lang, escapedHtml) {
    var f = MAP[(lang || "").toLowerCase()];
    return f ? f(escapedHtml) : escapedHtml;
  };
  window.OM.highlightEl = function (code) {
    var lang = (code.className.match(/language-(\w+)/) || [])[1] || code.getAttribute("data-lang") || "";
    var f = MAP[lang.toLowerCase()];
    if (f) code.innerHTML = f(code.innerHTML);
  };
})();
