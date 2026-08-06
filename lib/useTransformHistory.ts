"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ObjectTransform } from "@/lib/types";

const MAX_HISTORY = 100;

function transformsEqual(a: ObjectTransform, b: ObjectTransform): boolean {
  for (let i = 0; i < 3; i++) {
    if (a.position[i] !== b.position[i]) return false;
    if (a.rotation[i] !== b.rotation[i]) return false;
  }
  return true;
}

function cloneTransform(t: ObjectTransform): ObjectTransform {
  return {
    position: [...t.position] as [number, number, number],
    rotation: [...t.rotation] as [number, number, number],
  };
}

export function useTransformHistory(initial: ObjectTransform) {
  const [transform, setTransformState] = useState<ObjectTransform>(initial);
  const pastRef = useRef<ObjectTransform[]>([]);
  const futureRef = useRef<ObjectTransform[]>([]);
  const transformRef = useRef(transform);
  const gestureStartRef = useRef<ObjectTransform | null>(null);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  const resetHistory = useCallback((next: ObjectTransform) => {
    pastRef.current = [];
    futureRef.current = [];
    gestureStartRef.current = null;
    const cloned = cloneTransform(next);
    transformRef.current = cloned;
    setTransformState(cloned);
  }, []);

  /** Live update without pushing history (e.g. while dragging) */
  const setTransform = useCallback((next: ObjectTransform) => {
    const cloned = cloneTransform(next);
    transformRef.current = cloned;
    setTransformState(cloned);
  }, []);

  /** Commit a new transform onto the undo stack */
  const commitTransform = useCallback((next: ObjectTransform) => {
    const current = transformRef.current;
    if (transformsEqual(current, next)) return;
    pastRef.current.push(cloneTransform(current));
    if (pastRef.current.length > MAX_HISTORY) {
      pastRef.current.shift();
    }
    futureRef.current = [];
    const cloned = cloneTransform(next);
    transformRef.current = cloned;
    setTransformState(cloned);
  }, []);

  const beginGesture = useCallback(() => {
    gestureStartRef.current = cloneTransform(transformRef.current);
  }, []);

  const endGesture = useCallback(() => {
    const start = gestureStartRef.current;
    gestureStartRef.current = null;
    if (!start) return;
    const current = transformRef.current;
    if (transformsEqual(start, current)) return;
    pastRef.current.push(start);
    if (pastRef.current.length > MAX_HISTORY) {
      pastRef.current.shift();
    }
    futureRef.current = [];
  }, []);

  const undo = useCallback(() => {
    const past = pastRef.current;
    if (past.length === 0) return;
    const previous = past.pop()!;
    futureRef.current.push(cloneTransform(transformRef.current));
    transformRef.current = previous;
    setTransformState(previous);
  }, []);

  const redo = useCallback(() => {
    const future = futureRef.current;
    if (future.length === 0) return;
    const next = future.pop()!;
    pastRef.current.push(cloneTransform(transformRef.current));
    transformRef.current = next;
    setTransformState(next);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable
      ) {
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
    transform,
    setTransform,
    commitTransform,
    beginGesture,
    endGesture,
    undo,
    redo,
    resetHistory,
  };
}
