# Writing a tutorial page

The site is static: plain HTML, one stylesheet, one script. No build step. To add a page:

1. Write the page.
2. List it in `assets/nav.js`.

## The page skeleton

Pages are one folder deep (`studio/`, `sprites/` …), so assets are at `../assets/`.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page title · Digidream Studio tutorials</title>
<meta name="description" content="One sentence.">
<link rel="stylesheet" href="../assets/site.css">
<link rel="stylesheet" href="../assets/skins/skins.css">
<link rel="icon" type="image/png" href="../assets/logo.png">
<script src="../assets/skins/skins.js"></script>
<script src="../assets/skin.js"></script>
<script defer src="../assets/nav.js"></script>
<script defer src="../assets/shortcuts.js"></script>
<script defer src="../assets/site.js"></script>
</head>
<body>
<article>
  <h1>Page title</h1>
  <p class="lede">One or two sentences: what you will be able to do.</p>
  <div class="goal"><b>You'll learn</b><span>…</span><b>Time</b><span>10 min</span><b>Needs</b><span>…</span></div>
  … content …
</article>
</body>
</html>
```

`site.js` adds the rest around the `<article>`:

- the top bar, sidebar and search;
- the breadcrumbs, prev/next links and progress bar;
- the step checkboxes.

## Building blocks

| Markup | Gives |
|---|---|
| `<span class="ui">⇪ export</span>` | a UI label, styled as a chip. **Copy the label exactly from the code.** |
| `<kbd>⌘Z</kbd>` | a key |
| `<ol class="steps"><li>…</li></ol>` | numbered steps. Each gets a tick box, and the ticks are what count as progress. A page is "done" when every step is ticked. |
| `<div class="callout tip\|warn\|soon">` | a callout. Use `soon` for things that are not finished or not wired yet. |
| `<span class="dev">studio 0.4.3.1</span>` | a badge for a feature only the development releases have (not yet the stable studio): put it after the heading or at the start of the paragraph that teaches it, naming the first release that has it. It reads "dev · studio 0.4.3.1". When a stable release takes the feature in, remove its badges (grep `class="dev"`). |
| `<pre><code>…</code></pre>` | code or commands, with a copy button added automatically |
| `<div class="quiz" data-answer="N">` | a multiple-choice quiz. Inside: `<p class="q">`, a `<ul>` of `<li>` options (`N` is the 0-based index of the right one), then `<p class="why">`. |
| `<figure class="shot" data-src="../assets/shots/NAME.png" data-alt="…" data-hotspots='[{"x":10,"y":20,"t":"Label","d":"what it does"}]'><figcaption>…</figcaption></figure>` | a screenshot with numbered hotspots. `x` and `y` are percentages of the image. |
| `<div class="widget trainer" data-tool="studio\|sprites\|textures\|music\|sounds"></div>` | the shortcut trainer for that tool |
| `<div class="shortcut-table" data-tool="…\|all"></div>` | a filterable shortcut table. The data is in `assets/shortcuts.js`. |
| `<div class="widget" data-widget="NAME" data-title="…"></div>` | an interactive demo, from `assets/widgets/NAME.js` |
| `<div class="diagram"><svg>…</svg></div>` | an inline diagram. Use the classes `box`, `acc`, `arrow` and `dim`, so it follows the theme. |

## Widgets

`assets/widgets/NAME.js` is a classic script, not a module, so that the site also works from `file://`. It registers itself like this:

```js
(function () {
  window.DNPW = window.DNPW || {};
  window.DNPW['NAME'] = function mount(el, opts) { /* build inside el */ };
})();
```

- `opts` holds the element's `data-*` attributes.
- Use the `.wrow`, `.wbtn`, `.wlabel` and `.wout` classes.
- For sound, use `window.DNPAudio.ctx()`. It creates the AudioContext, and must only be called from a click.
- The page wears one of the five shipped uikit skins (the reader picks). Use the site's variables (`--bg`, `--panel`, `--accent`, `--accent-ink`, `--text`…), never fixed colours, so every skin and mode works.
- Read colours from CSS variables with `getComputedStyle(document.documentElement).getPropertyValue('--accent')`, so canvases follow the theme.
- `window.DNPh(tag, attrs, ...children)` builds elements.

## Content rules

- **Write for people who use the downloaded apps:** Digidream Studio, or a standalone tool's release. Readers never build anything and have no repository checkout. So no terminal commands, build scripts, dev servers, ports or `node`/`pnpm`. To get a tool, link to [Get the tools](studio/00-get-the-tools.html). To open an example, use the studio's Home → examples.
- Quote UI labels exactly as the code writes them, including their emoji.
- Mark anything unfinished with a `soon` callout. Do not teach it as working.
- Use relative links only, so the folder can be hosted under any path.
