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

    if (tag === "usemtl" && options?.materialRename && parts.length >= 2) {
      const matName = parts.slice(1).join(" ");
      out.push(`usemtl ${options.materialRename(matName)}`);
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

function textureBaseName(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}

/** Stable unique prefix so materials/textures from same-named OBJs do not collide. */
function materialPrefix(obj: SceneObject): string {
  return sanitizePrefix(`${obj.model.baseName}_${obj.id}`);
}

function findTextureFile(
  textures: Map<string, File>,
  fileName: string,
): File | undefined {
  const direct = textures.get(fileName);
  if (direct) return direct;

  const lower = fileName.toLowerCase();
  for (const [key, file] of textures) {
    const base = textureBaseName(key);
    if (base === fileName || base.toLowerCase() === lower) return file;
    if (file.name === fileName || file.name.toLowerCase() === lower) return file;
  }
  return undefined;
}

function textureExtension(fileName: string): string {
  const base = textureBaseName(fileName);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return ".png";
  return base.slice(dot);
}

function mergeMtl(
  objects: SceneObject[],
  exportBase: string,
): { mtlText: string; textures: Map<string, File> } | null {
  const hasAny = objects.some((o) => o.model.mtlText);
  if (!hasAny) return null;

  const textures = new Map<string, File>();
  const mtlChunks: string[] = [];
  const texPrefix = sanitizePrefix(exportBase);
  let textureIndex = 0;

  const nextTextureName = (ext: string) => {
    textureIndex += 1;
    return `${texPrefix}_${textureIndex}${ext}`;
  };

  for (const obj of objects) {
    const { model } = obj;
    if (!model.mtlText) continue;
    const prefix = materialPrefix(obj);
    /** lowercase basename → exported filename in the zip */
    const texRename = new Map<string, string>();

    const registerTexture = (file: File, preferredName: string) => {
      const texFileName = textureBaseName(file.name) || preferredName;
      const key = texFileName.toLowerCase();
      const existing = texRename.get(key);
      if (existing) return existing;

      const outName = nextTextureName(textureExtension(texFileName));
      texRename.set(key, outName);
      textures.set(outName, file);
      return outName;
    };

    for (const [key, file] of model.textures) {
      registerTexture(file, textureBaseName(key));
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
      if (parts[0].toLowerCase() === "newmtl" && parts.length >= 2) {
        const matName = parts.slice(1).join(" ");
        outLines.push(`newmtl ${prefix}_${matName}`);
        continue;
      }
      if (MAP_KEYS.test(parts[0]) && parts.length >= 2) {
        const path = parts[parts.length - 1];
        const fileName = textureBaseName(path);
        let renamed = texRename.get(fileName.toLowerCase());
        if (!renamed) {
          const file = findTextureFile(model.textures, fileName);
          if (file) {
            renamed = registerTexture(file, fileName);
          } else {
            // Missing file: still emit a numbered placeholder name in the MTL.
            renamed = nextTextureName(textureExtension(fileName));
          }
        }
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

export async function mergeAndExport(
  objects: SceneObject[],
  baseName: string,
): Promise<void> {
  if (objects.length === 0) {
    throw new Error("No models to export.");
  }

  const base = sanitizePrefix(baseName.replace(/\.(obj|zip)$/i, ""));
  const outName = `${base}.obj`;
  const mtlMerged = mergeMtl(objects, base);
  // Match OBJ basename so importers that ignore mtllib still find the MTL.
  const mtlFileName = mtlMerged ? `${base}.mtl` : null;

  let vOff = 0;
  let vtOff = 0;
  let vnOff = 0;
  const chunks: string[] = [];

  if (mtlFileName) {
    chunks.push(`mtllib ${mtlFileName}`);
  }

  for (const obj of objects) {
    const prefix = materialPrefix(obj);
    const materialRename = (name: string) => `${prefix}_${name}`;

    let baked = bakeObjText(obj.model.objText, obj.transform, {
      stripMtllib: true,
      materialRename: obj.model.mtlText ? materialRename : undefined,
      objectPrefix: obj.model.baseName,
    });

    if (!/^\s*o\s/m.test(baked)) {
      baked = `o ${sanitizePrefix(obj.model.baseName)}\n${baked}`;
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

  if (!mtlMerged || !mtlFileName) {
    triggerDownload(new Blob([mergedObj], { type: "text/plain" }), outName);
    return;
  }

  const zip = new JSZip();
  zip.file(outName, mergedObj);
  zip.file(mtlFileName, mtlMerged.mtlText);
  for (const [name, file] of mtlMerged.textures) {
    // File/Blob can fail in some JSZip environments; ArrayBuffer is reliable.
    zip.file(name, await file.arrayBuffer());
  }

  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, `${base}.zip`);
}
