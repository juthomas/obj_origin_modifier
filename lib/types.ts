export type GizmoMode = "translate" | "rotate";
export type DisplayMode = "solid" | "wireframe" | "both";

export type PivotState = {
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
