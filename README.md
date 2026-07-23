<p align="center">
  <img src="assets/img/logo.svg" alt="OpenMock" width="420" />
</p>

<p align="center"><strong>Source for <a href="https://openmock.dev">openmock.dev</a>, the OpenMock project website.</strong></p>

---

This repository holds the marketing/landing site for
[OpenMock](https://github.com/openmock-dev/openmock), an open format and data
model for defining API mocks in a single, portable file. The site is a **static,
dependency-free** HTML/CSS/JS page (no framework, no build step) so it deploys
straight to **GitHub Pages** and is served through the **Cloudflare** domain
[`openmock.dev`](https://openmock.dev).

## Layout

```
.
├── index.html              # landing page (single-page)
├── spec.html               # generated — the specification (docs layout)
├── schema.html             # generated — the JSON Schema viewer
├── examples.html           # generated — the examples gallery
├── serving.html            # generated — the serving guide
├── openmock-0.2.0.json     # generated — downloadable JSON Schema
├── content/                # SOURCE for the generated pages
│   ├── spec.md · serving.md · schema.json
│   └── examples/*.yml, *.proto, *.graphql
├── tools/build-docs.js     # generator: content/ -> the *.html doc pages
├── assets/
│   ├── css/styles.css      # design system + landing styles (light & dark)
│   ├── css/docs.css        # docs layout (sidebar, prose, schema viewer)
│   ├── js/main.js          # theme toggle, mobile nav, scroll reveal
│   ├── js/docs.js          # docs scrollspy + code highlighting
│   └── img/                # logo.svg, logo-dark.svg, icon.svg, og.svg
├── CNAME                   # custom domain for GitHub Pages (openmock.dev)
├── .nojekyll               # serve files as-is (skip Jekyll processing)
└── .github/workflows/deploy.yml   # GitHub Actions → GitHub Pages
```

## Documentation pages

`spec.html`, `schema.html`, `examples.html`, and `serving.html` are **generated**
from the source content in [`content/`](./content) by
[`tools/build-docs.js`](./tools/build-docs.js). To update them, edit the source
in `content/` (kept in sync with the [openmock](https://github.com/openmock-dev/openmock)
repo) and regenerate:

```console
$ npm install          # installs `marked` (dev-only)
$ npm run build:docs   # regenerates spec/schema/examples/serving .html
```

There is still **no build step for deployment**. The generated `.html` is
committed and served as-is. The generator is only for regenerating those pages
when the source content changes.

## Design

The look takes cues from clean, technical product sites (generous whitespace,
sticky nav, feature cards, dark-mode support) while using the **OpenMock brand
palette**, taken directly from the project logo:

| Token | Value | Use |
| ----- | ----- | --- |
| Lime (top) | `#86D624` | gradient start, accents |
| Lime (bottom) | `#76C81D` | gradient end, links |
| Charcoal | `#171717` | primary text / dark base |
| Off-white | `#FAFAFA` | text on dark |

Both light and dark themes are supported; the site follows the visitor's system
preference and remembers a manual toggle in `localStorage`.

## Develop locally

No tooling required. Open `index.html` directly, or serve the folder:

```console
$ python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy

Pushes to `main` are published automatically by
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). The custom
domain and Cloudflare DNS are documented in
[`DEPLOYMENT.md`](./DEPLOYMENT.md).

## License

MIT © OpenMock contributors. The OpenMock name and logo belong to the OpenMock
project ([openmock-dev/openmock](https://github.com/openmock-dev/openmock)).
