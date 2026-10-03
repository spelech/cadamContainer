import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export interface CollisionReport {
  hasCollision: boolean;
  collidingTriangleCount: number;
  collidingCenter?: [number, number, number];
  approximatePenetrationVolume?: number;
  collidingPositions?: Float32Array;
}

// Cache reference model BVHs by their Float32Array positions buffer
const refBvhCache = new WeakMap<Float32Array, MeshBVH>();

/**
 * Detects 3D geometric interference between CAD reference model vertex positions
 * and compiled OpenSCAD mesh geometry using bounding volume hierarchies (BVH).
 */
export function detectInterference(
  referencePositions: Float32Array,
  openScadGeometry: THREE.BufferGeometry,
): CollisionReport {
  if (!referencePositions || referencePositions.length < 9) {
    return {
      hasCollision: false,
      collidingTriangleCount: 0,
    };
  }

  if (
    !openScadGeometry ||
    !openScadGeometry.attributes ||
    !openScadGeometry.attributes.position ||
    openScadGeometry.attributes.position.count < 3
  ) {
    return {
      hasCollision: false,
      collidingTriangleCount: 0,
    };
  }

  try {
    let refBvh = refBvhCache.get(referencePositions);
    if (!refBvh) {
      const refGeom = new THREE.BufferGeometry();
      refGeom.setAttribute(
        'position',
        new THREE.BufferAttribute(referencePositions, 3),
      );
      refBvh = new MeshBVH(refGeom);
      refBvhCache.set(referencePositions, refBvh);
    }

    // Reuse cached boundsTree on OpenSCAD geometry if available
    let scadBvh = (openScadGeometry as { boundsTree?: MeshBVH }).boundsTree;
    if (!(scadBvh instanceof MeshBVH)) {
      scadBvh = new MeshBVH(openScadGeometry);
      (openScadGeometry as { boundsTree?: MeshBVH }).boundsTree = scadBvh;
    }

    const identity = new THREE.Matrix4();
    const collidingIndices = new Set<number>();
    const collidingVertices: number[] = [];
    const box = new THREE.Box3();

    refBvh.bvhcast(scadBvh, identity, {
      intersectsTriangles(tri1, tri2, i1) {
        if (tri1.intersectsTriangle(tri2)) {
          if (!collidingIndices.has(i1)) {
            collidingIndices.add(i1);
            box.expandByPoint(tri1.a);
            box.expandByPoint(tri1.b);
            box.expandByPoint(tri1.c);
            collidingVertices.push(
              tri1.a.x,
              tri1.a.y,
              tri1.a.z,
              tri1.b.x,
              tri1.b.y,
              tri1.b.z,
              tri1.c.x,
              tri1.c.y,
              tri1.c.z,
            );
          }
        }
        return false;
      },
    });

    if (collidingIndices.size === 0) {
      return {
        hasCollision: false,
        collidingTriangleCount: 0,
      };
    }

    if (!openScadGeometry.boundingBox) {
      openScadGeometry.computeBoundingBox();
    }
    if (openScadGeometry.boundingBox) {
      box.intersect(openScadGeometry.boundingBox);
    }

    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const volume = size.x * size.y * size.z;

    return {
      hasCollision: true,
      collidingTriangleCount: collidingIndices.size,
      collidingCenter: [center.x, center.y, center.z],
      approximatePenetrationVolume: volume,
      collidingPositions: new Float32Array(collidingVertices),
    };
  } catch (err) {
    console.error('[cadCollisionDetector] Error detecting interference:', err);
    return {
      hasCollision: false,
      collidingTriangleCount: 0,
    };
  }
}
