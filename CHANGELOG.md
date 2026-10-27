# Changelog

What changed in each release of the tutorials, fixes first. Kept as fixes land:
anything not released yet is under **Unreleased**.

## Unreleased

### Changed

- **For the development versions** (studio 0.4.2.11, engine 0.2.3.11). A
  "dev" badge marks what only the development releases have, which the stable
  studio 0.4.2 doesn't yet.
  - **Studio, maps and the app:**
    - stable and development releases, and the studio updating itself;
    - the sidebar in groups;
    - several rooms at once, and snapping to the grid or not;
    - platforms across rooms, and how big a map can be;
    - things lit by the map, and "its own light";
    - a PNG imported as a sheet;
    - Play showing the colliders;
    - the plugins sharing the module's palette and textures.

    Screenshots are retaken.
  - **Plugins** (ThreeSprite 0.2.4, qPainter 0.2.1, DigidreamSynth 0.2.1,
    DigidreamSound 0.2.1):
    - the module's palette and textures, from both ThreeSprite and qPainter;
    - a texture brought in as a sprite part;
    - exporting some parts on their own;
    - a sprite with no animations drawn as a still;
    - number boxes on qPainter's sliders;
    - autosave in the sound tool and the DAW;
    - their flat icons.
  - **Graphs, Lua and Reference:**
    - the per-player looks nodes, change_player_setting, and the movement and meter nodes;
    - camera_follow's automatic camera, and set_sector_effect's fill;
    - the graph board's new warnings, and errors from Play shown on the board;
    - the Lua reference matching engine 0.2.3.11: movement states, meters, moves, layers, `e:set_anim` and `mobs.assists`;
    - scripts are Lua 5.1 only;
    - the studio's new keys;
    - glossary entries, and the new module.txt and map lines.
  - **Enemies and Weapons:**
    - aim assist per weapon, and its reach;
    - "its own light" for monsters, missiles and pickups;
    - the bigger default missile with a trail of its own, and the small-missile flag;
    - a sprite with no animations drawn as a still;
    - a PNG imported as a sheet.
  - **Studio player, camera, graphs and effects:**
    - two new lessons: "How the player moves" (movement states, meters, layered moves, ledge grab, coyote time, a variable jump, and a "Which way out?" demo) and "Effect areas, water and fills";
    - the camera behind the player;
    - the graph board's warnings, and errors from Play;
    - aim assist and "its own light" in the workshops;
    - the Sky preview and the starter's controls panel.
- **For studio 0.3.4 and engine 0.2.0.** The Enemies and Weapons tracks, and
  the studio's workshop lesson, teach the new monster and weapon editors:
  - their tabs, and rules written as sentences;
  - the graph in phase lanes, the live preview, the recipes and "+ phase";
  - the new Missiles page.

  Also new in the pages:
  - **Monsters:** pain that returns to what a monster was doing (`@previous`), teleporting, and a monster's state kept in a save.
  - **Weapons:** weapon cooldowns, and negated weapon conditions.
  - **Missiles:** missiles that bounce, home after a delay, lead their target and launch missiles, and gravity that flies a real arc.
  - **Sprites:** the per-animation "loops" switch, and editing an imported sheet's animations.
  - **Player and maps:** the player's skin tab, and a map's cell outlined on the world grid.
  - **Sync:** the GitHub sync fixes.

  Screenshots are retaken from the new editors.
- **For ThreeSprite 0.2.2 and qPainter 0.2.0** (studio 0.4.1). The Sprites and Textures tracks teach:
  - the New sprite form's "How is it seen?";
  - the canvas background, the bones toggle, and move arrows that say the screen's direction;
  - variants keyed in Animate, and touch strokes and long-press picks;
  - the Export tab, and saving as you go;
  - qPainter's flat tool icons, its palette at the top of the panel, and the calmer top bar;
  - a 2:1 sky strip imported as a still picture.

  Screenshots are retaken.
- **Enemies and Weapons, for studio 0.4.1 and engine 0.2.2:**
  - a swing is a step with its own numbers, plus "more of it" on every step, and the default swing on Advanced;
  - a newer swing replaces one still sweeping;
  - a weapon state's older swing form, and turning it into a step;
  - the Blade recipe;
  - missile trails, and a missile with no launch height leaving from the middle;
  - melee needs a clear reach;
  - the three pickup buttons, each starting as what it says;
  - Looks offers only the sides a sprite has;
  - a first-person gun shows its shot.

  Screenshots are retaken without colour emoji.
- **The Studio track and the examples, for studio 0.4.1:**
  - The door preset writes three cards. E on an open door does nothing, and the door shuts by itself after 4 s.
  - Trigger events are listed name first.
  - What a new module holds: the death screen and key hints as game graphs, the door, and particle kinds 20 to 22.
  - A Particles section: "drawn as" and "on a body".
  - Deleting a room takes its triggers. Slider numbers can be typed.
  - Moving a module by its id, and "delete a module…".
  - A plugin editor's bar says when its changes are kept.

  The playtest fixes are covered where their features are taught, and screenshots are retaken.
- **Graphs, engine 0.2.2:** a game graph hears deaths and hurts on any map. A
  worked example is the starter's death screen, and there is an exercise for
  your own. Advanced covers `mobs.hurt` taking the attacker, `e:swing()`,
  `dnp.can_reach` and trails. The glossary adds game graph, death screen and
  trail, and rewrites swing. The shortcuts say ⌘V no longer switches to the
  game view.
- **Flat glyphs**: no colour emoji as icons in the sidebar, the landing page or
  the studio's labels quoted in the pages, as the studio dropped them (0.4.1).
- **Written for people who use the apps**, not build them: no terminal, build
  or repository steps. A first lesson, Get the tools, covers downloading,
  installing past each system's first-launch warning, and updating.
  Cinderfall opens from Home → examples.
- `tools/build-vocab.mjs` and `tools/check-lua-ref.mjs` read the engine at a
  commit (`HEAD`, or `--rev`), not its working tree. The tutorials teach what
  is committed, never work in progress.

### Added

- **Markers** (studio 0.4.0, engine 0.2.1): a Graph scripting lesson on
  health bars, signs and pointers hung on things in the world. It covers:
  - designing their looks in Screens → markers;
  - a monster's "A bar over it";
  - signs placed on a map;
  - the `mark`, `set_marker` and `remove_marker` nodes and their template picker;
  - the four built-in templates, and the debug overlay's health counters.

  The Lua reference gains `dnp.mark`, `dnp.mark_set`, `dnp.unmark` and `dnp.debug_overlay`.
- **For studio 0.4.0:**
  - a new module asks what kind of game it is;
  - each map in the Maps list has its own Play;
  - a wall's texture can be turned and sized;
  - missiles get a picture of their own, and shots draw their ray and where they land;
  - a recipe's weapon gets a placeholder gun;
  - the Play log counts Lua errors;
  - Android's Back button and keyboard work as expected.
- **Lua reference, engine 0.2.2**:
  - `dnp.can_reach` (the clear reach a melee blow needs) and `e:swing()`;
  - trails that follow a body: `e:set_trail` and `p:set_trail`, and `trail()` to read them;
  - `mobs.hurt` takes the attacking entity itself.
- **Advanced · Lua scripting**: seven lessons, and a playground that runs your
  Lua against a toy level answering to the engine's names.
- **Lua reference**: the environment, every function, method and hook (with
  `fx.sqrt`, `dnp.place` and `e:input_tick()` from engine 0.2.0), and a
  printable cheat sheet. `tools/check-lua-ref.mjs` checks it against the
  engine.
- **Sync with GitHub**: a lesson on the studio's Sync page.
- Every track folder opens on an overview of its lessons.

## 0.1.0 -- 2026-10-14

The first public release.
