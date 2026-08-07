"use client";

type ModelListItem = {
  id: string;
  name: string;
  hasMtl: boolean;
};

type ModelListProps = {
  items: ModelListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
};

export function ModelList({
  items,
  selectedId,
  onSelect,
  onRemove,
}: ModelListProps) {
  if (items.length === 0) return null;

  return (
    <div className="min-w-0">
      <p className="mb-2 text-[10px] uppercase tracking-wider text-[var(--muted)]">
        Models
      </p>
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const selected = item.id === selectedId;
          return (
            <li key={item.id}>
              <div
                className={`flex items-center gap-1 rounded-md border px-2 py-1.5 transition ${
                  selected
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className="min-w-0 flex-1 truncate text-left text-sm text-[var(--foreground)]"
                  title={item.name}
                >
                  {item.name}
                  {item.hasMtl ? (
                    <span className="text-[var(--muted)]"> +MTL</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  className="shrink-0 rounded px-1.5 py-0.5 text-xs text-[var(--muted)] hover:bg-[var(--panel)] hover:text-red-400"
                  title="Remove"
                  aria-label={`Remove ${item.name}`}
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
