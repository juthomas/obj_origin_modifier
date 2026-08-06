# OBJ Origin Modifier

Outil web pour repositionner l’**origin** et la **rotation d’origine** d’un fichier OBJ, puis exporter les sommets bakés.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Three.js / React Three Fiber / Drei
- Traitement 100 % navigateur (déployable sur Vercel sans backend)

## Fonctionnalités

- Chargement `.obj` seul, ou `.obj` + `.mtl` + textures
- Gizmo translate / rotate sur **l’objet** (l’origin monde reste fixe à 0)
- Champs numériques position + rotation
- Undo / Redo (`Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z`)
- Vues Solid / Wireframe / Both
- Export baké : `v' = R · v + T` — OBJ seul, ou ZIP (OBJ + MTL + textures)

## Développement

```bash
npm install
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000).

## Déploiement Vercel

1. Poussez le dépôt sur GitHub
2. Importez-le dans [Vercel](https://vercel.com/new)
3. Framework preset : **Next.js** (détecté automatiquement)
4. Deploy — aucun variable d’environnement requise

Ou en CLI :

```bash
npx vercel
```

## Usage

1. Déposez un `.obj` (et optionnellement `.mtl` + images)
2. Déplacez / orientez l’objet avec le gizmo ou le panneau numérique
3. Choisissez Solid / Wireframe / Both
4. Cliquez **Exporter** (Ctrl/⌘+Z pour annuler)
