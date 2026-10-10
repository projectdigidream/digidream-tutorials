// A side-view bone rig to pose and key, sampled the way ThreeSprite samples
// (src/domain/animation.ts sampleTrack): no keys → rest; before the first key
// or after the last → that key's value (no wrap-around, even when looping);
// between two keys the FIRST key's ease decides — linear, easeInOut
// (smoothstep) or step. Dragging a bone's tip keys its rotation at the
// current frame; dragging the pelvis keys its move. Angles are degrees,
// counter-clockwise on screen, 90 = up; the figure faces right (+x).
(function () {
  window.DNPW = window.DNPW || {};

  const W = 48, H = 48, GROUND = 45;
  // Back limbs first so the near ones draw over them.
  const BONES = [
    { id: 'pelvis', name: 'pelvis', parent: null, rest: 90, len: 0, x: 22, y: 23 },
    { id: 'thighB', name: 'thigh (far)', parent: 'pelvis', rest: -180, len: 11, far: true },
    { id: 'shinB', name: 'shin (far)', parent: 'thighB', rest: 0, len: 11, far: true },
    { id: 'torso', name: 'torso', parent: 'pelvis', rest: 0, len: 12 },
    { id: 'head', name: 'head', parent: 'torso', rest: 0, len: 6, head: true },
    { id: 'thighF', name: 'thigh (near)', parent: 'pelvis', rest: -180, len: 11 },
    { id: 'shinF', name: 'shin (near)', parent: 'thighF', rest: 0, len: 11 },
    { id: 'arm', name: 'arm', parent: 'torso', rest: 180, len: 11, atTip: true },
  ];
  const byId = Object.fromEntries(BONES.map(b => [b.id, b]));

  const smooth = u => u * u * (3 - 2 * u);
  function sample(keys, frame, identity) {
    const n = keys.length;
    if (!n) return identity;
    if (frame <= keys[0].frame) return keys[0].value;
    if (frame >= keys[n - 1].frame) return keys[n - 1].value;
    let i = 0; while (keys[i + 1].frame <= frame) i++;
    const a = keys[i], b = keys[i + 1];
    if (a.interp === 'step') return a.value;
    let u = (frame - a.frame) / (b.frame - a.frame);
    if (a.interp === 'easeInOut') u = smooth(u);
    return a.value + (b.value - a.value) * u;
  }
  function setKey(keys, frame, value, interp) {
    let i = 0; while (i < keys.length && keys[i].frame < frame) i++;
    if (keys[i] && keys[i].frame === frame) { keys[i].value = value; if (interp) keys[i].interp = interp; return; }
    keys.splice(i, 0, { frame, value, interp: interp || 'linear' });
  }

  // Presets: [frame, value, interp?] per track. Frames are 0-based here, shown 1-based.
  const PRESETS = {
    walk: {
      label: 'walk (8 frames, loop)', frames: 8, fps: 10, loop: true,
      rot: {
        thighF: [[0, 25], [2, 0], [4, -25], [6, 5], [7, 15]],
        shinF: [[0, 0], [2, -10], [4, -5], [6, -45], [7, -20]],
        thighB: [[0, -25], [2, 5], [4, 25], [6, 0], [7, -12]],
        shinB: [[0, -5], [2, -45], [4, 0], [6, -10], [7, -7]],
        arm: [[0, -25], [2, 0], [4, 25], [6, 0], [7, -12]],
        torso: [[0, -4]],
      },
      up: [[0, 0], [2, 1.5], [4, 0], [6, 1.5], [7, 0.75]],
    },
    swing: {
      label: 'overhead swing (7 frames, no loop)', frames: 7, fps: 10, loop: false,
      rot: {
        arm: [[0, 0, 'easeInOut'], [2, -150, 'step'], [3, -150, 'linear'], [4, 70, 'step'], [5, 70, 'easeInOut'], [6, 10]],
        torso: [[0, 0, 'easeInOut'], [2, 12, 'step'], [3, 12, 'linear'], [4, -18, 'step'], [5, -18, 'easeInOut'], [6, -4]],
        head: [[2, -8], [4, 10]],
        thighF: [[0, 0], [2, 10], [4, 25]],
        shinF: [[0, 0], [2, -5], [4, -15]],
        thighB: [[0, 0], [4, -20]],
      },
      up: [[0, 0, 'easeInOut'], [2, 1], [4, -2], [6, -1]],
    },
    fall: {
      label: 'death (8 frames, no loop)', frames: 8, fps: 8, loop: false,
      rot: {
        torso: [[0, 0, 'easeInOut'], [2, 20, 'linear'], [5, 85]],
        head: [[0, 0], [2, 15], [5, 10]],
        arm: [[0, 0, 'easeInOut'], [2, -60, 'linear'], [5, -100]],
        thighF: [[0, 0], [3, 40], [5, 80]],
        shinF: [[0, 0], [3, -70], [5, -10]],
        thighB: [[0, 0], [3, 25], [5, 85]],
        shinB: [[0, 0], [3, -40], [5, -5]],
      },
      up: [[0, 0, 'easeInOut'], [3, -8, 'linear'], [5, -18], [6, -17], [7, -18]],
    },
  };

  window.DNPW['bone-anim'] = function mount(el, opts) {
    const h = window.DNPh;
    const st = {
      frames: 8, fps: 10, loop: true, frame: 0, sel: 'thighF', onion: true, playing: false,
      rot: {}, up: [],
    };
    BONES.forEach(b => st.rot[b.id] = []);

    const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888';

    // ---- pose ----
    function pose(frame) {
      const out = {};
      for (const b of BONES) {
        const off = b.id === 'pelvis' ? 0 : sample(st.rot[b.id], frame, 0);
        if (!b.parent) {
          const up = sample(st.up, frame, 0);
          out[b.id] = { x: b.x, y: b.y - up, a: b.rest + off, tx: b.x, ty: b.y - up };
          continue;
        }
        const p = out[b.parent];
        const a = p.a + b.rest + off;
        const ox = b.atTip ? p.tx - Math.cos((p.a) * Math.PI / 180) * 2 : p.x;
        const oy = b.atTip ? p.ty + Math.sin((p.a) * Math.PI / 180) * 2 : p.y;
        const r = a * Math.PI / 180;
        out[b.id] = { x: ox, y: oy, a, tx: ox + Math.cos(r) * b.len, ty: oy - Math.sin(r) * b.len };
      }
      return out;
    }

    // ---- DOM ----
    const view = h('canvas', { width: 320, height: 320, style: 'width:100%;max-width:360px;aspect-ratio:1;image-rendering:pixelated;cursor:crosshair' });
    const lowres = document.createElement('canvas'); lowres.width = W; lowres.height = H;
    const info = h('div', { class: 'wout', style: 'min-height:2.6em' });
    const tl = h('div', { style: 'overflow-x:auto;flex:1 1 300px;min-width:0' });
    const easeSel = h('select', {}, ...['linear', 'easeInOut', 'step'].map(v => h('option', { value: v }, v)));
    const presetSel = h('select', {}, h('option', { value: '' }, 'load an example…'), ...Object.entries(PRESETS).map(([k, p]) => h('option', { value: k }, p.label)));
    const framesIn = h('input', { type: 'number', min: 2, max: 16, value: st.frames, style: 'width:4em' });
    const fpsIn = h('input', { type: 'number', min: 1, max: 30, value: st.fps, style: 'width:4em' });
    const loopIn = h('input', { type: 'checkbox' }); loopIn.checked = st.loop;
    const onionIn = h('input', { type: 'checkbox' }); onionIn.checked = st.onion;
    const playBtn = h('button', { class: 'wbtn primary', type: 'button' }, '▶ Play');
    const btn = (label, fn, title) => h('button', { class: 'wbtn', type: 'button', title: title || '', onclick: fn }, label);
    for (const i of [framesIn, fpsIn]) Object.assign(i.style, { font: 'inherit', fontSize: '13px', background: 'var(--input)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: '4px', padding: '2px 4px' });

    el.append(
      h('div', { class: 'wrow', style: 'align-items:flex-start;gap:16px' },
        h('div', { style: 'flex:0 1 360px' }, view, info),
        tl),
      h('div', { class: 'wrow' },
        btn('‹ [', () => go(st.frame - 1), 'Previous frame ( [ )'), playBtn, btn('] ›', () => go(st.frame + 1), 'Next frame ( ] )'),
        h('label', { class: 'wlabel' }, 'frames', framesIn), h('label', { class: 'wlabel' }, 'fps', fpsIn),
        h('label', { class: 'wlabel' }, loopIn, 'loop'), h('label', { class: 'wlabel' }, onionIn, 'onion skin')),
      h('div', { class: 'wrow' },
        btn('◆ Key all', () => { keyAll(st.sel); draw(); }, 'Key the selected bone as it is now'),
        btn('Delete keys', () => { delKeys(st.sel, st.frame); draw(); }, 'Remove the selected bone’s keys on this frame'),
        h('label', { class: 'wlabel' }, 'Ease', easeSel),
        btn('Clear frame', () => { BONES.forEach(b => delKeys(b.id, st.frame)); draw(); }, 'Remove every bone’s keys on this frame'),
        btn('Clear all', () => { BONES.forEach(b => st.rot[b.id] = []); st.up = []; draw(); }),
        h('label', { class: 'wlabel' }, presetSel)),
      h('p', { class: 'wnote' }, 'Drag a bone’s tip to turn it, and drag the pelvis up or down to move the body. Either one keys that bone on this frame, as ThreeSprite does. Click a bone or a cell in the grid to select it. ◆ marks a key. Keys: [ and ] step, Space plays.'));

    // ---- keys ----
    function keyAll(id) {
      if (id === 'pelvis') setKey(st.up, st.frame, sample(st.up, st.frame, 0));
      else setKey(st.rot[id], st.frame, sample(st.rot[id], st.frame, 0));
    }
    function delKeys(id, f) {
      const ks = id === 'pelvis' ? st.up : st.rot[id];
      const i = ks.findIndex(k => k.frame === f); if (i >= 0) ks.splice(i, 1);
    }
    const keysOf = id => id === 'pelvis' ? st.up : st.rot[id];
    const keyAt = (id, f) => keysOf(id).find(k => k.frame === f);

    function load(name) {
      const p = PRESETS[name]; if (!p) return;
      BONES.forEach(b => st.rot[b.id] = []);
      for (const [id, ks] of Object.entries(p.rot)) st.rot[id] = ks.map(([frame, value, interp]) => ({ frame, value, interp: interp || 'linear' }));
      st.up = p.up.map(([frame, value, interp]) => ({ frame, value, interp: interp || 'linear' }));
      st.frames = p.frames; st.fps = p.fps; st.loop = p.loop; st.frame = 0;
      framesIn.value = p.frames; fpsIn.value = p.fps; loopIn.checked = p.loop;
      draw();
    }

    // ---- drawing ----
    function plot(img, x, y, rgb, r) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 0.5) continue;
        const px = Math.round(x + dx), py = Math.round(y + dy);
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const i = (py * W + px) * 4;
        img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = rgb[3] ?? 255;
      }
    }
    function seg(img, x0, y0, x1, y1, rgb, r) {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
      for (let i = 0; i <= n; i++) plot(img, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, rgb, r);
    }
    const hex = s => { const m = /^#?([0-9a-f]{6})$/i.exec(s.trim()); if (!m) return [128, 128, 128]; const v = parseInt(m[1], 16); return [v >> 16, (v >> 8) & 255, v & 255]; };

    function drawFigure(img, P, faded) {
      const near = faded ? [120, 140, 190, 110] : [222, 238, 214];
      const far = faded ? [90, 100, 140, 90] : [133, 149, 161];
      const skin = faded ? [120, 140, 190, 110] : [210, 170, 153];
      for (const b of BONES) {
        if (!b.parent) continue;
        const p = P[b.id];
        if (b.head) { plot(img, p.x + (p.tx - p.x) * 0.6, p.y + (p.ty - p.y) * 0.6, skin, 3); continue; }
        seg(img, p.x, p.y, p.tx, p.ty, b.far ? far : (b.id === 'arm' ? skin : near), b.id === 'torso' ? 2 : 1);
      }
      // feet
      for (const id of ['shinB', 'shinF']) { const p = P[id]; seg(img, p.tx, p.ty, p.tx + 3, p.ty, byId[id].far ? far : near, 1); }
    }

    function draw() {
      st.frame = Math.max(0, Math.min(st.frames - 1, st.frame));
      const P = pose(st.frame);
      const g = lowres.getContext('2d');
      const img = g.createImageData(W, H);
      // ground and checker
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, c = ((x >> 2) + (y >> 2)) & 1 ? 26 : 32;
        img.data[i] = c; img.data[i + 1] = c + 3; img.data[i + 2] = c + 10; img.data[i + 3] = 255;
      }
      for (let x = 0; x < W; x++) plot(img, x, GROUND, [210, 125, 44], 0);
      if (st.onion && st.frames > 1) {
        const pf = st.frame - 1 >= 0 ? st.frame - 1 : (st.loop ? st.frames - 1 : -1);
        if (pf >= 0) drawFigure(img, pose(pf), true);
      }
      drawFigure(img, P, false);
      g.putImageData(img, 0, 0);

      const c = view.getContext('2d'), S = view.width / W;
      c.imageSmoothingEnabled = false;
      c.clearRect(0, 0, view.width, view.height);
      c.drawImage(lowres, 0, 0, view.width, view.height);
      // rig overlay
      const acc = css('--accent'), sel = css('--select');
      for (const b of BONES) {
        const p = P[b.id];
        const on = b.id === st.sel;
        c.strokeStyle = on ? sel : acc; c.fillStyle = on ? sel : acc;
        c.globalAlpha = on ? 1 : 0.55; c.lineWidth = on ? 2 : 1;
        if (b.parent) {
          c.beginPath(); c.moveTo(p.x * S, p.y * S); c.lineTo(p.tx * S, p.ty * S); c.stroke();
          c.beginPath(); c.arc(p.tx * S, p.ty * S, on ? 5 : 3.5, 0, Math.PI * 2); c.fill();
        } else {
          c.beginPath(); c.arc(p.x * S, p.y * S, on ? 7 : 5, 0, Math.PI * 2); c.stroke();
        }
      }
      c.globalAlpha = 1;
      drawTimeline(); drawInfo();
    }

    function drawInfo() {
      const b = byId[st.sel];
      const k = keyAt(st.sel, st.frame);
      const v = st.sel === 'pelvis' ? sample(st.up, st.frame, 0) : sample(st.rot[st.sel], st.frame, 0);
      const what = st.sel === 'pelvis' ? `Move up ${v.toFixed(1)} px` : `Rot ${v.toFixed(0)}° (on top of its rest angle)`;
      let seam = '';
      if (st.loop && st.frames > 1) {
        const P0 = pose(0), PL = pose(st.frames - 1);
        const same = BONES.every(b => Math.abs(P0[b.id].a - PL[b.id].a) < 0.5 && Math.abs(P0[b.id].y - PL[b.id].y) < 0.1);
        if (same && BONES.some(b => keysOf(b.id).length)) seam = ' ⚠ the last frame equals the first: the loop shows that pose twice (a hitch)';
      }
      info.textContent = `Frame ${st.frame + 1} of ${st.frames} · ${b.name}: ${what}${k ? ' ◆ keyed, ' + k.interp : ''}${seam}`;
      easeSel.disabled = !k; if (k) easeSel.value = k.interp;
    }

    function drawTimeline() {
      const t = h('table', { style: 'border-collapse:collapse;font-size:12px;margin:0;width:auto' });
      const head = h('tr', {}, h('th', { style: 'padding:2px 6px;background:none' }, ''));
      for (let f = 0; f < st.frames; f++) head.append(h('th', { style: `padding:2px 0;width:22px;text-align:center;background:none;cursor:pointer;color:${f === st.frame ? 'var(--select)' : 'var(--text-dim)'}`, onclick: () => go(f) }, String(f + 1)));
      t.append(head);
      for (const b of [...BONES].sort((x, y) => (x.id === 'pelvis' ? -1 : y.id === 'pelvis' ? 1 : 0))) {
        const row = h('tr', {}, h('td', { style: `padding:2px 6px;white-space:nowrap;cursor:pointer;color:${b.id === st.sel ? 'var(--select)' : 'var(--text-2)'}`, onclick: () => { st.sel = b.id; draw(); } }, b.name));
        for (let f = 0; f < st.frames; f++) {
          const k = keyAt(b.id, f);
          const cur = f === st.frame;
          row.append(h('td', {
            style: `padding:0;width:22px;height:20px;text-align:center;cursor:pointer;border:1px solid var(--line-soft);background:${cur ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'transparent'};color:${k ? (k.interp === 'step' ? 'var(--warn)' : k.interp === 'easeInOut' ? 'var(--ok)' : 'var(--accent)') : 'var(--text-dim)'}`,
            title: k ? `key: ${k.interp}` : '',
            onclick: () => { st.sel = b.id; go(f); },
          }, k ? '◆' : ''));
        }
        t.append(row);
      }
      tl.innerHTML = '';
      tl.append(t, h('div', { class: 'wnote', style: 'margin-top:6px' },
        h('span', { style: 'color:var(--accent)' }, '◆'), ' linear  ', h('span', { style: 'color:var(--ok)' }, '◆'), ' easeInOut  ', h('span', { style: 'color:var(--warn)' }, '◆'), ' step'));
    }

    // ---- interaction ----
    function go(f) {
      if (st.loop) f = (f + st.frames) % st.frames; else f = Math.max(0, Math.min(st.frames - 1, f));
      st.frame = f; draw();
    }
    let drag = null;
    function canvasPt(e) {
      const r = view.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
    }
    view.addEventListener('pointerdown', e => {
      const p = canvasPt(e), P = pose(st.frame);
      let best = null, bd = 3.5;
      for (const b of BONES) {
        const q = P[b.id];
        const d = b.parent ? Math.hypot(q.tx - p.x, q.ty - p.y) : Math.hypot(q.x - p.x, q.y - p.y);
        // Ties go to later bones (the near limbs draw on top), and the
        // selected bone wins whenever it is in reach.
        if (d <= bd) { bd = d; best = b.id; }
      }
      const s = BONES.find(b => b.id === st.sel), q = P[st.sel];
      if (s && (s.parent ? Math.hypot(q.tx - p.x, q.ty - p.y) : Math.hypot(q.x - p.x, q.y - p.y)) < 3.5) best = st.sel;
      if (!best) return;
      stop();
      st.sel = best; drag = { id: best, y0: p.y, up0: sample(st.up, st.frame, 0) };
      view.setPointerCapture(e.pointerId); draw();
    });
    view.addEventListener('pointermove', e => {
      if (!drag) return;
      const p = canvasPt(e), P = pose(st.frame), b = byId[drag.id];
      if (!b.parent) {
        setKey(st.up, st.frame, Math.round((drag.up0 + (drag.y0 - p.y)) * 2) / 2);
      } else {
        const o = P[b.id], parentA = P[b.parent].a;
        const world = Math.atan2(-(p.y - o.y), p.x - o.x) * 180 / Math.PI;
        let off = world - parentA - b.rest;
        off = ((off % 360) + 540) % 360 - 180;
        setKey(st.rot[b.id], st.frame, Math.round(off));
      }
      draw();
    });
    const end = () => { drag = null; };
    view.addEventListener('pointerup', end); view.addEventListener('pointercancel', end);

    easeSel.onchange = () => { const k = keyAt(st.sel, st.frame); if (k) { k.interp = easeSel.value; draw(); } };
    presetSel.onchange = () => { stop(); load(presetSel.value); presetSel.value = ''; };
    framesIn.onchange = () => { st.frames = Math.max(2, Math.min(16, +framesIn.value || 8)); BONES.forEach(b => { st.rot[b.id] = st.rot[b.id].filter(k => k.frame < st.frames); }); st.up = st.up.filter(k => k.frame < st.frames); draw(); };
    fpsIn.onchange = () => { st.fps = Math.max(1, Math.min(30, +fpsIn.value || 10)); };
    loopIn.onchange = () => { st.loop = loopIn.checked; draw(); };
    onionIn.onchange = () => { st.onion = onionIn.checked; draw(); };

    let timer = null;
    function stop() { if (timer) { clearInterval(timer); timer = null; } playBtn.textContent = '▶ Play'; }
    function play() {
      stop();
      playBtn.textContent = '⏸ Pause';
      timer = setInterval(() => {
        if (!st.loop && st.frame >= st.frames - 1) { stop(); return; }
        st.frame = (st.frame + 1) % st.frames; draw();
      }, 1000 / st.fps);
    }
    playBtn.onclick = () => (timer ? stop() : play());
    el.tabIndex = 0;
    el.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === '[') { e.preventDefault(); go(st.frame - 1); }
      else if (e.key === ']') { e.preventDefault(); go(st.frame + 1); }
      else if (e.key === ' ') { e.preventDefault(); timer ? stop() : play(); }
    });
    new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    if (opts.preset && PRESETS[opts.preset]) load(opts.preset); else draw();
  };
})();
