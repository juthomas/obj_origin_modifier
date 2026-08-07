"use client";

import { useCallback, useRef, useState } from "react";

type FileDropzoneProps = {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  compact?: boolean;
  label?: string;
  accept?: string;
  multiple?: boolean;
  hint?: string;
  title?: string;
};

export function FileDropzone({
  onFiles,
  disabled,
  compact,
  label = "Load…",
  accept = ".obj,.mtl,.png,.jpg,.jpeg,.webp,.gif,.objorig",
  multiple = true,
  hint,
  title,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (list: FileList | File[] | null) => {
      if (!list || disabled) return;
      const files = Array.from(list);
      if (files.length) onFiles(files);
    },
    [disabled, onFiles],
  );

  if (compact) {
    return (
      <>
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--foreground)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
        >
          {label}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`flex min-h-[220px] w-full max-w-xl cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-8 py-12 transition ${
        dragging
          ? "border-[var(--accent)] bg-[var(--surface-hover)]"
          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--muted)] hover:bg-[var(--surface-hover)]"
      } ${disabled ? "pointer-events-none opacity-50" : ""}`}
    >
      <div className="text-center">
        <p className="text-base font-medium text-[var(--foreground)]">
          {title ?? "Drop your OBJ model"}
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {hint ?? ".obj alone, or .obj + .mtl + textures — or a .objorig project"}
        </p>
      </div>
      <span className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)]">
        Click or drag and drop
      </span>
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
