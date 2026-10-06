import { Canvas } from '@react-three/fiber';
import {
  OrbitControls,
  Stage,
  Environment,
  OrthographicCamera,
  PerspectiveCamera,
} from '@react-three/drei';
import * as THREE from 'three';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { OrthographicPerspectiveToggle } from '@/components/viewer/OrthographicPerspectiveToggle';
import { ViewGizmo } from '@/components/viewer/ViewGizmo';
import { cn } from '@/lib/utils';
import {
  CadReferenceOverlay,
  CadReferenceHud,
} from '@/components/viewer/CadReferenceOverlay';
import {
  detectInterference,
  type CollisionReport,
} from '@/lib/cadCollisionDetector';
import { useOptionalCadReference } from '@/context/CadReferenceContext';
import {
  applyExplodeTransforms,
  resetExplodeTransforms,
} from '@/components/viewer/explodedTransforms';
import type { RuntimeAssemblyPart } from '@/utils/assemblyParser';
import { Layers, RotateCcw } from 'lucide-react';

interface ThreeSceneProps {
  geometry: THREE.BufferGeometry | null;
  color: string;
  isMobile?: boolean;
  backgroundColor?: string;
  coloredGroup?: THREE.Group | null;
  onFixInterference?: (report: CollisionReport) => void;
  assemblyParts?: RuntimeAssemblyPart[];
  explodeFraction?: number;
  explodeDistanceMm?: number;
  onExplodeFractionChange?: (fraction: number) => void;
}

export function ThreeScene({
  geometry,
  color,
  isMobile = false,
  backgroundColor = '#3B3B3B',
  coloredGroup,
  onFixInterference,
  assemblyParts,
  explodeFraction = 0,
  explodeDistanceMm = 40,
  onExplodeFractionChange,
}: ThreeSceneProps) {
  const [isOrthographic, setIsOrthographic] = useState(true);

  // Store the initial isMobile value to prevent position changes during resize
  const [initialIsMobile] = useState(isMobile);

  // CAD Reference Model state and lifted collision detection
  const cadRef = useOptionalCadReference();
  const referenceModel = cadRef?.referenceModel;
  const cadPositions = referenceModel?.positions;
  const cadShowCollisions = referenceModel?.showCollisions;

  // The colored group's meshes sit at their raw OpenSCAD coordinates.
  // Offset so the combined bounds are centered at origin, mirroring the
  // STL path's geom.center() behavior, unless a referenceModel is present.
  const groupCenterOffset = useMemo(() => {
    if (!coloredGroup) return null;
    if (referenceModel) return new THREE.Vector3(0, 0, 0);
    const box = new THREE.Box3().setFromObject(coloredGroup);
    if (box.isEmpty()) return new THREE.Vector3();
    return box.getCenter(new THREE.Vector3()).negate();
  }, [coloredGroup, referenceModel]);

  // Single source of truth for collision detection across 3D overlay and HUD
  const collisionReport = useMemo<CollisionReport>(() => {
    if (
      !cadShowCollisions ||
      !geometry ||
      !cadPositions ||
      cadPositions.length < 9
    ) {
      return { hasCollision: false, collidingTriangleCount: 0 };
    }
    return detectInterference(cadPositions, geometry);
  }, [cadPositions, cadShowCollisions, geometry]);

  // Real-time exploded view transforms (60 FPS pure vector math)
  useEffect(() => {
    if (coloredGroup && assemblyParts && assemblyParts.length > 0) {
      applyExplodeTransforms(
        coloredGroup,
        assemblyParts,
        explodeFraction,
        explodeDistanceMm,
      );
    } else if (coloredGroup) {
      resetExplodeTransforms(coloredGroup);
    }
  }, [coloredGroup, assemblyParts, explodeFraction, explodeDistanceMm]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Local Suspense boundary — `<Canvas>` re-throws suspension upward
          when any drei loader (e.g. <Environment> fetching city.hdr) is in
          flight. Without this boundary the suspension propagates all the
          way to <Await> inside TanStack's StartClient and tears down the
          entire app subtree. */}
      <Suspense
        fallback={<div className="h-full w-full" style={{ backgroundColor }} />}
      >
        <Canvas className="block h-full w-full">
          <color attach="background" args={[backgroundColor]} />
          {isOrthographic ? (
            <OrthographicCamera
              makeDefault
              position={initialIsMobile ? [-100, 150, 100] : [-100, 100, 100]}
              zoom={40}
              near={0.1}
              far={1000}
            />
          ) : (
            <PerspectiveCamera
              makeDefault
              position={initialIsMobile ? [-100, 150, 100] : [-100, 100, 100]}
              fov={45}
              near={0.1}
              far={1000}
              zoom={0.4}
            />
          )}
          <Stage environment={null} intensity={0.6} position={[0, 0, 0]}>
            <Environment files={`${import.meta.env.BASE_URL}/city.hdr`} />
            <ambientLight intensity={0.8} />
            <directionalLight position={[5, 5, 5]} intensity={1.2} castShadow />
            <directionalLight position={[-5, 5, 5]} intensity={0.2} />
            <directionalLight position={[-5, 5, -5]} intensity={0.2} />
            <directionalLight position={[0, 5, 0]} intensity={0.2} />
            <directionalLight position={[-5, -5, -5]} intensity={0.6} />
            {coloredGroup && groupCenterOffset ? (
              <group rotation={[-Math.PI / 2, 0, 0]}>
                <primitive
                  object={coloredGroup}
                  position={groupCenterOffset.toArray()}
                />
              </group>
            ) : geometry ? (
              <mesh
                geometry={geometry}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0, 0]}
              >
                <meshStandardMaterial
                  color={color}
                  metalness={0.6}
                  roughness={0.3}
                  envMapIntensity={0.3}
                />
              </mesh>
            ) : null}
            <CadReferenceOverlay
              openScadGeometry={geometry}
              collisionReport={collisionReport}
            />
          </Stage>
          {/* <Grid
          position={[0, 0, 0]}
          cellSize={30}
          cellThickness={0.5}
          sectionSize={10}
          sectionColor="gray"
          sectionThickness={0.5}
          fadeDistance={500}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid={true}
        /> */}
          <OrbitControls
            makeDefault
            enableDamping={true}
            dampingFactor={0.05}
          />
          {!initialIsMobile && <ViewGizmo />}
        </Canvas>
      </Suspense>

      <CadReferenceHud
        openScadGeometry={geometry}
        collisionReport={collisionReport}
        onFixInterference={onFixInterference}
      />

      {/* Exploded View HUD */}
      {coloredGroup && assemblyParts && assemblyParts.length > 1 && (
        <div
          data-testid="exploded-view-hud"
          className={cn(
            'pointer-events-auto absolute z-20 flex select-none items-center gap-2.5 rounded-xl border border-adam-neutral-700/80 bg-adam-neutral-900/90 px-3 py-2 shadow-2xl backdrop-blur-md transition-all duration-200',
            initialIsMobile
              ? 'bottom-2 left-2 max-w-[280px]'
              : 'bottom-2 left-3',
          )}
        >
          <div className="flex items-center gap-1.5 text-adam-blue">
            <Layers className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider text-adam-text-primary">
              Explode
            </span>
          </div>
          <span className="rounded bg-adam-blue/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-adam-blue">
            {assemblyParts.length} parts
          </span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(explodeFraction * 100)}
              onChange={(e) =>
                onExplodeFractionChange?.(Number(e.target.value) / 100)
              }
              className="h-1.5 w-24 cursor-pointer appearance-none rounded-lg bg-adam-neutral-700 accent-adam-blue transition-all sm:w-32"
              aria-label="Exploded View Slider"
            />
            <span className="w-8 text-right font-mono text-xs font-medium text-adam-text-secondary">
              {Math.round(explodeFraction * 100)}%
            </span>
          </div>
          {explodeFraction > 0 && onExplodeFractionChange && (
            <button
              type="button"
              onClick={() => onExplodeFractionChange(0)}
              title="Reset exploded view"
              className="flex items-center justify-center rounded-md p-1 text-adam-text-secondary transition-colors hover:bg-adam-neutral-800 hover:text-adam-text-primary"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      <div
        className={cn(
          'absolute flex flex-col items-center',
          initialIsMobile ? 'bottom-2 right-2' : 'bottom-2 right-9',
        )}
      >
        <div className="flex items-center gap-2">
          <OrthographicPerspectiveToggle
            isOrthographic={isOrthographic}
            onToggle={setIsOrthographic}
          />
        </div>
      </div>
    </div>
  );
}
