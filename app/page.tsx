"use client";

import { useCallback, useState } from "react";
import { FileDropzone } from "@/components/FileDropzone";
import { Toolbar } from "@/components/Toolbar";
import { TransformPanel } from "@/components/TransformPanel";
import { Viewport } from "@/components/Viewport";
import { exportBakedModel } from "@/lib/bakeObj";
import { disposeModel, loadModelFromFiles } from "@/lib/loadModel";
import { useTransformHistory } from "@/lib/useTransformHistory";
import type { DisplayMode, GizmoMode, LoadedModel } from "@/lib/types";

const IDENTITY = {
  position: [0, 0, 0] as [number, number, number],
  rotation: [0, 0, 0] as [number, number, number],
};

export default function Home() {
  const [model, setModel] = useState<LoadedModel | null>(null);
  const {
    transform,
    setTransform,
    commitTransform,
    beginGesture,
    endGesture,
    undo,
    redo,
    resetHistory,
  } = useTransformHistory(IDENTITY);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("translate");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("solid");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (files: File[]) => {
      setLoading(true);
      setError(null);
      try {
        const loaded = await loadModelFromFiles(files);
        setModel((prev) => {
          disposeModel(prev);
          return loaded;
        });
        resetHistory(IDENTITY);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load model.");
      } finally {
        setLoading(false);
      }
    },
    [resetHistory],
  );

  const handleExport = useCallback(async () => {
    if (!model) return;
    setExporting(true);
    setError(null);
    try {
      await exportBakedModel(model, transform);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to export.");
    } finally {
      setExporting(false);
    }
  }, [model, transform]);

  if (!model) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% -10%, #1a2433 0%, transparent 55%), radial-gradient(ellipse 60% 40% at 80% 80%, #121820 0%, transparent 50%), linear-gradient(180deg, #0b0d10 0%, #0e1218 100%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent)",
          }}
        />

        <div className="relative z-10 flex w-full max-w-xl flex-col items-center gap-10">
          <header className="text-center">
            <h1 className="font-[family-name:var(--font-display)] text-5xl tracking-tight text-[var(--foreground)] sm:text-6xl">
              OBJ Origin
            </h1>
            <p className="mt-4 max-w-md text-base text-[var(--muted)]">
              Move and rotate an OBJ relative to the world origin, then export
              baked vertices.
            </p>
          </header>

          <FileDropzone onFiles={handleFiles} disabled={loading} />

          {loading && (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          )}
          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-2">
        <h1 className="font-[family-name:var(--font-display)] text-lg tracking-tight text-[var(--foreground)]">
          OBJ Origin
        </h1>
        <span className="text-xs text-[var(--muted)]">Modifier</span>
      </header>

      <Toolbar
        gizmoMode={gizmoMode}
        displayMode={displayMode}
        onGizmoMode={setGizmoMode}
        onDisplayMode={setDisplayMode}
        onReset={() => commitTransform(IDENTITY)}
        onUndo={undo}
        onRedo={redo}
        onExport={handleExport}
        exporting={exporting}
        fileSlot={
          <FileDropzone onFiles={handleFiles} disabled={loading} compact />
        }
      />

      {error && (
        <div className="border-b border-red-900/50 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
        <Viewport
          key={model.objFileName + model.objText.length}
          object={model.object}
          transform={transform}
          onTransformChange={setTransform}
          onGestureStart={beginGesture}
          onGestureEnd={endGesture}
          gizmoMode={gizmoMode}
          displayMode={displayMode}
        />
        <TransformPanel
          transform={transform}
          onChange={commitTransform}
          fileName={model.objFileName}
          hasMtl={Boolean(model.mtlText)}
        />
      </div>
    </main>
  );
}
