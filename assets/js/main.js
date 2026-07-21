/* OpenMock — openmock.dev
   Small, dependency-free enhancements: theme toggle, mobile nav, scroll reveal,
   copy-to-clipboard, and current-year stamping. */
(function () {
  "use strict";

  var root = document.documentElement;

  /* ---- Theme -------------------------------------------------------------
     The stored choice is applied by an inline script in <head> to avoid a
     flash; here we only wire up the toggle button. */
  function currentTheme() {
    var stored = null;
    try { stored = localStorage.getItem("om-theme"); } catch (e) {}
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function setTheme(mode) {
    root.setAttribute("data-theme", mode);
    try { localStorage.setItem("om-theme", mode); } catch (e) {}
  }

  var toggle = document.querySelector(".theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      setTheme(currentTheme() === "dark" ? "light" : "dark");
    });
  }

  /* ---- Mobile nav -------------------------------------------------------- */
  var burger = document.querySelector(".nav__burger");
  var links = document.querySelector(".nav__links");
  if (burger && links) {
    burger.addEventListener("click", function () {
      links.classList.toggle("open");
    });
    links.addEventListener("click", function (e) {
      if (e.target.tagName === "A") links.classList.remove("open");
    });
  }

  /* ---- Copy buttons ------------------------------------------------------ */
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-copy");
      navigator.clipboard && navigator.clipboard.writeText(text).then(function () {
        var prev = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(function () { btn.textContent = prev; }, 1600);
      });
    });
  });

  /* ---- Scroll reveal ----------------------------------------------------- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---- Year -------------------------------------------------------------- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
