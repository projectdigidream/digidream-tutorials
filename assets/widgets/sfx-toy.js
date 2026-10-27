// A toy two-layer sound, to show what DigidreamSound's recipes, Randomize,
// Vary, the Shape knobs and per-layer S / M do. It imitates the idea with the
// Web Audio API; it is not the real engine and makes nothing the game can load.
//
// <div class="widget" data-widget="sfx-toy" data-title="…"></div>
(function () {
  window.DNPW = window.DNPW || {};

  // ---- the recipes: each knob has a range; a sound is a position 0..1 on each ----
  // `log` knobs move by ratios (pitches, times), the rest move evenly.
  var RECIPES = [
    { id: 'gunshot', label: 'Gunshot', noise: 'bandpass', wave: 'triangle', knobs: {
      nHz: [700, 2600, 1], nQ: [0.4, 1.6, 0], nMs: [70, 320, 1], nLvl: [0.7, 1, 0],
      t0: [140, 260, 1], t1: [38, 75, 1], tSweep: [25, 90, 1], tMs: [70, 220, 1], tLvl: [0.4, 0.85, 0] } },
    { id: 'explosion', label: 'Explosion', noise: 'lowpass', wave: 'sine', knobs: {
      nHz: [280, 1300, 1], nQ: [0.4, 1.2, 0], nMs: [600, 1500, 1], nLvl: [0.85, 1, 0],
      t0: [85, 150, 1], t1: [28, 45, 1], tSweep: [180, 520, 1], tMs: [380, 950, 1], tLvl: [0.6, 0.95, 0] } },
    { id: 'laser', label: 'Laser / zap', noise: 'bandpass', wave: 'sawtooth', knobs: {
      nHz: [2800, 7000, 1], nQ: [0.8, 3, 0], nMs: [15, 60, 1], nLvl: [0, 0.2, 0],
      t0: [1100, 2600, 1], t1: [140, 420, 1], tSweep: [90, 300, 1], tMs: [140, 360, 1], tLvl: [0.45, 0.7, 0] } },
    { id: 'pickup', label: 'Pickup / blip', noise: 'highpass', wave: 'square', knobs: {
      nHz: [4000, 9000, 1], nQ: [0.5, 1.5, 0], nMs: [8, 30, 1], nLvl: [0, 0.08, 0],
      t0: [480, 900, 1], t1: [950, 2100, 1], tSweep: [35, 120, 1], tMs: [110, 260, 1], tLvl: [0.35, 0.6, 0] } },
  ];
  // Knob order, with the part and quality the real tool would label them with.
  var KNOBS = [
    ['nHz', 'Noise', 'pitch', 'Hz'], ['nQ', 'Noise', 'resonance', ''], ['nMs', 'Noise', 'length', 'ms'], ['nLvl', 'Noise', 'level', ''],
    ['t0', 'Tone', 'pitch start', 'Hz'], ['t1', 'Tone', 'pitch end', 'Hz'], ['tSweep', 'Tone', 'pitch sweep', 'ms'],
    ['tMs', 'Tone', 'length', 'ms'], ['tLvl', 'Tone', 'level', ''],
  ];
  var SR = 44100;

  function denorm(r, u) { return r[2] ? r[0] * Math.pow(r[1] / r[0], u) : r[0] + (r[1] - r[0]) * u; }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function gauss() { var u = 1 - Math.random(), v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function fmt(x, unit) {
    if (unit === 'Hz') return x >= 1000 ? (x / 1000).toFixed(2) + ' kHz' : Math.round(x) + ' Hz';
    if (unit === 'ms') return Math.round(x) + ' ms';
    return x.toFixed(2);
  }
  // A fixed noise, so the same knobs always give the same sound (the real
  // engine is seeded the same way).
  function noiseData(n) {
    var a = 12345, out = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      out[i] = (((t ^ t >>> 14) >>> 0) / 4294967296) * 2 - 1;
    }
    return out;
  }

  window.DNPW['sfx-toy'] = function mount(el) {
    var h = window.DNPh;
    var css = function (n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888'; };
    var Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Off) { el.append(h('p', { class: 'wnote' }, 'This browser cannot render audio offline, so the demo is off.')); return; }

    var st = {
      recipe: RECIPES[0], u: {}, shape: { vol: 0, pitch: 0, len: 0, bright: 0 },
      norm: 1, relevel: true, solo: -1, mute: [false, false], playOnChange: true,
      layers: null, mix: null, seq: 0,
    };
    var src = null, playStart = 0, playLen = 0, raf = 0;

    // ---- building blocks ----
    var btn = function (text, title, on) { var b = h('button', { class: 'wbtn', type: 'button', title: title }, text); b.addEventListener('click', on); return b; };
    var recipeRow = h('div', { class: 'wrow' });
    var recipeBtns = RECIPES.map(function (r) {
      var b = btn(r.label, 'a new ' + r.label.toLowerCase() + ' sound', function () { fromRecipe(r); });
      recipeRow.append(b); return b;
    });
    var playBtn = btn('▶', 'play (Space while the demo has focus)', function () { play(); });
    playBtn.classList.add('primary');
    var randBtn = btn('Randomize', 'another sound of the same kind (R)', function () { randomize(); });
    var varyBtn = btn('Vary', 'the same sound, a little different (V)', function () { vary(); });
    var poc = h('input', { type: 'checkbox' }); poc.checked = true;
    poc.addEventListener('change', function () { st.playOnChange = poc.checked; });
    var lenBadge = h('span', { class: 'wout' }), peakBadge = h('span', { class: 'wout' });
    var fixBtn = btn('Fix level', 'set the volume so the loudest moment is at −6 dB', function () { fixLevel(); });
    fixBtn.hidden = true;

    var cv = h('canvas', { height: '200', style: 'width:100%;height:200px' });

    var laneRow = h('div', { class: 'wrow' });
    var smBtns = [];
    ['1 · Noise', '2 · Tone'].forEach(function (name, li) {
      var s = btn('S', 'hear this layer alone', function () { st.solo = st.solo === li ? -1 : li; st.mute = [false, false]; remix(); paintSM(); play(); });
      var m = btn('M', 'hear the sound without this layer', function () { st.solo = -1; st.mute[li] = !st.mute[li]; remix(); paintSM(); play(); });
      smBtns.push([s, m]);
      laneRow.append(h('span', { class: 'wlabel' }, h('span', { style: 'display:inline-block;width:10px;height:10px;border-radius:50%;background:' + (li ? 'var(--warn)' : 'var(--wave)') }), name), s, m);
    });
    var hearAll = btn('Hear everything', 'back to the whole sound', function () { st.solo = -1; st.mute = [false, false]; remix(); paintSM(); play(); });
    laneRow.append(hearAll);

    // ---- sliders ----
    function slider(label, min, max, step, get, set, show, def, title) {
      var input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step) });
      var out = h('span', { class: 'wout', style: 'min-width:70px;display:inline-block' });
      var name = h('span', { title: (title ? title + ' — ' : '') + 'double-click to reset', style: 'cursor:pointer;min-width:92px;display:inline-block' }, label);
      var sync = function () { input.value = String(get()); out.textContent = show(get()); };
      input.addEventListener('input', function () { set(Number(input.value)); out.textContent = show(get()); rerender(false); });
      input.addEventListener('change', function () { if (st.playOnChange) play(); });
      name.addEventListener('dblclick', function () { set(def); sync(); rerender(false).then(function () { if (st.playOnChange) play(); }); });
      sync();
      return { el: h('label', { class: 'wlabel', style: 'min-width:300px' }, name, input, out), sync: sync };
    }
    var sh = st.shape;
    var shapeSliders = [
      slider('Volume', -40, 12, 0.5, function () { return sh.vol; }, function (v) { sh.vol = v; }, function (v) { return (v > 0 ? '+' : '') + v.toFixed(1) + ' dB'; }, 0, 'how loud, in decibels'),
      slider('Pitch', -24, 24, 0.5, function () { return sh.pitch; }, function (v) { sh.pitch = v; }, function (v) { return (v > 0 ? '+' : '') + v + ' st'; }, 0, 'tones and the noise filter move together'),
      slider('Length', -2, 2, 0.05, function () { return sh.len; }, function (v) { sh.len = v; }, function (v) { return '×' + Math.pow(2, v).toFixed(2); }, 0, 'stretches every time in the sound'),
      slider('Brightness', -1, 1, 0.05, function () { return sh.bright; }, function (v) { sh.bright = v; }, function (v) { return (v > 0 ? '+' : '') + Math.round(v * 100) + '%'; }, 0, 'moves every filter darker or brighter'),
    ];
    var knobBox = h('div');
    var knobSliders = [];
    function buildKnobs() {
      knobBox.innerHTML = ''; knobSliders = [];
      var group = null, row = null;
      KNOBS.forEach(function (k) {
        if (k[1] !== group) {
          group = k[1];
          knobBox.append(h('div', { class: 'wlabel', style: 'margin-top:8px;font-weight:600;color:var(--text)' }, group));
          row = h('div', { class: 'wrow', style: 'margin:4px 0' }); knobBox.append(row);
        }
        var s = slider(k[2], 0, 1, 0.001, function () { return st.u[k[0]]; }, function (v) { st.u[k[0]] = v; },
          function (u) { return fmt(denorm(st.recipe.knobs[k[0]], u), k[3]); }, 0.5, k[1] + ' · ' + k[2]);
        row.append(s.el); knobSliders.push(s);
      });
    }

    var recipeTitle = h('div', { class: 'wlabel', style: 'margin-top:12px;font-weight:700;color:var(--accent)' });
    el.append(
      recipeRow,
      h('div', { class: 'wrow' }, playBtn, randBtn, varyBtn, h('label', { class: 'wlabel' }, poc, 'Play on change'), lenBadge, peakBadge, fixBtn),
      cv, laneRow,
      h('div', { class: 'wlabel', style: 'margin-top:12px;font-weight:700;color:var(--accent)' }, 'Shape'),
      h('div', { class: 'wrow' }, shapeSliders.map(function (s) { return s.el; })),
      recipeTitle, knobBox,
      h('p', { class: 'wnote' }, 'A toy that imitates the idea in your browser — two layers, four recipes, nine knobs. The real DigidreamSound has thirteen kinds, up to four layers per take, rings, takes and its own engine. Nothing made here can be saved or loaded by the game.')
    );
    el.tabIndex = 0;
    el.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var k = e.key.toLowerCase();
      if (k === ' ') { if (/BUTTON|INPUT/.test(e.target.tagName) && e.target.type !== 'range') return; e.preventDefault(); play(); }
      else if (k === 'r') { e.preventDefault(); randomize(); }
      else if (k === 'v') { e.preventDefault(); vary(); }
    });

    // ---- what the buttons do ----
    function fromRecipe(r) {
      st.recipe = r;
      st.shape.vol = 0; st.shape.pitch = 0; st.shape.len = 0; st.shape.bright = 0;
      randomU(); st.relevel = true;
      refreshControls(); rerender(true).then(play);
    }
    function randomU() { KNOBS.forEach(function (k) { st.u[k[0]] = Math.random(); }); }
    function randomize() { randomU(); st.relevel = true; refreshControls(); rerender(true).then(play); }
    function vary() {
      KNOBS.forEach(function (k) { st.u[k[0]] = clamp01(st.u[k[0]] + gauss() * 0.07); });
      st.relevel = true; refreshControls(); rerender(true).then(play);
    }
    function fixLevel() {
      var p = rawPeak();
      if (p > 0) st.shape.vol = Math.max(-40, Math.min(12, Math.round(40 * Math.log10(0.5 / (p * st.norm))) / 2));
      refreshControls(); remix(); if (st.playOnChange) play();
    }
    function refreshControls() {
      recipeBtns.forEach(function (b, i) { b.classList.toggle('on', RECIPES[i] === st.recipe); });
      recipeTitle.textContent = st.recipe.label + ' recipe';
      shapeSliders.forEach(function (s) { s.sync(); });
      knobSliders.forEach(function (s) { s.sync(); });
    }
    function paintSM() {
      smBtns.forEach(function (p, li) { p[0].classList.toggle('on', st.solo === li); p[1].classList.toggle('on', st.mute[li]); });
      hearAll.hidden = !(st.solo >= 0 || st.mute[0] || st.mute[1]);
    }

    // ---- rendering: each layer on its own, offline ----
    function params() {
      var K = st.recipe.knobs, u = st.u, s = st.shape;
      var p = {}; KNOBS.forEach(function (k) { p[k[0]] = denorm(K[k[0]], u[k[0]]); });
      var pr = Math.pow(2, s.pitch / 12), lm = Math.pow(2, s.len), br = Math.pow(2, s.bright * 2);
      var hz = function (x) { return Math.max(20, Math.min(18000, x)); };
      return {
        nType: st.recipe.noise, nHz: hz(p.nHz * pr * br), nQ: p.nQ, nDec: p.nMs * lm / 1000, nLvl: p.nLvl,
        wave: st.recipe.wave, t0: hz(p.t0 * pr), t1: hz(p.t1 * pr), tSweep: p.tSweep * lm / 1000, tDec: p.tMs * lm / 1000, tLvl: p.tLvl,
        tCut: hz(5000 * Math.pow(2, s.bright * 2.5)),
      };
    }
    function env(g, level, dec) {
      g.gain.setValueAtTime(0, 0);
      g.gain.linearRampToValueAtTime(level, 0.003);
      g.gain.exponentialRampToValueAtTime(Math.max(level * 1e-4, 1e-6), 0.003 + dec);
      g.gain.setValueAtTime(0, 0.004 + dec);
    }
    function renderLayer(li, p, n) {
      var oc = new Off(1, n, SR);
      var g = oc.createGain();
      g.connect(oc.destination);
      if (li === 0) {
        if (p.nLvl < 1e-4) return Promise.resolve(new Float32Array(n));
        var buf = oc.createBuffer(1, n, SR); buf.getChannelData(0).set(noiseData(n));
        var s = oc.createBufferSource(); s.buffer = buf;
        var f = oc.createBiquadFilter(); f.type = p.nType; f.frequency.value = p.nHz; f.Q.value = p.nQ;
        s.connect(f); f.connect(g); env(g, p.nLvl, p.nDec); s.start(0);
      } else {
        var o = oc.createOscillator(); o.type = p.wave;
        o.frequency.setValueAtTime(p.t0, 0);
        o.frequency.exponentialRampToValueAtTime(p.t1, Math.max(0.005, p.tSweep));
        var lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = p.tCut; lp.Q.value = 0.5;
        o.connect(lp); lp.connect(g); env(g, p.tLvl * 0.5, p.tDec); o.start(0); o.stop(0.01 + p.tDec);
      }
      return oc.startRendering().then(function (b) { return b.getChannelData(0); });
    }
    function rerender(levelling) {
      var my = ++st.seq, p = params();
      var dur = Math.min(6, Math.max(p.nLvl > 1e-4 ? p.nDec : 0, p.tDec) + 0.03);
      var n = Math.max(256, Math.round(dur * SR));
      return Promise.all([renderLayer(0, p, n), renderLayer(1, p, n)]).then(function (ls) {
        if (my !== st.seq) return;
        st.layers = ls;
        // Every generated sound is levelled to −6 dB before you hear it.
        if (levelling && st.relevel) { var pk = rawPeak(); st.norm = pk > 0 ? 0.5 / pk : 1; st.relevel = false; }
        remix();
      });
    }
    function rawPeak() {
      if (!st.layers) return 0;
      var a = st.layers[0], b = st.layers[1], pk = 0;
      for (var i = 0; i < a.length; i++) pk = Math.max(pk, Math.abs(a[i] + b[i]));
      return pk;
    }
    function remix() {
      if (!st.layers) return;
      var on = [0, 1].map(function (li) { return st.solo >= 0 ? st.solo === li : !st.mute[li]; });
      var gain = st.norm * Math.pow(10, st.shape.vol / 20);
      var a = st.layers[0], b = st.layers[1], m = new Float32Array(a.length);
      for (var i = 0; i < a.length; i++) m[i] = ((on[0] ? a[i] : 0) + (on[1] ? b[i] : 0)) * gain;
      st.mix = m;
      draw();
    }

    // ---- drawing: the heard waveform, then one lane per layer ----
    function draw(playFrac) {
      var dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 600, H = 200;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(H * dpr); }
      var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, H);
      if (!st.mix) return;
      var top = 120, mid = top / 2, half = top / 2 - 6;
      var scale = half / 1.4;   // 0 dB sits below the top, so "too loud" has room to show
      var n = st.mix.length, pk = 0, cols = Math.max(1, Math.floor(w));
      var wave = css('--wave'), warn = css('--warn'), err = css('--error'), dim = css('--text-dim');
      for (var x = 0; x < cols; x++) {
        var i0 = Math.floor(x * n / cols), i1 = Math.max(i0 + 1, Math.floor((x + 1) * n / cols)), lo = 0, hi = 0;
        for (var i = i0; i < i1; i++) { var v = st.mix[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
        pk = Math.max(pk, hi, -lo);
        var over = hi > 1 || lo < -1;
        g.fillStyle = over ? err : wave;
        var yh = mid - Math.min(1.4, hi) * scale, yl = mid - Math.max(-1.4, lo) * scale;
        g.fillRect(x, yh, 1, Math.max(1, yl - yh));
      }
      g.strokeStyle = warn; g.setLineDash([4, 4]); g.lineWidth = 1;
      [mid - scale, mid + scale].forEach(function (y) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke(); });
      g.setLineDash([]);
      // lanes
      var colours = [wave, warn];
      [0, 1].forEach(function (li) {
        var on = st.solo >= 0 ? st.solo === li : !st.mute[li];
        var y0 = top + 8 + li * 36, lm = y0 + 15, d = st.layers[li], lp = 1e-6;
        for (var i = 0; i < d.length; i++) lp = Math.max(lp, Math.abs(d[i]));
        g.globalAlpha = on ? 1 : 0.25; g.fillStyle = colours[li];
        for (var x = 0; x < cols; x++) {
          var i0 = Math.floor(x * n / cols), i1 = Math.max(i0 + 1, Math.floor((x + 1) * n / cols)), a = 0;
          for (var i = i0; i < i1; i++) a = Math.max(a, Math.abs(d[i]));
          a /= Math.max(lp, 0.2);
          if (a < 0.004) continue;
          g.fillRect(x, lm - a * 14, 1, Math.max(1, a * 28));
        }
        g.globalAlpha = 1;
      });
      g.fillStyle = dim; g.font = '11px ' + css('--mono');
      g.fillText('0', 2, H - 2); var ms = Math.round(n / SR * 1000); var t = ms + ' ms'; g.fillText(t, w - g.measureText(t).width - 2, H - 2);
      if (playFrac != null) { g.fillStyle = css('--accent'); g.fillRect(Math.round(playFrac * w), 0, 2, H); }
      lenBadge.textContent = 'length ' + ms + ' ms';
      var db = pk > 0 ? 20 * Math.log10(pk) : -99;
      peakBadge.textContent = 'peak ' + (db > -99 ? db.toFixed(1) : '−∞') + ' dB' + (pk > 1 ? ' · too loud' : '');
      peakBadge.style.color = pk > 1 ? err : '';
      fixBtn.hidden = !(pk > 1 || (pk > 0 && db < -24));
      fixBtn.textContent = pk > 1 ? 'Fix level' : 'Make louder';
    }

    // ---- playing: only ever from a click or a key ----
    function play() {
      if (!st.mix) return;
      var ctx = window.DNPAudio && window.DNPAudio.ctx();
      if (!ctx) return;
      if (src) { try { src.stop(); } catch (e) {} }
      var b = ctx.createBuffer(1, st.mix.length, SR); b.getChannelData(0).set(st.mix);
      src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start();
      playStart = ctx.currentTime; playLen = b.duration;
      cancelAnimationFrame(raf);
      var tick = function () {
        var f = (ctx.currentTime - playStart) / playLen;
        if (f >= 1) { draw(); return; }
        draw(f); raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    if ('ResizeObserver' in window) new ResizeObserver(function () { draw(); }).observe(cv);
    buildKnobs(); randomU(); paintSM(); refreshControls(); rerender(true);
  };
})();
