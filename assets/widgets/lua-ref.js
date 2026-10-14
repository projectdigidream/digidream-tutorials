// The Lua reference: every function, method, hook and table a script can reach.
// Data: assets/data/lua-api-world.js and lua-api-libs.js, which fill
// window.DNP_LUA_API = { groups: [{ id, order, title, intro, entries: [...] }], internal, extra }.
//
// <div class="widget" data-widget="lua-ref"></div>
//   searchable cards, one per entry, each with the entry's id as its anchor
//   (#dnp.sound, #entity.pos, #mobs.spawn …); a hash opens and highlights it.
// <div class="widget" data-widget="lua-ref" data-mode="cheat"></div>
//   one compact, printable list of signatures, each linking to its card on
//   02-every-function.html (data-target overrides the page).
(function () {
  window.DNPW = window.DNPW || {};
  const FILES = ['lua-api-world.js', 'lua-api-libs.js'];
  const WHERE = { level: 'level', game: 'game', both: 'level + game' };
  const WHERE_TIP = {
    level: 'Available in a level’s Lua machine',
    game: 'Available in the game machine',
    both: 'Available in a level’s and in the game’s machine',
  };

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
  // Docs are plain text with `code`, blank-line paragraphs and single newlines kept as line breaks.
  function docHtml(s) {
    if (!s) return '';
    return String(s).split(/\n\s*\n/).map(p => '<p>' + inline(p).replace(/\n/g, '<br>') + '</p>').join('');
  }

  let styled = false;
  function style() {
    if (styled) return; styled = true;
    const s = document.createElement('style');
    s.textContent = `
      .lr-bar { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-bottom:10px }
      .lr-bar input { flex:1 1 240px; min-width:0; height:34px; padding:0 10px; border-radius:8px; border:1px solid var(--line); background:var(--input); color:var(--text); font:inherit }
      .lr-chips { display:flex; flex-wrap:wrap; gap:6px; margin:0 0 12px }
      .lr-chips .wbtn { font-size:12px; padding:4px 10px }
      .lr-group { margin:22px 0 4px; font-size:13px; font-weight:700; color:var(--text-2); text-transform:uppercase; letter-spacing:.06em; scroll-margin-top:72px }
      .lr-intro { font-size:14px; color:var(--text-2); margin:0 0 8px }
      .lr-intro p { margin:4px 0; color:var(--text-2) }
      .lr-card { border:1px solid var(--line-soft); border-radius:10px; background:var(--bg); margin:6px 0; scroll-margin-top:72px; min-width:0 }
      .lr-card > summary { list-style:none; cursor:pointer; padding:8px 12px; display:flex; gap:8px; align-items:baseline; flex-wrap:wrap }
      .lr-card > summary::-webkit-details-marker { display:none }
      .lr-card > summary code { font-size:14px; font-weight:600; color:var(--text); background:none; border:0; padding:0; white-space:normal; overflow-wrap:anywhere }
      .lr-card > summary .lr-first { color:var(--text-2); font-size:13px; flex:1 1 100%; min-width:0 }
      .lr-card[open] > summary .lr-first { display:none }
      .lr-card .lr-body { padding:0 12px 10px; font-size:14px; color:var(--text-2); min-width:0 }
      .lr-card .lr-body p { color:var(--text-2); margin:6px 0 }
      .lr-card .lr-body pre { margin:8px 0; overflow-x:auto }
      .lr-card.hit { border-color:var(--select); box-shadow:0 0 0 2px color-mix(in srgb, var(--select) 35%, transparent) }
      .lr-badge { font-size:11px; padding:0 6px; border-radius:999px; border:1px solid var(--line); color:var(--text-dim); white-space:nowrap }
      .lr-anchor { margin-left:auto; font-size:12px; color:var(--text-dim) }
      .lr-dim { color:var(--text-dim); font-size:12px }
      .lr-sub { font-size:12px; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:.06em; margin:10px 0 4px }
      .lr-opt { font-size:11px; color:var(--text-dim) }
      table.lr-args td { font-size:13px; padding:6px 8px; vertical-align:top } table.lr-args td p { margin:0 0 4px }
      .lr-notes { margin:6px 0; padding-left:20px } .lr-notes li { margin:3px 0 }
      .lr-see { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-top:8px }
      .lr-count { font-size:12px; color:var(--text-dim) }
      .lr-cheat-head { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:6px }
      .lr-cheat { columns:2 340px; column-gap:28px }
      .lr-cheat section { break-inside:avoid-column; margin:0 0 14px }
      .lr-cheat h3 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--text-2); margin:0 0 4px; break-after:avoid }
      .lr-cheat ul { list-style:none; margin:0; padding:0 }
      .lr-cheat li { font:12.5px/1.45 var(--mono); margin:0; padding:1px 0; overflow-wrap:anywhere; break-inside:avoid }
      .lr-cheat li a { color:var(--text); text-decoration:none }
      .lr-cheat li a:hover { color:var(--accent); text-decoration:underline }
      .lr-cheat li .lr-w { font:11px var(--sans, inherit); color:var(--text-dim); margin-left:4px }
      @media print {
        .topbar, .sidebar, .crumbs, .pager, .progress, .lr-cheat-head .wbtn, .menubtn { display:none !important }
        .layout { display:block !important }
        main { padding:0 !important }
        .widget { border:0 !important; padding:0 !important; box-shadow:none !important; background:none !important }
        .lr-cheat { columns:2; column-gap:18px }
        .lr-cheat li { font-size:9pt; line-height:1.3 }
        html, body, main, article, .layout { background:#fff !important; color:#000 !important }
        article h1, article .lede, .lr-cheat h3, .lr-count { color:#000 !important }
        .lr-cheat li a { color:#000 !important }
        .lr-cheat li .lr-w { color:#555 !important }
      }`;
    document.head.append(s);
  }

  function scriptBase() {
    const src = (document.currentScript && document.currentScript.src) ||
      [...document.scripts].map(s => s.src).find(s => /widgets\/lua-ref\.js/.test(s)) || '';
    return src.replace(/widgets\/lua-ref\.js.*$/, 'data/');
  }
  const BASE = scriptBase();
  let ready = null;
  function loadData() {
    if (ready) return ready;
    const one = (f) => new Promise((ok) => {
      const s = document.createElement('script');
      s.src = BASE + f; s.onload = () => ok(true); s.onerror = () => ok(false);
      document.head.append(s);
    });
    ready = Promise.all(FILES.map(one)).then(() => {
      const A = window.DNP_LUA_API;
      if (!A || !A.groups || !A.groups.length) throw new Error('no data');
      return A;
    });
    return ready;
  }

  window.DNPW['lua-ref'] = function mount(el, opts) {
    style();
    loadData().then(A => (opts.mode === 'cheat' ? cheat : full)(el, A, opts)).catch(() => {
      el.append(Object.assign(document.createElement('p'), { className: 'wnote', textContent: 'The reference data did not load.' }));
    });
  };

  const sorted = (A) => A.groups.slice().sort((a, b) => (a.order || 0) - (b.order || 0));

  // ------------------------------------------------------------- cheat sheet
  function cheat(el, A, opts) {
    const target = opts.target || '02-every-function.html';
    const head = document.createElement('div'); head.className = 'lr-cheat-head';
    const pr = document.createElement('button'); pr.type = 'button'; pr.className = 'wbtn'; pr.textContent = 'Print';
    pr.onclick = () => window.print();
    const n = A.groups.reduce((t, g) => t + g.entries.length, 0);
    const c = document.createElement('span'); c.className = 'lr-count'; c.textContent = `${n} entries in ${A.groups.length} groups · marked: only in a level, or only in the game`;
    head.append(pr, c);
    const box = document.createElement('div'); box.className = 'lr-cheat';
    box.innerHTML = sorted(A).map(g => `<section id="g-${esc(g.id)}"><h3>${esc(g.title)}</h3><ul>` +
      g.entries.map(e => `<li><a href="${esc(target)}#${esc(e.id)}">${esc(e.sig || e.id)}</a>${e.where && e.where !== 'both' ? `<span class="lr-w">${esc(WHERE[e.where] || e.where)}</span>` : ''}</li>`).join('') +
      '</ul></section>').join('');
    el.append(head, box);
  }

  // -------------------------------------------------------- every function
  function full(el, A) {
    const groups = sorted(A);
    const all = [];
    const byId = new Map();
    for (const g of groups) for (const e of g.entries) {
      const item = { e, g, text: [e.id, e.sig, e.doc, ...(e.args || []).map(a => a.name + ' ' + (a.doc || '')), ...(e.notes || [])].join(' ').toLowerCase() };
      all.push(item); byId.set(e.id, item);
    }

    const input = document.createElement('input');
    input.type = 'search'; input.placeholder = `Search ${all.length} entries: a name or a word in the description`;
    input.setAttribute('aria-label', 'Search the Lua reference');
    const count = document.createElement('span'); count.className = 'lr-count';
    const expand = document.createElement('button'); expand.type = 'button'; expand.className = 'wbtn'; expand.textContent = 'Open all';
    const bar = document.createElement('div'); bar.className = 'lr-bar'; bar.append(input, expand, count);
    const chips = document.createElement('div'); chips.className = 'lr-chips';
    let only = null;
    const mk = (id, label) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'wbtn' + (id === null ? ' on' : ''); b.textContent = label;
      b.onclick = () => { only = id; chips.querySelectorAll('.wbtn').forEach(x => x.classList.remove('on')); b.classList.add('on'); draw(); };
      return b;
    };
    chips.append(mk(null, 'Everything'), ...groups.map(g => mk(g.id, g.title.replace(/ — .*$/, ''))));
    const list = document.createElement('div');
    el.append(bar, chips, list);

    function body(e) {
      let h = docHtml(e.doc);
      if (e.args && e.args.length) {
        h += `<div class="lr-sub">Arguments</div><div class="tablewrap"><table class="lr-args"><tbody>` + e.args.map(a =>
          `<tr><td><code>${esc(a.name)}</code>${a.optional ? ' <span class="lr-opt">optional</span>' : ''}</td><td>${a.type ? `<code>${esc(a.type)}</code>` : ''}</td><td>${a.doc ? docHtml(a.doc) : ''}</td></tr>`).join('') + '</tbody></table></div>';
      }
      if (e.returns) h += `<div class="lr-sub">Returns</div><p>${inline(e.returns)}</p>`;
      if (e.notes && e.notes.length) h += `<div class="lr-sub">Notes</div><ul class="lr-notes">${e.notes.map(n => `<li>${inline(n)}</li>`).join('')}</ul>`;
      if (e.example) h += `<div class="lr-sub">Example</div><pre><code>${esc(e.example)}</code></pre>`;
      const see = (e.see || []).filter(id => byId.has(id) && id !== e.id);
      if (see.length) h += `<div class="lr-see"><span class="lr-dim">See also</span> ${see.map(id => `<a href="#${esc(id)}"><code>${esc(id)}</code></a>`).join(' ')}</div>`;
      return h;
    }

    const cards = new Map();
    function card(item) {
      const e = item.e;
      if (cards.has(e.id)) return cards.get(e.id);
      const d = document.createElement('details'); d.className = 'lr-card'; d.id = e.id;
      const first = (String(e.doc || '').split(/\n/)[0].split(/(?<=[.!?])\s/)[0] || '').slice(0, 180);
      const badge = e.where ? `<span class="lr-badge" title="${esc(WHERE_TIP[e.where] || '')}">${esc(WHERE[e.where] || e.where)}</span>` : '';
      d.innerHTML = `<summary><code>${esc(e.sig || e.id)}</code>${badge}<a class="lr-anchor" href="#${esc(e.id)}" title="Link to this entry">#</a><span class="lr-first">${inline(first)}</span></summary><div class="lr-body"></div>`;
      d.addEventListener('toggle', () => {
        if (d.open && !d.dataset.filled) {
          d.querySelector('.lr-body').innerHTML = body(e); d.dataset.filled = '1';
          // site.js adds copy buttons at boot; examples rendered later get none, which is fine.
        }
      });
      d.querySelector('.lr-anchor').addEventListener('click', ev => { ev.stopPropagation(); });
      cards.set(e.id, d);
      return d;
    }

    function draw() {
      const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      list.innerHTML = '';
      let n = 0;
      for (const g of groups) {
        if (only && only !== g.id) continue;
        let items = all.filter(it => it.g === g && words.every(w => it.text.includes(w)));
        if (words.length) items = items.slice().sort((a, b) => (b.e.id.toLowerCase().includes(words[0]) - a.e.id.toLowerCase().includes(words[0])));
        if (!items.length) continue;
        const hd = document.createElement('div'); hd.className = 'lr-group'; hd.id = 'g-' + g.id;
        hd.textContent = `${g.title} · ${items.length}`;
        list.append(hd);
        if (g.intro && !words.length) {
          const intro = document.createElement('div'); intro.className = 'lr-intro'; intro.innerHTML = docHtml(g.intro);
          list.append(intro);
        }
        for (const it of items) { list.append(card(it)); n++; }
      }
      count.textContent = `${n} shown`;
    }
    input.addEventListener('input', draw);
    expand.onclick = () => {
      const open = expand.textContent === 'Open all';
      list.querySelectorAll('details').forEach(d => { d.open = open; });
      expand.textContent = open ? 'Close all' : 'Open all';
    };
    draw();

    function jump() {
      const id = decodeURIComponent(location.hash.slice(1));
      if (!id || !byId.has(id)) return;
      let d = cards.get(id);
      if (!d || !list.contains(d)) {
        input.value = ''; only = null;
        chips.querySelectorAll('.wbtn').forEach((x, i) => x.classList.toggle('on', i === 0));
        draw();
        d = cards.get(id);
      }
      if (!d) return;
      d.open = true;
      list.querySelectorAll('.lr-card.hit').forEach(x => x.classList.remove('hit'));
      d.classList.add('hit');
      d.scrollIntoView({ block: 'start' });
    }
    window.addEventListener('hashchange', jump);
    jump();
  }
})();
