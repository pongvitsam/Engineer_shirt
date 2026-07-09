# AGENTS.md

Guidance for AI agents working in this repository.

## Project overview

**PEACE Engineer Club Shirt Sales System** — regional sales/stock/order management for PEA engineer-club polo shirts (Thai UI).

| Layer | Location | Runtime |
|-------|----------|---------|
| Backend | `Code.js`, `appsscript.json` | Google Apps Script (V8) |
| Source UI | `Index.html`, `CSS.html`, `JavaScript.html` | Built into `docs/` for GitHub Pages |
| Static deploy | `docs/` | GitHub Pages or any static file server |
| Build | `scripts/build-github-pages.cjs` | Node.js (npm) |

There is no local backend emulator. The browser app talks to a **deployed GAS web app** via JSONP (`?rpc=1`).

## Cursor Cloud specific instructions

### Automatic startup (update script)

On each VM session, run `npm install` only. Do **not** start servers in the update script.

### First-time / manual dev workflow

1. `npm install`
2. `npm run build:pages` — regenerates `docs/assets/*`, `docs/index.html`, `docs/config.js` from GAS HTML sources
3. Serve `docs/` locally, e.g. `npx --yes serve docs -l 8080` (use tmux for long-running serve)
4. Open `http://127.0.0.1:8080/` — app uses `docs/config.js` → live GAS `apiUrl`

Optional env vars for build:

- `PEACE_GAS_API_URL` — override GAS deployment URL in generated `docs/config.js`
- `PEACE_GITHUB_PAGES_URL` — override Pages base URL

### Services

| Service | Required for dev | Notes |
|---------|------------------|-------|
| Node + npm | Yes (build) | Node ≥ 18 recommended (Playwright). Not pinned in repo. |
| Static server on `docs/` | Yes (local UI) | Production alternative: https://pongvitsam.github.io/Engineer_shirt/ |
| Deployed GAS web app | Yes (API) | Default URL is baked into `scripts/build-github-pages.cjs` and `docs/config.js` |
| Google Sheets + Drive | Yes (data) | Owned by the GAS deployment; not run locally |
| clasp | No (runtime) | `clasp push` / deploy when changing `Code.js` or GAS HTML |

### Lint / tests

- **No ESLint** or formatter config in the repo.
- `npm test` runs `__test_*.cjs` files that are **gitignored** (`__*` in `.gitignore`). On a clean clone, `npm test` fails with `MODULE_NOT_FOUND` until those local test files exist.
- `npm run build:pages` is the reliable automated check available in every clone.

### Default test credentials (seeded in GAS when Users sheet is empty)

| User | Password | Role |
|------|----------|------|
| `admin1` | `Admin@2569` | admin |
| `user_n1` | `Peace@2569` | user (region กฟน.1) |

### GAS / clasp (backend changes)

```bash
npm i -g @google/clasp   # if needed
clasp login
clasp push
# Redeploy web app in Google Apps Script; update PEACE_GAS_API_URL if URL changes
npm run build:pages
```

- Public users: GitHub Pages / local `docs/`
- Admin-only legacy UI: GAS URL with `?gas=1` (needed for large uploads; JSONP payload limit ~1800 chars)

### Gotchas

- After editing `Index.html`, `CSS.html`, or `JavaScript.html`, always run `npm run build:pages` before testing `docs/`.
- JSONP GET to GAS may redirect; browsers follow redirects automatically; `curl` needs `-L`.
- `npm install` may touch `package-lock.json`; only commit lockfile changes when intentionally upgrading deps.
