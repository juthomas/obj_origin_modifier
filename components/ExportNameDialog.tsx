"use client";

import { useEffect, useId, useRef, useState } from "react";

type ExportNameDialogProps = {
  open: boolean;
  defaultName: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
};

export function ExportNameDialog({
  open,
  defaultName,
  onCancel,
  onConfirm,
}: ExportNameDialogProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(defaultName);

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [open, defaultName]);

  if (!open) return null;

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0b0d10]/70 backdrop-blur-[2px] px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={inputId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <form
        className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          onConfirm(trimmed);
        }}
      >
        <h2
          id={inputId}
          className="font-[family-name:var(--font-display)] text-lg text-[var(--foreground)]"
        >
          Export name
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Used for the .obj / .mtl / .zip filenames.
        </p>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
          className="mt-4 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-hover)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[#0b0d10] transition hover:brightness-110 disabled:opacity-50"
          >
            Export
          </button>
        </div>
      </form>
    </div>
  );
}
