// A searchable browser over one of the engine's generated vocabularies
// (assets/data/vocab-<name>.js, built by tools/build-vocab.mjs from
// engine/maps/scripts/<name>_vocab.json).
// <div class="widget" data-widget="vocab-browser" data-vocab="graph|mob|weapon"></div>
// Every entry has an id other pages link to: a node, action or condition by
// its name (#branch, #has_target), a property as #prop.NAME, a field as
// #GROUP.NAME (#phase_fields.ticks).
(function () {
  window.DNPW = window.DNPW || {};

  const GRAPH_CATS = {
    events: 'Events: where a run starts', null: 'Flow and data', entity: 'Entities', sector: 'Sectors', wall: 'Walls',
    weapon: 'Weapons', panel: 'Panels', cinematic: 'Cinematics', camera: 'Camera', storage: 'Storage', input: 'Input', maps: 'Maps',
  };
  const FIELD_GROUPS = {
    mob: [['mob_fields', 'A monster’s record'], ['state_fields', 'A brain state'], ['swing_fields', 'A swing'], ['missile_fields', 'A missile'],
      ['pain_time_fields', 'Pain time'], ['drop_fields', 'Drops'], ['drop_choice_fields', 'A drop choice']],
    weapon: [['weapon_fields', 'A weapon’s record'], ['phase_fields', 'A phase'], ['swing_fields', 'A swing'], ['ammo_fields', 'An ammunition pool'],
      ['health_fields', 'Health'], ['pickup_fields', 'A pickup']],
    graph: [['graph_fields', 'The graph file'], ['node_fields', 'A node in the file']],
  };

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  // Docs are plain text with `code` and blank-line paragraphs.
  function docHtml(s) {
    if (!s) return '';
    return esc(s).split(/\n\s*\n/).map(p => '<p>' + p.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\n/g, ' ') + '</p>').join('');
  }
  function typeHtml(a) {
    let t = a.type ? `<code>${esc(a.type)}</code>` : '';
    if (a.values) t += ' <span class="vb-dim">one of</span> ' + a.values.map(v => `<code>${esc(v)}</code>`).join(' ');
    return t;
  }
  function argsTable(args, title) {
    if (!args || !args.length) return '';
    return `<div class="vb-sub">${title}</div><div class="tablewrap"><table class="vb-args"><tbody>` + args.map(a =>
      `<tr><td><code>${esc(a.name)}</code>${a.optional ? '' : ' <span class="vb-req" title="required">required</span>'}</td><td>${typeHtml(a)}</td><td>${docHtml(a.doc)}</td></tr>`).join('') + '</tbody></table></div>';
  }
  const pins = (label, list, cls) => list && list.length ? `<div class="vb-pins"><span class="vb-dim">${label}</span> ${list.map(p => `<span class="vb-pin ${cls}">${esc(p)}</span>`).join('')}</div>` : '';

  function entries(name, V) {
    const out = [];
    if (name === 'graph') {
      for (const n of V.nodes) {
        const cat = n.category ?? null;
        const badges = [];
        if (n.starts) badges.push('starts a run');
        if (n.level_only) badges.push('level only');
        out.push({
          id: n.name, group: 'cat:' + cat, title: n.name, badges,
          text: [n.name, n.doc, ...(n.args || []).map(a => a.name + ' ' + (a.doc || ''))].join(' '),
          html: () => docHtml(n.doc) +
            pins('flow in', n.exec_in, 'exec') + pins('flow out', n.exec_out, 'exec') +
            pins('data in', n.data_in, 'data') + pins('data out', n.data_out, 'data') +
            (n.data_in_args && n.data_in_args.length ? `<div class="vb-pins"><span class="vb-dim">arguments that also take a data link</span> ${n.data_in_args.map(p => `<span class="vb-pin data">${esc(p)}</span>`).join('')}</div>` : '') +
            argsTable(n.args, 'Arguments'),
        });
      }
      for (const p of V.properties) out.push({
        id: 'prop.' + p.name, group: 'props', title: p.name,
        badges: [p.of === 'movement' ? 'movement rule' : 'entity', p.access === 'read_write' ? 'read and write' : 'read only'],
        text: p.name + ' ' + p.doc, html: () => `<div class="vb-pins"><span class="vb-dim">type</span> <code>${esc(p.type)}</code></div>` + docHtml(p.doc),
      });
    } else {
      for (const a of V.actions) out.push({ id: a.name, group: 'actions', title: a.name, badges: [], text: a.name + ' ' + a.doc + ' ' + (a.args || []).map(x => x.name + ' ' + (x.doc || '')).join(' '), html: () => docHtml(a.doc) + argsTable(a.args, 'Arguments') });
      for (const c of V.conditions) out.push({ id: out.some(e => e.id === c.name) ? 'cond.' + c.name : c.name, group: 'conditions', title: c.name, badges: [], text: c.name + ' ' + c.doc + ' ' + (c.args || []).map(x => x.name + ' ' + (x.doc || '')).join(' '), html: () => docHtml(c.doc) + argsTable(c.args, 'Arguments') });
    }
    for (const [key] of FIELD_GROUPS[name]) for (const f of V[key] || []) out.push({
      id: key + '.' + f.name, group: key, title: f.name, badges: [f.optional ? 'optional' : 'required'],
      text: f.name + ' ' + (f.doc || ''), html: () => `<div class="vb-pins"><span class="vb-dim">type</span> ${typeHtml(f)}</div>` + docHtml(f.doc),
    });
    return out;
  }

  function groups(name, V) {
    if (name === 'graph') {
      const order = ['events', null, 'entity', 'sector', 'wall', 'input', 'weapon', 'panel', 'camera', 'cinematic', 'storage', 'maps'];
      const cats = [...new Set(V.nodes.map(n => n.category ?? null))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      return [...cats.map(c => ['cat:' + c, GRAPH_CATS[c] || c]), ['props', 'Properties (get_var / set_var / add_var)'], ...FIELD_GROUPS.graph];
    }
    return [['actions', 'Actions (what a state or phase does)'], ['conditions', 'Conditions (when a transition is taken)'], ...FIELD_GROUPS[name]];
  }

  let styled = false;
  function style() {
    if (styled) return; styled = true;
    const s = document.createElement('style');
    s.textContent = `
      .vb-bar { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-bottom:10px }
      .vb-bar input { flex:1 1 240px; height:34px; padding:0 10px; border-radius:8px; border:1px solid var(--line); background:var(--input); color:var(--text); font:inherit }
      .vb-chips { display:flex; flex-wrap:wrap; gap:6px; margin:0 0 12px }
      .vb-chips .wbtn { font-size:12px; padding:4px 10px }
      .vb-group { margin:18px 0 6px; font-size:13px; font-weight:700; color:var(--text-2); text-transform:uppercase; letter-spacing:.06em }
      .vb-card { border:1px solid var(--line-soft); border-radius:10px; background:var(--bg); margin:6px 0; scroll-margin-top:72px }
      .vb-card > summary { list-style:none; cursor:pointer; padding:8px 12px; display:flex; gap:8px; align-items:baseline; flex-wrap:wrap }
      .vb-card > summary::-webkit-details-marker { display:none }
      .vb-card > summary code { font-size:14px; font-weight:600; color:var(--text); background:none; border:0; padding:0 }
      .vb-card > summary .vb-first { color:var(--text-2); font-size:13px; flex:1 1 260px; min-width:0 }
      .vb-card[open] > summary .vb-first { display:none }
      .vb-card .vb-body { padding:0 12px 10px; font-size:14px; color:var(--text-2) }
      .vb-card .vb-body p { color:var(--text-2); margin:6px 0 }
      .vb-card.hit { border-color:var(--select); box-shadow:0 0 0 2px color-mix(in srgb, var(--select) 35%, transparent) }
      .vb-badge { font-size:11px; padding:0 6px; border-radius:999px; border:1px solid var(--line); color:var(--text-dim) }
      .vb-anchor { margin-left:auto; font-size:12px; color:var(--text-dim) }
      .vb-dim { color:var(--text-dim); font-size:12px }
      .vb-sub { font-size:12px; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:.06em; margin:10px 0 4px }
      .vb-pins { margin:6px 0; display:flex; flex-wrap:wrap; gap:4px; align-items:center }
      .vb-pin { font:12px var(--mono); padding:0 6px; border-radius:4px; border:1px solid var(--line) }
      .vb-pin.exec { border-color:var(--text-2); color:var(--text) }
      .vb-pin.data { border-color:var(--accent); color:var(--accent) }
      .vb-req { font-size:11px; color:var(--warn) }
      table.vb-args td { font-size:13px; padding:6px 8px } table.vb-args td p { margin:0 0 4px }
      .vb-count { font-size:12px; color:var(--text-dim) }
      .vb-game { display:grid; grid-template-columns:auto 1fr; gap:6px 12px; font-size:13px; margin-top:8px }
      .vb-game code { margin:0 4px 4px 0; display:inline-block }`;
    document.head.append(s);
  }

  window.DNPW['vocab-browser'] = function mount(el, opts) {
    style();
    const name = opts.vocab;
    const src = (document.currentScript && document.currentScript.src) || [...document.scripts].map(s => s.src).find(s => /widgets\/vocab-browser\.js/.test(s));
    const dataUrl = src.replace(/widgets\/vocab-browser\.js.*$/, `data/vocab-${name}.js`);
    const ready = window.DNP_VOCAB && window.DNP_VOCAB[name] ? Promise.resolve() : new Promise((ok, no) => {
      const s = document.createElement('script'); s.src = dataUrl; s.onload = ok; s.onerror = no; document.head.append(s);
    });
    ready.then(() => build(el, name, window.DNP_VOCAB[name])).catch(() => { el.append(Object.assign(document.createElement('p'), { className: 'wnote', textContent: 'The vocabulary data did not load.' })); });
  };

  function build(el, name, V) {
    const all = entries(name, V);
    const gs = groups(name, V);
    const input = document.createElement('input');
    input.type = 'search'; input.placeholder = `Search ${all.length} entries: a name or a word in the description`;
    const count = document.createElement('span'); count.className = 'vb-count';
    const expand = document.createElement('button'); expand.type = 'button'; expand.className = 'wbtn'; expand.textContent = 'Open all';
    const bar = document.createElement('div'); bar.className = 'vb-bar'; bar.append(input, expand, count);
    const chips = document.createElement('div'); chips.className = 'vb-chips';
    let only = null;
    const mk = (id, label) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'wbtn' + (id === null ? ' on' : ''); b.textContent = label;
      b.onclick = () => { only = id; chips.querySelectorAll('.wbtn').forEach(x => x.classList.remove('on')); b.classList.add('on'); draw(); };
      return b;
    };
    chips.append(mk(null, 'Everything'), ...gs.map(([id, label]) => mk(id, label.replace(/ \(.*\)$/, '').replace(/:.*$/, ''))));
    const list = document.createElement('div');
    el.append(bar, chips, list);

    if (name === 'graph' && V.game) {
      const g = document.createElement('details'); g.className = 'vb-card'; g.id = 'game-graph';
      g.innerHTML = `<summary><code>In a game-wide graph</code><span class="vb-first">what a module's own graph may use: it has no level of its own</span></summary><div class="vb-body">
        <p>A game graph (the module's, not a map's) is refused at load if it uses a node about a level's sectors, sides, points or trigger table. It reaches a level through a <a href="#call"><code>call</code></a> to an <a href="#on_call"><code>on_call</code></a> in that level's graph. These are the trigger-vocabulary words it may use:</p>
        <div class="vb-game"><span class="vb-dim">events</span><div>${V.game.events.map(x => `<code>${esc(x)}</code>`).join('')}</div>
        <span class="vb-dim">conditions</span><div>${V.game.conditions.map(x => `<code>${esc(x)}</code>`).join('')}</div>
        <span class="vb-dim">actions</span><div>${V.game.actions.map(x => `<code>${esc(x)}</code>`).join('')}</div></div></div>`;
      el.insertBefore(g, list);
    }

    const cards = new Map();
    function card(e) {
      if (cards.has(e.id)) return cards.get(e.id);
      const d = document.createElement('details'); d.className = 'vb-card'; d.id = e.id;
      const first = (e.text.slice(e.title.length).trim().split(/(?<=[.!?])\s/)[0] || '').slice(0, 160);
      d.innerHTML = `<summary><code>${esc(e.title)}</code>${e.badges.map(b => `<span class="vb-badge">${esc(b)}</span>`).join('')}<span class="vb-first">${esc(first).replace(/`([^`]+)`/g, '<code>$1</code>')}</span><a class="vb-anchor" href="#${esc(e.id)}" title="Link to this entry">#</a></summary><div class="vb-body"></div>`;
      d.addEventListener('toggle', () => { if (d.open && !d.dataset.filled) { d.querySelector('.vb-body').innerHTML = e.html(); d.dataset.filled = '1'; } });
      d.querySelector('.vb-anchor').addEventListener('click', ev => { ev.stopPropagation(); });
      cards.set(e.id, d);
      return d;
    }
    function draw() {
      const q = input.value.trim().toLowerCase();
      const words = q.split(/\s+/).filter(Boolean);
      list.innerHTML = '';
      let n = 0;
      for (const [gid, label] of gs) {
        if (only && only !== gid) continue;
        const items = all.filter(e => e.group === gid && words.every(w => e.text.toLowerCase().includes(w)))
          .sort((a, b) => (words.length ? (b.title.includes(words[0]) - a.title.includes(words[0])) : 0));
        if (!items.length) continue;
        const hd = document.createElement('div'); hd.className = 'vb-group'; hd.textContent = `${label} · ${items.length}`;
        list.append(hd);
        for (const e of items) { list.append(card(e)); n++; }
      }
      count.textContent = `${n} shown`;
    }
    input.addEventListener('input', draw);
    expand.onclick = () => { const open = expand.textContent === 'Open all'; list.querySelectorAll('details').forEach(d => { d.open = open; }); expand.textContent = open ? 'Close all' : 'Open all'; };
    draw();

    function jump() {
      const id = decodeURIComponent(location.hash.slice(1));
      if (!id) return;
      let d = cards.get(id) || document.getElementById(id);
      if (!d || !list.contains(d)) {
        if (!cards.has(id) && !all.some(e => e.id === id)) return;
        input.value = ''; only = null; chips.querySelectorAll('.wbtn').forEach((x, i) => x.classList.toggle('on', i === 0)); draw();
        d = cards.get(id);
      }
      if (!d) return;
      d.open = true;
      list.querySelectorAll('.vb-card.hit').forEach(x => x.classList.remove('hit'));
      d.classList.add('hit');
      d.scrollIntoView({ block: 'start' });
    }
    window.addEventListener('hashchange', jump);
    jump();
  }
})();
