// view-dial: which view a camera sees, seen from above.
//
// The maths is ThreeSprite's own (src/domain/views.ts):
//   view(N, facing, bearing) = round(mod1(bearing - facing) * N) % N + 1
//   mirror draws views 1 .. floor(N/2)+1; any later view k is view
//   (N - (k-1)) % N + 1, flipped.
// Angles are turns, anticlockwise seen from above. Relative bearing 0 is the
// camera straight in front of the character (view 1); a quarter turn puts the
// camera at the character's LEFT, so the character faces screen-left.
//
// <div class="widget" data-widget="view-dial" data-views="8" data-mirror="1"></div>
(function () {
  window.DNPW = window.DNPW || {};

  const mod1 = t => ((t % 1) + 1) % 1;
  const viewIndex = (N, facing, bearing) => (Math.round(mod1(bearing - facing) * N) % N) + 1;
  const mirrorOf = (N, k) => ((N - (k - 1)) % N) + 1;
  const authored = (N, mirror) => (mirror ? Math.floor(N / 2) + 1 : N);
  const isDerived = (N, mirror, k) => mirror && k > authored(N, mirror);
  function viewLabel(N, k) {
    const rel = (k - 1) / N, deg = Math.round(((k - 1) * 360 / N) * 100) / 100, e = 1e-9;
    if (Math.abs(rel) < e) return 'Front';
    if (Math.abs(rel - 0.5) < e) return 'Back';
    if (Math.abs(rel - 0.25) < e) return 'Left side';
    if (Math.abs(rel - 0.75) < e) return 'Right side';
    const name = rel < 0.25 ? 'Front-left' : rel < 0.5 ? 'Back-left' : rel < 0.75 ? 'Back-right' : 'Front-right';
    return name + ' ' + deg + '°';
  }

  window.DNPW['view-dial'] = function mount(el, opts) {
    const h = window.DNPh;
    const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888';

    let N = [1, 4, 8, 16].includes(Number(opts.views)) ? Number(opts.views) : 8;
    let mirror = opts.mirror !== '0';
    let facing = 0;          // turns: where the character heads
    let bearing = 0.06;      // turns: where the camera stands

    // controls
    const selN = h('select', { 'aria-label': 'Views' }, ...[1, 4, 8, 16].map(n => h('option', { value: n }, String(n))));
    selN.value = String(N);
    const chkM = h('input', { type: 'checkbox' }); chkM.checked = mirror;
    const camR = h('input', { type: 'range', min: 0, max: 359, step: 1, 'aria-label': 'Camera bearing' });
    const facR = h('input', { type: 'range', min: 0, max: 359, step: 1, 'aria-label': 'Character facing' });
    const camOut = h('span', { class: 'wout' }), facOut = h('span', { class: 'wout' });

    const dial = h('canvas', { 'aria-label': 'Top-down view circle. Drag the camera around the character.' });
    const fig = h('canvas', { width: 16, height: 16, 'aria-label': 'What the camera sees' });
    fig.style.cssText = 'image-rendering:pixelated;width:128px;height:128px;';
    const readout = h('div', { class: 'wout', style: 'margin-top:6px;min-height:2.6em' });
    const legend = h('div', { class: 'wout', style: 'margin-top:4px' });

    el.append(
      h('div', { class: 'wrow' },
        h('label', { class: 'wlabel' }, 'Views ', selN),
        h('label', { class: 'wlabel' }, chkM, 'Mirror symmetry')),
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:16px;align-items:center' },
        dial,
        h('div', {},
          h('div', { class: 'wlabel', style: 'margin-bottom:4px' }, 'What the camera sees'),
          fig, readout)),
      h('div', { class: 'wrow' },
        h('label', { class: 'wlabel' }, 'Camera ', camR, camOut),
        h('label', { class: 'wlabel' }, 'Facing ', facR, facOut)),
      legend);

    // ----- the dial -----
    let size = 300, dpr = 1;
    function resize() {
      size = Math.max(220, Math.min(320, (el.clientWidth || 320) - 24));
      dpr = window.devicePixelRatio || 1;
      dial.width = size * dpr; dial.height = size * dpr;
      dial.style.width = size + 'px'; dial.style.height = size + 'px';
      draw();
    }
    // A turn t (anticlockwise from "towards the bottom of the page") to a
    // point on the page. Seen from above with the page as the ground, so
    // bottom -> right -> top -> left is anticlockwise.
    const at = (t, r) => ({ x: size / 2 + r * Math.sin(2 * Math.PI * t), y: size / 2 + r * Math.cos(2 * Math.PI * t) });

    function draw() {
      const c = dial.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, size, size);
      const R = size / 2 - 34, mid = size / 2;
      const acc = css('--accent'), txt = css('--text'), dim = css('--text-dim'), line = css('--line-strong'), sel = css('--select'), raised = css('--raised');
      const k = viewIndex(N, facing, bearing);

      // sectors, one per view, centred on the bearing that view is drawn from
      for (let v = 1; v <= N; v++) {
        const centre = facing + (v - 1) / N;
        const a0 = centre - 0.5 / N, a1 = centre + 0.5 / N;
        c.beginPath(); c.moveTo(mid, mid);
        const steps = Math.max(4, Math.ceil(64 / N));
        for (let i = 0; i <= steps; i++) { const p = at(a0 + (a1 - a0) * i / steps, R); c.lineTo(p.x, p.y); }
        c.closePath();
        const derived = isDerived(N, mirror, v);
        c.fillStyle = v === k ? acc : raised;
        c.globalAlpha = v === k ? 0.55 : derived ? 0.35 : 0.9;
        c.fill();
        c.globalAlpha = 1;
        c.strokeStyle = line; c.lineWidth = 1;
        if (derived) c.setLineDash([3, 3]);
        c.stroke(); c.setLineDash([]);
        // label
        const p = at(centre, R + 16);
        c.font = (N > 8 ? '600 11px ' : '600 13px ') + 'system-ui, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = v === k ? acc : derived ? dim : txt;
        c.fillText(String(v), p.x, p.y);
        if (derived && N <= 8) {
          const q = at(centre, R - 16);
          c.font = '10px system-ui, sans-serif'; c.fillStyle = dim;
          c.fillText('⇄' + mirrorOf(N, v), q.x, q.y);
        }
      }

      // the character: a dot with an arrow where it faces
      c.fillStyle = txt;
      c.beginPath(); c.arc(mid, mid, 7, 0, 2 * Math.PI); c.fill();
      const tip = at(facing, 30), base = at(facing, 8);
      c.strokeStyle = txt; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(base.x, base.y); c.lineTo(tip.x, tip.y); c.stroke();
      const l = at(facing + 0.04, 22), r = at(facing - 0.04, 22);
      c.beginPath(); c.moveTo(tip.x, tip.y); c.lineTo(l.x, l.y); c.lineTo(r.x, r.y); c.closePath(); c.fillStyle = txt; c.fill();

      // the camera, looking at the character
      const cam = at(bearing, R - 4);
      c.strokeStyle = sel; c.lineWidth = 1.5; c.setLineDash([4, 4]);
      c.beginPath(); c.moveTo(cam.x, cam.y); c.lineTo(mid, mid); c.stroke(); c.setLineDash([]);
      c.save();
      c.translate(cam.x, cam.y);
      c.rotate(Math.atan2(mid - cam.y, mid - cam.x));
      c.fillStyle = sel;
      c.fillRect(-9, -7, 14, 14);
      c.beginPath(); c.moveTo(5, -4); c.lineTo(12, -8); c.lineTo(12, 8); c.lineTo(5, 4); c.closePath(); c.fill();
      c.restore();
    }

    // ----- the figure: a little pixel knight with a sword in its RIGHT hand -----
    function drawFigure(k) {
      const derived = isDerived(N, mirror, k);
      const src = derived ? mirrorOf(N, k) : k;
      const rel = (src - 1) / N;
      const s = Math.sin(2 * Math.PI * rel), co = Math.cos(2 * Math.PI * rel);
      const faceX = -s;          // screen-x of where it faces (+1 = right)
      const toward = co;         // +1 = facing the camera
      const rightX = -co;        // screen-x of the character's right hand
      const rightToward = -s;    // its right hand towards the camera
      const px = [];
      const put = (x, y, col) => { if (x >= 0 && x < 16 && y >= 0 && y < 16) px.push([x, y, col]); };
      const skin = '#e8b88a', body = '#4f7bd0', dark = '#2b3f6e', steel = '#d8dee8', hilt = '#8a5a2b', eye = '#1a1a22', boot = '#3a2a1e';
      const sword = () => {
        const hx = Math.round(7.5 + rightX * 4.2);
        put(hx, 9, hilt); put(hx, 8, hilt);
        for (let y = 1; y <= 7; y++) put(hx, y, steel);
      };
      if (rightToward < 0) sword();   // behind the body
      // legs and boots
      put(6, 13, dark); put(9, 13, dark); put(6, 14, dark); put(9, 14, dark);
      put(6, 15, boot); put(9, 15, boot); put(5, 15, boot); put(10, 15, boot);
      // body
      for (let y = 8; y <= 12; y++) for (let x = 5; x <= 10; x++) put(x, y, body);
      // a belt buckle shows only from the front half
      if (toward > 0.2) { put(7, 11, '#e0c060'); put(8, 11, '#e0c060'); }
      // head
      for (let y = 3; y <= 7; y++) for (let x = 6; x <= 9; x++) put(x, y, skin);
      // hair: covers the back of the head
      for (let x = 6; x <= 9; x++) put(x, 3, hilt);
      if (toward < -0.2) { for (let y = 4; y <= 6; y++) for (let x = 6; x <= 9; x++) put(x, y, hilt); }
      // eyes, shifted towards where it looks
      if (toward > -0.2) {
        const shift = Math.round(faceX * 1.5);
        if (Math.abs(faceX) < 0.8) { put(7 + shift, 5, eye); put(8 + shift, 5, eye); }
        else put(faceX > 0 ? 9 : 6, 5, eye);
      }
      // hands
      const hx = Math.round(7.5 + rightX * 4.2), lx = Math.round(7.5 - rightX * 4.2);
      put(lx, 9, skin); put(hx, 9, skin);
      if (rightToward >= 0) sword();  // in front of the body

      const c = fig.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, 16, 16);
      if (derived) { c.translate(16, 0); c.scale(-1, 1); }  // mirror flips the whole frame
      for (const [x, y, col] of px) { c.fillStyle = col; c.fillRect(x, y, 1, 1); }
      return { derived, src };
    }

    function update() {
      const k = viewIndex(N, facing, bearing);
      const r = drawFigure(k);
      draw();
      camR.value = String(Math.round(mod1(bearing) * 360) % 360);
      facR.value = String(Math.round(mod1(facing) * 360) % 360);
      camOut.textContent = camR.value + '°';
      facOut.textContent = facR.value + '°';
      readout.innerHTML = '';
      readout.append(
        h('b', {}, 'Camera sees view ' + k), ' · ' + viewLabel(N, k), h('br'),
        r.derived ? 'flipped from view ' + r.src + ' (not drawn)' : 'drawn by you');
      legend.textContent = mirror
        ? 'You draw ' + authored(N, true) + ' of ' + N + ' views (solid). Dashed views are flipped copies — watch the sword change hands.'
        : 'You draw all ' + N + ' views.';
    }

    // drag the camera
    function fromPointer(e) {
      const r = dial.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
      bearing = mod1(Math.atan2(x, y) / (2 * Math.PI));
      update();
    }
    let dragging = false;
    dial.addEventListener('pointerdown', e => { dragging = true; dial.setPointerCapture(e.pointerId); fromPointer(e); });
    dial.addEventListener('pointermove', e => { if (dragging) fromPointer(e); });
    dial.addEventListener('pointerup', () => { dragging = false; });
    dial.addEventListener('pointercancel', () => { dragging = false; });
    dial.style.cursor = 'grab';

    camR.oninput = () => { bearing = Number(camR.value) / 360; update(); };
    facR.oninput = () => { facing = Number(facR.value) / 360; update(); };
    selN.onchange = () => { N = Number(selN.value); update(); };
    chkM.onchange = () => { mirror = chkM.checked; update(); };

    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(el);
    // re-read theme colours when the theme switches
    new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    resize();
    update();
  };
})();
