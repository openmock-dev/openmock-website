# Deploying openmock.dev

The site is a static page hosted on **GitHub Pages** and served through
**Cloudflare** for the apex domain `openmock.dev` (and `www`). This guide covers
both halves: enabling Pages, and pointing Cloudflare DNS at it.

There is **no build step**. The repository root *is* the site. A GitHub Actions
workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml))
uploads the root and deploys it whenever `main` changes.

---

## 1. Enable GitHub Pages

1. Merge this branch into **`main`** (the workflow deploys on push to `main`).
2. In the `openmock-dev/openmock-website` repo, go to
   **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
   (The included workflow uses `actions/deploy-pages`, so you do *not* select a
   branch here. Actions is the source.)
4. Push to `main`, or run the **Deploy to GitHub Pages** workflow manually from
   the **Actions** tab. The first successful run publishes the site to the
   default `*.github.io` URL.

### Custom domain

The repo ships a [`CNAME`](./CNAME) file containing `openmock.dev`, so GitHub
automatically sets the custom domain on deploy. To confirm:

1. **Settings → Pages → Custom domain** should read `openmock.dev`.
2. After Cloudflare DNS resolves (below), tick **Enforce HTTPS**.

> GitHub serves `www.openmock.dev` and `openmock.dev` interchangeably once the
> apex is configured; the redirect direction is decided by which name is set as
> the custom domain (here, the apex `openmock.dev`).

---

## 2. Point Cloudflare at GitHub Pages

`openmock.dev` is managed in Cloudflare. GitHub Pages serves the content;
Cloudflare provides DNS (and, optionally, its proxy/CDN).

### 2a. DNS records

In the Cloudflare dashboard → your account → **openmock.dev** → **DNS →
Records**, create the following. GitHub Pages' apex IPs are stable and
documented by GitHub; add all four A records (and the IPv6 AAAA records if you
want IPv6).

**Apex (`openmock.dev`), A records → GitHub Pages:**

| Type | Name | Value            |
| ---- | ---- | ---------------- |
| A    | `@`  | `185.199.108.153` |
| A    | `@`  | `185.199.109.153` |
| A    | `@`  | `185.199.110.153` |
| A    | `@`  | `185.199.111.153` |

**Optional IPv6 (AAAA records → GitHub Pages):**

| Type | Name | Value                        |
| ---- | ---- | ---------------------------- |
| AAAA | `@`  | `2606:50c0:8000::153`        |
| AAAA | `@`  | `2606:50c0:8001::153`        |
| AAAA | `@`  | `2606:50c0:8002::153`        |
| AAAA | `@`  | `2606:50c0:8003::153`        |

**`www` subdomain → your GitHub Pages host:**

| Type  | Name  | Value                              |
| ----- | ----- | ---------------------------------- |
| CNAME | `www` | `openmock-dev.github.io`           |

> `openmock-dev.github.io` is the org's Pages host. The `CNAME` file's
> `openmock.dev` value tells GitHub which name is canonical; the `www` CNAME
> lets GitHub redirect it to the apex.

Confirm these are the current GitHub Pages IPs in GitHub's docs
("Managing a custom domain for your GitHub Pages site") before relying on them.
GitHub occasionally updates the set.

### 2b. Proxy status (orange vs. grey cloud)

You have two valid options:

- **Grey cloud (DNS only), recommended to start.** Cloudflare only resolves
  DNS; GitHub Pages terminates TLS with its own Let's Encrypt certificate. This
  is the simplest path and lets GitHub's **Enforce HTTPS** work immediately.
- **Orange cloud (proxied).** Cloudflare's CDN/proxy sits in front. If you
  enable this, set **SSL/TLS → Overview → encryption mode** to **Full**
  (not *Flexible*: Flexible causes redirect loops with Pages). Keep the records
  grey-clouded until GitHub has issued its certificate (custom-domain HTTPS
  shows "certificate active" in **Settings → Pages**), then switch to orange if
  you want the CDN.

### 2c. SSL/TLS settings (if proxied)

Cloudflare dashboard → **SSL/TLS**:

- **Overview → mode:** `Full` (or `Full (strict)` once GitHub's cert is live).
- **Edge Certificates → Always Use HTTPS:** On.
- **Edge Certificates → Automatic HTTPS Rewrites:** On.

---

## 3. Verify

```console
# DNS resolves to GitHub Pages IPs
$ dig +short openmock.dev
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153

# www redirects to the apex
$ curl -sI https://www.openmock.dev | grep -i location

# apex serves the site over HTTPS
$ curl -sI https://openmock.dev | head -n1
HTTP/2 200
```

In the repo, **Settings → Pages** should show:
*"Your site is live at https://openmock.dev"* with **Enforce HTTPS** enabled.

---

## Troubleshooting

| Symptom | Likely cause / fix |
| ------- | ------------------ |
| `Domain does not resolve to the GitHub Pages server` | DNS not propagated yet, or A records wrong. Re-check the four apex A records; wait for propagation. |
| Redirect loop / `ERR_TOO_MANY_REDIRECTS` | Cloudflare SSL mode is *Flexible* while proxied. Set it to **Full**. |
| HTTPS unavailable / cert stuck | Keep records **grey-clouded** until GitHub issues the cert (Settings → Pages), then re-enable proxy. Removing/re-adding the custom domain forces GitHub to re-request the cert. |
| `CNAME` keeps disappearing | Every deploy must include the `CNAME` file. It lives at the repo root here, so the "upload whole repo" workflow preserves it. |
| 404 on assets | Ensure `.nojekyll` is present so GitHub serves files verbatim. |

## References

- GitHub Docs: *Managing a custom domain for your GitHub Pages site*
- GitHub Docs: *About GitHub Pages and Cloudflare*
- Cloudflare Docs: *DNS records* and *SSL/TLS encryption modes*
