"use client";

import type { DisplayMode, GizmoMode } from "@/lib/types";

type ToolbarProps = {
  gizmoMode: GizmoMode;
  displayMode: DisplayMode;
  onGizmoMode: (mode: GizmoMode) => void;
  onDisplayMode: (mode: DisplayMode) => void;
  onReset: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onExport: () => void;
  exporting?: boolean;
  fileSlot?: React.ReactNode;
};

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--surface)] p-0.5">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`rounded px-2.5 py-1 text-xs transition ${
            value === opt.id
              ? "bg-[var(--accent-soft)] text-[var(--foreground)]"
              : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Toolbar({
  gizmoMode,
  displayMode,
  onGizmoMode,
  onDisplayMode,
  onReset,
  onUndo,
  onRedo,
  onExport,
  exporting,
  fileSlot,
}: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
          Gizmo
        </span>
        <Segmented
          value={gizmoMode}
          onChange={onGizmoMode}
          options={[
            { id: "translate", label: "Translate" },
            { id: "rotate", label: "Rotate" },
          ]}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
          View
        </span>
        <Segmented
          value={displayMode}
          onChange={onDisplayMode}
          options={[
            { id: "solid", label: "Solid" },
            { id: "wireframe", label: "Wireframe" },
            { id: "both", label: "Both" },
          ]}
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {fileSlot}
        {onUndo && (
          <button
            type="button"
            onClick={onUndo}
            title="Ctrl/⌘+Z"
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-hover)]"
          >
            Undo
          </button>
        )}
        {onRedo && (
          <button
            type="button"
            onClick={onRedo}
            title="Ctrl/⌘+Shift+Z"
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-hover)]"
          >
            Redo
          </button>
        )}
        <button
          type="button"
          onClick={onReset}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-hover)]"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[#0b0d10] transition hover:brightness-110 disabled:opacity-50"
        >
          {exporting ? "Exporting…" : "Export"}
        </button>
      </div>
    </div>
  );
}
