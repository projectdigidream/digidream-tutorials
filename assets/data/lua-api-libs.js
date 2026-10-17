// The Lua reference, part two: the four runtime tables a level (or the game)
// carries -- mobs, triggers, graphs, weapons -- and Lua's own standard library
// as the engine opens it. Part one (lua-api-world.js) holds the hooks, dnp.*,
// the entity, prop and sector methods, fx and vec3.
// Checked against the engine by tools/check-lua-ref.mjs.
// Docs are plain text: `code` in backticks, a blank line between paragraphs.
(function () {
  window.DNP_LUA_API = window.DNP_LUA_API || { groups: [], internal: [], extra: [] };
  const API = window.DNP_LUA_API;

  // ------------------------------------------------------------------ mobs
  API.groups.push({
    id: 'mobs', order: 200, title: 'mobs — monsters',
    intro: 'The monster runtime. It is present in a level when the module defines monsters or weapons, and only in levels: the game machine has no monsters. Guard a script that may run without it with `if mobs ~= nil then … end`.\n\nA monster\'s health lives here, not on the entity: `e:hp()` is a player\'s. Use `mobs.health` and `mobs.set_health` for monsters, and `mobs.hurt` to damage anything.',
    entries: [
      {
        id: 'mobs.spawn', sig: 'mobs.spawn(kind, pos [, opts]) → entity | nil', where: 'level',
        doc: 'Spawn one monster of a kind the module defines, at `pos`, and start its brain. Returns its entity, or `nil` when the kind is unknown (a line in the Play log says so) or the body could not be placed.\n\nPrefer this to `dnp.spawn_enemy`, which makes a body with no brain, no health and no pain.',
        args: [
          { name: 'kind', type: 'string', doc: 'the monster\'s name, as the studio\'s monster list shows it' },
          { name: 'pos', type: 'vec3', doc: 'where its feet go' },
          { name: 'opts', type: 'table', optional: true, doc: '`{ dormant = true }` spawns it asleep: it does nothing until a `wake` action, or another monster\'s `alert_nearby`, wakes it. Being hurt alone does not wake it' },
        ],
        returns: 'entity | nil',
        notes: ['Monsters you spawn are saved with the level like the placed ones.', 'Spawn inside a hook, not at the top of a script: at load the map has not placed its own things yet.'],
        example: 'function on_prop_use(e, p)\n  if p:name() == "summoning_stone" and mobs ~= nil then\n    local at = p:pos()\n    mobs.spawn("imp", vec3.new(at.x + 2, at.y, at.z))\n  end\nend',
        see: ['mobs.place', 'mobs.has', 'dnp.spawn_enemy'],
      },
      {
        id: 'mobs.place', sig: 'mobs.place(list)', where: 'level',
        doc: 'Spawn a list of monsters at once: `{ {kind = "imp", x = 4, y = 10, z = 0}, … }`. Each item may also carry `dormant = true`.\n\nWith `scale = N` in the list, every coordinate is in 1/N units, so `x = 656, scale = 48` means 656/48 exactly. Without it, coordinates are engine units.\n\nThis is what the studio writes for the monsters you place on a map. It does nothing while a saved level is being restored: the monsters that were alive come back from the save instead.',
        args: [{ name: 'list', type: 'table', doc: 'the items, and an optional `scale`' }],
        returns: 'nothing',
        example: 'mobs.place{\n  {kind = "zombieman", x = 10, y = 4, z = 0},\n  {kind = "imp", x = 14, y = 4, z = 0, dormant = true},\n}',
        see: ['mobs.spawn', 'dnp.restoring'],
      },
      {
        id: 'mobs.hurt', sig: 'mobs.hurt(target, amount [, by])', where: 'level',
        doc: 'Damage a monster or a player. The one door for damage: weapons, missiles and monster attacks all come through it.\n\nA monster loses health, may flinch (its pain chance), turns on another monster that hurt it (if it fights its own kind), and at 0 dies: its death sequence, its drops, its corpse. A player loses health through `mobs.on_player_hurt` if you set one, or else by the default rule (see that entry). A prop has no health and is ignored.\n\nThe graphs\' `when_hurt` and `when_dies` events fire from here.',
        args: [
          { name: 'target', type: 'entity', doc: 'who is hit; a prop or an invalid handle does nothing' },
          { name: 'amount', type: 'number', doc: 'health to take off' },
          { name: 'by', type: 'entity or attacker record', optional: true, doc: 'who did it: the attacking entity (on_attack\'s `attacker` is one), a record such as `mobs.synthetic_owner(e, e:facing())` gives, or `nil` for nobody. An entity that is gone counts as nobody' },
        ],
        returns: 'nothing',
        notes: ['A monster that belongs to a neighbouring level of the same world is hurt there, by that level: the hit is handed over for you.'],
        example: 'function on_attack(attacker, target)\n  if mobs ~= nil and target ~= nil then\n    mobs.hurt(target, 10, attacker)\n  end\nend',
        see: ['mobs.health', 'mobs.on_player_hurt', 'mobs.on_death', 'hook.on_attack'],
      },
      {
        id: 'mobs.health', sig: 'mobs.health(e) → number | nil', where: 'level',
        doc: 'A monster\'s health. `0` for a dead monster, `nil` for anything that is not a monster of this level (a player, a prop, a stale handle).',
        args: [{ name: 'e', type: 'entity' }], returns: 'number | nil',
        example: 'local hp = mobs.health(e)\nif hp ~= nil and hp < 20 then print("nearly dead") end',
        see: ['mobs.set_health', 'entity.hp'],
      },
      {
        id: 'mobs.set_health', sig: 'mobs.set_health(e, hp) → boolean', where: 'level',
        doc: 'Set a live monster\'s health. Rounded down, kept between 1 and the monster\'s maximum, so it heals or wounds but never kills: use `mobs.hurt` for that. `false` when `e` is not a live monster here.',
        args: [{ name: 'e', type: 'entity' }, { name: 'hp', type: 'number' }], returns: 'boolean',
        example: '-- heal every monster near a shrine back to full\nmobs.set_health(e, 9999)',
        see: ['mobs.health', 'mobs.hurt'],
      },
      {
        id: 'mobs.pain_ticks', sig: 'mobs.pain_ticks(e) → number | nil', where: 'level',
        doc: 'How long a live monster flinches when hurt, in ticks: what a script set with `mobs.set_pain_ticks`, else its `pain` state\'s own `ticks`. `nil` for anything that is not a live monster, or one with no pain state. The hit\'s own share (the monster\'s `pain_time`) comes on top.',
        args: [{ name: 'e', type: 'entity' }], returns: 'number | nil', see: ['mobs.set_pain_ticks'],
      },
      {
        id: 'mobs.set_pain_ticks', sig: 'mobs.set_pain_ticks(e, ticks) → boolean', where: 'level',
        doc: 'Change how long a live monster flinches, in ticks (at least 1). `nil` puts back its own. Takes effect from its next flinch. For a stun weapon, or a monster that shrugs hits off in a frenzy.',
        args: [{ name: 'e', type: 'entity' }, { name: 'ticks', type: 'number | nil' }], returns: 'boolean',
        example: '-- stunned for two seconds by every hit, for ten seconds\nmobs.set_pain_ticks(e, 120)\nlocal until_tick = dnp.tick() + 600\n-- later, in on_tick: if dnp.tick() >= until_tick then mobs.set_pain_ticks(e, nil) end',
        see: ['mobs.pain_ticks'],
      },
      {
        id: 'mobs.has', sig: 'mobs.has(kind) → boolean', where: 'level',
        doc: 'Is `kind` a monster this level defines? Check before `mobs.spawn` when the name comes from data.',
        args: [{ name: 'kind', type: 'string' }], returns: 'boolean', see: ['mobs.spawn'],
      },
      {
        id: 'mobs.has_missile', sig: 'mobs.has_missile(name) → boolean', where: 'level',
        doc: 'Is `name` a missile this level knows (the module\'s own or one added with `mobs.add_missiles`)?',
        args: [{ name: 'name', type: 'string' }], returns: 'boolean', see: ['mobs.add_missiles', 'mobs.launch_from'],
      },
      {
        id: 'mobs.add_missiles', sig: 'mobs.add_missiles(table)', where: 'level',
        doc: 'Add missile kinds after the module\'s monsters loaded: `{ name = definition, … }`, each definition with the same fields a monster\'s missile has. A name that already exists is refused (the first one stays), and so is a definition with a problem; both are said in the Play log.',
        args: [{ name: 'table', type: 'table', doc: 'missile definitions by name' }], returns: 'nothing',
        notes: ['The fields are the ones the monster editor\'s missile page shows; see the monster vocabulary in the Enemies track.'],
        see: ['mobs.has_missile', 'mobs.launch_from'],
      },
      {
        id: 'mobs.launch_from', sig: 'mobs.launch_from(e, kind, angle [, offset [, slope]]) → record | nil', where: 'level',
        doc: 'Fire missile `kind` from entity `e`, as if `e` were a monster: heading `angle` (brad: 2^32 is a full turn, so `e:facing()` is straight ahead), starting `offset` units in front of it so it does not burst on its own shooter, rising by `slope` per unit of run (`nil` flies flat). Returns the attacker record the missile carries, or `nil` when `e` is not valid. An unknown kind fires nothing.',
        args: [
          { name: 'e', type: 'entity' }, { name: 'kind', type: 'string', doc: 'a missile name' },
          { name: 'angle', type: 'number', doc: 'heading in brad' },
          { name: 'offset', type: 'fx', optional: true }, { name: 'slope', type: 'fx', optional: true },
        ],
        returns: 'record | nil',
        example: 'function on_prop_use(e, p)\n  if p:name() == "turret" then\n    mobs.launch_from(e, "fireball", e:facing(), fx.int(1), mobs.pitch_slope(e))\n  end\nend',
        see: ['mobs.pitch_slope', 'mobs.autoaim', 'dnp.atan2'],
      },
      {
        id: 'mobs.autoaim', sig: 'mobs.autoaim(e [, range [, slop]]) → target, angle, slope | nil', where: 'level',
        doc: 'What a shot from `e` should be pointed at: the nearest solid player or live monster within `range` (default 2048 units) and within `slop` degrees either side of where `e` faces (default 5.625, Doom\'s own), that `e` can see. Returns the target, the exact heading to it in brad, and the slope to its middle; or `nil` when nothing qualifies, and then you fire where `e` already faces.',
        args: [{ name: 'e', type: 'entity' }, { name: 'range', type: 'fx', optional: true }, { name: 'slop', type: 'number', optional: true, doc: 'degrees' }],
        returns: 'entity, number, fx — or nil',
        example: 'local t, ang, slope = mobs.autoaim(e)\nif t == nil then ang, slope = e:facing(), nil end\nmobs.launch_from(e, "fireball", ang, fx.int(1), slope)',
        see: ['mobs.launch_from', 'dnp.can_see'],
      },
      {
        id: 'mobs.pitch_slope', sig: 'mobs.pitch_slope(e) → fx | nil', where: 'level',
        doc: 'Where a player looks up or down, as a slope (rise per unit of run), from `e:pitch()`. `nil` when they look level. Only first-person controls give a player a pitch.',
        args: [{ name: 'e', type: 'entity' }], returns: 'fx | nil', see: ['mobs.free_aim', 'entity.pitch'],
      },
      {
        id: 'mobs.free_aim', sig: 'mobs.free_aim() → boolean', where: 'level',
        doc: 'True when the module\'s controls are first-person, so players aim up and down themselves.',
        args: [], returns: 'boolean', see: ['mobs.pitch_slope', 'dnp.controls'],
      },
      {
        id: 'mobs.apply_hit', sig: 'mobs.apply_hit(target, origin, attack [, share [, bare]])', where: 'level',
        doc: 'Everything a blow does to a body except the damage: the shove, the slow-down and the hit particles. `attack` is a table with the fields a weapon\'s or a monster\'s attack has: `knockback` and `lift` (fx) shove away from `origin`, heavier monsters less (their `mass`, 100 by default); `slow` (a multiplier) and `slow_ticks` slow them; `hit_vfx` sprays particles, unless the monster bleeds its own `blood`. `share` (fx, default 1) scales the shove, as a blast\'s distance does. `bare = true` shoves without the slide that follows.',
        args: [
          { name: 'target', type: 'entity' }, { name: 'origin', type: 'vec3', doc: 'where the blow came from' },
          { name: 'attack', type: 'table' }, { name: 'share', type: 'fx', optional: true }, { name: 'bare', type: 'boolean', optional: true },
        ],
        returns: 'nothing',
        notes: ['Pair it with `mobs.hurt` for the damage.'],
        example: '-- a bounce pad that throws you away from its centre\nfunction on_touch(e, p)\n  if p:name() == "bumper" then\n    mobs.apply_hit(e, p:pos(), { knockback = fx.int(12), lift = fx.int(4) })\n  end\nend',
        see: ['mobs.hurt', 'dnp.knock_impulse', 'entity.add_impulse'],
      },
      {
        id: 'mobs.tagged_effect', sig: 'mobs.tagged_effect(e, tag, param, op, value [, ticks]) → id', where: 'level',
        doc: 'Like `e:add_effect(param, op, value, ticks)`, but under a name: a second call with the same `tag` on the same entity first removes the effect the first one added, so effects do not pile up. Returns the effect id (0 when it was refused).',
        args: [
          { name: 'e', type: 'entity' }, { name: 'tag', type: 'string', doc: 'your name for it' },
          { name: 'param', type: 'string', doc: 'a body parameter, such as `move_speed`' },
          { name: 'op', type: 'string', doc: '`"mul"`, `"add"` or `"set"`' },
          { name: 'value', type: 'fx' }, { name: 'ticks', type: 'number', optional: true, doc: 'how long; for ever when left out' },
        ],
        returns: 'number',
        example: '-- standing in mud: half speed, renewed every tick you stay\nfunction on_touch(e, p)\n  if p:name() == "mud" then\n    mobs.tagged_effect(e, "mud", "move_speed", "mul", fx.frac(1, 2), 2)\n  end\nend',
        see: ['mobs.clear_tagged', 'entity.add_effect'],
      },
      {
        id: 'mobs.clear_tagged', sig: 'mobs.clear_tagged(e [, tag])', where: 'level',
        doc: 'Remove the tagged effects `e` holds: those under `tag` and any tag beneath it (`"reach"` also clears `"reach/mul"`), or every one when `tag` is left out.',
        args: [{ name: 'e', type: 'entity' }, { name: 'tag', type: 'string', optional: true }], returns: 'nothing',
        see: ['mobs.tagged_effect'],
      },
      {
        id: 'mobs.synthetic_owner', sig: 'mobs.synthetic_owner(e, angle) → record', where: 'level',
        doc: 'An attacker record that names entity `e`, for the `by` argument of `mobs.hurt`. With it, the graphs\' `when_hurt` and `when_dies` know who did it, and a monster that retaliates turns on `e`. `angle` is the heading the attack came along (usually `e:facing()`).\n\nYou rarely need it: `mobs.hurt` takes the entity itself and makes this record for you. Make one when the heading should be something other than the way `e` faces.',
        args: [{ name: 'e', type: 'entity' }, { name: 'angle', type: 'number', doc: 'brad' }], returns: 'record',
        see: ['mobs.hurt'],
      },
      {
        id: 'mobs.on_death', sig: 'function mobs.on_death(m, by)', where: 'level',
        doc: 'Yours to set: called when a monster dies, after its death sequence starts and its drops fall. `m` is the monster\'s record: `m.e` its entity, `m.kind` its name, `m.max_hp`, `m.vars` its variables. `by` is the attacker record or `nil`; `by.e` is the attacker\'s entity.\n\nNot set by default. There is one slot, so set it from one script.',
        args: [{ name: 'm', type: 'record' }, { name: 'by', type: 'record | nil' }],
        notes: ['Assign a function to the field; it is not a hook, so it is not collected from every script.'],
        example: 'local kills = 0\nfunction mobs.on_death(m, by)\n  kills = kills + 1\n  if by ~= nil and by.e:valid() and by.e:kind() == 0 then\n    print("player " .. by.e:index() .. " killed a " .. m.kind)\n  end\nend',
        see: ['mobs.hurt', 'mobs.on_player_death'],
      },
      {
        id: 'mobs.on_player_hurt', sig: 'function mobs.on_player_hurt(target, amount, by)', where: 'level',
        doc: 'Yours to set: when it is set, every hit on a player in this level calls it INSTEAD of the default rule, and you own the rules entirely.\n\nThe default rule: take `amount` off `target:hp()`, play the module\'s player pain sound and fire the graphs\' `when_hurt`. At 0 health, play the death sound, put the health back to full (100 unless the module says otherwise), teleport the player to where they came into the level, call `mobs.on_player_death`, and fire `when_dies`.',
        args: [{ name: 'target', type: 'entity', doc: 'the player' }, { name: 'amount', type: 'number' }, { name: 'by', type: 'record | nil' }],
        notes: ['With your own rule set, `mobs.on_player_death` and the graphs\' `when_hurt` / `when_dies` for players fire only if you call them.'],
        example: '-- god mode while a flag is up\nlocal god = false\nfunction mobs.on_player_hurt(target, amount, by)\n  if god then return end\n  local hp = (target:hp() or 100) - amount\n  if hp < 1 then hp = 1 end  -- nobody dies here: they stay on 1\n  target:set_hp(hp)\nend',
        see: ['mobs.on_player_death', 'mobs.player_max_hp', 'entity.set_hp'],
      },
      {
        id: 'mobs.on_player_death', sig: 'function mobs.on_player_death(target, by)', where: 'level',
        doc: 'Yours to set: called by the default player rule when a player dies, after they have been healed and sent back to where they came into the level. For a score, a message, a penalty.',
        args: [{ name: 'target', type: 'entity' }, { name: 'by', type: 'record | nil' }],
        example: 'local deaths = 0\nfunction mobs.on_player_death(target, by)\n  deaths = deaths + 1\n  dnp.hud(nil, { deaths = deaths })\nend',
        see: ['mobs.on_player_hurt'],
      },
      {
        id: 'mobs.on_shot', sig: 'function mobs.on_shot(m, target, reached)', where: 'level',
        doc: 'Yours to set: called for every bullet (every pellet) a monster or a player\'s weapon fires as a ray. `m` is the shooter\'s record (`m.e` its entity), `target` what the ray reached (`nil` for nothing), `reached` how far it went (fx). For statistics and debugging; it changes nothing.',
        args: [{ name: 'm', type: 'record' }, { name: 'target', type: 'entity | prop | nil' }, { name: 'reached', type: 'fx' }],
      },
      {
        id: 'mobs.on_path_refused', sig: 'function mobs.on_path_refused(m)', where: 'level',
        doc: 'Yours to set: called when a monster asked for a route and the engine refused because too many routes were asked for this tick (it gives at most 64). The monster acts as if its target were unreachable for now. For spotting a crowded level.',
        args: [{ name: 'm', type: 'record' }], see: ['dnp.find_path'],
      },
      {
        id: 'mobs.player_max_hp', sig: 'mobs.player_max_hp = number', where: 'level',
        doc: 'The health the default player rule gives back when a player dies. 100 when not set.',
        see: ['mobs.on_player_hurt'],
      },
    ],
  });

  // -------------------------------------------------------------- triggers
  API.groups.push({
    id: 'triggers', order: 210, title: 'triggers',
    intro: 'The trigger runtime. It is present in a level whose map has triggers or a graph, and in the game machine when the module has a game graph. Most of it runs your map\'s triggers for you; these are the parts a script reads and writes.\n\nCounters and properties share one store per level, saved with the level.',
    entries: [
      {
        id: 'triggers.counter', sig: 'triggers.counter(name) → number', where: 'both',
        doc: 'A trigger counter\'s value, as the `counter` actions and conditions see it. `0` when it was never set, or holds something that is not a number.',
        args: [{ name: 'name', type: 'string' }], returns: 'number',
        example: 'if triggers.counter("switches") >= 3 then print("all three") end',
        see: ['triggers.property', 'triggers.set_property'],
      },
      {
        id: 'triggers.property', sig: 'triggers.property(name) → value', where: 'both',
        doc: 'Read anything in the store: a counter, or something a script put there. `nil` when it was never set.',
        args: [{ name: 'name', type: 'string' }], returns: 'any', see: ['triggers.set_property', 'triggers.counter'],
      },
      {
        id: 'triggers.set_property', sig: 'triggers.set_property(name, value)', where: 'both',
        doc: 'Write anything into the store. Setting a counter\'s name to a number changes the counter, so a script can drive the same `counter` conditions the triggers test.',
        args: [{ name: 'name', type: 'string' }, { name: 'value', type: 'any', doc: 'plain data: a number, string, boolean or table of those' }], returns: 'nothing',
        example: '-- one line in a trigger\'s lua action\ntriggers.set_property("switches", triggers.counter("switches") + 1)',
        see: ['triggers.property'],
      },
      {
        id: 'triggers.is_enabled', sig: 'triggers.is_enabled(name) → boolean', where: 'both',
        doc: 'Is the trigger called `name` enabled? `false` when there is no such trigger.',
        args: [{ name: 'name', type: 'string' }], returns: 'boolean', see: ['triggers.is_spent'],
      },
      {
        id: 'triggers.is_spent', sig: 'triggers.is_spent(name) → boolean', where: 'both',
        doc: 'Has a `once` trigger called `name` already fired? `false` when there is no such trigger.',
        args: [{ name: 'name', type: 'string' }], returns: 'boolean', see: ['triggers.is_enabled'],
      },
      {
        id: 'triggers.pending', sig: 'triggers.pending() → number', where: 'both',
        doc: 'How many delayed triggers (`run_after`) are waiting to come due. For a debug panel.',
        args: [], returns: 'number',
      },
      {
        id: 'triggers.load', sig: 'triggers.load(data) → boolean', where: 'both',
        doc: 'Load a map\'s trigger table: `{ name = …, triggers = { … }, panels = { … } }`. Every entry is checked against the trigger vocabulary first, and a table with a problem loads nothing; the Play log lists the problems. A second table in the same level is refused.',
        args: [{ name: 'data', type: 'table' }], returns: 'boolean',
        notes: ['The studio writes this call for the triggers you draw in the map editor. Calling it yourself only works on a map with no triggers of its own.'],
      },
    ],
  });

  // ---------------------------------------------------------------- graphs
  API.groups.push({
    id: 'graphs', order: 220, title: 'graphs',
    intro: 'The graph runtime. It is present in a level whose map has a graph, and in the game machine when the module has a game graph. Several graphs share one runtime per machine. These calls let a script talk to them.',
    entries: [
      {
        id: 'graphs.var', sig: 'graphs.var(graph_name, var) → value', where: 'both',
        doc: 'A loaded graph\'s variable. `graph_name` is the graph\'s name as the studio shows it. `nil` when there is no such graph or variable.',
        args: [{ name: 'graph_name', type: 'string' }, { name: 'var', type: 'string' }], returns: 'any',
        example: 'local gems = graphs.var("gems", "count") or 0\ndnp.hud(nil, { gems = gems })',
        see: ['graphs.call'],
      },
      {
        id: 'graphs.call', sig: 'graphs.call(name, entity, value)', where: 'both',
        doc: 'Start every `on_call` node called `name`, in every graph of this machine, in load order. The run sees `entity` and `value` as the node\'s outputs. Calls that lead back to themselves stop four deep, with a line in the Play log.\n\nTo reach the game\'s graphs from a level, use `dnp.call_game("graph_call", name, value, entity)`; to reach the graphs of the level a player stands in from the game, `dnp.call_level(e, "graph_call", name, value)`.',
        args: [{ name: 'name', type: 'string' }, { name: 'entity', type: 'entity | nil' }, { name: 'value', type: 'any' }], returns: 'nothing',
        notes: ['An error inside the graph run comes back to you as a Lua error.'],
        example: 'function on_prop_use(e, p)\n  if p:name() == "bell" then graphs.call("ring", e, 3) end\nend',
        see: ['dnp.call_game', 'dnp.call_level'],
      },
      {
        id: 'graphs.notify', sig: 'graphs.notify(what, target, by, amount [, kind])', where: 'both',
        doc: 'Fire the graphs\' `when_hurt` (`what = "hurt"`) or `when_dies` (`what = "dies"`) start nodes, as `mobs.hurt` does. For damage you handle yourself, such as your own `mobs.on_player_hurt`. `by` is the attacker\'s entity (or `nil`), `kind` the monster name (`nil` for a player).',
        args: [
          { name: 'what', type: 'string', doc: '`"hurt"` or `"dies"`' }, { name: 'target', type: 'entity' },
          { name: 'by', type: 'entity | nil' }, { name: 'amount', type: 'number' }, { name: 'kind', type: 'string', optional: true },
        ],
        returns: 'nothing',
        example: 'function mobs.on_player_hurt(target, amount, by)\n  target:set_hp(math.max(1, (target:hp() or 100) - amount))\n  graphs.notify("hurt", target, by and by.e or nil, amount)\nend',
        see: ['mobs.on_player_hurt', 'mobs.hurt'],
      },
      {
        id: 'graphs.count', sig: 'graphs.count() → number', where: 'both',
        doc: 'How many graphs are loaded in this machine.', args: [], returns: 'number',
      },
      {
        id: 'graphs.pending', sig: 'graphs.pending() → number', where: 'both',
        doc: 'How many `delay` timers are waiting to come due. For a debug panel.', args: [], returns: 'number',
      },
      {
        id: 'graphs.load', sig: 'graphs.load(data [, label]) → true | false, problems', where: 'both',
        doc: 'Load one graph from its decoded table. Everything is checked first; a graph with any problem loads nothing, and the function returns `false` and the list of problems (also printed to the Play log).',
        args: [{ name: 'data', type: 'table', doc: 'a graph, as the studio saves it' }, { name: 'label', type: 'string', optional: true, doc: 'the name used in messages' }],
        returns: 'boolean, table',
        notes: ['The studio loads your graphs for you. You would only call this with a graph table you build in a script.'],
      },
    ],
  });

  // --------------------------------------------------------------- weapons
  API.groups.push({
    id: 'weapons', order: 230, title: 'weapons',
    intro: 'The weapon runtime: a phase machine per player, inventories and ammunition. In a studio module the weapons run in the GAME machine, so a player\'s arsenal follows them from level to level, and the `weapons` table exists there only.\n\nFrom a level script, reach it with `dnp.call_game("weapon_api", op, e, a, b)`, which calls `weapons.api` for you. The other functions take a player key from `weapons.key_of(e)`.',
    entries: [
      {
        id: 'weapons.api', sig: 'weapons.api(op, e [, a [, b]]) → result', where: 'game',
        doc: 'Everything a script or a graph does to a player\'s weapons, in one call. `e` is the player.\n\n`"state"` returns `{ held = name, have = {names…}, ammo = {pool = n…}, pool = the held weapon\'s pool }`.\n`"give", name [, select]` gives a weapon, and selects it if `select` is true.\n`"take", name` takes it away (and switches to the best weapon left).\n`"select", name` switches to a weapon the player holds.\n`"give_ammo", pool, n` adds ammunition, `"set_ammo", pool, n` sets it; both stay within the pool\'s maximum.\n\nThe changing ops return `true` when they did something and `false` when the name is unknown or nothing changed; `nil` for an unknown op.',
        args: [
          { name: 'op', type: 'string', doc: '`"state"`, `"give"`, `"take"`, `"select"`, `"give_ammo"` or `"set_ammo"`' },
          { name: 'e', type: 'entity' }, { name: 'a', type: 'string', optional: true, doc: 'a weapon or pool name' },
          { name: 'b', type: 'any', optional: true, doc: 'select-now flag, or an amount' },
        ],
        returns: 'table | boolean | nil',
        example: '-- in a level script: a chest gives the shotgun and 20 shells\nfunction on_prop_use(e, p)\n  if p:name() == "chest" and dnp.game_has("weapon_api") then\n    dnp.call_game("weapon_api", "give", e, "shotgun", true)\n    dnp.call_game("weapon_api", "give_ammo", e, "shells", 20)\n  end\nend',
        see: ['dnp.call_game', 'dnp.game_has', 'weapons.key_of'],
      },
      {
        id: 'weapons.key_of', sig: 'weapons.key_of(e) → key', where: 'game',
        doc: 'The key a player\'s weapon state is kept under: the same for a player in every level. Pass it to `weapons.get`, `list`, `select`, `phase_of`, `vars_of` and `rearm_player`.',
        args: [{ name: 'e', type: 'entity' }], returns: 'string | number', see: ['weapons.get'],
      },
      {
        id: 'weapons.get', sig: 'weapons.get(key) → inventory', where: 'game',
        doc: 'A player\'s inventory, made on first use: `{ have = {name = true…}, ammo = {pool = n…}, armour = n, current = held weapon name }`. It is the live table: changes you make to it stick, but `weapons.api` keeps the rules (caps, switching) for you.',
        args: [{ name: 'key', type: 'key', doc: 'from `weapons.key_of(e)`' }], returns: 'table', see: ['weapons.api', 'weapons.list'],
      },
      {
        id: 'weapons.list', sig: 'weapons.list(key) → { {name, def}… }', where: 'game',
        doc: 'Every weapon a player holds, in the module\'s display order. Each item has `name` and `def` (the weapon\'s definition).',
        args: [{ name: 'key', type: 'key' }], returns: 'table',
        example: 'for _, w in ipairs(weapons.list(weapons.key_of(e))) do print(w.name) end',
      },
      {
        id: 'weapons.select', sig: 'weapons.select(key, name) → boolean', where: 'game',
        doc: 'Switch a player to a weapon they hold. `true` when the selection changed.',
        args: [{ name: 'key', type: 'key' }, { name: 'name', type: 'string' }], returns: 'boolean', see: ['weapons.api'],
      },
      {
        id: 'weapons.swing_damage', sig: 'weapons.swing_damage(attacker) → swing | nil', where: 'game',
        doc: 'The swing a player\'s melee hit is costing right now: the current phase\'s `swing` if it has one, else the weapon\'s. The table has `damage`, and `knockback` and `slow` when the weapon declares them. `nil` when the held weapon has no swing.',
        args: [{ name: 'attacker', type: 'entity' }], returns: 'table | nil',
      },
      {
        id: 'weapons.pickup', sig: 'weapons.pickup(entity, prop)', where: 'game',
        doc: 'Run the module\'s pickup rule for `entity` touching `prop`, as walking over it does: health, armour, a weapon, ammunition. Players only; a prop that is not a pickup does nothing.',
        args: [{ name: 'entity', type: 'entity' }, { name: 'prop', type: 'prop' }], returns: 'nothing',
      },
      {
        id: 'weapons.rearm_player', sig: 'weapons.rearm_player(key)', where: 'game',
        doc: 'Put a player\'s weapon back to rest, keeping the inventory: the next tick starts from the resting phase with fresh variables. For a respawn, so a player who died mid-charge does not come back still charging.',
        args: [{ name: 'key', type: 'key' }], returns: 'nothing',
      },
      {
        id: 'weapons.phase_of', sig: 'weapons.phase_of(key) → string | nil', where: 'game',
        doc: 'The phase a player\'s weapon is in now, by name. For a debug panel.',
        args: [{ name: 'key', type: 'key' }], returns: 'string | nil', see: ['weapons.vars_of'],
      },
      {
        id: 'weapons.vars_of', sig: 'weapons.vars_of(key) → table | nil', where: 'game',
        doc: 'A player\'s weapon variables (the `vars` a weapon declares), live. For a debug panel.',
        args: [{ name: 'key', type: 'key' }], returns: 'table | nil', see: ['weapons.phase_of'],
      },
    ],
  });

  // ------------------------------------------------------------ Lua itself
  API.groups.push({
    id: 'lua', order: 240, title: 'Lua itself',
    intro: 'The engine runs LuaJIT, which speaks Lua 5.1, with the JIT compiler switched off (it would hide runaway loops from the instruction budget). These are the standard libraries as a script finds them. A server runs scripts in one of two trust profiles: the default, which is what the studio\'s ▶ Play uses, or strict, which a host can choose.',
    entries: [
      {
        id: 'lua.basics', sig: 'assert error ipairs pairs next select type tonumber tostring unpack pcall xpcall rawget rawset rawequal setmetatable getmetatable setfenv getfenv', where: 'both',
        doc: 'The Lua 5.1 base functions, all there under both trust profiles. `unpack` is a global (there is no `table.unpack`).\n\n`pairs` visits keys in no fixed order: never let that order decide anything the game can see. Walk arrays with `ipairs`, or sort the keys first.',
        notes: ['`getmetatable("")` answers `"locked"`: the string metatable is shared by every script, so it cannot be changed.'],
        example: 'local keys = {}\nfor k in pairs(scores) do keys[#keys + 1] = k end\ntable.sort(keys)\nfor _, k in ipairs(keys) do print(k, scores[k]) end',
        see: ['lua.pcall', 'lua.table'],
      },
      {
        id: 'lua.print', sig: 'print(…)', where: 'both',
        doc: 'Writes one line to the server\'s log, which the studio shows on the Play log page (`play-server.log`). The line starts with `[lua:` and the script\'s file name, then the values separated by tabs. An fx prints as its decimal value; an entity or prop prints as its type, not an address.',
        example: 'print("tick", dnp.tick(), "players", dnp.player_count())\n-- [lua:…/module.lua] tick\t600\tplayers\t1',
      },
      {
        id: 'lua.pcall', sig: 'pcall(f, …) → ok, … | false, message', where: 'both',
        doc: 'Run `f` and catch its error. Useful around anything that may fail without it being your bug. It cannot catch the instruction budget: once a callback is over its budget it is stopped, `pcall` or not.',
        example: 'local ok, err = pcall(function() risky(e) end)\nif not ok then print("risky failed: " .. tostring(err)) end',
        see: ['lua.basics'],
      },
      {
        id: 'lua.string', sig: 'string.*', where: 'both',
        doc: 'The whole Lua 5.1 string library: `format`, `sub`, `find`, `match`, `gmatch`, `gsub`, `rep`, `byte`, `char`, `upper`, `lower`, `len`, `reverse`. Methods work on string values: `("x"):rep(3)`. Patterns are Lua patterns, not regular expressions. Strings are bytes: there is no `utf8` library and `#s` counts bytes.',
        notes: ['A huge `string.rep` is one instruction but counts against the 256 MB memory cap.'],
        example: 'local msg = string.format("%s has %d gems", "player " .. e:index(), 12)',
      },
      {
        id: 'lua.table', sig: 'table.*', where: 'both',
        doc: 'Lua 5.1\'s table library: `insert`, `remove`, `concat`, `sort`, `maxn`. No `table.pack` or `table.unpack` (use the global `unpack`). `table.sort` is not stable: give it a comparison that never calls two different items equal when order matters.',
        example: 'table.sort(list, function(a, b)\n  if a.score ~= b.score then return a.score > b.score end\n  return a.name < b.name\nend)',
      },
      {
        id: 'lua.math', sig: 'math.*', where: 'both',
        doc: 'The Lua 5.1 math library is all there, but its numbers are floating point: `math.sin`, `math.sqrt` and friends may give different last digits on different machines. Use them for messages and panels; for anything that moves the world, use `fx` and the engine\'s helpers (`dnp.length`, `dnp.atan2`, `dnp.dir`).\n\nNever use `math.random`: it is not seeded per level and not saved. `dnp.random(lo, hi)` is the deterministic one.',
        example: 'local pct = math.floor(hp * 100 / max_hp)   -- fine: whole numbers are exact',
        see: ['dnp.random', 'fx.int'],
      },
      {
        id: 'lua.bit', sig: 'bit.band bit.bor bit.bxor bit.bnot bit.lshift bit.rshift …', where: 'both',
        doc: 'LuaJIT\'s bit library, present under both trust profiles. Lua 5.1 has no `&` or `|` operators; use these instead, for example to test a button in `e:buttons()`.',
        example: 'if bit.band(e:buttons(), dnp.button.USE) ~= 0 then print("use is down") end',
        see: ['entity.buttons', 'dnp.button.USE'],
      },
      {
        id: 'lua.os', sig: 'os.* · io.*', where: 'both',
        doc: 'Present under the default trust profile, removed under strict. They reach the server\'s machine: `os.time` and `os.clock` read real time, `io.open` opens real files. None of that is the same on another machine or when a save is loaded, so keep it out of anything the game decides. For time, count ticks with `dnp.tick()`; to keep data, use `dnp.persist` or `dnp.store_save`.',
        see: ['dnp.tick', 'dnp.persist', 'dnp.store_save'],
      },
      {
        id: 'lua.coroutine', sig: 'coroutine.*', where: 'both',
        doc: 'Present under the default trust profile, removed under strict. Don\'t use it: code inside a coroutine runs outside the instruction budget, so an endless loop there cannot be stopped and freezes the level. There is no `wait`; schedule with a tick deadline instead (`next_at = dnp.tick() + 120`, then compare in `on_tick`).',
        see: ['dnp.tick', 'hook.on_tick'],
      },
      {
        id: 'lua.load', sig: 'load loadstring dofile loadfile require module package', where: 'both',
        doc: 'Present under the default trust profile, removed under strict. Precompiled bytecode is refused under both: source only. A trigger\'s or graph\'s `lua` action needs `loadstring` to compile its line, so a strict server refuses those actions.',
      },
      {
        id: 'lua.debug', sig: 'debug.*', where: 'both',
        doc: 'Present under the default trust profile without `debug.sethook` (it would switch the instruction budget off); removed entirely under strict. `debug.traceback()` is handy inside an error handler.',
        example: 'local ok, err = xpcall(function() step(e) end, debug.traceback)\nif not ok then print(err) end',
      },
      {
        id: 'lua.collectgarbage', sig: 'collectgarbage', where: 'both',
        doc: 'Always removed. The server runs the garbage collector on its own schedule; a script forcing a collection would make the game hitch on that tick.',
      },
      {
        id: 'lua.ffi', sig: 'ffi · jit', where: 'both',
        doc: 'LuaJIT\'s `ffi` (calling native code) is present under the default trust profile and removed under strict; never rely on it in a module. `jit` exists but the compiler is switched off, so `jit.on()` changes nothing you want.',
      },
    ],
  });

  API.extra.push(
    'mobs.hurt', 'mobs.on_death', 'mobs.on_player_hurt', 'mobs.on_player_death', 'mobs.on_shot', 'mobs.on_path_refused', 'mobs.player_max_hp',
    'weapons.key_of',
    'lua.basics', 'lua.print', 'lua.pcall', 'lua.string', 'lua.table', 'lua.math', 'lua.bit', 'lua.os', 'lua.coroutine', 'lua.load', 'lua.debug', 'lua.collectgarbage', 'lua.ffi',
  );

  // Plumbing the studio's generated files and the runtimes call: not for authors.
  API.internal.push(
    'mobs.load', 'mobs.reset', 'mobs.check_drops', 'mobs.run_action', 'mobs.weapon_runtime', 'mobs.telegraph',
    'mobs.mob_masses', 'mobs.missile_defs',
    'triggers.verbs.action', 'triggers.verbs.check', 'triggers.verbs.condition',
    'graphs.check_vocabulary', 'graphs.reset', 'graphs.touched', 'graphs.weapon_event',
    'weapons.load', 'weapons.load_errors', 'weapons.check_weapon', 'weapons.check_vocabulary', 'weapons.core_stale',
    'weapons.tick_player', 'weapons.forget', 'weapons.panel_for', 'weapons.ui_event', 'weapons.choose',
  );
})();
