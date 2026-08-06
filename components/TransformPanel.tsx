"use client";

import type { ObjectTransform } from "@/lib/types";

type TransformPanelProps = {
  transform: ObjectTransform;
  onChange: (transform: ObjectTransform) => void;
  fileName?: string;
  hasMtl?: boolean;
};

function deg(rad: number) {
  return (rad * 180) / Math.PI;
}

function rad(deg: number) {
  return (deg * Math.PI) / 180;
}

function NumberField({
  label,
  value,
  onChange,
  step = 0.1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? Number(value.toFixed(4)) : 0}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
      />
    </label>
  );
}

export function TransformPanel({
  transform,
  onChange,
  fileName,
  hasMtl,
}: TransformPanelProps) {
  const setPos = (i: number, v: number) => {
    const position = [...transform.position] as [number, number, number];
    position[i] = v;
    onChange({ ...transform, position });
  };

  const setRotDeg = (i: number, degrees: number) => {
    const rotation = [...transform.rotation] as [number, number, number];
    rotation[i] = rad(degrees);
    onChange({ ...transform, rotation });
  };

  return (
    <aside className="flex w-full flex-col gap-5 border-l border-[var(--border)] bg-[var(--panel)] p-4 md:w-64 md:shrink-0">
      <div>
        <h2 className="text-sm font-medium text-[var(--foreground)]">
          Objet
        </h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Déplacez et orientez le modèle. L&apos;origin monde reste fixe à
          (0,&nbsp;0,&nbsp;0).
        </p>
        {fileName && (
          <p
            className="mt-2 truncate text-xs text-[var(--muted)]"
            title={fileName}
          >
            {fileName}
            {hasMtl ? " + MTL" : ""}
          </p>
        )}
      </div>

      <div>
        <p className="mb-2 text-[10px] uppercase tracking-wider text-[var(--muted)]">
          Position
        </p>
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label="X"
            value={transform.position[0]}
            onChange={(v) => setPos(0, v)}
          />
          <NumberField
            label="Y"
            value={transform.position[1]}
            onChange={(v) => setPos(1, v)}
          />
          <NumberField
            label="Z"
            value={transform.position[2]}
            onChange={(v) => setPos(2, v)}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] uppercase tracking-wider text-[var(--muted)]">
          Rotation (°)
        </p>
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label="X"
            value={deg(transform.rotation[0])}
            onChange={(v) => setRotDeg(0, v)}
            step={1}
          />
          <NumberField
            label="Y"
            value={deg(transform.rotation[1])}
            onChange={(v) => setRotDeg(1, v)}
            step={1}
          />
          <NumberField
            label="Z"
            value={deg(transform.rotation[2])}
            onChange={(v) => setRotDeg(2, v)}
            step={1}
          />
        </div>
      </div>

      <p className="mt-auto text-[11px] leading-relaxed text-[var(--muted)]">
        À l&apos;export, la transformation est bakée dans les sommets.
        <span className="mt-2 block text-[var(--muted)]">
          Ctrl/⌘+Z pour annuler · Ctrl/⌘+Shift+Z pour rétablir
        </span>
      </p>
    </aside>
  );
}
