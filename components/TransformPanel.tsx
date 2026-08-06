"use client";

import { useEffect, useState } from "react";
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

function formatValue(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number(value.toFixed(4)).toString();
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  const [draft, setDraft] = useState(() => formatValue(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(formatValue(value));
  }, [value, focused]);

  return (
    <label className="grid w-full min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-2">
      <span className="text-xs font-medium text-[var(--muted)]">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          const raw = e.target.value.replace(",", ".");
          setDraft(raw);
          if (raw === "" || raw === "-" || raw === "." || raw === "-.") return;
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => {
          setFocused(false);
          const n = Number(draft.replace(",", "."));
          const next = Number.isFinite(n) ? n : 0;
          onChange(next);
          setDraft(formatValue(next));
        }}
        className="box-border w-full min-w-0 max-w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 font-mono text-sm tabular-nums text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
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
    <aside className="box-border flex w-full max-w-full shrink-0 flex-col gap-5 overflow-x-hidden border-t border-[var(--border)] bg-[var(--panel)] p-4 md:w-80 md:max-w-80 md:border-t-0 md:border-l">
      <div className="min-w-0">
        <h2 className="text-sm font-medium text-[var(--foreground)]">
          Objet
        </h2>
        <p className="mt-1 break-words text-xs text-[var(--muted)]">
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

      <div className="min-w-0">
        <p className="mb-2 text-[10px] uppercase tracking-wider text-[var(--muted)]">
          Position
        </p>
        <div className="flex min-w-0 flex-col gap-2">
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

      <div className="min-w-0">
        <p className="mb-2 text-[10px] uppercase tracking-wider text-[var(--muted)]">
          Rotation (°)
        </p>
        <div className="flex min-w-0 flex-col gap-2">
          <NumberField
            label="X"
            value={deg(transform.rotation[0])}
            onChange={(v) => setRotDeg(0, v)}
          />
          <NumberField
            label="Y"
            value={deg(transform.rotation[1])}
            onChange={(v) => setRotDeg(1, v)}
          />
          <NumberField
            label="Z"
            value={deg(transform.rotation[2])}
            onChange={(v) => setRotDeg(2, v)}
          />
        </div>
      </div>

      <p className="mt-auto min-w-0 break-words text-[11px] leading-relaxed text-[var(--muted)]">
        À l&apos;export, la transformation est bakée dans les sommets.
        <span className="mt-2 block text-[var(--muted)]">
          Ctrl/⌘+Z pour annuler · Ctrl/⌘+Shift+Z pour rétablir
        </span>
      </p>
    </aside>
  );
}
