// mode-bg.js — a background for each part of the web app, picked in the
// Appearance menu (theme.js calls window.knoxModeBgMenu(menu) when it opens).
// Saved on this device for Light and Dark separately, per part:
//   localStorage 'knoxModeBg.v1' = { light: { ask, learn, cards, binder }, dark: { … } }
// mode-bg.css paints body[data-mb] behind the home screen and the chat.
(function () {
  const KEY = 'knoxModeBg.v1';
  const PARTS = { ask: 'Ask Knox', learn: 'Learn', cards: 'Flashcards', binder: 'Binder' };
  const LOOKS = {
    light: [['classic', 'Classic'], ['white', 'White'], ['orange', 'Orange'], ['purple', 'Purple'], ['green', 'Green'], ['blue', 'Blue'], ['yellow', 'Yellow'], ['red', 'Red']],
    dark:  [['classic', 'Classic'], ['dark', 'Dark'], ['orange', 'Ember'], ['purple', 'Galaxy'], ['green', 'Forest'], ['blue', 'Ocean'], ['yellow', 'Gold'], ['red', 'Berry']],
  };
  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } };
  const theme = () => document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const part = () => {
    const c = document.body.classList;
    return c.contains('knox-flashcards') ? 'cards' : (c.contains('knox-notes') || c.contains('knox-sims')) ? 'binder' : c.contains('knox-learn-mode') ? 'learn' : 'ask';
  };
  const chosen = () => {
    const t = theme(), k = (read()[t] || {})[part()];
    return LOOKS[t].some(l => l[0] === k) ? k : 'classic';
  };
  let section = null;
  function apply() {
    const k = chosen();
    if (document.body.dataset.mb !== k) document.body.dataset.mb = k;
    render();
  }
  function choose(k) {
    const all = read(), t = theme();
    all[t] = Object.assign({}, all[t], { [part()]: k });
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (_) { /* still applies for this visit */ }
    apply();
  }
  function render() {
    if (!section) return;
    const t = theme(), name = PARTS[part()], cur = chosen();
    section.innerHTML = '<div class="ktm-title">Background · ' + name + '</div>' +
      '<div class="ktm-swatches" role="group" aria-label="Background for ' + name + '">' +
      LOOKS[t].map(([k, n]) => '<button type="button" class="ktm-sw" data-mb="' + k + '" aria-pressed="' + (k === cur) + '" title="' + n + '"><span class="ktm-sw-art" aria-hidden="true"></span>' + n + '</button>').join('') +
      '</div><p class="ktm-note">Each part of Knox keeps its own background, in Light and in Dark.</p>';
  }
  window.knoxModeBgMenu = function (menu) {
    if (!section) {
      section = document.createElement('div');
      section.className = 'ktm-bg';
      section.addEventListener('click', e => { const b = e.target.closest('.ktm-sw'); if (b) choose(b.dataset.mb); });
      menu.append(section);
    }
    render();
  };
  new MutationObserver(apply).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  apply();
})();
