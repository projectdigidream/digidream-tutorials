// graph-toy: a tiny graph board. Four real nodes from docs/GRAPHS.md
// (when_button_pressed, once, open_door, play_sound); drag from an output pin
// on the right of a node to an input pin on the left of another, then press
// "▶ run" to watch the run follow the exec links.
//
// The rules are the studio's: exec pins link to exec pins and data pins to
// data pins; an exec output goes to one place and a data input takes one
// value, so a new link replaces the one it would break. Tap a link to delete it.
(function () {
  window.DNPW = window.DNPW || {};

  const NODES = [
    { id: 'press', type: 'when_button_pressed', field: 'button: use', cat: 'when',
      ins: [], outs: [['then', 'exec'], ['entity', 'data']] },
    { id: 'first', type: 'once', field: 'through the first time only', cat: 'if',
      ins: [['in', 'exec']], outs: [['then', 'exec']] },
    { id: 'door', type: 'open_door', field: 'sector: picked · speed: normal', cat: 'then',
      ins: [['in', 'exec'], ['sector', 'data']], outs: [['then', 'exec']] },
    { id: 'sound', type: 'play_sound', field: 'sound: door_open', cat: 'then',
      ins: [['in', 'exec'], ['entity', 'data']], outs: [['then', 'exec']] },
  ];
  const NODE_W = 150;

  window.DNPW['graph-toy'] = function mount(el) {
    const h = window.DNPh;
    let links = [];            // [{ from: 'press.then', to: 'first.in', kind }]
    let pos = {};              // node id -> { x, y }
    let passedOnce = false;
    let running = false;

    const board = h('div', { style: 'position:relative;height:330px;border-radius:8px;background:var(--sunken);overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;overflow:visible');
    board.append(svg);
    const out = h('div', { class: 'wout', style: 'min-height:3.2em;white-space:pre-wrap' });
    const runBtn = h('button', { class: 'wbtn primary', type: 'button' }, '▶ run');
    const resetBtn = h('button', { class: 'wbtn', type: 'button' }, 'reset');
    const hint = h('span', { class: 'wlabel' }, 'Drag from a pin on the right of a node to one on the left of another. Tap a link to delete it.');
    el.append(board, h('div', { class: 'wrow' }, runBtn, resetBtn, hint), out);

    const nodeEls = {};
    const pinEls = {};
    for (const n of NODES) {
      const head = h('div', { style: `padding:4px 8px;font:600 12px var(--mono);border-radius:7px 7px 0 0;background:color-mix(in srgb, var(--${n.cat}) 30%, var(--raised));color:var(--text);cursor:grab` }, n.type);
      const field = h('div', { style: 'padding:2px 8px 4px;font-size:11px;color:var(--text-2)' }, n.field);
      const rows = h('div', { style: 'display:flex;justify-content:space-between;gap:6px;padding:0 0 6px' });
      const left = h('div', { style: 'display:flex;flex-direction:column;gap:4px' });
      const right = h('div', { style: 'display:flex;flex-direction:column;gap:4px;align-items:flex-end' });
      const pin = (name, kind, dir) => {
        const dot = h('span', { style: `display:inline-block;width:12px;height:12px;border:2px solid ${kind === 'exec' ? 'var(--text)' : 'var(--ok)'};border-radius:${kind === 'exec' ? '2px' : '50%'};background:var(--panel)` });
        const label = h('span', { style: 'font:11px var(--mono);color:var(--text-2)' }, name);
        const p = h('div', { 'data-pin': `${n.id}.${name}`, 'data-dir': dir, 'data-kind': kind,
          style: `display:flex;align-items:center;gap:4px;padding:3px 4px;cursor:crosshair;${dir === 'in' ? 'margin-left:-8px' : 'margin-right:-8px;flex-direction:row-reverse'}` }, dot, label);
        pinEls[`${n.id}.${name}`] = dot;
        return p;
      };
      for (const [name, kind] of n.ins) left.append(pin(name, kind, 'in'));
      for (const [name, kind] of n.outs) right.append(pin(name, kind, 'out'));
      rows.append(left, right);
      const box = h('div', { 'data-node': n.id, style: `position:absolute;width:${NODE_W}px;border:1px solid var(--line-strong);border-radius:8px;background:var(--raised);box-shadow:0 2px 6px rgba(0,0,0,.25);transition:box-shadow .15s, border-color .15s` }, head, field, rows);
      head.addEventListener('pointerdown', (e) => dragNode(e, n.id));
      nodeEls[n.id] = box;
      board.append(box);
    }

    function layout() {
      const w = board.clientWidth || 600;
      if (w >= 4 * NODE_W + 50) {
        const gap = (w - 4 * NODE_W) / 5;
        pos = { press: { x: gap, y: 40 }, first: { x: 2 * gap + NODE_W, y: 120 }, door: { x: 3 * gap + 2 * NODE_W, y: 40 }, sound: { x: 4 * gap + 3 * NODE_W, y: 160 } };
      } else {
        const x2 = Math.max(NODE_W + 20, w - NODE_W - 10);
        pos = { press: { x: 10, y: 14 }, first: { x: x2, y: 40 }, door: { x: 10, y: 180 }, sound: { x: x2, y: 200 } };
      }
      place();
    }
    function place() {
      for (const n of NODES) { nodeEls[n.id].style.left = pos[n.id].x + 'px'; nodeEls[n.id].style.top = pos[n.id].y + 'px'; }
      draw();
    }

    function centre(key) {
      const b = board.getBoundingClientRect();
      const r = pinEls[key].getBoundingClientRect();
      return { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top };
    }
    function curve(a, b) {
      const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
      return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
    }
    let temp = null;
    function draw(lit) {
      svg.replaceChildren();
      links.forEach((l, i) => {
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const on = lit && lit.has(i);
        p.setAttribute('d', curve(centre(l.from), centre(l.to)));
        p.setAttribute('style', `fill:none;stroke:${on ? 'var(--select)' : l.kind === 'exec' ? 'var(--text)' : 'var(--ok)'};stroke-width:${on ? 4 : 2.5};cursor:pointer;pointer-events:stroke`);
        p.addEventListener('click', () => { if (running) return; links.splice(i, 1); say(`Link ${l.from} → ${l.to} deleted.`); draw(); });
        svg.append(p);
      });
      if (temp) {
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', curve(temp.a, temp.b));
        p.setAttribute('style', 'fill:none;stroke:var(--accent);stroke-width:2;stroke-dasharray:5 4');
        svg.append(p);
      }
    }
    const say = (t) => { out.textContent = t; };

    // Dragging a node by its header.
    function dragNode(e, id) {
      if (running) return;
      e.preventDefault();
      const start = { x: e.clientX, y: e.clientY, px: pos[id].x, py: pos[id].y };
      const move = (ev) => {
        pos[id] = { x: Math.max(0, Math.min(board.clientWidth - NODE_W, start.px + ev.clientX - start.x)), y: Math.max(0, Math.min(board.clientHeight - 60, start.py + ev.clientY - start.y)) };
        place();
      };
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    }

    // Dragging a link out of an output pin.
    board.addEventListener('pointerdown', (e) => {
      const pin = e.target.closest('[data-pin]');
      if (!pin || running) return;
      e.preventDefault();
      if (pin.dataset.dir !== 'out') { say('Start from an output pin, on the right of a node. Links run left to right.'); return; }
      const from = pin.dataset.pin, kind = pin.dataset.kind;
      const b = board.getBoundingClientRect();
      temp = { a: centre(from), b: { x: e.clientX - b.left, y: e.clientY - b.top } };
      // Light up every input this link could reach.
      for (const p of board.querySelectorAll('[data-pin]')) {
        if (p.dataset.dir === 'in' && p.dataset.kind === kind && p.dataset.pin.split('.')[0] !== from.split('.')[0]) p.firstChild.style.boxShadow = '0 0 0 3px var(--select)';
      }
      draw();
      const move = (ev) => { temp.b = { x: ev.clientX - b.left, y: ev.clientY - b.top }; draw(); };
      const up = (ev) => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up);
        for (const p of board.querySelectorAll('[data-pin]')) p.firstChild.style.boxShadow = '';
        temp = null;
        const hit = document.elementFromPoint(ev.clientX, ev.clientY);
        const target = hit && hit.closest && hit.closest('[data-pin]');
        if (!target || target.dataset.dir !== 'in') { draw(); return; }
        const to = target.dataset.pin;
        if (to.split('.')[0] === from.split('.')[0]) { say('A node cannot link to itself.'); draw(); return; }
        if (target.dataset.kind !== kind) { say(`${from} is a ${kind} pin and ${to} is a ${target.dataset.kind} pin: exec goes to exec, data to data.`); draw(); return; }
        const before = links.length;
        // An exec output goes to one place; a data input takes one value.
        links = links.filter((l) => !(kind === 'exec' && l.from === from) && !(kind === 'data' && l.to === to));
        links.push({ from, to, kind });
        say(`Linked ${from} → ${to}.${links.length <= before ? ' It replaced the link it would have broken.' : ''}`);
        draw();
      };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    });

    function light(id, how) {
      const box = nodeEls[id];
      box.style.borderColor = how ? (how === 'stop' ? 'var(--error)' : 'var(--select)') : 'var(--line-strong)';
      box.style.boxShadow = how ? `0 0 0 3px ${how === 'stop' ? 'var(--error)' : 'var(--select)'}` : '0 2px 6px rgba(0,0,0,.25)';
    }
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    runBtn.addEventListener('click', async () => {
      if (running) return;
      running = true; runBtn.disabled = true; resetBtn.disabled = true;
      const lines = ['A player presses use.'];
      const lit = new Set();
      let cur = 'press';
      let stopped = false;
      light(cur, 'on'); say(lines.concat('when_button_pressed fires.').join('\n')); lines.push('when_button_pressed fires.');
      draw(lit);
      await wait(600);
      for (let steps = 0; steps < 10; steps++) {
        const i = links.findIndex((l) => l.from === `${cur}.then`);
        if (i < 0) { lines.push(steps === 0 ? 'Nothing is linked to its then exit, so the run ends at once.' : `Nothing is linked after ${NODES.find((n) => n.id === cur).type}: the run ends.`); break; }
        lit.add(i); draw(lit);
        await wait(350);
        light(cur, null);
        cur = links[i].to.split('.')[0];
        if (links[i].to !== `${cur}.in`) { lines.push('That link goes into a data pin, not "in".'); break; }
        if (cur === 'first') {
          if (passedOnce) { stopped = true; light(cur, 'stop'); lines.push('once: passed already. Never again: the run stops here.'); say(lines.join('\n')); await wait(700); light(cur, null); break; }
          passedOnce = true; lines.push('once: the first time, so it lets the run through.');
        } else if (cur === 'door') {
          const s = links.some((l) => l.to === 'door.sector');
          lines.push(`open_door: the door's ceiling rises${s ? ' (sector from the link)' : ' (the sector picked on the map)'}.`);
        } else if (cur === 'sound') {
          const ent = links.some((l) => l.from === 'press.entity' && l.to === 'sound.entity');
          lines.push(`play_sound: door_open, from ${ent ? 'the entity linked in, the player who pressed' : 'the event\'s entity, as the entity pin is unlinked'}.`);
        }
        light(cur, 'on'); say(lines.join('\n'));
        await wait(600);
      }
      light(cur, null); draw();
      lines.push(stopped ? 'Press reset to start over.' : passedOnce ? 'Press ▶ run again: once will not let a second run through.' : '');
      say(lines.join('\n').trim());
      running = false; runBtn.disabled = false; resetBtn.disabled = false;
    });

    resetBtn.addEventListener('click', () => {
      links = []; passedOnce = false;
      for (const n of NODES) light(n.id, null);
      layout();
      say('Start by linking when_button_pressed\'s then to once\'s in.');
    });

    requestAnimationFrame(() => { layout(); say('Start by linking when_button_pressed\'s then to once\'s in.'); });
    if (window.ResizeObserver) {
      let lastW = 0;
      new ResizeObserver(() => { const w = board.clientWidth; if (Math.abs(w - lastW) > 40) { lastW = w; layout(); } else draw(); }).observe(board);
    }
  };
})();
