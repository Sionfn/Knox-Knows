// modal-click-guard.js — stops pop-ups closing by accident.
//
// Every pop-up (sign-in, settings, history, calculator, phone menus) closes
// when you click the dark backdrop around it. But if you press the mouse
// down INSIDE the pop-up — say, dragging across an email field to select
// and delete it — and let go just outside, the browser reports a "click" on
// the backdrop, and the pop-up closed with your typing in it.
//
// This lets a backdrop click through only when the press also started on
// that same backdrop. Backdrops are recognised as fixed, (nearly)
// full-screen elements, so ordinary buttons are never affected.
(function () {
  var pressedOn = null;
  document.addEventListener('pointerdown', function (e) { pressedOn = e.target; }, true);
  document.addEventListener('click', function (e) {
    var started = pressedOn;
    pressedOn = null;
    var el = e.target;
    if (!started || started === el || !(el instanceof Element)) return;
    if (getComputedStyle(el).position !== 'fixed') return;
    var r = el.getBoundingClientRect();
    if (r.width < innerWidth * 0.9 || r.height < innerHeight * 0.9) return;
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);
})();
