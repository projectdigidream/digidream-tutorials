// The studio's "animate…" dialog in miniature: a small vertical sprite sheet
// (drawn here in code), cut as you choose, one frame played tiled 2×2 as on a
// wall, and the `sheet` line the studio writes into assets/animations.txt.
(function () {
  window.DNPW = window.DNPW || {};

  const S = 16, FRAMES = 4, DEFAULT_FPS = 8;
  const RAMPS = {
    lava: ['#3b0d0d', '#7a1a12', '#c2361b', '#ef7d57', '#ffcd75'],
    water: ['#0c1a3a', '#1b3a6b', '#29669c', '#41a6f6', '#a6e4ff'],
  };

  // One frame of a seamless, looping liquid: periodic in x and y (period 16),
  // and in time (period FRAMES), so the sheet tiles and loops.
  function frame(kind, f) {
    const ramp = RAMPS[kind], out = [];
    const t = f / FRAMES * Math.PI * 2, k = Math.PI * 2 / S;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let v = kind === 'lava'
        ? Math.sin(x * k + t) + Math.sin(y * k * 2 + x * k - t) + 0.6 * Math.sin((x + y) * k * 3 + t)
        : Math.sin(x * k * 2 + t) * 0.8 + Math.sin(y * k + t) + 0.5 * Math.sin((x - y) * k * 2 - t);
      v = (v + 2.4) / 4.8;
      // a fixed 2×2 Bayer dither between ramp steps, as a pixel artist would
      const bayer = [[0, 2], [3, 1]][y & 1][x & 1] / 4 - 0.375;
      const i = Math.max(0, Math.min(ramp.length - 1, Math.round(v * (ramp.length - 1) + bayer * 0.9)));
      out.push(ramp[i]);
    }
    return out;
  }

  window.DNPW['sheet-cutter'] = function mount(el) {
    const h = window.DNPh;
    const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

    let kind = 'lava', cut = 'vertical', frames = FRAMES, fps = DEFAULT_FPS, playing = true, shown = 0, name = 'LAVA1';
    // the sheet: 16 wide, 64 tall, frames stacked top to bottom (how qPainter saves an animation)
    const W = S, H = S * FRAMES;
    let sheet = [];
    const build = () => { sheet = []; for (let f = 0; f < FRAMES; f++) sheet.push(...frame(kind, f)); };
    build();
    const at = (x, y) => sheet[y * W + x];

    const K = 4; // sheet canvas scale
    const sheetCv = h('canvas', { width: W * K, height: H * K });
    const TK = 3; // tile scale
    const tileCv = h('canvas', { width: 2 * S * TK * 2, height: 2 * S * TK * 2 });

    const kindSel = h('select', {}, h('option', { value: 'lava' }, 'lava'), h('option', { value: 'water' }, 'water'));
    kindSel.onchange = () => { kind = kindSel.value; name = kind === 'lava' ? 'LAVA1' : 'WATER1'; nameIn.value = name; build(); update(); };
    const cutSel = h('select', {},
      h('option', { value: 'still' }, 'a still picture'),
      h('option', { value: 'vertical' }, 'frames stacked ↓ (vertical)'),
      h('option', { value: 'horizontal' }, 'frames side by side → (horizontal)'));
    cutSel.value = cut;
    cutSel.onchange = () => { cut = cutSel.value; shown = 0; update(); };
    const framesIn = h('input', { type: 'number', min: '2', max: '8', step: '1', value: String(frames), style: 'width:4em' });
    framesIn.oninput = () => { frames = Math.max(2, Math.min(8, Math.round(+framesIn.value || 2))); shown = 0; update(); };
    const fpsIn = h('input', { type: 'range', min: '1', max: '24', step: '1', value: String(fps) });
    const fpsOut = h('span', { class: 'wout' });
    fpsIn.oninput = () => { fps = +fpsIn.value; update(); };
    const nameIn = h('input', { type: 'text', value: name, maxlength: '24', style: 'width:9em;font:inherit;font-size:13px' });
    nameIn.oninput = () => { name = nameIn.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 24) || 'TEXTURE'; update(); };
    const playBtn = h('button', { class: 'wbtn', type: 'button' }, '⏸');
    playBtn.onclick = () => { playing = !playing; playBtn.textContent = playing ? '⏸' : '▶'; };

    const info = h('div', { class: 'wout' });
    const warn = h('div', { class: 'wout', style: 'color:#e5534b' });
    const lineOut = h('pre', { style: 'margin:8px 0 0' }, h('code', {}));

    el.append(
      h('div', { class: 'wrow' },
        h('label', { class: 'wlabel' }, 'picture', kindSel),
        h('label', { class: 'wlabel' }, 'name', nameIn)),
      h('div', { class: 'wrow' },
        h('label', { class: 'wlabel' }, 'cut', cutSel),
        h('label', { class: 'wlabel' }, 'frames', framesIn),
        h('label', { class: 'wlabel' }, 'frames a second', fpsIn, fpsOut), playBtn),
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start' },
        h('div', {}, sheetCv, h('div', { class: 'wout', style: 'margin-top:4px' }, 'the picture, cut')),
        h('div', {}, tileCv, h('div', { class: 'wout', style: 'margin-top:4px' }, 'a frame, tiled as on a wall'))),
      info, warn,
      h('div', { class: 'wout', style: 'margin-top:8px' }, 'The line the studio writes into assets/animations.txt:'),
      lineOut);

    // where frame k sits, as the client cuts it (studio/src/texsheet.js frameRect)
    function rect(k) {
      if (cut === 'horizontal') { const fw = Math.floor(W / frames); return { x: k * fw, y: 0, w: fw, h: H }; }
      const fh = Math.floor(H / frames);
      return { x: 0, y: k * fh, w: W, h: fh };
    }
    function spare() { const along = cut === 'horizontal' ? W : H; return along - Math.floor(along / frames) * frames; }

    function update() {
      fpsOut.textContent = String(fps);
      framesIn.disabled = cut === 'still';
      fpsIn.disabled = cut === 'still';
      const code = lineOut.firstChild;
      const problems = [];
      if (cut === 'still') {
        info.textContent = `${W}×${H}, a still picture`;
        code.textContent = `# no line: ${name} is a still picture, and shows the whole ${W}×${H} sheet`;
      } else {
        const r = rect(0);
        info.textContent = `${W}×${H}: ${frames} frames of ${r.w}×${r.h}, ${fps} a second -- ${(frames / fps).toFixed(2)} s round`;
        if (r.w < 1 || r.h < 1) problems.push(`${name}: ${frames} frames do not fit in ${W}×${H}`);
        else if (spare()) problems.push(`${name}: ${cut === 'horizontal' ? W : H} px is not ${frames} equal frames -- the last ${spare()} px are not shown`);
        // the studio leaves fps out when it is the default, 8
        code.textContent = `sheet ${name} ${cut} ${frames}${fps === DEFAULT_FPS ? '' : ` fps ${fps}`}`;
      }
      warn.textContent = problems.join('\n');
      drawSheet();
    }

    function drawSheet() {
      const g = sheetCv.getContext('2d');
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { g.fillStyle = at(x, y); g.fillRect(x * K, y * K, K, K); }
      if (cut === 'still') return;
      g.strokeStyle = 'rgba(255,224,102,.9)'; g.lineWidth = 1;
      g.beginPath();
      for (let k = 1; k < frames; k++) {
        const r = rect(k);
        if (cut === 'horizontal') { g.moveTo(r.x * K + 0.5, 0); g.lineTo(r.x * K + 0.5, H * K); }
        else { g.moveTo(0, r.y * K + 0.5); g.lineTo(W * K, r.y * K + 0.5); }
      }
      g.stroke();
      const r = rect(shown % frames);
      g.strokeStyle = css('--accent') || '#5b8fd6'; g.lineWidth = 2;
      g.strokeRect(r.x * K + 1, r.y * K + 1, r.w * K - 2, r.h * K - 2);
      const s = spare();
      if (s) {
        g.fillStyle = 'rgba(255,77,77,.4)';
        if (cut === 'horizontal') g.fillRect((W - s) * K, 0, s * K, H * K); else g.fillRect(0, (H - s) * K, W * K, s * K);
      }
    }

    function drawTile() {
      const g = tileCv.getContext('2d');
      g.clearRect(0, 0, tileCv.width, tileCv.height);
      const r = cut === 'still' ? { x: 0, y: 0, w: W, h: H } : rect(shown % frames);
      if (r.w < 1 || r.h < 1) return;
      // fit two copies across and down, keeping square pixels
      const k = Math.max(1, Math.floor(Math.min(tileCv.width / (2 * r.w), tileCv.height / (2 * r.h))));
      for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++)
        for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
          g.fillStyle = at(r.x + x, r.y + y);
          g.fillRect((tx * r.w + x) * k, (ty * r.h + y) * k, k, k);
        }
    }

    let lastT = performance.now(), acc = 0;
    function tick(t) {
      if (!el.isConnected) return;
      const dt = (t - lastT) / 1000; lastT = t;
      if (playing && cut !== 'still') {
        acc += dt;
        if (acc >= 1 / fps) { acc = 0; shown = (shown + 1) % frames; drawSheet(); }
      }
      drawTile();
      requestAnimationFrame(tick);
    }

    update();
    requestAnimationFrame(tick);
  };
})();
