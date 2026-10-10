# Digidream Studio tutorials

Interactive tutorials for the studio and its four plugin editors: ThreeSprite (sprites), qPainter (textures), DigidreamSynth (music) and DigidreamSound (sound effects).

The site is static: plain HTML, CSS and JavaScript, with no build step, no server code and nothing fetched from other sites. All links are relative, so it works under any path.

## Host it

Any static host serves this folder as it is: GitHub Pages, Netlify, Cloudflare Pages, S3, or nginx. To try it locally:

```sh
python3 -m http.server -d tutorials 8970   # then open http://localhost:8970/
```

Opening `index.html` straight from disk (`file://`) works too. The one difference is that search then only matches page titles, because full-text search needs to fetch the pages over HTTP.

## What's inside

- `index.html`: the landing page and learning paths.
- `studio/`, `sprites/`, `textures/`, `music/`, `sounds/`, `enemies/`, `weapons/`, `graphs/`: the tracks.
- `reference/`: all shortcuts, files and baking, and a glossary.
- `assets/site.css`, `assets/site.js`: the shell (sidebar, search, progress, quizzes, shortcut trainers, screenshot hotspots).
- `assets/nav.js`: the table of contents. `assets/shortcuts.js`: every shortcut.
- `assets/widgets/`: the interactive demos (room drawing, sprite views, seamless tile painter, ADSR synth, cue timeline, SFX toy, graph toy…).
- `assets/shots/`: screenshots of the real tools.
- `assets/data/vocab-*.js`: the engine's graph, monster and weapon vocabularies, behind the generated reference pages. They are generated, so don't edit them. After the engine's vocabulary changes, regenerate them:

  ```sh
  node tutorials/tools/build-vocab.mjs
  ```

Pages can wear any of the five skins uikit ships (claude, paper, 90s, ps1, aero), in any of each skin's modes. Readers choose from the skin button in the top bar, and Auto follows the system's light or dark setting. The skin CSS in `assets/skins/` is generated from `uikit/skins` by uikit's own compiler. After a skin changes, regenerate it:

```sh
node tutorials/tools/build-skins.mjs
```

The logo (`assets/logo.png`) is a copy of `branding/digidream-logo.png`.

Progress (ticked steps) is kept in the reader's own browser, in localStorage. Nothing is sent anywhere.

To add or change a page, see `AUTHORING.md`.
