"use client";

type LoadingOverlayProps = {
  message?: string;
  fullscreen?: boolean;
};

export function LoadingOverlay({
  message = "Loading…",
  fullscreen,
}: LoadingOverlayProps) {
  return (
    <div
      className={`z-50 flex items-center justify-center bg-[#0b0d10]/70 backdrop-blur-[2px] ${
        fullscreen ? "fixed inset-0" : "absolute inset-0"
      }`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-6 py-5 shadow-lg">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]"
          aria-hidden
        />
        <p className="text-sm text-[var(--foreground)]">{message}</p>
      </div>
    </div>
  );
}
