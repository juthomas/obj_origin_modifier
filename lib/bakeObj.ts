import * as THREE from "three";
import JSZip from "jszip";
import type { ObjectTransform, SceneObject } from "./types";

/** Format with consistent precision for OBJ export */
function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const v = Math.abs(n) < 1e-12 ? 0 : n;
  let s = v.toFixed(6);
  if (s.includes(".")) {
    s = s.replace(/0+$/, "").replace(/\.$/, "");
  }
  return s === "-0" ? "0" : s;
}

function sanitizePrefix(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "model";
}

/**
 * Bake: v' = R · (S · v) + T
 * Normals: n' = normalize(R · (n / S))
 */
export function bakeObjText(
  objText: string,
  transform: ObjectTransform,
  options?: {
    mtlFileName?: string | null;
    materialRename?: (name: string) => string;
    objectPrefix?: string;
    stripMtllib?: boolean;
  },
): string {
  const translation = new THREE.Vector3(...transform.position);
  const rotation = new THREE.Euler(...transform.rotation, "XYZ");
  const quat = new THREE.Quaternion().setFromEuler(rotation);
  const scale = new THREE.Vector3(...transform.scale);

  const tmp = new THREE.Vector3();
  const lines = objText.split(/\r?\n/);
  const out: string[] = [];
  const prefix = options?.objectPrefix
    ? sanitizePrefix(options.objectPrefix)
    : null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }

    const parts = trimmed.split(/\s+/);
    const tag = parts[0];

    if (tag === "v" && parts.length >= 4) {
      tmp.set(
        parseFloat(parts[1]),
        parseFloat(parts[2]),
        parseFloat(parts[3]),
      );
      tmp.multiply(scale).applyQuaternion(quat).add(translation);
      const w = parts.length > 4 ? ` ${parts.slice(4).join(" ")}` : "";
      out.push(`v ${fmt(tmp.x)} ${fmt(tmp.y)} ${fmt(tmp.z)}${w}`);
      continue;
    }

    if (tag === "vn" && parts.length >= 4) {
      tmp.set(
        parseFloat(parts[1]),
        parseFloat(parts[2]),
        parseFloat(parts[3]),
      );
      tmp.x = scale.x !== 0 ? tmp.x / scale.x : tmp.x;
      tmp.y = scale.y !== 0 ? tmp.y / scale.y : tmp.y;
      tmp.z = scale.z !== 0 ? tmp.z / scale.z : tmp.z;
      tmp.applyQuaternion(quat).normalize();
      out.push(`vn ${fmt(tmp.x)} ${fmt(tmp.y)} ${fmt(tmp.z)}`);
      continue;
    }

    if (tag === "mtllib") {
      if (options?.stripMtllib) continue;
      if (options?.mtlFileName) {
        out.push(`mtllib ${options.mtlFileName}`);
        continue;
      }
      out.push(line);
      continue;
    }

    if (tag === "usemtl" && options?.materialRename && parts[1]) {
      out.push(`usemtl ${options.materialRename(parts[1])}`);
      continue;
    }

    if ((tag === "o" || tag === "g") && prefix) {
      const rest = parts.slice(1).join(" ") || prefix;
      out.push(`${tag} ${prefix}_${rest}`);
      continue;
    }

    out.push(line);
  }

  return out.join("\n");
}

function parseIndexToken(token: string): {
  v: number;
  vt: number | null;
  vn: number | null;
} {
  const parts = token.split("/");
  const v = parseInt(parts[0] || "0", 10);
  const vt =
    parts.length > 1 && parts[1] !== "" ? parseInt(parts[1], 10) : null;
  const vn =
    parts.length > 2 && parts[2] !== "" ? parseInt(parts[2], 10) : null;
  return { v, vt, vn };
}

function absIndex(idx: number, count: number): number {
  return idx < 0 ? count + idx + 1 : idx;
}

function remapFaceToken(
  token: string,
  vOff: number,
  vtOff: number,
  vnOff: number,
  vCount: number,
  vtCount: number,
  vnCount: number,
): string {
  const { v, vt, vn } = parseIndexToken(token);
  const nv = absIndex(v, vCount) + vOff;
  if (vt === null && vn === null) return `${nv}`;
  if (vn === null) {
    return `${nv}/${absIndex(vt!, vtCount) + vtOff}`;
  }
  if (vt === null) {
    return `${nv}//${absIndex(vn, vnCount) + vnOff}`;
  }
  return `${nv}/${absIndex(vt, vtCount) + vtOff}/${absIndex(vn, vnCount) + vnOff}`;
}

function countElements(objText: string): {
  v: number;
  vt: number;
  vn: number;
} {
  let v = 0;
  let vt = 0;
  let vn = 0;
  for (const line of objText.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("v ")) v++;
    else if (t.startsWith("vt ")) vt++;
    else if (t.startsWith("vn ")) vn++;
  }
  return { v, vt, vn };
}

function remapObjIndices(
  objText: string,
  vOff: number,
  vtOff: number,
  vnOff: number,
  counts: { v: number; vt: number; vn: number },
): string {
  const lines = objText.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("f ")) {
      out.push(line);
      continue;
    }
    const parts = trimmed.split(/\s+/);
    const remapped = parts
      .slice(1)
      .map((tok) =>
        remapFaceToken(
          tok,
          vOff,
          vtOff,
          vnOff,
          counts.v,
          counts.vt,
          counts.vn,
        ),
      );
    out.push(`f ${remapped.join(" ")}`);
  }
  return out.join("\n");
}

const MAP_KEYS =
  /^(map_Ka|map_Kd|map_Ks|map_Ns|map_d|map_bump|bump|disp|decal|refl)\b/i;

function mergeMtl(
  objects: SceneObject[],
): { mtlText: string; textures: Map<string, File> } | null {
  const hasAny = objects.some((o) => o.model.mtlText);
  if (!hasAny) return null;

  const usedTextureNames = new Set<string>();
  const textures = new Map<string, File>();
  const mtlChunks: string[] = [];

  for (const obj of objects) {
    const { model } = obj;
    if (!model.mtlText) continue;
    const prefix = sanitizePrefix(model.baseName);
    const texRename = new Map<string, string>();

    for (const [key, file] of model.textures) {
      const base = key.includes("/") ? key.split("/").pop()! : key;
      if (texRename.has(base)) continue;
      let outName = `${prefix}_${base}`;
      if (usedTextureNames.has(outName)) {
        let i = 2;
        while (usedTextureNames.has(`${prefix}_${i}_${base}`)) i++;
        outName = `${prefix}_${i}_${base}`;
      }
      usedTextureNames.add(outName);
      texRename.set(base, outName);
      textures.set(outName, file);
    }

    const lines = model.mtlText.split(/\r?\n/);
    const outLines: string[] = [`# from ${model.objFileName}`];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        outLines.push(line);
        continue;
      }
      const parts = trimmed.split(/\s+/);
      if (parts[0] === "newmtl" && parts[1]) {
        outLines.push(`newmtl ${prefix}_${parts[1]}`);
        continue;
      }
      if (MAP_KEYS.test(parts[0]) && parts.length >= 2) {
        const path = parts[parts.length - 1];
        const fileName = path.replace(/\\/g, "/").split("/").pop()!;
        const renamed = texRename.get(fileName) ?? `${prefix}_${fileName}`;
        const opts = parts.slice(1, -1);
        outLines.push(
          opts.length
            ? `${parts[0]} ${opts.join(" ")} ${renamed}`
            : `${parts[0]} ${renamed}`,
        );
        continue;
      }
      outLines.push(line);
    }
    mtlChunks.push(outLines.join("\n"));
  }

  return { mtlText: mtlChunks.join("\n\n"), textures };
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function mergeAndExport(objects: SceneObject[]): Promise<void> {
  if (objects.length === 0) {
    throw new Error("No models to export.");
  }

  const mtlMerged = mergeMtl(objects);
  const mtlFileName = mtlMerged ? "merged.mtl" : null;

  let vOff = 0;
  let vtOff = 0;
  let vnOff = 0;
  const chunks: string[] = [];

  if (mtlFileName) {
    chunks.push(`mtllib ${mtlFileName}`);
  }

  for (const obj of objects) {
    const prefix = sanitizePrefix(obj.model.baseName);
    const materialRename = (name: string) => `${prefix}_${name}`;

    let baked = bakeObjText(obj.model.objText, obj.transform, {
      stripMtllib: true,
      materialRename: obj.model.mtlText ? materialRename : undefined,
      objectPrefix: obj.model.baseName,
    });

    if (!/^\s*o\s/m.test(baked)) {
      baked = `o ${prefix}\n${baked}`;
    }

    const counts = countElements(baked);
    const remapped = remapObjIndices(baked, vOff, vtOff, vnOff, counts);
    chunks.push(`# --- ${obj.model.objFileName} ---`);
    chunks.push(remapped);

    vOff += counts.v;
    vtOff += counts.vt;
    vnOff += counts.vn;
  }

  const mergedObj = chunks.join("\n");
  const outName =
    objects.length === 1
      ? `${objects[0].model.baseName}_rebaked.obj`
      : "merged.obj";

  if (!mtlMerged) {
    triggerDownload(new Blob([mergedObj], { type: "text/plain" }), outName);
    return;
  }

  const zip = new JSZip();
  zip.file(outName, mergedObj);
  zip.file("merged.mtl", mtlMerged.mtlText);
  for (const [name, file] of mtlMerged.textures) {
    zip.file(name, file);
  }

  const zipName =
    objects.length === 1
      ? `${objects[0].model.baseName}_rebaked.zip`
      : "merged.zip";
  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, zipName);
}
