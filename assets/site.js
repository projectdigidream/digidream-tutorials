// Digidream Studio tutorials: the page shell and the shared interactive bits.
// A page is just <article> plus markup conventions; this file builds the top
// bar, sidebar, pager, and wires steps, quizzes, screenshots, trainers,
// shortcut tables, search and the widgets (assets/widgets/<name>.js).
(function () {
  'use strict';
  const here = document.currentScript.src;
  const ASSETS = here.slice(0, here.lastIndexOf('/') + 1);
  const ROOT = ASSETS.replace(/assets\/$/, '');
  const NAV = window.DNP_NAV || [];
  const PAGES = NAV.flatMap(t => t.pages.map(p => ({ ...p, track: t })));
  const path = location.href.split(/[?#]/)[0];
  const rel = path.startsWith(ROOT) ? decodeURIComponent(path.slice(ROOT.length)) : '';
  const me = PAGES.find(p => p.file === rel) || null;
  // A track's own folder (sprites/, sprites/index.html) is its overview page.
  const hereTrack = me ? me.track : NAV.find(t => rel === t.id + '/' || rel === t.id + '/index.html') || null;
  window.DNP_HERE_TRACK = hereTrack;

  // ---------- storage (best effort: private windows may refuse) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('dnp-tut:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('dnp-tut:' + k, JSON.stringify(v)); } catch { /* fine */ } },
  };
  window.DNPStore = store;

  // ---------- shared audio: created only from a user gesture ----------
  let actx = null;
  window.DNPAudio = {
    ctx() {
      if (!actx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; actx = new C(); }
      if (actx.state === 'suspended') actx.resume();
      return actx;
    },
  };

  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v != null) el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  };
  window.DNPh = h;

  // ---------- progress ----------
  const pageDone = file => store.get('done:' + file, false);
  function trackPct(t) {
    const n = t.pages.filter(p => pageDone(p.file)).length;
    return Math.round(100 * n / t.pages.length);
  }

  // ---------- shell ----------
  function buildShell() {
    const article = document.querySelector('article');
    if (!article) return;
    const skinBtn = buildSkinPicker();
    const menuBtn = h('button', { class: 'iconbtn menubtn', 'aria-label': 'Menu', onclick: () => document.body.classList.toggle('nav-open') }, '☰');
    const search = buildSearch();
    const top = h('header', { class: 'topbar' },
      menuBtn,
      h('a', { class: 'brand', href: ROOT + 'index.html' }, h('img', { class: 'logo', src: ASSETS + 'logo.png', alt: '', width: 32, height: 32 }), 'Digidream Studio', h('small', {}, 'tutorials')),
      h('div', { class: 'spacer' }), search, skinBtn);

    const side = h('nav', { class: 'sidebar', 'aria-label': 'Tutorials' });
    NAV.forEach(t => {
      const open = hereTrack ? hereTrack.id === t.id : false;
      const det = h('details', open ? { open: '' } : {});
      det.append(h('summary', {}, h('span', {}, t.icon), t.title, h('span', { class: 'pct' }, t.id === 'reference' ? '' : trackPct(t) + '%')));
      const ol = h('ol');
      t.pages.forEach((p, i) => {
        const a = h('a', { href: ROOT + p.file, class: (p === me || (me && p.file === me.file) ? 'here ' : '') + (pageDone(p.file) ? 'done' : '') },
          h('span', { class: 'n' }, pageDone(p.file) ? '✓' : String(i + 1)), p.title);
        ol.append(h('li', {}, a));
      });
      det.append(ol);
      side.append(det);
    });
    side.append(h('div', { class: 'themes' }, 'Progress is kept in this browser only. ',
      h('a', { href: '#', onclick: e => { e.preventDefault(); if (confirm('Forget all ticked steps and finished pages?')) { try { Object.keys(localStorage).filter(k => k.startsWith('dnp-tut:') && !/^dnp-tut:(theme|skin|mode)$/.test(k)).forEach(k => localStorage.removeItem(k)); } catch {} location.reload(); } } }, 'Reset progress')));

    const main = h('main');
    if (hereTrack) {
      article.prepend(h('div', { class: 'crumbs' },
        h('a', { href: ROOT + 'index.html' }, 'Tutorials'), ' › ',
        me ? h('a', { href: ROOT + hereTrack.id + '/index.html' }, hereTrack.icon + ' ' + hereTrack.title) : hereTrack.icon + ' ' + hereTrack.title));
    }
    article.parentNode.insertBefore(top, article);
    const layout = h('div', { class: 'layout' }, side, main);
    top.after(layout);
    main.append(article);
    main.addEventListener('click', () => document.body.classList.remove('nav-open'));

    if (me) {
      const i = PAGES.indexOf(me);
      const prev = PAGES[i - 1], next = PAGES[i + 1];
      const pager = h('nav', { class: 'pager', 'aria-label': 'Next and previous' });
      if (prev) pager.append(h('a', { class: 'prev', href: ROOT + prev.file }, h('small', {}, '← ' + (prev.track === me.track ? 'Previous' : prev.track.title)), prev.title));
      if (next) pager.append(h('a', { class: 'next', href: ROOT + next.file }, h('small', {}, (next.track === me.track ? 'Next' : 'Next track: ' + next.track.title) + ' →'), next.title));
      article.append(pager);
      document.title = me.title + ' · ' + me.track.title + ' · Digidream Studio tutorials';
    }
  }

  // ---------- a track's overview page ----------
  // <div class="track-index"></div> on <track>/index.html: the track's lessons
  // with their progress, and a button to start or carry on.
  function trackIndex() {
    const el = document.querySelector('.track-index');
    if (!el || !hereTrack) return;
    const t = hereTrack;
    const h1 = document.querySelector('article h1');
    if (h1 && !h1.textContent.trim()) h1.textContent = t.icon + ' ' + t.title;
    const lede = document.querySelector('article .lede');
    if (lede && !lede.textContent.trim()) lede.textContent = t.blurb;
    document.title = t.title + ' · Digidream Studio tutorials';
    const done = t.pages.filter(p => pageDone(p.file)).length;
    const next = t.pages.find(p => !pageDone(p.file)) || t.pages[0];
    el.append(
      h('div', { style: 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:8px 0 18px' },
        h('a', { class: 'wbtn primary', href: ROOT + next.file, style: 'text-decoration:none' }, done ? (done === t.pages.length ? 'Read again from the start' : 'Carry on: ' + next.title) : 'Start: ' + next.title),
        h('span', { class: 'wout' }, `${done} of ${t.pages.length} done`)),
      h('ol', { class: 'track-list' }, ...t.pages.map((p, i) => h('li', {},
        h('a', { href: ROOT + p.file, class: pageDone(p.file) ? 'done' : '' },
          h('span', { class: 'n' }, pageDone(p.file) ? '✓' : String(i + 1)),
          h('span', { class: 't' }, p.title))))));
  }

  // ---------- headings get anchors ----------
  function anchors() {
    const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    document.querySelectorAll('article h2, article h3').forEach(el => { if (!el.id) el.id = slug(el.textContent); });
  }

  // ---------- steps ----------
  function steps() {
    if (!me) return;
    const lists = [...document.querySelectorAll('ol.steps')];
    let idx = 0;
    const all = [];
    lists.forEach(ol => [...ol.children].forEach(li => {
      const key = 'step:' + me.file + ':' + (idx++);
      const box = h('input', { type: 'checkbox', class: 'tick', 'aria-label': 'Mark this step done' });
      box.checked = store.get(key, false);
      li.classList.toggle('done', box.checked);
      box.onchange = () => { store.set(key, box.checked); li.classList.toggle('done', box.checked); update(); };
      li.prepend(box);
      all.push(box);
    }));
    const bar = h('i');
    const label = h('span', { class: 'wout' });
    function update() {
      const n = all.filter(b => b.checked).length;
      const pct = all.length ? n / all.length : 1;
      bar.style.width = (pct * 100) + '%';
      label.textContent = all.length ? `${n} / ${all.length} steps` : '';
      store.set('done:' + me.file, pct >= 1);
      const link = document.querySelector(`.sidebar a[href="${ROOT + me.file}"]`);
      if (link) { link.classList.toggle('done', pct >= 1); link.querySelector('.n').textContent = pct >= 1 ? '✓' : String(me.track.pages.findIndex(p => p.file === me.file) + 1); }
      const pctEl = [...document.querySelectorAll('.sidebar summary')].find(s => s.textContent.includes(me.track.title));
      if (pctEl && me.track.id !== 'reference') pctEl.querySelector('.pct').textContent = trackPct(me.track) + '%';
    }
    if (all.length) {
      const h1 = document.querySelector('article h1');
      const wrap = h('div', { style: 'display:flex;align-items:center;gap:10px;margin:6px 0 4px' }, h('div', { class: 'progress', style: 'flex:1' }, bar), label);
      (document.querySelector('article .lede') || h1).after(wrap);
    }
    update();
  }

  // ---------- quizzes ----------
  // <div class="quiz" data-answer="2"><p class="q">…</p><ul><li>…</li>…</ul><p class="why">…</p></div>
  function quizzes() {
    document.querySelectorAll('.quiz').forEach((qz, qi) => {
      const right = Number(qz.dataset.answer || 0);
      const items = [...qz.querySelectorAll('ul > li')];
      items.forEach((li, i) => {
        const b = h('button', { type: 'button' });
        while (li.firstChild) b.append(li.firstChild);
        li.append(b);
        b.onclick = () => {
          if (i === right) {
            b.classList.add('right'); qz.classList.add('answered');
            items.forEach(x => x.querySelector('button').disabled = true);
          } else { b.classList.add('wrong'); b.disabled = true; }
        };
      });
    });
  }

  // ---------- copy buttons ----------
  function tableWraps() {
    document.querySelectorAll('article table').forEach(t => {
      if (t.parentNode.classList.contains('tablewrap')) return;
      const w = h('div', { class: 'tablewrap' }); t.before(w); w.append(t);
    });
  }

  function copyButtons() {
    document.querySelectorAll('article pre').forEach(pre => {
      if (pre.classList.contains('nocopy')) return;
      const b = h('button', { class: 'copy', type: 'button' }, 'copy');
      b.onclick = async () => {
        const text = (pre.querySelector('code') || pre).innerText.replace(/\ncopy$/, '');
        try { await navigator.clipboard.writeText(text); b.textContent = 'copied'; } catch { b.textContent = 'select + ⌘C'; }
        setTimeout(() => b.textContent = 'copy', 1400);
      };
      pre.append(b);
    });
  }

  // ---------- screenshots with hotspots ----------
  // <figure class="shot" data-src="../assets/shots/x.png" data-alt="…"
  //   data-hotspots='[{"x":12,"y":30,"t":"Rail","d":"…"}]'></figure>   (x, y in %)
  function shots() {
    document.querySelectorAll('figure.shot').forEach(fig => {
      const caption = fig.querySelector('figcaption');
      const box = h('div', { class: 'shot' });
      const img = h('img', { src: fig.dataset.src, alt: fig.dataset.alt || '', loading: 'lazy' });
      img.onerror = () => { box.replaceWith(h('div', { class: 'callout soon' }, 'Screenshot not available: ' + (fig.dataset.alt || fig.dataset.src))); };
      box.append(img);
      let spots = [];
      try { spots = JSON.parse(fig.dataset.hotspots || '[]'); } catch {}
      const note = spots.length ? h('div', { class: 'hotnote' }, 'Tap a numbered dot to see what that part does.') : null;
      spots.forEach((s, i) => {
        const b = h('button', { class: 'hotspot', type: 'button', style: `left:${s.x}%;top:${s.y}%`, 'aria-label': s.t }, String(i + 1));
        b.onclick = () => {
          box.querySelectorAll('.hotspot').forEach(x => x.classList.remove('on'));
          b.classList.add('on');
          note.innerHTML = '';
          note.append(h('b', {}, (i + 1) + '. ' + s.t), s.d ? ' — ' + s.d : '');
        };
        box.append(b);
      });
      fig.prepend(box);
      if (note) box.after(note);
      if (caption) fig.append(caption);
    });
  }

  // ---------- keyboard shortcut trainer ----------
  // <div class="widget trainer" data-tool="studio"></div>
  function eventCombo(e) {
    let k = e.key.toLowerCase();
    if (k === 'spacebar') k = ' ';
    const mod = e.metaKey || e.ctrlKey;
    if (['meta', 'control', 'shift', 'alt'].includes(k)) return null;
    // A shifted printable key already says what it is ("?", "+"), so only
    // name shift for letters and named keys.
    const shift = e.shiftKey && (k.length > 1 || /[a-z]/.test(k));
    return (mod ? 'mod+' : '') + (shift ? 'shift+' : '') + k;
  }
  function trainers() {
    const data = window.DNP_SHORTCUTS || {};
    document.querySelectorAll('.trainer').forEach(el => {
      const tool = data[el.dataset.tool];
      if (!tool) return;
      const rows = tool.rows.filter(r => r.match);
      let cur = null, score = 0, tries = 0, streak = 0;
      const prompt = h('div', { class: 'prompt' });
      const fb = h('div', { class: 'feedback' });
      const sc = h('div', { class: 'score' });
      const pad = h('button', { class: 'wbtn primary', type: 'button' }, 'Start — then press the key');
      const skip = h('button', { class: 'wbtn', type: 'button' }, 'Show me');
      el.append(h('div', { class: 'wtitle' }, '⌨ Shortcut trainer · ' + tool.name),
        h('p', { class: 'wnote', style: 'margin-top:0' }, 'Click Start, then press the key for each action. ⌘ and Ctrl both count. Nothing here is sent to any tool.'),
        prompt, fb, h('div', { class: 'wrow' }, pad, skip), sc);
      function nextQ() {
        let r; do { r = rows[Math.floor(Math.random() * rows.length)]; } while (rows.length > 1 && r === cur);
        cur = r; prompt.textContent = r.does;
      }
      function draw() { sc.textContent = `${score} / ${tries} right · streak ${streak}`; }
      let armed = false;
      pad.onclick = () => { armed = true; pad.textContent = 'Listening… (click elsewhere to stop)'; el.tabIndex = -1; el.focus(); nextQ(); fb.textContent = ''; draw(); };
      skip.onclick = () => { if (cur) { fb.className = 'feedback'; fb.textContent = 'It is ' + cur.keys; streak = 0; draw(); setTimeout(nextQ, 900); el.focus(); } };
      el.addEventListener('blur', () => { armed = false; pad.textContent = 'Start — then press the key'; }, true);
      el.addEventListener('keydown', e => {
        if (!armed || !cur) return;
        const c = eventCombo(e);
        if (!c) return;
        e.preventDefault();
        tries++;
        if (cur.match.includes(c)) { score++; streak++; fb.className = 'feedback ok'; fb.textContent = '✓ ' + cur.keys; nextQ(); }
        else { streak = 0; fb.className = 'feedback no'; fb.textContent = '✗ not that one — try again, or press Show me'; }
        draw();
      });
    });
  }

  // ---------- shortcut tables ----------
  // <div class="shortcut-table" data-tool="all|studio|…"></div>
  function shortcutTables() {
    const data = window.DNP_SHORTCUTS || {};
    document.querySelectorAll('.shortcut-table').forEach(el => {
      const ids = el.dataset.tool === 'all' ? Object.keys(data) : [el.dataset.tool];
      const input = h('input', { type: 'search', placeholder: 'Filter: a key or an action, e.g. "undo" or "dither"' });
      const chips = h('div', { class: 'filters' });
      let only = null;
      if (ids.length > 1) {
        const mk = (id, label) => {
          const b = h('button', { class: 'wbtn' + (id === null ? ' on' : ''), type: 'button' }, label);
          b.onclick = () => { only = id; chips.querySelectorAll('.wbtn').forEach(x => x.classList.remove('on')); b.classList.add('on'); draw(); };
          return b;
        };
        chips.append(mk(null, 'All tools'), ...ids.map(id => mk(id, data[id].name)));
      }
      const tbody = h('tbody');
      const table = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Keys'), h('th', {}, 'Does'), ids.length > 1 ? h('th', {}, 'Tool') : null)), tbody);
      function draw() {
        const q = input.value.trim().toLowerCase();
        tbody.innerHTML = '';
        ids.filter(id => !only || id === only).forEach(id => data[id].rows.forEach(r => {
          if (q && !(r.keys + ' ' + r.does).toLowerCase().includes(q)) return;
          tbody.append(h('tr', {}, h('td', {}, ...r.keys.split(' / ').flatMap((k, i) => i ? [' / ', h('kbd', {}, k)] : [h('kbd', {}, k)])), h('td', {}, r.does), ids.length > 1 ? h('td', { style: 'color:var(--text-dim)' }, data[id].name) : null));
        }));
      }
      input.oninput = draw;
      el.append(h('div', { class: 'filters' }, input), chips, table);
      draw();
    });
  }

  // ---------- skin picker ----------
  // The shipped uikit skins (assets/skins/, built by tools/build-skins.mjs)
  // and their modes; assets/skin.js applies the choice before the page paints.
  function buildSkinPicker() {
    const S = window.DNPSkin;
    const btn = h('button', { class: 'iconbtn skinbtn', type: 'button', title: 'Skin', 'aria-label': 'Choose a skin', 'aria-haspopup': 'true' });
    if (!S || !S.list.length) { btn.hidden = true; return btn; }
    const pop = h('div', { class: 'skinpop', role: 'dialog', 'aria-label': 'Skin' });
    const wrap = h('div', { class: 'skinwrap' }, btn, pop);
    const label = s => s.charAt(0).toUpperCase() + s.slice(1);
    function draw() {
      const c = S.choice(), r = S.resolved();
      btn.innerHTML = '';
      btn.append(h('span', { class: 'sw', style: `background:${r.mode.swatches[2]}` }), h('span', { class: 'skinname' }, r.skin.name));
      pop.innerHTML = '';
      pop.append(h('div', { class: 'skinhead' }, 'Skin', h('small', {}, 'the looks the Digidream tools ship with')));
      for (const s of S.list) {
        const on = s.id === r.skin.id;
        const m = (on ? r.mode : null) || s.modes.find(x => x.dark === r.mode.dark) || s.modes[0];
        const card = h('button', { type: 'button', class: 'skincard' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false',
          onclick: () => { S.set(s.id, s.modes.some(x => x.id === c.mode) ? c.mode : 'auto'); draw(); } },
          h('span', { class: 'swatches' }, ...m.swatches.map(col => h('i', { style: `background:${col}` }))),
          h('b', {}, s.name), h('span', { class: 'about' }, s.about.split(/(?<=\.)\s/)[0]));
        pop.append(card);
      }
      const seg = h('div', { class: 'skinmodes', role: 'group', 'aria-label': 'Mode' });
      for (const id of ['auto', ...r.skin.modes.map(m => m.id)]) {
        seg.append(h('button', { type: 'button', class: 'wbtn' + (c.mode === id || (id === 'auto' && !r.skin.modes.some(m => m.id === c.mode)) ? ' on' : ''),
          title: id === 'auto' ? 'Follow the system: a dark mode when it is dark' : '', onclick: () => { S.set(r.skin.id, id); draw(); } }, id === 'auto' ? 'Auto' : label(id)));
      }
      pop.append(h('div', { class: 'skinhead' }, 'Mode'), seg);
    }
    btn.onclick = e => { e.stopPropagation(); pop.classList.toggle('open'); if (pop.classList.contains('open')) draw(); };
    pop.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => pop.classList.remove('open'));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') pop.classList.remove('open'); });
    document.addEventListener('dnp-skin', () => { if (!pop.classList.contains('open')) draw(); });
    draw();
    return wrap;
  }

  // ---------- search ----------
  function buildSearch() {
    const input = h('input', { type: 'search', placeholder: 'Search the tutorials  ( / )', 'aria-label': 'Search' });
    const results = h('div', { class: 'results', role: 'listbox' });
    const wrap = h('div', { class: 'search' }, input, results);
    let index = PAGES.map(p => ({ url: ROOT + p.file, title: p.title, where: p.track.title, text: (p.title + ' ' + p.kw + ' ' + p.track.title).toLowerCase() }));
    let deep = false, sel = 0, hits = [];
    async function deepIndex() {
      if (deep || location.protocol === 'file:') return;
      deep = true;
      const more = [];
      await Promise.all(PAGES.map(async p => {
        try {
          const html = await (await fetch(ROOT + p.file)).text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          doc.querySelectorAll('article h2, article h3').forEach(hd => {
            const id = hd.id || hd.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
            let text = hd.textContent, n = hd.nextElementSibling;
            for (let k = 0; n && k < 6 && !/^H[23]$/.test(n.tagName); k++, n = n.nextElementSibling) text += ' ' + n.textContent;
            more.push({ url: ROOT + p.file + '#' + id, title: hd.textContent, where: p.track.title + ' › ' + p.title, text: text.toLowerCase() });
          });
        } catch {}
      }));
      index = index.concat(more);
      run();
    }
    function run() {
      const q = input.value.trim().toLowerCase();
      results.innerHTML = '';
      if (!q) { results.classList.remove('open'); return; }
      const words = q.split(/\s+/);
      hits = index.map(e => {
        let s = 0;
        for (const w of words) { if (!e.text.includes(w)) return null; s += e.title.toLowerCase().includes(w) ? 3 : 1; }
        return { e, s };
      }).filter(Boolean).sort((a, b) => b.s - a.s).slice(0, 14);
      sel = 0;
      if (!hits.length) results.append(h('div', { style: 'padding:10px;color:var(--text-dim);font-size:14px' }, 'Nothing found.'));
      hits.forEach(({ e }, i) => results.append(h('a', { href: e.url, class: i === 0 ? 'active' : '' }, e.title, h('small', {}, e.where))));
      results.classList.add('open');
    }
    input.addEventListener('focus', deepIndex);
    input.addEventListener('input', run);
    input.addEventListener('keydown', e => {
      const links = [...results.querySelectorAll('a')];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (!links.length) return;
        links[sel]?.classList.remove('active');
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
        links[sel].classList.add('active'); links[sel].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && links[sel]) { location.href = links[sel].href; }
      else if (e.key === 'Escape') { input.value = ''; run(); input.blur(); }
    });
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) results.classList.remove('open'); });
    document.addEventListener('keydown', e => {
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.closest('.trainer, .widget')) { e.preventDefault(); input.focus(); }
    });
    return wrap;
  }

  // ---------- widgets ----------
  // <div class="widget" data-widget="room-draw" data-title="…"></div>
  // assets/widgets/room-draw.js sets window.DNPW['room-draw'] = (el, opts) => {}
  window.DNPW = window.DNPW || {};
  const loading = {};
  function loadWidget(name) {
    if (window.DNPW[name]) return Promise.resolve(window.DNPW[name]);
    return loading[name] || (loading[name] = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = ASSETS + 'widgets/' + name + '.js';
      s.onload = () => window.DNPW[name] ? ok(window.DNPW[name]) : no(new Error('widget ' + name + ' did not register'));
      s.onerror = () => no(new Error('widget ' + name + ' missing'));
      document.head.append(s);
    }));
  }
  function widgets() {
    document.querySelectorAll('.widget[data-widget]').forEach(el => {
      const name = el.dataset.widget;
      if (el.dataset.title) el.prepend(h('div', { class: 'wtitle' }, el.dataset.title));
      loadWidget(name).then(mount => mount(el, { ...el.dataset })).catch(err => {
        console.warn(err);
        el.append(h('p', { class: 'wnote' }, 'This demo could not load.'));
      });
    });
  }

  function boot() {
    buildShell();
    trackIndex();
    anchors();
    steps();
    quizzes();
    copyButtons();
    shots();
    tableWraps();
    trainers();
    shortcutTables();
    widgets();
    if (location.hash) { const t = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (t) t.scrollIntoView(); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
