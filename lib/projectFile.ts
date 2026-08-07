import JSZip from "jszip";
import { loadModelFromFiles } from "@/lib/loadModel";
import {
  cloneTransform,
  IDENTITY_TRANSFORM,
  type ObjectTransform,
  type SceneObject,
} from "@/lib/types";

export const PROJECT_EXTENSION = ".objorig";
export const PROJECT_VERSION = 1;

type ProjectModelMeta = {
  id: string;
  objFileName: string;
  mtlFileName: string | null;
  baseName: string;
  transform: ObjectTransform;
  textureFiles: string[];
};

type ProjectJson = {
  version: number;
  selectedId: string | null;
  models: ProjectModelMeta[];
};

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function textureBaseName(key: string): string {
  return key.includes("/") ? key.split("/").pop()! : key;
}

export function isProjectFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(PROJECT_EXTENSION);
}

/** Build the same ZIP blob used for .objorig downloads (for IndexedDB too). */
export async function buildProjectBlob(
  objects: SceneObject[],
  selectedId: string | null,
  onProgress?: (percent: number) => void,
): Promise<Blob> {
  if (objects.length === 0) {
    throw new Error("Nothing to save.");
  }

  const report = (percent: number) => {
    onProgress?.(Math.max(0, Math.min(100, Math.round(percent))));
  };

  const zip = new JSZip();
  const models: ProjectModelMeta[] = [];
  const packWeight = 20;

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    const dir = `models/${obj.id}`;
    zip.file(`${dir}/model.obj`, obj.model.objText);

    const textureFiles: string[] = [];
    const seen = new Set<string>();
    for (const [key, file] of obj.model.textures) {
      const name = textureBaseName(key);
      if (seen.has(name)) continue;
      seen.add(name);
      textureFiles.push(name);
      zip.file(`${dir}/textures/${name}`, await file.arrayBuffer());
    }

    if (obj.model.mtlText && obj.model.mtlFileName) {
      zip.file(`${dir}/model.mtl`, obj.model.mtlText);
    }

    models.push({
      id: obj.id,
      objFileName: obj.model.objFileName,
      mtlFileName: obj.model.mtlFileName,
      baseName: obj.model.baseName,
      transform: cloneTransform(obj.transform),
      textureFiles,
    });

    report(((i + 1) / objects.length) * packWeight);
  }

  const project: ProjectJson = {
    version: PROJECT_VERSION,
    selectedId,
    models,
  };
  zip.file("project.json", JSON.stringify(project, null, 2));
  report(packWeight);

  return zip.generateAsync({ type: "blob" }, (metadata) => {
    report(packWeight + (metadata.percent / 100) * (100 - packWeight));
  });
}

export async function saveProject(
  objects: SceneObject[],
  selectedId: string | null,
  filename?: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const blob = await buildProjectBlob(objects, selectedId, onProgress);

  const outName =
    filename ??
    (objects.length === 1
      ? `${objects[0].model.baseName}_project${PROJECT_EXTENSION}`
      : `project${PROJECT_EXTENSION}`);

  triggerDownload(
    blob,
    outName.endsWith(PROJECT_EXTENSION)
      ? outName
      : `${outName}${PROJECT_EXTENSION}`,
  );
  onProgress?.(100);
}

export async function loadProjectFromBlob(
  data: Blob | ArrayBuffer | File,
): Promise<{ objects: SceneObject[]; selectedId: string | null }> {
  const zip = await JSZip.loadAsync(data);
  const projectEntry = zip.file("project.json");
  if (!projectEntry) {
    throw new Error("Invalid project file: missing project.json.");
  }

  const project = JSON.parse(await projectEntry.async("string")) as ProjectJson;
  if (!project.version || !Array.isArray(project.models)) {
    throw new Error("Invalid project file: bad project.json.");
  }

  const objects: SceneObject[] = [];

  for (const meta of project.models) {
    const dir = `models/${meta.id}`;
    const objEntry = zip.file(`${dir}/model.obj`);
    if (!objEntry) {
      throw new Error(`Invalid project file: missing ${dir}/model.obj.`);
    }

    const files: File[] = [];
    const objBlob = await objEntry.async("blob");
    files.push(
      new File([objBlob], meta.objFileName || "model.obj", {
        type: "text/plain",
      }),
    );

    if (meta.mtlFileName) {
      const mtlEntry = zip.file(`${dir}/model.mtl`);
      if (mtlEntry) {
        const mtlBlob = await mtlEntry.async("blob");
        files.push(
          new File([mtlBlob], meta.mtlFileName, { type: "text/plain" }),
        );
      }
    }

    for (const texName of meta.textureFiles ?? []) {
      const texEntry = zip.file(`${dir}/textures/${texName}`);
      if (!texEntry) continue;
      const texBlob = await texEntry.async("blob");
      files.push(new File([texBlob], texName));
    }

    const model = await loadModelFromFiles(files);
    model.objFileName = meta.objFileName || model.objFileName;
    model.mtlFileName = meta.mtlFileName;
    model.baseName = meta.baseName || model.baseName;

    objects.push({
      id: meta.id,
      model,
      transform: meta.transform
        ? cloneTransform({
            position: meta.transform.position ?? IDENTITY_TRANSFORM.position,
            rotation: meta.transform.rotation ?? IDENTITY_TRANSFORM.rotation,
            scale: meta.transform.scale ?? IDENTITY_TRANSFORM.scale,
          })
        : cloneTransform(IDENTITY_TRANSFORM),
    });
  }

  if (objects.length === 0) {
    throw new Error("Project contains no models.");
  }

  const selectedId =
    project.selectedId && objects.some((o) => o.id === project.selectedId)
      ? project.selectedId
      : objects[0].id;

  return { objects, selectedId };
}

export async function loadProject(
  file: File,
): Promise<{ objects: SceneObject[]; selectedId: string | null }> {
  return loadProjectFromBlob(file);
}
