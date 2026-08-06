export type GizmoMode = "translate" | "rotate";
export type DisplayMode = "solid" | "wireframe" | "both";

/** Object position + rotation relative to the fixed world origin */
export type ObjectTransform = {
  position: [number, number, number];
  rotation: [number, number, number]; // radians (xyz euler)
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

/** @deprecated alias kept for fewer churn in comments — use ObjectTransform */
export type PivotState = ObjectTransform;
