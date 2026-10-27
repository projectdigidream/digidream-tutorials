// A 16×16 pixel tile with qPainter's seam tools: Wrap, Offset ½, and a live
// 3×3 tiled preview. Pencil, a checker dither brush and an eraser, sizes 1–3,
// a small fixed palette (so the palette is "locked" by construction).
(function () {
  window.DNPW = window.DNPW || {};

  const N = 16;
  // A few colours from Sweetie 16, qPainter's default palette.
  const PALETTE = ['#1a1c2c', '#333c57', '#566c86', '#94b0c2', '#f4f4f4', '#5d275d', '#a7f070', '#ef7d57'];

  window.DNPW['tile-painter'] = function mount(el, opts) {
    const h = window.DNPh;
    const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

    // pixels: palette index, or -1 for transparent
    let px = new Int8Array(N * N);
    const start = () => {
      px.fill(2);
      // a few stones that stop short of the edges, so the first seam test is honest
      for (let y = 3; y < 7; y++) for (let x = 2; x < 9; x++) px[y * N + x] = 3;
      for (let y = 9; y < 14; y++) for (let x = 7; x < 14; x++) px[y * N + x] = 3;
      for (let x = 2; x < 9; x++) px[7 * N + x] = 1;
      for (let x = 7; x < 14; x++) px[14 * N + x] = 1;
    };
    start();

    let tool = 'pencil', size = 1, colour = 3, wrap = opts.wrap !== 'off', outline = false;
    const undo = [];

    // ---- layout ----
    const CELL = 16, PCELL = 4;
    const cv = h('canvas', { width: N * CELL, height: N * CELL, style: 'cursor:crosshair' });
    const pv = h('canvas', { width: N * PCELL * 3, height: N * PCELL * 3 });
    cv.style.width = (N * CELL) + 'px';
    pv.style.width = (N * PCELL * 3) + 'px';

    const toolBtns = {};
    const mkTool = (id, label) => {
      const b = h('button', { class: 'wbtn', type: 'button' }, label);
      b.onclick = () => { tool = id; sync(); };
      toolBtns[id] = b;
      return b;
    };
    const sizeOut = h('span', { class: 'wout' });
    const sizeIn = h('input', { type: 'range', min: '1', max: '3', step: '1', value: '1' });
    sizeIn.oninput = () => { size = +sizeIn.value; sync(); };

    const wrapBtn = h('button', { class: 'wbtn', type: 'button', title: 'Wrap (W in qPainter)' }, 'Wrap');
    wrapBtn.onclick = () => { wrap = !wrap; sync(); };
    const offBtn = h('button', { class: 'wbtn', type: 'button' }, 'Offset ½');
    offBtn.onclick = () => { snapshot(); offsetHalf(); draw(); };
    const undoBtn = h('button', { class: 'wbtn', type: 'button' }, '↶ Undo');
    undoBtn.onclick = () => { if (undo.length) { px = undo.pop(); draw(); } };
    const resetBtn = h('button', { class: 'wbtn', type: 'button' }, 'Start over');
    resetBtn.onclick = () => { snapshot(); start(); draw(); };
    const outlineIn = h('input', { type: 'checkbox' });
    outlineIn.onchange = () => { outline = outlineIn.checked; draw(); };

    const swatches = h('div', { class: 'wrow', style: 'gap:4px' });
    const swBtns = PALETTE.map((c, i) => {
      const b = h('button', { type: 'button', title: c, style: `width:26px;height:26px;border-radius:4px;border:2px solid transparent;background:${c};cursor:pointer;padding:0` });
      b.onclick = () => { colour = i; if (tool === 'eraser') tool = 'pencil'; sync(); };
      swatches.append(b);
      return b;
    });

    const note = h('p', { class: 'wout', style: 'margin:6px 0 0' });

    el.append(
      h('div', { class: 'wrow' }, mkTool('pencil', 'Pencil'), mkTool('dither', 'Dither'), mkTool('eraser', 'Eraser'),
        h('label', { class: 'wlabel' }, 'Size', sizeIn, sizeOut)),
      swatches,
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start' },
        h('div', {}, cv, h('div', { class: 'wout', style: 'margin-top:4px' }, 'the tile, 16 × 16')),
        h('div', {}, pv, h('div', { class: 'wout', style: 'margin-top:4px' }, 'the tile repeated 3 × 3'))),
      h('div', { class: 'wrow' }, wrapBtn, offBtn, undoBtn, resetBtn,
        h('label', { class: 'wlabel' }, outlineIn, 'outline the tiles')),
      note);

    function sync() {
      Object.entries(toolBtns).forEach(([id, b]) => b.classList.toggle('on', id === tool));
      wrapBtn.classList.toggle('on', wrap);
      sizeOut.textContent = size + ' px';
      swBtns.forEach((b, i) => { b.style.borderColor = i === colour && tool !== 'eraser' ? css('--select') || '#ffe066' : 'transparent'; });
      note.textContent = wrap
        ? 'Wrap is on: a stroke that leaves one edge comes back in on the opposite edge.'
        : 'Wrap is off: a stroke stops at the edge, so the seam is left for you to fix by hand.';
      draw();
    }

    function snapshot() { undo.push(px.slice()); if (undo.length > 40) undo.shift(); }

    // ---- painting ----
    function plot(x, y) {
      const o = -Math.floor((size - 1) / 2);
      for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
        let X = x + o + dx, Y = y + o + dy;
        if (wrap) { X = ((X % N) + N) % N; Y = ((Y % N) + N) % N; }
        else if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
        // the dither pattern is anchored to the canvas, as in qPainter, so it lines up across the seam
        if (tool === 'dither' && ((X + Y) & 1)) continue;
        px[Y * N + X] = tool === 'eraser' ? -1 : colour;
      }
    }
    function line(x0, y0, x1, y1) {
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        plot(x0, y0);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }
    function offsetHalf() {
      const out = new Int8Array(N * N), s = N / 2;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) out[((y + s) % N) * N + ((x + s) % N)] = px[y * N + x];
      px = out;
    }

    const cellAt = (e) => {
      const r = cv.getBoundingClientRect();
      // not clamped: a pointer dragged past the edge keeps going, and Wrap brings it back in
      return [Math.floor((e.clientX - r.left) / r.width * N), Math.floor((e.clientY - r.top) / r.height * N)];
    };
    let last = null, hover = null;
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      cv.setPointerCapture(e.pointerId);
      snapshot();
      last = cellAt(e);
      plot(last[0], last[1]);
      draw();
    });
    cv.addEventListener('pointermove', (e) => {
      const c = cellAt(e);
      hover = c;
      if (last) { line(last[0], last[1], c[0], c[1]); last = c; }
      draw();
    });
    const end = () => { last = null; };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { hover = null; draw(); });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    // ---- drawing ----
    function checker(g, x, y, s) {
      g.fillStyle = '#c8c8c8'; g.fillRect(x, y, s, s);
      g.fillStyle = '#9a9a9a'; const k = s / 2;
      g.fillRect(x, y, k, k); g.fillRect(x + k, y + k, k, k);
    }
    function paintTile(g, ox, oy, s) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const v = px[y * N + x];
        if (v < 0) checker(g, ox + x * s, oy + y * s, s);
        else { g.fillStyle = PALETTE[v]; g.fillRect(ox + x * s, oy + y * s, s, s); }
      }
    }
    function draw() {
      const g = cv.getContext('2d');
      paintTile(g, 0, 0, CELL);
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1;
      g.beginPath();
      for (let i = 1; i < N; i++) { g.moveTo(i * CELL + 0.5, 0); g.lineTo(i * CELL + 0.5, N * CELL); g.moveTo(0, i * CELL + 0.5); g.lineTo(N * CELL, i * CELL + 0.5); }
      g.stroke();
      if (hover) {
        const o = -Math.floor((size - 1) / 2);
        g.strokeStyle = css('--select') || '#ffe066'; g.lineWidth = 2;
        for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
          let X = hover[0] + o + dx, Y = hover[1] + o + dy;
          if (wrap) { X = ((X % N) + N) % N; Y = ((Y % N) + N) % N; } else if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
          g.strokeRect(X * CELL + 1, Y * CELL + 1, CELL - 2, CELL - 2);
        }
      }
      const p = pv.getContext('2d');
      for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 3; tx++) paintTile(p, tx * N * PCELL, ty * N * PCELL, PCELL);
      if (outline) {
        p.strokeStyle = css('--accent') || '#5b8fd6'; p.lineWidth = 1;
        for (let i = 1; i < 3; i++) {
          p.beginPath(); p.moveTo(i * N * PCELL + 0.5, 0); p.lineTo(i * N * PCELL + 0.5, pv.height);
          p.moveTo(0, i * N * PCELL + 0.5); p.lineTo(pv.width, i * N * PCELL + 0.5); p.stroke();
        }
      }
    }

    sync();
  };
})();
