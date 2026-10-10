// room-draw: draw a room the way the studio's ▭ Room tool does, then place
// a thing in it and turn its facing.
//
//   <div class="widget" data-widget="room-draw" data-title="…"></div>
//   <div class="widget" data-widget="room-draw" data-mode="place"></div>
//
// Room: tap corners, tap the first one again to close (or Enter); Esc cancels;
// or drag a rectangle. Place: tap inside a room to drop a thing; the facing
// slider turns the arrow at its foot. 0 is +x (right), counter-clockwise, so
// 90 points up the screen. Corners snap to the grid, as in the studio.
(function () {
  window.DNPW = window.DNPW || {};

  var COLS = 20;          // grid cells across
  var TAP_SLOP = 8;       // px that still counts as a tap, as in the studio
  var CLOSE_PX = 14;      // how near the first corner closes the room

  function css(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function inside(poly, x, y) {
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if (((a.y > y) !== (b.y > y)) && (x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x)) c = !c;
    }
    return c;
  }

  window.DNPW['room-draw'] = function mount(el, opts) {
    var h = window.DNPh;
    var mode = opts.mode === 'place' ? 'place' : 'room';
    var rooms = [];          // [[{x,y}]] in grid units
    var corners = [];        // the room being drawn
    var rect = null;         // { x0, y0, x1, y1 } while dragging
    var things = [];         // { x, y, angle }
    var sel = -1;            // index of the selected thing
    var hover = null;        // pointer, in grid units (unsnapped)
    var down = null;         // { sx, sy, moved }
    var cell = 24, rows = 12, W = 480, H = 288;

    if (mode === 'place') {
      rooms.push([{ x: 4, y: 2 }, { x: 15, y: 2 }, { x: 15, y: 9 }, { x: 9, y: 9 }, { x: 9, y: 7 }, { x: 4, y: 7 }]);
    }

    var canvas = h('canvas', { tabindex: '0', 'aria-label': 'A grid to draw a room on' });
    canvas.style.width = '100%';
    canvas.style.outline = 'none';
    var roomBtn = h('button', { class: 'wbtn', type: 'button' }, '▭ Room');
    var placeBtn = h('button', { class: 'wbtn', type: 'button' }, '✦ Place');
    var closeBtn = h('button', { class: 'wbtn', type: 'button' }, 'close (Enter)');
    var clearBtn = h('button', { class: 'wbtn', type: 'button' }, 'clear');
    var slider = h('input', { type: 'range', min: '0', max: '355', step: '5', value: '0' });
    var deg = h('span', { class: 'wout' }, '0°');
    var facingLabel = h('label', { class: 'wlabel' }, 'facing (°)', slider, deg);
    var out = h('div', { class: 'wout' });
    el.append(
      h('div', { class: 'wrow' }, roomBtn, placeBtn, closeBtn, clearBtn),
      canvas,
      h('div', { class: 'wrow' }, facingLabel),
      out
    );

    function say(t) { out.textContent = t; }

    function setMode(m) {
      mode = m;
      corners = []; rect = null;
      roomBtn.classList.toggle('on', m === 'room');
      placeBtn.classList.toggle('on', m === 'place');
      closeBtn.style.display = m === 'room' ? '' : 'none';
      if (m === 'room') say('tap corners, tap the first one again to close -- or drag a rectangle');
      else say(rooms.length ? 'tap the floor inside a room to place a thing' : 'draw a room first: there is no floor to place on');
      syncSlider();
      draw();
    }

    function syncSlider() {
      var t = things[sel];
      slider.disabled = !t;
      facingLabel.style.opacity = t ? '1' : '.5';
      slider.value = t ? String(t.angle) : '0';
      deg.textContent = (t ? t.angle : 0) + '°';
    }

    var lastW = -1;
    function size() {
      var w = Math.max(240, Math.min(640, el.clientWidth - 2 || 480));
      if (w === lastW) return;
      lastW = w;
      cell = w / COLS;
      rows = Math.max(8, Math.round((w * 0.6) / cell));
      W = w; H = rows * cell;
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.height = H + 'px';
      canvas.style.maxWidth = W + 'px';
      canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function toGrid(e) {
      var r = canvas.getBoundingClientRect();
      var sx = (e.clientX - r.left) * (W / r.width), sy = (e.clientY - r.top) * (H / r.height);
      return { sx: sx, sy: sy, x: sx / cell, y: sy / cell };
    }
    function snap(p) { return { x: Math.round(p.x), y: Math.round(p.y) }; }
    function snapHalf(p) { return { x: Math.round(p.x * 4) / 4, y: Math.round(p.y * 4) / 4 }; }

    function finish() {
      if (corners.length < 3) { say('a room needs at least three corners'); return; }
      rooms.push(corners);
      corners = [];
      say('closed: a room of ' + rooms[rooms.length - 1].length + ' corners. Draw another, or switch to ✦ Place.');
      draw();
    }
    function cancel() {
      if (!corners.length && !rect) return;
      corners = []; rect = null;
      say('cancelled');
      draw();
    }

    function roomTap(p) {
      var s = snap(p);
      if (corners.length >= 3) {
        var f = corners[0];
        if (Math.hypot((f.x - p.x) * cell, (f.y - p.y) * cell) < CLOSE_PX) { finish(); return; }
      }
      if (corners.some(function (c) { return c.x === s.x && c.y === s.y; })) return;
      corners.push(s);
      say(corners.length + ' corner' + (corners.length > 1 ? 's' : '') + (corners.length >= 3 ? ' -- tap the first one, or press Enter, to close' : ''));
      draw();
    }

    function placeTap(p) {
      // A tap on a thing picks it.
      for (var i = things.length - 1; i >= 0; i--) {
        if (Math.hypot((things[i].x - p.x) * cell, (things[i].y - p.y) * cell) < 12) {
          sel = i; syncSlider(); say('picked thing ' + (i + 1) + ', facing ' + things[i].angle + '°'); draw(); return;
        }
      }
      var s = snapHalf(p);
      if (!rooms.some(function (r) { return inside(r, s.x, s.y); })) { say('tap the floor inside a room'); return; }
      things.push({ x: s.x, y: s.y, angle: 0 });
      sel = things.length - 1;
      syncSlider();
      say('placed thing ' + things.length + '. Move the facing slider to turn it.');
      draw();
    }

    canvas.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      canvas.focus();
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      var g = toGrid(e);
      down = { sx: g.sx, sy: g.sy, moved: false, start: g };
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', function (e) {
      var g = toGrid(e);
      hover = g;
      if (down) {
        if (!down.moved && Math.hypot(g.sx - down.sx, g.sy - down.sy) > TAP_SLOP) {
          down.moved = true;
          if (mode === 'room' && !corners.length) { var a = snap(down.start); rect = { x0: a.x, y0: a.y, x1: a.x, y1: a.y }; }
        }
        if (rect) { var b = snap(g); rect.x1 = b.x; rect.y1 = b.y; }
      }
      draw();
    });
    function up(e, cancelled) {
      if (!down) return;
      var g = toGrid(e);
      if (rect) {
        var r = rect; rect = null;
        if (!cancelled && r.x0 !== r.x1 && r.y0 !== r.y1) {
          var x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1), y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1);
          rooms.push([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]);
          say('a rectangle room, ' + (x1 - x0) + ' by ' + (y1 - y0) + ' cells');
        }
        draw();
      } else if (!down.moved && !cancelled) {
        if (mode === 'room') roomTap(g); else placeTap(g);
      }
      down = null;
    }
    canvas.addEventListener('pointerup', function (e) { up(e, false); });
    canvas.addEventListener('pointercancel', function (e) { up(e, true); });
    canvas.addEventListener('pointerleave', function () { hover = null; draw(); });
    canvas.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && mode === 'room') { e.preventDefault(); finish(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });

    roomBtn.onclick = function () { setMode('room'); };
    placeBtn.onclick = function () { setMode('place'); };
    closeBtn.onclick = function () { finish(); };
    clearBtn.onclick = function () {
      rooms = opts.mode === 'place' ? rooms.slice(0, 1) : [];
      corners = []; things = []; sel = -1; rect = null;
      syncSlider(); say('cleared'); draw();
    };
    slider.addEventListener('input', function () {
      var t = things[sel];
      if (!t) return;
      t.angle = Number(slider.value);
      deg.textContent = t.angle + '°';
      draw();
    });

    function poly(g, pts) {
      g.beginPath();
      pts.forEach(function (p, i) { if (i) g.lineTo(p.x * cell, p.y * cell); else g.moveTo(p.x * cell, p.y * cell); });
      g.closePath();
    }

    function draw() {
      var g = canvas.getContext('2d');
      var accent = css('--accent', '#5b8fd6'), line = css('--line', '#2a3446'), dim = css('--text-dim', '#6f7e96');
      var ok = css('--ok', '#7ad48a'), selc = css('--select', '#ffe066'), sunk = css('--sunken', '#07090d');
      g.clearRect(0, 0, W, H);
      g.fillStyle = sunk; g.fillRect(0, 0, W, H);
      // grid
      g.strokeStyle = line; g.lineWidth = 1;
      g.beginPath();
      for (var x = 0; x <= COLS; x++) { g.moveTo(x * cell + 0.5, 0); g.lineTo(x * cell + 0.5, H); }
      for (var y = 0; y <= rows; y++) { g.moveTo(0, y * cell + 0.5); g.lineTo(W, y * cell + 0.5); }
      g.stroke();
      // rooms
      rooms.forEach(function (r) {
        poly(g, r);
        g.globalAlpha = 0.28; g.fillStyle = accent; g.fill(); g.globalAlpha = 1;
        g.strokeStyle = accent; g.lineWidth = 2; g.stroke();
        g.fillStyle = accent;
        r.forEach(function (p) { g.fillRect(p.x * cell - 3, p.y * cell - 3, 6, 6); });
      });
      // the room being drawn
      if (corners.length) {
        g.strokeStyle = selc; g.lineWidth = 2;
        g.beginPath();
        corners.forEach(function (p, i) { if (i) g.lineTo(p.x * cell, p.y * cell); else g.moveTo(p.x * cell, p.y * cell); });
        if (hover && mode === 'room') {
          var s = snap(hover);
          g.setLineDash([5, 4]); g.lineTo(s.x * cell, s.y * cell);
        }
        g.stroke(); g.setLineDash([]);
        corners.forEach(function (p, i) {
          g.fillStyle = selc;
          g.beginPath(); g.arc(p.x * cell, p.y * cell, i === 0 ? 5 : 4, 0, Math.PI * 2); g.fill();
        });
        if (corners.length >= 3 && hover) {
          var f = corners[0];
          if (Math.hypot((f.x - hover.x) * cell, (f.y - hover.y) * cell) < CLOSE_PX) {
            g.strokeStyle = ok; g.lineWidth = 2;
            g.beginPath(); g.arc(f.x * cell, f.y * cell, 10, 0, Math.PI * 2); g.stroke();
          }
        }
      }
      // the rectangle being dragged
      if (rect) {
        g.strokeStyle = selc; g.lineWidth = 2; g.setLineDash([6, 4]);
        g.strokeRect(Math.min(rect.x0, rect.x1) * cell, Math.min(rect.y0, rect.y1) * cell,
                     Math.abs(rect.x1 - rect.x0) * cell, Math.abs(rect.y1 - rect.y0) * cell);
        g.setLineDash([]);
      }
      // snap cursor
      if (hover && mode === 'room' && !rect) {
        var c = snap(hover);
        g.strokeStyle = dim; g.lineWidth = 1;
        g.beginPath(); g.arc(c.x * cell, c.y * cell, 6, 0, Math.PI * 2); g.stroke();
      }
      // things, with the facing arrow at the foot: 0 = +x, counter-clockwise
      things.forEach(function (t, i) {
        var px = t.x * cell, py = t.y * cell;
        var a = t.angle * Math.PI / 180;
        var dx = Math.cos(a), dy = -Math.sin(a);
        var col = i === sel ? selc : ok;
        var len = Math.max(18, cell * 1.1);
        g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2.5;
        g.beginPath(); g.arc(px, py, 7, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + dx * len, py + dy * len); g.stroke();
        var hx = px + dx * len, hy = py + dy * len, nx = -dy, ny = dx;
        g.beginPath();
        g.moveTo(hx + dx * 6, hy + dy * 6);
        g.lineTo(hx - dx * 2 + nx * 5, hy - dy * 2 + ny * 5);
        g.lineTo(hx - dx * 2 - nx * 5, hy - dy * 2 - ny * 5);
        g.closePath(); g.fill();
        g.font = '11px ' + css('--mono', 'monospace');
        g.fillText(t.angle + '°', px + 9, py + 16);
      });
      // compass: which way 0 and 90 are
      g.fillStyle = dim; g.font = '11px ' + css('--mono', 'monospace');
      g.fillText('+x → 0°   ↑ 90°', 6, H - 6);
    }

    if (window.ResizeObserver) new ResizeObserver(function () { size(); }).observe(el);
    else window.addEventListener('resize', size);
    // Redraw when the theme changes.
    new MutationObserver(function () { draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', draw);
    }
    size();
    setMode(mode);
  };
})();
