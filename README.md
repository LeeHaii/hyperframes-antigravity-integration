# Gravity Frames Studio

An Electron video editor that combines Antigravity CLI agent chat, HyperFrames HTML motion scenes, and the timeline/preview foundation from Rhymx AI Video Editor.

## What is implemented

- **Scene Lab** — Antigravity chat on the left and a focused live HTML preview on the right.
- **Timeline Editor** — imported media, multi-track timeline, preview, properties, and Antigravity chat in one workspace.
- **Live preview controls** — preview generated HTML before rendering, scrub or frame-step it, and switch preview resolution below the canvas.
- **Account visibility** — the Antigravity panel shows the authenticated email and plan exposed by the CLI response.
- Import video, image, and audio files; drag visual media to tracks or add audio to the audio lane.
- Add a blank five-second scene at the playhead and turn it into seekable motion through chat.
- Live HyperFrames preview through `@hyperframes/player`.
- Render a generated scene with the HyperFrames CLI and attach its MP4 to the existing Remotion export pipeline.
- Custom playback controller with scrubbing, frame steps, five-second jumps, timecode, and keyboard shortcuts.
- Autosaved project state and per-scene agent conversation history.

## Stack

- Electron 30, React 18, TypeScript, Vite, Tailwind CSS, Zustand
- Rhymx timeline, inspector, media bin, Remotion preview/export, FFmpeg services
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

In the app, click **Connect** in the Antigravity panel. The official CLI opens in its own terminal and launches Google Sign-In. Finish sign-in there, return to the app, select a scene, and send a motion request.

The app does not receive, copy, or persist OAuth tokens. Antigravity CLI owns authentication in Windows Credential Manager and applies the signed-in account's plan quota/AI credits. The app only starts documented headless CLI turns and reads their structured output.

## Useful commands

```powershell
npm run typecheck       # TypeScript validation
npm run build:app       # Compile renderer, Electron main/preload, and Remotion bundle
npm run build           # Package the desktop app
npm run dev:web         # Browser-only layout preview with a local Electron API mock
```

## Integration flow

1. A selected timeline scene and the user's request are converted to a constrained HyperFrames authoring prompt.
2. Electron invokes `agy --print --output-format stream-json`; account auth and quota remain inside Antigravity CLI.
3. The complete HTML composition returned by the agent is stored with that scene.
4. `@hyperframes/player` previews it in a unique-origin sandbox driven by the editor's playback controls.
5. **Render MP4** calls the bundled HyperFrames CLI, writes the scene composition under the project's asset directory, and attaches the rendered clip to the timeline.
6. The existing Remotion/FFmpeg export pipeline produces the final edit.

## Security boundaries

- Renderer code has no Node integration; desktop capabilities are limited to explicit preload APIs.
- Antigravity is launched without a shell and receives a bounded prompt.
- OAuth credentials are never exposed to the renderer or saved in project files.
- Generated HTML runs without `allow-same-origin`, so it cannot access the parent Electron bridge.
- Project and scene identifiers are validated before filesystem paths are constructed.
- HyperFrames rendering converts the app-only local media protocol to file URLs only in the isolated composition directory.

## Upstream projects

- [HyperFrames](https://github.com/heygen-com/hyperframes)
- [Antigravity CLI](https://github.com/google-antigravity/antigravity-cli)
- [Rhymx AI Video Editor](https://github.com/LeeHaii/RhymxAIVideoEditor)
