import * as THREE from "three";
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

export async function loadModelFromFiles(files: File[]): Promise<LoadedModel> {
  const objFile = files.find((f) => f.name.toLowerCase().endsWith(".obj"));
  if (!objFile) {
    throw new Error("No .obj file found.");
  }

  const mtlFile = files.find((f) => f.name.toLowerCase().endsWith(".mtl"));
  const textureFiles = files.filter((f) => IMAGE_EXT.test(f.name));

  const textures = new Map<string, File>();
  const blobUrls: string[] = [];

  for (const file of textureFiles) {
    textures.set(normalizePath(file.name), file);
    textures.set(file.name, file);
  }

  const objText = await objFile.text();
  const mtlText = mtlFile ? await mtlFile.text() : null;

  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    const key = normalizePath(url);
    const file = textures.get(key) ?? textures.get(url);
    if (file) {
      const blobUrl = URL.createObjectURL(file);
      blobUrls.push(blobUrl);
      return blobUrl;
    }
    return url;
  });

  let object: THREE.Group;

  if (mtlText && mtlFile) {
    const mtlLoader = new MTLLoader(manager);
    const materials = mtlLoader.parse(mtlText, "");
    materials.preload();
    const objLoader = new OBJLoader(manager);
    objLoader.setMaterials(materials);
    object = objLoader.parse(objText);
  } else {
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
