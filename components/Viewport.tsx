"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  TransformControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
} from "@react-three/drei";
import * as THREE from "three";
import type { DisplayMode, GizmoMode, PivotState } from "@/lib/types";

type ViewportProps = {
  object: THREE.Group;
  pivot: PivotState;
  onPivotChange: (pivot: PivotState) => void;
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
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        items.push({
          geometry: new THREE.EdgesGeometry(child.geometry, 20),
          matrix: child.matrixWorld.clone(),
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

function FitCamera({ object }: { object: THREE.Group }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);

  useEffect(() => {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const dist = maxDim * 2.2;

    // Three.js cameras are mutable by design
    camera.position.set(
      center.x + dist * 0.7,
      center.y + dist * 0.55,
      center.z + dist * 0.7,
    );
    if (camera instanceof THREE.PerspectiveCamera) {
      // eslint-disable-next-line react-hooks/immutability -- three.js camera
      camera.near = Math.max(dist / 200, 0.01);
      camera.far = dist * 50;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(center);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orbit = controls as any;
    if (orbit?.target) {
      orbit.target.copy(center);
      orbit.update?.();
    }
  }, [object, camera, controls]);

  return null;
}

function SceneContent({
  object,
  pivot,
  onPivotChange,
  gizmoMode,
  displayMode,
}: ViewportProps) {
  const pivotRef = useRef<THREE.Group>(null);
  const [target, setTarget] = useState<THREE.Object3D | null>(null);
  const dragging = useRef(false);
  const [orbitEnabled, setOrbitEnabled] = useState(true);

  useEffect(() => {
    setTarget(pivotRef.current);
  }, []);

  useEffect(() => {
    const g = pivotRef.current;
    if (!g || dragging.current) return;
    g.position.set(...pivot.position);
    g.rotation.set(...pivot.rotation);
  }, [pivot]);

  const gridSize = useMemo(() => {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    return Math.max(size.x, size.z, 2) * 2;
  }, [object]);

  const axisLen = Math.max(gridSize * 0.12, 0.4);

  const syncPivot = () => {
    const g = pivotRef.current;
    if (!g) return;
    onPivotChange({
      position: [g.position.x, g.position.y, g.position.z],
      rotation: [g.rotation.x, g.rotation.y, g.rotation.z],
    });
  };

  return (
    <>
      <color attach="background" args={["#0b0d10"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 8, 4]} intensity={1.1} />
      <directionalLight position={[-4, 2, -3]} intensity={0.35} />

      <ModelView object={object} displayMode={displayMode} />

      <group ref={pivotRef}>
        <axesHelper args={[axisLen]} />
      </group>

      {target && (
        <TransformControls
          object={target}
          mode={gizmoMode}
          size={0.9}
          onMouseDown={() => {
            dragging.current = true;
            setOrbitEnabled(false);
          }}
          onMouseUp={() => {
            dragging.current = false;
            setOrbitEnabled(true);
            syncPivot();
          }}
          onObjectChange={syncPivot}
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

      <FitCamera object={object} />

      <OrbitControls
        makeDefault
        enabled={orbitEnabled}
        enableDamping
        dampingFactor={0.08}
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
    <div className="relative h-full min-h-[320px] w-full flex-1 bg-[#0b0d10]">
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
