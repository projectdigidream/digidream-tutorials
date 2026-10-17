// graph-lab: a playground for graph scripting. A board with a palette of real
// node types from engine/maps/scripts/graph_vocab.json, a little "world" with
// buttons that fire events, and a run that lights each node as it executes.
//
// The rules it keeps are the studio's and the engine's (docs/GRAPHS.md):
//  - exec pins link to exec pins, data pins to data pins;
//  - an exec output goes to one place, a data input takes one value, so a new
//    link replaces the one it would break;
//  - a run follows exec links from a start node, at most 256 steps;
//  - data is pulled when a node needs it, and a pure node (get_var, compare)
//    is worked out once per run, then remembered for the rest of that run;
//  - a delay runs the rest later, as a new run;
//  - once lets the first run through and never another.
// The studio only refuses exec-to-data links; a value of the wrong kind is
// caught by the engine at run time. The lab refuses it while you draw, and
// says why.
//
// Options (data-*): preset = kill3 | toggle | ambush | empty.
(function () {
  window.DNPW = window.DNPW || {};

  // Pin types. Data pins of one group link; `value` goes anywhere.
  const GROUP = { entity: 'entity', sector: 'num', number: 'num', bool: 'bool', value: 'value' };
  const PIN_COLOR = { exec: 'var(--text)', entity: 'var(--info)', sector: 'var(--when)', number: 'var(--ok)', bool: 'var(--if)', value: 'var(--text-2)' };
  const VARS = { kills: 0, door_open: false };

  // The node types: a few of the engine's 97, with the pins this demo needs.
  const T = {
    when_dies: { cat: 'when', start: 'dies', doc: 'Something died. what: monsters.', fields: [],
      ins: [], outs: [['then', 'exec'], ['entity', 'entity'], ['by', 'entity']] },
    when_wall_used: { cat: 'when', start: 'wall', doc: 'Somebody pressed use on a wall. side: the switch.', fields: [],
      ins: [], outs: [['then', 'exec'], ['entity', 'entity'], ['sector', 'sector']] },
    when_sector_entered: { cat: 'when', start: 'sector', doc: 'Somebody came into a sector.', fields: [['sector', 'select', ['3', '5'], '3']],
      ins: [], outs: [['then', 'exec'], ['entity', 'entity'], ['sector', 'sector']] },
    branch: { cat: 'if', doc: 'One way or the other: anything but false and nil is true.', fields: [],
      ins: [['in', 'exec'], ['cond', 'value']], outs: [['true', 'exec'], ['false', 'exec']] },
    once: { cat: 'if', doc: 'Through the first time, never again.', fields: [],
      ins: [['in', 'exec']], outs: [['then', 'exec']] },
    delay: { cat: 'if', doc: 'The rest of the run, later. 60 ticks a second.', fields: [['ticks', 'number', null, '120']],
      ins: [['in', 'exec'], ['ticks', 'number']], outs: [['then', 'exec']] },
    get_var: { cat: 'data', pure: true, doc: "A variable's value.", fields: [['var', 'select', Object.keys(VARS), 'kills']],
      ins: [], outs: [['value', 'value']] },
    compare: { cat: 'data', pure: true, doc: 'a op b, a boolean.', fields: [['op', 'select', ['==', '~=', '<', '<=', '>', '>='], '>='], ['b', 'text', null, '3']],
      ins: [['a', 'value'], ['b', 'value']], outs: [['value', 'bool']] },
    set_var: { cat: 'then', doc: 'Set a variable.', fields: [['var', 'select', Object.keys(VARS), 'door_open'], ['value', 'text', null, 'true']],
      ins: [['in', 'exec'], ['value', 'value']], outs: [['then', 'exec']] },
    add_var: { cat: 'then', doc: 'Add to a numeric variable: a counter.', fields: [['var', 'select', Object.keys(VARS), 'kills'], ['value', 'text', null, '1']],
      ins: [['in', 'exec'], ['value', 'number']], outs: [['then', 'exec']] },
    open_door: { cat: 'then', doc: "Open a door: its ceiling rises. sector: 7, the door.", fields: [],
      ins: [['in', 'exec'], ['sector', 'sector']], outs: [['then', 'exec']] },
    close_door: { cat: 'then', doc: 'Shut a door: its ceiling comes down. sector: 7.', fields: [],
      ins: [['in', 'exec'], ['sector', 'sector']], outs: [['then', 'exec']] },
    play_sound: { cat: 'then', doc: "A sound, from an entity: the event's when nothing is linked.", fields: [['sound', 'select', ['door_open', 'switch', 'alarm'], 'door_open']],
      ins: [['in', 'exec'], ['entity', 'entity']], outs: [['then', 'exec']] },
  };
  const PALETTE = [
    ['when …', ['when_dies', 'when_wall_used', 'when_sector_entered']],
    ['flow', ['branch', 'once', 'delay']],
    ['data', ['get_var', 'compare', 'set_var', 'add_var']],
    ['do', ['open_door', 'close_door', 'play_sound']],
  ];
  const NODE_W = 172;
  const BOARD_W = 940, BOARD_H = 470;

  const PRESETS = {
    kill3: {
      nodes: [
        ['dies', 'when_dies', 10, 16, {}],
        ['count', 'add_var', 200, 16, { var: 'kills', value: '1' }],
        ['kills', 'get_var', 200, 200, { var: 'kills' }],
        ['enough', 'compare', 385, 230, { op: '>=', b: '3' }],
        ['if', 'branch', 385, 16, {}],
        ['first', 'once', 570, 16, {}],
        ['door', 'open_door', 570, 150, {}],
        ['sound', 'play_sound', 755, 150, { sound: 'door_open' }],
      ],
      links: [['dies.then', 'count.in'], ['count.then', 'if.in'], ['kills.value', 'enough.a'], ['enough.value', 'if.cond'],
        ['if.true', 'first.in'], ['first.then', 'door.in'], ['door.then', 'sound.in']],
    },
    toggle: {
      nodes: [
        ['press', 'when_wall_used', 10, 16, {}],
        ['isopen', 'get_var', 10, 220, { var: 'door_open' }],
        ['if', 'branch', 200, 16, {}],
        ['shut', 'close_door', 385, 16, {}],
        ['mark0', 'set_var', 570, 16, { var: 'door_open', value: 'false' }],
        ['open', 'open_door', 385, 220, {}],
        ['mark1', 'set_var', 570, 220, { var: 'door_open', value: 'true' }],
        ['click', 'play_sound', 755, 120, { sound: 'switch' }],
      ],
      links: [['press.then', 'if.in'], ['isopen.value', 'if.cond'], ['if.true', 'shut.in'], ['shut.then', 'mark0.in'],
        ['if.false', 'open.in'], ['open.then', 'mark1.in'], ['mark0.then', 'click.in'], ['mark1.then', 'click.in']],
    },
    ambush: {
      door: true,
      nodes: [
        ['enter', 'when_sector_entered', 10, 16, { sector: '3' }],
        ['first', 'once', 200, 16, {}],
        ['shut', 'close_door', 385, 16, {}],
        ['alarm', 'play_sound', 570, 16, { sound: 'alarm' }],
        ['wait', 'delay', 570, 200, { ticks: '180' }],
        ['open', 'open_door', 755, 200, {}],
      ],
      links: [['enter.then', 'first.in'], ['first.then', 'shut.in'], ['shut.then', 'alarm.in'], ['alarm.then', 'wait.in'], ['wait.then', 'open.in']],
    },
    empty: { nodes: [], links: [] },
  };

  // "3" -> 3, "true" -> true, "x" -> "x": a literal as the studio reads one.
  function literal(s) {
    const t = String(s ?? '').trim();
    if (t === '') return undefined;
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    return t;
  }
  const show = (v) => v == null ? 'nil' : typeof v === 'object' ? v.ent : typeof v === 'string' ? JSON.stringify(v) : String(v);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const SVGNS = 'http://www.w3.org/2000/svg';

  window.DNPW['graph-lab'] = function mount(el, opts) {
    const h = window.DNPh;
    let nodes = [];        // { id, type, x, y, f: {field: value} }
    let links = [];        // { from, to, kind }
    let seq = 0;
    const els = {};        // id -> { box, pins: { name: dot } }
    // The world.
    let world = null;
    let vars = null;
    let spent = new Set();
    let timers = [];
    let queue = Promise.resolve();
    let speed = 1;
    let doorStart = false;   // the preset's: the ambush starts with the door open

    // --- layout --------------------------------------------------------
    const style = 'position:relative;overflow:auto;border-radius:8px;background:var(--sunken);max-width:100%;';
    const scroller = h('div', { style });
    // The board is drawn at full size and scaled to fit, down to 0.62; below
    // that (a phone) it scrolls sideways instead.
    let S = 1;
    const sizer = h('div', { style: 'position:relative' });
    const board = h('div', { style: `position:absolute;left:0;top:0;width:${BOARD_W}px;height:${BOARD_H}px;transform-origin:0 0;touch-action:pan-x pan-y;user-select:none;-webkit-user-select:none` });
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;overflow:visible');
    board.append(svg);
    sizer.append(board);
    scroller.append(sizer);
    function fit() {
      const w = scroller.clientWidth || BOARD_W;
      S = Math.max(0.62, Math.min(1, w / BOARD_W));
      board.style.transform = `scale(${S})`;
      sizer.style.width = BOARD_W * S + 'px';
      sizer.style.height = BOARD_H * S + 'px';
    }

    const palette = h('div', { class: 'wrow', style: 'gap:6px 10px;margin-top:0' });
    for (const [group, types] of PALETTE) {
      const g = h('span', { class: 'wlabel', style: 'gap:4px;flex-wrap:wrap' }, h('b', { style: 'font-size:12px;color:var(--text-dim)' }, group));
      for (const t of types) g.append(h('button', { class: 'wbtn', type: 'button', style: 'font:12px var(--mono);padding:3px 7px', title: T[t].doc, onclick: () => addNode(t) }, '+ ' + t));
      palette.append(g);
    }
    const presetSel = h('select', {}, h('option', { value: 'kill3' }, 'kill 3 to open the door'), h('option', { value: 'toggle' }, 'toggle switch'),
      h('option', { value: 'ambush' }, 'ambush in sector 3'), h('option', { value: 'empty' }, 'empty board'));
    const presetRow = h('div', { class: 'wrow' },
      h('label', { class: 'wlabel' }, 'Preset ', presetSel),
      h('button', { class: 'wbtn', type: 'button', onclick: () => loadPreset(presetSel.value) }, 'load'),
      h('label', { class: 'wlabel' }, h('input', { type: 'checkbox', onchange: (e) => { speed = e.target.checked ? 0.25 : 1; } }), 'fast'),
      legend());

    // The world panel: a picture, the variables, and the buttons that fire events.
    const pic = document.createElementNS(SVGNS, 'svg');
    pic.setAttribute('viewBox', '0 0 300 130');
    pic.setAttribute('style', 'width:300px;max-width:100%;height:auto;background:var(--panel);border:1px solid var(--line);border-radius:8px');
    const varsBox = h('div', { class: 'wout', style: 'min-width:150px;line-height:1.7' });
    const btnDie = h('button', { class: 'wbtn', type: 'button', onclick: () => evDies() }, 'a monster dies');
    const btnUse = h('button', { class: 'wbtn', type: 'button', onclick: () => evUse() }, 'player presses use on the switch');
    const btnEnter = h('button', { class: 'wbtn', type: 'button', onclick: () => evEnter() }, 'player enters sector 3');
    const btnReset = h('button', { class: 'wbtn', type: 'button', onclick: () => resetWorld(true) }, 'reset the world');
    const worldPanel = h('div', { style: 'display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;margin-top:10px' },
      pic, h('div', {}, h('div', { class: 'wlabel', style: 'margin-bottom:4px' }, 'variables'), varsBox));
    const out = h('div', { class: 'wout', style: 'min-height:6em;max-height:13em;overflow:auto;white-space:pre-wrap;margin-top:8px;padding:6px 8px;background:var(--code);border-radius:6px' });
    const hint = h('div', { class: 'wlabel', style: 'margin-top:6px' }, 'Drag from a pin on the right of a node to one on the left of another. Drag a node by its title. Tap a link to delete it.');
    el.append(palette, scroller, hint, presetRow, worldPanel, h('div', { class: 'wrow' }, btnDie, btnUse, btnEnter, btnReset), out,
      h('p', { class: 'wnote' }, 'This models the idea, not the engine. The node names, pins and rules are the real ones, but the world is a toy and the timings are slowed down so you can watch. Pins the demo does not need (a get_var\'s entity, an open_door\'s tag) are left off. The studio itself refuses only exec-to-data links; the lab also refuses a data link of the wrong kind, such as an entity into a sector.'));

    function legend() {
      const s = h('span', { class: 'wlabel', style: 'gap:8px;flex-wrap:wrap' });
      for (const [t, c] of Object.entries(PIN_COLOR)) {
        s.append(h('span', { style: 'display:inline-flex;align-items:center;gap:3px;font:11px var(--mono)' },
          h('span', { style: `display:inline-block;width:9px;height:9px;border:2px solid ${c};border-radius:${t === 'exec' ? '2px' : '50%'}` }), t));
      }
      return s;
    }

    // --- log -----------------------------------------------------------
    function say(line, color) {
      const d = h('div', color ? { style: `color:${color}` } : {}, line);
      out.append(d);
      while (out.childNodes.length > 120) out.firstChild.remove();
      out.scrollTop = out.scrollHeight;
    }

    // --- nodes ---------------------------------------------------------
    function addNode(type, at, fields, id) {
      const spec = T[type];
      id = id || `${type.replace(/^when_/, '').split('_')[0]}${++seq}`;
      while (nodes.some((n) => n.id === id)) id = `${id}_`;
      let x, y;
      if (at) { x = at[0]; y = at[1]; } else {
        const left = scroller.scrollLeft / S + 10, n = nodes.length;
        x = left + (n * 37) % 300; y = 12 + (n * 53) % 260;
      }
      const f = {};
      for (const [name, , , def] of spec.fields) f[name] = def;
      Object.assign(f, fields || {});
      const n = { id, type, x, y, f };
      nodes.push(n);
      build(n);
      draw();
      return n;
    }
    function build(n) {
      const spec = T[n.type];
      const cat = spec.cat === 'data' ? 'info' : spec.cat;
      const del = h('button', { type: 'button', title: 'delete ' + n.id, style: 'border:0;background:none;color:var(--text-2);cursor:pointer;font-size:13px;padding:0 2px' }, '✕');
      const head = h('div', { style: `display:flex;justify-content:space-between;align-items:center;padding:4px 6px 4px 8px;font:600 12px var(--mono);border-radius:7px 7px 0 0;background:color-mix(in srgb, var(--${cat}) 30%, var(--raised));color:var(--text);cursor:grab;touch-action:none`, title: spec.doc },
        h('span', {}, n.type), del);
      del.addEventListener('pointerdown', (e) => e.stopPropagation());
      del.addEventListener('click', () => removeNode(n.id));
      const fieldRows = h('div', { style: 'padding:3px 8px 2px;display:flex;flex-direction:column;gap:3px' });
      fieldRows.append(h('div', { style: 'font:10px var(--mono);color:var(--text-dim)' }, n.id));
      for (const [name, kind, options] of spec.fields) {
        let input;
        if (kind === 'select') {
          input = h('select', { style: 'font:11px var(--mono);background:var(--input);color:var(--text);border:1px solid var(--line);border-radius:4px;max-width:110px' },
            ...options.map((o) => h('option', { value: o }, o)));
        } else {
          input = h('input', { type: 'text', size: '6', style: 'font:11px var(--mono);background:var(--input);color:var(--text);border:1px solid var(--line);border-radius:4px;width:70px;padding:1px 3px' });
        }
        input.value = n.f[name];
        input.addEventListener('pointerdown', (e) => e.stopPropagation());
        input.addEventListener('change', () => { n.f[name] = input.value; });
        fieldRows.append(h('label', { style: 'display:flex;justify-content:space-between;align-items:center;gap:6px;font:11px var(--mono);color:var(--text-2)' }, name, input));
      }
      const rows = h('div', { style: 'display:flex;justify-content:space-between;gap:4px;padding:2px 0 6px' });
      const left = h('div', { style: 'display:flex;flex-direction:column;gap:2px' });
      const right = h('div', { style: 'display:flex;flex-direction:column;gap:2px;align-items:flex-end' });
      const pins = {};
      const pin = (name, kind, dir) => {
        const isExec = kind === 'exec';
        const dot = h('span', { style: `display:inline-block;width:12px;height:12px;border:2px solid ${PIN_COLOR[kind]};border-radius:${isExec ? '2px' : '50%'};background:var(--panel);flex:none` });
        const label = h('span', { style: 'font:11px var(--mono);color:var(--text-2)' }, isExec ? name : `${name}`);
        const p = h('div', { 'data-pin': `${n.id}.${name}`, 'data-dir': dir, 'data-kind': isExec ? 'exec' : 'data', 'data-type': kind, title: isExec ? 'exec' : kind,
          style: `display:flex;align-items:center;gap:4px;padding:3px 4px;cursor:crosshair;touch-action:none;${dir === 'in' ? 'margin-left:-8px' : 'margin-right:-8px;flex-direction:row-reverse'}` }, dot, label);
        pins[name] = dot;
        return p;
      };
      for (const [name, kind] of spec.ins) left.append(pin(name, kind, 'in'));
      for (const [name, kind] of spec.outs) right.append(pin(name, kind, 'out'));
      rows.append(left, right);
      const box = h('div', { 'data-node': n.id, style: `position:absolute;left:${n.x}px;top:${n.y}px;width:${NODE_W}px;border:1px solid var(--line-strong);border-radius:8px;background:var(--raised);box-shadow:0 2px 6px rgba(0,0,0,.25);transition:box-shadow .15s,border-color .15s` },
        head, fieldRows, rows);
      head.addEventListener('pointerdown', (e) => dragNode(e, n));
      els[n.id] = { box, pins };
      board.append(box);
    }
    function removeNode(id) {
      if (running) return;
      nodes = nodes.filter((n) => n.id !== id);
      links = links.filter((l) => l.from.split('.')[0] !== id && l.to.split('.')[0] !== id);
      els[id].box.remove();
      delete els[id];
      say(`Deleted ${id} and its links.`);
      draw();
    }
    function clearBoard() {
      for (const id of Object.keys(els)) { els[id].box.remove(); delete els[id]; }
      nodes = []; links = [];
    }
    function loadPreset(name) {
      if (running) return;
      const p = PRESETS[name] || PRESETS.kill3;
      clearBoard();
      doorStart = !!p.door;
      for (const [id, type, x, y, f] of p.nodes) addNode(type, [x, y], f, id);
      for (const [from, to] of p.links) links.push({ from, to, kind: pinKind(from) });
      resetWorld(false);
      draw();
      out.replaceChildren();
      say(name === 'kill3' ? 'Preset: kill 3 to open the door. Press "a monster dies" three times.'
        : name === 'toggle' ? 'Preset: toggle switch. Press use on the switch, again and again.'
          : name === 'ambush' ? 'Preset: an ambush. Enter sector 3: the door shuts behind you, and opens three seconds later.'
            : 'An empty board. Add nodes from the palette above.');
    }
    const byId = (id) => nodes.find((n) => n.id === id);
    function pinKind(key) {
      const [id, name] = key.split('.');
      const n = byId(id);
      const spec = n && T[n.type];
      const all = spec ? [...spec.ins, ...spec.outs] : [];
      const p = all.find(([x]) => x === name);
      return p && p[1] === 'exec' ? 'exec' : 'data';
    }
    function pinType(key, dir) {
      const [id, name] = key.split('.');
      const spec = T[byId(id).type];
      const p = (dir === 'in' ? spec.ins : spec.outs).find(([x]) => x === name);
      return p ? p[1] : null;
    }

    // --- drawing links -----------------------------------------------------
    function centre(key) {
      const [id, name] = key.split('.');
      const dot = els[id] && els[id].pins[name];
      if (!dot) return { x: 0, y: 0 };
      const b = board.getBoundingClientRect(), r = dot.getBoundingClientRect();
      return { x: (r.left + r.width / 2 - b.left) / S, y: (r.top + r.height / 2 - b.top) / S };
    }
    function curve(a, b) {
      const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
      return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
    }
    let temp = null;
    let lit = new Set();
    function draw() {
      svg.replaceChildren();
      links.forEach((l, i) => {
        const d = curve(centre(l.from), centre(l.to));
        const on = lit.has(i);
        // As the studio draws them: exec white, data green, whatever the pin's type.
        const col = l.kind === 'exec' ? 'var(--text)' : 'var(--ok)';
        const p = document.createElementNS(SVGNS, 'path');
        p.setAttribute('d', d);
        p.setAttribute('style', `fill:none;stroke:${on ? 'var(--select)' : col};stroke-width:${on ? 4 : l.kind === 'exec' ? 2.5 : 2};pointer-events:none`);
        const hit = document.createElementNS(SVGNS, 'path');
        hit.setAttribute('d', d);
        hit.setAttribute('style', 'fill:none;stroke:transparent;stroke-width:12;cursor:pointer;pointer-events:stroke');
        hit.addEventListener('click', () => { if (running) return; links.splice(i, 1); say(`Link ${l.from} → ${l.to} deleted.`); draw(); });
        svg.append(p, hit);
      });
      if (temp) {
        const p = document.createElementNS(SVGNS, 'path');
        p.setAttribute('d', curve(temp.a, temp.b));
        p.setAttribute('style', 'fill:none;stroke:var(--accent);stroke-width:2;stroke-dasharray:5 4');
        svg.append(p);
      }
    }

    function dragNode(e, n) {
      if (running) return;
      e.preventDefault();
      const start = { x: e.clientX, y: e.clientY, px: n.x, py: n.y };
      const box = els[n.id].box;
      const move = (ev) => {
        n.x = Math.max(0, Math.min(BOARD_W - NODE_W, start.px + (ev.clientX - start.x) / S));
        n.y = Math.max(0, Math.min(BOARD_H - 60, start.py + (ev.clientY - start.y) / S));
        box.style.left = n.x + 'px'; box.style.top = n.y + 'px';
        draw();
      };
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
      addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    }

    // Can a data value of type `a` go into a pin of type `b`?
    const fitsType = (a, b) => GROUP[a] === 'value' || GROUP[b] === 'value' || GROUP[a] === GROUP[b];

    board.addEventListener('pointerdown', (e) => {
      const pinEl = e.target.closest('[data-pin]');
      if (!pinEl || running) return;
      e.preventDefault();
      if (pinEl.dataset.dir !== 'out') { say('Start from an output pin, on the right of a node. Links run left to right.'); return; }
      const from = pinEl.dataset.pin, kind = pinEl.dataset.kind, type = pinEl.dataset.type;
      const b = board.getBoundingClientRect();
      temp = { a: centre(from), b: { x: (e.clientX - b.left) / S, y: (e.clientY - b.top) / S } };
      for (const p of board.querySelectorAll('[data-pin]')) {
        if (p.dataset.dir !== 'in' || p.dataset.pin.split('.')[0] === from.split('.')[0]) continue;
        if (p.dataset.kind === kind && (kind === 'exec' || fitsType(type, p.dataset.type))) p.firstChild.style.boxShadow = '0 0 0 3px var(--select)';
      }
      draw();
      const move = (ev) => { const bb = board.getBoundingClientRect(); temp.b = { x: (ev.clientX - bb.left) / S, y: (ev.clientY - bb.top) / S }; draw(); };
      const up = (ev) => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
        for (const p of board.querySelectorAll('[data-pin]')) p.firstChild.style.boxShadow = '';
        temp = null;
        const hitEl = document.elementFromPoint(ev.clientX, ev.clientY);
        const target = hitEl && hitEl.closest && hitEl.closest('[data-pin]');
        if (!target || target.dataset.dir !== 'in') { draw(); return; }
        const to = target.dataset.pin;
        if (to.split('.')[0] === from.split('.')[0]) { say('A node cannot feed itself.'); draw(); return; }
        if (target.dataset.kind !== kind) { say('Exec links to exec, data to data.', 'var(--error)'); draw(); return; }
        if (kind === 'data' && !fitsType(type, target.dataset.type)) {
          say(`${from} gives ${a(type)} and ${to} wants ${a(target.dataset.type)}. The lab refuses this link. The studio would let you draw it, but the node would not do what you meant when it ran.`, 'var(--error)');
          draw(); return;
        }
        const before = links.length;
        links = links.filter((l) => !(kind === 'exec' && l.from === from) && !(kind === 'data' && l.to === to));
        links.push({ from, to, kind });
        say(`Linked ${from} → ${to}.${links.length <= before ? ' It replaced the link it would have broken.' : ''}`);
        draw();
      };
      addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    });
    const a = (t) => (t === 'entity' ? 'an entity' : t === 'bool' ? 'true or false' : t === 'sector' ? 'a sector number' : t === 'number' ? 'a number' : 'a value');

    // --- the world -------------------------------------------------------
    function resetWorld(announce) {
      for (const t of timers) clearTimeout(t);
      timers = [];
      world = { monsters: [true, true, true], door: doorStart, flash: null, inSector: false, sound: null };
      vars = { ...VARS };
      spent = new Set();
      drawWorld();
      if (announce) say(`The world is reset: three imps, the door ${doorStart ? 'open' : 'shut'}, kills 0, door_open false. Pending delays are dropped.`);
    }
    function svgEl(tag, attrs, text) {
      const e = document.createElementNS(SVGNS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (text != null) e.textContent = text;
      return e;
    }
    function drawWorld() {
      pic.replaceChildren();
      const txt = (x, y, s, size = 9, col = 'var(--text-2)') => pic.append(svgEl('text', { x, y, style: `font:${size}px var(--mono);fill:${col}` }, s));
      // Sector 2: the switch room. Sector 7: the door. Sector 3: the room beyond.
      pic.append(svgEl('rect', { x: 8, y: 22, width: 110, height: 90, rx: 4, style: 'fill:var(--raised);stroke:var(--line-strong)' }));
      txt(12, 18, 'sector 2');
      pic.append(svgEl('rect', { x: 150, y: 22, width: 142, height: 90, rx: 4, style: `fill:${world.inSector ? 'color-mix(in srgb, var(--when) 25%, var(--raised))' : 'var(--raised)'};stroke:var(--line-strong)` }));
      txt(154, 18, 'sector 3');
      // The door: a block that shrinks as its ceiling rises.
      pic.append(svgEl('rect', { x: 118, y: 52, width: 32, height: 30, style: 'fill:var(--sunken);stroke:var(--line)' }));
      const dh = world.door ? 4 : 30;
      pic.append(svgEl('rect', { x: 120, y: 52, width: 28, height: dh, style: `fill:var(--when);transition:height .4s` }));
      txt(118, 96, 'door 7', 8);
      txt(118, 106, world.door ? 'open' : 'shut', 8, world.door ? 'var(--ok)' : 'var(--error)');
      // The switch, on sector 2's wall.
      pic.append(svgEl('rect', { x: 10, y: 60, width: 7, height: 16, style: `fill:${world.flash === 'switch' ? 'var(--select)' : 'var(--accent)'}` }));
      txt(20, 72, 'switch', 8);
      // The player, and the imps in sector 3.
      pic.append(svgEl('circle', { cx: world.inSector ? 175 : 70, cy: 90, r: 6, style: 'fill:var(--info)' }));
      world.monsters.forEach((alive, i) => {
        const cx = 200 + i * 30, cy = 50;
        pic.append(svgEl('circle', { cx, cy, r: 8, style: `fill:${alive ? 'var(--error)' : 'none'};stroke:var(--error);opacity:${alive ? 1 : 0.45}` }));
        if (!alive) pic.append(svgEl('path', { d: `M${cx - 6},${cy - 6}L${cx + 6},${cy + 6}M${cx + 6},${cy - 6}L${cx - 6},${cy + 6}`, style: 'stroke:var(--error);stroke-width:2' }));
        txt(cx - 9, cy + 20, `imp${i + 1}`, 8);
      });
      if (world.sound) txt(238, 104, `♪ ${world.sound}`, 10, 'var(--select)');
      varsBox.replaceChildren(...Object.entries(vars).map(([k, v]) => h('div', {}, `${k} = ${show(v)}`)),
        h('div', { style: 'color:var(--text-dim)' }, `once passed: ${spent.size ? [...spent].join(', ') : 'none'}`));
    }
    function flashSound(name) {
      world.sound = name; drawWorld();
      const t = setTimeout(() => { world.sound = null; drawWorld(); }, 1400 * speed);
      timers.push(t);
    }

    // --- events ----------------------------------------------------------
    const PLAYER = { ent: 'player' };
    function evDies() {
      const i = world.monsters.indexOf(true);
      if (i < 0) { say('No monsters are left. Press "reset the world".'); return; }
      world.monsters[i] = false; drawWorld();
      fire('dies', { entity: { ent: `imp${i + 1}` }, by: PLAYER }, `imp${i + 1} dies (killed by the player).`);
    }
    function evUse() {
      world.flash = 'switch'; drawWorld();
      timers.push(setTimeout(() => { world.flash = null; drawWorld(); }, 500));
      fire('wall', { entity: PLAYER, sector: 2 }, 'The player presses use on the switch.');
    }
    function evEnter() {
      world.inSector = true; drawWorld();
      timers.push(setTimeout(() => { world.inSector = false; drawWorld(); }, 1500 * speed));
      fire('sector', { entity: PLAYER, sector: 3 }, 'The player walks into sector 3.');
    }
    function fire(kind, ev, what) {
      queue = queue.then(async () => {
        say('— ' + what, 'var(--when)');
        const starts = nodes.filter((n) => T[n.type].start === kind && (kind !== 'sector' || String(n.f.sector) === String(ev.sector)));
        if (!starts.length) {
          const any = nodes.some((n) => T[n.type].start === kind);
          say(any ? '  A start node listens for this, but its filter does not match: nothing runs.' : '  No start node on the board listens for this, so nothing runs.');
          return;
        }
        // In the order the nodes are in the file, as the engine does.
        for (const s of starts) await run(s.id, 'then', ev, false);
      });
    }

    // --- the run ---------------------------------------------------------
    let running = false;
    function light(id, how) {
      const box = els[id] && els[id].box;
      if (!box) return;
      const c = how === 'stop' ? 'var(--error)' : how === 'data' ? 'var(--info)' : 'var(--select)';
      box.style.borderColor = how ? c : 'var(--line-strong)';
      box.style.boxShadow = how ? `0 0 0 3px ${c}` : '0 2px 6px rgba(0,0,0,.25)';
    }
    const execNext = (id, exit) => {
      const i = links.findIndex((l) => l.from === `${id}.${exit}` && l.kind === 'exec');
      return i < 0 ? null : { i, id: links[i].to.split('.')[0], pin: links[i].to.split('.')[1] };
    };
    const linkInto = (id, pin) => links.find((l) => l.to === `${id}.${pin}` && l.kind === 'data');

    async function run(startId, exit, ev, later) {
      running = true;
      const memo = new Map();
      const start = byId(startId);
      if (!start) { running = false; return; }
      light(startId, 'on');
      say(later ? `  ${startId}: the delay is over. A new run carries on from here, with the same event.` : `  ${startId} (${start.type}) starts a run.`);
      await wait(450 * speed);
      light(startId, null);

      // Data: pulled when needed; a pure node is worked out once per run.
      function valueOf(id, outPin) {
        const n = byId(id);
        if (!n) return undefined;
        const spec = T[n.type];
        if (spec.start) return ev[outPin];
        const key = `${id}.${outPin}`;
        if (memo.has(key)) { say(`    ${id} → ${show(memo.get(key))} (worked out already in this run)`, 'var(--text-dim)'); return memo.get(key); }
        light(id, 'data');
        timers.push(setTimeout(() => light(id, null), 500 * speed));
        let v;
        const pull = (p) => pullFrom(n, p);
        if (n.type === 'get_var') { v = vars[n.f.var]; say(`    get_var ${n.f.var} → ${show(v)}`, 'var(--info)'); }
        else if (n.type === 'compare') {
          const x = pull('a'), y = pull('b'), op = n.f.op;
          if (op === '==') v = x === y; else if (op === '~=') v = x !== y;
          else if (typeof x !== 'number' || typeof y !== 'number') v = false;
          else v = op === '<' ? x < y : op === '<=' ? x <= y : op === '>' ? x > y : x >= y;
          say(`    compare: ${show(x)} ${op} ${show(y)} → ${v}`, 'var(--info)');
        }
        if (spec.pure) memo.set(key, v);
        return v;
      }
      function pullFrom(n, pin) {
        const l = linkInto(n.id, pin);
        if (l) { const [sid, sp] = l.from.split('.'); return valueOf(sid, sp); }
        return n.f[pin] !== undefined ? literal(n.f[pin]) : undefined;
      }

      const stack = [[startId, exit]];
      let steps = 0;
      while (stack.length) {
        const [fromId, ex] = stack.pop();
        let nx = execNext(fromId, ex);
        if (!nx && steps === 0 && fromId === startId) say(`  Nothing is linked to ${startId}'s ${ex}: the run ends at once.`);
        while (nx) {
          if (++steps > 256) { say(`  The run went past 256 steps at '${nx.id}' and was stopped -- a loop?`, 'var(--error)'); running = false; return; }
          lit = new Set([nx.i]); draw();
          await wait(250 * speed);
          lit = new Set(); draw();
          if (nx.pin !== 'in') { say(`  That link goes into ${nx.id}.${nx.pin}, which is not an exec input.`); break; }
          const n = byId(nx.id);
          light(n.id, 'on');
          const go = (x) => stack.push([n.id, x]);
          const exitPin = await step(n, ev, (p) => pullFrom(n, p), go);
          await wait(420 * speed);
          light(n.id, exitPin === null ? null : null);
          const prev = n.id;
          nx = exitPin ? execNext(prev, exitPin) : null;
          if (exitPin && !nx) say(`  Nothing is linked to ${prev}'s ${exitPin}: this path ends.`, 'var(--text-dim)');
        }
      }
      drawWorld();
      running = false;
    }

    // One exec node: do it, say which exit to take (null stops this path).
    async function step(n, ev, pull, go) {
      const f = n.f;
      switch (n.type) {
        case 'branch': {
          const v = pull('cond');
          const t = v != null && v !== false;
          say(`  branch: cond is ${show(v)}, so ${t ? 'true' : 'false'}.`);
          return t ? 'true' : 'false';
        }
        case 'once':
          if (spent.has(n.id)) { light(n.id, 'stop'); say(`  once: passed already. The run stops here.`, 'var(--error)'); await wait(400 * speed); drawWorld(); return null; }
          spent.add(n.id); drawWorld();
          say('  once: the first time, so it lets the run through.');
          return 'then';
        case 'delay': {
          const t = pull('ticks');
          if (typeof t !== 'number' || t < 1 || t !== Math.floor(t)) { say(`  node '${n.id}' was given ${show(t)} for 'ticks', which is not a whole number of 1 or more -- skipped.`, 'var(--error)'); return null; }
          say(`  delay: the rest of the run waits ${t} ticks (${(t / 60).toFixed(1)} s).`);
          const timer = setTimeout(() => { queue = queue.then(() => run(n.id, 'then', ev, true)); }, (t / 60) * 1000 * Math.max(speed, 0.5));
          timers.push(timer);
          return null;
        }
        case 'set_var': {
          const v = pull('value');
          vars[f.var] = v; drawWorld();
          say(`  set_var: ${f.var} = ${show(v)}.`);
          return 'then';
        }
        case 'add_var': {
          const v = pull('value');
          const was = vars[f.var];
          vars[f.var] = (typeof was === 'number' ? was : Number(was) || 0) + (Number(v) || 0);
          drawWorld();
          say(`  add_var: ${f.var} was ${show(was)}, now ${show(vars[f.var])}.`);
          return 'then';
        }
        case 'open_door':
        case 'close_door': {
          const l = linkInto(n.id, 'sector');
          const s = l ? pull('sector') : 7;
          if (typeof s !== 'number') { say(`  node '${n.id}' got ${show(s)} for its sector: not a sector, so it does nothing.`, 'var(--error)'); return 'then'; }
          const opening = n.type === 'open_door';
          if (s !== 7) { say(`  ${n.type}: sector ${s} is a room here, not the door. Nothing you can see moves.`); return 'then'; }
          if (world.door === opening) say(`  ${n.type}: the door is ${opening ? 'open' : 'shut'} already.`);
          else say(`  ${n.type}: the door's ceiling ${opening ? 'rises' : 'comes down'}.`, 'var(--ok)');
          world.door = opening; drawWorld();
          return 'then';
        }
        case 'play_sound': {
          const l = linkInto(n.id, 'entity');
          const e = l ? pull('entity') : ev.entity;
          if (!e || typeof e !== 'object') { say(`  play_sound: the linked entity is ${show(e)}, so it does nothing. It never falls back to the event's.`); return 'then'; }
          say(`  play_sound: ${f.sound}, from ${e.ent}${l ? ' (linked)' : " (the event's entity)"}.`, 'var(--ok)');
          flashSound(f.sound);
          return 'then';
        }
      }
      return 'then';
    }

    // --- start ---------------------------------------------------------------
    resetWorld(false);
    requestAnimationFrame(() => {
      fit();
      presetSel.value = PRESETS[opts && opts.preset] ? opts.preset : 'kill3';
      loadPreset(presetSel.value);
    });
    fit();
    if (window.ResizeObserver) new ResizeObserver(() => { fit(); draw(); }).observe(scroller);
  };
})();
