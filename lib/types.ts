export type GizmoMode = "translate" | "rotate" | "scale";
export type DisplayMode = "solid" | "wireframe" | "both" | "points";

/** Object position + rotation + scale relative to the fixed world origin */
export type ObjectTransform = {
  position: [number, number, number];
  rotation: [number, number, number]; // radians (xyz euler)
  scale: [number, number, number];
};

export type LoadedModel = {
  object: import("three").Group;
  objText: string;
  objFileName: string;
  mtlText: string | null;
  mtlFileName: string | null;
  textures: Map<string, File>;
  baseName: string;
};

export type SceneObject = {
  id: string;
  model: LoadedModel;
  transform: ObjectTransform;
};

export const IDENTITY_TRANSFORM: ObjectTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

export function cloneTransform(t: ObjectTransform): ObjectTransform {
  return {
    position: [...t.position] as [number, number, number],
    rotation: [...t.rotation] as [number, number, number],
    scale: [...t.scale] as [number, number, number],
  };
}

export function transformsEqual(a: ObjectTransform, b: ObjectTransform): boolean {
  for (let i = 0; i < 3; i++) {
    if (a.position[i] !== b.position[i]) return false;
    if (a.rotation[i] !== b.rotation[i]) return false;
    if (a.scale[i] !== b.scale[i]) return false;
  }
  return true;
}

/** @deprecated use ObjectTransform */
export type PivotState = ObjectTransform;
