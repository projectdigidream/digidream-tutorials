// onion: a four-frame, 16×16 bouncing blob with play/pause, an fps slider and
// an onion skin. As in ThreeSprite, the onion skin draws the PREVIOUS frame
// at 35 % opacity under the current one (wrapping from the first frame to the
// last).
//
// <div class="widget" data-widget="onion" data-title="…"></div>
(function () {
  window.DNPW = window.DNPW || {};

  // Four frames of a blob: squash on the ground, stretch going up, round at
  // the top, stretch coming down. Each frame: [top row, height, half-width].
  const FRAMES = [
    { y: 11, h: 4, w: 6 },   // 1: squashed on the ground
    { y: 5, h: 7, w: 3 },    // 2: stretched, rising
    { y: 1, h: 5, w: 4 },    // 3: round, at the top
    { y: 6, h: 7, w: 3 },    // 4: stretched, falling
  ];

  function blob(c, f, body, eye) {
    for (let y = 0; y < f.h; y++) {
      // a rounded silhouette: narrower at the top and bottom rows
      const t = (y + 0.5) / f.h * 2 - 1;
      const half = Math.max(1, Math.round(f.w * Math.sqrt(1 - t * t * 0.7)));
      for (let x = 8 - half; x < 8 + half; x++) { c.fillStyle = body; c.fillRect(x, f.y + y, 1, 1); }
    }
    const ey = f.y + Math.max(1, Math.floor(f.h / 3));
    c.fillStyle = eye; c.fillRect(6, ey, 1, 1); c.fillRect(9, ey, 1, 1);
  }

  window.DNPW['onion'] = function mount(el) {
    const h = window.DNPh;
    let frame = 0, playing = false, fps = 4, onion = true, timer = 0;

    const cv = h('canvas', { width: 16, height: 16, 'aria-label': 'Bouncing blob' });
    cv.style.cssText = 'image-rendering:pixelated;width:192px;height:192px;';
    const play = h('button', { class: 'wbtn primary', type: 'button' }, '▶ Play');
    const prev = h('button', { class: 'wbtn', type: 'button', title: 'Previous frame ([)' }, '◀ [');
    const next = h('button', { class: 'wbtn', type: 'button', title: 'Next frame (])' }, '] ▶');
    const onionBtn = h('button', { class: 'wbtn on', type: 'button' }, 'Onion skin');
    const fpsR = h('input', { type: 'range', min: 1, max: 24, step: 1, value: fps, 'aria-label': 'fps' });
    const fpsOut = h('span', { class: 'wout' });
    const out = h('span', { class: 'wout' });
    const strip = h('div', { class: 'wrow' });
    const cells = FRAMES.map((_, i) => {
      const b = h('button', { class: 'wbtn', type: 'button' }, String(i + 1));
      b.onclick = () => { stop(); frame = i; draw(); };
      strip.append(b);
      return b;
    });

    el.append(
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start' },
        cv,
        h('div', {},
          h('div', { class: 'wrow' }, play, prev, next),
          h('div', { class: 'wrow' }, h('label', { class: 'wlabel' }, 'fps ', fpsR, fpsOut)),
          h('div', { class: 'wrow' }, onionBtn),
          h('div', { class: 'wlabel' }, 'Frames'),
          strip,
          out)));

    function draw() {
      const c = cv.getContext('2d');
      c.clearRect(0, 0, 16, 16);
      const ground = getComputedStyle(document.documentElement).getPropertyValue('--line-strong').trim() || '#555';
      if (onion) {
        c.globalAlpha = 0.35;
        blob(c, FRAMES[(frame - 1 + FRAMES.length) % FRAMES.length], '#e0605a', '#2a1010');
        c.globalAlpha = 1;
      }
      blob(c, FRAMES[frame], '#7ad48a', '#10301a');
      c.fillStyle = ground; c.fillRect(0, 15, 16, 1);
      cells.forEach((b, i) => b.classList.toggle('on', i === frame));
      fpsOut.textContent = fps + ' fps · ' + Math.round(1000 / fps) + ' ms a frame';
      out.textContent = 'frame ' + (frame + 1) + ' / ' + FRAMES.length + (onion ? ' · faded: frame ' + (((frame - 1 + FRAMES.length) % FRAMES.length) + 1) : '');
    }
    function tick() { frame = (frame + 1) % FRAMES.length; draw(); }
    function start() { playing = true; play.textContent = '❚❚ Pause'; clearInterval(timer); timer = setInterval(tick, 1000 / fps); }
    function stop() { playing = false; play.textContent = '▶ Play'; clearInterval(timer); }

    play.onclick = () => (playing ? stop() : start());
    prev.onclick = () => { stop(); frame = (frame - 1 + FRAMES.length) % FRAMES.length; draw(); };
    next.onclick = () => { stop(); tick(); };
    onionBtn.onclick = () => { onion = !onion; onionBtn.classList.toggle('on', onion); draw(); };
    fpsR.oninput = () => { fps = Number(fpsR.value); if (playing) start(); draw(); };
    draw();
  };
})();
