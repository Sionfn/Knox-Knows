// desktop-fit.js — keeps MacBook proportions on shorter laptop screens.
//
// Many Windows laptops (125–150% display scaling) give the page only
// ~520–650px of height, versus ~800px on a MacBook. Instead of squeezing
// individual pieces (which throws the proportions off — a tiny logo next to
// full-size text), scale the whole page evenly so it is laid out as in a
// MacBook-height window. Phones and tablets (≤900px wide) and tall screens
// are never touched.
//
// The scale never goes below MIN_ZOOM so text stays readable. When that
// floor still leaves the page a bit shorter than a MacBook window, the
// `knox-fit-short` class lets pages close up a little spacing (never
// shrinking logos or text on their own).
//
// CSS zoom also shrinks vh/vw units, so those rules divide by --kz, and
// script that positions things from getBoundingClientRect() divides by
// window.knoxZoom.
(function () {
  var REF_HEIGHT = 800; // a MacBook Air browser window height, in CSS px
  // Never shrink below this, so text stays comfortably readable on every
  // device. If a screen is shorter than this floor can fit, the page scrolls
  // naturally rather than cramming — better than tiny text.
  var MIN_ZOOM = 0.8;
  var root = document.documentElement;
  function fit() {
    var z = 1;
    if (innerWidth > 900 && innerHeight < REF_HEIGHT) {
      z = Math.max(MIN_ZOOM, innerHeight / REF_HEIGHT);
      z = Math.round(z * 1000) / 1000;
    }
    window.knoxZoom = z;
    root.style.zoom = z === 1 ? '' : String(z);
    root.style.setProperty('--kz', String(z));
    // Any scaled (short) desktop window: let pages tighten spacing so the
    // primary call-to-action stays on screen, in light mode too (the light
    // Halloween tip adds height). Spacing only — never logo/text size.
    root.classList.toggle('knox-fit-short', z < 1);
  }
  fit();
  addEventListener('resize', fit);
})();
