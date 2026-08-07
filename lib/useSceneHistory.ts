"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cloneTransform,
  transformsEqual,
  type ObjectTransform,
} from "@/lib/types";

const MAX_HISTORY = 100;

export type SceneSnapshot = {
  transforms: Record<string, ObjectTransform>;
  selectedId: string | null;
};

function cloneSnapshot(s: SceneSnapshot): SceneSnapshot {
  const transforms: Record<string, ObjectTransform> = {};
  for (const [id, t] of Object.entries(s.transforms)) {
    transforms[id] = cloneTransform(t);
  }
  return { transforms, selectedId: s.selectedId };
}

function snapshotsEqual(a: SceneSnapshot, b: SceneSnapshot): boolean {
  if (a.selectedId !== b.selectedId) return false;
  const aKeys = Object.keys(a.transforms);
  const bKeys = Object.keys(b.transforms);
  if (aKeys.length !== bKeys.length) return false;
  for (const id of aKeys) {
    const bt = b.transforms[id];
    if (!bt || !transformsEqual(a.transforms[id], bt)) return false;
  }
  return true;
}

export function useSceneHistory(initial: SceneSnapshot) {
  const [snapshot, setSnapshotState] = useState<SceneSnapshot>(initial);
  const pastRef = useRef<SceneSnapshot[]>([]);
  const futureRef = useRef<SceneSnapshot[]>([]);
  const snapshotRef = useRef(snapshot);
  const gestureStartRef = useRef<SceneSnapshot | null>(null);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const resetHistory = useCallback((next: SceneSnapshot) => {
    pastRef.current = [];
    futureRef.current = [];
    gestureStartRef.current = null;
    const cloned = cloneSnapshot(next);
    snapshotRef.current = cloned;
    setSnapshotState(cloned);
  }, []);

  const setSnapshot = useCallback((next: SceneSnapshot) => {
    const cloned = cloneSnapshot(next);
    snapshotRef.current = cloned;
    setSnapshotState(cloned);
  }, []);

  const commitSnapshot = useCallback((next: SceneSnapshot) => {
    const current = snapshotRef.current;
    if (snapshotsEqual(current, next)) return;
    pastRef.current.push(cloneSnapshot(current));
    if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
    futureRef.current = [];
    const cloned = cloneSnapshot(next);
    snapshotRef.current = cloned;
    setSnapshotState(cloned);
  }, []);

  const beginGesture = useCallback(() => {
    gestureStartRef.current = cloneSnapshot(snapshotRef.current);
  }, []);

  const endGesture = useCallback(() => {
    const start = gestureStartRef.current;
    gestureStartRef.current = null;
    if (!start) return;
    const current = snapshotRef.current;
    if (snapshotsEqual(start, current)) return;
    pastRef.current.push(start);
    if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
    futureRef.current = [];
  }, []);

  const undo = useCallback(() => {
    const past = pastRef.current;
    if (past.length === 0) return;
    const previous = past.pop()!;
    futureRef.current.push(cloneSnapshot(snapshotRef.current));
    snapshotRef.current = previous;
    setSnapshotState(previous);
  }, []);

  const redo = useCallback(() => {
    const future = futureRef.current;
    if (future.length === 0) return;
    const next = future.pop()!;
    pastRef.current.push(cloneSnapshot(snapshotRef.current));
    snapshotRef.current = next;
    setSnapshotState(next);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  return {
    snapshot,
    setSnapshot,
    commitSnapshot,
    beginGesture,
    endGesture,
    undo,
    redo,
    resetHistory,
  };
}
