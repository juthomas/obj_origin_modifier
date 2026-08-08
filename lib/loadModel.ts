import * as THREE from "three";
import JSZip from "jszip";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import type { LoadedModel } from "./types";

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|tga)$/i;

function basename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}

function isModelArchive(file: File): boolean {
  return file.name.toLowerCase().endsWith(".zip");
}

function isModelAssetName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".obj") ||
    lower.endsWith(".mtl") ||
    IMAGE_EXT.test(name)
  );
}

/** Let the browser paint (e.g. loading overlay) before heavy main-thread work. */
export function yieldToMain(ms = 32): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Unpack .zip model packs (e.g. Meshy) into flat OBJ/MTL/texture Files. */
export async function expandModelArchives(files: File[]): Promise<File[]> {
  const out: File[] = [];

  for (const file of files) {
    if (!isModelArchive(file)) {
      out.push(file);
      continue;
    }

    const buffer = await file.arrayBuffer();
    await yieldToMain();
    const zip = await JSZip.loadAsync(buffer);
    await yieldToMain();
    let foundAsset = false;

    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const normalized = path.replace(/\\/g, "/");
      if (normalized.includes("__MACOSX/") || normalized.includes("/.")) continue;

      const name = normalizePath(normalized);
      if (!isModelAssetName(name)) continue;

      const blob = await entry.async("blob");
      const lower = name.toLowerCase();
      const type =
        lower.endsWith(".obj") || lower.endsWith(".mtl")
          ? "text/plain"
          : blob.type || undefined;
      out.push(new File([blob], name, type ? { type } : undefined));
      foundAsset = true;
      // Large Meshy OBJs — yield so the loading spinner can keep animating.
      if (blob.size > 1_000_000) await yieldToMain(16);
    }

    if (!foundAsset) {
      throw new Error(
        `No .obj / .mtl / texture files found in "${file.name}".`,
      );
    }
  }

  return out;
}

/** Resolves when LoadingManager has finished (or nothing was queued). */
function waitForManager(manager: THREE.LoadingManager): Promise<void> {
  return new Promise((resolve) => {
    let pending = 0;
    const prevOnStart = manager.onStart;
    const prevOnLoad = manager.onLoad;
    const prevOnError = manager.onError;

    manager.onStart = (url, loaded, total) => {
      pending = total;
      prevOnStart?.(url, loaded, total);
    };
    manager.onLoad = () => {
      prevOnLoad?.();
      resolve();
    };
    manager.onError = (url) => {
      prevOnError?.(url);
      // Still resolve so a missing map does not hang the UI forever.
      resolve();
    };

    queueMicrotask(() => {
      if (pending === 0) resolve();
    });
  });
}

export type LoadModelStatus = (message: string) => void;

export async function loadModelFromFiles(
  files: File[],
  onStatus?: LoadModelStatus,
): Promise<LoadedModel> {
  const hasZip = files.some(isModelArchive);
  if (hasZip) {
    onStatus?.("Unpacking archive…");
    await yieldToMain();
  }

  const expanded = await expandModelArchives(files);
  const objFile = expanded.find((f) => f.name.toLowerCase().endsWith(".obj"));
  if (!objFile) {
    throw new Error("No .obj file found.");
  }

  const mtlFile = expanded.find((f) => f.name.toLowerCase().endsWith(".mtl"));
  const textureFiles = expanded.filter((f) => IMAGE_EXT.test(f.name));

  const textures = new Map<string, File>();
  const blobUrls: string[] = [];

  for (const file of textureFiles) {
    textures.set(normalizePath(file.name), file);
    textures.set(file.name, file);
  }

  onStatus?.("Reading model…");
  await yieldToMain();
  const objText = await objFile.text();
  const mtlText = mtlFile ? await mtlFile.text() : null;
  await yieldToMain();

  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    const key = normalizePath(url);
    const file = textures.get(key) ?? textures.get(url);
    if (file) {
      const blobUrl = URL.createObjectURL(file);
      blobUrls.push(blobUrl);
      return blobUrl;
    }
    // Case-insensitive fallback for MTL paths vs dropped filenames.
    const lower = key.toLowerCase();
    for (const [k, f] of textures) {
      if (normalizePath(k).toLowerCase() === lower) {
        const blobUrl = URL.createObjectURL(f);
        blobUrls.push(blobUrl);
        return blobUrl;
      }
    }
    return url;
  });

  let object: THREE.Group;

  if (mtlText && mtlFile) {
    onStatus?.("Loading textures…");
    await yieldToMain();
    const texturesReady = waitForManager(manager);
    const mtlLoader = new MTLLoader(manager);
    const materials = mtlLoader.parse(mtlText, "");
    materials.preload();
    await texturesReady;

    onStatus?.("Parsing model…");
    await yieldToMain();
    const objLoader = new OBJLoader(manager);
    objLoader.setMaterials(materials);
    object = objLoader.parse(objText);
  } else {
    onStatus?.("Parsing model…");
    await yieldToMain();
    const objLoader = new OBJLoader(manager);
    object = objLoader.parse(objText);
  }

  // Default gray material for meshes without materials
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (!child.material) {
        child.material = new THREE.MeshStandardMaterial({
          color: 0x9aa3ad,
          metalness: 0.1,
          roughness: 0.75,
        });
      }
    }
  });

  return {
    object,
    objText,
    objFileName: objFile.name,
    mtlText,
    mtlFileName: mtlFile?.name ?? null,
    textures,
    baseName: basename(objFile.name),
  };
}

export function disposeModel(model: LoadedModel | null) {
  if (!model) return;
  model.object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      const mats = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const mat of mats) {
        if (!mat) continue;
        for (const key of Object.keys(mat) as (keyof typeof mat)[]) {
          const value = mat[key];
          if (value && typeof value === "object" && "isTexture" in value) {
            (value as THREE.Texture).dispose();
          }
        }
        mat.dispose();
      }
    }
  });
}
