// lua-playground: run a level script in the browser against a toy level that
// answers to the engine's own names (dnp.*, fx, vec3, mobs, triggers, graphs).
//
// The VM is fengari (Lua 5.3 in JS, MIT), loaded the first time a reader runs
// something. The engine runs LuaJIT (Lua 5.1); the playground smooths the most
// visible differences (unpack, 5.0 printed as 5) and otherwise stays out of it.
//
// What it keeps from the engine (engine/server/src/lua/*, main.cpp):
//  - hooks are harvested after the chunk runs; a tick is
//      on_tick -> flush -> world step (tick + 1, touches) -> on_post_tick -> flush;
//  - reads are immediate, writes (teleport, add_impulse, set_velocity,
//    change_map, set_offset) wait for the next flush;
//  - 2,000,000 instructions per callback, 8,000,000 per tick, re-armed at 1 once
//    blown so a pcall cannot swallow it;
//  - "[lua] <hook> error (tick N): msg", rate-limited for the per-tick hooks
//    (the first 3, then one every 300 ticks);
//  - fx is Q32.32 and refuses a non-integral double; vec3 holds three fx.
// The toy world is the arena: sectors 0 hub, 1 north, 2 east, 3 lift (tag 7).
//
// Markup:
//   <div class="widget" data-widget="lua-playground" data-title="…" data-code="ID"
//        [data-ticks="N"] [data-events="use,cross,touch,attack,enter"]></div>
//   <script type="text/plain" id="ID"> …lua… </script>
(function () {
  window.DNPW = window.DNPW || {};

  // Where the vendor folder is: next to this script's folder.
  const SELF = (document.currentScript && document.currentScript.src) ||
    ([...document.querySelectorAll('script[src]')].map((s) => s.src).find((s) => /widgets\/lua-playground\.js/.test(s)) || '');
  const VENDOR = SELF ? SELF.replace(/widgets\/[^/]*$/, 'vendor/fengari-web.js') : '../assets/vendor/fengari-web.js';
  let fengariP = null;
  function loadFengari() {
    if (window.fengari) return Promise.resolve(window.fengari);
    return fengariP || (fengariP = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = VENDOR;
      s.onload = () => window.fengari ? ok(window.fengari) : no(new Error('fengari did not load'));
      s.onerror = () => { fengariP = null; no(new Error('could not load ' + VENDOR)); };
      document.head.append(s);
    }));
  }

  // ---------------------------------------------------------------- the arena
  const WORLD = {
    sectors: [
      { name: 'hub', tag: 0, x0: 0, y0: 0, x1: 256, y1: 256, floor: 0, ceil: 128, light: 160, tex_floor: 'FLOOR4_8', tex_ceil: 'CEIL3_5', nb: [1, 2] },
      { name: 'north', tag: 1, x0: 0, y0: 256, x1: 256, y1: 416, floor: 0, ceil: 160, light: 112, tex_floor: 'FLAT14', tex_ceil: 'CEIL1_1', nb: [0, 3] },
      { name: 'east', tag: 2, x0: 256, y0: 0, x1: 416, y1: 256, floor: 16, ceil: 144, light: 200, tex_floor: 'GRASS1', tex_ceil: 'F_SKY1', nb: [0, 3] },
      { name: 'lift', tag: 7, x0: 256, y0: 256, x1: 416, y1: 416, floor: 0, ceil: 128, light: 144, tex_floor: 'STEP2', tex_ceil: 'CEIL5_1', nb: [1, 2] },
    ],
    // The side "player crosses side 3" crosses: hub | north.
    side3: { x0: 0, y0: 256, x1: 256, y1: 256 },
    props: [
      { name: 'lever', x: 28, y: 132, z: 0, solid: false, usable: true },
      { name: 'crate', x: 352, y: 88, z: 16, solid: true },
      { name: 'plate', x: 128, y: 344, z: 0, solid: false },
      { name: 'shopkeeper', x: 200, y: 48, z: 0, solid: true, usable: true },
    ],
    // The prop catalogue, kind = position + 1. Monsters are props too.
    catalog: ['lever', 'crate', 'plate', 'shopkeeper', 'barrel', 'medkit', 'key_red', 'torch', 'zombieman', 'imp', 'demon', 'cacodemon'],
    solid: { crate: true, shopkeeper: true, barrel: true },
    mobs: { zombieman: 20, imp: 60, demon: 150, cacodemon: 400 },
    spawns: { start: [128, 128, 0], north: [128, 376, 0], east: [336, 176, 16], lift: [336, 336, 0] },
  };

  function toLua(v) {
    if (v === null || v === undefined) return 'nil';
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (typeof v === 'string') return JSON.stringify(v);
    if (Array.isArray(v)) return '{' + v.map(toLua).join(',') + '}';
    return '{' + Object.entries(v).map(([k, x]) => '[' + JSON.stringify(k) + ']=' + toLua(x)).join(',') + '}';
  }

  // ------------------------------------------------------------------ prelude
  // Runs before the reader's chunk, in the same VM. Builds dnp, fx, vec3, mobs,
  // triggers and graphs over a world table, and exposes __pg for the widget.
  const PRELUDE = String.raw`
local LOG, RAND, STORE_SET, STORE_GET = __pg_log, __pg_rand, __pg_store_set, __pg_store_get
__pg_log, __pg_rand, __pg_store_set, __pg_store_get = nil, nil, nil, nil
local W0 = @@WORLD@@
local getinfo = debug.getinfo
local type, tostring0, setmetatable, rawget, pairs, ipairs, select, error, next =
      type, tostring, setmetatable, rawget, pairs, ipairs, select, error, next
local floor, abs, huge, mtype = math.floor, math.abs, math.huge, math.type
local fmt, concat = string.format, table.concat
local TWO32 = 4294967296.0
local SRC = '@playground.lua'

-- The engine's sandbox (vm.cpp) and Lua 5.1 names the examples may use.
collectgarbage = nil
io, package, require, dofile, loadfile = nil, nil, nil, nil, nil
os = { time = os.time, clock = os.clock, date = os.date }
debug.sethook = nil
unpack = unpack or table.unpack
loadstring = loadstring or load
math.pow = math.pow or function(a, b) return a ^ b end
math.mod = math.mod or math.fmod
table.getn = table.getn or function(t) return #t end

-- An error at the reader's own line, like luaL_error from a C binding.
local function where()
  for lvl = 2, 60 do
    local info = getinfo(lvl, 'Sl')
    if not info then break end
    if info.source == SRC and info.currentline and info.currentline > 0 then
      return 'playground.lua:' .. info.currentline .. ': '
    end
  end
  return ''
end
local function fail(msg) error(where() .. msg, 0) end
local function notin(name)
  return function() fail('not in the playground: ' .. name .. ' (the engine has it — see the reference)') end
end
local function with_missing(t, prefix, names)
  local real = {}
  for _, n in ipairs(names) do real[n] = true end
  return setmetatable(t, { __index = function(_, k) if real[k] then return notin(prefix .. k) end end })
end

-- 5.1 prints an integral number without ".0"; so does the playground.
local function tostr(v)
  if mtype(v) == 'float' and abs(v) < 2^53 and v == floor(v) then return fmt('%.0f', v) end
  return tostring0(v)
end
tostring = tostr

local W   -- the world, built by reset()

print = function(...)
  local n, t = select('#', ...), {}
  for i = 1, n do t[i] = tostr((select(i, ...))) end
  LOG('print', W.tick, concat(t, '\t'))
end
local function api(text) LOG('api', W.tick, text) end
local function note(text) LOG('note', W.tick, text) end

-- ----------------------------------------------------------------- fx, vec3
local FXK, VK, HK = {}, {}, {}
local FX = { __metatable = 'locked' }
local V3 = { __metatable = 'locked' }
local function mkfx(raw) return setmetatable({ [FXK] = raw + 0.0 }, FX) end
local function fxraw(v) return type(v) == 'table' and rawget(v, FXK) or nil end
local function v3of(v) return type(v) == 'table' and rawget(v, VK) or nil end
local function tname(v)
  if type(v) == 'table' and (rawget(v, FXK) or rawget(v, VK) or rawget(v, HK)) then return 'userdata' end
  return type(v)
end
local function trunc(x) if x >= 0 then return floor(x) else return -floor(-x) end end

local function parse_dec(s)
  local sign, whole, dot, frac = s:match('^([+-]?)(%d*)(%.?)(%d*)$')
  if not sign or (whole == '' and frac == '') or #frac > 10 then return nil end
  local w = tonumber(whole ~= '' and whole or '0')
  if w > 2000000000 then return nil end
  local raw = w * TWO32
  if frac ~= '' then raw = raw + floor(tonumber(frac) * TWO32 / 10 ^ #frac) end
  if sign == '-' then raw = -raw end
  return raw
end

local function check_fx(v)
  local r = fxraw(v)
  if r then return r end
  if type(v) == 'string' then
    r = parse_dec(v)
    if r then return r end
    fail("expected fx, got the string '" .. v .. "' which is not an exact decimal")
  end
  if type(v) == 'number' then
    if abs(v) <= 2147483647 and v == floor(v) then return v * TWO32 end
    fail(fmt('expected fx, got the non-integral number %f. Doubles are not exact in Q32.32 -- use fx.frac(n, d), fx.parse("%f"), or fx.approx(...) if you accept the rounding', v, v))
  end
  fail('expected fx, got ' .. tname(v))
end
local function num(v, what)
  if type(v) ~= 'number' then
    local n = type(v) == 'string' and tonumber(v)
    if n then return n end
    fail('bad argument to ' .. what .. ' (number expected, got ' .. (v == nil and 'no value' or tname(v)) .. ')')
  end
  return v
end
local function str(v, what)
  if type(v) == 'number' then return tostr(v) end
  if type(v) ~= 'string' then fail('bad argument to ' .. what .. ' (string expected, got ' .. (v == nil and 'no value' or tname(v)) .. ')') end
  return v
end

FX.__add = function(a, b) return mkfx(check_fx(a) + check_fx(b)) end
FX.__sub = function(a, b) return mkfx(check_fx(a) - check_fx(b)) end
FX.__mul = function(a, b) return mkfx(floor(check_fx(a) * check_fx(b) / TWO32)) end
FX.__div = function(a, b)
  local x, y = check_fx(a), check_fx(b)
  if y == 0 then fail('fx division by zero') end
  return mkfx(trunc(x * TWO32 / y))
end
FX.__unm = function(a) return mkfx(-check_fx(a)) end
FX.__eq = function(a, b) return check_fx(a) == check_fx(b) end
FX.__lt = function(a, b) return check_fx(a) < check_fx(b) end
FX.__le = function(a, b) return check_fx(a) <= check_fx(b) end
local function fxstr(raw)
  local neg = raw < 0
  local mag = neg and -raw or raw
  local whole = floor(mag / TWO32)
  local frac = mag - whole * TWO32
  return fmt('%s%.0f.%06d', neg and '-' or '', whole, floor(frac * 1000000 / TWO32))
end
FX.__tostring = function(a) return fxstr(rawget(a, FXK)) end
FX.__index = function(a, k)
  local r = rawget(a, FXK)
  if k == 'raw' then return fmt('%.0f', r) end
  if k == 'int' then return floor(r / TWO32) end
  fail("fx has no field '" .. tostr(k) .. "'")
end
FX.__newindex = function() fail('attempt to index a userdata value (an fx)') end

fx = {
  int = function(n)
    n = num(n, "'int'")
    if n ~= floor(n) or abs(n) > 2147483647 then
      fail(fmt('fx.int(%f): not an exact integer in range; use fx.frac(n, d) or fx.parse("...")', n))
    end
    return mkfx(n * TWO32)
  end,
  frac = function(n, d)
    n, d = num(n, "'frac'"), num(d, "'frac'")
    if n ~= floor(n) or d ~= floor(d) then fail(fmt('fx.frac(%f, %f): both parts must be integers', n, d)) end
    if d == 0 then fail('fx.frac: division by zero') end
    return mkfx(trunc(n * TWO32 / d))
  end,
  parse = function(s)
    s = str(s, "'parse'")
    local r = parse_dec(s)
    if not r then fail("fx.parse('" .. s .. "'): not an exact decimal") end
    return mkfx(r)
  end,
  raw = function(s)
    s = str(s, "'raw'")
    if not s:match('^[+-]?%d+$') then fail("fx.raw('" .. s .. "'): not an integer") end
    return mkfx(tonumber(s) + 0.0)
  end,
  approx = function(n)
    n = num(n, "'approx'")
    return mkfx(trunc(n * TWO32))
  end,
}

local function mkv(x, y, z) return setmetatable({ [VK] = { x + 0.0, y + 0.0, z + 0.0 } }, V3) end
local function check_v3(v)
  local r = v3of(v)
  if not r then fail('expected vec3, got ' .. (v == nil and 'nil' or tname(v))) end
  return r
end
local function vunits(v) local r = check_v3(v) return r[1] / TWO32, r[2] / TWO32, r[3] / TWO32 end
local function vat(x, y, z) return mkv(x * TWO32, y * TWO32, z * TWO32) end
V3.__add = function(a, b) local p, q = check_v3(a), check_v3(b) return mkv(p[1] + q[1], p[2] + q[2], p[3] + q[3]) end
V3.__sub = function(a, b) local p, q = check_v3(a), check_v3(b) return mkv(p[1] - q[1], p[2] - q[2], p[3] - q[3]) end
V3.__unm = function(a) local p = check_v3(a) return mkv(-p[1], -p[2], -p[3]) end
V3.__eq = function(a, b) local p, q = check_v3(a), check_v3(b) return p[1] == q[1] and p[2] == q[2] and p[3] == q[3] end
V3.__index = function(a, k)
  local p = rawget(a, VK)
  if k == 'x' then return mkfx(p[1]) elseif k == 'y' then return mkfx(p[2]) elseif k == 'z' then return mkfx(p[3]) end
  fail("vec3 has no field '" .. tostr(k) .. "'")
end
V3.__newindex = function() fail('attempt to index a userdata value (a vec3)') end
V3.__tostring = function(a) local p = rawget(a, VK) return '(' .. fxstr(p[1]) .. ', ' .. fxstr(p[2]) .. ', ' .. fxstr(p[3]) .. ')' end
vec3 = { new = function(x, y, z) return mkv(check_fx(x), check_fx(y), check_fx(z)) end }

local function short(n) if n == floor(n) then return fmt('%d', n) end return fmt('%.2f', n) end
local function vtext(x, y, z) return '(' .. short(x) .. ', ' .. short(y) .. ', ' .. short(z) .. ')' end

-- ------------------------------------------------------------------- world
local function sector_at(x, y)
  for i = 0, #W.sectors do
    local s = W.sectors[i]
    if s and x >= s.x0 and x < s.x1 and y >= s.y0 and y < s.y1 then return i end
  end
  return -1
end

local function reset(players)
  W = { tick = 0, sectors = {}, agents = {}, props = {}, panels = {}, ui_seq = 0, hud = {},
        queue = {}, persist = {}, persist_player = {}, counters = {},
        properties = {}, screen = { fade = 0, fade_ms = 0, letterbox = 0, letterbox_ms = 0 },
        next_agent = 32, next_prop = 2048, restoring = false, noted = {} }
  for i, s in ipairs(W0.sectors) do
    W.sectors[i - 1] = { i = i - 1, name = s.name, tag = s.tag, x0 = s.x0, y0 = s.y0, x1 = s.x1, y1 = s.y1,
      floor = s.floor, ceil = s.ceil, light = s.light, fade = nil, tex_floor = s.tex_floor, tex_ceil = s.tex_ceil,
      effects = {}, nb = s.nb, motion = nil }
  end
  for _, p in ipairs(W0.props) do
    local kind
    for k, n in ipairs(W0.catalog) do if n == p.name then kind = k end end
    W.props[W.next_prop] = { idx = W.next_prop, gen = 1, active = true, kind = kind, name = p.name,
      x = p.x, y = p.y, z = p.z, solid = p.solid, usable = p.usable or false, anim = 0, facing = 0 }
    W.next_prop = W.next_prop + 1
  end
  for i = 1, (players or 1) do
    local st = W0.spawns.start
    W.agents[i - 1] = { idx = i - 1, gen = 1, active = true, kind = 0, player = i, x = st[1] + 24 * (i - 1), y = st[2], z = st[3],
      vx = 0, vy = 0, vz = 0, hp = 100, facing = 0, anim = 0, solid = true, avatar = 0, buttons = 0 }
  end
end

local ENT, PROP, SEC = { __metatable = 'locked' }, { __metatable = 'locked' }, { __metatable = 'locked' }
local function ehandle(idx, gen) return setmetatable({ [HK] = { t = 'e', idx = idx, gen = gen } }, ENT) end
local function phandle(idx, gen) return setmetatable({ [HK] = { t = 'p', idx = idx, gen = gen } }, PROP) end
local function shandle(i) return setmetatable({ [HK] = { t = 's', i = i } }, SEC) end
local function hof(v, t) local h = type(v) == 'table' and rawget(v, HK) return h and h.t == t and h or nil end
local function entity_of(a) return ehandle(a.idx, a.gen) end

local function check_e(v, what)
  local h = hof(v, 'e')
  if not h then fail('bad argument to ' .. what .. ' (an entity expected, got ' .. (v == nil and 'nil' or tname(v)) .. ')') end
  local a = W.agents[h.idx]
  if a and a.active and a.gen == h.gen then return a end
  return nil
end
local function check_p(v, what)
  local h = hof(v, 'p')
  if not h then fail('bad argument to ' .. what .. ' (a prop expected, got ' .. (v == nil and 'nil' or tname(v)) .. ')') end
  local p = W.props[h.idx]
  if p and p.active and p.gen == h.gen then return p end
  return nil
end
local function sector_arg(v, what)
  local h = hof(v, 's')
  local i = h and h.i or num(v, what)
  if not W.sectors[i] then fail(what .. ': no sector ' .. tostr(i) .. ' (the arena has 0..3)') end
  return W.sectors[i]
end
local function who(a)
  if a.kind == 0 then return 'player ' .. a.player end
  return (a.name or 'entity') .. ' (entity ' .. a.idx .. ')'
end

local function queue(item) W.queue[#W.queue + 1] = item end

-- ----------------------------------------------------------------- entities
local EM = {}
function EM.valid(self) return check_e(self, "'valid'") ~= nil end
function EM.pos(self) local a = check_e(self, "'pos'") return a and vat(a.x, a.y, a.z) end
function EM.vel(self) local a = check_e(self, "'vel'") return a and vat(a.vx, a.vy, a.vz) end
function EM.grounded(self) return check_e(self, "'grounded'") ~= nil end
function EM.jumps(self) local a = check_e(self, "'jumps'") return a and 0 end
function EM.pitch(self) local a = check_e(self, "'pitch'") return a and mkfx(0) end
function EM.sector(self) local a = check_e(self, "'sector'") return a and sector_at(a.x, a.y) end
function EM.index(self) local a = check_e(self, "'index'") return a and a.idx end
function EM.player(self) local a = check_e(self, "'player'") return a and a.player end
function EM.kind(self) local a = check_e(self, "'kind'") return a and a.kind end
function EM.name(self) local a = check_e(self, "'name'") return a and a.name end
function EM.facing(self) local a = check_e(self, "'facing'") return a and a.facing end
function EM.buttons(self) local a = check_e(self, "'buttons'") return a and a.buttons end
function EM.actions(self) local a = check_e(self, "'actions'") return a and 0 end
function EM.hp(self)
  local a = check_e(self, "'hp'")
  if not a then return nil end
  if a.mob then return a.mob.hp end
  return a.hp
end
function EM.set_hp(self, n)
  local a = check_e(self, "'set_hp'")
  n = num(n, "'set_hp'")
  if a then a.hp = trunc(n) if a.mob then a.mob.hp = trunc(n) end end
end
function EM.solid(self) local a = check_e(self, "'solid'") if a then return a.solid end end
function EM.set_solid(self, b) local a = check_e(self, "'set_solid'") if a then a.solid = not not b end end
function EM.avatar(self) local a = check_e(self, "'avatar'") if a and a.kind == 0 then return a.avatar end end
function EM.set_avatar(self, n)
  local a = check_e(self, "'set_avatar'")
  n = num(n, "'set_avatar'")
  if n < 0 or n > 65535 then fail(fmt('set_avatar: %f is not an avatar number (0..65535)', n)) end
  if a then a.avatar = trunc(n) end
end
function EM.set_animation(self, n)
  local a = check_e(self, "'set_animation'")
  n = trunc(num(n, "'set_animation'"))
  if n < 0 or n > 65535 then fail(fmt('animation state %d is out of range', n)) end
  if a then a.anim = n end
end
function EM.teleport(self, v)
  local a = check_e(self, "'teleport'")
  local x, y, z = vunits(v)
  if not a then return end
  queue({ what = 'teleport', a = a, gen = a.gen, x = x, y = y, z = z })
  api(who(a) .. ':teleport ' .. vtext(x, y, z) .. ' — queued, applies at the next flush')
end
function EM.add_impulse(self, v)
  local a = check_e(self, "'add_impulse'")
  local x, y, z = vunits(v)
  if not a then return end
  queue({ what = 'impulse', a = a, gen = a.gen, x = x, y = y, z = z })
  api(who(a) .. ':add_impulse ' .. vtext(x, y, z) .. ' — queued')
end
function EM.set_velocity(self, v)
  local a = check_e(self, "'set_velocity'")
  local x, y, z = vunits(v)
  if not a then return end
  queue({ what = 'velocity', a = a, gen = a.gen, x = x, y = y, z = z })
  api(who(a) .. ':set_velocity ' .. vtext(x, y, z) .. ' — queued')
end
function EM.change_map(self, level, tag)
  local a = check_e(self, "'change_map'")
  if not a then return false end
  if level ~= nil then level = num(level, "'change_map'") end
  if tag ~= nil then tag = str(tag, "'change_map'") end
  queue({ what = 'change_map', a = a, gen = a.gen, level = level, tag = tag })
  api(who(a) .. ':change_map(' .. (level and tostr(level) or 'next') .. (tag and (', "' .. tag .. '"') or '') .. ') — queued')
  return true
end
function EM.despawn(self)
  local a = check_e(self, "'despawn'")
  if a and a.kind == 0 then fail('despawn: a player is not a scripted agent') end
  if a then a.active = false a.gen = a.gen + 1 end
end
for _, n in ipairs({ 'param', 'base_param', 'add_effect', 'remove_effect', 'set_input', 'press', 'release', 'set_body_param', 'swing', 'set_trail',
    'effect_sectors', 'layer', 'set_layer', 'set_anim', 'movement_state', 'ask_movement_state', 'meter', 'set_meter', 'start_move',
    'set_movement_state_enabled', 'set_move_enabled', 'movement_state_enabled', 'move_enabled' }) do
  EM[n] = notin('e:' .. n)
end
ENT.__index = function(_, k) return EM[k] end
ENT.__eq = function(a, b) local p, q = hof(a, 'e'), hof(b, 'e') return p and q and p.idx == q.idx and p.gen == q.gen or false end
ENT.__tostring = function(a) local h = rawget(a, HK) return fmt('entity(%d, gen %d)', h.idx, h.gen) end
ENT.__newindex = function() fail('attempt to index a userdata value (an entity)') end

-- -------------------------------------------------------------------- props
local PM = {}
function PM.valid(self) return check_p(self, "'valid'") ~= nil end
function PM.index(self) local h = hof(self, 'p') if not h then fail("bad argument to 'index' (a prop expected)") end return h.idx end
function PM.kind(self) local p = check_p(self, "'kind'") return p and p.kind end
function PM.name(self) local p = check_p(self, "'name'") return p and p.name end
function PM.solid(self) local p = check_p(self, "'solid'") if p then return p.solid end end
function PM.set_solid(self, b) local p = check_p(self, "'set_solid'") if p then p.solid = not not b end end
function PM.pos(self) local p = check_p(self, "'pos'") return p and vat(p.x, p.y, p.z) end
function PM.set_pos(self, v)
  local p = check_p(self, "'set_pos'")
  local x, y, z = vunits(v)
  if p then p.x, p.y, p.z = x, y, z end
end
function PM.set_facing(self, n) local p = check_p(self, "'set_facing'") n = num(n, "'set_facing'") if p then p.facing = n end end
function PM.set_animation(self, n)
  local p = check_p(self, "'set_animation'")
  n = trunc(num(n, "'set_animation'"))
  if n < 0 or n > 65535 then fail(fmt('animation state %d is out of range', n)) end
  if p then p.anim = n end
end
function PM.despawn(self)
  local p = check_p(self, "'despawn'")
  if not p then return false end
  p.active = false
  p.gen = p.gen + 1
  return true
end
PM.set_trail = notin('p:set_trail')
PROP.__index = function(_, k) return PM[k] end
PROP.__eq = function(a, b) local p, q = hof(a, 'p'), hof(b, 'p') return p and q and p.idx == q.idx and p.gen == q.gen or false end
PROP.__tostring = function(a) return fmt('prop(%d)', rawget(a, HK).idx) end
PROP.__newindex = function() fail('attempt to index a userdata value (a prop)') end

-- ------------------------------------------------------------------ sectors
local function motion_offset(m, t)
  if m.fixed then return m.fixed[1], m.fixed[2], m.fixed[3] end
  local p
  if m.n <= 0 then p = 1 else p = (t - m.t0) / m.n end
  if p < 0 then p = 0 end
  if m.mode == 'once' then if p > 1 then p = 1 end
  elseif m.mode == 'loop' then p = p - floor(p)
  else p = p % 2 if p > 1 then p = 2 - p end end
  local f, to = m.from, m.to
  return f[1] + (to[1] - f[1]) * p, f[2] + (to[2] - f[2]) * p, f[3] + (to[3] - f[3]) * p
end

local SM = {}
local function check_s(v, what)
  local h = hof(v, 's')
  if not h then fail('bad argument to ' .. what .. ' (a sector expected, got ' .. (v == nil and 'nil' or tname(v)) .. ')') end
  return W.sectors[h.i]
end
function SM.index(self) check_s(self, "'index'") return rawget(self, HK).i end
function SM.tag(self) local s = check_s(self, "'tag'") return s and s.tag end
function SM.floor(self) local s = check_s(self, "'floor'") return s and mkfx(s.floor * TWO32) end
function SM.ceil(self) local s = check_s(self, "'ceil'") return s and mkfx(s.ceil * TWO32) end
function SM.center(self)
  local s = check_s(self, "'center'")
  return s and vat((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, s.floor)
end
function SM.neighbors(self)
  local s = check_s(self, "'neighbors'")
  if not s then return nil end
  local out = {}
  for k, i in ipairs(s.nb) do out[k] = shandle(i) end
  return out
end
function SM.offset(self)
  local s = check_s(self, "'offset'")
  if not s or not s.motion then return nil end
  local x, y, z = motion_offset(s.motion, W.tick)
  return mkv(x, y, z)
end
local function as_offset(v, what)
  local r = v3of(v)
  if r then return { r[1], r[2], r[3] } end
  if not W.noted.mp then
    W.noted.mp = true
    note('(playground: ' .. what .. ' got a number and read it as vec3.new(0, 0, n); the engine wants a vec3 offset)')
  end
  return { 0.0, 0.0, check_fx(v) }
end
function SM.move_parametric(self, from, to, ticks, mode, surface, spin, pivot)
  local s = check_s(self, "'move_parametric'")
  local f, t = as_offset(from, 'move_parametric'), as_offset(to, 'move_parametric')
  local n = trunc(num(ticks, "'move_parametric'"))
  mode = mode == nil and 'once' or str(mode, "'move_parametric'")
  if mode ~= 'once' and mode ~= 'loop' and mode ~= 'pingpong' then
    fail("loop must be 'once', 'loop' or 'pingpong', got '" .. mode .. "'")
  end
  surface = surface == nil and 'both' or str(surface, "'move_parametric'")
  if surface ~= 'both' and surface ~= 'floor' and surface ~= 'ceiling' then
    fail("target must be 'both', 'floor' or 'ceiling', got '" .. surface .. "'")
  end
  if spin ~= nil then check_fx(spin) end
  if pivot ~= nil then check_v3(pivot) end
  if not s then return false end
  s.motion = { from = f, to = t, t0 = W.tick, n = n, mode = mode, surface = surface }
  return true
end
function SM.set_offset(self, v)
  local s = check_s(self, "'set_offset'")
  local r = check_v3(v)
  if not s then return false end
  queue({ what = 'offset', s = s, off = { r[1], r[2], r[3] } })
  return true
end
SEC.__index = function(_, k) return SM[k] end
SEC.__eq = function(a, b) local p, q = hof(a, 's'), hof(b, 's') return p and q and p.i == q.i or false end
SEC.__tostring = function(a) return fmt('sector(%d)', rawget(a, HK).i) end
SEC.__newindex = function() fail('attempt to index a userdata value (a sector)') end

-- ---------------------------------------------------------------------- dnp
local function catalog_kind(name)
  for k, n in ipairs(W0.catalog) do if n == name then return k end end
end
local function where_text(v)
  local h = type(v) == 'table' and rawget(v, HK)
  if h and h.t == 'e' then
    local a = check_e(v, "'sound'")
    return a and who(a) or nil
  elseif h and h.t == 'p' then
    local p = check_p(v, "'sound'")
    return p and ('prop ' .. p.name) or nil
  end
  local x, y, z = vunits(v)
  local s = sector_at(x, y)
  if s >= 0 then return 'sector ' .. s end
  return vtext(x, y, z)
end
local function fields(t, names)
  local out = {}
  for _, k in ipairs(names) do
    if t[k] ~= nil then out[#out + 1] = k .. '=' .. tostr(t[k]) end
  end
  return concat(out, ' ')
end
local function target_text(e, what)
  if e == nil then return 'everyone' end
  local a = check_e(e, what)
  return a and who(a) or nil
end
-- persist: what a save would keep, as Lua source; loading it back.
local function ser(v, depth)
  local t = type(v)
  if t == 'string' then return fmt('%q', v) end
  if t == 'number' then
    if v ~= v or v == huge or v == -huge then error('cannot be saved: an infinite number', 0) end
    return mtype(v) == 'integer' and fmt('%d', v) or fmt('%.17g', v)
  end
  if t == 'boolean' or t == 'nil' then return tostr(v) end
  if t == 'table' and tname(v) == 'table' then
    if depth > 32 then error('cannot be saved: too deep', 0) end
    local out = {}
    for k, x in pairs(v) do out[#out + 1] = '[' .. ser(k, depth + 1) .. ']=' .. ser(x, depth + 1) end
    return '{' .. concat(out, ',') .. '}'
  end
  error('cannot be saved: a ' .. tname(v), 0)
end
local function store_name(name)
  name = str(name, "'store'")
  if #name == 0 or #name > 48 or not name:match('^[A-Za-z0-9_%-]+$') then
    return nil, "'" .. name .. "' is not a store name: 1-48 letters, digits, _ or -"
  end
  return name
end

local CAMERA_FIELDS = { 'distance', 'pitch', 'smoothing', 'max_accel', 'lead', 'lead_smoothing', 'deadzone_x', 'deadzone_y',
  'yaw', 'lock_yaw', 'lock_zoom', 'cam_mode', 'cam_path', 'cam_path_speed', 'cam_path_attach', 'cam_path_blend',
  'cam_shake', 'cam_shake_time', 'lead_velocity', 'auto_turn', 'auto_delay', 'auto_rate', 'collide', 'camera_height', 'aim_height' }
local FX_KINDS = { rain = 1, snow = 2, dust = 3, embers = 4, fog = 5, fill = 6 }
-- who takes a key: any kind, 'w' all but fill, 'p' the particle kinds, or only 'fog' / 'fill'
local FX_KEYS = { density = 'w', speed = 'p', windx = 'p', windy = 'p', sway = 'p', size = 'p', length = 'p',
  color = 'any', alpha = 'any', bottom = 'any', top = 'any', glow = 'any', falloff = 'fog', noise = 'fog', drift = 'fog', surface = 'fill' }
local UI_KINDS = { label = true, button = true, slider = true, select = true, toggle = true }

local function ui_text(v, what)
  if v == nil then return '' end
  if type(v) ~= 'string' and type(v) ~= 'number' then fail('ui: ' .. what .. ' must be a string') end
  return tostr(v)
end

dnp = {
  button = { JUMP = 1, DASH = 2, CLIMB = 4, HOVER = 8, FLIGHT = 16, GRAPPLE = 32, INTERACT = 64,
             ATTACK_PRIMARY = 128, ATTACK_SECONDARY = 256, USE = 512, CROUCH = 1024 },
  tick = function() return W.tick end,
  entity = function(i)
    i = trunc(num(i, "'entity'"))
    if i < 0 or i >= 2048 then return nil end
    local a = W.agents[i]
    return ehandle(i, a and a.gen or 0)
  end,
  entities = function()
    local out = {}
    for i = 0, W.next_agent do local a = W.agents[i] if a and a.active then out[#out + 1] = entity_of(a) end end
    return out
  end,
  players = function()
    local out = {}
    for i = 0, W.next_agent do local a = W.agents[i] if a and a.active and a.kind == 0 then out[#out + 1] = entity_of(a) end end
    return out
  end,
  player_count = function()
    local n = 0
    for i = 0, W.next_agent do local a = W.agents[i] if a and a.active and a.kind == 0 then n = n + 1 end end
    return n
  end,
  props = function()
    local out = {}
    for i = 2048, W.next_prop do local p = W.props[i] if p and p.active then out[#out + 1] = phandle(i, p.gen) end end
    return out
  end,
  prop = function(i)
    i = trunc(num(i, "'prop'"))
    if i < 2048 then return nil end
    local p = W.props[i]
    return phandle(i, p and p.gen or 0)
  end,
  prop_kind = function(name) return catalog_kind(str(name, "'prop_kind'")) end,
  sectors = function()
    local out = {}
    for i = 0, #W.sectors do out[i + 1] = shandle(i) end
    return out
  end,
  sector = function(i)
    i = trunc(num(i, "'sector'"))
    if not W.sectors[i] then return nil end
    return shandle(i)
  end,
  random = function(lo, hi)
    lo, hi = trunc(num(lo, "'random'")), trunc(num(hi, "'random'"))
    if hi < lo then fail(fmt('dnp.random(%d, %d): empty range', lo, hi)) end
    return RAND(lo, hi)
  end,
  level = function() return 0 end,
  levels = function() return { 'arena' } end,
  spawn_point = function(tag)
    local p = W0.spawns[str(tag, "'spawn_point'")]
    return p and vat(p[1], p[2], p[3]) or nil
  end,
  controls = function() return 'fps' end,
  actions = function() return {} end,
  is_game = function() return false end,

  spawn_prop = function(name, pos)
    name = str(name, "'spawn_prop'")
    local x, y, z = vunits(pos)
    local kind = catalog_kind(name)
    if not kind then fail("no prop named '" .. name .. "' in the prop catalogue") end
    local i = W.next_prop
    W.next_prop = i + 1
    W.props[i] = { idx = i, gen = 1, active = true, kind = kind, name = name, x = x, y = y, z = z,
      solid = W0.solid[name] or false, usable = false, anim = 0, facing = 0, spawned = true }
    return phandle(i, 1)
  end,

  set_sector_light = function(i, v, secs)
    local s = sector_arg(i, 'dnp.set_sector_light')
    v = num(v, "'set_sector_light'")
    v = v < 0 and 0 or (v > 255 and 255 or floor(v + 0.5))
    secs = secs == nil and 0 or num(secs, "'set_sector_light'")
    local n = floor(secs * 60 + 0.5)
    if n <= 0 then s.light, s.fade = v, nil
    else s.fade = { from = s.light, to = v, t0 = W.tick, n = n } end
  end,
  set_sector_texture = function(i, part, name)
    local s = sector_arg(i, 'dnp.set_sector_texture')
    part = str(part, "'set_sector_texture'")
    if part ~= 'floor' and part ~= 'ceiling' then fail("a sector's picture is its 'floor' or its 'ceiling', got '" .. part .. "'") end
    name = str(name, "'set_sector_texture'")
    if part == 'floor' then s.tex_floor = name else s.tex_ceil = name end
  end,
  set_sector_effect = function(i, kind, opts)
    local s = sector_arg(i, 'dnp.set_sector_effect')
    kind = str(kind, "'set_sector_effect'")
    if not FX_KINDS[kind] then fail("no sector effect '" .. kind .. "' (rain, snow, dust, embers, fog, fill)") end
    if opts == false then s.effects[kind] = nil return end
    local set = {}
    if type(opts) == 'table' then
      for k, v in pairs(opts) do
        local who_takes = type(k) == 'string' and FX_KEYS[k]
        if not who_takes or (who_takes == 'p' and FX_KINDS[kind] > 4) or (who_takes == 'w' and kind == 'fill')
          or ((who_takes == 'fog' or who_takes == 'fill') and kind ~= who_takes) then
          fail(kind .. " takes no setting '" .. tostr(k) .. "'")
        end
        if k == 'color' then
          local c = type(v) == 'string' and tonumber((v:gsub('^#', '')), 16) or (type(v) == 'number' and v)
          if not c or c < 0 or c > 0xFFFFFF then fail(kind .. "'s color is not a value it can take") end
          set.color = fmt('#%06x', floor(c))
        elseif type(v) == 'number' then set[k] = v
        else set[k] = check_fx(v) / TWO32 end
      end
    end
    s.effects[kind] = set
  end,

  sound = function(name, at, opts)
    name = str(name, "'sound'")
    local w = where_text(at)
    if not w then return false end
    local extra = ''
    if type(opts) == 'table' then
      if opts.follow == false then extra = extra .. ' (stays where it started)' end
      if opts.predicted then extra = extra .. ' (predicted)' end
    end
    api('dnp.sound ' .. name .. ' @ ' .. w .. extra)
    return true
  end,
  music = function(e, cue, fade, at)
    local t = target_text(e, "'music'")
    if not t then return end
    cue = str(cue, "'music'")
    fade = fade == nil and 800 or num(fade, "'music'")
    at = at == nil and 'next_bar' or str(at, "'music'")
    if at ~= 'next_bar' and at ~= 'loop_end' and at ~= 'now' then
      fail("dnp.music: 'at' is next_bar, loop_end or now, not '" .. at .. "'")
    end
    api('dnp.music ' .. cue .. ' → ' .. t .. ', fade ' .. tostr(fade) .. ' ms, at ' .. at)
  end,
  vfx = function(kind, pos, dir, param, skip)
    kind = num(kind, "'vfx'")
    local x, y, z = vunits(pos)
    local s = sector_at(x, y)
    api('dnp.vfx ' .. tostr(kind) .. ' @ ' .. (s >= 0 and ('sector ' .. s .. ' ') or '') .. vtext(x, y, z) ..
      (param ~= nil and (' param ' .. tostr(param)) or ''))
    return true
  end,
  screen = function(e, t)
    local tt = target_text(e, "'screen'")
    if type(t) ~= 'table' then fail("bad argument #2 to 'screen' (table expected, got " .. tname(t) .. ')') end
    if not tt then return end
    local f = fields(t, { 'fade', 'fade_ms', 'letterbox', 'letterbox_ms', 'quit' })
    if f == '' then return end
    api('dnp.screen → ' .. tt .. ': ' .. f)
    local a = e ~= nil and check_e(e, "'screen'")
    if e == nil or (a and a.idx == 0) then
      for _, k in ipairs({ 'fade', 'fade_ms', 'letterbox', 'letterbox_ms' }) do
        if t[k] ~= nil then W.screen[k] = num(t[k], "'screen'") end
      end
    end
  end,
  camera = function(e, t)
    local a = check_e(e, "'camera'")
    if type(t) ~= 'table' then fail("bad argument #2 to 'camera' (table expected, got " .. tname(t) .. ')') end
    if a then api('dnp.camera → ' .. who(a) .. ': ' .. fields(t, CAMERA_FIELDS)) end
  end,
  level_camera = function(t)
    if type(t) ~= 'table' then fail("bad argument #1 to 'level_camera' (table expected, got " .. tname(t) .. ')') end
    api('dnp.level_camera: ' .. fields(t, CAMERA_FIELDS))
  end,

  ui_open = function(e, t)
    local a = check_e(e, "'ui_open'")
    if not a then return 0 end
    if type(t) ~= 'table' then fail("bad argument #2 to 'ui_open' (table expected, got " .. tname(t) .. ')') end
    if t.template ~= nil then
      local tp = tostr(t.template)
      if not tp:match('^[a-z0-9_]+$') or #tp > 32 then fail("ui: template '" .. tp .. "' must be 1..32 of [a-z0-9_]") end
    end
    local panel = { owner = a.idx, title = ui_text(t.title, 'title'), pinned = t.pinned and true or false,
      template = t.template, widgets = {} }
    if type(t.widgets) == 'table' then
      if #t.widgets > 32 then fail('ui: ' .. #t.widgets .. ' widgets, the limit is 32') end
      for _, g in ipairs(t.widgets) do
        if type(g) == 'table' then
          local kind = tostr(g.kind)
          if not UI_KINDS[kind] then fail("ui: no widget kind '" .. kind .. "' (label, button, slider, select, toggle)") end
          local w = { kind = kind, id = trunc(tonumber(g.id) or 0), label = ui_text(g.label, 'label'),
            value = trunc(tonumber(g.value) or 0), lo = trunc(tonumber(g.lo) or 0), hi = trunc(tonumber(g.hi) or 0),
            options = {}, shown = true }
          if type(g.options) == 'table' then
            if #g.options > 16 then fail('ui: ' .. #g.options .. ' options, the limit is 16') end
            for k, o in ipairs(g.options) do w.options[k] = ui_text(o, 'option') end
          end
          panel.widgets[#panel.widgets + 1] = w
        end
      end
    end
    W.ui_seq = W.ui_seq + 1
    panel.id = W.ui_seq
    W.panels[#W.panels + 1] = panel
    return panel.id
  end,
  ui_set = function(e, id, wid, value)
    local a = check_e(e, "'ui_set'")
    id, wid, value = num(id, "'ui_set'"), num(wid, "'ui_set'"), num(value, "'ui_set'")
    if not a then return end
    for _, p in ipairs(W.panels) do
      if p.id == id and p.owner == a.idx then
        for _, w in ipairs(p.widgets) do if w.id == wid then w.value = trunc(value) end end
      end
    end
  end,
  ui_show = function(e, id, widget, shown)
    local a = check_e(e, "'ui_show'")
    id = num(id, "'ui_show'")
    if type(widget) == 'string' then
      if #widget == 0 or #widget > 32 then fail("dnp.ui_show: a decor element's name is 1..32 bytes") end
      return
    end
    widget = num(widget, "'ui_show'")
    if not a then return end
    for _, p in ipairs(W.panels) do
      if p.id == id and p.owner == a.idx then
        for _, w in ipairs(p.widgets) do if w.id == widget then w.shown = shown and true or false end end
      end
    end
  end,
  ui_close = function(e, id)
    local a = check_e(e, "'ui_close'")
    id = num(id, "'ui_close'")
    if not a then return end
    for k, p in ipairs(W.panels) do
      if p.id == id and p.owner == a.idx then table.remove(W.panels, k) return end
    end
  end,
  hud = function(e, t)
    local a
    if e ~= nil then a = check_e(e, "'hud'") if not a then return end end
    if type(t) ~= 'table' then fail("bad argument #2 to 'hud' (table expected, got " .. tname(t) .. ')') end
    local set = {}
    for k, v in pairs(t) do
      if type(k) ~= 'string' or #k == 0 or #k > 24 then fail('dnp.hud: a name must be a string of 1..24 characters') end
      if not k:match('^[a-z0-9_]+$') then fail("dnp.hud: '" .. k .. "' -- a name is [a-z0-9_]") end
      if type(v) == 'boolean' then set[k] = v and 1 or false
      elseif type(v) == 'number' then set[k] = trunc(v)
      elseif type(v) == 'string' then set[k] = v:sub(1, 64)
      elseif fxraw(v) then fail("dnp.hud: '" .. k .. "' is an fx; a HUD shows whole numbers -- convert it (.int) first")
      else fail("dnp.hud: '" .. k .. "' must be a number, a string or false") end
    end
    local function apply(idx)
      W.hud[idx] = W.hud[idx] or {}
      for k, v in pairs(set) do if v == false then W.hud[idx][k] = nil else W.hud[idx][k] = v end end
    end
    if a then apply(a.idx)
    else for i = 0, W.next_agent do local p = W.agents[i] if p and p.active and p.kind == 0 then apply(i) end end end
  end,

  persist = function(name, save, load)
    name = str(name, "'persist'")
    if type(save) ~= 'function' or type(load) ~= 'function' then fail("bad argument to 'persist' (function expected)") end
    W.persist[name] = { save = save, load = load }
  end,
  persist_player = function(name, save, load)
    name = str(name, "'persist_player'")
    if type(save) ~= 'function' or type(load) ~= 'function' then fail("bad argument to 'persist_player' (function expected)") end
    W.persist_player[name] = { save = save, load = load }
  end,
  restoring = function() return W.restoring end,
  store_save = function(name, value)
    local n, why = store_name(name)
    if not n then return false, why end
    local ok, src = pcall(ser, value, 0)
    if not ok then return false, src end
    if #src > 65536 then return false, fmt('too big to keep (%d bytes; the most is 65536)', #src) end
    STORE_SET(n, 'return ' .. src)
    return true
  end,
  store_load = function(name)
    local n, why = store_name(name)
    if not n then return nil, why end
    local src = STORE_GET(n)
    if not src then return nil end
    return load(src, '=store', 't', {})()
  end,
  store_delete = function(name)
    local n, why = store_name(name)
    if not n then return false, why end
    return STORE_SET(n, nil)
  end,
}
with_missing(dnp, 'dnp.', { 'side', 'hitscan', 'can_see', 'sweep', 'sweep_hit', 'find_path', 'length', 'atan2', 'dir',
  'blast_reach', 'knock_impulse', 'path_length', 'side_texture', 'set_side_texture', 'spawn_enemy', 'sky', 'export',
  'call_game', 'game_has', 'call_level', 'call_owner', 'predict_sounds', 'mob_set', 'mob_state', 'stale_ops', 'can_reach' })

-- --------------------------------------------------------------- runtimes
local function mob_record(a) return a.mob end
mobs = {
  spawn = function(kind, pos, opts)
    local x, y, z = vunits(pos)
    local hp = W0.mobs[kind]
    if not hp then print("mobs: no definition for '" .. tostr(kind) .. "'") return nil end
    local i = W.next_agent
    W.next_agent = i + 1
    local a = { idx = i, gen = 1, active = true, kind = catalog_kind(kind), name = kind, x = x, y = y, z = z,
      vx = 0, vy = 0, vz = 0, hp = hp, facing = 0, anim = 0, solid = true, buttons = 0 }
    a.mob = { e = ehandle(i, 1), idx = i, kind = kind, hp = hp, max_hp = hp, vars = {},
      dormant = type(opts) == 'table' and opts.dormant or false }
    W.agents[i] = a
    return ehandle(i, 1)
  end,
  hurt = function(target, amount, by)
    amount = num(amount, "'hurt'")
    local a = hof(target, 'e') and check_e(target, "'hurt'")
    if not a then return end
    if a.kind == 0 then
      if mobs.on_player_hurt then mobs.on_player_hurt(target, amount, by) return end
      local hp = (a.hp or 100) - amount
      if hp > 0 then a.hp = trunc(hp) api('mobs.hurt ' .. who(a) .. ' -' .. tostr(amount) .. ' → ' .. a.hp) return end
      a.hp = mobs.player_max_hp or 100
      local st = W0.spawns.start
      queue({ what = 'teleport', a = a, gen = a.gen, x = st[1], y = st[2], z = st[3] })
      api(who(a) .. ' dies, and respawns at the start')
      if mobs.on_player_death then mobs.on_player_death(target, by) end
      return
    end
    local m = a.mob
    if not m or m.dead then return end
    m.hp = m.hp - amount
    m.hurt_by = by
    if m.hp <= 0 then
      m.dead = true
      a.solid = false
      api('mobs.hurt ' .. who(a) .. ' -' .. tostr(amount) .. ' → dies')
      if mobs.on_death then mobs.on_death(m, by) end
    else
      api('mobs.hurt ' .. who(a) .. ' -' .. tostr(amount) .. ' → ' .. tostr(m.hp))
    end
  end,
  health = function(e)
    local a = hof(e, 'e') and check_e(e, "'health'")
    local m = a and a.mob
    if m == nil then return nil end
    if m.dead then return 0 end
    return m.hp
  end,
  set_health = function(e, hp)
    local a = hof(e, 'e') and check_e(e, "'set_health'")
    local m = a and a.mob
    if m == nil or m.dead then return false end
    m.hp = math.max(1, math.min(m.max_hp or hp, floor(num(hp, "'set_health'"))))
    return true
  end,
  has = function(kind) return W0.mobs[kind] ~= nil end,
}
with_missing(mobs, 'mobs.', { 'place', 'load', 'autoaim', 'pain_ticks', 'has_missile', 'telegraph', 'apply_hit',
  'tagged_effect', 'clear_tagged', 'mob_masses', 'missile_defs', 'assists' })

triggers = {
  counter = function(name) local v = W.counters[name] return type(v) == 'number' and v or 0 end,
  property = function(name) return W.properties[name] end,
  set_property = function(name, value) W.properties[name] = value end,
}
with_missing(triggers, 'triggers.', { 'is_enabled', 'is_spent', 'pending', 'load', 'fire', 'enable', 'disable' })
graphs = { var = function(graph, var) return nil end }
with_missing(graphs, 'graphs.', { 'call', 'notify', 'load' })
weapons = with_missing({}, 'weapons.', { 'api', 'get', 'list', 'select', 'load' })

-- ----------------------------------------------------------- the widget's
local HOOK_NAMES = { 'on_tick', 'on_post_tick', 'on_interact', 'on_cross', 'on_touch', 'on_prop_use', 'on_attack', 'on_crush', 'on_ui_event' }
local HOOKS = {}
local PG = {}
__pg = PG

local ARR = {}
local function arr(t) return setmetatable(t or {}, ARR) end
local JESC = { ['"'] = '\\"', ['\\'] = '\\\\', ['\n'] = '\\n', ['\t'] = '\\t', ['\r'] = '\\r' }
local function json(v)
  local t = type(v)
  if t == 'nil' then return 'null' end
  if t == 'boolean' then return v and 'true' or 'false' end
  if t == 'number' then
    if v ~= v or v == huge or v == -huge then return 'null' end
    return fmt('%.10g', v)
  end
  if t == 'string' then
    return '"' .. (v:gsub('[%c"\\]', function(c) return JESC[c] or fmt('\\u%04x', c:byte()) end)) .. '"'
  end
  if t == 'table' and tname(v) == 'table' then
    local out = {}
    if getmetatable(v) == ARR then
      for i = 1, #v do out[i] = json(v[i]) end
      return '[' .. concat(out, ',') .. ']'
    end
    for k, x in pairs(v) do out[#out + 1] = json(tostr(k)) .. ':' .. json(x) end
    return '{' .. concat(out, ',') .. '}'
  end
  return json(tostr(v))
end

function PG.reset(players) reset(players) end
function PG.set_restoring(b) W.restoring = b end
function PG.harvest()
  local found = {}
  for _, n in ipairs(HOOK_NAMES) do
    local f = rawget(_G, n)
    if type(f) == 'function' then HOOKS[n] = f found[#found + 1] = n else HOOKS[n] = nil end
  end
  return concat(found, ',')
end

-- 'e:0' -> entity 0, 'p:lever' -> the lever, 'n:3' -> 3
local function arg_of(d)
  if d == nil then return nil end
  local k, v = d:match('^(%a):(.*)$')
  if k == 'e' then
    local a = W.agents[tonumber(v)]
    return a and a.active and entity_of(a) or nil
  elseif k == 'p' then
    for i = 2048, W.next_prop do
      local p = W.props[i]
      if p and p.active and p.name == v then return phandle(i, p.gen) end
    end
    return nil
  elseif k == 'n' then return tonumber(v) end
  return v
end
function PG.has(hook) return HOOKS[hook] ~= nil end
function PG.fire(hook, d1, d2, d3, d4)
  local f = HOOKS[hook]
  if not f then return false end
  f(arg_of(d1), arg_of(d2), arg_of(d3), arg_of(d4))
  return true
end
function PG.prop_alive(name) return arg_of('p:' .. name) ~= nil end

function PG.flush()
  local q = W.queue
  W.queue = {}
  for _, c in ipairs(q) do
    local a = c.a
    if c.what == 'offset' then
      c.s.motion = { fixed = c.off }
    elseif a and a.active and a.gen == c.gen then
      if c.what == 'teleport' then
        a.x, a.y, a.z = c.x, c.y, c.z
        api('teleport applied: ' .. who(a) .. ' → ' .. vtext(c.x, c.y, c.z))
      elseif c.what == 'impulse' then
        a.vx, a.vy, a.vz = a.vx + c.x, a.vy + c.y, a.vz + c.z
      elseif c.what == 'velocity' then
        a.vx, a.vy, a.vz = c.x, c.y, c.z
      elseif c.what == 'change_map' then
        api(who(a) .. ' leaves for ' .. (c.level and ('level ' .. tostr(c.level)) or 'the next level') ..
          (c.tag and (' at "' .. c.tag .. '"') or '') .. ' (the playground keeps them here)')
      end
    end
  end
end

-- The world step: the tick advances, sectors move, lights fade.
function PG.step()
  W.tick = W.tick + 1
  for i = 0, #W.sectors do
    local s = W.sectors[i]
    local f = s.fade
    if f then
      local p = (W.tick - f.t0) / f.n
      if p >= 1 then s.light, s.fade = f.to, nil
      else s.light = floor(f.from + (f.to - f.from) * p + 0.5) end
    end
  end
  return W.tick
end

-- Visual set-ups for the event buttons: walk the player to the thing.
function PG.place(what, on)
  local a = W.agents[0]
  if not a or not a.active then return end
  if what == 'cross' then
    if sector_at(a.x, a.y) == 1 then a.y = 232 else a.x, a.y = math.max(16, math.min(240, a.x)), 280 end
    return
  end
  local p = arg_of('p:' .. what)
  local pr = p and W.props[rawget(p, HK).idx]
  if not pr then return end
  if what == 'plate' then
    if on then a.x, a.y, a.z = pr.x, pr.y, pr.z else a.x, a.y = pr.x, pr.y - 40 end
  else
    a.x, a.y, a.z = pr.x + (pr.x > 300 and -26 or 26), pr.y, pr.z
  end
end

function PG.arrive()
  local n = 0
  for i = 0, 7 do if W.agents[i] and W.agents[i].kind == 0 then n = i + 1 end end
  if n >= 8 then return -1 end
  local st = W0.spawns.start
  W.agents[n] = { idx = n, gen = 1, active = true, kind = 0, player = n + 1, x = st[1] + 24 * n, y = st[2] - 24, z = st[3],
    vx = 0, vy = 0, vz = 0, hp = 100, facing = 0, anim = 0, solid = true, avatar = 0, buttons = 0 }
  return n + 1
end
function PG.players()
  local n = 0
  for i = 0, 7 do local a = W.agents[i] if a and a.active and a.kind == 0 then n = n + 1 end end
  return n
end

-- A UI event from the panel: clamp like the protocol does, then report who.
function PG.ui(id, wid, value)
  for _, p in ipairs(W.panels) do
    if p.id == id then
      for _, w in ipairs(p.widgets) do
        if w.id == wid then
          if w.kind == 'slider' then value = math.max(w.lo, math.min(w.hi, value))
          elseif w.kind == 'select' then if value < 0 or value >= #w.options then return '' end
          elseif w.kind == 'toggle' then value = value ~= 0 and 1 or 0
          elseif w.kind == 'button' then value = 1
          else return '' end
          if w.kind ~= 'button' then w.value = value end
          return 'e:' .. p.owner .. '|' .. tostr(value)
        end
      end
    end
  end
  return ''
end

function PG.persist_count()
  local n = 0
  for _ in pairs(W.persist) do n = n + 1 end
  for _ in pairs(W.persist_player) do n = n + 1 end
  return n
end
function PG.persist_save()
  local parts, players = {}, {}
  local names = {}
  for name in pairs(W.persist) do names[#names + 1] = name end
  table.sort(names)
  for _, name in ipairs(names) do parts[#parts + 1] = '[' .. fmt('%q', name) .. ']=' .. ser(W.persist[name].save(), 0) end
  names = {}
  for name in pairs(W.persist_player) do names[#names + 1] = name end
  table.sort(names)
  for i = 0, 7 do
    local a = W.agents[i]
    if a and a.active and a.kind == 0 then
      local mine = {}
      for _, name in ipairs(names) do mine[#mine + 1] = '[' .. fmt('%q', name) .. ']=' .. ser(W.persist_player[name].save(entity_of(a)), 0) end
      players[#players + 1] = '[' .. i .. ']={' .. concat(mine, ',') .. '}'
    end
  end
  return 'return {tick=' .. W.tick .. ',parts={' .. concat(parts, ',') .. '},players={' .. concat(players, ',') .. '}}'
end
function PG.persist_load(blob)
  local saved = load(blob, '=save', 't', {})()
  W.tick = saved.tick
  local names = {}
  for name in pairs(saved.parts) do names[#names + 1] = name end
  table.sort(names)
  for _, name in ipairs(names) do
    local part = W.persist[name]
    if part then part.load(saved.parts[name]) end
  end
  for i, mine in pairs(saved.players) do
    local a = W.agents[i]
    if a and a.active then
      for name, v in pairs(mine) do
        local part = W.persist_player[name]
        if part then part.load(entity_of(a), v) end
      end
    end
  end
end

function PG.snapshot()
  local s = { tick = W.tick, sectors = arr(), props = arr(), agents = arr(), panels = arr(), hud = arr(),
    screen = W.screen, persist = PG.persist_count() }
  for i = 0, #W.sectors do
    local x = W.sectors[i]
    local fl, ce = x.floor, x.ceil
    if x.motion then
      local _, _, z = motion_offset(x.motion, W.tick)
      z = z / TWO32
      local sf = x.motion.surface or 'both'
      if sf ~= 'ceiling' then fl = fl + z end
      if sf ~= 'floor' then ce = ce + z end
    end
    local fxs = arr()
    for _, k in ipairs({ 'rain', 'snow', 'dust', 'embers', 'fog', 'fill' }) do
      if x.effects[k] then fxs[#fxs + 1] = { kind = k, density = x.effects[k].density, color = x.effects[k].color } end
    end
    s.sectors[#s.sectors + 1] = { i = i, name = x.name, tag = x.tag, x0 = x.x0, y0 = x.y0, x1 = x.x1, y1 = x.y1,
      floor = fl, ceil = ce, base = x.floor, moving = x.motion ~= nil, light = x.light, tex_floor = x.tex_floor,
      tex_ceil = x.tex_ceil, effects = fxs }
  end
  for i = 2048, W.next_prop do
    local p = W.props[i]
    if p then s.props[#s.props + 1] = { idx = i, name = p.name, x = p.x, y = p.y, z = p.z, solid = p.solid, active = p.active, usable = p.usable } end
  end
  for i = 0, W.next_agent do
    local a = W.agents[i]
    if a and a.active then
      s.agents[#s.agents + 1] = { idx = i, kind = a.kind, name = a.name, player = a.player, x = a.x, y = a.y, z = a.z,
        hp = a.mob and a.mob.hp or a.hp, dead = a.mob and a.mob.dead or false }
      if a.kind == 0 then
        local h = arr()
        local keys = {}
        for k in pairs(W.hud[i] or {}) do keys[#keys + 1] = k end
        table.sort(keys)
        for _, k in ipairs(keys) do h[#h + 1] = arr({ k, W.hud[i][k] }) end
        s.hud[#s.hud + 1] = { player = a.player, values = h }
      end
    end
  end
  for _, p in ipairs(W.panels) do
    local ws = arr()
    for _, w in ipairs(p.widgets) do
      ws[#ws + 1] = { kind = w.kind, id = w.id, label = w.label, value = w.value, lo = w.lo, hi = w.hi, options = arr(w.options), shown = w.shown }
    end
    local owner = W.agents[p.owner]
    s.panels[#s.panels + 1] = { id = p.id, owner = owner and owner.player or 0, title = p.title, widgets = ws }
  end
  return json(s)
end

reset(1)
`;

  // ------------------------------------------------------------------- style
  const CSS = `
.lpg-ed { display: grid; grid-template-columns: auto 1fr; border: 1px solid var(--line); border-radius: var(--r-c); background: var(--code); overflow: hidden; }
.lpg-gutter { font-family: var(--mono); font-size: 12.5px; line-height: 1.5; color: var(--text-dim); text-align: right; padding: 8px 6px 8px 8px; user-select: none; overflow: hidden; border-right: 1px solid var(--line-soft); white-space: pre; }
.lpg-ta { font-family: var(--mono); font-size: 12.5px; line-height: 1.5; color: var(--text); background: transparent; border: 0; outline: none; resize: vertical; padding: 8px 10px; min-height: 120px; width: 100%; box-sizing: border-box; white-space: pre; overflow: auto; tab-size: 2; margin: 0; }
.lpg-ta:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
.lpg-status { margin-left: auto; }
.lpg-ev .wbtn { font-size: 12.5px; }
.lpg-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 290px), 1fr)); gap: 10px; margin-top: 10px; }
.lpg-world { position: relative; min-width: 0; }
.lpg-world canvas { width: 100%; height: auto; }
.lpg-hud { font-family: var(--mono); font-size: 12px; color: var(--text-2); margin-top: 6px; overflow-wrap: anywhere; }
.lpg-hud b { color: var(--accent); font-weight: 600; }
.lpg-panels { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.lpg-card { border: 1px solid var(--line); background: var(--raised); border-radius: var(--r-c); padding: 8px 10px; min-width: 0; max-width: 100%; font-size: 13px; }
.lpg-card .t { font-weight: 600; margin-bottom: 4px; display: flex; gap: 8px; justify-content: space-between; }
.lpg-card .t small { color: var(--text-dim); font-weight: 400; font-family: var(--mono); }
.lpg-card .w { display: flex; align-items: center; gap: 6px; margin: 4px 0; flex-wrap: wrap; }
.lpg-card .w input[type=range] { width: 120px; accent-color: var(--accent); }
.lpg-card select { font: inherit; font-size: 12.5px; background: var(--input); color: var(--text); border: 1px solid var(--line); border-radius: var(--r-s); }
.lpg-card .num { font-family: var(--mono); font-size: 12px; color: var(--text-2); }
.lpg-con { font-family: var(--mono); font-size: 12px; line-height: 1.45; background: var(--code); border: 1px solid var(--line); border-radius: var(--r-c); padding: 6px 8px; height: 300px; overflow: auto; min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 4; }
.lpg-con .l { padding: 1px 0; }
.lpg-con .tk { color: var(--text-dim); }
.lpg-con .api { color: var(--info); }
.lpg-con .err { color: var(--error); }
.lpg-con .note { color: var(--text-dim); font-style: italic; }
.lpg-con .empty { color: var(--text-dim); }
.lpg-fade { position: absolute; left: 0; right: 0; top: 0; pointer-events: none; background: #000; opacity: 0; border-radius: var(--r-c); }
.lpg-lb { position: absolute; left: 0; right: 0; pointer-events: none; background: #000; height: 0; }
`;
  function injectStyle() {
    if (document.getElementById('lpg-style')) return;
    const s = document.createElement('style');
    s.id = 'lpg-style';
    s.textContent = CSS;
    document.head.append(s);
  }

  function dedent(src) {
    const lines = src.replace(/\r\n?/g, '\n').split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    const pad = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)[0].length));
    return lines.map((l) => l.slice(isFinite(pad) ? pad : 0)).join('\n') + '\n';
  }

  // A deterministic generator, re-seeded on every Run and Reset.
  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const EVENT_DEFS = {
    use: 'player uses the lever',
    cross: 'player crosses side 3',
    touch: 'player touches the plate',
    attack: 'player hits the crate',
    enter: 'a player arrives',
  };
  const BUDGET_CALL = 2000000, BUDGET_TICK = 8000000, GRAN = 1000;
  const PER_TICK_HOOKS = new Set(['on_tick', 'on_post_tick', 'on_touch']);

  window.DNPW['lua-playground'] = function mount(el, opts) {
    injectStyle();
    const h = window.DNPh;
    const codeEl = opts.code && document.getElementById(opts.code);
    const original = dedent(codeEl ? codeEl.textContent : '-- (no code: data-code names no <script> on this page)\nprint("hello from the playground")\n');
    const runTicks = Math.max(0, Math.min(36000, parseInt(opts.ticks, 10) || 0));
    const events = (opts.events || 'use,cross,touch,attack,enter').split(',').map((s) => s.trim()).filter((s) => EVENT_DEFS[s]);

    // ---- layout
    const gutter = h('div', { class: 'lpg-gutter', 'aria-hidden': 'true' });
    const ta = h('textarea', { class: 'lpg-ta', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', wrap: 'off', 'aria-label': 'Lua code' });
    ta.value = original;
    ta.rows = Math.min(22, Math.max(6, original.split('\n').length));
    const ed = h('div', { class: 'lpg-ed' }, gutter, ta);

    const bRun = h('button', { class: 'wbtn primary', title: 'Reset the world, run the code, collect its hooks' }, '▶ Run');
    const bTick = h('button', { class: 'wbtn', title: 'One tick: on_tick, the world step, on_post_tick' }, '⏭ 1 tick');
    const bPlay = h('button', { class: 'wbtn', title: '60 ticks a second' }, '⏵ Play');
    const bSpeed = h('button', { class: 'wbtn', title: 'Play speed' }, '1×');
    const bReset = h('button', { class: 'wbtn', title: 'The original code and a fresh world' }, '↺ Reset');
    const status = h('span', { class: 'wout lpg-status' }, 't=0');
    const evBtns = {};
    for (const k of events) evBtns[k] = h('button', { class: 'wbtn' }, EVENT_DEFS[k]);
    const bSave = h('button', { class: 'wbtn', title: 'Call every dnp.persist save, rebuild the level, run the code with dnp.restoring() true, then call the loads', style: 'display:none' }, 'save & reload');

    const canvas = h('canvas', { width: 400, height: 400, 'aria-label': 'The arena: four sectors, props and players' });
    const fadeEl = h('div', { class: 'lpg-fade' });
    const lbTop = h('div', { class: 'lpg-lb', style: 'top:0' });
    const lbBot = h('div', { class: 'lpg-lb' });
    const hud = h('div', { class: 'lpg-hud' });
    const panels = h('div', { class: 'lpg-panels' });
    const worldBox = h('div', { class: 'lpg-world' }, h('div', { style: 'position:relative' }, canvas, fadeEl, lbTop, lbBot), hud, panels);
    const con = h('div', { class: 'lpg-con', role: 'log', 'aria-live': 'polite' }, h('div', { class: 'empty' }, 'Press ▶ Run. print() and the engine calls show up here.'));

    el.append(
      ed,
      h('div', { class: 'wrow' }, bRun, bTick, bPlay, bSpeed, bReset, status),
      events.length ? h('div', { class: 'wrow lpg-ev' }, ...events.map((k) => evBtns[k]), bSave) : h('div', { class: 'wrow lpg-ev' }, bSave),
      h('div', { class: 'lpg-grid' }, worldBox, con),
      h('p', { class: 'wnote' }, 'A toy world that answers to the engine’s names. It is not the engine: physics, monsters’ brains and graphs don’t run here. ',
        h('span', {}, 'It runs Lua 5.3 in your browser; the engine runs LuaJIT (Lua 5.1) — the examples stick to what both understand.')),
    );

    // ---- editor
    function syncGutter() {
      const n = ta.value.split('\n').length;
      let s = '';
      for (let i = 1; i <= n; i++) s += i + '\n';
      gutter.textContent = s;
      gutter.scrollTop = ta.scrollTop;
    }
    ta.addEventListener('input', syncGutter);
    ta.addEventListener('scroll', () => { gutter.scrollTop = ta.scrollTop; });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        const a = ta.selectionStart, b = ta.selectionEnd;
        ta.setRangeText('  ', a, b, 'end');
        syncGutter();
      } else if (e.key === 'Escape') {
        ta.blur();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        run();
      }
    });
    syncGutter();

    // ---- console
    let lines = 0;
    function out(cls, tick, text) {
      if (lines === 0) con.textContent = '';
      const atEnd = con.scrollTop + con.clientHeight >= con.scrollHeight - 4;
      const row = h('div', { class: 'l ' + (cls || '') });
      if (tick != null) row.append(h('span', { class: 'tk' }, '[t=' + tick + '] '));
      row.append(text);
      con.append(row);
      lines++;
      while (con.childNodes.length > 600) con.firstChild.remove();
      if (atEnd) con.scrollTop = con.scrollHeight;
    }
    function clearConsole() { con.textContent = ''; lines = 0; }

    // ---- the VM
    let F = null;          // fengari
    let L = null;          // lua_State
    let loaded = false;    // the chunk ran and its hooks are in
    let hooks = '';
    let tick = 0;
    let rand = mulberry(1);
    let usedCall = 0, usedTick = 0, killed = false, blown = false;
    let errCount = 0, hidNote = false;
    let touching = false, playing = false, speed = 1;
    let snap = null;
    const store = new Map();   // dnp.store_*: kept across Runs, cleared by Reset
    const names = {};
    const ls = (s) => names[s] || (names[s] = F.to_luastring(s));

    function hook(L_, ar) {
      usedCall += GRAN; usedTick += GRAN;
      if (!killed && usedCall <= BUDGET_CALL && usedTick <= BUDGET_TICK) return;
      const { lua } = F;
      if (!killed) { killed = true; blown = true; lua.lua_sethook(L_, hook, lua.LUA_MASKCOUNT, 1); }
      let at = '';
      try {
        lua.lua_getinfo(L_, ls('Sl'), ar);
        const src = ar.source ? (typeof ar.source === 'string' ? ar.source : F.to_jsstring(ar.source)) : '';
        if (src === '@playground.lua' && ar.currentline > 0) at = 'playground.lua:' + ar.currentline + ': ';
      } catch (_) { /* no line, then */ }
      lua.lua_pushstring(L_, F.to_luastring(at + "instruction budget exceeded in 'playground.lua' (" + BUDGET_CALL + ' per call / ' + BUDGET_TICK + ' per tick)'));
      lua.lua_error(L_);
    }
    function arm() { usedCall = 0; killed = false; F.lua.lua_sethook(L, hook, F.lua.LUA_MASKCOUNT, GRAN); }
    function disarm() { F.lua.lua_sethook(L, null, 0, 0); }

    function popError() {
      const { lua, lauxlib } = F;
      let msg;
      if (lua.lua_type(L, -1) === lua.LUA_TSTRING) msg = lua.lua_tojsstring(L, -1);
      else { msg = F.to_jsstring(lauxlib.luaL_tolstring(L, -1)); lua.lua_pop(L, 1); }
      lua.lua_pop(L, 1);
      return msg;
    }
    function push(v) {
      const { lua } = F;
      if (v == null) lua.lua_pushnil(L);
      else if (typeof v === 'number') lua.lua_pushnumber(L, v);
      else if (typeof v === 'boolean') lua.lua_pushboolean(L, v);
      else lua.lua_pushstring(L, F.to_luastring(String(v)));
    }
    // Call __pg[name](...args) under the budget. -> { ok, value } | { err }
    function call(name, args, budget) {
      const { lua } = F;
      lua.lua_getglobal(L, ls('__pg'));
      lua.lua_getfield(L, -1, ls(name));
      lua.lua_remove(L, -2);
      for (const a of args || []) push(a);
      if (budget) arm();
      const st = lua.lua_pcall(L, (args || []).length, 1, 0);
      if (budget) disarm();
      if (st !== 0) return { err: popError() };
      let v = null;
      const t = lua.lua_type(L, -1);
      if (t === lua.LUA_TSTRING) v = lua.lua_tojsstring(L, -1);
      else if (t === lua.LUA_TNUMBER) v = lua.lua_tonumber(L, -1);
      else if (t === lua.LUA_TBOOLEAN) v = lua.lua_toboolean(L, -1);
      lua.lua_pop(L, 1);
      return { ok: true, value: v };
    }

    function newState(players) {
      const { lua, lauxlib, lualib } = F;
      L = lauxlib.luaL_newstate();
      lualib.luaL_openlibs(L);
      rand = mulberry(0x5eed);
      lua.lua_pushcfunction(L, (L_) => {
        const kind = lua.lua_tojsstring(L_, 1);
        const t = lua.lua_tonumber(L_, 2);
        const text = lua.lua_tojsstring(L_, 3);
        out(kind === 'api' ? 'api' : kind === 'note' ? 'note' : '', t, text);
        return 0;
      });
      lua.lua_setglobal(L, ls('__pg_log'));
      lua.lua_pushcfunction(L, (L_) => {
        const lo = lua.lua_tonumber(L_, 1), hi = lua.lua_tonumber(L_, 2);
        const n = lo + Math.floor(rand() * (hi - lo + 1));
        if (Math.abs(n) < 2147483647) lua.lua_pushinteger(L_, n); else lua.lua_pushnumber(L_, n);
        return 1;
      });
      lua.lua_setglobal(L, ls('__pg_rand'));
      lua.lua_pushcfunction(L, (L_) => {
        const name = lua.lua_tojsstring(L_, 1);
        const had = store.has(name);
        if (lua.lua_isnil(L_, 2)) store.delete(name); else store.set(name, lua.lua_tojsstring(L_, 2));
        lua.lua_pushboolean(L_, had);
        return 1;
      });
      lua.lua_setglobal(L, ls('__pg_store_set'));
      lua.lua_pushcfunction(L, (L_) => {
        const v = store.get(lua.lua_tojsstring(L_, 1));
        if (v == null) lua.lua_pushnil(L_); else lua.lua_pushstring(L_, F.to_luastring(v));
        return 1;
      });
      lua.lua_setglobal(L, ls('__pg_store_get'));
      const src = PRELUDE.replace('@@WORLD@@', toLua(WORLD));
      if (lauxlib.luaL_loadbuffer(L, F.to_luastring(src), null, ls('=prelude')) !== 0 || lua.lua_pcall(L, 0, 0, 0) !== 0) {
        out('err', null, '[playground] could not start: ' + popError());
        L = null;
        return false;
      }
      if (players > 1) call('reset', [players]);
      loaded = false; hooks = ''; tick = 0; errCount = 0; hidNote = false; blown = false;
      return true;
    }

    function hookError(name, msg) {
      errCount++;
      if (PER_TICK_HOOKS.has(name) && errCount > 3 && tick % 300 !== 0) {
        if (!hidNote) { hidNote = true; out('note', tick, '(more errors hidden: like the engine, the playground shows the first 3, then one every 300 ticks)'); }
        return;
      }
      out('err', null, '[lua] ' + name + ' error (tick ' + tick + '): ' + msg);
    }
    // Fire a hook with argument descriptors ('e:0', 'p:lever', 'n:3').
    function fire(name, ...args) {
      const r = call('fire', [name, ...args], true);
      if (r.err) { hookError(name, r.err); return 'error'; }   // it answered, badly
      return r.value;
    }

    function runChunk(code, restoring) {
      const { lua, lauxlib } = F;
      if (restoring) call('set_restoring', [true]);
      if (lauxlib.luaL_loadbuffer(L, F.to_luastring(code), null, ls('@playground.lua')) !== 0) {
        out('err', null, '[lua] playground.lua failed to load: ' + popError() + ' — the level would not start');
        return false;
      }
      usedTick = 0;
      arm();
      const st = lua.lua_pcall(L, 0, 0, 0);
      disarm();
      if (st !== 0) {
        out('err', null, '[lua] playground.lua failed to load: ' + popError() + ' — the level would not start');
        return false;
      }
      if (restoring) call('set_restoring', [false]);
      const r = call('harvest', []);
      hooks = r.value || '';
      loaded = true;
      return true;
    }

    async function ensureVM() {
      if (F) return true;
      status.textContent = 'loading Lua…';
      try { F = await loadFengari(); } catch (e) {
        out('err', null, '[playground] ' + e.message);
        status.textContent = 'no Lua';
        return false;
      }
      return true;
    }

    // One tick, the engine's order: on_tick, flush, step (+ touches), on_post_tick, flush.
    function tickOnce() {
      usedTick = 0;
      blown = false;
      fire('on_tick');
      call('flush', []);
      const r = call('step', []);
      if (r.ok) tick = r.value;
      if (touching) {
        if (call('prop_alive', ['plate']).value) fire('on_touch', 'e:0', 'p:plate');
      }
      fire('on_post_tick');
      call('flush', []);
      return !blown;
    }

    async function run() {
      stop();
      if (!(await ensureVM())) return;
      clearConsole();
      touching = false;
      if (evBtns.touch) evBtns.touch.classList.remove('on');
      if (!newState(1)) return;
      if (runChunk(ta.value, false)) {
        for (let i = 0; i < runTicks; i++) if (!tickOnce()) { out('note', tick, '(stopped: the budget was blown)'); break; }
      }
      render();
    }
    async function ready() {
      if (L && loaded) return true;
      await run();
      return !!(L && loaded);
    }

    async function oneTick() {
      if (!(await ready())) return;
      stop();
      tickOnce();
      render();
    }

    // ---- play
    let raf = 0, last = 0, acc = 0;
    function frame(ts) {
      if (!playing) return;
      if (!last) last = ts;
      acc += (ts - last) * 0.06 * speed;
      last = ts;
      let n = Math.min(Math.floor(acc), 4);
      acc = Math.min(acc - n, 4);
      while (n-- > 0) {
        if (!tickOnce()) { out('note', tick, '(paused: a callback blew the instruction budget)'); stop(); break; }
      }
      render();
      if (playing) raf = requestAnimationFrame(frame);
    }
    async function play() {
      if (playing) { stop(); return; }
      if (!(await ready())) return;
      playing = true;
      bPlay.textContent = '⏸ Pause';
      bPlay.classList.add('on');
      last = 0; acc = 0;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      playing = false;
      cancelAnimationFrame(raf);
      bPlay.textContent = '⏵ Play';
      bPlay.classList.remove('on');
    }
    // Pause when the widget scrolls away, so three playgrounds don't all spin.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => { for (const e of es) if (!e.isIntersecting && playing) stop(); }).observe(el);
    }

    // ---- events
    async function event(kind) {
      if (!(await ready())) return;
      usedTick = 0;
      if (kind === 'enter') {
        const r = call('arrive', []);
        if (r.value > 0) out('note', tick, 'player ' + r.value + ' arrives (dnp.player_count() is ' + call('players', []).value + ')');
        else out('note', tick, 'the arena is full (8 players)');
      } else if (kind === 'use') {
        if (!call('prop_alive', ['lever']).value) out('note', tick, '(the lever is gone: nothing to use)');
        else { call('place', ['lever']); if (!fire('on_prop_use', 'e:0', 'p:lever')) noHook('on_prop_use'); }
      } else if (kind === 'attack') {
        if (!call('prop_alive', ['crate']).value) out('note', tick, '(the crate is gone: nothing to hit)');
        else { call('place', ['crate']); if (!fire('on_attack', 'e:0', 'p:crate')) noHook('on_attack'); }
      } else if (kind === 'cross') {
        call('place', ['cross']);
        if (!fire('on_cross', 'e:0', 'n:3', 'n:0')) noHook('on_cross');
      } else if (kind === 'touch') {
        touching = !touching;
        evBtns.touch.classList.toggle('on', touching);
        call('place', ['plate', touching]);
        out('note', tick, touching ? 'player 1 stands on the plate: on_touch every tick (press ⏭ or ⏵)' : 'player 1 steps off the plate');
        if (touching && !call('has', ['on_touch']).value) noHook('on_touch');
      }
      render();
    }
    function noHook(name) { out('note', tick, '(no ' + name + ' in this script, so nothing answers)'); }

    async function saveReload() {
      if (!(await ready())) return;
      stop();
      const players = call('players', []).value || 1;
      usedTick = 0;
      const r = call('persist_save', [], true);
      if (r.err) { out('err', null, '[lua] persist save error: ' + r.err); return; }
      out('note', tick, 'saved; rebuilding the level with dnp.restoring() == true');
      if (!newState(players)) return;
      if (!runChunk(ta.value, true)) { render(); return; }
      const l = call('persist_load', [r.value], true);
      if (l.err) out('err', null, '[lua] persist load error: ' + l.err);
      render();
    }

    // ---- drawing
    const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
    function worldState() {
      if (snap) return snap;
      // Before the first run: the arena as it starts.
      return {
        tick: 0,
        sectors: WORLD.sectors.map((s, i) => ({ ...s, i, base: s.floor, effects: [], moving: false })),
        props: WORLD.props.map((p, i) => ({ ...p, idx: 2048 + i, active: true })),
        agents: [{ idx: 0, kind: 0, player: 1, x: WORLD.spawns.start[0], y: WORLD.spawns.start[1], z: 0, hp: 100 }],
        panels: [], hud: [], screen: { fade: 0, fade_ms: 0, letterbox: 0, letterbox_ms: 0 }, persist: 0,
      };
    }
    const FX_GLYPH = { rain: '⁞ rain', snow: '∗ snow', dust: '· dust', embers: '✦ embers', fog: '≋ fog', fill: '▒ fill' };
    function draw() {
      const w = worldState();
      const box = canvas.parentElement.getBoundingClientRect();
      const cssW = Math.max(200, Math.floor(box.width || 360));
      const cssH = Math.round(cssW * 0.92);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) { canvas.width = cssW * dpr; canvas.height = cssH * dpr; }
      canvas.style.height = cssH + 'px';
      fadeEl.style.height = cssH + 'px';
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, cssW, cssH);
      const pad = 6, WW = 416, WH = 416;
      const sc = Math.min((cssW - 2 * pad) / WW, (cssH - 2 * pad) / WH);
      const ox = (cssW - WW * sc) / 2, oy = (cssH - WH * sc) / 2;
      const X = (x) => ox + x * sc, Y = (y) => oy + (WH - y) * sc;
      const C = { raised: css('--raised'), line: css('--line-strong'), text: css('--text'), text2: css('--text-2'), dim: css('--text-dim'),
        panel: css('--panel'), accent: css('--accent'), error: css('--error'), ok: css('--then'), warn: css('--warn'), info: css('--info') };
      const fs = Math.max(9.5, Math.min(12, cssW / 34));
      g.font = fs + 'px ' + css('--mono');
      g.textBaseline = 'top';

      for (const s of w.sectors) {
        const x = X(s.x0), y = Y(s.y1), ww = (s.x1 - s.x0) * sc, hh = (s.y1 - s.y0) * sc;
        g.fillStyle = C.raised;
        g.fillRect(x, y, ww, hh);
        // light: darker below 160, warmer above
        if (s.light < 160) { g.globalAlpha = (160 - s.light) / 160 * 0.78; g.fillStyle = '#000'; g.fillRect(x, y, ww, hh); }
        else if (s.light > 160) { g.globalAlpha = (s.light - 160) / 95 * 0.32; g.fillStyle = C.warn; g.fillRect(x, y, ww, hh); }
        g.globalAlpha = 1;
        // effects: a few moving marks
        for (const e of s.effects || []) {
          const n = Math.round(Math.min(40, 10 + (e.density || 1) * 4));
          g.fillStyle = g.strokeStyle = e.color || (e.kind === 'embers' ? C.warn : e.kind === 'fog' ? C.text2 : C.info);
          if (e.kind === 'fog' || e.kind === 'fill') { g.globalAlpha = e.kind === 'fill' ? 0.3 : 0.18; g.fillRect(x, y, ww, hh); g.globalAlpha = 1; continue; }
          for (let k = 0; k < n; k++) {
            const hx = ((k * 73 + s.i * 31) % 97) / 97, hy = ((k * 41 + s.i * 17) % 89) / 89;
            const sp = e.kind === 'rain' ? 0.02 : e.kind === 'embers' ? -0.006 : e.kind === 'snow' ? 0.006 : 0.002;
            const py = ((hy + w.tick * sp) % 1 + 1) % 1;
            const px = x + hx * ww, pyy = y + py * hh;
            g.globalAlpha = 0.7;
            if (e.kind === 'rain') { g.beginPath(); g.moveTo(px, pyy); g.lineTo(px - 1, pyy + 5); g.stroke(); }
            else g.fillRect(px, pyy, e.kind === 'snow' ? 2 : 1.5, e.kind === 'snow' ? 2 : 1.5);
          }
          g.globalAlpha = 1;
        }
        g.strokeStyle = C.line; g.lineWidth = 1;
        g.strokeRect(x + 0.5, y + 0.5, ww - 1, hh - 1);
        // the lift's floor gauge
        if (s.moving || s.floor !== s.base) {
          const gx = x + ww - 8, gy = y + 6, gh = hh - 12;
          const t = Math.max(0, Math.min(1, (s.floor - s.base + 64) / 128));
          g.fillStyle = C.panel; g.fillRect(gx, gy, 4, gh);
          g.fillStyle = C.accent; g.fillRect(gx - 1, gy + gh * (1 - t) - 2, 6, 4);
        }
        // labels
        const fx = (s.effects || []).map((e) => FX_GLYPH[e.kind]).join(' ');
        const rows = [s.i + ' ' + s.name + ' · tag ' + s.tag, 'light ' + Math.round(s.light), 'floor ' + fmtN(s.floor), s.tex_floor];
        if (fx) rows.push(fx);
        const lh = fs + 3;
        const lw = Math.min(ww - 14, Math.max(...rows.map((r) => g.measureText(r).width)) + 8);
        g.globalAlpha = 0.86; g.fillStyle = C.panel;
        g.fillRect(x + 4, y + 4, lw, rows.length * lh + 4);
        g.globalAlpha = 1;
        rows.forEach((r, k) => {
          g.fillStyle = k === 0 ? C.text : k === 4 ? C.info : C.text2;
          g.fillText(fit(g, r, ww - 18), x + 8, y + 6 + k * lh);
        });
      }
      // side 3
      const sd = WORLD.side3;
      g.setLineDash([4, 3]); g.strokeStyle = C.accent; g.lineWidth = 2;
      g.beginPath(); g.moveTo(X(sd.x0), Y(sd.y0)); g.lineTo(X(sd.x1), Y(sd.y1)); g.stroke();
      g.setLineDash([]); g.lineWidth = 1;
      g.fillStyle = C.accent; g.textBaseline = 'bottom';
      g.fillText('side 3', X(sd.x1) - g.measureText('side 3').width - 4, Y(sd.y1) - 2);
      g.textBaseline = 'top';

      // props
      for (const p of w.props) {
        const px = X(p.x), py = Y(p.y), r = 6;
        g.lineWidth = 1.5;
        if (!p.active) {
          g.setLineDash([2, 2]); g.strokeStyle = C.dim; g.strokeRect(px - r, py - r, 2 * r, 2 * r); g.setLineDash([]);
        } else if (p.solid) {
          g.fillStyle = C.ok; g.fillRect(px - r, py - r, 2 * r, 2 * r);
          g.strokeStyle = C.text; g.strokeRect(px - r, py - r, 2 * r, 2 * r);
        } else {
          g.strokeStyle = C.ok; g.strokeRect(px - r, py - r, 2 * r, 2 * r);
        }
        g.lineWidth = 1;
        const label = p.name + (p.active ? '' : ' (gone)');
        label_(g, label, px, py + r + 2, p.active ? C.text : C.dim, C.panel);
      }
      // agents
      for (const a of w.agents) {
        const px = X(a.x), py = Y(a.y);
        if (a.kind === 0) {
          g.fillStyle = C.accent; g.beginPath(); g.arc(px, py, 6.5, 0, Math.PI * 2); g.fill();
          g.strokeStyle = C.text; g.lineWidth = 1.5; g.stroke(); g.lineWidth = 1;
          label_(g, 'P' + a.player + ' ' + a.hp + 'hp', px, py - 8 - fs - 3, C.text, C.panel);
        } else if (a.dead) {
          g.strokeStyle = C.error; g.lineWidth = 2;
          g.beginPath(); g.moveTo(px - 5, py - 5); g.lineTo(px + 5, py + 5); g.moveTo(px + 5, py - 5); g.lineTo(px - 5, py + 5); g.stroke();
          g.lineWidth = 1;
          label_(g, (a.name || 'monster') + ' (dead)', px, py + 8, C.dim, C.panel);
        } else {
          g.fillStyle = C.error; g.beginPath(); g.moveTo(px, py - 7); g.lineTo(px + 7, py); g.lineTo(px, py + 7); g.lineTo(px - 7, py); g.closePath(); g.fill();
          label_(g, (a.name || 'monster') + ' ' + a.hp, px, py + 9, C.text, C.panel);
        }
      }
      // tick
      g.fillStyle = C.dim; g.textBaseline = 'bottom';
      const tt = 't=' + w.tick;
      g.fillText(tt, cssW - pad - g.measureText(tt).width - 2, cssH - 4);
      g.textBaseline = 'top';

      // screen
      const scr = w.screen || {};
      fadeEl.style.transition = 'opacity ' + Math.max(0, scr.fade_ms || 0) + 'ms';
      fadeEl.style.opacity = String(Math.max(0, Math.min(1, scr.fade || 0)));
      const lb = Math.max(0, Math.min(0.4, scr.letterbox || 0)) * cssH / 2;
      for (const b of [lbTop, lbBot]) { b.style.transition = 'height ' + Math.max(0, scr.letterbox_ms || 0) + 'ms'; b.style.height = lb + 'px'; }
      lbBot.style.top = (cssH - lb) + 'px';
    }
    function fmtN(n) { return Math.abs(n - Math.round(n)) < 0.005 ? String(Math.round(n)) : n.toFixed(2); }
    function fit(g, s, maxW) {
      if (g.measureText(s).width <= maxW) return s;
      while (s.length > 2 && g.measureText(s + '…').width > maxW) s = s.slice(0, -1);
      return s + '…';
    }
    function label_(g, s, cx, y, fg, bg) {
      const tw = g.measureText(s).width;
      const x = Math.max(2, Math.min(canvas.width / (Math.min(2, window.devicePixelRatio || 1)) - tw - 6, cx - tw / 2 - 3));
      g.globalAlpha = 0.85; g.fillStyle = bg; g.fillRect(x, y, tw + 6, parseFloat(g.font) + 3); g.globalAlpha = 1;
      g.fillStyle = fg; g.fillText(s, x + 3, y + 1.5);
    }

    function renderHud(w) {
      hud.textContent = '';
      const rows = (w.hud || []).filter((r) => r.values.length);
      if (!rows.length) { hud.append('HUD: (nothing yet — dnp.hud sets it)'); return; }
      rows.forEach((r, i) => {
        if (i) hud.append(h('br'));
        hud.append(h('b', {}, 'HUD P' + r.player), ' ', r.values.map(([k, v]) => k + ' ' + (typeof v === 'string' ? JSON.stringify(v) : v)).join(' · '));
      });
    }

    // Panels are rebuilt only when their shape changes, so a slider being
    // dragged is not swept away by the next frame.
    const cards = new Map();
    function renderPanels(w) {
      const seen = new Set();
      for (const p of w.panels || []) {
        seen.add(p.id);
        const shape = JSON.stringify([p.title, p.owner, p.widgets.map((x) => [x.kind, x.id, x.label, x.options, x.shown, x.lo, x.hi])]);
        let c = cards.get(p.id);
        if (!c || c.shape !== shape) {
          if (c) c.el.remove();
          c = buildCard(p, shape);
          cards.set(p.id, c);
          panels.append(c.el);
        }
        for (const x of p.widgets) {
          const inp = c.inputs[x.id];
          if (!inp || document.activeElement === inp.el) continue;
          if (x.kind === 'slider') { inp.el.value = x.value; inp.num.textContent = x.value; }
          else if (x.kind === 'toggle') inp.el.checked = !!x.value;
          else if (x.kind === 'select') inp.el.value = x.value;
        }
      }
      for (const [id, c] of cards) if (!seen.has(id)) { c.el.remove(); cards.delete(id); }
    }
    function buildCard(p, shape) {
      const inputs = {};
      const body = [];
      for (const x of p.widgets) {
        if (!x.shown) continue;
        const send = (v) => uiEvent(p.id, x.id, v);
        if (x.kind === 'label') body.push(h('div', { class: 'w' }, x.label));
        else if (x.kind === 'button') body.push(h('div', { class: 'w' }, h('button', { class: 'wbtn', onclick: () => send(1) }, x.label || 'button')));
        else if (x.kind === 'slider') {
          const num = h('span', { class: 'num' }, String(x.value));
          const r = h('input', { type: 'range', min: x.lo, max: x.hi, value: x.value, 'aria-label': x.label });
          r.addEventListener('input', () => { num.textContent = r.value; });
          r.addEventListener('change', () => send(Number(r.value)));
          inputs[x.id] = { el: r, num };
          body.push(h('label', { class: 'w' }, x.label, r, num));
        } else if (x.kind === 'toggle') {
          const cb = h('input', { type: 'checkbox' });
          cb.checked = !!x.value;
          cb.addEventListener('change', () => send(cb.checked ? 1 : 0));
          inputs[x.id] = { el: cb };
          body.push(h('label', { class: 'w' }, cb, x.label));
        } else if (x.kind === 'select') {
          const s = h('select', { 'aria-label': x.label }, ...x.options.map((o, i) => h('option', { value: i }, o)));
          s.value = x.value;
          s.addEventListener('change', () => send(Number(s.value)));
          inputs[x.id] = { el: s };
          body.push(h('label', { class: 'w' }, x.label, s));
        }
      }
      const el_ = h('div', { class: 'lpg-card' }, h('div', { class: 't' }, p.title || 'panel', h('small', {}, 'ui ' + p.id + ' · P' + p.owner)), ...body);
      return { el: el_, shape, inputs };
    }
    async function uiEvent(id, wid, value) {
      if (!L) return;
      usedTick = 0;
      const r = call('ui', [id, wid, value]);
      if (!r.value) return;
      const [owner, v] = r.value.split('|');
      if (!fire('on_ui_event', owner, 'n:' + id, 'n:' + wid, 'n:' + v)) noHook('on_ui_event');
      render();
    }

    function render() {
      if (L) {
        const r = call('snapshot', []);
        if (r.ok) snap = JSON.parse(r.value);
        else out('err', null, '[playground] ' + r.err);
      } else snap = null;
      const w = worldState();
      tick = w.tick;
      draw();
      renderHud(w);
      renderPanels(w);
      bSave.style.display = w.persist > 0 ? '' : 'none';
      status.textContent = 't=' + w.tick + (L && loaded ? ' · hooks: ' + (hooks ? hooks.split(',').join(', ') : 'none') : '');
    }

    // ---- wiring
    bRun.addEventListener('click', run);
    bTick.addEventListener('click', oneTick);
    bPlay.addEventListener('click', play);
    bSpeed.addEventListener('click', () => { speed = speed === 1 ? 0.25 : 1; bSpeed.textContent = speed === 1 ? '1×' : '¼×'; });
    bReset.addEventListener('click', () => {
      stop();
      ta.value = original;
      syncGutter();
      L = null; loaded = false; hooks = ''; snap = null; touching = false;
      if (evBtns.touch) evBtns.touch.classList.remove('on');
      store.clear();
      for (const c of cards.values()) c.el.remove();
      cards.clear();
      clearConsole();
      con.append(h('div', { class: 'empty' }, 'Press ▶ Run. print() and the engine calls show up here.'));
      render();
    });
    for (const k of events) evBtns[k].addEventListener('click', () => event(k));
    bSave.addEventListener('click', saveReload);

    if ('ResizeObserver' in window) new ResizeObserver(() => draw()).observe(canvas.parentElement);
    // Theme or skin changes: redraw.
    new MutationObserver(() => draw()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-skin', 'class', 'style'] });
    render();
  };
})();
