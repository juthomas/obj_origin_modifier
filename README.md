# OBJ Origin Modifier

Web tool to reposition an OBJ file relative to the **world origin**, then export baked vertices.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Three.js / React Three Fiber / Drei
- Fully client-side (deployable on Vercel with no backend)

## Features

- Load `.obj` alone, or `.obj` + `.mtl` + textures
- Translate / rotate gizmo on the **object** (world origin stays fixed at 0)
- Numeric position + rotation fields
- Undo / Redo (`Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z`)
- Solid / Wireframe / Both views
- Baked export: `v' = R · v + T` — OBJ alone, or ZIP (OBJ + MTL + textures)

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

1. Drop an `.obj` (and optionally `.mtl` + images)
2. Move / rotate the object with the gizmo or the numeric panel
3. Choose Solid / Wireframe / Both
4. Click **Export** (Ctrl/⌘+Z to undo)
