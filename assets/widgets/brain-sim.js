// brain-sim: a monster's state graph, running, seen from above.
//
// A MODEL of the idea, not the engine. It follows the rules the engine's mob
// runtime keeps (engine/maps/scripts/mobs.lua, docs/MOBS.md):
//   - a monster decides every 8th tick (THINK), at 60 ticks a second;
//   - on a decision: if it has no target, the nearest player inside `sight`
//     becomes its target (distance only, no ray); then its sequence entries
//     that are due run, then its transitions are tried in order (first match
//     wins), then a state whose `ticks` ran out goes to its `next`;
//   - a hit takes hp at once; at 0 it enters `death`; otherwise, if the
//     current state is not `interruptible = false` and a pain state exists,
//     it rolls random(0,255) < pain_chance and enters `pain`;
//   - pain's `next` is "@previous" (engine 0.2.0): when it runs out, the
//     monster goes BACK to the state the hit interrupted and resumes it
//     where it was (its time and its place in its sequence), not from the start.
// The brain is close to the studio's "Melee grunt" recipe (studio/src/editors/recipes.js).
//
// <div class="widget" data-widget="brain-sim" data-title="…"></div>
(function () {
  window.DNPW = window.DNPW || {};

  const THINK = 8;
  const W = 16, H = 10;                       // arena, world units
  const WALL = { x0: 7.2, y0: 2.2, x1: 8.4, y1: 6.6 };

  // The default brain, as the studio writes it. `reach` comes from the slider.
  const STATES = {
    look:   { anim: 0, move: 'stop' },
    chase:  { anim: 1, move: 'chase', interruptible: true },
    attack: { anim: 2, move: 'stop', ticks: 20, next: 'chase', interruptible: true },
    pain:   { anim: 3, move: 'stop', ticks: 10, next: '@previous' },
    death:  { anim: 4, move: 'stop', ticks: 100, next: 'death' }
  };
  // Diagram positions (0..1 of the diagram box) and arrows.
  const POS = { look: [0.2, 0.18], chase: [0.72, 0.18], attack: [0.72, 0.56], pain: [0.2, 0.56], death: [0.72, 0.86], hit: [0.2, 0.86] };
  const ARROWS = [
    { id: 'look>chase', from: 'look', to: 'chase', label: 'has_target ∧ target_visible' },
    { id: 'chase>look', from: 'chase', to: 'look', label: 'not has_target' },
    { id: 'chase>attack', from: 'chase', to: 'attack', label: 'target_within ∧ visible ∧ cooldown_ready' },
    { id: 'attack>chase', from: 'attack', to: 'chase', label: 'ticks 20 → next' },
    { id: 'pain>chase', from: 'pain', to: 'chase', label: 'ticks 10 → back to chase (resumed)' },
    { id: 'pain>attack', from: 'pain', to: 'attack', label: 'ticks 10 → back to attack (resumed)' },
    { id: 'pain>look', from: 'pain', to: 'look', label: 'ticks 10 → back to look (resumed)' },
    { id: 'hurt>pain', from: 'hit', to: 'pain', label: 'hurt: pain_chance' },
    { id: 'hurt>death', from: 'hit', to: 'death', label: 'hp ≤ 0' }
  ];

  function segHitsRect(ax, ay, bx, by, r) {
    // Liang–Barsky clip of segment against an axis-aligned rectangle.
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dy = by - ay;
    const p = [-dx, dx, -dy, dy], q = [ax - r.x0, r.x1 - ax, ay - r.y0, r.y1 - ay];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return false; continue; }
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
  }
  const inRect = (x, y, r, pad) => x > r.x0 - pad && x < r.x1 + pad && y > r.y0 - pad && y < r.y1 + pad;

  window.DNPW['brain-sim'] = function mount(el) {
    const h = window.DNPh;
    const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888';

    const P = { sight: 7, reach: 1.5, speed: 3, pain: 128 };
    let m, player, tick, running = true, log = [], lastArrow = null, lastArrowAt = -999, playerHp = 100, flash = 0;

    function reset() {
      m = { x: 3, y: 5, aim: 0, hp: 30, state: 'look', entered: 0, seqI: 0, target: false, ready: 0, phase: 3, swingAt: -99, prev: null };
      player = { x: 12.5, y: 7.5 };
      tick = 0; log = []; lastArrow = null; playerHp = 100;
      say('spawned in look ★ (the initial state)');
    }
    function say(t) { log.unshift('t=' + String(tick).padStart(4, ' ') + '  ' + t); log = log.slice(0, 9); }

    function enter(name, arrow, why) {
      say(m.state + ' → ' + name + (why ? '   (' + why + ')' : ''));
      // pain remembers what it interrupted, to resume it ("@previous")
      if (name === 'pain' && m.state !== 'pain' && m.state !== 'death') m.prev = { state: m.state, age: tick - m.entered, seqI: m.seqI };
      m.state = name; m.entered = tick; m.seqI = 0;
      lastArrow = arrow; lastArrowAt = tick;
    }

    const dist = () => Math.hypot(player.x - m.x, player.y - m.y);
    const visible = () => !segHitsRect(m.x, m.y, player.x, player.y, WALL);

    // Conditions, by their vocabulary names.
    const C = {
      has_target: () => m.target,
      target_visible: () => m.target && visible(),
      target_within: d => m.target && dist() < d,
      cooldown_ready: () => tick >= m.ready
    };

    function runSequence() {
      if (m.state !== 'attack') return;
      const age = tick - m.entered;
      // sequence: at 0 face · at 10 melee · at 10 set_cooldown ready 60
      const seq = [[0, 'face'], [10, 'melee'], [10, 'set_cooldown']];
      while (m.seqI < seq.length && seq[m.seqI][0] <= age) {
        const [, act] = seq[m.seqI++];
        if (act === 'face') m.aim = Math.atan2(player.y - m.y, player.x - m.x);
        if (act === 'melee') {
          m.swingAt = tick;
          if (dist() < P.reach) { playerHp = Math.max(0, playerHp - 8); flash = 20; say('melee damage 8 range ' + P.reach + ': HIT (you: ' + playerHp + ')'); }
          else say('melee damage 8 range ' + P.reach + ': missed, you were out of range');
        }
        if (act === 'set_cooldown') m.ready = tick + 60;
      }
    }

    function think() {
      if (m.state === 'death') return;
      // Target acquisition: nearest player inside `sight`, no ray.
      if (!m.target && dist() < P.sight) { m.target = true; say('acquired a target (inside sight ' + P.sight + ')'); }
      runSequence();
      const st = STATES[m.state];
      if (m.state === 'look') {
        if (C.has_target() && C.target_visible()) return enter('chase', 'look>chase', 'has_target, target_visible');
      } else if (m.state === 'chase') {
        if (!C.has_target()) return enter('look', 'chase>look', 'has_target negated');
        if (C.target_within(P.reach) && C.target_visible() && C.cooldown_ready()) return enter('attack', 'chase>attack', 'target_within ' + P.reach + ', target_visible, cooldown_ready ready');
      }
      if (st.ticks !== undefined && tick - m.entered >= st.ticks) {
        if (st.next === '@previous' && m.prev) {
          const p = m.prev; m.prev = null;
          say('pain → ' + p.state + '   (ticks ' + st.ticks + ' ran out: back to what it was doing, resumed ' + p.age + ' ticks in)');
          m.state = p.state; m.entered = tick - p.age; m.seqI = p.seqI;
          lastArrow = 'pain>' + p.state; lastArrowAt = tick;
          return;
        }
        const id = m.state === 'attack' ? 'attack>chase' : m.state === 'pain' ? 'pain>chase' : null;
        enter(st.next, id, 'ticks ' + st.ticks + ' ran out → next');
      }
    }

    function drive(dt) {
      const st = STATES[m.state];
      if (m.target && m.state !== 'look' && m.state !== 'death' && m.state !== 'pain') m.aim = Math.atan2(player.y - m.y, player.x - m.x);
      if (st.move !== 'chase' || !m.target) return;
      if (dist() < 0.6) return;
      const a = Math.atan2(player.y - m.y, player.x - m.x);
      let nx = m.x + Math.cos(a) * P.speed * dt, ny = m.y + Math.sin(a) * P.speed * dt;
      // Slide along the wall rather than through it (the real thing follows a route).
      if (inRect(nx, ny, WALL, 0.35)) {
        if (!inRect(nx, m.y, WALL, 0.35)) ny = m.y;
        else if (!inRect(m.x, ny, WALL, 0.35)) nx = m.x;
        else { ny = m.y + Math.sign(ny - m.y || (player.y < (WALL.y0 + WALL.y1) / 2 ? -1 : 1)) * P.speed * dt; nx = m.x; if (inRect(nx, ny, WALL, 0.35)) return; }
      }
      m.x = Math.max(0.4, Math.min(W - 0.4, nx)); m.y = Math.max(0.4, Math.min(H - 0.4, ny));
    }

    function step() {
      tick++;
      if (flash > 0) flash--;
      // Movement is applied every tick on the input set at the last decision.
      drive(1 / 60);
      if ((tick + m.phase) % THINK === 0) think();
    }

    function hit() {
      if (m.state === 'death') return;
      m.hp -= 10;
      say('hit for 10 → hp ' + Math.max(0, m.hp));
      if (m.hp <= 0) { m.target = false; enter('death', 'hurt>death', 'hp ≤ 0; solid false'); return; }
      const st = STATES[m.state];
      const roll = Math.floor(Math.random() * 256);
      if (st.interruptible !== false && roll < P.pain) enter('pain', 'hurt>pain', 'rolled ' + roll + ' < pain_chance ' + P.pain);
      else say('no flinch: rolled ' + roll + ', pain_chance ' + P.pain);
    }

    // ---------------------------------------------------------------- UI
    const arena = h('canvas', { 'aria-label': 'Arena seen from above. Drag the player dot.' });
    const diag = h('canvas', { 'aria-label': 'The state graph, with the current state lit' });
    const logEl = h('pre', { class: 'wout', style: 'margin:8px 0 0;min-height:9.5em;white-space:pre-wrap;background:var(--code);padding:8px;border-radius:var(--r-c)' });
    const stat = h('div', { class: 'wout' });
    const slider = (label, key, min, max, stepv, fmt) => {
      const out = h('span', { class: 'wout' }, fmt(P[key]));
      const r = h('input', { type: 'range', min, max, step: stepv, value: P[key], 'aria-label': label });
      r.addEventListener('input', () => { P[key] = Number(r.value); out.textContent = fmt(P[key]); });
      return h('label', { class: 'wlabel' }, label + ' ', r, out);
    };
    const playBtn = h('button', { class: 'wbtn' }, '⏸ pause');
    playBtn.addEventListener('click', () => { running = !running; playBtn.textContent = running ? '⏸ pause' : '▶ play'; });
    const resetBtn = h('button', { class: 'wbtn' }, '↺ reset');
    resetBtn.addEventListener('click', () => { reset(); });
    const hitBtn = h('button', { class: 'wbtn primary' }, '💥 hit it (10)');
    hitBtn.addEventListener('click', hit);
    const forget = h('button', { class: 'wbtn' }, 'target_none');
    forget.title = 'Forget the target, as the target_none action does';
    forget.addEventListener('click', () => { if (m.target) { m.target = false; say('target_none: forgot the target'); } });

    el.append(
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start' }, arena, diag),
      h('div', { class: 'wrow' }, playBtn, resetBtn, hitBtn, forget, stat),
      h('div', { class: 'wrow' },
        slider('sight', 'sight', 1, 14, 0.5, v => v.toFixed(1)),
        slider('reach', 'reach', 0.5, 4, 0.25, v => v.toFixed(2)),
        slider('speed', 'speed', 0.5, 6, 0.5, v => v.toFixed(1) + '/s'),
        slider('pain_chance', 'pain', 0, 255, 1, v => String(v))),
      logEl,
      h('p', { class: 'wnote' }, 'A model of the idea, not the engine: it runs a brain like the Melee grunt recipe\'s, with the engine\'s rules for thinking every 8 ticks, first-match transitions, the pain roll, and pain going back to what it interrupted. It walks straight at you and slides along the wall, where the real one follows a route. Drag the green dot; put the wall between you to break target_visible.'));

    let aw = 400, ah = 250, dw = 300, dh = 250, dpr = 1;
    function resize() {
      dpr = window.devicePixelRatio || 1;
      const full = el.clientWidth - 32 || 400;
      if (full >= 720) { aw = Math.floor(full * 0.57); dw = full - aw - 12; } else { aw = full; dw = full; }
      ah = Math.round(aw * H / W); dh = Math.max(220, Math.round(dw * 0.75));
      arena.width = aw * dpr; arena.height = ah * dpr; arena.style.width = aw + 'px'; arena.style.height = ah + 'px';
      diag.width = dw * dpr; diag.height = dh * dpr; diag.style.width = dw + 'px'; diag.style.height = dh + 'px';
    }

    // Dragging the player.
    let dragging = false;
    const toWorld = e => { const r = arena.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
    const place = p => { const x = Math.max(0.3, Math.min(W - 0.3, p.x)), y = Math.max(0.3, Math.min(H - 0.3, p.y)); if (!inRect(x, y, WALL, 0.25)) { player.x = x; player.y = y; } };
    arena.addEventListener('pointerdown', e => { dragging = true; try { arena.setPointerCapture(e.pointerId); } catch (_) {} place(toWorld(e)); e.preventDefault(); });
    arena.addEventListener('pointermove', e => { if (dragging) place(toWorld(e)); });
    const up = () => { dragging = false; };
    arena.addEventListener('pointerup', up); arena.addEventListener('pointercancel', up);

    function drawArena() {
      const g = arena.getContext('2d');
      const s = aw / W;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = css('--sunken'); g.fillRect(0, 0, aw, ah);
      g.strokeStyle = css('--line-soft'); g.lineWidth = 1;
      for (let x = 1; x < W; x++) { g.beginPath(); g.moveTo(x * s, 0); g.lineTo(x * s, ah); g.stroke(); }
      for (let y = 1; y < H; y++) { g.beginPath(); g.moveTo(0, y * s); g.lineTo(aw, y * s); g.stroke(); }
      g.fillStyle = css('--line-strong');
      g.fillRect(WALL.x0 * s, WALL.y0 * s, (WALL.x1 - WALL.x0) * s, (WALL.y1 - WALL.y0) * s);
      const mx = m.x * s, my = m.y * s;
      // sight and reach
      g.setLineDash([4, 4]); g.strokeStyle = css('--info'); g.beginPath(); g.arc(mx, my, P.sight * s, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]); g.strokeStyle = css('--warn'); g.beginPath(); g.arc(mx, my, P.reach * s, 0, Math.PI * 2); g.stroke();
      // line to the player
      if (m.target && m.state !== 'death') {
        const vis = visible();
        g.strokeStyle = vis ? css('--ok') : css('--error'); g.setLineDash(vis ? [] : [3, 5]);
        g.beginPath(); g.moveTo(mx, my); g.lineTo(player.x * s, player.y * s); g.stroke(); g.setLineDash([]);
      }
      // swing flash
      if (tick - m.swingAt < 12) {
        g.fillStyle = css('--warn'); g.globalAlpha = 0.35;
        g.beginPath(); g.moveTo(mx, my); g.arc(mx, my, P.reach * s, m.aim - 0.6, m.aim + 0.6); g.closePath(); g.fill(); g.globalAlpha = 1;
      }
      // the monster
      const dead = m.state === 'death';
      g.fillStyle = dead ? css('--text-dim') : m.state === 'pain' ? css('--warn') : css('--error');
      g.beginPath(); g.arc(mx, my, 0.4 * s, 0, Math.PI * 2); g.fill();
      if (!dead) { g.strokeStyle = css('--text'); g.lineWidth = 2; g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + Math.cos(m.aim) * 0.6 * s, my + Math.sin(m.aim) * 0.6 * s); g.stroke(); g.lineWidth = 1; }
      g.fillStyle = css('--text'); g.font = '12px ' + css('--mono'); g.textAlign = 'center';
      g.fillText(m.state, mx, my - 0.6 * s);
      // the player
      g.fillStyle = flash > 0 ? css('--error') : css('--ok');
      g.beginPath(); g.arc(player.x * s, player.y * s, 0.32 * s, 0, Math.PI * 2); g.fill();
      g.fillStyle = css('--text-2'); g.fillText('you', player.x * s, player.y * s + 0.8 * s);
    }

    function box(name) { const [px, py] = POS[name]; return { x: px * dw, y: py * dh, w: Math.min(96, dw * 0.3), h: 30 }; }
    function edge(a, b) {
      // from centre of a to the border of b
      const ax = a.x, ay = a.y, bx = b.x, by = b.y;
      const dx = bx - ax, dy = by - ay;
      const k = Math.min(Math.abs((b.w / 2 + 3) / (dx || 1e-9)), Math.abs((b.h / 2 + 3) / (dy || 1e-9)));
      const ka = Math.min(Math.abs((a.w / 2 + 3) / (dx || 1e-9)), Math.abs((a.h / 2 + 3) / (dy || 1e-9)));
      return [ax + dx * ka, ay + dy * ka, bx - dx * k, by - dy * k];
    }
    function drawDiagram() {
      const g = diag.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = css('--sunken'); g.fillRect(0, 0, dw, dh);
      g.font = '11px ' + css('--mono'); g.textAlign = 'center'; g.textBaseline = 'middle';
      const fresh = tick - lastArrowAt < 50;
      for (const a of ARROWS) {
        const lit = fresh && lastArrow === a.id;
        g.strokeStyle = lit ? css('--select') : css('--line-strong'); g.fillStyle = g.strokeStyle; g.lineWidth = lit ? 2.5 : 1.2;
        const A = box(a.from), B = box(a.to);
        // two arrows between the same pair: offset them sideways
        const pair = ARROWS.some(o => o.from === a.to && o.to === a.from);
        const off = pair ? 7 : 0;
        const nx = -(B.y - A.y), ny = B.x - A.x, nl = Math.hypot(nx, ny) || 1;
        const [x0, y0, x1, y1] = edge({ ...A, x: A.x + nx / nl * off, y: A.y + ny / nl * off }, { ...B, x: B.x + nx / nl * off, y: B.y + ny / nl * off });
        g.setLineDash(a.from === 'hit' ? [4, 4] : []);
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]);
        const ang = Math.atan2(y1 - y0, x1 - x0);
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - 8 * Math.cos(ang - 0.4), y1 - 8 * Math.sin(ang - 0.4)); g.lineTo(x1 - 8 * Math.cos(ang + 0.4), y1 - 8 * Math.sin(ang + 0.4)); g.closePath(); g.fill();
      }
      for (const name of Object.keys(POS)) {
        const b = box(name), on = m.state === name, pseudo = name === 'hit';
        g.setLineDash(pseudo ? [3, 3] : []);
        g.fillStyle = on ? css('--accent') : pseudo ? css('--sunken') : css('--raised');
        g.strokeStyle = on ? css('--accent') : css('--line');
        g.lineWidth = 1;
        g.beginPath(); g.roundRect ? g.roundRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, 6) : g.rect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h); g.fill(); g.stroke();
        g.setLineDash([]);
        g.fillStyle = on ? '#fff' : pseudo ? css('--text-dim') : css('--text');
        g.fillText(pseudo ? 'a hit' : (name === 'look' ? '★ ' : '') + name, b.x, b.y);
      }
      // the label of the arrow just taken
      if (fresh && lastArrow) {
        const a = ARROWS.find(x => x.id === lastArrow);
        g.fillStyle = css('--select'); g.textAlign = 'left';
        g.fillText('→ ' + a.label, 8, (dh * 0.37) | 0);
      }
    }

    function render() {
      drawArena(); drawDiagram();
      const left = Math.max(0, m.ready - tick);
      stat.textContent = 'hp ' + Math.max(0, m.hp) + ' · tick ' + tick + ' · in ' + m.state + ' for ' + (tick - m.entered) + ' · cooldown ' + (left ? left + ' ticks' : 'ready');
      logEl.textContent = log.join('\n');
    }

    let last = performance.now(), acc = 0;
    function frame(now) {
      if (!el.isConnected) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (running) { acc += dt * 60; while (acc >= 1) { step(); acc -= 1; } }
      render();
      requestAnimationFrame(frame);
    }

    reset(); resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(frame);
  };
})();
