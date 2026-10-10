// trigger-builder: pick a preset chip, see the triggers it writes.
//
//   <div class="widget" data-widget="trigger-builder" data-title="…"></div>
//
// The sentences are the studio's presets (studio/src/presets.js), written in
// the trigger vocabulary (engine/maps/scripts/trigger_vocab.json). Rooms and
// walls are shown as placeholders ("the door room"), because here nothing was
// tapped. Speeds are left out to keep the lines short.
(function () {
  window.DNPW = window.DNPW || {};

  var PRESETS = [
    { id: 'door', label: '🚪 door', asks: 'the door sector (it will close up)',
      note: 'The door room\'s ceiling drops to its floor. Each wall that faces it from a neighbouring room gets the usable flag. With more than one neighbour, there is an open and a close per side ("open from …").',
      triggers: [
        { name: 'door: shut', when: null, ifs: ['sector_at_rest · the door room'], thens: ['sector_move · the door room · ceiling to base_ceiling'] },
        { name: 'door: open', when: 'on_interact',
          ifs: ['side_is · the wall facing the door', 'sector_at_rest · behind', 'not sector_offset_at_least · behind · 0.25'],
          thens: ['sector_move · behind · ceiling to lowest_neighbour_ceiling', 'run_after · door: shut · after behind · 90 ticks'] },
        { name: 'door: close', when: 'on_interact',
          ifs: ['side_is · the wall facing the door', 'sector_at_rest · behind', 'sector_offset_at_least · behind · 0.25'],
          thens: ['sector_move · behind · ceiling to base_ceiling'] }
      ] },
    { id: 'lift', label: '⇕ lift', asks: 'the lift sector',
      note: 'Each neighbour\'s wall facing the lift gets the trigger flag, so walking onto the lift is a crossing.',
      triggers: [
        { name: 'lift: raise', when: null, ifs: [], thens: ['sector_move · the lift · floor to base_floor'] },
        { name: 'lift: lower', when: null, ifs: [], thens: ['sector_move · the lift · floor to lowest_neighbour_floor', 'run_after · lift: raise · after the lift · 60 ticks'] },
        { name: 'lift: step on from …', when: 'on_cross',
          ifs: ['side_is · the neighbour\'s wall facing the lift', 'sector_at_rest · the lift'], thens: ['run · lift: lower'] }
      ] },
    { id: 'switch', label: '⏻ switch', asks: 'the wall with the switch, then the sector it moves',
      note: 'The switch wall gets the usable flag.',
      triggers: [
        { name: 'switch', when: 'on_interact',
          ifs: ['side_is · the switch wall', 'sector_at_rest · the target'],
          thens: ['sector_move · the target · floor to lowest_neighbour_floor'] }
      ] },
    { id: 'teleport', label: '✧ teleport', asks: 'the wall to cross, then where to arrive',
      note: 'The wall gets the trigger flag. If a room is on the other side, its side is flagged too and gets a second trigger, because a crossing is reported as the side of the room you left.',
      triggers: [
        { name: 'teleport', when: 'on_cross', ifs: ['side_is · the wall'], thens: ['teleport · x y z of the arrival room\'s centre'] },
        { name: 'teleport: from the other side', when: 'on_cross', ifs: ['side_is · the other side of the wall'], thens: ['teleport · x y z of the arrival room\'s centre'] }
      ] },
    { id: 'ambush', label: '☠ ambush', asks: 'the wall to cross, then where the monster appears (and which monster, if the module has more than one)',
      note: 'Both triggers are once. Whichever fires first disables the other, so the monster appears once. The module needs a monster first.',
      triggers: [
        { name: 'ambush', when: 'on_cross', once: true, ifs: ['side_is · the wall'], thens: ['spawn_enemy · the monster · x y z', 'disable · ambush: from the other side'] },
        { name: 'ambush: from the other side', when: 'on_cross', once: true, ifs: ['side_is · the other side of the wall'], thens: ['disable · ambush', 'spawn_enemy · the monster · x y z'] }
      ] },
    { id: 'exit', label: '⇥ exit', asks: 'the wall with the exit switch',
      note: 'The wall gets the usable flag. change_map with no level is the next level in the server\'s order, and it moves only the player who pressed.',
      triggers: [
        { name: 'exit', when: 'on_interact', once: true, ifs: ['side_is · the exit wall'], thens: ['log · exit reached', 'change_map'] }
      ] },
    { id: 'crusher', label: '▼ crusher', asks: 'the wall with the switch, then the sector whose ceiling crushes',
      note: 'The ceiling goes down to just above the floor and back, over and over (loop pingpong).',
      triggers: [
        { name: 'crusher', when: 'on_interact', once: true, ifs: ['side_is · the switch wall'], thens: ['sector_move · the target · ceiling to absolute · floor + 0.25 · loop pingpong'] }
      ] },
    { id: 'slider', label: '⇄ slider', asks: 'the wall with the switch, then the platform that travels',
      note: 'The platform slides 4 units along x, waits 90 ticks after it stops, and slides back.',
      triggers: [
        { name: 'slider: back', when: null, ifs: [], thens: ['sector_move · the platform · floor · dx -4'] },
        { name: 'slider: out', when: 'on_interact', ifs: ['side_is · the switch wall', 'sector_at_rest · the platform'],
          thens: ['sector_move · the platform · floor · dx 4', 'run_after · slider: back · after the platform · 90 ticks'] }
      ] },
    { id: 'turntable', label: '⟳ turntable', asks: 'the wall with the switch, then the sector that turns',
      note: 'Each press turns the sector a quarter turn.',
      triggers: [
        { name: 'turntable: turn', when: 'on_interact', ifs: ['side_is · the switch wall', 'sector_at_rest · the sector'], thens: ['sector_move · the sector · floor · spin 90'] }
      ] },
    { id: 'blank', label: '+ blank', asks: 'nothing',
      note: 'A blank card to fill in yourself. It opens straight away.',
      triggers: [
        { name: 'trigger 1', when: 'on_interact', ifs: [], thens: ['log · hello'] }
      ] }
  ];

  // The studio marks WHEN with the event's icon (studio/src/cards.js).
  var ICON = { on_interact: '✋', on_cross: '🚶' };

  window.DNPW['trigger-builder'] = function mount(el) {
    var h = window.DNPh;
    var chips = h('div', { class: 'wrow' });
    var asks = h('p', { class: 'wnote' });
    var list = h('div');
    var note = h('p', { class: 'wnote' });
    el.append(chips, asks, list, note);

    function line(tone, mark, title, items) {
      var box = h('div', { style: 'border-left:3px solid var(--' + tone + ');padding:4px 0 4px 10px;margin:6px 0' });
      box.append(h('div', { style: 'font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--' + tone + ')' }, mark + ' ' + title));
      items.forEach(function (t) { box.append(h('div', { class: 'wout', style: 'color:var(--text)' }, t)); });
      return box;
    }

    function show(p) {
      chips.querySelectorAll('.wbtn').forEach(function (b) { b.classList.toggle('on', b.dataset.id === p.id); });
      asks.textContent = p.id === 'blank' ? 'Nothing to tap.' : 'The studio asks you to tap: ' + p.asks + '.';
      list.innerHTML = '';
      list.append(h('div', { class: 'wout', style: 'margin:6px 0' }, p.id + ': ' + p.triggers.length + ' trigger(s) written'));
      p.triggers.forEach(function (t) {
        var card = h('div', { style: 'border:1px solid var(--line);border-radius:var(--r-c);padding:8px 10px;margin:8px 0;background:var(--panel)' });
        card.append(h('div', { style: 'font-weight:700' }, t.name + (t.once ? ' · once' : '')));
        card.append(line('when', t.when ? (ICON[t.when] || '⚡') : '↪', 'WHEN', [t.when || 'only when another trigger runs it']));
        card.append(line('if', '❓', 'IF all of these hold', t.ifs.length ? t.ifs : ['always']));
        card.append(line('then', '▶', 'THEN, in order', t.thens.map(function (x, i) { return (i + 1) + '. ' + x; })));
        list.append(card);
      });
      note.textContent = p.note;
    }

    PRESETS.forEach(function (p) {
      var b = h('button', { class: 'wbtn', type: 'button', 'data-id': p.id }, p.label);
      b.onclick = function () { show(p); };
      chips.append(b);
    });
    show(PRESETS[0]);
  };
})();
