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
  onReady?: () => void;
};

/** Fires after the canvas has painted at least one frame with scene items. */
function SceneReadySignal({
  itemCount,
  itemKey,
  onReady,
}: {
  itemCount: number;
  itemKey: string;
  onReady?: () => void;
}) {
  useEffect(() => {
    if (!onReady || itemCount === 0) return;
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) onReady();
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [itemCount, itemKey, onReady]);
  return null;
}

function applyDisplayMode(root: THREE.Object3D, mode: DisplayMode) {
  const wireframe = mode === "wireframe";
  const hideMesh = mode === "points";
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.visible = !hideMesh;
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

function PointCloud({
  geometry,
  matrix,
}: {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
}) {
  const ref = useRef<THREE.Points>(null);

  useLayoutEffect(() => {
    const pts = ref.current;
    if (!pts) return;
    pts.matrixAutoUpdate = false;
    pts.matrix.copy(matrix);
  }, [matrix]);

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial color="#d0d8e0" size={2} sizeAttenuation={false} />
    </points>
  );
}

function collectMeshItems(object: THREE.Group) {
  const items: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = [];
  object.updateMatrixWorld(true);
  const invRoot = object.matrixWorld.clone().invert();
  object.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      items.push({
        geometry: child.geometry,
        matrix: invRoot.clone().multiply(child.matrixWorld),
      });
    }
  });
  return items;
}

function ModelView({
  object,
  displayMode,
}: {
  object: THREE.Group;
  displayMode: DisplayMode;
}) {
  const edgeItems = useMemo(() => {
    return collectMeshItems(object).map((item) => ({
      geometry: new THREE.EdgesGeometry(item.geometry, 20),
      matrix: item.matrix,
    }));
  }, [object]);

  const pointItems = useMemo(() => {
    if (displayMode !== "points") return [];
    return collectMeshItems(object);
  }, [object, displayMode]);

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
      {displayMode === "points" &&
        pointItems.map((item, i) => (
          <PointCloud key={i} geometry={item.geometry} matrix={item.matrix} />
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

/** Clears stuck orbit drag when the pointer is released outside the window. */
function SafeOrbitControls({
  enabled,
  target,
}: {
  enabled: boolean;
  target: [number, number, number];
}) {
  const controlsRef = useRef<{ domElement: HTMLElement | null } | null>(null);

  useEffect(() => {
    let cleaned = false;
    let detach: (() => void) | null = null;

    const attach = () => {
      const dom = controlsRef.current?.domElement;
      if (cleaned || detach) return true;
      if (!dom) return false;

      let activePointerId: number | null = null;

      const clearActive = () => {
        activePointerId = null;
      };

      const forceEnd = () => {
        if (activePointerId === null) return;
        const pointerId = activePointerId;
        activePointerId = null;
        // three-stdlib OrbitControls listens on ownerDocument; synthetic up clears stuck drag
        dom.ownerDocument.dispatchEvent(
          new PointerEvent("pointerup", {
            bubbles: true,
            cancelable: true,
            pointerId,
            pointerType: "mouse",
            button: 0,
            buttons: 0,
            view: window,
          }),
        );
      };

      const onPointerDown = (event: PointerEvent) => {
        activePointerId = event.pointerId;
      };

      const onPointerUp = (event: PointerEvent) => {
        if (event.pointerId === activePointerId) clearActive();
      };

      const onPointerMove = (event: PointerEvent) => {
        // Released outside the window: buttons is 0 but controls still think we're dragging
        if (event.buttons === 0 && activePointerId !== null) {
          forceEnd();
        }
      };

      const onBlur = () => forceEnd();

      dom.addEventListener("pointerdown", onPointerDown);
      document.addEventListener("pointerup", onPointerUp);
      document.addEventListener("pointercancel", onPointerUp);
      document.addEventListener("pointermove", onPointerMove);
      window.addEventListener("blur", onBlur);

      detach = () => {
        dom.removeEventListener("pointerdown", onPointerDown);
        document.removeEventListener("pointerup", onPointerUp);
        document.removeEventListener("pointercancel", onPointerUp);
        document.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("blur", onBlur);
      };
      return true;
    };

    let pollId: number | null = null;
    if (!attach()) {
      pollId = window.setInterval(() => {
        if (attach() && pollId !== null) {
          window.clearInterval(pollId);
          pollId = null;
        }
      }, 50);
    }

    return () => {
      cleaned = true;
      if (pollId !== null) window.clearInterval(pollId);
      detach?.();
    };
  }, []);

  return (
    <OrbitControls
      ref={controlsRef as never}
      makeDefault
      enabled={enabled}
      enableDamping
      dampingFactor={0.08}
      target={target}
    />
  );
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

      <SafeOrbitControls enabled={orbitEnabled} target={[0, 0, 0]} />

      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport
          axisColors={["#ef4444", "#22c55e", "#3b82f6"]}
          labelColor="#e8eef4"
        />
      </GizmoHelper>
    </>
  );
}

export function Viewport({ onReady, ...props }: ViewportProps) {
  const itemKey = props.items.map((item) => item.id).join(",");

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
        <SceneReadySignal
          itemCount={props.items.length}
          itemKey={itemKey}
          onReady={onReady}
        />
      </Canvas>
    </div>
  );
}
