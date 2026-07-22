/* OpenMock docs — scrollspy, lightweight code highlighting, copy buttons.
   Runs after main.js (theme, mobile nav). Dependency-free. */
(function () {
  "use strict";

  /* ---- Lightweight YAML / JSON highlighter ------------------------------- */
  function esc(s) { return s; } // content is already HTML-escaped by the server

  function highlightYAML(raw) {
    return raw.split("\n").map(function (line) {
      // full-line comment
      var m = line.match(/^(\s*)(#.*)$/);
      if (m) return m[1] + '<span class="c">' + m[2] + "</span>";
      // list item dash
      var out = line.replace(/^(\s*)(-)(\s)/, '$1<span class="p">-</span>$3');
      // key:
      out = out.replace(/^(\s*(?:<span class="p">-<\/span>\s)?)([A-Za-z0-9_.$-]+)(:)(\s|$)/,
        function (_, pre, key, colon, tail) { return pre + '<span class="k">' + key + "</span><span class=\"p\">:</span>" + tail; });
      // trailing inline comment
      out = out.replace(/(\s)(#.*)$/, '$1<span class="c">$2</span>');
      // quoted strings — content is already HTML-escaped, so real quotes are
      // entities; matching only entities avoids corrupting inserted markup.
      out = out.replace(/(&quot;[^\n]*?&quot;|&#39;[^\n]*?&#39;)/g, '<span class="s">$1</span>');
      // booleans / null
      out = out.replace(/(:\s|\[|,\s*|- )(true|false|null)\b/g, '$1<span class="b">$2</span>');
      // bare numbers after a colon
      out = out.replace(/(<span class="p">:<\/span>\s)(-?\d+(?:\.\d+)*)/g, '$1<span class="n">$2</span>');
      return out;
    }).join("\n");
  }

  function highlightJSON(raw) {
    var out = raw.replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)?/g, function (_, str, colon) {
      if (colon) return '<span class="k">' + str + "</span>" + colon;
      return '<span class="s">' + str + "</span>";
    });
    out = out.replace(/\b(true|false|null)\b/g, '<span class="b">$1</span>');
    out = out.replace(/(:\s*)(-?\d+(?:\.\d+)?)/g, '$1<span class="n">$2</span>');
    return out;
  }

  document.querySelectorAll("pre code").forEach(function (code) {
    var cls = code.className || "";
    var lang = (cls.match(/language-(\w+)/) || [])[1] || code.getAttribute("data-lang") || "";
    var raw = code.innerHTML; // already entity-escaped
    if (lang === "yaml" || lang === "yml") code.innerHTML = highlightYAML(raw);
    else if (lang === "json") code.innerHTML = highlightJSON(raw);
  });

  /* ---- Copy buttons ------------------------------------------------------ */
  document.querySelectorAll(".codeblock__copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var pre = btn.parentNode.querySelector("pre");
      if (!pre) return;
      navigator.clipboard && navigator.clipboard.writeText(pre.innerText).then(function () {
        var t = btn.textContent; btn.textContent = "Copied!";
        setTimeout(function () { btn.textContent = t; }, 1500);
      });
    });
  });

  /* ---- Scrollspy: highlight the TOC link for the section in view --------- */
  var links = Array.prototype.slice.call(document.querySelectorAll(".toc-list a"));
  if (!links.length) return;
  var byId = {};
  var targets = [];
  links.forEach(function (a) {
    var id = decodeURIComponent((a.getAttribute("href") || "").replace(/^#/, ""));
    var el = id && document.getElementById(id);
    if (el) { byId[id] = a; targets.push(el); }
  });

  function onScroll() {
    var top = window.scrollY + 120;
    var current = null;
    for (var i = 0; i < targets.length; i++) {
      if (targets[i].offsetTop <= top) current = targets[i]; else break;
    }
    links.forEach(function (a) { a.classList.remove("active"); });
    if (current && byId[current.id]) {
      byId[current.id].classList.add("active");
    }
  }

  var ticking = false;
  window.addEventListener("scroll", function () {
    if (!ticking) { window.requestAnimationFrame(function () { onScroll(); ticking = false; }); ticking = true; }
  }, { passive: true });
  onScroll();
})();
