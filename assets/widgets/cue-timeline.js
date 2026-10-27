// Cue timing demo for the Music track (music/05-loops-and-cues.html).
// Two looping pieces drawn as bars with a moving playhead. "▶ now",
// "⇥ next bar" and "⇥ at loop end" queue a switch to the other piece and mark
// where it will land; "⇄ fade" crossfades now. Silent unless "sound" is ticked.
(function () {
  window.DNPW = window.DNPW || {};

  window.DNPW['cue-timeline'] = function mount(el, opts) {
    const h = window.DNPh;
    const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const BEATS = 4;                       // 4/4
    let bars = +(opts && opts.bars) || 8;
    const bpm = +(opts && opts.bpm) || 132;
    const PIECES = [
      { name: 'calm', color: '--wave', tone: [523.25, 392], type: 'triangle' },
      { name: 'fight', color: '--when', tone: [196, 146.83], type: 'square' },
    ];

    let playing = false;
    let cur = 0;               // index of the playing piece
    let pos = 0;               // beats into the current piece's loop
    let loops = 0;             // loops completed of the current piece
    let queued = null;         // { to, at: beat in the current loop, mode }
    let fade = null;           // { from, fromPos, t0, ms }
    let last = 0;
    let raf = 0;
    let sound = false;

    const loopBeats = () => bars * BEATS;
    const other = () => 1 - cur;
    const secPerBeat = () => 60 / bpm;

    // ---------- UI ----------
    const canvas = h('canvas', { height: '150', 'aria-label': 'two pieces as bars, with the playhead' });
    canvas.style.width = '100%';
    canvas.style.height = '150px';
    const status = h('div', { class: 'wout' }, 'Press ▶ play, then queue a switch.');
    const playBtn = h('button', { type: 'button', class: 'wbtn primary', onclick: () => (playing ? stop() : start()) }, '▶ play');
    const btnNow = h('button', { type: 'button', class: 'wbtn', onclick: () => request('now') }, '▶ now');
    const btnBar = h('button', { type: 'button', class: 'wbtn', onclick: () => request('nextBar') }, '⇥ next bar');
    const btnEnd = h('button', { type: 'button', class: 'wbtn', onclick: () => request('loopEnd') }, '⇥ at loop end');
    const btnFade = h('button', { type: 'button', class: 'wbtn', onclick: () => request('fade') }, '⇄ fade');
    const btnCancel = h('button', { type: 'button', class: 'wbtn', onclick: cancel }, '✕ cancel queued');
    const fadeMs = h('input', { type: 'number', min: '20', max: '8000', step: '50', value: '800', style: 'width:70px' });
    const barsSel = h('select', {}, h('option', { value: '4' }, '4 bars'), h('option', { value: '8' }, '8 bars'));
    barsSel.value = String(bars);
    barsSel.addEventListener('change', () => { bars = +barsSel.value; pos = pos % loopBeats(); queued = null; draw(); refresh(); });
    const soundChk = h('input', { type: 'checkbox' });
    soundChk.addEventListener('change', () => { sound = soundChk.checked; if (sound && window.DNPAudio) window.DNPAudio.ctx(); });

    el.append(
      canvas,
      h('div', { class: 'wrow' }, playBtn, btnNow, btnBar, btnEnd, btnFade, btnCancel),
      h('div', { class: 'wrow' },
        h('label', { class: 'wlabel' }, 'crossfade ms', fadeMs),
        h('label', { class: 'wlabel' }, 'loop', barsSel),
        h('label', { class: 'wlabel' }, soundChk, 'sound'),
        h('span', { class: 'wout' }, `4/4 · ${bpm} bpm`)),
      status,
    );

    // ---------- actions ----------
    function start() {
      playing = true; last = performance.now();
      playBtn.textContent = '■ stop';
      say(`▶ '${PIECES[cur].name}' is playing.`);
      beats(cur, 0, 0, 1, true);
      loop();
    }
    function stop() {
      playing = false; cancelAnimationFrame(raf);
      playBtn.textContent = '▶ play';
      cur = 0; pos = 0; loops = 0; queued = null; fade = null;
      say('Stopped. Press ▶ play, then queue a switch.');
      draw(); refresh();
    }
    function request(mode) {
      if (!playing) start();
      const to = other();
      if (mode === 'now') { fade = null; switchTo(to, 0, 'now: a hard cut'); beats(cur, 0, 0, 1, true); return; }
      if (mode === 'fade') {
        const ms = Math.max(20, Math.min(8000, +fadeMs.value || 800));
        fade = { from: cur, fromPos: pos, t0: performance.now(), ms };
        switchTo(to, 0, `crossfading over ${ms} ms`);
        beats(cur, 0, 0, 0.05, true);
        return;
      }
      let at;
      if (mode === 'nextBar') at = (Math.floor(pos / BEATS) + 1) * BEATS;
      else at = loopBeats();
      queued = { to, at, mode };
      refresh();
    }
    function cancel() {
      if (!queued) return;
      say(`Cancelled: '${PIECES[queued.to].name}' will not take over.`);
      queued = null; refresh(); draw();
    }
    function switchTo(to, overflow, how) {
      cur = to; pos = overflow; loops = 0; queued = null;
      say(`⇥ '${PIECES[cur].name}' took over — ${how}.`);
      refresh();
    }
    function say(t) { status.textContent = t; }
    function refresh() {
      btnCancel.disabled = !queued;
      if (queued) {
        const left = (queued.at - pos) * secPerBeat();
        const where = queued.at >= loopBeats() ? 'the end of the loop' : `bar ${queued.at / BEATS + 1}`;
        say(`Queued '${PIECES[queued.to].name}' (${queued.mode === 'nextBar' ? 'next bar' : 'loop end'}): lands at ${where}, in ${left.toFixed(1)} s.`);
      }
    }

    // ---------- clock ----------
    function loop() {
      cancelAnimationFrame(raf);
      const step = (now) => {
        if (!playing) return;
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        const before = pos;
        pos += dt / secPerBeat();
        if (fade) {
          const fb = fade.fromPos;
          fade.fromPos = (fade.fromPos + dt / secPerBeat()) % loopBeats();
          beats(fade.from, fb, fade.fromPos, 1 - fadeGain());
          if (now - fade.t0 >= fade.ms) fade = null;
        }
        if (queued && pos >= queued.at) {
          const over = pos - queued.at;
          beats(cur, before, queued.at - 1e-6, 1);
          const mode = queued.mode;
          switchTo(queued.to, over, mode === 'nextBar' ? 'on the bar line' : 'at the end of the loop');
          beats(cur, 0, pos, 1, true);
        } else {
          if (pos >= loopBeats()) {
            beats(cur, before, loopBeats() - 1e-6, 1);
            pos -= loopBeats(); loops++;
            beats(cur, 0, pos, 1, true);
          } else beats(cur, before, pos, fade ? fadeGain() : 1);
        }
        if (queued) refresh();
        draw();
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }
    function fadeGain() { return fade ? Math.min(1, (performance.now() - fade.t0) / fade.ms) : 1; }

    // ---------- sound: one blip per beat, a piece of its own ----------
    // Beats in (from, to], or [from, to] with `incl`.
    function beats(piece, from, to, gain, incl) {
      if (!sound || gain <= 0.01) return;
      const first = incl ? Math.ceil(from) : Math.floor(from) + 1;
      for (let b = first; b <= to; b++) blip(piece, b % BEATS === 0, gain);
    }
    function blip(piece, down, gain) {
      const ac = window.DNPAudio && window.DNPAudio.ctx();
      if (!ac) return;
      const p = PIECES[piece];
      const t = ac.currentTime + 0.01;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = p.type;
      o.frequency.value = down ? p.tone[0] : p.tone[1];
      const peak = (down ? 0.18 : 0.1) * gain * (p.type === 'square' ? 0.5 : 1);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g).connect(ac.destination);
      o.start(t); o.stop(t + 0.14);
    }

    // ---------- drawing ----------
    function draw() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth || 400, hh = 150;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr); }
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, hh);
      const L = 56, R = 10, rowH = 40, top = [22, 82];
      const bx = (beat) => L + (beat / loopBeats()) * (w - L - R);
      const line = css('--line') || '#333', txt = css('--text') || '#eee', dim = css('--text-dim') || '#888', sel = css('--select') || '#fd0';
      g.font = '12px system-ui, sans-serif';
      PIECES.forEach((p, i) => {
        const col = css(p.color) || '#7fd1b9';
        const active = i === cur || (fade && fade.from === i);
        let alpha = i === cur ? 1 : 0.28;
        if (fade && fade.from === i) alpha = Math.max(0.28, 1 - fadeGain());
        if (fade && i === cur) alpha = Math.max(0.28, fadeGain());
        const y = top[i];
        g.fillStyle = active ? txt : dim;
        g.fillText(p.name, 6, y + rowH / 2 + 4);
        for (let b = 0; b < bars; b++) {
          const x0 = bx(b * BEATS) + 1, x1 = bx((b + 1) * BEATS) - 1;
          g.globalAlpha = alpha * 0.55;
          g.fillStyle = col;
          g.fillRect(x0, y, x1 - x0, rowH);
          g.globalAlpha = 1;
          g.strokeStyle = line;
          for (let k = 1; k < BEATS; k++) {
            const xb = bx(b * BEATS + k);
            g.beginPath(); g.moveTo(xb, y + rowH - 8); g.lineTo(xb, y + rowH); g.stroke();
          }
          if (i === 0) { g.fillStyle = dim; g.fillText(String(b + 1), x0 + 3, 14); }
        }
        // playhead(s)
        let ph = null;
        if (playing && i === cur) ph = pos;
        if (playing && fade && fade.from === i) ph = fade.fromPos;
        if (ph !== null) {
          g.globalAlpha = i === cur ? 1 : alpha;
          g.strokeStyle = txt; g.lineWidth = 2;
          g.beginPath(); g.moveTo(bx(ph), y - 3); g.lineTo(bx(ph), y + rowH + 3); g.stroke();
          g.lineWidth = 1; g.globalAlpha = 1;
        }
      });
      // where a queued switch lands, and where the next piece begins
      if (queued) {
        const xa = bx(Math.min(queued.at, loopBeats())) - (queued.at >= loopBeats() ? 1 : 0);
        const yc = top[cur], yn = top[queued.to];
        g.strokeStyle = sel; g.fillStyle = sel; g.lineWidth = 2;
        g.setLineDash([4, 3]);
        g.beginPath(); g.moveTo(xa, yc - 4); g.lineTo(xa, yc + rowH + 4); g.stroke();
        g.beginPath(); g.moveTo(bx(0), yn - 4); g.lineTo(bx(0), yn + rowH + 4); g.stroke();
        g.setLineDash([]);
        // arrow from the landing point to the start of the next piece
        g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(xa, cur === 0 ? yc + rowH + 4 : yc - 4); g.lineTo(bx(0) + 2, cur === 0 ? yn - 4 : yn + rowH + 4); g.stroke();
        const label = 'switch';
        const lw = g.measureText(label).width;
        g.fillText(label, Math.min(w - R - lw, xa + 4), cur === 0 ? yc + 12 : yc + rowH - 4);
        g.lineWidth = 1;
      }
    }
    new ResizeObserver(() => draw()).observe(canvas);
    draw(); refresh();
  };
})();
