// Envelope + filter demo for the Music track (music/03-patches.html).
// A DAHDSR envelope with the patch editor's names (dly A H D S R), draggable
// on a canvas, shaping a WebAudio oscillator through a lowpass filter. It is a
// sketch of the idea, not the synth engine.
(function () {
  window.DNPW = window.DNPW || {};

  // The patch editor's curve shapes (tool/lib/patch-editor.js, CURVES).
  const CURVES = {
    linear: (p) => p,
    exp: (p) => (1 - Math.exp(-6 * p)) / (1 - Math.exp(-6)),
  };
  const LIMITS = { dl: [0, 2000], a: [0, 4000], h: [0, 2000], d: [0, 4000], s: [0, 1], r: [0, 6000] };
  const SUS_MS = 600;       // how wide the held part is drawn, in ms of the scale
  const KEYS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k'];
  const NOTES = [60, 62, 64, 65, 67, 69, 71, 72];
  const NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'];

  window.DNPW['adsr'] = function mount(el) {
    const h = window.DNPh;
    const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const env = { dl: 0, a: 30, h: 0, d: 300, s: 0.6, r: 500 };
    let curve = 'exp';
    let wave = 'sawtooth';
    let cutoff = 2400, reso = 4;

    // ---------- canvas ----------
    const canvas = h('canvas', { height: '180', 'aria-label': 'envelope: drag the handles' });
    canvas.style.width = '100%';
    canvas.style.height = '180px';
    let scale = null;           // ms per px, frozen while dragging
    const PAD = 14;
    const total = () => env.dl + env.a + env.h + env.d + SUS_MS + env.r;
    function geom() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth || 400, hh = 180;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr); }
      const msPerPx = scale || Math.max(1200, total() * 1.1) / (w - 2 * PAD);
      return { dpr, w, hh, msPerPx, x: (ms) => PAD + ms / msPerPx, y: (lv) => hh - PAD - lv * (hh - 2 * PAD - 12) };
    }
    // Handle positions: [key, ms, level, which axes move]
    function points() {
      let t = 0;
      const p = [];
      p.push({ k: null, t: 0, lv: 0 });
      t += env.dl; p.push({ k: 'dl', t, lv: 0, label: 'dly' });
      t += env.a; p.push({ k: 'a', t, lv: 1, label: 'A' });
      t += env.h; p.push({ k: 'h', t, lv: 1, label: 'H' });
      t += env.d; p.push({ k: 'd', t, lv: env.s, label: 'D', ys: true });
      t += SUS_MS; p.push({ k: 's', t, lv: env.s, label: 'S', yOnly: true });
      t += env.r; p.push({ k: 'r', t, lv: 0, label: 'R' });
      return p;
    }
    let playMark = null;        // {t} ms into the drawn envelope while a note sounds
    function draw() {
      const G = geom();
      const g = canvas.getContext('2d');
      g.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
      g.clearRect(0, 0, G.w, G.hh);
      const acc = css('--accent') || '#5b8fd6', dim = css('--text-dim') || '#888', line = css('--line') || '#333', txt = css('--text-2') || '#aaa';
      // grid: 0 and full
      g.strokeStyle = line; g.lineWidth = 1;
      g.beginPath(); g.moveTo(PAD, G.y(0)); g.lineTo(G.w - PAD, G.y(0)); g.moveTo(PAD, G.y(1)); g.lineTo(G.w - PAD, G.y(1)); g.stroke();
      const P = points();
      // sustain zone
      g.fillStyle = line;
      g.globalAlpha = 0.35;
      g.fillRect(G.x(P[4].t), G.y(1), G.x(P[5].t) - G.x(P[4].t), G.y(0) - G.y(1));
      g.globalAlpha = 1;
      g.fillStyle = dim; g.font = '11px system-ui, sans-serif';
      g.fillText('key held', G.x(P[4].t) + 4, G.y(1) + 12);
      // the shape
      g.strokeStyle = acc; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(G.x(0), G.y(0));
      g.lineTo(G.x(P[1].t), G.y(0));
      seg(g, G, P[1], P[2], 'attack');
      g.lineTo(G.x(P[3].t), G.y(1));
      seg(g, G, P[3], P[4], 'fall');
      g.lineTo(G.x(P[5].t), G.y(env.s));
      seg(g, G, P[5], P[6], 'fall');
      g.stroke();
      // handles
      for (const p of P) {
        if (!p.k) continue;
        g.fillStyle = p.k === drag?.k ? (css('--select') || '#fd0') : acc;
        g.beginPath(); g.arc(G.x(p.t), G.y(p.lv), 6, 0, Math.PI * 2); g.fill();
        g.fillStyle = txt;
        const dx = p.k === 'a' ? -14 : p.k === 'h' ? 8 : -4;
        g.fillText(p.label, G.x(p.t) + dx, p.lv > 0.85 ? G.y(p.lv) + 20 : G.y(p.lv) - 10);
      }
      if (playMark) {
        const lv = levelAt(playMark.t);
        g.fillStyle = css('--ok') || '#7ad48a';
        g.beginPath(); g.arc(G.x(Math.min(playMark.t, total())), G.y(lv), 4, 0, Math.PI * 2); g.fill();
      }
    }
    // A curved stage from p to q. Rising uses the attack curve, falling the decay/release one.
    function seg(g, G, p, q, kind) {
      const n = 24;
      for (let i = 1; i <= n; i++) {
        const f = i / n;
        const c = CURVES[curve](f);
        const lv = p.lv + (q.lv - p.lv) * c;
        g.lineTo(G.x(p.t + (q.t - p.t) * f), G.y(lv));
      }
    }
    // Level of the drawn envelope at ms t (for the moving dot).
    function levelAt(t) {
      const P = points();
      for (let i = 1; i < P.length; i++) {
        if (t <= P[i].t) {
          const a = P[i - 1], b = P[i];
          const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
          const flat = a.lv === b.lv;
          return flat ? a.lv : a.lv + (b.lv - a.lv) * CURVES[curve](f);
        }
      }
      return 0;
    }

    // ---------- dragging ----------
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
      const G = geom();
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      let best = null, bd = 18;
      for (const p of points()) {
        if (!p.k) continue;
        const d = Math.hypot(G.x(p.t) - x, G.y(p.lv) - y);
        // Handles at the same spot (a 0 ms stage): grabbing right of it takes the later one.
        if (d < bd - 0.5 || (best && Math.abs(d - bd) <= 0.5 && x > G.x(p.t))) { bd = d; best = p; }
      }
      if (!best) return;
      scale = G.msPerPx;
      drag = { k: best.k, x0: x, v0: env[best.k], s0: env.s };
      canvas.setPointerCapture(e.pointerId);
      draw();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const G = geom();
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const lvl = Math.max(0, Math.min(1, (G.hh - PAD - y) / (G.hh - 2 * PAD - 12)));
      if (drag.k === 's') env.s = round(lvl, 's');
      else {
        env[drag.k] = round(drag.v0 + (x - drag.x0) * G.msPerPx, drag.k);
        if (drag.k === 'd') env.s = round(lvl, 's');
      }
      sync(); draw();
    });
    const endDrag = () => { if (!drag) return; drag = null; scale = null; draw(); };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    function round(v, k) {
      const [lo, hi] = LIMITS[k];
      v = Math.max(lo, Math.min(hi, v));
      return k === 's' ? Math.round(v * 100) / 100 : Math.round(v);
    }

    // ---------- readouts ----------
    const inputs = {};
    const field = (k, label, title) => {
      const inp = h('input', { type: 'number', min: LIMITS[k][0], max: LIMITS[k][1], step: k === 's' ? '0.01' : '1', title, style: 'width:64px' });
      inp.value = env[k];
      inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (!isNaN(v)) { env[k] = round(v, k); draw(); } });
      inp.addEventListener('change', () => { inp.value = env[k]; });
      inputs[k] = inp;
      return h('label', { class: 'wlabel' }, label, inp);
    };
    function sync() { for (const k in inputs) if (document.activeElement !== inputs[k]) inputs[k].value = env[k]; }
    const sel = (label, opts, val, on) => {
      const s = h('select', {});
      for (const [v, t] of opts) { const o = h('option', { value: v }, t); if (v === val) o.selected = true; s.append(o); }
      s.addEventListener('change', () => on(s.value));
      return h('label', { class: 'wlabel' }, label, s);
    };
    const slider = (label, min, max, val, fmt, on) => {
      const out = h('span', { class: 'wout' }, fmt(val));
      const r = h('input', { type: 'range', min, max, value: val, step: 'any' });
      r.addEventListener('input', () => { const v = on(+r.value); out.textContent = fmt(v); });
      return h('label', { class: 'wlabel' }, label, r, out);
    };

    // ---------- sound ----------
    const voices = new Map();     // id -> {osc, filt, amp, t0}: keys held now
    const releasing = new Set();  // voices in their release
    let raf = 0;
    function noteOn(id, midi) {
      const ac = window.DNPAudio && window.DNPAudio.ctx();
      if (!ac || voices.has(id)) return;
      const now = ac.currentTime + 0.005;
      const osc = ac.createOscillator();
      osc.type = wave;
      osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
      const filt = ac.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = cutoff;
      filt.Q.value = reso;
      const amp = ac.createGain();
      const peak = 0.25;
      amp.gain.setValueAtTime(0, now);
      let t = now + env.dl / 1000;
      amp.gain.setValueAtTime(0, t);
      t = ramp(amp.gain, t, 0, peak, env.a / 1000);
      t += env.h / 1000;
      amp.gain.setValueAtTime(peak, t);
      ramp(amp.gain, t, peak, peak * env.s, env.d / 1000);
      osc.connect(filt).connect(amp).connect(ac.destination);
      osc.start(now);
      voices.set(id, { osc, filt, amp, t0: performance.now(), peak, ac, held: true });
      tick();
    }
    // Piecewise-linear steps following the chosen curve; returns the end time.
    function ramp(param, t0, from, to, dur) {
      if (dur <= 0) { param.setValueAtTime(to, t0); return t0; }
      const n = 16;
      for (let i = 1; i <= n; i++) param.linearRampToValueAtTime(from + (to - from) * CURVES[curve](i / n), t0 + dur * i / n);
      return t0 + dur;
    }
    function noteOff(id) {
      const v = voices.get(id);
      if (!v || !v.held) return;
      v.held = false;
      const ms = performance.now() - v.t0;
      const lv = held(ms) * v.peak;
      const now = v.ac.currentTime;
      v.amp.gain.cancelScheduledValues(now);
      v.amp.gain.setValueAtTime(lv, now);
      const end = ramp(v.amp.gain, now, lv, 0, Math.max(0.005, env.r / 1000));
      v.osc.stop(end + 0.05);
      v.rel = { at: performance.now() };
      voices.delete(id);
      releasing.add(v);
      v.osc.onended = () => { releasing.delete(v); };
    }
    // Level (0..1) while the key is held, ms after note-on.
    function held(ms) {
      const P = points();
      if (ms >= P[4].t) return env.s;
      return levelAt(ms);
    }
    // Move the dot along the drawing for the newest voice.
    function tick() {
      cancelAnimationFrame(raf);
      const step = () => {
        const list = [...voices.values()], rel = [...releasing];
        const v = list[list.length - 1] || rel[rel.length - 1];
        if (!v) { playMark = null; draw(); return; }
        const ms = performance.now() - v.t0;
        const P = points();
        if (v.held) playMark = { t: ms >= P[4].t ? P[4].t + Math.min(SUS_MS, ms - P[4].t) : ms };
        else {
          // Place the dot on the release slope at the level it is at.
          const f = Math.min(1, (performance.now() - v.rel.at) / Math.max(1, env.r));
          if (f >= 1 && !list.length && rel.length <= 1) { playMark = null; draw(); return; }
          playMark = { t: P[5].t + f * env.r };
        }
        draw();
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }

    // ---------- keyboard ----------
    const keyBtns = NOTES.map((n, i) => {
      const b = h('button', { type: 'button', class: 'wbtn', style: 'min-width:40px;touch-action:none', title: 'key ' + KEYS[i].toUpperCase() },
        h('div', {}, NAMES[i]), h('small', { style: 'opacity:.6' }, KEYS[i].toUpperCase()));
      const down = (e) => { e.preventDefault(); b.classList.add('on'); noteOn('p' + i, n); };
      const up = () => { b.classList.remove('on'); noteOff('p' + i); };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointerleave', up);
      b.addEventListener('pointercancel', up);
      return b;
    });
    el.tabIndex = 0;
    el.addEventListener('keydown', (e) => {
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const i = KEYS.indexOf(e.key.toLowerCase());
      if (i < 0) return;
      e.preventDefault();
      keyBtns[i].classList.add('on');
      noteOn('k' + i, NOTES[i]);
    });
    el.addEventListener('keyup', (e) => {
      const i = KEYS.indexOf(e.key.toLowerCase());
      if (i < 0) return;
      keyBtns[i].classList.remove('on');
      noteOff('k' + i);
    });
    el.addEventListener('focusout', (e) => {
      if (el.contains(e.relatedTarget)) return;
      for (let i = 0; i < KEYS.length; i++) { keyBtns[i].classList.remove('on'); noteOff('k' + i); }
    });

    el.append(
      canvas,
      h('div', { class: 'wrow' },
        field('dl', 'dly', 'delay before the attack, ms'),
        field('a', 'A', 'attack, ms'),
        field('h', 'H', 'hold at full, ms'),
        field('d', 'D', 'decay, ms'),
        field('s', 'S', 'sustain level, 0 to 1'),
        field('r', 'R', 'release, ms'),
        sel('curve', [['linear', 'linear'], ['exp', 'exp']], curve, (v) => { curve = v; draw(); })),
      h('div', { class: 'wrow' },
        sel('wave', [['sine', 'sine'], ['triangle', 'triangle'], ['sawtooth', 'saw'], ['square', 'square']], wave, (v) => { wave = v; }),
        slider('cutoff', 0, 1000, Math.round(1000 * Math.log(cutoff / 60) / Math.log(12000 / 60)),
          () => Math.round(cutoff) + ' Hz',
          (v) => { cutoff = 60 * Math.pow(12000 / 60, v / 1000); for (const x of [...voices.values(), ...releasing]) x.filt.frequency.value = cutoff; return v; }),
        slider('resonance', 0.5, 20, reso, () => reso.toFixed(1),
          (v) => { reso = v; for (const x of [...voices.values(), ...releasing]) x.filt.Q.value = reso; return v; })),
      h('div', { class: 'wrow' }, ...keyBtns),
      h('p', { class: 'wnote' }, 'Drag the handles, or type the times. Press and hold a key (or click the demo, then hold A–K): the sound holds at S while the key is down and releases when you let go.'),
    );
    new ResizeObserver(() => draw()).observe(canvas);
    draw();
  };
})();
