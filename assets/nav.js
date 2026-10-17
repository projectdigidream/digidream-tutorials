// The site's table of contents. Every page is listed here once; site.js
// builds the sidebar, the prev/next links, progress and search from it.
// `kw` is extra words for search (UI labels a reader might type).
window.DNP_NAV = [
  {
    id: 'studio', title: 'Studio', icon: '◆', blurb: 'Maps, monsters, triggers, cameras, graphs, and shipping a module.',
    pages: [
      { file: 'studio/00-get-the-tools.html', title: 'Get the tools', kw: 'download install windows macos linux android apk release open anyway smartscreen play protect update backup' },
      { file: 'studio/01-getting-started.html', title: 'Getting started', kw: 'launch app home rail undo play export examples' },
      { file: 'studio/02-first-map.html', title: 'Your first map', kw: 'room tool corners rectangle floor ceiling light wall flags select' },
      { file: 'studio/03-placing-things.html', title: 'Placing things', kw: 'place palette spawn light monster prop facing dormant' },
      { file: 'studio/04-triggers.html', title: 'Triggers', kw: 'door lift switch teleport ambush exit crusher when if then' },
      { file: 'studio/05-camera.html', title: 'Camera and cinematics', kw: 'camera path waypoint follow track flythrough lock' },
      { file: 'studio/06-graphs.html', title: 'Graphs', kw: 'blueprint node variable pin link scene' },
      { file: 'studio/07-workshops.html', title: 'Monsters, weapons, player', kw: 'monster editor weapon editor behaviour states sentences graph phase recipe preview whatever it is doing missiles arsenal swing looks body player skin size moves kit controls keys' },
      { file: 'studio/08-look-and-feel.html', title: 'Sky, screens and weather', kw: 'sky strip panorama cube screens hud panels style fog rain snow dust embers' },
      { file: 'studio/09-plugins.html', title: 'Plugins', kw: 'plugin dnpplugin back to studio discard draft baker sources assets open with' },
      { file: 'studio/10-play-and-export.html', title: 'Play, export, snapshots', kw: 'play export import pack snapshots play log app android' },
      { file: 'studio/11-sync-with-github.html', title: 'Sync with GitHub', kw: 'sync github repository token devices backup commit conflict merge get private' },
    ],
  },
  {
    id: 'examples', title: 'Examples', icon: '📂', blurb: 'Two finished games to open and take apart: Gem Hollow, a platformer, and Cinderfall, a shooter.',
    pages: [
      { file: 'examples/01-gem-hollow.html', title: 'Gem Hollow, a tour', kw: 'example gem hollow platformer title menu world zones levers gates keys gems slimes bees snails cutscenes' },
      { file: 'examples/02-cinderfall.html', title: 'Cinderfall, a tour', kw: 'example cinderfall shooter fps districts hub metamap one world npc talk boss arms swap persist freedoom' },
    ],
  },
  {
    id: 'sprites', title: 'Sprites · ThreeSprite', icon: '🎞', blurb: 'Rigged, multi-angle pixel sprites that the studio bakes into atlases.',
    pages: [
      { file: 'sprites/01-first-sprite.html', title: 'Your first sprite', kw: 'new sprite views mirror canvas size sprite id' },
      { file: 'sprites/02-drawing.html', title: 'Drawing', kw: 'pencil eraser dither fill pick select move pan symmetry dim parts grid' },
      { file: 'sprites/03-rig.html', title: 'Rig, bones and parts', kw: 'bone part variant skin pivot foreshorten upright layer order' },
      { file: 'sprites/04-animate.html', title: 'Animating', kw: 'timeline keyframe onion fps loop ease key all' },
      { file: 'sprites/05-bone-animation.html', title: 'Bone animation: walk, swing, fall', kw: 'bone animation walk cycle attack swing death pose keyframe contact passing hierarchy rotation pitch roll yaw loop seam ease' },
      { file: 'sprites/06-preview-palettes-bake.html', title: '3D preview, palettes, baking', kw: '3d facing spread palette recolour export atlas bake world height solids' },
    ],
  },
  {
    id: 'textures', title: 'Textures · qPainter', icon: '🧱', blurb: 'Seamless, palette-locked pixel textures, animated walls and skies.',
    pages: [
      { file: 'textures/01-first-texture.html', title: 'Your first texture', kw: 'new texture size tools pencil soft brush ramp noise' },
      { file: 'textures/02-seamless.html', title: 'Seamless tiling', kw: 'wrap tiles offset symmetry mirror radial seam' },
      { file: 'textures/03-palettes-layers.html', title: 'Palettes, dither, layers', kw: 'palette lock snap ramp dither gradient layers' },
      { file: 'textures/04-frames-and-skies.html', title: 'Animation and skies', kw: 'frames fps sheet cut speed skybox strip panorama cube 3d preview' },
    ],
  },
  {
    id: 'music', title: 'Music · DigidreamSynth', icon: '♪', blurb: 'A deterministic MIDI synth and DAW: arrange, design patches, master, cue.',
    pages: [
      { file: 'music/01-daw-tour.html', title: 'A tour of the DAW', kw: 'start audio arrange track import mid msproj bpm loop' },
      { file: 'music/02-piano-roll.html', title: 'Piano roll and recording', kw: 'draw select erase velocity cc lane record quantize snap swing' },
      { file: 'music/03-patches.html', title: 'Designing patches', kw: 'oscillator wavetable envelope adsr filter lfo mod matrix drum kit bank' },
      { file: 'music/04-mastering.html', title: 'Mastering', kw: 'eq compressor limiter width dither reverb chorus delay' },
      { file: 'music/05-loops-and-cues.html', title: 'Loops, cuts and cues', kw: 'cut loop mstk bake cue loop end next bar music page trigger' },
    ],
  },
  {
    id: 'sounds', title: 'Sounds · DigidreamSound', icon: '🔊', blurb: 'Game sound effects from recipes, layers and struck bodies.',
    pages: [
      { file: 'sounds/01-first-sound.html', title: 'Your first sound', kw: 'start from recipe gunshot randomize vary new sound library' },
      { file: 'sounds/02-shape-and-layers.html', title: 'Shape and layers', kw: 'volume pitch length brightness layer noise tone metal rings envelope' },
      { file: 'sounds/03-takes-and-in-game.html', title: 'Takes and in-game rules', kw: 'takes weight group importance at most minimum gap distance duck music' },
      { file: 'sounds/04-mix-and-ship.html', title: 'Mix, test and ship', kw: 'mix test groups effects master flood sfxb sound pack priority dnp.sound' },
    ],
  },
  {
    id: 'enemies', title: 'Enemies', icon: '☠', blurb: 'Monsters from body to brain: states, senses, attacks, missiles, pain, death and drops.',
    pages: [
      { file: 'enemies/01-first-monster.html', title: 'Your first monster', kw: 'monster workshop body sprite height speed radius place dormant spawn' },
      { file: 'enemies/02-the-brain.html', title: 'The brain: states and transitions', kw: 'brain state transition condition see target chase wander idle think ticks' },
      { file: 'enemies/03-attacks.html', title: 'Attacks: swings and missiles', kw: 'swing melee reach hitscan bullets missile projectile fire spread cooldown' },
      { file: 'enemies/04-pain-death-drops.html', title: 'Pain, death and drops', kw: 'hp health pain flinch pain time death drops gib corpse sounds vars' },
      { file: 'enemies/05-recipes.html', title: 'Recipes: five enemies', kw: 'imp charger turret sniper boss phases recipe' },
    ],
  },
  {
    id: 'weapons', title: 'Weapons', icon: '🔫', blurb: 'Guns and blades: phases, hitscan, missiles, swings, ammo, pickups and the arsenal.',
    pages: [
      { file: 'weapons/01-first-weapon.html', title: 'Your first weapon', kw: 'weapon editor recipe preview overview behaviour looks advanced arsenal kit slot select view model first person' },
      { file: 'weapons/02-phases.html', title: 'The phase machine', kw: 'phase state rule condition step timeline graph ticks ready fire refire cooldown set_cooldown cooldown_ready negate always held released' },
      { file: 'weapons/03-hitscan-missiles-swings.html', title: 'Hitscan, missiles and swings', kw: 'hitscan instant shot rays count spread missile missiles page arc bounce split homing rocket swing slash melee chainsaw damage range prediction' },
      { file: 'weapons/04-ammo-and-pickups.html', title: 'Ammo, pickups and the arsenal', kw: 'ammo pool use ammo pickup grant health armor arsenal order place on the panel' },
      { file: 'weapons/05-recipes.html', title: 'Recipes: five weapons', kw: 'pistol shotgun chaingun rocket launcher chainsaw charge bfg cooldown recipe revolver limits' },
    ],
  },
  {
    id: 'graphs', title: 'Graph scripting', icon: '◇', blurb: 'Make maps and games react: events, flow, data, variables, the world, scenes and debugging.',
    pages: [
      { file: 'graphs/01-thinking-in-graphs.html', title: 'Thinking in graphs', kw: 'event flow data pin link run order node' },
      { file: 'graphs/02-variables-and-numbers.html', title: 'Variables, numbers and saving', kw: 'variable number counter persist save fx int bool' },
      { file: 'graphs/03-map-logic.html', title: 'Map logic recipes', kw: 'door key secret ambush wave spawner arena lock switch counter' },
      { file: 'graphs/04-the-world.html', title: 'Talking to the world', kw: 'sector look light sound music camera scene panel ui entity property' },
      { file: 'graphs/05-game-graph-and-calls.html', title: 'The game graph, calls and maps', kw: 'game graph call answer change map slot shared module' },
      { file: 'graphs/06-debugging.html', title: 'Debugging graphs', kw: 'problems refused play log debug overlay test' },
    ],
  },
  {
    id: 'advanced', title: 'Advanced · Lua scripting', icon: '⚙', blurb: 'Script the engine in Lua from inside the studio: events, the world, panels, saving, and when to use Lua over a graph.',
    pages: [
      { file: 'advanced/01-lua-in-the-studio.html', title: 'Lua in the studio', kw: 'lua script scripts page extra lua code editor play log first script luajit' },
      { file: 'advanced/02-events-and-time.html', title: 'Events and time', kw: 'hook on_tick on_prop_use on_cross on_touch on_attack timer tick 60 deferred random determinism fx' },
      { file: 'advanced/03-the-world.html', title: 'Touching the world', kw: 'entity prop sector move_parametric light texture effect spawn mobs hitscan sound music vfx' },
      { file: 'advanced/04-panels-hud-camera.html', title: 'Panels, HUD and camera', kw: 'ui_open ui_set on_ui_event hud camera screen fade letterbox sky' },
      { file: 'advanced/05-state-and-bridges.html', title: 'State, saving and bridges', kw: 'persist persist_player restoring store_save store_load graphs triggers counter property change_map export call' },
      { file: 'advanced/06-recipes.html', title: 'Recipes: six scripts', kw: 'arena waves pressure plate shop day night checkpoint score recipe' },
      { file: 'advanced/07-lua-or-graphs.html', title: 'Lua or graphs, and debugging', kw: 'graph lua node when to use budget instruction debug play log errors trust strict' },
    ],
  },
  {
    id: 'luaref', title: 'Lua reference', icon: '📖', blurb: 'Every function, method, hook and table a script can reach, checked against the engine.',
    pages: [
      { file: 'luaref/01-environment.html', title: 'The Lua environment', kw: 'luajit lua 5.1 standard library string table math sandbox trust budget print error load order globals' },
      { file: 'luaref/02-every-function.html', title: 'Every function', kw: 'dnp entity prop sector hook fx vec3 mobs triggers graphs weapons reference api' },
      { file: 'luaref/03-cheat-sheet.html', title: 'Cheat sheet', kw: 'cheat sheet signatures printable one page' },
    ],
  },
  {
    id: 'reference', title: 'Reference', icon: '⌘', blurb: 'Every shortcut, every file, every word.',
    pages: [
      { file: 'reference/shortcuts.html', title: 'All shortcuts', kw: 'keys keyboard shortcut trainer' },
      { file: 'reference/files.html', title: 'Files and baking', kw: 'sources assets bake tsprite texproj msproj mstk sfxproj module.txt' },
      { file: 'reference/graph-nodes.html', title: 'Every graph node', kw: 'node vocabulary event action condition data pin property' },
      { file: 'reference/monster-vocab.html', title: 'Every monster word', kw: 'mob vocabulary action condition state field missile drop' },
      { file: 'reference/weapon-vocab.html', title: 'Every weapon word', kw: 'weapon vocabulary phase swing ammo pickup action condition' },
      { file: 'reference/glossary.html', title: 'Glossary', kw: 'words terms' },
    ],
  },
];
