# Gravity Frames Studio

An Electron motion-design studio that combines Antigravity agent chat with HyperFrames HTML animation generation, preview, composition, and export.

## What is implemented

- **Chat workspace** — describe an animation, attach local reference images, and generate a self-contained HyperFrames composition.
- **Studio workspace** — inspect and refine the generated master composition in HyperFrames Studio.
- **Live preview controls** — preview generated HTML, scrub or frame-step it, and switch preview resolution below the canvas.
- **Account visibility** — the Antigravity panel shows the authenticated email and plan exposed by the CLI response.
- Live HyperFrames preview through `@hyperframes/player`.
- Append generated child animations to a reusable master composition.
- Export generated animations through the HyperFrames and Remotion render pipeline.
- Autosaved project state and per-scene agent conversation history.
- **Opt-in web images** — explicit requests can search attributed Wikimedia Commons candidates, freeze the selected original locally, and use it in a composition.

The app never infers permission to search for images. Ordinary prompts keep web image search disabled, and third-party footage is never matched automatically.

## Stack

- Electron, React 18, TypeScript, Vite, Tailwind CSS, Zustand
- Remotion preview/export and local rendering services
- `@hyperframes/player` and `hyperframes` CLI 0.7.108+
- Antigravity CLI 1.1.7+ headless structured output

## Setup

Requirements: Node.js 22+, npm, FFmpeg, and Antigravity CLI 1.1.7 or newer.

```powershell
npm install
npm run dev
```

Install Antigravity CLI on Windows with the official installer:

```powershell
irm https://antigravity.google/cli/install.ps1 | iex
```

In the app, click **Connect** in the Antigravity panel. The official CLI opens in its own terminal and launches Google Sign-In. Finish sign-in there, return to the app, and send a motion request.

The app does not receive, copy, or persist OAuth tokens. Antigravity CLI owns authentication in Windows Credential Manager and applies the signed-in account's plan quota/AI credits. The app only starts documented headless CLI turns and reads their structured output.

## Useful commands

```powershell
npm run typecheck       # TypeScript validation
npm run test:image-search-policy # Opt-in image-search policy tests
npm run build:app       # Compile renderer, Electron main/preload, and Remotion bundle
npm run build           # Package the desktop app
npm run dev:web         # Browser-only layout preview with a local Electron API mock
```

## Integration flow

1. The user's request is normalized into project capabilities; web image search defaults to disabled and is enabled only by explicit wording.
2. When authorized, the app retrieves multiple Wikimedia Commons candidates, lets the user choose one, validates the original, and freezes it under the Studio project's `.media/images/` directory with provenance in `.media/manifest.json`.
3. Electron invokes `agy --print --output-format stream-json`; account auth and quota remain inside Antigravity CLI.
4. The complete HTML child composition returned by the agent is stored in the animation project.
5. `@hyperframes/player` previews it in a unique-origin sandbox.
6. The child composition is appended to the master composition in HyperFrames Studio.
7. The HyperFrames/Remotion pipeline renders the generated animation.

## Security boundaries

- Renderer code has no Node integration; desktop capabilities are limited to explicit preload APIs.
- Antigravity is launched without a shell and receives a bounded prompt.
- OAuth credentials are never exposed to the renderer or saved in project files.
- Generated HTML runs without `allow-same-origin`, so it cannot access the parent Electron bridge.
- Project and scene identifiers are validated before filesystem paths are constructed.
- Web-image downloads are HTTPS-only, host-allowlisted, size- and time-limited, MIME-sniffed, decoded, dimension-checked, and guarded again by the normalized project brief.
- HyperFrames rendering converts the app-only local media protocol to file URLs only in the isolated composition directory.

## Upstream projects

- [HyperFrames](https://github.com/heygen-com/hyperframes)
- [Antigravity CLI](https://github.com/google-antigravity/antigravity-cli)
