"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileDropzone } from "@/components/FileDropzone";
import { ExportNameDialog } from "@/components/ExportNameDialog";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { Toolbar } from "@/components/Toolbar";
import { TransformPanel } from "@/components/TransformPanel";
import { Viewport } from "@/components/Viewport";
import { mergeAndExport } from "@/lib/bakeObj";
import {
  clearLocalProject,
  loadLocalProject,
  saveLocalProject,
} from "@/lib/localProject";
import { disposeModel, loadModelFromFiles } from "@/lib/loadModel";
import {
  isProjectFile,
  loadProject,
  PROJECT_EXTENSION,
  saveProject,
} from "@/lib/projectFile";
import { useSceneHistory } from "@/lib/useSceneHistory";
import {
  IDENTITY_TRANSFORM,
  cloneTransform,
  type DisplayMode,
  type GizmoMode,
  type SceneObject,
} from "@/lib/types";

function newId() {
  return `obj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function Home() {
  const [objects, setObjects] = useState<SceneObject[]>([]);
  const {
    snapshot,
    setSnapshot,
    commitSnapshot,
    beginGesture,
    endGesture,
    undo,
    redo,
    resetHistory,
  } = useSceneHistory({ transforms: {}, selectedId: null });

  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("translate");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("solid");
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Loading…");
  const [exporting, setExporting] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [savingProgress, setSavingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const skipAutosaveRef = useRef(true);

  const startLoading = useCallback(async (message: string) => {
    setLoadingMessage(message);
    setLoading(true);
    setError(null);
    // Let the overlay paint before OBJ parse blocks the main thread.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  }, []);

  const sceneObjects = useMemo(() => {
    return objects.map((obj) => ({
      ...obj,
      transform:
        snapshot.transforms[obj.id] ??
        obj.transform ??
        cloneTransform(IDENTITY_TRANSFORM),
    }));
  }, [objects, snapshot.transforms]);

  const selectedId = snapshot.selectedId;
  const selected = sceneObjects.find((o) => o.id === selectedId) ?? null;

  const replaceScene = useCallback(
    (loaded: Awaited<ReturnType<typeof loadModelFromFiles>>) => {
      const id = newId();
      const transform = cloneTransform(IDENTITY_TRANSFORM);
      setSceneReady(false);
      setObjects((prev) => {
        for (const o of prev) disposeModel(o.model);
        return [{ id, model: loaded, transform }];
      });
      resetHistory({
        transforms: { [id]: cloneTransform(IDENTITY_TRANSFORM) },
        selectedId: id,
      });
    },
    [resetHistory],
  );

  const replaceWithProject = useCallback(
    (nextObjects: SceneObject[], nextSelectedId: string | null) => {
      setSceneReady(false);
      setObjects((prev) => {
        for (const o of prev) disposeModel(o.model);
        return nextObjects;
      });
      const transforms: Record<string, ReturnType<typeof cloneTransform>> = {};
      for (const o of nextObjects) {
        transforms[o.id] = cloneTransform(o.transform);
      }
      resetHistory({
        transforms,
        selectedId: nextSelectedId,
      });
    },
    [resetHistory],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await loadLocalProject();
        if (cancelled || !saved) return;
        replaceWithProject(saved.objects, saved.selectedId);
      } catch {
        await clearLocalProject().catch(() => undefined);
      } finally {
        if (!cancelled) {
          setHydrated(true);
          requestAnimationFrame(() => {
            skipAutosaveRef.current = false;
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [replaceWithProject]);

  useEffect(() => {
    if (!hydrated || skipAutosaveRef.current) return;

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          if (sceneObjects.length === 0) {
            await clearLocalProject();
          } else {
            await saveLocalProject(sceneObjects, selectedId);
          }
        } catch {
          // Quota / private mode — non-fatal
        }
      })();
    }, 600);

    return () => window.clearTimeout(timer);
  }, [hydrated, sceneObjects, selectedId]);

  const addToScene = useCallback(
    (loaded: Awaited<ReturnType<typeof loadModelFromFiles>>) => {
      const id = newId();
      const transform = cloneTransform(IDENTITY_TRANSFORM);
      setObjects((prev) => [...prev, { id, model: loaded, transform }]);
      commitSnapshot({
        transforms: {
          ...snapshot.transforms,
          [id]: transform,
        },
        selectedId: id,
      });
    },
    [commitSnapshot, snapshot.transforms],
  );

  useEffect(() => {
    if (objects.length === 0) setSceneReady(false);
  }, [objects.length]);

  const handleOpenProject = useCallback(
    async (files: File[]) => {
      const project = files.find(isProjectFile) ?? files[0];
      if (!project) return;
      await startLoading("Opening project…");
      try {
        const result = await loadProject(project);
        replaceWithProject(result.objects, result.selectedId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to open project.");
      } finally {
        setLoading(false);
      }
    },
    [replaceWithProject, startLoading],
  );

  const handleLoad = useCallback(
    async (files: File[]) => {
      if (files.some(isProjectFile)) {
        await handleOpenProject(files);
        return;
      }
      await startLoading("Loading model…");
      try {
        const loaded = await loadModelFromFiles(files);
        replaceScene(loaded);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load model.");
      } finally {
        setLoading(false);
      }
    },
    [replaceScene, handleOpenProject, startLoading],
  );

  const handleAdd = useCallback(
    async (files: File[]) => {
      if (files.some(isProjectFile)) {
        setError(
          `Use Open Project to load a ${PROJECT_EXTENSION} file (Add is for OBJ models).`,
        );
        return;
      }
      await startLoading("Adding model…");
      try {
        const loaded = await loadModelFromFiles(files);
        addToScene(loaded);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add model.");
      } finally {
        setLoading(false);
      }
    },
    [addToScene, startLoading],
  );

  const handleSaveProject = useCallback(async () => {
    if (sceneObjects.length === 0) return;
    setSavingProject(true);
    setSavingProgress(0);
    setError(null);
    try {
      await saveProject(sceneObjects, selectedId, undefined, setSavingProgress);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save project.");
    } finally {
      setSavingProject(false);
      setSavingProgress(0);
    }
  }, [sceneObjects, selectedId]);

  const defaultExportName =
    sceneObjects.length === 1
      ? `${sceneObjects[0].model.baseName}_rebaked`
      : "merged";

  const handleExport = useCallback(() => {
    if (sceneObjects.length === 0) return;
    setExportDialogOpen(true);
  }, [sceneObjects.length]);

  const handleConfirmExport = useCallback(
    async (name: string) => {
      setExportDialogOpen(false);
      setExporting(true);
      setError(null);
      try {
        await mergeAndExport(sceneObjects, name);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to export.");
      } finally {
        setExporting(false);
      }
    },
    [sceneObjects],
  );

  const updateSelectedTransform = useCallback(
    (transform: import("@/lib/types").ObjectTransform, commit: boolean) => {
      if (!selectedId) return;
      const next = {
        transforms: {
          ...snapshot.transforms,
          [selectedId]: cloneTransform(transform),
        },
        selectedId,
      };
      if (commit) commitSnapshot(next);
      else setSnapshot(next);
    },
    [selectedId, snapshot.transforms, commitSnapshot, setSnapshot],
  );

  const handleRemove = useCallback(
    (id: string) => {
      setObjects((prev) => {
        const victim = prev.find((o) => o.id === id);
        if (victim) disposeModel(victim.model);
        return prev.filter((o) => o.id !== id);
      });
      const rest = { ...snapshot.transforms };
      delete rest[id];
      const remainingIds = Object.keys(rest);
      const nextSelected =
        snapshot.selectedId === id
          ? remainingIds[remainingIds.length - 1] ?? null
          : snapshot.selectedId;
      commitSnapshot({ transforms: rest, selectedId: nextSelected });
    },
    [snapshot, commitSnapshot],
  );

  const handleReset = useCallback(() => {
    if (!selectedId) return;
    commitSnapshot({
      transforms: {
        ...snapshot.transforms,
        [selectedId]: cloneTransform(IDENTITY_TRANSFORM),
      },
      selectedId,
    });
  }, [selectedId, snapshot.transforms, commitSnapshot]);

  if (!hydrated) {
    return (
      <main className="relative flex min-h-screen items-center justify-center bg-[var(--background)]">
        <LoadingOverlay message="Restoring project…" fullscreen />
      </main>
    );
  }

  if (objects.length === 0) {
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
              Move, rotate, and scale OBJs relative to the world origin. Add
              multiple models, save a .objorig project, or export a baked merge.
              Your scene is auto-saved in this browser.
            </p>
          </header>

          <FileDropzone onFiles={handleLoad} disabled={loading} />

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>

        {loading && (
          <LoadingOverlay message={loadingMessage} fullscreen />
        )}
      </main>
    );
  }

  return (
    <main className="relative flex h-screen flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-2">
        <h1 className="font-[family-name:var(--font-display)] text-lg tracking-tight text-[var(--foreground)]">
          OBJ Origin
        </h1>
        <span className="text-xs text-[var(--muted)]">Modifier</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-[var(--muted)]">
          Auto-saved
        </span>
      </header>

      <Toolbar
        gizmoMode={gizmoMode}
        displayMode={displayMode}
        onGizmoMode={setGizmoMode}
        onDisplayMode={setDisplayMode}
        onReset={handleReset}
        onUndo={undo}
        onRedo={redo}
        onExport={handleExport}
        onSaveProject={handleSaveProject}
        savingProject={savingProject}
        savingProgress={savingProgress}
        exporting={exporting}
        loadSlot={
          <FileDropzone
            onFiles={handleLoad}
            disabled={loading}
            compact
            label="Load…"
            accept=".obj,.mtl,.png,.jpg,.jpeg,.webp,.gif,.objorig"
          />
        }
        addSlot={
          <FileDropzone
            onFiles={handleAdd}
            disabled={loading}
            compact
            label="Add…"
            accept=".obj,.mtl,.png,.jpg,.jpeg,.webp,.gif"
          />
        }
        openProjectSlot={
          <FileDropzone
            onFiles={handleOpenProject}
            disabled={loading}
            compact
            label="Open Project…"
            accept=".objorig"
            multiple={false}
          />
        }
      />

      {error && (
        <div className="border-b border-red-900/50 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
        <Viewport
          items={sceneObjects.map((o) => ({
            id: o.id,
            object: o.model.object,
            transform: o.transform,
          }))}
          selectedId={selectedId}
          onTransformChange={(id, transform) => {
            setSnapshot({
              transforms: {
                ...snapshot.transforms,
                [id]: cloneTransform(transform),
              },
              selectedId: id,
            });
          }}
          onGestureStart={beginGesture}
          onGestureEnd={endGesture}
          gizmoMode={gizmoMode}
          displayMode={displayMode}
          onReady={() => setSceneReady(true)}
        />
        <TransformPanel
          transform={selected?.transform ?? null}
          onChange={(t) => updateSelectedTransform(t, true)}
          models={sceneObjects.map((o) => ({
            id: o.id,
            name: o.model.objFileName,
            hasMtl: Boolean(o.model.mtlText),
          }))}
          selectedId={selectedId}
          onSelectModel={(id) =>
            commitSnapshot({ ...snapshot, selectedId: id })
          }
          onRemoveModel={handleRemove}
        />

        {(loading || !sceneReady) && (
          <LoadingOverlay
            message={loading ? loadingMessage : "Loading scene…"}
            fullscreen
          />
        )}
      </div>

      <ExportNameDialog
        open={exportDialogOpen}
        defaultName={defaultExportName}
        onCancel={() => setExportDialogOpen(false)}
        onConfirm={handleConfirmExport}
      />
    </main>
  );
}
