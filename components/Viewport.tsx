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
import type { DisplayMode, GizmoMode, ObjectTransform } from "@/lib/types";

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

function LabeledAxes({ length }: { length: number }) {
  const helperRef = useRef<THREE.AxesHelper>(null);

  useLayoutEffect(() => {
    const helper = helperRef.current;
    if (!helper) return;
    helper.renderOrder = 999;
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
    <group>
      <axesHelper ref={helperRef} args={[length]} />
      <AxisLabels length={length} />
    </group>
  );
}

/** Draw transform gizmo on top of the mesh (depthTest false + high renderOrder). */
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
  object: THREE.Group;
  transform: ObjectTransform;
  onTransformChange: (transform: ObjectTransform) => void;
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

function FitCamera({ object }: { object: THREE.Group }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  const cameraRef = useRef(camera);
  const fittedFor = useRef<THREE.Group | null>(null);

  useLayoutEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    // Frame once per loaded object; orbit pivot stays on the world-origin gizmo
    if (fittedFor.current === object) return;
    fittedFor.current = object;

    const cam = cameraRef.current;
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const dist = maxDim * 2.2;

    // Orbit around fixed world origin (0,0,0)
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
  }, [object, controls]);

  return null;
}

function SceneContent({
  object,
  transform,
  onTransformChange,
  onGestureStart,
  onGestureEnd,
  gizmoMode,
  displayMode,
}: ViewportProps) {
  const objectRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<THREE.Object3D>(null);
  const [target, setTarget] = useState<THREE.Object3D | null>(null);
  const dragging = useRef(false);
  const [orbitEnabled, setOrbitEnabled] = useState(true);

  useEffect(() => {
    setTarget(objectRef.current);
  }, []);

  useLayoutEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    makeGizmoAlwaysOnTop(controls);
  }, [target, gizmoMode]);

  useEffect(() => {
    const g = objectRef.current;
    if (!g || dragging.current) return;
    g.position.set(...transform.position);
    g.rotation.set(...transform.rotation);
  }, [transform]);

  const gridSize = useMemo(() => {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    return Math.max(size.x, size.z, 2) * 2;
  }, [object]);

  const axisLen = Math.max(gridSize * 0.15, 0.5);

  const syncTransform = () => {
    const g = objectRef.current;
    if (!g) return;
    onTransformChange({
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

      {/* Fixed world origin with axis labels */}
      <LabeledAxes length={axisLen} />

      <group ref={objectRef}>
        <ModelView object={object} displayMode={displayMode} />
        {/* Axis names on the object / transform gizmo */}
        <AxisLabels length={axisLen * 0.85} />
      </group>

      {target && (
        <TransformControls
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

      <FitCamera object={object} />

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
