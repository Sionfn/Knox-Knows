// desktop-fit.js — keeps MacBook proportions on shorter laptop screens.
//
// Many Windows laptops (125–150% display scaling) give the page only
// ~520–650px of height, versus ~750–800px on a MacBook. Instead of
// squeezing individual pieces, scale the whole page down evenly so it is
// laid out exactly as on a MacBook-height window. Phones and tablets
// (≤900px wide) and tall screens are never touched.
//
// CSS zoom also shrinks vh units, so full-height rules divide by --kz, and
// script that positions things from getBoundingClientRect() divides by
// window.knoxZoom.
(function () {
  var REF_HEIGHT = 800; // a MacBook Air browser window height, in CSS px
  var MIN_ZOOM = 0.65;
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
  }
  fit();
  addEventListener('resize', fit);
})();
