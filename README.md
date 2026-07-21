<p align="center">
  <img src="assets/img/logo.svg" alt="OpenMock" width="420" />
</p>

<p align="center"><strong>Source for <a href="https://openmock.dev">openmock.dev</a> — the OpenMock project website.</strong></p>

---

This repository holds the marketing/landing site for
[OpenMock](https://github.com/openmock-dev/openmock), an open format and data
model for defining API mocks in a single, portable file. The site is a **static,
dependency-free** HTML/CSS/JS page — no framework, no build step — so it deploys
straight to **GitHub Pages** and is served through the **Cloudflare** domain
[`openmock.dev`](https://openmock.dev).

## Layout

```
.
├── index.html              # the entire page (single-page landing site)
├── assets/
│   ├── css/styles.css      # design system + all styles (light & dark themes)
│   ├── js/main.js          # theme toggle, mobile nav, scroll reveal
│   └── img/
│       ├── logo.svg        # full wordmark (light backgrounds)
│       ├── logo-dark.svg   # full wordmark (dark backgrounds)
│       ├── icon.svg        # play-bars mark (favicon / nav)
│       └── og.svg          # social share card
├── CNAME                   # custom domain for GitHub Pages (openmock.dev)
├── .nojekyll               # serve files as-is (skip Jekyll processing)
└── .github/workflows/
    └── deploy.yml          # GitHub Actions → GitHub Pages
```

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
