# Vectorframe

Frame-by-frame vector animation tool, built with Tauri 2 + Rust + Paper.js.

## Prerequisites

- **Rust** — [Install via rustup](https://rustup.rs/)
- **Node.js** (v18+) — [nodejs.org](https://nodejs.org/)
- **FFmpeg** — needed for MP4 export. Install via your package manager:
  - macOS: `brew install ffmpeg`
  - Ubuntu: `sudo apt install ffmpeg`
  - Windows: `choco install ffmpeg` or [download](https://ffmpeg.org/download.html)
- **Tauri system dependencies** — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

## Setup

1. **Install npm dependencies:**

   ```bash
   npm install
   ```

2. **Run in dev mode:**

   ```bash
   npm run dev
   ```

3. **Build for release:**

   ```bash
   npm run build
   ```

   The packaged app will be in `src-tauri/target/release/bundle/`.

## Brush Textures

On first run, the app creates a data directory. Check the dev console for the path:

```
VectorFrame data directory: /Users/you/Library/Application Support/com.vectorframe.app/
Place brush PNGs in: /Users/you/Library/Application Support/com.vectorframe.app/brush/
```

Copy your brush PNGs from the original `brush/` folder into that directory.

## Project Structure

```
vectorframe-tauri/
├── package.json
├── setup.sh                 # Copies unchanged JS from original project
├── src/                     # Frontend (served by Tauri webview)
│   ├── index.html
│   ├── style.css
│   └── js/
│       ├── 01-state.js      ★ Modified: adds VF.invoke() helper
│       ├── 02–17, 19, 21,   (unchanged — copied by setup.sh)
│       │   23, 27
│       ├── 18-export.js     ★ Modified: uses Tauri save dialog
│       ├── 20-project-io.js ★ Modified: uses Tauri invoke
│       ├── 22-ui-bindings.js★ Modified: togglePlay fix for audio
│       ├── 24-init.js       ★ Modified: loads brushes via invoke
│       ├── 25-audio.js      ★ Modified: base64 audio transport
│       └── 26-export-mp4.js ★ Modified: Tauri save dialog + invoke
└── src-tauri/               # Rust backend
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/
    │   └── default.json
    └── src/
        ├── main.rs          # Entry point
        └── lib.rs           # All commands (replaces app.py)
```