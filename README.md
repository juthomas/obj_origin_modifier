# OBJ Origin Modifier

Web tool to reposition, rotate, and scale OBJ files relative to the **world origin**, then export baked vertices. Supports multiple models merged into one export, and resumable **`.objorig`** projects.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Three.js / React Three Fiber / Drei
- Fully client-side (deployable on Vercel with no backend)

## Features

- Load `.obj` alone, or `.obj` + `.mtl` + textures
- **Load** replaces the scene; **Add** appends more models
- Translate / rotate / scale gizmo (free XYZ) on the selected object
- Numeric position, rotation, and scale fields
- Model list with selection and remove
- Undo / Redo (`Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z`) for transforms
- Solid / Wireframe / Both views
- **Save Project** / **Open Project** — `.objorig` file (models + transforms + MTL/textures)
- **Auto-save** in the browser (IndexedDB) so a reload restores your scene
- Merged export: `v' = R · (S · v) + T` — single OBJ, or ZIP (OBJ + MTL + textures)

## Project files (`.objorig`)

A `.objorig` file is a ZIP containing `project.json` plus each model’s OBJ/MTL/textures. Use **Save Project** to download one, and **Open Project** (or drop it on the landing page) to resume later. This is separate from **Export**, which bakes and merges geometry.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy on Vercel

1. Push the repo to GitHub
2. Import it in [Vercel](https://vercel.com/new)
3. Framework preset: **Next.js** (auto-detected)
4. Deploy — no environment variables required

Or via CLI:

```bash
npx vercel
```

## Usage

1. Drop an `.obj` (and optionally `.mtl` + images), or open a `.objorig` project
2. Use **Add…** to bring in more models
3. Select a model in the side list; transform with the gizmo or numeric panel
4. **Save Project** to resume later (`.objorig`)
5. Click **Export** to download a baked merge (Ctrl/⌘+Z to undo transforms)
