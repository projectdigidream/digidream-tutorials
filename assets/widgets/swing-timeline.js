// swing-timeline: a monster's attack state on a timeline, and the swing it
// starts, seen from above.
//
// A MODEL of the idea, not the engine. What it keeps from the engine:
//   - a mob decides every 8th tick, and a sequence entry's `at` is a deadline
//     checked on those decisions, from the first one AFTER entering: so
//     `at = 0` runs at 8 and `at = 10` at 16;
//   - `swing` starts the mob's swept collider, which is then live for its
//     `ticks` on its own and hits each target at most once;
//   - the collider moves from sweep_from to sweep_to evenly over its ticks
//     (engine/client/src/render/swing.js swingPhase: step 1/(ticks-1)), and
//     covers half_arc either side of where it is (angles in turns).
//
// <div class="widget" data-widget="swing-timeline" data-title="…"></div>
(function () {
  window.DNPW = window.DNPW || {};
  const THINK = 8;
  const TAU = Math.PI * 2;

  window.DNPW['swing-timeline'] = function mount(el) {
    const h = window.DNPh;
    const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888';

    const P = { at: 16, live: 10, state: 40, half: 0.08, sweep: 0.12, reach: 1.5 };
    let t = 0, playing = true, hitAt = null, last = performance.now(), acc = 0;
    // the target: an angle (turns, 0 = straight ahead, + = to the monster's left) and a distance
    const tgt = { a: 0.05, d: 1.2 };

    // Entered on a decision, the state's first look at its sequence is the NEXT
    // decision, 8 ticks later -- so even `at = 0` runs at 8.
    const onDecision = n => Math.max(1, Math.ceil(n / THINK)) * THINK;
    const realAt = () => onDecision(P.at);
    const stateEnd = () => onDecision(P.state);
    const total = () => Math.max(stateEnd(), realAt() + P.live) + 8;

    function colliderAt(tick) {
      const s = realAt();
      if (tick < s || tick >= s + P.live) return null;
      const n = Math.max(1, P.live);
      const phase = n > 1 ? (tick - s) / (n - 1) : 0.5;
      return -P.sweep + (2 * P.sweep) * phase;  // sweep_from = -sweep, sweep_to = +sweep
    }
    const inside = c => c !== null && Math.abs(tgt.a - c) <= P.half && tgt.d <= P.reach + 0.35 + 0.3;

    const tl = h('canvas', { 'aria-label': 'Timeline of the attack state' });
    const top = h('canvas', { 'aria-label': 'The swing from above. Drag the green dot to stand somewhere else.' });
    const code = h('pre', { class: 'wout', style: 'margin:8px 0 0;white-space:pre-wrap;background:var(--code);padding:8px;border-radius:var(--r-c)' });
    const out = h('div', { class: 'wout', style: 'min-height:1.4em' });
    const slider = (label, key, min, max, st, fmt) => {
      const o = h('span', { class: 'wout' }, fmt(P[key]));
      const r = h('input', { type: 'range', min, max, step: st, value: P[key], 'aria-label': label });
      r.addEventListener('input', () => { P[key] = Number(r.value); o.textContent = fmt(P[key]); hitAt = null; });
      return h('label', { class: 'wlabel' }, label + ' ', r, o);
    };
    const playBtn = h('button', { class: 'wbtn' }, '⏸ pause');
    playBtn.addEventListener('click', () => { playing = !playing; playBtn.textContent = playing ? '⏸ pause' : '▶ play'; });
    const stepBtn = h('button', { class: 'wbtn' }, '+1 tick');
    stepBtn.addEventListener('click', () => { playing = false; playBtn.textContent = '▶ play'; advance(); });
    let slow = true;
    const slowBtn = h('button', { class: 'wbtn on' }, '🐢 quarter speed');
    slowBtn.addEventListener('click', () => { slow = !slow; slowBtn.classList.toggle('on', slow); });

    el.append(
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start' }, top, h('div', { style: 'flex:1 1 280px;min-width:0' }, tl, out)),
      h('div', { class: 'wrow' }, playBtn, stepBtn, slowBtn),
      h('div', { class: 'wrow' },
        slider('swing at', 'at', 0, 48, 1, v => String(v)),
        slider('swing ticks', 'live', 1, 30, 1, v => String(v)),
        slider('state ticks', 'state', 8, 90, 1, v => String(v))),
      h('div', { class: 'wrow' },
        slider('half_arc', 'half', 0.02, 0.25, 0.01, v => v.toFixed(2)),
        slider('sweep', 'sweep', 0, 0.25, 0.01, v => '±' + v.toFixed(2)),
        slider('reach', 'reach', 0.5, 3, 0.25, v => v.toFixed(2))),
      code,
      h('p', { class: 'wnote' }, 'A model of the idea, not the engine. Drag the green dot round the monster during the wind-up and see whether the swing still finds you. Angles are turns: 0.125 is 45°.'));

    let tw = 300, th = 150, sz = 220, dpr = 1;
    function resize() {
      dpr = window.devicePixelRatio || 1;
      const full = el.clientWidth - 32 || 400;
      sz = Math.max(180, Math.min(240, full));
      tw = Math.max(260, full >= 560 ? full - sz - 12 : full); th = 150;
      top.width = sz * dpr; top.height = sz * dpr; top.style.width = sz + 'px'; top.style.height = sz + 'px';
      tl.width = tw * dpr; tl.height = th * dpr; tl.style.width = tw + 'px'; tl.style.height = th + 'px';
    }

    // drag the target round the monster
    let drag = false;
    const toTgt = e => {
      const r = top.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * sz - sz / 2, y = (e.clientY - r.top) / r.height * sz - sz / 2;
      const scale = sz / 2 / 3.2;
      tgt.d = Math.max(0.4, Math.min(3.1, Math.hypot(x, y) / scale));
      // up the canvas is "ahead"; counter-clockwise is positive
      let a = Math.atan2(-x, -y) / TAU;
      tgt.a = a;
    };
    top.addEventListener('pointerdown', e => { drag = true; try { top.setPointerCapture(e.pointerId); } catch (_) {} toTgt(e); e.preventDefault(); });
    top.addEventListener('pointermove', e => { if (drag) toTgt(e); });
    top.addEventListener('pointerup', () => { drag = false; }); top.addEventListener('pointercancel', () => { drag = false; });

    function advance() {
      t++;
      if (t >= total()) { t = 0; hitAt = null; }
      const c = colliderAt(t);
      if (hitAt === null && inside(c)) hitAt = t;
    }

    function drawTop() {
      const g = top.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = css('--sunken'); g.fillRect(0, 0, sz, sz);
      const cx = sz / 2, cy = sz / 2, scale = sz / 2 / 3.2;
      // screen angle for a turn offset: ahead is up, positive turns counter-clockwise
      const scr = turns => -Math.PI / 2 - turns * TAU;
      g.strokeStyle = css('--line-soft');
      for (let u = 1; u <= 3; u++) { g.beginPath(); g.arc(cx, cy, u * scale, 0, TAU); g.stroke(); }
      // the whole span the swing will cover
      const R = (P.reach + 0.35) * scale;
      g.fillStyle = css('--line'); g.globalAlpha = 0.5;
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, scr(P.sweep + P.half), scr(-P.sweep - P.half)); g.closePath(); g.fill(); g.globalAlpha = 1;
      const c = colliderAt(t);
      if (c !== null) {
        g.fillStyle = css('--warn'); g.globalAlpha = 0.75;
        g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, scr(c + P.half), scr(c - P.half)); g.closePath(); g.fill(); g.globalAlpha = 1;
      } else if (t < realAt()) {
        // the wind-up: a warning where it will land
        g.strokeStyle = css('--warn'); g.setLineDash([4, 4]);
        g.beginPath(); g.arc(cx, cy, R, scr(P.sweep + P.half), scr(-P.sweep - P.half)); g.stroke(); g.setLineDash([]);
      }
      // the monster, facing up
      g.fillStyle = css('--error'); g.beginPath(); g.arc(cx, cy, 0.35 * scale, 0, TAU); g.fill();
      g.strokeStyle = css('--text'); g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy - 0.6 * scale); g.stroke(); g.lineWidth = 1;
      // the target
      const tx = cx + Math.cos(scr(tgt.a)) * tgt.d * scale, ty = cy + Math.sin(scr(tgt.a)) * tgt.d * scale;
      g.fillStyle = hitAt !== null ? css('--error') : css('--ok');
      g.beginPath(); g.arc(tx, ty, 0.3 * scale, 0, TAU); g.fill();
    }

    function drawTimeline() {
      const g = tl.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = css('--sunken'); g.fillRect(0, 0, tw, th);
      const T = total(), x = k => 10 + (tw - 20) * k / T;
      g.font = '11px ' + css('--mono'); g.textBaseline = 'middle'; g.textAlign = 'left';
      // decisions
      g.strokeStyle = css('--line-soft');
      for (let k = 0; k <= T; k += THINK) { g.beginPath(); g.moveTo(x(k), 18); g.lineTo(x(k), th - 18); g.stroke(); }
      const bar = (y, a, b, col, label) => {
        g.fillStyle = col; g.fillRect(x(a), y - 9, Math.max(2, x(b) - x(a)), 18);
        g.fillStyle = css('--text'); if (label && x(b) - x(a) > 40) g.fillText(label, x(a) + 4, y);
      };
      const s = realAt(), end = stateEnd();
      // row 1: the state
      bar(34, 0, Math.min(s, end), css('--raised'), 'wind-up');
      bar(34, s, Math.min(s + P.live, end), css('--warn'), 'live');
      if (s + P.live < end) bar(34, s + P.live, end, css('--line'), 'recovery');
      if (s + P.live > end) bar(34, end, s + P.live, css('--warn'), 'live (state left)');
      // row 2: the sequence
      g.fillStyle = css('--text-2');
      g.fillText('at ' + P.at + ' → runs at ' + s, x(Math.min(P.at, T - 20)), 64);
      g.strokeStyle = css('--accent'); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x(P.at), 50); g.lineTo(x(P.at), 76); g.stroke(); g.setLineDash([]);
      g.fillStyle = css('--accent'); g.beginPath(); g.arc(x(s), 76, 4, 0, TAU); g.fill();
      // row 3: next
      g.fillStyle = css('--text-2'); g.fillText('state ticks ' + P.state + ' → next at ' + end, x(0), 96);
      g.strokeStyle = css('--text-2'); g.beginPath(); g.moveTo(x(end), 84); g.lineTo(x(end), 108); g.stroke();
      // playhead and hit
      g.strokeStyle = css('--select'); g.lineWidth = 2; g.beginPath(); g.moveTo(x(t), 12); g.lineTo(x(t), th - 12); g.stroke(); g.lineWidth = 1;
      if (hitAt !== null) { g.fillStyle = css('--error'); g.beginPath(); g.arc(x(hitAt), 34, 6, 0, TAU); g.fill(); }
      g.fillStyle = css('--text-dim'); g.fillText('tick ' + t + '   (grey lines: the monster\'s decisions, every 8 ticks)', 10, th - 8);
    }

    function render() {
      drawTop(); drawTimeline();
      out.textContent = hitAt !== null ? 'HIT on tick ' + hitAt + ' — the collider swept through you.' : (t >= realAt() + P.live ? 'Missed: the collider never touched you.' : t < realAt() ? 'Wind-up: ' + (realAt() - t) + ' ticks to move.' : 'Live…');
      const f = n => String(Number(n.toFixed(3)));
      code.textContent =
        'swing = { damage = 12, reach = "' + f(P.reach) + '", half_arc = "' + f(P.half) + '",\n' +
        '          sweep_from = "' + f(-P.sweep) + '", sweep_to = "' + f(P.sweep) + '", ticks = ' + P.live + ' }\n' +
        'attack = { anim = 2, move = "stop", face = "target", ticks = ' + P.state + ', next = "chase",\n' +
        '  sequence = { { at = 0, action = "face" }, { at = ' + P.at + ', action = "swing" } } }';
    }

    function frame(now) {
      if (!el.isConnected) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (playing) { acc += dt * 60 * (slow ? 0.25 : 1); while (acc >= 1) { advance(); acc -= 1; } }
      render();
      requestAnimationFrame(frame);
    }
    resize(); window.addEventListener('resize', resize);
    requestAnimationFrame(frame);
  };
})();
