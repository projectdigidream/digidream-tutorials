// The site's table of contents. Every page is listed here once; site.js
// builds the sidebar, the prev/next links, progress and search from it.
// `kw` is extra words for search (UI labels a reader might type).
window.DNP_NAV = [
  {
    id: 'studio', title: 'Studio', icon: '◆', blurb: 'Maps, monsters, triggers, cameras, graphs, and shipping a module.',
    pages: [
      { file: 'studio/01-getting-started.html', title: 'Getting started', kw: 'launch devserver 8080 home rail undo app play export' },
      { file: 'studio/02-first-map.html', title: 'Your first map', kw: 'room tool corners rectangle floor ceiling light wall flags select' },
      { file: 'studio/03-placing-things.html', title: 'Placing things', kw: 'place palette spawn light monster prop facing dormant' },
      { file: 'studio/04-triggers.html', title: 'Triggers', kw: 'door lift switch teleport ambush exit crusher when if then' },
      { file: 'studio/05-camera.html', title: 'Camera and cinematics', kw: 'camera path waypoint follow track flythrough lock' },
      { file: 'studio/06-graphs.html', title: 'Graphs', kw: 'blueprint node variable pin link scene' },
      { file: 'studio/07-workshops.html', title: 'Monsters, weapons, player', kw: 'brain swing body missiles arsenal kit moves skin size controls keys' },
      { file: 'studio/08-look-and-feel.html', title: 'Sky, screens and weather', kw: 'sky strip panorama cube screens hud panels style fog rain snow dust embers' },
      { file: 'studio/09-plugins.html', title: 'Plugins', kw: 'plugin dnpplugin back to studio discard draft baker sources assets open with' },
      { file: 'studio/10-play-and-export.html', title: 'Play, export, snapshots', kw: 'play export import pack snapshots play log app android' },
    ],
  },
  {
    id: 'sprites', title: 'Sprites · ThreeSprite', icon: '🎞', blurb: 'Rigged, multi-angle pixel sprites that the studio bakes into atlases.',
    pages: [
      { file: 'sprites/01-first-sprite.html', title: 'Your first sprite', kw: 'new sprite views mirror canvas size sprite id' },
      { file: 'sprites/02-drawing.html', title: 'Drawing', kw: 'pencil eraser dither fill pick select move pan symmetry dim parts grid' },
      { file: 'sprites/03-rig.html', title: 'Rig, bones and parts', kw: 'bone part variant skin pivot foreshorten upright layer order' },
      { file: 'sprites/04-animate.html', title: 'Animating', kw: 'timeline keyframe onion fps loop ease key all' },
      { file: 'sprites/05-preview-palettes-bake.html', title: '3D preview, palettes, baking', kw: '3d facing spread palette recolour export atlas bake world height solids' },
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
    id: 'reference', title: 'Reference', icon: '⌘', blurb: 'Every shortcut, every file, every word.',
    pages: [
      { file: 'reference/shortcuts.html', title: 'All shortcuts', kw: 'keys keyboard shortcut trainer' },
      { file: 'reference/files.html', title: 'Files and baking', kw: 'sources assets bake tsprite texproj msproj mstk sfxproj module.txt' },
      { file: 'reference/glossary.html', title: 'Glossary', kw: 'words terms' },
    ],
  },
];
