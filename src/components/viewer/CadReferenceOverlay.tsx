import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useOptionalCadReference } from '@/context/CadReferenceContext';
import {
  detectInterference,
  CollisionReport,
} from '@/lib/cadCollisionDetector';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import {
  EyeOff,
  Ghost,
  Layers,
  Sparkles,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { CadViewerDisplayMode } from '@/types/cadReference';

interface CadReferenceOverlayProps {
  openScadGeometry?: THREE.BufferGeometry | null;
  collisionReport?: CollisionReport;
}

/**
 * Three.js 3D viewport overlay rendering the active CAD reference model.
 * Supports Ghost (semi-transparent PBR), Wireframe, and Hidden modes,
 * along with real-time collision detection highlighting colliding facets in emissive red.
 */
export function CadReferenceOverlay({
  openScadGeometry,
  collisionReport: propCollisionReport,
}: CadReferenceOverlayProps) {
  const cadRef = useOptionalCadReference();
  const referenceModel = cadRef?.referenceModel;
  const positions = referenceModel?.positions;
  const normals = referenceModel?.normals;
  const showCollisions = referenceModel?.showCollisions;

  // Memoize BufferGeometry for the reference model
  const geometry = useMemo(() => {
    if (!positions || positions.length < 9) {
      return null;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    if (normals && normals.length === positions.length) {
      geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    } else {
      geom.computeVertexNormals();
    }

    return geom;
  }, [positions, normals]);

  // Clean up geometry buffers when unmounting or changing reference model
  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  // Run BVH-based interference detection against OpenSCAD geometry if not provided by parent
  const internalCollisionReport = useMemo<CollisionReport>(() => {
    if (
      !showCollisions ||
      !openScadGeometry ||
      !positions ||
      positions.length < 9
    ) {
      return { hasCollision: false, collidingTriangleCount: 0 };
    }

    return detectInterference(positions, openScadGeometry);
  }, [positions, showCollisions, openScadGeometry]);

  const collisionReport = propCollisionReport ?? internalCollisionReport;

  // Memoize BufferGeometry for colliding triangles to highlight them in red
  const collidingGeometry = useMemo(() => {
    if (
      !collisionReport.collidingPositions ||
      collisionReport.collidingPositions.length < 9
    ) {
      return null;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      'position',
      new THREE.BufferAttribute(collisionReport.collidingPositions, 3),
    );
    geom.computeVertexNormals();
    return geom;
  }, [collisionReport.collidingPositions]);

  // Clean up colliding geometry buffers
  useEffect(() => {
    return () => {
      collidingGeometry?.dispose();
    };
  }, [collidingGeometry]);

  if (!referenceModel || !geometry) {
    return null;
  }

  const { displayMode, opacity } = referenceModel;

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} name="cad-reference-overlay-group">
      {/* Ghost Solid PBR Material */}
      {displayMode === 'ghost' && (
        <mesh geometry={geometry}>
          <meshStandardMaterial
            color="#4f46e5"
            metalness={0.2}
            roughness={0.3}
            transparent={true}
            opacity={opacity}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Edge Wireframe Material */}
      {displayMode === 'wireframe' && (
        <mesh geometry={geometry}>
          <meshBasicMaterial
            wireframe={true}
            color="#818cf8"
            transparent={true}
            opacity={Math.max(opacity, 0.4)}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Collision highlight: emissive red facets */}
      {showCollisions && collidingGeometry && (
        <mesh geometry={collidingGeometry}>
          <meshStandardMaterial
            color="#ef4444"
            emissive="#ef4444"
            emissiveIntensity={0.9}
            metalness={0.1}
            roughness={0.2}
            transparent={true}
            opacity={0.9}
            depthWrite={false}
            polygonOffset={true}
            polygonOffsetFactor={-1}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}

// Alias for explicit naming
export { CadReferenceOverlay as CadReferenceMesh };

interface CadReferenceHudProps {
  openScadGeometry?: THREE.BufferGeometry | null;
  collisionReport?: CollisionReport;
  onFixInterference?: (report: CollisionReport) => void;
  className?: string;
}

/**
 * Floating Viewport HUD widget providing controls for:
 * - Opacity slider (0% to 100%)
 * - Display mode toggle: Ghost / Wireframe / Hidden
 * - Collision status pill with "Ask AI to fix interference" action
 */
export function CadReferenceHud({
  openScadGeometry,
  collisionReport: propCollisionReport,
  onFixInterference,
  className,
}: CadReferenceHudProps) {
  const cadRef = useOptionalCadReference();
  const { toast } = useToast();

  const referenceModel = cadRef?.referenceModel;
  const setOpacity = cadRef?.setOpacity;
  const setDisplayMode = cadRef?.setDisplayMode;
  const positions = referenceModel?.positions;
  const showCollisions = referenceModel?.showCollisions;

  const internalCollisionReport = useMemo<CollisionReport>(() => {
    if (
      !showCollisions ||
      !openScadGeometry ||
      !positions ||
      positions.length < 9
    ) {
      return { hasCollision: false, collidingTriangleCount: 0 };
    }

    return detectInterference(positions, openScadGeometry);
  }, [positions, showCollisions, openScadGeometry]);

  const collisionReport = propCollisionReport ?? internalCollisionReport;

  if (!referenceModel) {
    return null;
  }

  const { metadata, opacity, displayMode } = referenceModel;
  const opacityPercent = Math.round(opacity * 100);

  const handleFixInterference = () => {
    if (onFixInterference) {
      onFixInterference(collisionReport);
    }

    // Build assistive prompt description
    const centerStr = collisionReport.collidingCenter
      ? ` around [${collisionReport.collidingCenter.map((n) => n.toFixed(1)).join(', ')}]`
      : '';
    const promptText = `Please fix geometric interference with the CAD reference model (${metadata.fileName}). There are ${collisionReport.collidingTriangleCount} colliding facets${centerStr}. Adjust part dimensions or add clearance cuts to eliminate collision.`;

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('cad-fix-interference', {
          detail: {
            report: collisionReport,
            referenceModel,
            prompt: promptText,
          },
        }),
      );

      if (navigator.clipboard) {
        navigator.clipboard.writeText(promptText).catch(() => {});
      }
    }

    toast({
      title: 'Interference fix prompt prepared',
      description: `Copied details for ${collisionReport.collidingTriangleCount} colliding facets to clipboard.`,
    });
  };

  const modeButtons: {
    mode: CadViewerDisplayMode;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { mode: 'ghost', label: 'Ghost', icon: Ghost },
    { mode: 'wireframe', label: 'Wireframe', icon: Layers },
    { mode: 'hidden', label: 'Hidden', icon: EyeOff },
  ];

  return (
    <div
      data-testid="cad-reference-hud"
      className={cn(
        'pointer-events-auto absolute left-3 top-3 z-20 flex w-64 select-none flex-col gap-2 rounded-xl border border-adam-neutral-700/80 bg-adam-neutral-900/90 p-3 shadow-2xl backdrop-blur-md transition-all duration-200',
        className,
      )}
    >
      {/* Header with File info */}
      <div className="flex items-center justify-between gap-2 border-b border-adam-neutral-800 pb-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="rounded bg-adam-blue/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-adam-blue">
            {metadata.fileType.toUpperCase()}
          </span>
          <span
            className="truncate text-xs font-medium text-adam-text-primary"
            title={metadata.fileName}
          >
            {metadata.fileName}
          </span>
        </div>
      </div>

      {/* Display Mode Toggle */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-adam-text-secondary">
          Display Mode
        </span>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-adam-neutral-800/80 p-0.5">
          {modeButtons.map(({ mode, label, icon: Icon }) => {
            const isActive = displayMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setDisplayMode?.(mode)}
                className={cn(
                  'flex items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-all',
                  isActive
                    ? 'bg-adam-blue text-white shadow-sm'
                    : 'text-adam-text-secondary hover:bg-adam-neutral-700/60 hover:text-adam-text-primary',
                )}
              >
                <Icon className="h-3 w-3" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Opacity Slider (enabled in Ghost / Wireframe modes) */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-adam-text-secondary">Opacity</span>
          <span className="font-mono text-adam-text-primary">
            {opacityPercent}%
          </span>
        </div>
        <Slider
          min={0}
          max={100}
          step={5}
          value={[opacityPercent]}
          onValueChange={([val]) => setOpacity?.(val / 100)}
          disabled={displayMode === 'hidden'}
          className="py-1"
        />
      </div>

      {/* Collision Detection Status Pill */}
      {openScadGeometry && (
        <div className="mt-1 flex flex-col gap-2 border-t border-adam-neutral-800 pt-2">
          {collisionReport.hasCollision &&
          collisionReport.collidingTriangleCount > 0 ? (
            <div className="flex flex-col gap-1.5 rounded-lg border border-red-500/30 bg-red-950/40 p-2">
              <div className="flex items-center gap-1.5 text-red-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span className="text-[11px] font-semibold">
                  Interference: {collisionReport.collidingTriangleCount} facets
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFixInterference}
                className="h-6 w-full border-red-500/40 bg-red-900/30 text-[10px] text-red-200 hover:bg-red-800/40 hover:text-white"
              >
                <Sparkles className="mr-1 h-3 w-3" />
                Ask AI to fix interference
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-2 py-1.5 text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span className="text-[11px] font-medium">
                Clear (0 collisions)
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CadReferenceOverlay;
