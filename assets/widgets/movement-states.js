// movement-states: which way out of a movement state the engine takes.
//
//   <div class="widget" data-widget="movement-states" data-title="…"></div>
//
// A MODEL of the rule, not the engine. The ways are the studio's "swimming"
// and "glide" recipes (studio/src/movement.js), in the order the studio writes
// them, and the order they are tried is the core's (core/src/physics/
// controller.cpp take_transition): the state's own ways first, top to bottom,
// then the ways from any state, top to bottom, skipping one that goes to the
// state the body is in; the first whose conditions all hold is taken, and
// only one a tick. `depth feet` means "at least at the feet".
(function () {
  window.DNPW = window.DNPW || {};

  var DEPTH = ['out of the water', 'water at the feet', 'water at the waist', 'under water'];
  // c: [test(world), words]
  var C = {
    feet: [function (w) { return w.depth >= 1; }, 'water at the feet'],
    waist: [function (w) { return w.depth >= 2; }, 'water at the waist'],
    none: [function (w) { return w.depth === 0; }, 'out of the water'],
    belowWaist: [function (w) { return w.depth < 2; }, 'water below the waist'],
    belowEyes: [function (w) { return w.depth < 3; }, 'head above water'],
    ground: [function (w) { return w.body === 'ground'; }, 'on the ground'],
    falling: [function (w) { return w.body === 'falling'; }, 'falling'],
    pressed: [function (w) { return w.jump === 'pressed'; }, 'jump pressed'],
    held: [function (w) { return w.jump === 'pressed' || w.jump === 'held'; }, 'jump held'],
    released: [function (w) { return w.jump === 'released'; }, 'jump let go']
  };
  // swimming (wade, swim, breath), then glide (hold jump while falling)
  var WAYS = [
    { from: 'default', to: 'wade', when: ['feet'] },
    { from: 'any', to: 'swim', when: ['waist', 'falling'] },
    { from: 'swim', to: 'wade', when: ['ground', 'belowWaist'] },
    { from: 'swim', to: 'wade', when: ['pressed', 'belowEyes'], jump: true },
    { from: 'wade', to: 'default', when: ['none'] },
    { from: 'default', to: 'glide', when: ['falling', 'held'] },
    { from: 'glide', to: 'default', when: ['ground'] },
    { from: 'glide', to: 'default', when: ['released'] }
  ];
  var STATES = ['default', 'wade', 'swim', 'glide'];

  window.DNPW['movement-states'] = function mount(el) {
    var h = window.DNPh;
    var w = { state: 'default', depth: 0, body: 'ground', jump: 'none' };

    var stateRow = h('div', { class: 'wrow' }, h('span', { class: 'wlabel' }, 'now in'));
    var stateBtns = {};
    STATES.forEach(function (s) {
      var b = h('button', { class: 'wbtn', type: 'button', onclick: function () { w.state = s; draw(); } }, s);
      stateBtns[s] = b; stateRow.append(b);
    });
    function pick(label, key, opts) {
      var s = h('select', { 'aria-label': label, onchange: function () { w[key] = key === 'depth' ? Number(s.value) : s.value; draw(); } },
        opts.map(function (o) { return h('option', { value: String(o[0]) }, o[1]); }));
      s.value = String(w[key]);
      return { el: h('label', { class: 'wlabel' }, label + ' ', s), sel: s };
    }
    var depth = pick('water', 'depth', DEPTH.map(function (t, i) { return [i, t]; }));
    var body = pick('body', 'body', [['ground', 'on the ground'], ['rising', 'going up'], ['falling', 'falling']]);
    var jump = pick('jump', 'jump', [['none', 'not touched'], ['pressed', 'pressed this tick'], ['held', 'held'], ['released', 'let go this tick']]);
    var list = h('ol', { style: 'margin:8px 0;padding-left:1.6em' });
    var verdict = h('div', { class: 'wout', style: 'min-height:1.4em;color:var(--text)' });
    var take = h('button', { class: 'wbtn primary', type: 'button' }, 'take it');
    el.append(stateRow, h('div', { class: 'wrow' }, depth.el, body.el, jump.el), list, h('div', { class: 'wrow' }, take, verdict));

    function says(way) { return way.when.map(function (k) { return C[k][1]; }).join(', ') + (way.jump ? ', then jump' : ''); }

    function draw() {
      STATES.forEach(function (s) { stateBtns[s].classList.toggle('on', s === w.state); });
      depth.sel.value = String(w.depth); body.sel.value = w.body; jump.sel.value = w.jump;
      // the order: the state's own, then any state's (never to where it is)
      var order = WAYS.filter(function (x) { return x.from === w.state; })
        .concat(WAYS.filter(function (x) { return x.from === 'any'; }));
      var taken = null;
      list.innerHTML = '';
      order.forEach(function (way) {
        var head = (way.from === 'any' ? 'from any state' : way.from) + ' → ' + way.to;
        var res, tone;
        if (taken) { res = 'not tried: a way was already taken'; tone = 'text-2'; }
        else if (way.from === 'any' && way.to === w.state) { res = 'skipped: already in ' + w.state; tone = 'text-2'; }
        else {
          var fail = way.when.filter(function (k) { return !C[k][0](w); });
          if (fail.length) { res = 'no: not ' + C[fail[0]][1]; tone = 'warn'; }
          else { res = 'holds: taken'; tone = 'ok'; taken = way; }
        }
        list.append(h('li', { style: 'margin:4px 0' },
          h('div', {}, h('b', {}, head), ' · when ' + says(way)),
          h('div', { class: 'wout', style: 'color:var(--' + tone + ')' }, res)));
      });
      if (!order.length) list.append(h('li', {}, 'default has no ways out here.'));
      verdict.textContent = taken ? 'It goes to ' + taken.to + (taken.jump ? ', and jumps.' : '.') : 'No way holds: it stays in ' + w.state + '.';
      take.disabled = !taken;
      take.onclick = function () {
        if (!taken) return;
        w.state = taken.to;
        if (taken.jump) w.body = 'rising';
        if (w.jump === 'pressed') w.jump = 'held';
        if (w.jump === 'released') w.jump = 'none';
        draw();
      };
    }
    draw();
  };
})();
