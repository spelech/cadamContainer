import type { Group, Object3D } from 'three';
import {
  calculateExplodedOffset,
  type RuntimeAssemblyPart,
} from '@/utils/assemblyParser';

export interface ExplodableChildLike {
  position?: {
    x?: number;
    y?: number;
    z?: number;
    set?: (x: number, y: number, z: number) => void;
  };
  visible?: boolean;
  [key: string]: unknown;
}

export interface ExplodableGroupLike {
  children?: ExplodableChildLike[] | Object3D[];
  [key: string]: unknown;
}

/**
 * Smoothly translates each child mesh in `group` along `part.explodeVector * (fraction * distanceMm)`
 * and updates `mesh.visible = part.visible` in place.
 *
 * Performs pure vector math without reallocating geometry or causing memory leaks,
 * maintaining 60 FPS performance during slider interactions.
 */
export function applyExplodeTransforms(
  group: Group | ExplodableGroupLike | null | undefined,
  parts: RuntimeAssemblyPart[],
  fraction: number,
  distanceMm: number = 40,
): void {
  if (!group || !group.children || !Array.isArray(group.children)) return;

  for (const part of parts) {
    const mesh = group.children[part.meshIndex] as
      | ExplodableChildLike
      | undefined;
    if (!mesh) continue;

    if (mesh.position && typeof mesh.position.set === 'function') {
      if (fraction <= 0.0001) {
        mesh.position.set(0, 0, 0);
      } else {
        const [ox, oy, oz] = calculateExplodedOffset(
          part.explodeVector,
          fraction,
          distanceMm,
        );
        mesh.position.set(ox, oy, oz);
      }
    }

    if (typeof part.visible === 'boolean') {
      mesh.visible = part.visible;
    }
  }
}

/**
 * Resets all child meshes in `group` back to their unexploded base position (0, 0, 0)
 * and sets visibility to true.
 */
export function resetExplodeTransforms(
  group: Group | ExplodableGroupLike | null | undefined,
): void {
  if (!group || !group.children || !Array.isArray(group.children)) return;

  for (const child of group.children as ExplodableChildLike[]) {
    if (child?.position && typeof child.position.set === 'function') {
      child.position.set(0, 0, 0);
    }
    if (child) {
      child.visible = true;
    }
  }
}
