// phase-machine: a weapon's phase machine, running, with its shots drawn.
//
// A MODEL of the idea, not the engine. It keeps the rules of the weapon
// runtime (engine/maps/scripts/weapons.lua `tick_player`, the same rules the
// core's step_weapon follows):
//   - 60 ticks a second;
//   - each tick, at most 5 hops: the phase's due sequence entries run once
//     each (`at` is a deadline from entry), then the transitions are tried in
//     order (first match wins), then a phase whose `ticks` ran out goes to its
//     `next` (or the weapon's initial phase);
//   - a phase with no `ticks` waits;
//   - button_pressed / button_released are edges (this tick only), button_held
//     is the level, held_for counts from the tick the button went down;
//   - `consume` only debits the pool: it never stops a shot by itself;
//   - hitscan: `count` rays, each turned by its own roll in -spread..+spread
//     degrees, horizontally; each ray does `damage` to the first body it meets.
// The presets are written in the vocabulary's own shape.
//
// <div class="widget" data-widget="phase-machine" data-title="…" data-preset="pistol"></div>
(function () {
  window.DNPW = window.DNPW || {};

  const HZ = 60;
  const MAX_HOPS = 5;
  const HISTORY = 240;               // ticks shown in the timeline (4 s)

  const held = { cond: 'button_held' };
  const PRESETS = {
    pistol: {
      title: 'pistol', pool: 'bullets', max: 200, start: 50, per: 1, pickup: 10,
      initial: 'ready',
      phases: {
        ready: { transitions: [
          { when: [held, { cond: 'no_ammo' }], to: 'dry' },
          { when: [{ cond: 'button_pressed' }], to: 'fire' }] },
        fire: { ticks: 24, next: 'ready', sequence: [
          { at: 0, action: 'consume' },
          { at: 0, action: 'hitscan', damage: 10, count: 1, spread: 3 }] },
        dry: { ticks: 1, next: 'ready', sequence: [{ at: 0, action: 'switch_if_empty' }] }
      },
      pos: { ready: [0.12, 0.5], fire: [0.7, 0.2], dry: [0.7, 0.82] }
    },
    shotgun: {
      title: 'pump shotgun', pool: 'shells', max: 50, start: 8, per: 1, pickup: 4,
      initial: 'ready',
      phases: {
        ready: { transitions: [
          { when: [held, { cond: 'no_ammo' }], to: 'dry' },
          { when: [{ cond: 'button_pressed' }], to: 'fire' }] },
        fire: { ticks: 20, next: 'pump', sequence: [
          { at: 0, action: 'consume' },
          { at: 0, action: 'hitscan', damage: 10, count: 7, spread: 14 }] },
        pump: { ticks: 31, next: 'ready' },
        dry: { ticks: 1, next: 'ready', sequence: [{ at: 0, action: 'switch_if_empty' }] }
      },
      pos: { ready: [0.1, 0.42], fire: [0.5, 0.15], pump: [0.9, 0.42], dry: [0.5, 0.86] }
    },
    chaingun: {
      title: 'chaingun', pool: 'bullets', max: 200, start: 50, per: 1, pickup: 10,
      initial: 'ready',
      phases: {
        ready: { transitions: [
          { when: [held, { cond: 'no_ammo' }], to: 'dry' },
          { when: [held], to: 'spin' }] },
        spin: { transitions: [
          { when: [{ cond: 'held_for', ticks: 24 }], to: 'fire' },
          { when: [{ cond: 'button_released' }], to: 'ready' }] },
        fire: { ticks: 9, next: 'ready', sequence: [
          { at: 0, action: 'consume' },
          { at: 0, action: 'hitscan', damage: 10, count: 1, spread: 8 }] },
        dry: { ticks: 1, next: 'ready', sequence: [{ at: 0, action: 'switch_if_empty' }] }
      },
      pos: { ready: [0.1, 0.42], spin: [0.5, 0.15], fire: [0.9, 0.42], dry: [0.5, 0.86] }
    },
    // a BFG: one big shot, then 96 ticks before the next, while fire itself
    // lasts only 30 (so the player could switch weapons at once)
    bfg: {
      title: 'bfg (cooldown)', pool: 'cells', max: 300, start: 40, per: 1, pickup: 40,
      initial: 'ready',
      phases: {
        ready: { transitions: [
          { when: [held, { cond: 'no_ammo' }], to: 'dry' },
          { when: [{ cond: 'button_pressed' }, { cond: 'cooldown_ready', var: 'shot_cd' }], to: 'fire' }] },
        fire: { ticks: 30, next: 'ready', sequence: [
          { at: 0, action: 'consume' },
          { at: 0, action: 'hitscan', damage: 80, count: 1, spread: 0 },
          { at: 0, action: 'set_cooldown', var: 'shot_cd', ticks: 96 }] },
        dry: { ticks: 1, next: 'ready', sequence: [{ at: 0, action: 'switch_if_empty' }] }
      },
      pos: { ready: [0.12, 0.5], fire: [0.7, 0.2], dry: [0.7, 0.82] }
    }
  };

  const condText = (c) => c.cond === 'held_for' ? `held_for ${c.ticks}` : c.cond === 'cooldown_ready' ? `cooldown_ready ${c.var}` : c.cond;
  const whenText = (w) => w.map(condText).join(' ∧ ');

  window.DNPW['phase-machine'] = function mount(el, opts) {
    const h = window.DNPh;
    const css = (n, f) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || f || '#888';

    // ------------------------------------------------------------ state
    let P = null;                  // the preset
    let ammo = 0;
    let phase = 'ready', entered = 0, done = new Set();
    let now = 0;
    let input = false, before = false, downSince = null;
    let history = [];              // [{ phase, held, shot, dry }]
    let lastEdge = null, lastEdgeAt = -999;
    let log = '';
    let shots = 0, rays = [], rayAt = -999;
    const targets = [];
    let tally = { shots: 0, rays: 0, hits: 0, damage: 0 };
    let lastShot = null;
    let speed = 1, soundOn = false;
    let cools = {};                // cooldown var -> the tick it is over

    // ------------------------------------------------------------ DOM
    const presetRow = h('div', { class: 'wrow' });
    const presetBtns = {};
    for (const k of Object.keys(PRESETS)) {
      const b = h('button', { class: 'wbtn', type: 'button', onclick: () => load(k) }, PRESETS[k].title);
      presetBtns[k] = b; presetRow.append(b);
    }
    const speedSel = h('select', { onchange: () => { speed = Number(speedSel.value) } },
      h('option', { value: '1' }, '1× (60 ticks/s)'), h('option', { value: '0.25' }, '¼× slow'), h('option', { value: '0.0625' }, '1/16× crawl'));
    const soundBox = h('input', { type: 'checkbox', onchange: () => { soundOn = soundBox.checked; if (soundOn) window.DNPAudio?.ctx() } });
    presetRow.append(h('label', { class: 'wlabel' }, 'speed ', speedSel), h('label', { class: 'wlabel' }, soundBox, 'click sound'));

    const diag = h('canvas', { height: '190', 'aria-label': 'phase diagram' });
    diag.style.width = '100%'; diag.style.height = '190px';
    const tl = h('canvas', { height: '78', 'aria-label': 'tick timeline' });
    tl.style.width = '100%'; tl.style.height = '78px'; tl.style.marginTop = '8px';

    const trigger = h('button', { class: 'wbtn primary', type: 'button', style: 'min-width:150px;min-height:44px;font-weight:700;touch-action:none;user-select:none' }, 'hold to fire');
    const out = h('span', { class: 'wout' });
    const trigRow = h('div', { class: 'wrow' }, trigger,
      h('button', { class: 'wbtn', type: 'button', onclick: () => { ammo = Math.min(P.max, ammo + P.pickup); say(`picked up ${P.pickup} ${P.pool} (capped at ${P.max})`) } }, '+ ammo pickup'),
      h('button', { class: 'wbtn', type: 'button', onclick: () => { ammo = 0; say(`${P.pool} pool emptied`) } }, 'empty the pool'),
      out);
    const msg = h('div', { class: 'wout', style: 'min-height:1.4em' });

    const view = h('canvas', { height: '240', 'aria-label': 'shots seen from above' });
    view.style.width = '100%'; view.style.height = '240px'; view.style.marginTop = '8px';
    const sl = (label, min, max, step, val, fn) => {
      const i = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(val) });
      const o = h('span', { class: 'wout' }, String(val));
      i.addEventListener('input', () => { o.textContent = i.value; fn(Number(i.value)) });
      return { row: h('label', { class: 'wlabel' }, label, i, o), set: (v) => { i.value = String(v); o.textContent = String(v) } };
    };
    let count = 1, spread = 3, range = 10;
    const sCount = sl('count', 1, 20, 1, 1, (v) => { count = v; syncShot() });
    const sSpread = sl('spread°', 0, 30, 1, 3, (v) => { spread = v; syncShot() });
    const sRange = sl('target distance', 2, 30, 1, 10, (v) => { range = v; placeTargets() });
    const tallyOut = h('div', { class: 'wout' });
    const sliders = h('div', { class: 'wrow' }, sCount.row, sSpread.row, sRange.row,
      h('button', { class: 'wbtn', type: 'button', onclick: () => { tally = { shots: 0, rays: 0, hits: 0, damage: 0 }; placeTargets() } }, 'reset tally'));

    el.tabIndex = 0;
    el.append(presetRow, diag, tl, trigRow, msg, view, sliders, tallyOut,
      h('p', { class: 'wnote' }, 'A model of the idea, not the engine. It keeps the weapon runtime\'s rules (60 ticks a second; sequence, then transitions in order, then ticks → next; at most 5 hops a tick), but it draws its own pictures and rolls its own dice. Hold the button, or focus the demo and hold Space. The count and spread sliders change the hitscan step of the fire phase.'));

    // ------------------------------------------------------------ input
    const press = (v) => { input = v; trigger.classList.toggle('on', v) };
    trigger.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { trigger.setPointerCapture(e.pointerId) } catch {}
      if (soundOn) window.DNPAudio?.ctx();
      press(true);
    });
    const up = () => press(false);
    trigger.addEventListener('pointerup', up);
    trigger.addEventListener('pointercancel', up);
    trigger.addEventListener('lostpointercapture', up);
    trigger.addEventListener('keydown', (e) => { if (e.code === 'Space' || e.code === 'Enter') e.preventDefault() });
    el.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
      e.preventDefault();
      if (!e.repeat) { if (soundOn) window.DNPAudio?.ctx(); press(true) }
    });
    el.addEventListener('keyup', (e) => { if (e.code === 'Space') { e.preventDefault(); press(false) } });
    el.addEventListener('blur', () => press(false));

    // ------------------------------------------------------------ the machine
    function say (t) { log = t; msg.textContent = t }

    function load (k) {
      P = PRESETS[k];
      for (const [n, b] of Object.entries(presetBtns)) b.classList.toggle('on', n === k);
      ammo = P.start;
      cools = {};
      phase = P.initial; entered = now; done = new Set();
      history = []; lastEdge = null; downSince = null;
      const hs = fireStep();
      count = hs.count; spread = hs.spread;
      sCount.set(count); sSpread.set(spread);
      tally = { shots: 0, rays: 0, hits: 0, damage: 0 };
      placeTargets();
      say(`${P.title}: ${P.start} ${P.pool}, ${P.per} a shot`);
    }
    function fireStep () { return P.phases.fire.sequence.find((s) => s.action === 'hitscan') }
    function syncShot () { const hs = fireStep(); hs.count = count; hs.spread = spread }

    function hasAmmo (n) { return ammo >= (n ?? P.per) }
    const CONDS = {
      always: () => true,
      button_pressed: () => input && !before,
      button_released: () => !input && before,
      button_held: () => input,
      held_for: (c) => input && downSince !== null && now - downSince >= c.ticks,
      has_ammo: (c) => hasAmmo(c.n),
      no_ammo: () => !hasAmmo(),
      cooldown_ready: (c) => now >= (cools[c.var] ?? 0)
    };

    let tickShot = false, tickDry = false;
    const ACTS = {
      consume: () => { ammo = Math.max(0, ammo - P.per) },
      hitscan: (a) => { fire(a); tickShot = true },
      set_cooldown: (a) => { cools[a.var] = now + a.ticks },
      switch_if_empty: () => {
        tickDry = true;
        if (!hasAmmo()) say(`dry: switch_if_empty would put the best weapon that still has ammunition in your hands. (Here there is no other weapon, so you keep the ${P.title}.)`);
      }
    };

    function enter (to) { phase = to; entered = now; done = new Set() }

    function step () {
      if (input && downSince === null) downSince = now;
      if (!input) downSince = null;
      tickShot = false; tickDry = false;
      let hops = 0;
      for (;;) {
        const ph = P.phases[phase];
        const elapsed = now - entered;
        let jump = null;
        (ph.sequence || []).forEach((s, i) => {
          if (jump || done.has(i) || elapsed < (s.at || 0)) return;
          done.add(i);
          if (s.action === 'goto') jump = s.phase; else ACTS[s.action]?.(s);
        });
        let to = jump, how = jump ? 'goto' : null;
        if (!to) {
          for (const tr of ph.transitions || []) {
            if (tr.when.every((c) => CONDS[c.cond](c))) { to = tr.to; how = whenText(tr.when); break }
          }
        }
        if (!to && ph.ticks !== undefined && elapsed >= ph.ticks) { to = ph.next || P.initial; how = `after ${ph.ticks} ticks` }
        if (!to) break;
        if (++hops > MAX_HOPS) { say('more than 5 hops in one tick: a transition loop. The runtime stops and complains.'); break }
        lastEdge = phase + '>' + to; lastEdgeAt = now;
        enter(to);
      }
      history.push({ phase, held: input, shot: tickShot, dry: tickDry });
      if (history.length > HISTORY) history.shift();
      before = input;
      now++;
    }

    // ------------------------------------------------------------ the shot
    function placeTargets () {
      targets.length = 0;
      for (const x of [-1.2, 0, 1.2]) targets.push({ x, y: range, r: 0.42, hp: 50, flash: -999, down: -1 });
    }
    function fire (a) {
      shots++;
      rays = [];
      let hits = 0, dmg = 0;
      const n = Math.max(1, a.count || 1);
      for (let i = 0; i < n; i++) {
        const deg = (Math.random() * 2 - 1) * (a.spread || 0);
        const ang = deg * Math.PI / 180;
        const dx = Math.sin(ang), dy = Math.cos(ang);
        let best = Infinity, hit = null;
        for (const t of targets) {
          if (t.down >= 0) continue;
          // ray from origin, unit direction: |o + s d - c|^2 = r^2
          const b = dx * t.x + dy * t.y;
          const c = t.x * t.x + t.y * t.y - t.r * t.r;
          const disc = b * b - c;
          if (disc < 0) continue;
          const s = b - Math.sqrt(disc);
          if (s > 0 && s < best) { best = s; hit = t }
        }
        const wall = range + 3;
        const len = hit ? best : wall / Math.max(0.2, dy);
        rays.push({ dx, dy, len: Math.min(len, 60), hit: !!hit });
        if (hit) {
          hits++; dmg += a.damage; hit.hp -= a.damage; hit.flash = now;
          if (hit.hp <= 0) hit.down = now;
        }
      }
      rayAt = now;
      tally.shots++; tally.rays += n; tally.hits += hits; tally.damage += dmg;
      lastShot = { n, hits, dmg };
      if (soundOn) blip(n);
    }
    function blip (n) {
      const ac = window.DNPAudio?.ctx?.();
      if (!ac) return;
      const len = Math.floor(ac.sampleRate * (n > 1 ? 0.09 : 0.05));
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const src = ac.createBufferSource(); src.buffer = buf;
      const g = ac.createGain(); g.gain.value = 0.25;
      src.connect(g).connect(ac.destination); src.start();
    }

    // ------------------------------------------------------------ drawing
    function fit (c, hh) {
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth || 600;
      if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr) }
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, hh);
      return { g, w, hh };
    }
    const COLORS = () => ({
      ready: css('--accent'), fire: css('--error'), dry: css('--text-dim'),
      pump: css('--warn'), spin: css('--info')
    });
    function roundRect (g, x, y, w, hh, r) {
      g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.arcTo(x + w, y + hh, x, y + hh, r);
      g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }
    function drawDiagram () {
      const { g, w, hh } = fit(diag, 190);
      const col = COLORS();
      const NW = 104, NH = 40;
      const at = (n) => [P.pos[n][0] * w, P.pos[n][1] * hh];
      const edges = [];
      for (const [from, ph] of Object.entries(P.phases)) {
        for (const tr of ph.transitions || []) edges.push({ from, to: tr.to, label: whenText(tr.when) });
        if (ph.ticks !== undefined) edges.push({ from, to: ph.next || P.initial, label: `after ${ph.ticks}t`, timed: true });
      }
      g.font = '11px system-ui, sans-serif';
      g.lineWidth = 1.5;
      const labels = [];
      for (const e of edges) {
        const [ax, ay] = at(e.from); const [bx, by] = at(e.to);
        const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L, ny = dx / L, bend = e.timed ? 30 : 22;
        const mx = (ax + bx) / 2 + nx * bend, my = (ay + by) / 2 + ny * bend;
        const fresh = lastEdge === e.from + '>' + e.to && now - lastEdgeAt < 20;
        g.strokeStyle = fresh ? css('--select') : css('--line-strong');
        g.setLineDash(e.timed ? [4, 3] : []);
        // shorten to node edges
        const sx = ax + dx / L * NW * 0.42, sy = ay + dy / L * NH * 0.7;
        const tx = bx - dx / L * NW * 0.42, ty = by - dy / L * NH * 0.7;
        g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(mx, my, tx, ty); g.stroke();
        g.setLineDash([]);
        const ang = Math.atan2(ty - my, tx - mx);
        g.fillStyle = g.strokeStyle;
        g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx - 8 * Math.cos(ang - 0.4), ty - 8 * Math.sin(ang - 0.4));
        g.lineTo(tx - 8 * Math.cos(ang + 0.4), ty - 8 * Math.sin(ang + 0.4)); g.closePath(); g.fill();
        labels.push({ text: e.label, x: (sx + 2 * mx + tx) / 4, y: (sy + 2 * my + ty) / 4, fresh });
      }
      g.font = '11px system-ui, sans-serif'; g.textAlign = 'center';
      for (const l of labels) {
        const tw = g.measureText(l.text).width + 8;
        g.fillStyle = css('--sunken'); g.globalAlpha = 0.85; g.fillRect(l.x - tw / 2, l.y - 9, tw, 15); g.globalAlpha = 1;
        g.fillStyle = l.fresh ? css('--text') : css('--text-2');
        g.fillText(l.text, l.x, l.y + 2);
      }
      for (const n of Object.keys(P.phases)) {
        const [x, y] = at(n);
        const on = n === phase;
        roundRect(g, x - NW / 2, y - NH / 2, NW, NH, 8);
        g.fillStyle = css('--raised'); g.fill();
        if (on) { g.globalAlpha = 0.35; g.fillStyle = col[n] || css('--accent'); g.fill(); g.globalAlpha = 1 }
        g.strokeStyle = on ? (col[n] || css('--accent')) : css('--line-strong');
        g.lineWidth = on ? 2.5 : 1; g.stroke();
        g.fillStyle = css('--text'); g.font = '600 13px system-ui, sans-serif'; g.textAlign = 'center';
        g.fillText((n === P.initial ? '★ ' : '') + n, x, y - 2);
        const ph = P.phases[n];
        g.font = '11px ui-monospace, monospace'; g.fillStyle = css('--text-2');
        const since = now - entered;
        g.fillText(ph.ticks === undefined ? (on ? `waits · ${since}t` : 'waits') : (on ? `${Math.min(since, ph.ticks)}/${ph.ticks}t` : `${ph.ticks}t`), x, y + 13);
      }
    }
    function drawTimeline () {
      const { g, w, hh } = fit(tl, 78);
      const col = COLORS();
      const x0 = 46, cw = (w - x0 - 6) / HISTORY;
      g.font = '11px system-ui, sans-serif'; g.fillStyle = css('--text-dim'); g.textAlign = 'left';
      g.fillText('phase', 4, 24); g.fillText('trigger', 4, 50); g.fillText('shots', 4, 70);
      history.forEach((t, i) => {
        const x = x0 + i * cw;
        g.fillStyle = col[t.phase] || css('--accent');
        g.fillRect(x, 10, Math.max(1, cw + 0.3), 20);
        if (t.held) { g.fillStyle = css('--text-2'); g.fillRect(x, 42, Math.max(1, cw + 0.3), 10) }
        if (t.shot) { g.fillStyle = css('--error'); g.fillRect(x - 1, 58, 3, 14) }
        if (t.dry) { g.fillStyle = css('--text-dim'); g.fillRect(x - 1, 62, 3, 6) }
      });
      // a tick ruler: a mark every 60 ticks (one second)
      g.strokeStyle = css('--line'); g.lineWidth = 1;
      const first = now - history.length;
      for (let i = 0; i < history.length; i++) {
        if ((first + i) % HZ === 0) { const x = x0 + i * cw; g.beginPath(); g.moveTo(x, 6); g.lineTo(x, 74); g.stroke() }
      }
      // legend
      let lx = x0; g.font = '11px system-ui, sans-serif';
      for (const n of Object.keys(P.phases)) {
        g.fillStyle = col[n] || css('--accent'); g.fillRect(lx, 0, 8, 8);
        g.fillStyle = css('--text-2'); g.fillText(n, lx + 11, 8); lx += g.measureText(n).width + 26;
      }
      g.fillStyle = css('--text-dim'); g.textAlign = 'right'; g.fillText('lines = 1 s', w - 6, 8);
    }
    function drawView () {
      const { g, w, hh } = fit(view, 240);
      // Seen from above, aiming to the right: along the aim is x, sideways is y.
      const far = range + 3;
      const k = Math.min((w - 48) / (far + 1), (hh / 2 - 14) / 3.2);
      const ox = 24, oy = hh / 2;
      const X = (along) => ox + along * k, Y = (lat) => oy - lat * k;
      g.font = '11px system-ui, sans-serif';
      // distance marks and the wall
      g.strokeStyle = css('--line-soft'); g.lineWidth = 1; g.fillStyle = css('--text-dim'); g.textAlign = 'left';
      for (let d = 5; d < far; d += 5) { g.beginPath(); g.moveTo(X(d), 0); g.lineTo(X(d), hh); g.stroke(); g.fillText(`${d} u`, X(d) + 3, hh - 4) }
      g.fillStyle = css('--line-strong'); g.fillRect(X(far), 0, 4, hh);
      g.fillStyle = css('--text-dim'); g.fillText('wall', X(far) - 26, 12);
      // the spread cone
      const sp = Math.min(spread, 80) * Math.PI / 180;
      const L = far * 2;
      g.fillStyle = css('--accent'); g.globalAlpha = 0.09;
      g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(Math.cos(sp) * L), Y(Math.sin(sp) * L)); g.lineTo(X(Math.cos(sp) * L), Y(-Math.sin(sp) * L)); g.closePath(); g.fill();
      g.globalAlpha = 1;
      // targets
      for (const t of targets) {
        if (t.down >= 0 && now - t.down > 90) { t.down = -1; t.hp = 50 }
        const r = Math.max(5, t.r * k);
        g.beginPath(); g.arc(X(t.y), Y(t.x), r, 0, Math.PI * 2);
        g.fillStyle = t.down >= 0 ? css('--sunken') : (now - t.flash < 8 ? css('--select') : css('--raised'));
        g.fill(); g.strokeStyle = t.down >= 0 ? css('--text-dim') : css('--error'); g.lineWidth = 1.5; g.stroke();
        g.fillStyle = css('--text-2'); g.textAlign = 'left';
        g.fillText(t.down >= 0 ? 'down' : `${Math.max(0, t.hp)} hp`, X(t.y) + r + 4, Y(t.x) + 4);
      }
      // rays of the last shot, fading over half a second
      const age = now - rayAt;
      if (age < 30) {
        g.globalAlpha = 1 - age / 30;
        for (const r of rays) {
          g.strokeStyle = r.hit ? css('--select') : css('--text-2'); g.lineWidth = 1.5;
          const ex = X(r.dy * r.len), ey = Y(r.dx * r.len);
          g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(ex, ey); g.stroke();
          g.fillStyle = g.strokeStyle; g.beginPath(); g.arc(ex, ey, 2.5, 0, Math.PI * 2); g.fill();
        }
        g.globalAlpha = 1;
      }
      // the player
      g.fillStyle = css('--accent'); g.beginPath(); g.arc(X(0), Y(0), 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = css('--text-dim'); g.textAlign = 'left'; g.fillText('you, from above →', 6, 12);
    }
    function readout () {
      const ph = P.phases[phase];
      const since = now - entered;
      out.textContent = `tick ${now} · ${phase} ${ph.ticks === undefined ? `(waits, ${since}t)` : `${Math.min(since, ph.ticks)}/${ph.ticks}t`} · ${P.pool} ${ammo}/${P.max}${Object.keys(cools).map((k) => ` · cooldown ${k}: ${now >= cools[k] ? 'over' : `${cools[k] - now}t left`}`).join('')}`;
      tallyOut.textContent = `last shot: ${lastShot ? `${lastShot.hits} of ${lastShot.n} rays hit, ${lastShot.dmg} damage` : '—'}  ·  total: ${tally.shots} shots, ${tally.hits}/${tally.rays} rays hit, ${tally.damage} damage`;
    }

    // ------------------------------------------------------------ loop
    let acc = 0, last = performance.now(), visible = true, raf = 0;
    function frame (t) {
      raf = 0;
      const dt = Math.min(0.25, (t - last) / 1000); last = t;
      acc += dt * HZ * speed;
      let n = 0;
      while (acc >= 1 && n < 30) { step(); acc -= 1; n++ }
      drawDiagram(); drawTimeline(); drawView(); readout();
      if (visible) raf = requestAnimationFrame(frame);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => {
        visible = es.some((e) => e.isIntersecting);
        if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame) }
      }).observe(el);
    }
    load(PRESETS[opts && opts.preset] ? opts.preset : 'pistol');
    raf = requestAnimationFrame(frame);
  };
})();
