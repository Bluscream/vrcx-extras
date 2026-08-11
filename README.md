# VRCX-Extras

A companion app for [VRCX](https://github.com/vrcx-team/VRCX) on Linux. It reads your existing
VRCX database and Proton prefix to answer questions VRCX itself does not, and to manage the
VRChat settings that live outside the game — the Wine registry, `config.json`, and Steam launch
options.

Ships as a single executable with the UI embedded. Download it, run it, and it opens in its own
window.

> **Linux/Proton focused.** The registry and launch-option features drive a Wine prefix and Steam's
> `localconfig.vdf`, so they assume VRChat installed through Steam Play. The database features work
> anywhere VRCX does.

## Screenshots

<!-- Hosted on the orphan `assets` branch so the PNGs stay out of the source tree. -->


| | |
|:--:|:--:|
| <img src="https://raw.githubusercontent.com/Bluscream/vrcx-extras/assets/screenshots/player-links.png" alt="Instance Links page showing overlapping sessions between two players" width="100%"> | <img src="https://raw.githubusercontent.com/Bluscream/vrcx-extras/assets/screenshots/backups.png" alt="Proton Registry page comparing the live registry against a backup snapshot" width="100%"> |
| **Instance Links** — where you and other players actually crossed paths | **Proton Registry** — diff snapshots against your live prefix |
| <img src="https://raw.githubusercontent.com/Bluscream/vrcx-extras/assets/screenshots/cmdline.png" alt="Command Line page listing environment variables and launch flags with descriptions" width="100%"> | <img src="https://raw.githubusercontent.com/Bluscream/vrcx-extras/assets/screenshots/config.png" alt="VRChat Config page showing config.json settings as editable cards" width="100%"> |
| **Command Line** — documented launch flags and env vars | **VRChat Config** — `config.json` as a typed form |
| <img src="https://raw.githubusercontent.com/Bluscream/vrcx-extras/assets/screenshots/settings.png" alt="Settings page with definition source URLs, cache controls and path configuration" width="100%"> | |
| **Settings** — definition sources, cache and paths | |

## Features

### Instance Links

Pick two or more players and get every instance you were in together: total time, session count,
worlds, and the longest and first overlap. Sessions are derived from VRCX's own join/leave records,
so it covers as far back as your database goes.

The selection lives in the URL (`/player-links?users=usr_…,usr_…`), so a comparison is a link you
can share or bookmark.

### Proton Registry

Browse the VRChat registry inside your Wine prefix, and diff it against any backup snapshot VRCX has
taken. Values that differ are highlighted, so you can see exactly what a settings change touched.

- Edit key names and values inline (double-click a cell).
- Restore a whole snapshot back into the prefix, with post-restore verification.
- Reset to a vanilla state.
- Hover any row for its description, pulled from
  [vrchat-definitions](https://github.com/Bluscream/vrchat-definitions).

Writes are checked against the definition for the key before they are applied. A type that
contradicts the definition is refused; so is a value that fails the definition's pattern where the
stored form is directly comparable. You can override deliberately — nothing is silently written or
silently blocked.

### VRChat Config

`config.json` as a form, with descriptions, types and defaults from the published schema, plus a raw
JSON editor with syntax validation for anything the schema does not cover.

### Command Line

Steam launch options and environment variables for VRChat, each documented with what it does and
where the information came from. Toggle entries on and off; the resulting launch string is written
back to Steam's `localconfig.vdf`. Also switches the Proton/compatibility tool and can stop and start
Steam so changes take effect.

### Settings

Point the definition sources at your own forks, tune how long definitions are cached, and override
the Steam directory and Wine binary when auto-detection guesses wrong.

## Install

Download a build from [Releases](https://github.com/Bluscream/vrcx-extras/releases):

| File | Platform |
|---|---|
| `vrcx-extras` | Linux x86_64 (standalone binary) |
| `VRCX-Extras-x86_64.AppImage` | Linux x86_64 (AppImage) |
| `vrcx-extras.exe` | Windows x64 |

```bash
chmod +x vrcx-extras && ./vrcx-extras
```

The frontend is embedded in the executable, so there is nothing to unpack. It opens in a standalone
window — a Chromium engine in app mode, since a Node single-file build has no Electron runtime.
Closing the window quits the app. Without a Chromium-based browser installed it falls back to your
default browser.

| Flag / variable | Effect |
|---|---|
| `--no-window`, `VRCX_NO_WINDOW=1` | Serve only; do not open a window |
| `PORT` | Preferred port (default `8990`; steps forward if taken) |
| `HOST` | Bind address (default `127.0.0.1`) |
| `VRCX_DB_PATH` | Path to the VRCX SQLite database |
| `VRC_PROTON_PREFIX` | Wine prefix, when auto-detection fails |
| `VRC_WINE_BIN` | Wine binary, when auto-detection fails |

The UI, the API under `/api/*` and the Swagger docs at `/docs` all share one origin.

## Your data

- The VRCX database is opened **read-only by default**. Read-write is opt-in from the UI, and the
  current mode is shown in the status bar.
- Everything runs locally and binds to `127.0.0.1`. Nothing about you is uploaded.
- The only outbound requests fetch the definition CSVs and config schema, which are cached on disk.
- Registry restores and resets change your real Wine prefix. They are confirmed before running.

## Development

Requires Node 22+ (the server uses `node:sqlite`).

```bash
npm install
npm run dev
```

`npm run dev` starts Vite on `:5173`, proxying `/api` to the backend — so in development you also
need the backend:

```bash
npm run dev:server
```

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run dev:server` | Backend on `:8990`, watching for changes |
| `npm run build` | Typecheck, then build the frontend to `dist/` |
| `npm run typecheck` | Frontend and server TypeScript projects |
| `npm run package:linux` | Linux binary into `build/` |
| `npm run package:win` | Windows binary into `build/` |
| `npm run package:all` | Both |

### Layout

```
server.ts     entry point: port selection, static/embedded frontend, app window
server/       API routes and services (registry, config, launcher, settings, db)
shared/       types and logic used by both sides — the API contract lives here
src/          React frontend (feature folder per page)
scripts/      build tooling (embeds dist/ into the packaged binary)
```

`shared/` is imported by both the server and the UI, so a change to a response shape breaks
compilation on whichever side is now wrong instead of surfacing as `undefined` at runtime. The
codebase has no `any`, and builds with `strict` plus `noUncheckedIndexedAccess`; data entering from
the VRCX database, `config.json`, `config.toml`, request bodies and the definition CSVs is narrowed
at the boundary rather than asserted.

### Definitions

Descriptions, types, defaults and validation patterns come from
[Bluscream/vrchat-definitions](https://github.com/Bluscream/vrchat-definitions) and are cached
locally. Per-account registry keys are documented with placeholders — `COLOR_PALETTES_CURRENT_{userId}`
matches `COLOR_PALETTES_CURRENT_usr_…` — and the app resolves those to the real key, substituting the
account id into the description.

## Credits

Built on the database and log parsing done by [VRCX](https://github.com/vrcx-team/VRCX). Launch flag
and environment variable notes draw on VRChat's documentation, the VRCX source and
[ProtonPlus](https://github.com/Vysp3r/ProtonPlus).
