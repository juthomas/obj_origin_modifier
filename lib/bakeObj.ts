import * as THREE from "three";
import JSZip from "jszip";
import type { LoadedModel, ObjectTransform } from "./types";

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

/**
 * Bake object transform into vertices (origin stays at world 0).
 * v' = R · v + T
 * Normals: n' = normalize(R · n)
 */
export function bakeObjText(
  objText: string,
  transform: ObjectTransform,
  options?: { mtlFileName?: string | null },
): string {
  const translation = new THREE.Vector3(...transform.position);
  const rotation = new THREE.Euler(...transform.rotation, "XYZ");
  const quat = new THREE.Quaternion().setFromEuler(rotation);

  const tmp = new THREE.Vector3();
  const lines = objText.split(/\r?\n/);
  const out: string[] = [];

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
      tmp.applyQuaternion(quat).add(translation);
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
      tmp.applyQuaternion(quat).normalize();
      out.push(`vn ${fmt(tmp.x)} ${fmt(tmp.y)} ${fmt(tmp.z)}`);
      continue;
    }

    if (tag === "mtllib" && options?.mtlFileName) {
      out.push(`mtllib ${options.mtlFileName}`);
      continue;
    }

    out.push(line);
  }

  return out.join("\n");
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportBakedModel(
  model: LoadedModel,
  transform: ObjectTransform,
): Promise<void> {
  const mtlName = model.mtlFileName;
  const bakedObj = bakeObjText(model.objText, transform, {
    mtlFileName: mtlName,
  });

  const objOutName = `${model.baseName}_rebaked.obj`;

  if (!model.mtlText || !mtlName) {
    triggerDownload(
      new Blob([bakedObj], { type: "text/plain" }),
      objOutName,
    );
    return;
  }

  const zip = new JSZip();
  zip.file(objOutName, bakedObj);
  zip.file(mtlName, model.mtlText);

  const seen = new Set<string>();
  for (const [key, file] of model.textures) {
    const name = key.includes("/") ? key.split("/").pop()! : key;
    if (seen.has(name)) continue;
    seen.add(name);
    zip.file(name, file);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, `${model.baseName}_rebaked.zip`);
}
