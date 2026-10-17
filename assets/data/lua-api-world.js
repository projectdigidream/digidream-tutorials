// The Lua reference, part one: hooks, the dnp table, the handle types (entity,
// prop, sector), fx and vec3. Checked against the engine by
// tools/check-lua-ref.mjs. The runtime libraries (mobs, triggers, graphs,
// weapons) are in lua-api-libs.js, same schema.
window.DNP_LUA_API = window.DNP_LUA_API || { groups: [], internal: [], extra: [] };
var DNP_LUA_API = window.DNP_LUA_API; // the same object; also lets the checker's sandbox see it

// ---------------------------------------------------------------- hooks
DNP_LUA_API.groups.push({
  id: 'hooks', order: 10, title: 'Hooks',
  intro: "A hook is a global function with a fixed name. Define it at the top level of your script and the game calls it when that thing happens. Several scripts may each define the same hook: every one of them runs, in the order the scripts load.",
  entries: [
    {
      id: 'hook.on_tick', sig: 'function on_tick() … end',
      doc: "Called every tick (60 times a second), before the world moves. This is where per-tick logic and timers go.\n\nThere is no timer API: remember a deadline as a tick number and compare it with `dnp.tick()`.",
      args: [], where: 'both',
      notes: [
        "In a level, once per tick for that level. In the game VM, once per tick for each running level, with `dnp.*` looking at that level's world.",
        "Writes such as `e:teleport()` or `e:set_velocity()` are queued and land when the world steps, right after your on_tick returns."
      ],
      example: `local next_at = 0
function on_tick()
  if dnp.tick() < next_at then return end
  next_at = dnp.tick() + 60          -- again in one second
  print("players here: " .. dnp.player_count())
end`,
      see: ['dnp.tick', 'hook.on_post_tick']
    },
    {
      id: 'hook.on_post_tick', sig: 'function on_post_tick() … end',
      doc: "Called every tick after the world has moved and every event of the tick (on_interact, on_touch, on_attack…) has been delivered. Positions you read here are where things ended up this tick.",
      args: [], where: 'level',
      notes: ["Levels only: the game VM is never sent on_post_tick."],
      example: `local start = dnp.spawn_point("start")
function on_post_tick()
  for _, e in ipairs(dnp.players()) do
    if start and e:pos().z < fx.int(-50) then e:teleport(start) end
  end
end`,
      see: ['hook.on_tick']
    },
    {
      id: 'hook.on_interact', sig: 'function on_interact(e, side, sector) … end',
      doc: "Someone pressed use while facing a wall (a side) within reach. Fires once per press, not while the button is held. What counts is what was in front of them when the button went down.",
      args: [
        { name: 'e', type: 'entity', doc: 'Who pressed use.' },
        { name: 'side', type: 'integer', doc: "The side's number in this level. `dnp.side(side)` tells you about it." },
        { name: 'sector', type: 'sector', doc: 'The room they were standing in.' }
      ],
      where: 'level',
      example: `local SWITCH = 42            -- the side number of your switch
function on_interact(e, side, sector)
  if side == SWITCH then
    dnp.set_side_texture(SWITCH, "middle", "SW2COMP")
    dnp.sound("world.switch", sector:center())
  end
end`,
      see: ['dnp.side', 'hook.on_cross', 'dnp.set_side_texture']
    },
    {
      id: 'hook.on_cross', sig: 'function on_cross(e, side, sector) … end',
      doc: "Someone's movement crossed a side flagged as a trigger in the map. The side reported is the side of the room they LEFT, so the two directions across one line arrive as two different side numbers.",
      args: [
        { name: 'e', type: 'entity', doc: 'Who crossed.' },
        { name: 'side', type: 'integer', doc: 'The side number, on the room they left.' },
        { name: 'sector', type: 'sector', doc: 'The room they left.' }
      ],
      where: 'level',
      notes: ["Only sides flagged as triggers report a crossing. A trip-wire that must fire both ways needs both side numbers."],
      example: `function on_cross(e, side, sector)
  if side == 17 and e:kind() == 0 then
    dnp.music(e, "boss")
  end
end`,
      see: ['hook.on_interact']
    },
    {
      id: 'hook.on_touch', sig: 'function on_touch(e, p) … end',
      doc: "A body is standing inside a prop. Reported EVERY tick the overlap lasts, so a pickup that should happen once has to take the prop away (`p:despawn()`) or remember that it already fired.",
      args: [
        { name: 'e', type: 'entity', doc: 'The body overlapping the prop.' },
        { name: 'p', type: 'prop', doc: 'The prop.' }
      ],
      where: 'both',
      notes: ["The game VM hears touches by players only; a level hears every body touching one of its props."],
      example: `function on_touch(e, p)
  if p:name() == "medkit" and e:kind() == 0 then
    e:set_hp(e:hp() + 25)
    p:despawn()
  end
end`,
      see: ['hook.on_prop_use', 'prop.despawn']
    },
    {
      id: 'hook.on_prop_use', sig: 'function on_prop_use(e, p) … end',
      doc: "Someone pressed use on a prop that your module marks as usable.",
      args: [
        { name: 'e', type: 'entity', doc: 'Who pressed use.' },
        { name: 'p', type: 'prop', doc: 'The prop they used.' }
      ],
      where: 'both',
      notes: ["The game VM hears players only."],
      example: `function on_prop_use(e, p)
  if p:name() == "lever" then p:set_animation(1) end
end`,
      see: ['hook.on_touch']
    },
    {
      id: 'hook.on_attack', sig: 'function on_attack(attacker, target) … end',
      doc: "A melee swing connected. Called once per thing it reached. The target is an entity or a prop; ask it, both answer `valid()`, `pos()` and `name()`.\n\nA swing that misses calls nothing, so this hook alone cannot make a ranged weapon. For shots, watch `e:buttons()` and use `dnp.hitscan`.",
      args: [
        { name: 'attacker', type: 'entity', doc: 'Who swung.' },
        { name: 'target', type: 'entity|prop', doc: 'What the swing reached.' }
      ],
      where: 'level',
      example: `function on_attack(attacker, target)
  if mobs ~= nil and mobs.hurt ~= nil and target ~= nil then
    mobs.hurt(target, 10, attacker)
  end
end`,
      see: ['entity.buttons', 'dnp.hitscan']
    },
    {
      id: 'hook.on_crush', sig: 'function on_crush(e, sector, how) … end',
      doc: "A moving room (a door, a lift, a crusher) closed on a body. Called on the first tick only; if you want damage every tick while it lasts, do that from on_tick.",
      args: [
        { name: 'e', type: 'entity', doc: 'Who is being crushed.' },
        { name: 'sector', type: 'sector', doc: 'The room that moved.' },
        { name: 'how', type: 'string', doc: "`'vertical'` (floor and ceiling met) or `'pinned'` (pushed against a wall)." }
      ],
      where: 'level',
      example: `function on_crush(e, sector, how)
  if mobs and mobs.hurt then mobs.hurt(e, 1000) end   -- deadly crusher
end`,
      see: ['sector.move_parametric']
    },
    {
      id: 'hook.on_ui_event', sig: 'function on_ui_event(e, ui_id, widget_id, value) … end',
      doc: "A player worked a widget on a panel your script opened. A button sends 1, a slider its new value, a select the chosen option's index, a toggle 0 or 1.\n\nThe event goes to the VM that opened the panel: a level's panel to that level, a game panel to the game VM.",
      args: [
        { name: 'e', type: 'entity', doc: 'The player.' },
        { name: 'ui_id', type: 'integer', doc: 'What `dnp.ui_open` returned.' },
        { name: 'widget_id', type: 'integer', doc: "The `id` you gave the widget." },
        { name: 'value', type: 'integer', doc: "Already clamped to the widget's own range; an index outside a select's options never arrives." }
      ],
      where: 'both',
      example: `function on_ui_event(e, ui_id, widget_id, value)
  if widget_id == 1 then dnp.ui_close(e, ui_id) end
end`,
      see: ['dnp.ui_open']
    },
    {
      id: 'hook.on_player_enter', sig: 'function on_player_enter(e) … end',
      doc: "A player's body arrived in a level: joining the game, or walking or travelling into another map.",
      args: [{ name: 'e', type: 'entity', doc: 'The player who arrived.' }],
      where: 'game',
      notes: ["Game VM only. A level's own scripts are never sent this: poll `dnp.players()` in on_tick and keep a list of who you have seen."],
      example: `-- in a level: notice new arrivals yourself
local seen = {}
function on_tick()
  for _, e in ipairs(dnp.players()) do
    local id = e:player()
    if id and not seen[id] then
      seen[id] = true
      dnp.hud(e, { subtitle = "Welcome!" })
    end
  end
end`,
      see: ['hook.on_player_leave', 'dnp.players', 'entity.player']
    },
    {
      id: 'hook.on_player_leave', sig: 'function on_player_leave(player_id) … end',
      doc: "A player left the game for good (disconnected). You get their player number, not a body: the body is already gone.",
      args: [{ name: 'player_id', type: 'integer', doc: "The same number `e:player()` gave for them." }],
      where: 'game',
      notes: ["Game VM only; levels are never sent this."],
      example: `local score = {}
function on_player_leave(id)
  score[id] = nil
end`,
      see: ['hook.on_player_enter', 'entity.player']
    }
  ]
});

// ---------------------------------------------------------------- world queries
DNP_LUA_API.groups.push({
  id: 'dnp-world', order: 20, title: 'The world: queries',
  intro: "Reading the level: the clock, who is here, the props, the rooms and the walls. Reads are immediate: you see the world as it is right now.",
  entries: [
    {
      id: 'dnp.tick', sig: 'dnp.tick() → integer',
      doc: "The current tick number. The game runs 60 ticks a second, so `dnp.tick() + 120` is two seconds from now.",
      args: [], returns: 'integer', where: 'both',
      example: `local open_until = dnp.tick() + 3 * 60   -- three seconds`,
      see: ['hook.on_tick']
    },
    {
      id: 'dnp.level', sig: 'dnp.level() → integer',
      doc: "Which level this script is running in, counting from 0: its position in `dnp.levels()` minus one. A map's own Lua rarely needs it; a module script, which runs in every level, uses it to tell levels apart.",
      args: [], returns: 'integer (0 = the first level)', where: 'both',
      notes: ["In the game VM it is the level the current callback is about."],
      example: `local names = dnp.levels()
print("I am in " .. names[dnp.level() + 1])`,
      see: ['dnp.levels', 'entity.change_map']
    },
    {
      id: 'dnp.levels', sig: 'dnp.levels() → { string, … }',
      doc: "The names of every level the game loaded, in order. The position in this list, minus one, is what `e:change_map(index)` takes.",
      args: [], returns: 'a list of level names', where: 'both',
      example: `for i, name in ipairs(dnp.levels()) do print(i - 1, name) end`,
      see: ['dnp.level', 'entity.change_map']
    },
    {
      id: 'dnp.entity', sig: 'dnp.entity(index) → entity | nil',
      doc: "The body (a player or a monster) in slot `index`, or nil if that slot is empty. The index is what `e:index()` returns.",
      args: [{ name: 'index', type: 'integer', doc: 'A body index.' }],
      returns: 'entity, or nil', where: 'both',
      notes: ["An index is a slot that gets reused. To remember a body across ticks, keep the handle itself and check `e:valid()`."],
      example: `local e = dnp.entity(0)
if e then print(e:pos()) end`,
      see: ['entity.index', 'dnp.entities']
    },
    {
      id: 'dnp.entities', sig: 'dnp.entities() → { entity, … }',
      doc: "Every live body this level looks after, plus every player, in ascending index order.",
      args: [], returns: 'a list of entities', where: 'both',
      notes: ["It builds a handle for every monster on the map. If you only want players, `dnp.players()` is much cheaper; if you only want to know whether anyone is here, use `dnp.player_count()`."],
      example: `for _, e in ipairs(dnp.entities()) do
  if e:kind() ~= 0 then print(e:name(), e:hp()) end
end`,
      see: ['dnp.players']
    },
    {
      id: 'dnp.players', sig: 'dnp.players() → { entity, … }',
      doc: "Every player's body in this world, in ascending index order. A player is a body with kind 0.",
      args: [], returns: 'a list of entities', where: 'both',
      example: `for _, e in ipairs(dnp.players()) do
  if e:grounded() then e:add_impulse(vec3.new(0, 0, 4)) end
end`,
      see: ['dnp.player_count', 'dnp.entities']
    },
    {
      id: 'dnp.player_count', sig: 'dnp.player_count() → integer',
      doc: "How many players are in this world. Costs nothing, so it is the way to skip work in an empty level.",
      args: [], returns: 'integer', where: 'both',
      example: `function on_tick()
  if dnp.player_count() == 0 then return end
  -- ...
end`,
      see: ['dnp.players']
    },
    {
      id: 'dnp.prop', sig: 'dnp.prop(index) → prop | nil',
      doc: "The prop with this index, or nil when it is not there. The index is what `p:index()` returns.",
      args: [{ name: 'index', type: 'integer', doc: 'A prop index.' }],
      returns: 'prop, or nil', where: 'both',
      example: `local door_key = dnp.prop(saved_index)`,
      see: ['prop.index', 'dnp.props']
    },
    {
      id: 'dnp.props', sig: 'dnp.props() → { prop, … }',
      doc: "Every live prop this level owns, in ascending index order.",
      args: [], returns: 'a list of props', where: 'both',
      example: `local barrels = 0
for _, p in ipairs(dnp.props()) do
  if p:name() == "barrel" then barrels = barrels + 1 end
end`,
      see: ['dnp.prop']
    },
    {
      id: 'dnp.prop_kind', sig: 'dnp.prop_kind(name) → integer | nil',
      doc: "The catalogue number of the prop or monster called `name`, or nil if your module has no such thing. Use it to catch a misspelt name early, before anything tries to spawn it.",
      args: [{ name: 'name', type: 'string', doc: 'A prop or monster name from your module.' }],
      returns: 'integer, or nil', where: 'both',
      example: `assert(dnp.prop_kind("medkit"), "no prop called medkit")`,
      see: ['dnp.spawn_prop', 'prop.kind']
    },
    {
      id: 'dnp.sector', sig: 'dnp.sector(index) → sector | nil',
      doc: "The room with this number in this level, or nil if there is none.",
      args: [{ name: 'index', type: 'integer', doc: "A sector number, as the map editor shows it and `s:index()` returns." }],
      returns: 'sector, or nil', where: 'level',
      example: `local lift = dnp.sector(12)
lift:move_parametric(vec3.new(0, 0, 0), vec3.new(0, 0, 4), 120, "pingpong", "floor")`,
      see: ['dnp.sectors', 'sector.index']
    },
    {
      id: 'dnp.sectors', sig: 'dnp.sectors() → { sector, … }',
      doc: "Every room in this level. Entry `i` is sector number `i - 1`.",
      args: [], returns: 'a list of sectors', where: 'level',
      notes: ["On a big map this builds hundreds of handles. Do it once at load and keep the result; don't call it every tick. For one sector use `dnp.sector(i)`."],
      example: `local by_tag = {}
for _, s in ipairs(dnp.sectors()) do
  local t = s:tag()
  if t ~= 0 then by_tag[t] = s end
end`,
      see: ['dnp.sector', 'sector.tag']
    },
    {
      id: 'dnp.side', sig: 'dnp.side(index) → { neighbor, climbable, grapple, blocking, ledge } | nil',
      doc: "What the map says about one side (one wall line of one room). `neighbor` is the sector on the other side, or nil for a solid wall. The four flags are true or false.",
      args: [{ name: 'index', type: 'integer', doc: "A side number, as on_interact and on_cross give it." }],
      returns: 'a plain table, or nil', where: 'level',
      example: `function on_interact(e, side, sector)
  local info = dnp.side(side)
  if info and info.neighbor then
    info.neighbor:move_parametric(vec3.new(0, 0, 0), vec3.new(0, 0, 3), 60, "once", "ceiling")
  end
end`,
      see: ['hook.on_interact', 'dnp.side_texture']
    },
    {
      id: 'dnp.spawn_point', sig: 'dnp.spawn_point(tag) → vec3 | nil',
      doc: "Where this level's spawn point with that tag is, or nil when there isn't one. Pass it to `e:teleport()` to send someone there without changing map.",
      args: [{ name: 'tag', type: 'string', doc: "The spawn point's tag, as set in the map editor." }],
      returns: 'vec3, or nil', where: 'level',
      example: `local at = dnp.spawn_point("arena")
if at then e:teleport(at) end`,
      see: ['entity.teleport', 'entity.change_map']
    },
    {
      id: 'dnp.random', sig: 'dnp.random(lo, hi) → integer',
      doc: "A whole number from `lo` to `hi`, both included. Use this, not `math.random`: it is seeded from the map, so a level plays out the same way every time it is replayed.",
      args: [
        { name: 'lo', type: 'integer', doc: 'Smallest result.' },
        { name: 'hi', type: 'integer', doc: 'Largest result.' }
      ],
      returns: 'integer', where: 'both',
      notes: ["`hi` smaller than `lo` is an error ('empty range')."],
      example: `if dnp.random(1, 100) <= 25 then          -- one time in four
  dnp.sound("monster.imp.sight", e)
end`
    }
  ]
});

// ---------------------------------------------------------------- spawning
DNP_LUA_API.groups.push({
  id: 'dnp-spawn', order: 30, title: 'Spawning',
  intro: "Putting new props and bodies into the level. For monsters with behaviour, use `mobs.spawn`, which also starts their brain; the calls here only create the thing.",
  entries: [
    {
      id: 'dnp.spawn_prop', sig: 'dnp.spawn_prop(name, pos) → prop | nil',
      doc: "Places a prop from your module at `pos`. Its size and whether it blocks come from the prop's own settings.",
      args: [
        { name: 'name', type: 'string', doc: 'The prop\'s name in your module.' },
        { name: 'pos', type: 'vec3', doc: "Where, in this level's coordinates (the bottom centre of the prop)." }
      ],
      returns: 'the new prop, or nil when the level is full', where: 'level',
      notes: [
        "A name your module does not have is an error, naming the prop.",
        "While a saved game is being restored, spawns made as the level loads are held back and return nil; the save puts back what was there (see `dnp.restoring`). A prop placed while the level loads is remembered by the save automatically; one spawned later needs `dnp.persist` if it should survive a save."
      ],
      example: `local key = dnp.spawn_prop("key_red", vec3.new(12, 4, 0))`,
      see: ['dnp.prop_kind', 'prop.despawn', 'dnp.restoring']
    },
    {
      id: 'dnp.spawn_enemy', sig: 'dnp.spawn_enemy(name, pos) → entity | nil',
      doc: "Creates a body from your module's catalogue, moved by the same physics as a player but with no brain: it stands still until you drive it with `e:set_input`. Its width, height and walking speed come from the catalogue.\n\nFor a monster that thinks for itself, use `mobs.spawn` instead.",
      args: [
        { name: 'name', type: 'string', doc: 'A name from your module\'s catalogue.' },
        { name: 'pos', type: 'vec3', doc: "Where, in this level's coordinates." }
      ],
      returns: 'the new entity, or nil when the level is full or a save is being restored', where: 'level',
      notes: ["Held back (returns nil) while a saved game is restored."],
      example: `local dummy = dnp.spawn_enemy("target_dummy", vec3.new(0, 10, 0))
dummy:set_input(0, 1, 0)   -- walk forward`,
      see: ['entity.set_input', 'dnp.spawn_prop']
    }
  ]
});

// ---------------------------------------------------------------- geometry and physics
DNP_LUA_API.groups.push({
  id: 'dnp-geometry', order: 40, title: 'Geometry and physics',
  intro: "Asking the map questions: what a shot hits, who can see whom, what is in the way, how to walk somewhere. These use the same collision the bodies do, so the answers agree with what actually happens in the game.",
  entries: [
    {
      id: 'dnp.hitscan', sig: 'dnp.hitscan(shooter, range [, spread [, slope]]) → hit | nil, impact',
      doc: "Fires an instant ray from the shooter along the way it faces. It stops at the first body, prop or wall. You get what it hit (or nil for a wall or nothing) and the point where it stopped, so you can draw a tracer to exactly there.\n\nIt does no damage on its own: you decide what a hit means.",
      args: [
        { name: 'shooter', type: 'entity', doc: 'Who fires. The ray starts from them and follows their facing.' },
        { name: 'range', type: 'fx', doc: 'How far it reaches, in world units.' },
        { name: 'spread', type: 'integer (brad)', optional: true, doc: "An angle added to the facing, in brads (4294967296 is a full turn; negative turns the other way). Lets one trigger pull put pellets in different places. Default 0." },
        { name: 'slope', type: 'fx', optional: true, doc: 'How much the ray rises per unit of horizontal distance; negative aims down. Default 0, a level shot.' }
      ],
      returns: 'the entity or prop hit (or nil), and the impact point as a vec3', where: 'level',
      notes: [
        "A stale shooter returns a single nil and no impact point.",
        "Players are judged where the shooter saw them on their screen, so a shot that looked like a hit is one."
      ],
      example: `local hit, at = dnp.hitscan(e, 64)
dnp.vfx(12, at)                       -- sparks where it stopped
if hit and mobs and mobs.hurt then mobs.hurt(hit, 15, e) end`,
      see: ['dnp.vfx', 'entity.buttons', 'dnp.sweep_hit']
    },
    {
      id: 'dnp.can_see', sig: 'dnp.can_see(a, b) → boolean',
      doc: "Is there a clear line from `a`'s eyes to any part of `b`, from its feet to the top of its head? Walls, closed doors and steps block the view.",
      args: [
        { name: 'a', type: 'entity|prop', doc: 'Who is looking (from half its height).' },
        { name: 'b', type: 'entity|prop', doc: 'What it looks for.' }
      ],
      returns: 'boolean (false when either handle is stale)', where: 'level',
      example: `for _, p in ipairs(dnp.players()) do
  if dnp.can_see(guard, p) then dnp.sound("monster.guard.sight", guard) end
end`,
      see: ['dnp.hitscan']
    },
    {
      id: 'dnp.length', sig: 'dnp.length(v) → fx',
      doc: "The length of a vector, measured FLAT: only x and y count, height is ignored. The usual way to ask how far apart two things are on the ground.",
      args: [{ name: 'v', type: 'vec3', doc: 'A vector, usually one position minus another.' }],
      returns: 'fx', where: 'both',
      notes: ["z is ignored. For a true 3-D distance, compute it from `.x`, `.y`, `.z` yourself."],
      example: `if dnp.length(p:pos() - e:pos()) < fx.int(3) then
  print("close enough")
end`,
      see: ['vec3.fields']
    },
    {
      id: 'dnp.sweep', sig: 'dnp.sweep(from, dir, distance) → blocked, impact',
      doc: "Does a straight line of `distance` from `from` reach, or does the map stop it? The line is horizontal, at `from`'s height, so a step it would hit stops it. Only walls and steps count; bodies and props do not.\n\nWhen blocked, `impact` is a tenth of a unit short of the wall, so whatever you draw there shows in front of it.",
      args: [
        { name: 'from', type: 'vec3', doc: 'Start point.' },
        { name: 'dir', type: 'vec3', doc: 'Direction; only its x and y are used, and it need not be unit length.' },
        { name: 'distance', type: 'fx', doc: 'How far.' }
      ],
      returns: 'true and the impact point when blocked; false and `from` when not', where: 'level',
      notes: ["When nothing blocks, the second value is the START point, not the end."],
      example: `local blocked, at = dnp.sweep(e:pos(), dnp.dir(e:facing()), fx.int(10))
if blocked then dnp.vfx(12, at) end`,
      see: ['dnp.sweep_hit']
    },
    {
      id: 'dnp.sweep_hit', sig: 'dnp.sweep_hit(from, dir, distance, radius [, ignore_a [, ignore_b [, slope]]]) → nil | false, impact | entity, impact',
      doc: "Moves a ball of `radius` along a line and reports the first thing that stops it: nil when nothing does, false and the impact point when the map does, or the body and the impact point when a body does. This is how a projectile asks where it lands.",
      args: [
        { name: 'from', type: 'vec3', doc: 'Start point.' },
        { name: 'dir', type: 'vec3', doc: 'Direction; only x and y are used.' },
        { name: 'distance', type: 'fx', doc: 'How far.' },
        { name: 'radius', type: 'fx', doc: 'How fat the moving thing is.' },
        { name: 'ignore_a', type: 'entity|prop', optional: true, doc: 'Something to pass through, usually the projectile itself.' },
        { name: 'ignore_b', type: 'entity|prop', optional: true, doc: 'A second one, usually whoever fired it.' },
        { name: 'slope', type: 'fx', optional: true, doc: 'Rise per unit of horizontal travel. Given, floors, ceilings and steps stop it too, and the impact is at the height it met them. Without it the sweep is flat.' }
      ],
      returns: 'nil; or false, impact; or entity, impact', where: 'level',
      notes: ["Only bodies are reported as hits, not props. Tell the three answers apart with `if r == nil`, `elseif r == false`, `else`."],
      example: `local r, at = dnp.sweep_hit(ball:pos(), dir, fx.int(1), fx.parse("0.3"), ball, shooter)
if r == nil then
  ball:set_pos(ball:pos() + dir)          -- keep flying
elseif r == false then
  dnp.vfx(11, at); ball:despawn()          -- hit a wall
else
  mobs.hurt(r, 20, shooter); ball:despawn()
end`,
      see: ['dnp.sweep', 'prop.set_pos']
    },
    {
      id: 'dnp.find_path', sig: 'dnp.find_path(from_sector, to_sector [, radius [, height [, jump_height]]]) → { {sector, x, y, jump}, … } | nil, reason',
      doc: "A walking route from one room to another, for a body of the given size. Each waypoint is a room to pass through, a point to steer at (`x`, `y` as fx) and `jump`, true where the step up needs a jump. The route includes both ends.\n\nIt reflects doors and lifts as they are right now: ask again after one moves.",
      args: [
        { name: 'from_sector', type: 'integer', doc: 'Starting room number, e.g. `e:sector()`.' },
        { name: 'to_sector', type: 'integer', doc: 'Destination room number.' },
        { name: 'radius', type: 'fx', optional: true, doc: "The body's radius. Default: the map's body size." },
        { name: 'height', type: 'fx', optional: true, doc: "The body's height. Default: the map's." },
        { name: 'jump_height', type: 'fx', optional: true, doc: 'How much higher than an ordinary step the body can hop. Default 0: walking only.' }
      ],
      returns: "a list of waypoints, or nil and a reason ('no such sector', 'path budget', or why no route exists)", where: 'level',
      notes: [
        "There is a per-tick budget of path searches shared with the monsters. When it is spent you get nil, 'path budget': try again next tick.",
        "If you pass `jump_height`, obey `jump = true`, or the body will press against the ledge forever."
      ],
      example: `local route, why = dnp.find_path(e:sector(), 40)
if not route then print("no route: " .. why) return end
for i, w in ipairs(route) do print(i, w.sector, w.x, w.y, w.jump) end`,
      see: ['entity.sector', 'entity.set_input']
    },
    {
      id: 'dnp.atan2', sig: 'dnp.atan2(y, x) → integer (brad)',
      doc: "The angle of the direction (x, y), in brads: 0 is +x, 1073741824 (a quarter of 4294967296) is +y. Exactly the angle the game would compute, so a body you turn with it faces the same way on every machine.",
      args: [
        { name: 'y', type: 'fx', doc: 'The y part.' },
        { name: 'x', type: 'fx', doc: 'The x part.' }
      ],
      returns: 'integer: brads, 0 to 4294967295', where: 'both',
      example: `local d = target:pos() - e:pos()
local aim = dnp.atan2(d.y, d.x)
e:set_input(0, 1, aim)        -- a scripted body walks toward the target`,
      see: ['dnp.dir', 'entity.facing']
    },
    {
      id: 'dnp.dir', sig: 'dnp.dir(angle) → vec3',
      doc: "A flat unit vector pointing at `angle` (in brads), with z = 0. The opposite of `dnp.atan2`.",
      args: [{ name: 'angle', type: 'integer (brad)', doc: '4294967296 is a full turn.' }],
      returns: 'vec3', where: 'both',
      example: `local ahead = dnp.dir(e:facing())
local spot = e:pos() + vec3.new(ahead.x * 3, ahead.y * 3, 0)`,
      see: ['dnp.atan2', 'entity.facing']
    },
    {
      id: 'dnp.blast_reach', sig: 'dnp.blast_reach(centre, at, radius, falloff) → nil | true | true, share',
      doc: "Is the point `at` inside a blast of `radius` around `centre`? nil if not. If it is: just true without falloff, or true and the share (an fx from 1 at the centre to 0 at the edge) with falloff. The reach is a sphere; the share is measured flat.",
      args: [
        { name: 'centre', type: 'vec3', doc: 'Where the blast is.' },
        { name: 'at', type: 'vec3', doc: 'The point to test (a body\'s position).' },
        { name: 'radius', type: 'fx', doc: 'How far it reaches.' },
        { name: 'falloff', type: 'boolean', doc: 'Whether the effect weakens with distance.' }
      ],
      returns: 'nil, or true, or true and an fx share', where: 'both',
      example: `for _, p in ipairs(dnp.players()) do
  local inside, share = dnp.blast_reach(boom, p:pos(), fx.int(6), true)
  if inside and mobs and mobs.hurt then mobs.hurt(p, (share * 40).int) end
end`,
      see: ['dnp.knock_impulse']
    },
    {
      id: 'dnp.knock_impulse', sig: 'dnp.knock_impulse(origin, at, knockback, lift, k) → vec3',
      doc: "The shove a blast at `origin` gives a body at `at`: outward along the ground by `knockback × k`, and up by `lift × k`. Pass the result to `e:add_impulse`. `k` is your scale, typically the share from `dnp.blast_reach`.",
      args: [
        { name: 'origin', type: 'vec3', doc: 'Where the push comes from.' },
        { name: 'at', type: 'vec3', doc: 'The body\'s position.' },
        { name: 'knockback', type: 'fx', doc: 'Outward speed.' },
        { name: 'lift', type: 'fx', doc: 'Upward speed.' },
        { name: 'k', type: 'fx', doc: 'A multiplier for both.' }
      ],
      returns: 'vec3', where: 'both',
      example: `local inside, share = dnp.blast_reach(boom, p:pos(), fx.int(6), true)
if inside then
  p:add_impulse(dnp.knock_impulse(boom, p:pos(), fx.int(12), fx.int(6), share))
end`,
      see: ['dnp.blast_reach', 'entity.add_impulse']
    }
  ]
});

// ---------------------------------------------------------------- how rooms look
DNP_LUA_API.groups.push({
  id: 'dnp-looks', order: 50, title: 'How rooms look',
  intro: "Changing what rooms and walls look like while the game runs: floor and ceiling pictures, light, weather, wall textures and the sky. Every change is kept, saved with the level, and shown to players who arrive later.",
  entries: [
    {
      id: 'dnp.set_sector_texture', sig: "dnp.set_sector_texture(sector, 'floor' | 'ceiling', name)",
      doc: "Puts a different picture on a room's floor or ceiling.",
      args: [
        { name: 'sector', type: 'integer', doc: 'The room number (`s:index()`).' },
        { name: 'part', type: 'string', doc: "`'floor'` or `'ceiling'`." },
        { name: 'name', type: 'string', doc: 'A texture name from your module (at most 128 bytes).' }
      ],
      returns: 'nothing', where: 'level',
      notes: ["A room number the map does not have is an error."],
      example: `dnp.set_sector_texture(7, "floor", "LAVA1")`,
      see: ['dnp.set_sector_light', 'sector.index']
    },
    {
      id: 'dnp.set_sector_light', sig: 'dnp.set_sector_light(sector, level [, seconds])',
      doc: "Sets a room's light level, the same 0–255 scale as the map editor's light. With `seconds`, it fades there over that time on every player's screen at once.",
      args: [
        { name: 'sector', type: 'integer', doc: 'The room number.' },
        { name: 'level', type: 'number', doc: '0 (dark) to 255 (full bright); values outside are clamped.' },
        { name: 'seconds', type: 'number', optional: true, doc: 'Fade time, up to about 65 seconds. Default 0: at once.' }
      ],
      returns: 'nothing', where: 'level',
      example: `dnp.set_sector_light(7, 40, 2.5)     -- dim over two and a half seconds`,
      see: ['dnp.set_sector_texture', 'dnp.set_sector_effect']
    },
    {
      id: 'dnp.set_sector_effect', sig: "dnp.set_sector_effect(sector, kind [, settings | false])",
      doc: "Turns weather on in a room: `'rain'`, `'snow'`, `'dust'`, `'embers'` or `'fog'`. `settings` is a table of the same keys the map editor's effects take; leave one out and it keeps its default. Pass `false` to switch that effect off.\n\nKeys: `density`, `color`, `alpha`, `bottom`, `top`, `glow` for every kind; `speed`, `windx`, `windy`, `sway`, `size`, `length` for the particle kinds; `falloff`, `noise`, `drift` for fog.",
      args: [
        { name: 'sector', type: 'integer', doc: 'The room number.' },
        { name: 'kind', type: 'string', doc: "'rain', 'snow', 'dust', 'embers' or 'fog'." },
        { name: 'settings', type: 'table|false', optional: true, doc: "Numbers, fx or decimal strings; `color` also as a '#rrggbb' string. `false` removes the effect." }
      ],
      returns: 'nothing', where: 'level',
      notes: ["A key the kind does not take is an error that names it (snow has no `falloff`)."],
      example: `dnp.set_sector_effect(3, "snow", { density = 6, color = "#ddeeff" })
dnp.set_sector_effect(3, "snow", false)       -- and off again`,
      see: ['dnp.set_sector_light']
    },
    {
      id: 'dnp.side_texture', sig: "dnp.side_texture(side, 'upper' | 'middle' | 'lower') → string | nil",
      doc: "The name of the texture on one part of a wall, or nil if that part has none. Use it to work out what a switch should change to.",
      args: [
        { name: 'side', type: 'integer', doc: 'The side number (from on_interact).' },
        { name: 'part', type: 'string', doc: "`'upper'`, `'middle'` or `'lower'`." }
      ],
      returns: 'string, or nil', where: 'level',
      example: `function on_interact(e, side)
  local t = dnp.side_texture(side, "middle")
  if t and t:sub(1, 3) == "SW1" then
    dnp.set_side_texture(side, "middle", "SW2" .. t:sub(4))
  end
end`,
      see: ['dnp.set_side_texture', 'hook.on_interact']
    },
    {
      id: 'dnp.set_side_texture', sig: "dnp.set_side_texture(side, 'upper' | 'middle' | 'lower', name)",
      doc: "Puts a different texture on one part of a wall: a switch that has been thrown, a screen that changed.",
      args: [
        { name: 'side', type: 'integer', doc: 'The side number.' },
        { name: 'part', type: 'string', doc: "`'upper'`, `'middle'` or `'lower'`; anything else is an error." },
        { name: 'name', type: 'string', doc: 'A texture name from your module.' }
      ],
      returns: 'nothing', where: 'level',
      notes: ["A side number the map does not have is quietly ignored."],
      example: `dnp.set_side_texture(42, "middle", "SW2COMP")`,
      see: ['dnp.side_texture']
    },
    {
      id: 'dnp.sky', sig: "dnp.sky(words | { kind, image, faces, repeat, yaw, height } | nil)",
      doc: "Changes this level's sky for everyone here and everyone who arrives. Give it the same words as a sky line on the Sky page (`'strip SKY2 repeat 4'`), or a table. `nil` puts the module's own sky back.\n\nKinds: `strip` (wrapped round the horizon; takes `repeat`, `yaw`, `height`), `panorama` (one picture for the whole sphere; `yaw`), `cube` (six faces: east, west, north, south, up, down; `yaw`), `none`. `yaw` is in turns: 0.25 is a quarter turn.",
      args: [{ name: 'sky', type: 'string|table|nil', doc: 'The sky, or nil for the default.' }],
      returns: 'nothing', where: 'level',
      notes: ["A sky that cannot be read is an error that says what was wrong."],
      example: `dnp.sky("strip SKY3 repeat 2")
dnp.sky{ kind = "panorama", image = "dusk", yaw = 0.25 }
dnp.sky(nil)`,
      see: ['dnp.set_sector_texture']
    }
  ]
});

// ---------------------------------------------------------------- sound, music, effects
DNP_LUA_API.groups.push({
  id: 'dnp-sound', order: 60, title: 'Sound, music and effects',
  intro: "Things players hear and see but that do not change the game: sounds, music cues and particle effects. Each is sent and forgotten; a sound or effect may be dropped, so never make it the only sign of something important.",
  entries: [
    {
      id: 'dnp.sound', sig: 'dnp.sound(name, where [, { follow, predicted }]) → boolean',
      doc: "Plays a sound from your module's sound bank, heard by everyone within earshot (64 units). `where` is a position, or a body or prop: then the sound comes from it and moves with it.",
      args: [
        { name: 'name', type: 'string', doc: "The sound's name, e.g. `'world.door.open'`." },
        { name: 'where', type: 'vec3|entity|prop', doc: 'A place, or a thing to play it from.' },
        { name: 'opts', type: 'table', optional: true, doc: "`follow = false`: start at the thing but stay put. `predicted = true`: that player's own game already played it (their own jump or shot), so they don't hear it twice." }
      ],
      returns: 'true if sent; false for a stale handle or when too many sounds are queued this tick (128)', where: 'both',
      notes: ["A name your bank doesn't have plays silence."],
      example: `dnp.sound("world.door.open", sector:center())
dnp.sound("monster.imp.sight", e)
dnp.sound("player.death", e, { follow = false })`,
      see: ['dnp.music', 'dnp.predict_sounds']
    },
    {
      id: 'dnp.music', sig: "dnp.music(e | nil, cue [, fade_ms [, at]])",
      doc: "Switches the music to another cue, for one player or (with nil) for everyone in the level. The cue is a name from your module's music; the change crossfades over `fade_ms` and lands on the next bar by default.",
      args: [
        { name: 'e', type: 'entity|nil', doc: 'Whose music; nil for everyone here.' },
        { name: 'cue', type: 'string', doc: 'A music cue name.' },
        { name: 'fade_ms', type: 'number', optional: true, doc: 'Crossfade in milliseconds, 0–65535. Default 800.' },
        { name: 'at', type: 'string', optional: true, doc: "`'next_bar'` (default), `'loop_end'` or `'now'`. Anything else is an error." }
      ],
      returns: 'nothing', where: 'both',
      notes: ["A monster's handle or a stale one sends nothing; that is not an error."],
      example: `dnp.music(nil, "boss", 2000, "loop_end")`,
      see: ['dnp.sound']
    },
    {
      id: 'dnp.vfx', sig: 'dnp.vfx(kind, pos [, dir [, param [, skip]]]) → boolean',
      doc: "Shows a visual effect: a tracer, a flash, a burst of particles. `kind` is the number of a particle kind on your module's Particles page (the app also ships a few: blood, a muzzle flash, an explosion).",
      args: [
        { name: 'kind', type: 'integer', doc: 'The particle kind number.' },
        { name: 'pos', type: 'vec3', doc: "Where, in this level's coordinates." },
        { name: 'dir', type: 'integer (brad)', optional: true, doc: 'Which way it points. Default 0.' },
        { name: 'param', type: 'integer', optional: true, doc: "An extra number the effect may use, e.g. a tracer's length. Default 0." },
        { name: 'skip', type: 'entity', optional: true, doc: "A player whose own game already drew this effect; everyone else is sent it, that player is not." }
      ],
      returns: 'true if queued', where: 'level',
      example: `local hit, at = dnp.hitscan(e, 64)
dnp.vfx(12, at)                         -- sparks where the shot stopped`,
      see: ['dnp.hitscan', 'dnp.sound']
    },
    {
      id: 'dnp.predict_sounds', sig: 'dnp.predict_sounds(e, group, { { on, sound, every, fall, shots }, … })',
      doc: "Tells one player's game which sounds to play the instant it does something itself, without waiting for the server: jumping, landing, firing. The list replaces whatever `group` said before; an empty list clears it.\n\n`on` is `'jump'`, `'land'`, `'primary'`, `'primary_held'`, `'secondary'`, `'secondary_held'` or `'swing'`. `every` is the ticks between two shots, `fall` how fast a landing must be (units a second) to count, `shots` how many are left (leave it out for no limit).",
      args: [
        { name: 'e', type: 'entity', doc: 'The player.' },
        { name: 'group', type: 'string', doc: "Your name for this set, so different scripts don't overwrite each other." },
        { name: 'list', type: 'table', doc: 'Entries as described above.' }
      ],
      returns: 'nothing', where: 'both',
      notes: [
        "Play the same sound from the server with `predicted = true`, so the player doesn't hear it twice.",
        "The weapons runtime and the player sounds already do this for you; you need it only for sounds of your own."
      ],
      example: `dnp.predict_sounds(e, "moves", {
  { on = "jump", sound = "player.jump" },
  { on = "land", sound = "player.land", fall = 12 },
})`,
      see: ['dnp.sound']
    }
  ]
});

// ---------------------------------------------------------------- panels and HUD
DNP_LUA_API.groups.push({
  id: 'dnp-ui', order: 70, title: 'Panels and the HUD',
  intro: "Panels are small windows of labels, buttons, sliders, selects and toggles that you open on one player's screen; what they click arrives in `on_ui_event`. The HUD shows values you publish by name.",
  entries: [
    {
      id: 'dnp.ui_open', sig: 'dnp.ui_open(e, { title, template, pinned, widgets = { {kind, id, label, value, lo, hi, options}, … } }) → ui_id',
      doc: "Opens a panel on player `e`'s screen and returns its id (0 when nobody is there to see it: a stale handle, or a body no player controls).\n\nEach widget is a table. `kind` is `'label'`, `'button'`, `'slider'`, `'select'` or `'toggle'` (default label). `id` is your own number and comes back in on_ui_event. `value` is the starting value, `lo`/`hi` a slider's range, `options` a select's list of strings.",
      args: [
        { name: 'e', type: 'entity', doc: 'The player.' },
        { name: 'panel', type: 'table', doc: "`title` (string), `template` (the name of a panel layout in your module's UI, lower-case letters, digits and _), `pinned` (true: no close button, it stays until you close it), `widgets` (a list)." }
      ],
      returns: 'integer ui_id, or 0', where: 'both',
      notes: [
        "Limits: 32 widgets, 32 options per select, 128 bytes per text. Going over is an error rather than silent cutting.",
        "Values are whole numbers. A select's value is the index of the chosen option.",
        "A panel opened from the game VM sends its events to the game VM."
      ],
      example: `local W_HEAL, W_SPEED, W_CLOSE = 1, 2, 3
local ui = dnp.ui_open(e, {
  title = "Training",
  widgets = {
    { kind = "label",  id = 0, label = "Pick a boost" },
    { kind = "button", id = W_HEAL, label = "Heal" },
    { kind = "slider", id = W_SPEED, label = "Speed %", value = 100, lo = 50, hi = 200 },
    { kind = "button", id = W_CLOSE, label = "Close" },
  }
})`,
      see: ['hook.on_ui_event', 'dnp.ui_set', 'dnp.ui_close']
    },
    {
      id: 'dnp.ui_set', sig: 'dnp.ui_set(e, ui_id, widget_id, value)',
      doc: "Changes one widget's value on a panel that is already open, without closing and reopening it (which would flicker).",
      args: [
        { name: 'e', type: 'entity', doc: 'The player.' },
        { name: 'ui_id', type: 'integer', doc: 'From `dnp.ui_open`.' },
        { name: 'widget_id', type: 'integer', doc: 'Your widget id.' },
        { name: 'value', type: 'integer', doc: 'The new value.' }
      ],
      returns: 'nothing', where: 'both',
      example: `dnp.ui_set(e, ui, W_SPEED, 150)`,
      see: ['dnp.ui_open', 'dnp.ui_show']
    },
    {
      id: 'dnp.ui_show', sig: 'dnp.ui_show(e, ui_id, widget, shown)',
      doc: "Hides or shows part of an open panel: a widget by its id (a number), or a decoration of the panel's template by name (a string). A hidden widget keeps its value and comes back where it was.",
      args: [
        { name: 'e', type: 'entity', doc: 'The player.' },
        { name: 'ui_id', type: 'integer', doc: 'From `dnp.ui_open`.' },
        { name: 'widget', type: 'integer|string', doc: 'A widget id, or a template element name (1–32 characters).' },
        { name: 'shown', type: 'boolean', doc: 'true to show, false to hide.' }
      ],
      returns: 'nothing', where: 'both',
      example: `dnp.ui_show(e, ui, W_SPEED, false)`,
      see: ['dnp.ui_set']
    },
    {
      id: 'dnp.ui_close', sig: 'dnp.ui_close(e, ui_id)',
      doc: "Closes a panel. Clicks that were already on their way for it are dropped, never delivered.",
      args: [
        { name: 'e', type: 'entity', doc: 'The player.' },
        { name: 'ui_id', type: 'integer', doc: 'From `dnp.ui_open`.' }
      ],
      returns: 'nothing', where: 'both',
      example: `function on_ui_event(e, ui_id, widget_id, value)
  if widget_id == W_CLOSE then dnp.ui_close(e, ui_id) end
end`,
      see: ['dnp.ui_open']
    },
    {
      id: 'dnp.hud', sig: 'dnp.hud(e | nil, { name = value, … })',
      doc: "Publishes values for your HUD layout: an element bound to `hud.ammo` shows what you set as `ammo`. Values are whole numbers or strings; `false` clears one (true counts as 1). With `nil` instead of a player, it goes to everyone in the level.\n\nOnly changes are sent, so calling it every tick with the same values costs nothing.",
      args: [
        { name: 'e', type: 'entity|nil', doc: 'One player, or nil for everyone here.' },
        { name: 'values', type: 'table', doc: 'Names are lower-case letters, digits and _, 1–24 characters. Strings are cut at 128 bytes.' }
      ],
      returns: 'nothing', where: 'both',
      notes: [
        "An fx value is an error: convert it first with `.int`.",
        "At most 64 different names per player.",
        "The weapons runtime already publishes `hp_max`, `weapon`, `ammo`, `ammo_max`, `ammo_type`, `ammo_<pool>`, and `subtitle` / `subtitle_speaker` for subtitles."
      ],
      example: `dnp.hud(e, { score = 1200, key_red = 1 })
dnp.hud(nil, { timer = 90 })
dnp.hud(e, { key_red = false })            -- clear it`,
      see: ['dnp.ui_open']
    }
  ]
});

// ---------------------------------------------------------------- camera and screen
DNP_LUA_API.groups.push({
  id: 'dnp-camera', order: 80, title: 'Camera and screen',
  intro: "How each player's camera follows, flies along a path or shakes, and what is drawn over everything (a fade to black, letterbox bars). The camera itself runs on the player's device: you only configure it.",
  entries: [
    {
      id: 'dnp.camera', sig: 'dnp.camera(e, { distance, pitch, yaw, … })',
      doc: "Changes how the camera behaves for player `e`. Name only the fields you want to change; the rest stay as they are.\n\nFields: `distance` (units from the player), `pitch` (turns above horizontal; 0.125 is 45°), `yaw` (turns around the player), `lock_yaw` and `lock_zoom` (1: the player may not turn or zoom it; 0: may), `smoothing`, `max_accel` (0 = no limit), `lead` (units ahead of the player), `lead_smoothing`, `lead_velocity` (extra lead per unit of forward speed), `deadzone_x`, `deadzone_y`.\n\nPaths and shake: `cam_mode` (0 follow, 1 track, 2 flythrough, 3 auto), `cam_path` (the tag of a camera path in the map; negative for none), `cam_path_speed` (units a second along it, may be negative), `cam_path_attach`, `cam_path_blend`, `cam_shake` (strength; sending it shakes once, and a new shake replaces a running one), `cam_shake_time` (milliseconds).",
      args: [
        { name: 'e', type: 'entity', doc: 'The player.' },
        { name: 'fields', type: 'table', doc: 'Plain numbers (not fx); kept to a thousandth.' }
      ],
      returns: 'nothing', where: 'both',
      example: `dnp.camera(e, { distance = 30, pitch = 0.1, lock_yaw = 1 })
dnp.camera(e, { cam_shake = 0.6, cam_shake_time = 400 })`,
      see: ['dnp.level_camera', 'dnp.screen', 'dnp.path_length']
    },
    {
      id: 'dnp.level_camera', sig: 'dnp.level_camera{ … }',
      doc: "The camera every player gets on arriving in this level: the same fields as `dnp.camera`. Call it once, as the level loads. Players already here get it at once. Change one player's afterwards with `dnp.camera`.",
      args: [{ name: 'fields', type: 'table', doc: 'As for `dnp.camera`.' }],
      returns: 'nothing', where: 'level',
      example: `dnp.level_camera{ yaw = 0.125, pitch = 0.05, distance = 30, lock_yaw = 1 }`,
      see: ['dnp.camera']
    },
    {
      id: 'dnp.screen', sig: 'dnp.screen(e | nil, { fade, fade_ms, letterbox, letterbox_ms, quit })',
      doc: "What is drawn over the game: a black curtain and cinema bars. `fade` is the curtain's opacity (1 black, 0 clear), `letterbox` how much of the screen each bar covers (up to 0.5), and the `_ms` fields how long each change takes. `quit = 1` asks the app to close (a main menu's Quit button). With nil, for everyone in the level.",
      args: [
        { name: 'e', type: 'entity|nil', doc: 'One player, or nil for everyone here.' },
        { name: 'fields', type: 'table', doc: 'Name only what changes.' }
      ],
      returns: 'nothing', where: 'both',
      example: `dnp.screen(e, { fade = 1, fade_ms = 500, letterbox = 0.12, letterbox_ms = 500 })
-- later
dnp.screen(e, { fade = 0, fade_ms = 800, letterbox = 0 })`,
      see: ['dnp.camera']
    },
    {
      id: 'dnp.path_length', sig: 'dnp.path_length(tag) → number | nil',
      doc: "How long the camera path with this tag is, measured along the curve the camera actually flies, in units. Divide by the speed you pass as `cam_path_speed` to know how many seconds a flythrough takes. nil if the map has no path with that tag; 0 is a real (degenerate) path.",
      args: [{ name: 'tag', type: 'integer', doc: 'The path tag from the map editor.' }],
      returns: 'number, or nil', where: 'level',
      notes: ["Tags need not be unique; the first path with the tag wins."],
      example: `local len = dnp.path_length(1)
if len then
  dnp.camera(e, { cam_mode = 2, cam_path = 1, cam_path_speed = 8 })
  shot_ends = dnp.tick() + math.floor(len / 8 * 60)
end`,
      see: ['dnp.camera']
    }
  ]
});

// ---------------------------------------------------------------- saving and the store
DNP_LUA_API.groups.push({
  id: 'dnp-saving', order: 90, title: 'Saving and the store',
  intro: "Two different things. A SAVE is the world at a moment: your script joins it with `dnp.persist`, and a new game forgets it. The STORE is what outlives every game: a high score, what is unlocked, a setting.",
  entries: [
    {
      id: 'dnp.persist', sig: 'dnp.persist(name, save, load)',
      doc: "Adds your script's state to saved games. `save()` returns plain data to keep (or nil for nothing); when the game is loaded, `load(value)` gets that value back and puts things back as they were. Register it at the top level of your script, as it loads.\n\nPlain data: tables, numbers, strings, booleans, fx and vec3. Handles (entities, props) are refused: save what they stand for, a kind and a position, and spawn them again in `load`.",
      args: [
        { name: 'name', type: 'string', doc: 'Your part\'s name; unique within the level (or the game).' },
        { name: 'save', type: 'function() → value', doc: 'Returns what to keep.' },
        { name: 'load', type: 'function(value)', doc: 'Receives it back.' }
      ],
      returns: 'nothing', where: 'both',
      notes: [
        "A part that fails to save is reported by name and left out; the others are still saved.",
        "In a level, the state is that level's. In the game VM, it is the game's own (a quest flag, a total score)."
      ],
      example: `local opened = {}
dnp.persist("my_doors", function()
  return { opened = opened }
end, function(t)
  opened = t.opened or {}
  for tag in pairs(opened) do open_door(tag) end
end)`,
      see: ['dnp.persist_player', 'dnp.restoring']
    },
    {
      id: 'dnp.persist_player', sig: 'dnp.persist_player(name, save, load)',
      doc: "Like `dnp.persist`, but per player: `save(e)` returns what to keep about player `e`, and `load(e, value)` gives it back when they return.",
      args: [
        { name: 'name', type: 'string', doc: 'Your part\'s name.' },
        { name: 'save', type: 'function(e) → value', doc: 'What to keep about this player.' },
        { name: 'load', type: 'function(e, value)', doc: 'Receives it back.' }
      ],
      returns: 'nothing', where: 'both',
      example: `local coins = {}
dnp.persist_player("coins", function(e)
  return coins[e:player()]
end, function(e, n)
  coins[e:player()] = n
end)`,
      see: ['dnp.persist', 'entity.player']
    },
    {
      id: 'dnp.restoring', sig: 'dnp.restoring() → boolean',
      doc: "True while a saved game is being loaded into this level (or the game). Your script still runs from the top, but the save is about to put things back, so skip placing them yourself.\n\nYou mostly don't need to: while restoring, `dnp.spawn_prop` and `dnp.spawn_enemy` made during loading are held back automatically, and props placed at load come back where they were left.",
      args: [], returns: 'boolean', where: 'both',
      example: `if not dnp.restoring() then
  dnp.hud(nil, { subtitle = "Find the red key" })
end`,
      see: ['dnp.persist']
    },
    {
      id: 'dnp.store_save', sig: 'dnp.store_save(name, value) → true | false, why',
      doc: "Writes a value to disk under `name`, replacing what was there. It stays across new games and restarts. The same plain data as `dnp.persist`.",
      args: [
        { name: 'name', type: 'string', doc: '1–48 letters, digits, _ or -.' },
        { name: 'value', type: 'any plain data', doc: 'At most 64 KB once encoded.' }
      ],
      returns: 'true, or false and a reason', where: 'both',
      notes: ["Writes are whole: a crash in the middle leaves the old value, never half of the new one."],
      example: `local best = dnp.store_load("best_time") or 0
if my_time > best then
  local ok, why = dnp.store_save("best_time", my_time)
  if not ok then print("could not save: " .. why) end
end`,
      see: ['dnp.store_load', 'dnp.store_delete']
    },
    {
      id: 'dnp.store_load', sig: 'dnp.store_load(name) → value | nil [, why]',
      doc: "Reads a value written by `dnp.store_save`. nil with no reason means it was never saved; nil and a reason means the name is bad or the file is damaged.",
      args: [{ name: 'name', type: 'string', doc: '1–48 letters, digits, _ or -.' }],
      returns: 'the value, or nil (and a reason when something is wrong)', where: 'both',
      example: `local unlocked = dnp.store_load("unlocked") or {}`,
      see: ['dnp.store_save']
    },
    {
      id: 'dnp.store_delete', sig: 'dnp.store_delete(name) → boolean [, why]',
      doc: "Removes a stored value. True if there was one.",
      args: [{ name: 'name', type: 'string', doc: '1–48 letters, digits, _ or -.' }],
      returns: 'true if it existed; false (and a reason for a bad name)', where: 'both',
      example: `dnp.store_delete("unlocked")`,
      see: ['dnp.store_save']
    }
  ]
});

// ---------------------------------------------------------------- calls between VMs
DNP_LUA_API.groups.push({
  id: 'dnp-calls', order: 100, title: 'Calls between VMs',
  intro: "Each level runs its own Lua, and the game has one more that is shared by all levels (the game VM: weapons, player sounds, game graphs). They talk by exporting functions by name and calling them.",
  entries: [
    {
      id: 'dnp.export', sig: 'dnp.export(name, fn)',
      doc: "Makes `fn` callable from other VMs under `name`. Exporting the same name again replaces it.",
      args: [
        { name: 'name', type: 'string', doc: 'The name callers use.' },
        { name: 'fn', type: 'function', doc: 'The function. From call_level and call_owner it receives the entity first.' }
      ],
      returns: 'nothing', where: 'both',
      example: `dnp.export("open_vault", function(e, code)
  if code == 1234 then dnp.sector(9):move_parametric(vec3.new(0,0,0), vec3.new(0,0,4), 60) return true end
  return false
end)`,
      see: ['dnp.call_level', 'dnp.call_game']
    },
    {
      id: 'dnp.call_game', sig: 'dnp.call_game(name, …) → …',
      doc: "Calls the game VM's export `name` with your arguments and returns what it returns. Returns nothing when there is no game VM, it has no such export, or the call failed (the failure is printed to the log).",
      args: [
        { name: 'name', type: 'string', doc: 'The export\'s name.' },
        { name: '…', type: 'values', optional: true, doc: 'Plain data, fx, vec3, entities and props.' }
      ],
      returns: "the export's results, or nothing", where: 'both',
      notes: ["Arguments and results are copied, not shared: a table you pass is a copy on the other side. Functions cannot be passed."],
      example: `if dnp.game_has("add_score") then
  dnp.call_game("add_score", e, 100)
end`,
      see: ['dnp.game_has', 'dnp.export']
    },
    {
      id: 'dnp.game_has', sig: 'dnp.game_has(name) → boolean',
      doc: "Whether the game VM exports `name`, so a level can tell 'the game handles this' from 'nobody does' before deciding.",
      args: [{ name: 'name', type: 'string', doc: 'An export name.' }],
      returns: 'boolean', where: 'both',
      example: `if not dnp.game_has("add_score") then print("no scoring in this module") end`,
      see: ['dnp.call_game']
    },
    {
      id: 'dnp.call_level', sig: 'dnp.call_level(e, name, …) → …',
      doc: "Calls export `name` in the level player `e` is currently in. The export receives `e` first, then your arguments. Mostly used from the game VM to reach into a level.",
      args: [
        { name: 'e', type: 'entity', doc: 'The player whose level to call.' },
        { name: 'name', type: 'string', doc: 'The export\'s name.' },
        { name: '…', type: 'values', optional: true, doc: 'More arguments.' }
      ],
      returns: "the export's results, or nothing (stale handle, no such export, or an error)", where: 'both',
      example: `local ok = dnp.call_level(e, "open_vault", 1234)`,
      see: ['dnp.export', 'dnp.call_owner']
    },
    {
      id: 'dnp.call_owner', sig: 'dnp.call_owner(thing, name, …) → …',
      doc: "Calls export `name` in the level that spawned `thing` (a monster or prop), passing `thing` first. Useful where several maps share one world: a shot fired in one level can hit a monster another level looks after.",
      args: [
        { name: 'thing', type: 'entity|prop', doc: 'The monster or prop. Anything else is an error.' },
        { name: 'name', type: 'string', doc: 'The export\'s name.' },
        { name: '…', type: 'values', optional: true, doc: 'More arguments.' }
      ],
      returns: "the export's results, or nothing: also when `thing` belongs to no level or to the caller's own", where: 'both',
      example: `local r = dnp.call_owner(target, "hurt", 10)`,
      see: ['dnp.call_level']
    },
    {
      id: 'dnp.is_game', sig: 'dnp.is_game() → boolean',
      doc: "True when this script runs in the game VM, false in a level. For code shared by both.",
      args: [], returns: 'boolean', where: 'both',
      example: `if dnp.is_game() then print("game-wide") else print("level " .. dnp.level()) end`,
      see: ['dnp.call_game']
    }
  ]
});

// ---------------------------------------------------------------- players and controls
DNP_LUA_API.groups.push({
  id: 'dnp-controls', order: 110, title: 'Players and controls',
  intro: "What the module's controls are and what each player is pressing. Button bits are named in `dnp.button`; read them with `e:buttons()`, and your module's own keys with `e:actions()`.",
  entries: [
    {
      id: 'dnp.controls', sig: "dnp.controls() → 'fps' | 'platformer'",
      doc: "The module's control scheme, as chosen on the Controls page.",
      args: [], returns: "'fps' or 'platformer'", where: 'both',
      example: `if dnp.controls() == "platformer" then dnp.camera(e, { lead = 3 }) end`,
      see: ['dnp.actions']
    },
    {
      id: 'dnp.actions', sig: 'dnp.actions() → { string, … }',
      doc: "The names of your module's own keys (declared on the Controls page), in bit order: entry 1 is bit 0 of `e:actions()`, entry 2 is bit 1, and so on.",
      args: [], returns: 'a list of key names', where: 'both',
      example: `local bit_of = {}
for i, name in ipairs(dnp.actions()) do bit_of[name] = 2 ^ (i - 1) end
function on_tick()
  for _, e in ipairs(dnp.players()) do
    if bit_of.reload and bit.band(e:actions(), bit_of.reload) ~= 0 then print("reload") end
  end
end`,
      see: ['entity.actions', 'entity.buttons']
    }
  ]
});

// ---------------------------------------------------------------- diagnostics
DNP_LUA_API.groups.push({
  id: 'dnp-diagnostics', order: 120, title: 'Diagnostics',
  intro: "Finding out what your script is doing. `print` writes to the play log (Home → play log, or a map's ⋯ menu → Play log…), as do script errors, with the script's name.",
  entries: [
    {
      id: 'dnp.stale_handle_ops', sig: 'dnp.stale_handle_ops() → integer',
      doc: "How many times scripts in this level have used a handle to something that no longer exists (a monster that died, a prop picked up). Those calls do nothing and return nil, by design; a number that keeps climbing usually means a script holds on to handles it should forget.",
      args: [], returns: 'integer, counted since the level started', where: 'both',
      example: `if dnp.tick() % 600 == 0 then print("stale ops: " .. dnp.stale_handle_ops()) end`,
      see: ['entity.valid', 'lua.print']
    }
  ]
});

// ---------------------------------------------------------------- dnp.button
(function () {
  const B = [
    ['JUMP', 1, "Jump. While climbing or flying it also means up."],
    ['DASH', 2, "Dash."],
    ['CLIMB', 4, "Hold on to a climbable wall (when the module doesn't climb automatically)."],
    ['HOVER', 8, "Hover."],
    ['FLIGHT', 16, "Fly."],
    ['GRAPPLE', 32, "Fire the grappling hook."],
    ['INTERACT', 64, "The use key: works doors and switches (on_interact) and usable props (on_prop_use)."],
    ['ATTACK_PRIMARY', 128, "Attack, or fire the weapon in hand."],
    ['ATTACK_SECONDARY', 256, "The second attack (alternate fire with the weapons runtime)."],
    ['USE', 512, "A spare button the movement itself ignores. Doors and switches listen to INTERACT, not this; for keys of your own, declare them on the Controls page and read `e:actions()`."],
    ['CROUCH', 1024, "Crouch. While climbing or flying it means down; with the grapple it pulls you in."]
  ];
  DNP_LUA_API.groups.push({
    id: 'dnp-button', order: 130, title: 'dnp.button',
    intro: "Names for the bits of `e:buttons()`. Test one with `bit.band(e:buttons(), dnp.button.JUMP) ~= 0`. The same bits drive a scripted body through `e:set_input` and `e:press`.",
    entries: B.map(function (b) {
      return {
        id: 'dnp.button.' + b[0], sig: 'dnp.button.' + b[0] + ' → ' + b[1],
        doc: b[2], args: [], returns: 'integer ' + b[1], where: 'both',
        example: b[0] === 'ATTACK_PRIMARY'
          ? `function on_tick()
  for _, e in ipairs(dnp.players()) do
    if bit.band(e:buttons(), dnp.button.ATTACK_PRIMARY) ~= 0 then
      -- the trigger is held this tick
    end
  end
end`
          : 'local held = bit.band(e:buttons(), dnp.button.' + b[0] + ') ~= 0',
        see: ['entity.buttons', 'entity.set_input']
      };
    })
  });
})();

// ---------------------------------------------------------------- entities
DNP_LUA_API.groups.push({
  id: 'entity', order: 140, title: 'Entities (e:)',
  intro: "An entity is a body: a player or a monster. You get one from a hook, `dnp.players()`, `dnp.entity(i)` and so on, and call its methods with a colon: `e:pos()`.\n\nA handle can outlive the body (a monster dies, a player leaves). Then reads return nil, writes do nothing, and `e:valid()` is false; it is never an error. Writes that move a body (teleport, impulse, velocity, change of map) are queued and happen when the world next steps, so reading the value straight back shows the old one. Two handles to the same body are `==`.",
  entries: [
    { id: 'entity.valid', sig: 'e:valid() → boolean', doc: "Whether the body still exists. Check it before using a handle you kept from an earlier tick.", args: [], returns: 'boolean', where: 'both',
      example: `if target and not target:valid() then target = nil end`, see: ['dnp.stale_handle_ops'] },
    { id: 'entity.pos', sig: 'e:pos() → vec3 | nil', doc: "Where the body's feet are, in this level's coordinates.", args: [], returns: 'vec3, or nil when stale', where: 'both',
      example: `local p = e:pos()
print(p.x, p.y, p.z)`, see: ['entity.teleport', 'vec3.fields'] },
    { id: 'entity.vel', sig: 'e:vel() → vec3 | nil', doc: "How fast the body is moving, in units a second.", args: [], returns: 'vec3, or nil when stale', where: 'both',
      example: `if e:vel().z < fx.int(-20) then print("falling fast") end`, see: ['entity.set_velocity'] },
    { id: 'entity.grounded', sig: 'e:grounded() → boolean', doc: "Whether the body is standing on something.", args: [], returns: 'boolean (false when stale)', where: 'both',
      example: `if e:grounded() then e:add_impulse(vec3.new(0, 0, 6)) end`, see: ['entity.jumps'] },
    { id: 'entity.jumps', sig: 'e:jumps() → integer | nil', doc: "How many jumps the body has used since it last stood on something. It goes up on every jump, in the air too, so it is how you notice a double jump.", args: [], returns: 'integer, or nil when stale', where: 'both',
      example: `if e:jumps() == 2 then dnp.vfx(13, e:pos()) end`, see: ['entity.grounded'] },
    { id: 'entity.pitch', sig: 'e:pitch() → fx | nil', doc: "Where the body looks vertically, as a fraction of a turn (positive is up, 0.25 straight up). Always 0 with controls that have no vertical aim.", args: [], returns: 'fx, or nil when stale', where: 'both',
      example: `if e:pitch() > fx.frac(1, 8) then print("looking up") end`, see: ['entity.facing'] },
    { id: 'entity.sector', sig: 'e:sector() → integer | nil', doc: "The number of the room the body is in. -1 when it stands in another level of a shared world.", args: [], returns: 'integer, or nil when stale', where: 'both',
      example: `local s = dnp.sector(e:sector())
if s and s:tag() == 5 then print("in the vault") end`, see: ['dnp.sector', 'dnp.find_path'] },
    { id: 'entity.index', sig: 'e:index() → integer | nil', doc: "The body's slot number, for `dnp.entity(i)` and as a table key for per-body data. Slots are reused after a body is gone, and a player gets a new one in each level; for something that follows a player everywhere use `e:player()`.", args: [], returns: 'integer, or nil when stale', where: 'both',
      example: `local seen_at = {}
seen_at[e:index()] = dnp.tick()`, see: ['entity.player', 'dnp.entity'] },
    { id: 'entity.player', sig: 'e:player() → integer | nil', doc: "Which player this body is: a number that stays the same from level to level for as long as they are connected. nil for a body nobody plays.", args: [], returns: 'integer, or nil', where: 'both',
      example: `score[e:player()] = (score[e:player()] or 0) + 10`, see: ['hook.on_player_leave', 'dnp.persist_player'] },
    { id: 'entity.kind', sig: 'e:kind() → integer | nil', doc: "The body's catalogue number. 0 means a player.", args: [], returns: 'integer, or nil when stale', where: 'both',
      example: `if e:kind() == 0 then print("a player") end`, see: ['entity.name', 'dnp.prop_kind'] },
    { id: 'entity.name', sig: 'e:name() → string | nil', doc: "The catalogue name of what this body is (`'imp'`). nil for a player, who has no catalogue entry.", args: [], returns: 'string, or nil', where: 'both',
      example: `if target:name() == "imp" then print("an imp") end`, see: ['entity.kind'] },
    { id: 'entity.facing', sig: 'e:facing() → integer | nil', doc: "Which way the body faces, in brads: 0 is +x, and 4294967296 is a full turn (so 1073741824 is a quarter turn, +y).", args: [], returns: 'integer, or nil when stale', where: 'both',
      notes: ["For degrees: `e:facing() * 360 / 4294967296`."],
      example: `local ahead = dnp.dir(e:facing())`, see: ['dnp.dir', 'dnp.atan2'] },
    { id: 'entity.buttons', sig: 'e:buttons() → integer | nil', doc: "The buttons held this tick, as bits named in `dnp.button`. Read from on_tick, it is what the body will do in the step that follows. A body frozen by a cutscene presses nothing.\n\nThis is how you build a ranged weapon: on_attack only fires when a swing connects, but the trigger being pulled shows here.", args: [], returns: 'integer, or nil when stale', where: 'both',
      example: `local fire = bit.band(e:buttons(), dnp.button.ATTACK_PRIMARY) ~= 0`, see: ['dnp.button.ATTACK_PRIMARY', 'entity.actions'] },
    { id: 'entity.actions', sig: 'e:actions() → integer | nil', doc: "Your module's own keys held this tick, as bits: bit 0 is `dnp.actions()[1]`, bit 1 is `dnp.actions()[2]`, and so on.", args: [], returns: 'integer, or nil when stale', where: 'both',
      example: `local first_key_held = bit.band(e:actions(), 1) ~= 0`, see: ['dnp.actions'] },
    { id: 'entity.hp', sig: 'e:hp() → integer | nil', doc: "A player's health.", args: [], returns: 'integer, or nil when stale', where: 'both',
      notes: ["Monsters run by the monster runtime keep their health there: use `mobs.health(e)`."],
      example: `dnp.hud(e, { hp_text = "HP " .. e:hp() })`, see: ['entity.set_hp'] },
    { id: 'entity.set_hp', sig: 'e:set_hp(n)', doc: "Sets a player's health. Only the number: dropping it to 0 does not by itself kill anyone. To damage with the usual pain, death and respawn, use `mobs.hurt(e, amount)`.", args: [{ name: 'n', type: 'integer', doc: 'The new health.' }], returns: 'nothing', where: 'both',
      notes: ["For a monster run by the monster runtime, use `mobs.set_health`."],
      example: `e:set_hp(math.min(e:hp() + 25, 100))`, see: ['entity.hp'] },
    { id: 'entity.avatar', sig: 'e:avatar() → integer | nil', doc: "Which look (avatar number) this player is drawn with. nil for monsters, which are drawn from their kind.", args: [], returns: 'integer, or nil', where: 'both',
      example: `print("wearing avatar " .. tostring(e:avatar()))`, see: ['entity.set_avatar'] },
    { id: 'entity.set_avatar', sig: 'e:set_avatar(n)', doc: "Changes which avatar a player is drawn with, so two players can look different. The number is one your module's avatars define.", args: [{ name: 'n', type: 'integer', doc: '0 to 65535; outside is an error.' }], returns: 'nothing', where: 'both',
      example: `e:set_avatar(2)`, see: ['entity.avatar'] },
    { id: 'entity.set_animation', sig: 'e:set_animation(n)', doc: "Sets the body's animation state number. Which frames that shows and how fast is the art's business; you only say which state.", args: [{ name: 'n', type: 'integer', doc: '0 to 65535.' }], returns: 'nothing', where: 'both',
      example: `dummy:set_animation(3)`, see: ['prop.set_animation'] },
    { id: 'entity.solid', sig: 'e:solid() → boolean', doc: "Whether other bodies bump into this one.", args: [], returns: 'boolean (false when stale)', where: 'both',
      example: `if not target:solid() then return end      -- a corpse`, see: ['entity.set_solid'] },
    { id: 'entity.set_solid', sig: 'e:set_solid(solid)', doc: "Whether other bodies bump into this one. Turn it off for a corpse, so it doesn't block a doorway. Takes effect at once.", args: [{ name: 'solid', type: 'boolean', doc: 'true to block, false to let others through.' }], returns: 'nothing', where: 'both',
      example: `e:set_solid(false)`, see: ['entity.solid'] },
    { id: 'entity.teleport', sig: 'e:teleport(pos)', doc: "Moves the body to `pos` (this level's coordinates). Queued: it happens when the world next steps.", args: [{ name: 'pos', type: 'vec3', doc: 'Where to put its feet.' }], returns: 'nothing', where: 'both',
      example: `local at = dnp.spawn_point("arena")
if at then e:teleport(at) end`, see: ['dnp.spawn_point', 'entity.change_map'] },
    { id: 'entity.add_impulse', sig: 'e:add_impulse(v)', doc: "Adds `v` (units a second) to the body's velocity: a push, a bounce pad, a knockback. Two pushes in one tick both count. Queued until the world steps.", args: [{ name: 'v', type: 'vec3', doc: 'The change in velocity.' }], returns: 'nothing', where: 'both',
      example: `e:add_impulse(vec3.new(0, 0, 14))        -- a jump pad`, see: ['entity.set_velocity', 'dnp.knock_impulse'] },
    { id: 'entity.set_velocity', sig: 'e:set_velocity(v)', doc: "Replaces the body's velocity (units a second). Queued until the world steps.", args: [{ name: 'v', type: 'vec3', doc: 'The new velocity.' }], returns: 'nothing', where: 'both',
      example: `e:set_velocity(vec3.new(0, 0, 0))        -- stop dead`, see: ['entity.add_impulse'] },
    { id: 'entity.change_map', sig: 'e:change_map([index [, spawn_tag]]) → boolean', doc: "Sends the player to another level. With no index, the next one in order; with an index, that level (counting from 0, as in `dnp.levels()`). `spawn_tag` names the spawn point to arrive at, e.g. the door they came through; a tag the level lacks arrives at its start.\n\nHappens after every level has finished its tick.", args: [
        { name: 'index', type: 'integer', optional: true, doc: 'Which level, from 0. Default: the next one.' },
        { name: 'spawn_tag', type: 'string', optional: true, doc: 'Spawn point tag in the destination.' }
      ], returns: 'true if the request was taken; false for a stale handle or a game with only one level', where: 'both',
      example: `function on_cross(e, side)
  if side == EXIT_LINE then e:change_map(dnp.level() + 1, "from_south") end
end`, see: ['dnp.levels', 'dnp.level', 'dnp.spawn_point'] },
    { id: 'entity.param', sig: 'e:param(name) → fx | nil', doc: "The body's current value of a movement setting (your module's player rules: `move_speed`, `jump_impulse`, `gravity_scale`, `max_jumps`, `dash_speed`, `attack_reach`…), with every effect on it applied.", args: [{ name: 'name', type: 'string', doc: 'A movement setting name; an unknown name is an error.' }], returns: 'fx, or nil when stale', where: 'both',
      example: `print("speed now " .. tostring(e:param("move_speed")))`, see: ['entity.base_param', 'entity.add_effect'] },
    { id: 'entity.base_param', sig: 'e:base_param(name) → fx | nil', doc: "The same setting before any effect: what the body has on its own.", args: [{ name: 'name', type: 'string', doc: 'A movement setting name.' }], returns: 'fx, or nil when stale', where: 'both',
      example: `local boosted = e:param("move_speed") > e:base_param("move_speed")`, see: ['entity.param'] },
    { id: 'entity.add_effect', sig: "e:add_effect(name, 'mul' | 'add' | 'set', value [, ticks]) → id", doc: "Changes a movement setting temporarily, on top of the body's own value: `'mul'` multiplies, `'add'` adds, `'set'` replaces. Effects apply in the order you add them. With `ticks`, it ends on its own after that many ticks; without, it lasts until you remove it.\n\nYou get back an id for `e:remove_effect`, or 0 if the effect table is full.", args: [
        { name: 'name', type: 'string', doc: 'A movement setting name.' },
        { name: 'op', type: 'string', doc: "'mul', 'add' or 'set'." },
        { name: 'value', type: 'fx', doc: "The amount. A whole number is fine; for 1.5 write `fx.parse('1.5')`." },
        { name: 'ticks', type: 'integer', optional: true, doc: 'How long it lasts. Default: until removed.' }
      ], returns: 'integer id (0 when it could not be added)', where: 'both',
      notes: ["The whole world shares 256 effect slots. Remove effects you no longer need, and keep the id so a second boost replaces the first instead of stacking."],
      example: `-- double speed for five seconds
e:add_effect("move_speed", "mul", 2, 5 * 60)
-- 1.5x jump until removed
local id = e:add_effect("jump_impulse", "mul", fx.parse("1.5"))`, see: ['entity.remove_effect', 'entity.param'] },
    { id: 'entity.remove_effect', sig: 'e:remove_effect(id) → boolean', doc: "Removes an effect added with `add_effect`. Works even if the body is already gone, so the slot is never leaked.", args: [{ name: 'id', type: 'integer', doc: 'What add_effect returned.' }], returns: 'true if it was there', where: 'both',
      example: `if boost_id then e:remove_effect(boost_id); boost_id = nil end`, see: ['entity.add_effect'] },
    { id: 'entity.set_body_param', sig: 'e:set_body_param(name, value)', doc: "Changes a movement setting of a SCRIPTED body (one you spawned) permanently, rather than as an effect. Effects keep stacking on top of the new value.", args: [
        { name: 'name', type: 'string', doc: 'A movement setting name.' },
        { name: 'value', type: 'fx', doc: 'The new value; whole-number settings are truncated.' }
      ], returns: 'nothing', where: 'level',
      notes: ["Refused (an error) for a player: a player's body comes from the module's player rules."],
      example: `local d = dnp.spawn_enemy("target_dummy", vec3.new(0, 10, 0))
d:set_body_param("move_speed", 3)`, see: ['entity.add_effect', 'dnp.spawn_enemy'] },
    { id: 'entity.set_input', sig: 'e:set_input(move_x, move_y, aim [, buttons])', doc: "Drives a scripted body the way a player's controller would: the two stick axes (−1 to 1), which way to aim (brads) and which buttons are held. It walks, jumps and collides by exactly the same rules as a player.", args: [
        { name: 'move_x', type: 'fx', doc: 'The stick\'s left–right axis, −1 to 1 (clamped).' },
        { name: 'move_y', type: 'fx', doc: 'The stick\'s forward–back axis, −1 to 1 (clamped). With first-person controls the axes are relative to the aim.' },
        { name: 'aim', type: 'integer (brad)', doc: 'Which way it faces.' },
        { name: 'buttons', type: 'integer', optional: true, doc: '`dnp.button` bits. Default 0.' }
      ], returns: 'nothing', where: 'level',
      notes: [
        "Refused (an error) for a player: their input comes from their device.",
        "A monster run by the monster runtime is driven by its brain, which will overwrite what you set.",
        "Half speed is `fx.frac(1, 2)` or `'0.5'`, not `0.5`: plain decimals are refused."
      ],
      example: `local d = target:pos() - dummy:pos()
dummy:set_input(0, 1, dnp.atan2(d.y, d.x), dnp.button.JUMP)`, see: ['entity.press', 'dnp.atan2', 'dnp.button.JUMP'] },
    { id: 'entity.press', sig: 'e:press(buttons)', doc: "Adds button bits to a scripted body's current input, leaving its movement and aim alone. One tick of ATTACK_PRIMARY starts a swing, which then runs by itself. Pair it with `e:release` next tick.", args: [{ name: 'buttons', type: 'integer', doc: '`dnp.button` bits.' }], returns: 'nothing', where: 'level',
      notes: ["Refused (an error) for a player."],
      example: `monster:press(dnp.button.ATTACK_PRIMARY)
-- next tick:
monster:release(dnp.button.ATTACK_PRIMARY)`, see: ['entity.release', 'entity.set_input'] },
    { id: 'entity.release', sig: 'e:release(buttons)', doc: "Clears button bits from a scripted body's current input. Without it a pressed button stays down, and the next swing never starts.", args: [{ name: 'buttons', type: 'integer', doc: '`dnp.button` bits.' }], returns: 'nothing', where: 'level',
      notes: ["Refused (an error) for a player."],
      example: `monster:release(dnp.button.ATTACK_PRIMARY)`, see: ['entity.press'] },
    { id: 'entity.despawn', sig: 'e:despawn() → boolean', doc: "Removes a scripted body from the world at once, along with its effects.", args: [], returns: 'true if removed; false when already gone', where: 'level',
      notes: ["Refused (an error) for a player."],
      example: `if dummy:valid() then dummy:despawn() end`, see: ['dnp.spawn_enemy', 'prop.despawn'] }
  ]
});

// ---------------------------------------------------------------- props
DNP_LUA_API.groups.push({
  id: 'prop', order: 150, title: 'Props (p:)',
  intro: "A prop is a placed thing: a key, a barrel, a lever, a projectile. It has no physics of its own and does not move unless you move it. Like entities, a prop handle can outlive the prop: reads return nil and writes do nothing. Unlike a body, every change to a prop happens at once.",
  entries: [
    { id: 'prop.valid', sig: 'p:valid() → boolean', doc: "Whether the prop still exists. A key someone picked up is gone; a handle you kept to it is not valid.", args: [], returns: 'boolean', where: 'both',
      example: `if key and key:valid() then print("still there") end`, see: ['prop.despawn'] },
    { id: 'prop.index', sig: 'p:index() → integer', doc: "The prop's index, for `dnp.prop(i)`. Answers even for a stale handle.", args: [], returns: 'integer', where: 'both',
      example: `local saved = key:index()
-- later
local again = dnp.prop(saved)`, see: ['dnp.prop'] },
    { id: 'prop.kind', sig: 'p:kind() → integer | nil', doc: "The prop's catalogue number.", args: [], returns: 'integer, or nil when stale', where: 'both',
      example: `if p:kind() == dnp.prop_kind("barrel") then print("barrel") end`, see: ['prop.name', 'dnp.prop_kind'] },
    { id: 'prop.name', sig: 'p:name() → string | nil', doc: "The prop's name in your module. Write behaviour per name rather than per number.", args: [], returns: 'string, or nil when stale', where: 'both',
      example: `function on_touch(e, p)
  if p:name() == "coin" then p:despawn() end
end`, see: ['prop.kind'] },
    { id: 'prop.pos', sig: 'p:pos() → vec3 | nil', doc: "Where the prop stands (the bottom centre), in this level's coordinates.", args: [], returns: 'vec3, or nil when stale', where: 'both',
      example: `dnp.sound("world.pickup", p:pos())`, see: ['prop.set_pos'] },
    { id: 'prop.set_pos', sig: 'p:set_pos(pos)', doc: "Moves the prop at once. This is how a projectile travels: move it a little every tick and check what it meets with `dnp.sweep_hit`.", args: [{ name: 'pos', type: 'vec3', doc: "The new position, in this level's coordinates." }], returns: 'nothing', where: 'level',
      example: `ball:set_pos(ball:pos() + vec3.new(0, fx.frac(1, 4), 0))`, see: ['dnp.sweep_hit', 'prop.set_facing'] },
    { id: 'prop.set_facing', sig: 'p:set_facing(angle)', doc: "Which way the prop points, in brads. Props face 0 until you set it; a missile with sprites for several angles needs this to look right in flight.", args: [{ name: 'angle', type: 'integer (brad)', doc: '4294967296 is a full turn.' }], returns: 'nothing', where: 'level',
      example: `rocket:set_facing(shooter:facing())`, see: ['entity.facing', 'dnp.atan2'] },
    { id: 'prop.solid', sig: 'p:solid() → boolean | nil', doc: "Whether bodies bump into the prop.", args: [], returns: 'boolean, or nil when stale', where: 'both',
      example: `print(gate:solid())`, see: ['prop.set_solid'] },
    { id: 'prop.set_solid', sig: 'p:set_solid(solid)', doc: "Makes the prop block bodies or let them through: a gate that opens when unlocked.", args: [{ name: 'solid', type: 'boolean', doc: 'true to block.' }], returns: 'nothing', where: 'both',
      example: `gate:set_solid(false)
gate:set_animation(1)`, see: ['prop.solid'] },
    { id: 'prop.set_animation', sig: 'p:set_animation(n)', doc: "Sets the prop's animation state number (a lever up or down, a chest open). Which frames that shows is up to the prop's art.", args: [{ name: 'n', type: 'integer', doc: '0 to 65535.' }], returns: 'nothing', where: 'both',
      example: `function on_prop_use(e, p)
  if p:name() == "lever" then p:set_animation(1) end
end`, see: ['entity.set_animation'] },
    { id: 'prop.despawn', sig: 'p:despawn() → boolean', doc: "Removes the prop at once. A second script touching the same prop in the same tick finds it gone, which is what a contested pickup wants.", args: [], returns: 'true if removed; false when already gone', where: 'both',
      example: `function on_touch(e, p)
  if p:name() == "key_red" and e:kind() == 0 then
    has_red[e:player()] = true
    p:despawn()
  end
end`, see: ['hook.on_touch', 'dnp.spawn_prop'] }
  ]
});

// ---------------------------------------------------------------- sectors
DNP_LUA_API.groups.push({
  id: 'sector', order: 160, title: 'Rooms (s:)',
  intro: "A sector is a room of the map: a floor, a ceiling and walls. Rooms never disappear, so a sector handle is always good. Doors, lifts and moving platforms are rooms that move: give them a motion with `s:move_parametric`.",
  entries: [
    { id: 'sector.index', sig: 's:index() → integer', doc: "The room's number in this level, as the map editor shows it. -1 for a room of another level in a shared world.", args: [], returns: 'integer', where: 'both',
      example: `dnp.set_sector_light(s:index(), 200)`, see: ['dnp.sector'] },
    { id: 'sector.tag', sig: 's:tag() → integer | nil', doc: "The room's tag from the map editor (0 when it has none). Tags are how a script finds 'the lift' without hard-coding a number.", args: [], returns: 'integer', where: 'both',
      example: `for _, s in ipairs(dnp.sectors()) do
  if s:tag() == 7 then lift = s end
end`, see: ['dnp.sectors'] },
    { id: 'sector.floor', sig: 's:floor() → fx | nil', doc: "The floor height.", args: [], returns: 'fx', where: 'both',
      example: `local depth = s:ceil() - s:floor()`, see: ['sector.ceil'] },
    { id: 'sector.ceil', sig: 's:ceil() → fx | nil', doc: "The ceiling height.", args: [], returns: 'fx', where: 'both',
      example: `if s:ceil() - s:floor() < fx.int(2) then print("too low to stand") end`, see: ['sector.floor'] },
    { id: 'sector.center', sig: 's:center() → vec3 | nil', doc: "The middle of the room's outline, at floor height. A room has no position of its own; this is where a door or a lift is heard from.", args: [], returns: 'vec3', where: 'both',
      example: `dnp.sound("world.door.open", s:center())`, see: ['dnp.sound'] },
    { id: 'sector.neighbors', sig: 's:neighbors() → { sector, … }', doc: "The rooms that share a wall with this one, each once, in ascending number.", args: [], returns: 'a list of sectors', where: 'both',
      example: `local lowest = s:floor()
for _, n in ipairs(s:neighbors()) do
  if n:floor() < lowest then lowest = n:floor() end
end`, see: ['dnp.side'] },
    { id: 'sector.move_parametric', sig: "s:move_parametric(from, to, ticks [, loop [, part [, spin [, pivot]]]]) → boolean", doc: "Moves a room smoothly from offset `from` to offset `to` over `ticks`, starting now. Offsets are relative to where the room was drawn in the map, so `vec3.new(0, 0, 4)` is four units up. Every player's device computes the motion itself, so it is smooth and costs nothing to send.\n\n`loop` is `'once'` (default), `'loop'` or `'pingpong'`. `part` is `'both'` (default: the whole room moves), `'floor'` or `'ceiling'`. `spin` turns the room by that many degrees over the same time, around `pivot` (default: the middle of its corners), counted from where it is now.", args: [
        { name: 'from', type: 'vec3', doc: 'Start offset.' },
        { name: 'to', type: 'vec3', doc: 'End offset.' },
        { name: 'ticks', type: 'integer', doc: 'Duration (60 = one second).' },
        { name: 'loop', type: 'string', optional: true, doc: "'once', 'loop' or 'pingpong'." },
        { name: 'part', type: 'string', optional: true, doc: "'both', 'floor' or 'ceiling'." },
        { name: 'spin', type: 'fx', optional: true, doc: 'Degrees to turn.' },
        { name: 'pivot', type: 'vec3', optional: true, doc: 'What to turn around.' }
      ], returns: 'true if started; false when too many rooms are moving (512)', where: 'level',
      notes: ["Anything else for `loop` or `part` is an error."],
      example: `-- a door: the ceiling rises 4 units in one second
door:move_parametric(vec3.new(0, 0, 0), vec3.new(0, 0, 4), 60, "once", "ceiling")
-- a platform that slides back and forth forever
plat:move_parametric(vec3.new(0, 0, 0), vec3.new(8, 0, 0), 180, "pingpong")`, see: ['sector.offset', 'sector.set_offset', 'hook.on_crush'] },
    { id: 'sector.offset', sig: 's:offset() → vec3 | nil', doc: "How far the room currently is from where it was drawn. nil for a room that has never been moved.", args: [], returns: 'vec3, or nil', where: 'both',
      example: `local off = door:offset()
local is_open = off ~= nil and off.z > fx.int(0)`, see: ['sector.move_parametric'] },
    { id: 'sector.set_offset', sig: 's:set_offset(v) → boolean', doc: "Puts the room at offset `v` this tick, for motion no formula describes (a platform that follows a player, say). Queued until the world steps.", args: [{ name: 'v', type: 'vec3', doc: 'The offset from where it was drawn.' }], returns: 'true if queued', where: 'level',
      notes: ["Unlike move_parametric, this is sent to every player every tick it changes: prefer move_parametric whenever the motion can be described in advance."],
      example: `local t = dnp.tick() % 240
plat:set_offset(vec3.new(0, 0, fx.frac(t, 60)))`, see: ['sector.move_parametric'] }
  ]
});

// ---------------------------------------------------------------- fx
DNP_LUA_API.groups.push({
  id: 'fx', order: 170, title: 'fx — fixed-point numbers',
  intro: "Positions, speeds and distances in the game are exact fixed-point numbers (fx), so every machine computes exactly the same thing. Whole numbers convert by themselves; a decimal like 0.5 does not, because a Lua decimal is not exact. Write it as `fx.frac(1, 2)` or `fx.parse('0.5')`, or pass the string `'0.5'` wherever an fx is expected.",
  entries: [
    { id: 'fx.int', sig: 'fx.int(n) → fx', doc: "A whole number as an fx.", args: [{ name: 'n', type: 'integer', doc: 'A whole number.' }], returns: 'fx', where: 'both',
      notes: ["`fx.int(8.5)` is an error, not a rounding."],
      example: `local floor_limit = fx.int(-50)`, see: ['fx.frac', 'fx.parse'] },
    { id: 'fx.frac', sig: 'fx.frac(n, d) → fx', doc: "The fraction n / d, as exactly as fx can hold it.", args: [
        { name: 'n', type: 'integer', doc: 'Numerator.' },
        { name: 'd', type: 'integer', doc: 'Denominator; 0 is an error.' }
      ], returns: 'fx', where: 'both',
      example: `local quarter = fx.frac(1, 4)`, see: ['fx.parse'] },
    { id: 'fx.parse', sig: 'fx.parse(text) → fx', doc: "A decimal written as text, exactly: `fx.parse('8.25')`. No exponents, at most nine digits after the point.", args: [{ name: 'text', type: 'string', doc: "e.g. '-1.5'." }], returns: 'fx', where: 'both',
      example: `local half = fx.parse("0.5")`, see: ['fx.frac'] },
    { id: 'fx.approx', sig: 'fx.approx(n) → fx', doc: "The nearest fx to an ordinary Lua number. The one conversion that rounds; use it when the value came from a calculation in plain Lua numbers and a tiny rounding is fine.", args: [{ name: 'n', type: 'number', doc: 'Any number.' }], returns: 'fx', where: 'both',
      example: `local angle_fx = fx.approx(math.sin(t) * 3)`, see: ['fx.int'] },
    { id: 'fx.raw', sig: 'fx.raw(text) → fx', doc: "An fx from its raw internal integer, written as text (the inverse of `.raw`). For storing a value exactly and reading it back.", args: [{ name: 'text', type: 'string', doc: 'A whole number as text.' }], returns: 'fx', where: 'both',
      example: `local s = v.raw          -- a string
local back = fx.raw(s)   -- the same value`, see: ['fx.operators'] },
    { id: 'fx.operators', sig: 'a + b   a - b   a * b   a / b   -a   a == b   a < b   a <= b   x.int   x.raw   tostring(x)',
      doc: "fx values do arithmetic with `+ - * /` and unary minus; the other side may be an fx, a whole number or a decimal string. Comparisons `< <= > >=` and `==` work between two fx values.\n\n`x.int` is the whole part (rounded down, a plain Lua number). `x.raw` is the exact internal value as a string. `tostring(x)` prints six decimals.",
      args: [], returns: 'fx (arithmetic), boolean (comparisons)', where: 'both',
      notes: [
        "Passing a non-whole Lua number where an fx is expected is an error: 'expected fx, got the non-integral number 0.500000'. Use fx.frac, fx.parse, a string, or fx.approx.",
        "Comparing an fx with a plain number (`x < 3`) is an error, and `x == 3` is always false. Compare with `fx.int(3)`, or compare `x.int`.",
        "Division by zero is an error."
      ],
      example: `local speed = e:param("move_speed") * 2          -- fine
local half  = e:param("move_speed") / 2          -- fine
local slow  = e:param("move_speed") * "0.75"     -- a decimal as a string
if e:pos().z < fx.int(0) then print("below zero") end
print(e:pos().z.int, tostring(e:pos().z))`, see: ['fx.int', 'vec3.fields'] }
  ]
});

// ---------------------------------------------------------------- vec3
DNP_LUA_API.groups.push({
  id: 'vec3', order: 180, title: 'vec3',
  intro: "A point or a direction: three fx values, x and y across the ground and z up.",
  entries: [
    { id: 'vec3.new', sig: 'vec3.new(x, y, z) → vec3', doc: "A new vector. Each part is anything an fx accepts: an fx, a whole number, or a decimal string.", args: [
        { name: 'x', type: 'fx', doc: 'Across.' },
        { name: 'y', type: 'fx', doc: 'Across.' },
        { name: 'z', type: 'fx', doc: 'Up.' }
      ], returns: 'vec3', where: 'both',
      example: `local up = vec3.new(0, 0, "1.5")
local spot = vec3.new(12, fx.frac(7, 2), 0)`, see: ['vec3.fields'] },
    { id: 'vec3.fields', sig: 'v.x  v.y  v.z   a + b   a - b   -v   a == b   tostring(v)',
      doc: "Read a part with `.x`, `.y`, `.z` (each an fx). Vectors add, subtract, negate and compare with `==`. There is no multiplication of a whole vector: scale each part and build a new one.",
      args: [], returns: 'fx (fields), vec3 (arithmetic)', where: 'both',
      notes: ["Vectors cannot be changed in place: `v.x = 1` is an error. Make a new one with vec3.new."],
      example: `local d = target:pos() - e:pos()
local dist = dnp.length(d)
local dir = dnp.dir(dnp.atan2(d.y, d.x))
local step = vec3.new(dir.x * 2, dir.y * 2, 0)   -- two units toward the target
print(tostring(e:pos() + step))`, see: ['vec3.new', 'dnp.length', 'fx.operators'] }
  ]
});

// ---------------------------------------------------------------- not for authors
DNP_LUA_API.internal.push(
  // The monster runtime's link to its native loop; reach monsters through mobs.*.
  'dnp.mobs_compile', 'dnp.mobs_graph', 'dnp.mobs_tick', 'dnp.mobs_reset', 'dnp.mobs_stats', 'dnp.mobs_runs_in',
  'dnp.mob_track', 'dnp.mob_untrack', 'dnp.mob_enter', 'dnp.mob_state', 'dnp.mob_set', 'dnp.mob_var',
  // The weapon machine's link to weapons.lua; use weapons.* instead.
  'dnp.weapons_compile', 'dnp.weapon_sync', 'dnp.weapon_step', 'dnp.weapon_state', 'dnp.weapon_reset', 'dnp.weapon_autoaim'
);
DNP_LUA_API.extra.push('fx.operators', 'vec3.fields');

// ---- Engine 0.2.0 ----
// Where saves resume a monster (state, elapsed, sequence position): mobs.lua's.
DNP_LUA_API.internal.push('dnp.mob_resume_point');
(function () {
  var g = function (id) { return DNP_LUA_API.groups.filter(function (x) { return x.id === id; })[0]; };
  g('dnp-geometry').entries.push({
    id: 'dnp.place', sig: 'dnp.place(pos, radius, height[, ignore]) → vec3, sector | nil', where: 'both',
    doc: 'Where a body of this size could stand at `pos`: on the floor under it, with the headroom it needs, no wall within its radius and no other solid body overlapping it. Returns that spot, on the floor, and its room number; or `nil` when it does not fit.\n\n`pos.z` picks the floor where two overlap (a bridge over a path). Use it before you `teleport` something, so nothing lands inside a wall, under a low ceiling or inside a player.',
    args: [
      { name: 'pos', type: 'vec3', doc: 'where you would like it to stand' },
      { name: 'radius', type: 'fx', doc: 'the body\'s radius' },
      { name: 'height', type: 'fx', doc: 'the body\'s height' },
      { name: 'ignore', type: 'entity', optional: true, doc: 'a body not to count, usually the one being moved' }
    ],
    returns: 'the spot (a vec3 on the floor) and its room number, or nil',
    notes: ['It says whether a body fits, not whether it can walk anywhere from there: ask `dnp.find_path` for that.'],
    example: 'local spot = dnp.place(vec3.new(12, 4, 0), fx.frac(1, 2), 2, e)\nif spot then e:teleport(spot) end',
    see: ['entity.teleport', 'dnp.find_path', 'dnp.sweep']
  });
  g('entity').entries.push({
    id: 'entity.input_tick', sig: 'e:input_tick() → integer | nil', where: 'both',
    doc: 'Which of this player\'s inputs the step about to run uses, or `nil` for a body nobody plays. It is the player\'s own clock: on a tick the server runs without fresh input from them, it stays where it was.\n\nTime something a player\'s own client predicts by it (their rocket\'s shove, say), not by `dnp.tick()`, so the server and their client agree on when it happens.',
    returns: 'integer, or nil for a body nobody plays',
    see: ['dnp.tick', 'entity.player']
  });
  g('fx').entries.push({
    id: 'fx.sqrt', sig: 'fx.sqrt(x) → fx', where: 'both',
    doc: 'The square root of `x`, computed the same on every device. A negative `x` gives 0.\n\nUse it instead of `math.sqrt` for anything that changes the game, such as a distance or an aim, so every player\'s device gets the same answer.',
    args: [{ name: 'x', type: 'fx' }],
    returns: 'fx',
    example: 'local d = e:pos() - target:pos()\nlocal dist = fx.sqrt(d.x * d.x + d.y * d.y)',
    see: ['dnp.length', 'fx.operators']
  });
})();
