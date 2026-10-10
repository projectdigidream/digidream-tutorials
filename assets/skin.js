// Puts the reader's chosen skin on the page before it paints. Loaded without
// `defer`, right after assets/skins/skins.js (the generated list of the
// shipped uikit skins and their modes). The choice is a skin and a mode;
// mode "auto" picks the skin's first dark or light mode to match the system.
// Sets data-skin and data-skin-mode (what skins.css keys on) and data-theme
// (dark or light, which the canvas demos watch to repaint).
(function () {
  'use strict';
  const KEY = 'dnp-tut:';
  const get = (k, d) => { try { const v = localStorage.getItem(KEY + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const put = (k, v) => { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch { /* private window: this visit only */ } };
  const skins = window.DNP_SKINS || [];
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: true };
  let mem = null; // when storage refuses, remember for this page at least

  // The light/dark switch of the first version of the site, carried over.
  if (get('mode', null) === null) { const t = get('theme', 'auto'); if (t === 'dark' || t === 'light') put('mode', t); }

  function choice() { return mem || { skin: get('skin', 'claude'), mode: get('mode', 'auto') }; }
  function resolve(skinId, mode) {
    const s = skins.find(x => x.id === skinId) || skins.find(x => x.id === 'claude') || skins[0];
    if (!s) return null;
    let m = s.modes.find(x => x.id === mode);
    if (!m) m = s.modes.find(x => x.dark === mq.matches) || s.modes[0];
    return { skin: s, mode: m };
  }
  function apply() {
    const c = choice(), r = resolve(c.skin, c.mode);
    if (!r) return;
    const el = document.documentElement;
    el.setAttribute('data-skin', r.skin.id);
    el.setAttribute('data-skin-mode', r.mode.id);
    el.setAttribute('data-theme', r.mode.dark ? 'dark' : 'light');
    document.dispatchEvent(new CustomEvent('dnp-skin', { detail: r }));
  }
  window.DNPSkin = {
    list: skins,
    choice,
    resolved() { const c = choice(); return resolve(c.skin, c.mode); },
    set(skin, mode) { mem = { skin, mode }; put('skin', skin); put('mode', mode); apply(); },
  };
  if (mq.addEventListener) mq.addEventListener('change', () => { if (choice().mode === 'auto') apply(); });
  apply();
})();
