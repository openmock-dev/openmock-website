/* OpenMock docs — scrollspy, code highlighting, copy buttons.
   Runs after highlight.js (window.OM) and main.js. Dependency-free. */
(function () {
  "use strict";

  /* ---- Highlight every code block via the shared highlighter ------------- */
  if (window.OM && window.OM.highlightEl) {
    document.querySelectorAll("pre code").forEach(function (code) { window.OM.highlightEl(code); });
  }

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

  /* ---- Scrollspy --------------------------------------------------------- */
  var links = Array.prototype.slice.call(document.querySelectorAll(".toc-list a"));
  if (!links.length) return;

  var byId = {};
  var targets = [];
  links.forEach(function (a) {
    var id = decodeURIComponent((a.getAttribute("href") || "").replace(/^#/, ""));
    var el = id && document.getElementById(id);
    if (el) { byId[id] = a; targets.push(el); }
  });

  function setActive(a) {
    links.forEach(function (l) { l.classList.remove("active"); });
    if (a) a.classList.add("active");
  }

  // Clicking a link: activate it immediately and pause the spy until the
  // smooth-scroll settles, so the click never leaves the previous item active.
  var pausedUntil = 0;
  links.forEach(function (a) {
    a.addEventListener("click", function () {
      setActive(a);
      pausedUntil = Date.now() + 900;
    });
  });

  function onScroll() {
    if (Date.now() < pausedUntil) return;
    var line = 130; // px from the top of the viewport (clears the header)
    var current = null;
    for (var i = 0; i < targets.length; i++) {
      if (targets[i].getBoundingClientRect().top - line <= 1) current = targets[i]; else break;
    }
    if (!current) current = targets[0];
    if (current && byId[current.id]) setActive(byId[current.id]);
  }

  var ticking = false;
  window.addEventListener("scroll", function () {
    if (!ticking) { window.requestAnimationFrame(function () { onScroll(); ticking = false; }); ticking = true; }
  }, { passive: true });
  onScroll();
})();
