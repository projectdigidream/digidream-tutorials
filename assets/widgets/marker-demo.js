// marker-demo: the four built-in marker templates, drawn as the game draws
// them (the engine's DEFAULT_MARKERS and its HUD view, client/src/render/
// layout.js): each template's box sits with its bottom-centre on the point it
// hangs from, and its elements are placed in the box by their anchors.
//
// The stage stands for the game's screen, so the stage and the markers wear
// the game's own fixed colours. The controls around it wear the site's.
//
// <div class="widget" data-widget="marker-demo" data-title="…"></div>
(function () {
  window.DNPW = window.DNPW || {};

  const FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  const THEME_TEXT = '#cfe3ff';
  // The health bar: green, then amber at half or less, red at a quarter or less.
  const FILL = '#5fbf6a';
  const LOW = [{ below: 0.5, fill: '#d6a13a', name: 'amber' }, { below: 0.25, fill: '#d65b5b', name: 'red' }];
  const ZOOM = 1.5;

  function barColour(frac) {
    let fill = FILL, name = 'green';
    for (const lo of LOW) if (frac <= lo.below) { fill = lo.fill; name = lo.name; }
    return { fill, name };
  }

  window.DNPW['marker-demo'] = function mount(el) {
    const h = window.DNPh;

    // ---- controls ----
    const value = h('input', { type: 'range', min: 0, max: 100, step: 1, value: 60, 'aria-label': 'value' });
    const maxIn = h('input', { type: 'number', min: 1, max: 9999, step: 1, value: 100, 'aria-label': 'max',
      style: 'width:64px;font:inherit;font-size:13px;background:var(--input);color:var(--text);border:1px solid var(--line);border-radius:var(--r-s);padding:2px 4px' });
    const text = h('input', { type: 'text', value: 'EXIT', maxlength: 40, 'aria-label': 'text',
      style: 'width:120px;font:inherit;font-size:13px;background:var(--input);color:var(--text);border:1px solid var(--line);border-radius:var(--r-s);padding:2px 4px' });
    const valueOut = h('span', { class: 'wout' });

    // ---- the stage: one cell per template ----
    const pos = (anchor, y) => anchor === 'c'
      ? 'left:50%;top:50%;transform:translate(-50%,-50%)'
      : `left:50%;bottom:${-(y || 0)}px;transform:translateX(-50%)`;
    const textStyle = (s) => `position:absolute;white-space:nowrap;font-family:${FONT};font-size:${s.size}px;line-height:1.2;` +
      `color:${s.color || THEME_TEXT};text-align:center;` +
      (s.bg ? `background:${s.bg};` : '') + (s.radius ? `border-radius:${s.radius}px;` : '') + (s.padding ? `padding:${s.padding}px;` : '');

    function cell(name, values, w, hgt, thing) {
      const box = h('div', { style: `position:absolute;left:50%;bottom:0;width:${w}px;height:${hgt}px;` +
        `transform:translateX(-50%) scale(${ZOOM});transform-origin:50% 100%` });
      const point = h('div', { title: 'the point it hangs from', style: 'position:absolute;left:50%;bottom:0;width:5px;height:5px;margin-left:-2.5px;margin-bottom:-2.5px;border-radius:50%;background:#ffffff;opacity:.55' });
      const hang = h('div', { style: `position:absolute;left:0;right:0;bottom:${thing.h + 6}px;height:0` }, box, point);
      const body = h('div', { style: `position:absolute;left:50%;bottom:6px;transform:translateX(-50%);width:${thing.w}px;height:${thing.h}px;${thing.css}` });
      const ground = h('div', { style: 'position:absolute;left:0;right:0;bottom:0;height:6px;background:#2b3326' });
      const stage = h('div', { style: 'position:relative;height:150px;overflow:hidden;border-radius:var(--r-c);' +
        'background:linear-gradient(#141a26,#25303f)' }, ground, body, hang);
      const cap = h('div', { class: 'wout', style: 'margin-top:4px' }, h('code', {}, name), ' · ', values);
      return { box, root: h('div', { style: 'flex:1 1 150px;min-width:0' }, stage, cap) };
    }

    const health = cell('health', 'value, max', 36, 6, { w: 38, h: 34, css: 'background:#6f9a5a;border-radius:50% 50% 38% 38%' });
    const label = cell('label', 'text', 220, 24, { w: 8, h: 40, css: 'background:#8a7a62;border-radius:2px' });
    const marker = cell('marker', 'text', 160, 40, { w: 46, h: 58, css: 'background:#5d5248;border:3px solid #7d6f5f;border-bottom:0;border-radius:4px 4px 0 0' });
    const dbg = cell('debug_health', 'value, max', 80, 16, { w: 38, h: 34, css: 'background:#7a5a9a;border-radius:50% 50% 38% 38%' });

    // health: one bar, anchored in the centre, 36 by 5.
    const bar = h('div', { style: `position:absolute;${pos('c')};width:36px;height:5px;background:#1b2230;border:1px solid #2c3648;border-radius:3px;overflow:hidden` });
    const fill = h('div', { style: 'height:100%;width:0%' });
    bar.append(fill);
    health.box.append(bar);
    // label: a line of text on a dark box, at the bottom.
    const labelText = h('div', { style: textStyle({ size: 12, bg: 'rgba(10,12,18,.72)', radius: 3, padding: 3 }) + pos('b') });
    label.box.append(labelText);
    // marker: a pointer, and the text 18 above it only when there is text.
    const markText = h('div', { style: textStyle({ size: 12, color: '#ffd27a' }) + pos('b', -18) });
    const arrow = h('div', { style: textStyle({ size: 16, color: '#ffd27a' }) + pos('b') }, '▼');
    marker.box.append(markText, arrow);
    // debug_health: value/max as small numbers.
    const dbgText = h('div', { style: textStyle({ size: 11, color: '#ffe08a', bg: 'rgba(0,0,0,.6)', radius: 2, padding: 1 }) + pos('b') });
    dbg.box.append(dbgText);

    const note = h('div', { class: 'wout', style: 'margin-top:8px;min-height:1.4em' });

    function draw() {
      const max = Math.max(1, Math.round(Number(maxIn.value) || 1));
      value.max = String(max);
      const v = Math.min(max, Math.max(0, Math.round(Number(value.value) || 0)));
      const frac = Math.max(0, Math.min(1, v / max));
      const c = barColour(frac);
      fill.style.width = (frac * 100).toFixed(1) + '%';
      fill.style.background = c.fill;
      valueOut.textContent = v + ' of ' + max;
      labelText.textContent = text.value;
      markText.textContent = text.value;
      markText.style.display = text.value ? '' : 'none';
      dbgText.textContent = v + '/' + max;
      note.textContent = 'The bar is ' + Math.round(frac * 100) + '% full, so it is ' + c.name +
        (c.name === 'green' ? '.' : c.name === 'amber' ? ' (half or less).' : ' (a quarter or less).') +
        (text.value ? '' : ' With no text, the pointer has no caption.');
    }
    value.addEventListener('input', draw);
    maxIn.addEventListener('input', draw);
    text.addEventListener('input', draw);

    el.append(
      h('div', { class: 'wrow' },
        h('label', { class: 'wlabel' }, 'value ', value, valueOut),
        h('label', { class: 'wlabel' }, 'max ', maxIn),
        h('label', { class: 'wlabel' }, 'text ', text)),
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:10px' }, health.root, label.root, marker.root, dbg.root),
      note);
    draw();
  };
})();
