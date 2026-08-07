"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  TransformControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
  Billboard,
  Text,
} from "@react-three/drei";
import * as THREE from "three";
import type {
  DisplayMode,
  GizmoMode,
  ObjectTransform,
} from "@/lib/types";

export type ViewportItem = {
  id: string;
  object: THREE.Group;
  transform: ObjectTransform;
};

function AxisLabels({ length }: { length: number }) {
  const labelSize = Math.max(length * 0.22, 0.18);
  const labelOffset = length * 1.12;
  const axes: { label: string; color: string; position: [number, number, number] }[] =
    [
      { label: "X", color: "#ef4444", position: [labelOffset, 0, 0] },
      { label: "Y", color: "#22c55e", position: [0, labelOffset, 0] },
      { label: "Z", color: "#3b82f6", position: [0, 0, labelOffset] },
    ];

  const makeLabelOnTop = (mesh: THREE.Mesh | null) => {
    if (!mesh) return;
    mesh.renderOrder = 1000;
    mesh.raycast = () => undefined;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      m.depthTest = false;
      m.depthWrite = false;
      m.transparent = true;
      m.needsUpdate = true;
    }
  };

  return (
    <group renderOrder={1000}>
      {axes.map(({ label, color, position }) => (
        <Billboard key={label} position={position} renderOrder={1000}>
          <Text
            ref={makeLabelOnTop}
            fontSize={labelSize}
            color={color}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.045}
            outlineColor="#0b0d10"
            renderOrder={1000}
          >
            {label}
          </Text>
        </Billboard>
      ))}
    </group>
  );
}

function WorldOriginGizmo({ length }: { length: number }) {
  const helperRef = useRef<THREE.AxesHelper>(null);

  useLayoutEffect(() => {
    const helper = helperRef.current;
    if (!helper) return;
    helper.renderOrder = 1000;
    const mat = helper.material as THREE.Material | THREE.Material[];
    const mats = Array.isArray(mat) ? mat : [mat];
    for (const m of mats) {
      if (!m) continue;
      m.depthTest = false;
      m.depthWrite = false;
      m.transparent = true;
      m.needsUpdate = true;
    }
  }, []);

  return (
    <group renderOrder={1000}>
      <axesHelper ref={helperRef} args={[length]} />
      <AxisLabels length={length} />
    </group>
  );
}

function makeGizmoAlwaysOnTop(root: THREE.Object3D) {
  root.renderOrder = 1000;
  root.traverse((obj) => {
    obj.renderOrder = 1000;
    const mesh = obj as THREE.Mesh;
    if (!mesh.material) return;
    const mats = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      m.depthTest = false;
      m.depthWrite = false;
      if ("transparent" in m) m.transparent = true;
      m.needsUpdate = true;
    }
  });
}

type ViewportProps = {
  items: ViewportItem[];
  selectedId: string | null;
  onTransformChange: (id: string, transform: ObjectTransform) => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
  gizmoMode: GizmoMode;
  displayMode: DisplayMode;
};

function applyDisplayMode(root: THREE.Object3D, mode: DisplayMode) {
  const wireframe = mode === "wireframe";
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mats = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const mat of mats) {
      if (!mat || !("wireframe" in mat)) continue;
      (mat as THREE.MeshStandardMaterial).wireframe = wireframe;
      mat.needsUpdate = true;
    }
  });
}

function EdgeLine({
  geometry,
  matrix,
}: {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
}) {
  const ref = useRef<THREE.LineSegments>(null);

  useLayoutEffect(() => {
    const line = ref.current;
    if (!line) return;
    line.matrixAutoUpdate = false;
    line.matrix.copy(matrix);
  }, [matrix]);

  return (
    <lineSegments ref={ref} geometry={geometry}>
      <lineBasicMaterial color="#d0d8e0" transparent opacity={0.75} />
    </lineSegments>
  );
}

function ModelView({
  object,
  displayMode,
}: {
  object: THREE.Group;
  displayMode: DisplayMode;
}) {
  const edgeItems = useMemo(() => {
    const items: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] =
      [];
    object.updateMatrixWorld(true);
    const invRoot = object.matrixWorld.clone().invert();
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        items.push({
          geometry: new THREE.EdgesGeometry(child.geometry, 20),
          matrix: invRoot.clone().multiply(child.matrixWorld),
        });
      }
    });
    return items;
  }, [object]);

  useEffect(() => {
    return () => {
      edgeItems.forEach((e) => e.geometry.dispose());
    };
  }, [edgeItems]);

  useEffect(() => {
    applyDisplayMode(object, displayMode === "both" ? "solid" : displayMode);
  }, [object, displayMode]);

  return (
    <group>
      <primitive object={object} />
      {displayMode === "both" &&
        edgeItems.map((item, i) => (
          <EdgeLine key={i} geometry={item.geometry} matrix={item.matrix} />
        ))}
    </group>
  );
}

function SceneObjectGroup({
  item,
  displayMode,
  groupRef,
}: {
  item: ViewportItem;
  displayMode: DisplayMode;
  groupRef?: (node: THREE.Group | null) => void;
}) {
  const localRef = useRef<THREE.Group>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const g = localRef.current;
    if (!g || dragging.current) return;
    g.position.set(...item.transform.position);
    g.rotation.set(...item.transform.rotation);
    g.scale.set(...item.transform.scale);
  }, [item.transform]);

  return (
    <group
      ref={(node) => {
        localRef.current = node;
        groupRef?.(node);
      }}
    >
      <ModelView object={item.object} displayMode={displayMode} />
    </group>
  );
}

function FitCamera({ objects }: { objects: THREE.Object3D[] }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  const cameraRef = useRef(camera);
  const objectsRef = useRef(objects);
  const prevIdsRef = useRef<string[]>([]);

  useLayoutEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useLayoutEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  const ids = objects.map((o) => o.uuid);
  const idKey = ids.join("|");

  useEffect(() => {
    const currentObjects = objectsRef.current;
    if (currentObjects.length === 0) return;
    const currentIds = currentObjects.map((o) => o.uuid);
    const prev = prevIdsRef.current;
    const isFirst = prev.length === 0;
    const isReplace =
      prev.length > 0 && currentIds.every((id) => !prev.includes(id));
    prevIdsRef.current = currentIds;
    if (!isFirst && !isReplace) return;

    const cam = cameraRef.current;
    const box = new THREE.Box3();
    for (const obj of currentObjects) {
      box.expandByObject(obj);
    }
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const dist = maxDim * 2.2;

    cam.position.set(dist * 0.7, dist * 0.55, dist * 0.7);
    if (cam instanceof THREE.PerspectiveCamera) {
      cam.near = Math.max(dist / 200, 0.01);
      cam.far = dist * 50;
      cam.updateProjectionMatrix();
    }
    cam.lookAt(0, 0, 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orbit = controls as any;
    if (orbit?.target) {
      orbit.target.set(0, 0, 0);
      orbit.update?.();
    }
  }, [idKey, controls]);

  return null;
}

function SceneContent({
  items,
  selectedId,
  onTransformChange,
  onGestureStart,
  onGestureEnd,
  gizmoMode,
  displayMode,
}: ViewportProps) {
  const selectedRef = useRef<THREE.Group | null>(null);
  const [target, setTarget] = useState<THREE.Object3D | null>(null);
  const controlsRef = useRef<THREE.Object3D>(null);
  const dragging = useRef(false);
  const [orbitEnabled, setOrbitEnabled] = useState(true);

  useLayoutEffect(() => {
    setTarget(selectedRef.current);
  }, [selectedId, items]);

  useLayoutEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    makeGizmoAlwaysOnTop(controls);
  }, [target, gizmoMode]);

  const gridSize = useMemo(() => {
    const box = new THREE.Box3();
    for (const item of items) {
      box.expandByObject(item.object);
    }
    const size = box.getSize(new THREE.Vector3());
    return Math.max(size.x, size.z, 2) * 2;
  }, [items]);

  const axisLen = Math.max(gridSize * 0.15, 0.5);

  const syncTransform = () => {
    const g = selectedRef.current;
    if (!g || !selectedId) return;
    onTransformChange(selectedId, {
      position: [g.position.x, g.position.y, g.position.z],
      rotation: [g.rotation.x, g.rotation.y, g.rotation.z],
      scale: [g.scale.x, g.scale.y, g.scale.z],
    });
  };

  return (
    <>
      <color attach="background" args={["#0b0d10"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 8, 4]} intensity={1.1} />
      <directionalLight position={[-4, 2, -3]} intensity={0.35} />

      <WorldOriginGizmo length={axisLen} />

      {items.map((item) => (
        <SceneObjectGroup
          key={item.id}
          item={item}
          displayMode={displayMode}
          groupRef={
            item.id === selectedId
              ? (node) => {
                  selectedRef.current = node;
                }
              : undefined
          }
        />
      ))}

      {target && selectedId && (
        <TransformControls
          key={selectedId}
          ref={controlsRef as never}
          object={target}
          mode={gizmoMode}
          size={0.9}
          onMouseDown={() => {
            dragging.current = true;
            setOrbitEnabled(false);
            onGestureStart();
          }}
          onMouseUp={() => {
            dragging.current = false;
            setOrbitEnabled(true);
            syncTransform();
            onGestureEnd();
          }}
          onObjectChange={syncTransform}
        />
      )}

      <Grid
        args={[gridSize, 20]}
        cellSize={gridSize / 20}
        sectionSize={gridSize / 4}
        cellColor="#1c222b"
        sectionColor="#2a3340"
        fadeDistance={gridSize * 3}
        infiniteGrid
      />

      <FitCamera objects={items.map((i) => i.object)} />

      <OrbitControls
        makeDefault
        enabled={orbitEnabled}
        enableDamping
        dampingFactor={0.08}
        target={[0, 0, 0]}
      />

      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport
          axisColors={["#ef4444", "#22c55e", "#3b82f6"]}
          labelColor="#e8eef4"
        />
      </GizmoHelper>
    </>
  );
}

export function Viewport(props: ViewportProps) {
  return (
    <div className="relative h-full min-h-[320px] min-w-0 flex-1 overflow-hidden bg-[#0b0d10]">
      <Canvas
        camera={{ position: [3, 2, 3], fov: 45, near: 0.01, far: 5000 }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.setClearColor("#0b0d10");
        }}
      >
        <SceneContent {...props} />
      </Canvas>
    </div>
  );
}
