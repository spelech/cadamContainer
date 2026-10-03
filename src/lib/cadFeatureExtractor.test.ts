import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBounds,
  detectMatingPlanes,
  detectCylindricalHoles,
  extractCadFeatures,
} from './cadFeatureExtractor';

/**
 * Generates synthetic geometry for a box with a through-hole centered along Z.
 * Dimensions: width (X) x depth (Y) x height (Z)
 * Center of box is at (0, 0, height/2).
 */
function createBoxWithHole(
  width = 40,
  depth = 40,
  height = 10,
  holeDiameter = 5,
  segments = 32,
): { positions: Float32Array; normals: Float32Array } {
  const halfW = width / 2;
  const halfD = depth / 2;
  const radius = holeDiameter / 2;

  const positions: number[] = [];
  const normals: number[] = [];

  function addTriangle(
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    n0: [number, number, number],
    n1?: [number, number, number],
    n2?: [number, number, number],
  ) {
    positions.push(...p0, ...p1, ...p2);
    normals.push(...n0, ...(n1 || n0), ...(n2 || n0));
  }

  // 1. Four outer side faces
  // Front face (Y = -halfD, normal [0, -1, 0])
  addTriangle(
    [-halfW, -halfD, 0],
    [halfW, -halfD, 0],
    [halfW, -halfD, height],
    [0, -1, 0],
  );
  addTriangle(
    [-halfW, -halfD, 0],
    [halfW, -halfD, height],
    [-halfW, -halfD, height],
    [0, -1, 0],
  );

  // Back face (Y = halfD, normal [0, 1, 0])
  addTriangle(
    [halfW, halfD, 0],
    [-halfW, halfD, 0],
    [-halfW, halfD, height],
    [0, 1, 0],
  );
  addTriangle(
    [halfW, halfD, 0],
    [-halfW, halfD, height],
    [halfW, halfD, height],
    [0, 1, 0],
  );

  // Left face (X = -halfW, normal [-1, 0, 0])
  addTriangle(
    [-halfW, halfD, 0],
    [-halfW, -halfD, 0],
    [-halfW, -halfD, height],
    [-1, 0, 0],
  );
  addTriangle(
    [-halfW, halfD, 0],
    [-halfW, -halfD, height],
    [-halfW, halfD, height],
    [-1, 0, 0],
  );

  // Right face (X = halfW, normal [1, 0, 0])
  addTriangle(
    [halfW, -halfD, 0],
    [halfW, halfD, 0],
    [halfW, halfD, height],
    [1, 0, 0],
  );
  addTriangle(
    [halfW, -halfD, 0],
    [halfW, halfD, height],
    [halfW, -halfD, height],
    [1, 0, 0],
  );

  // Helper to project ray from (0,0) at angle theta to outer rectangle boundary
  function getOuterBoundaryPoint(theta: number): [number, number] {
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    if (Math.abs(cos) * halfD > Math.abs(sin) * halfW) {
      const signX = Math.sign(cos) || 1;
      return [signX * halfW, signX * halfW * Math.tan(theta)];
    } else {
      const signY = Math.sign(sin) || 1;
      return [(signY * halfD) / Math.tan(theta), signY * halfD];
    }
  }

  // 2. Annular top and bottom faces, and cylinder wall
  for (let i = 0; i < segments; i++) {
    const theta0 = (2 * Math.PI * i) / segments;
    const theta1 = (2 * Math.PI * (i + 1)) / segments;

    const [ox0, oy0] = getOuterBoundaryPoint(theta0);
    const [ox1, oy1] = getOuterBoundaryPoint(theta1);

    const ix0 = radius * Math.cos(theta0);
    const iy0 = radius * Math.sin(theta0);
    const ix1 = radius * Math.cos(theta1);
    const iy1 = radius * Math.sin(theta1);

    // Top face (Z = height, normal [0, 0, 1])
    addTriangle(
      [ox0, oy0, height],
      [ox1, oy1, height],
      [ix1, iy1, height],
      [0, 0, 1],
    );
    addTriangle(
      [ox0, oy0, height],
      [ix1, iy1, height],
      [ix0, iy0, height],
      [0, 0, 1],
    );

    // Bottom face (Z = 0, normal [0, 0, -1])
    addTriangle([ox0, oy0, 0], [ix1, iy1, 0], [ox1, oy1, 0], [0, 0, -1]);
    addTriangle([ox0, oy0, 0], [ix0, iy0, 0], [ix1, iy1, 0], [0, 0, -1]);

    // Cylinder hole wall (normals point inward towards Z axis)
    const n0: [number, number, number] = [
      -Math.cos(theta0),
      -Math.sin(theta0),
      0,
    ];
    const n1: [number, number, number] = [
      -Math.cos(theta1),
      -Math.sin(theta1),
      0,
    ];

    addTriangle([ix0, iy0, 0], [ix0, iy0, height], [ix1, iy1, 0], n0, n0, n1);
    addTriangle(
      [ix1, iy1, 0],
      [ix0, iy0, height],
      [ix1, iy1, height],
      n1,
      n0,
      n1,
    );
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
  };
}

describe('cadFeatureExtractor', () => {
  const { positions, normals } = createBoxWithHole(40, 40, 10, 5, 32);

  describe('computeBounds', () => {
    it('computes accurate bounding box for 40x40x10mm box', () => {
      const bounds = computeBounds(positions);

      assert.deepEqual(bounds.dimensions, [40, 40, 10]);
      assert.deepEqual(bounds.center, [0, 0, 5]);
      assert.deepEqual(bounds.min, [-20, -20, 0]);
      assert.deepEqual(bounds.max, [20, 20, 10]);
    });

    it('handles empty positions array gracefully', () => {
      const bounds = computeBounds(new Float32Array(0));
      assert.deepEqual(bounds.dimensions, [0, 0, 0]);
      assert.deepEqual(bounds.center, [0, 0, 0]);
    });
  });

  describe('detectMatingPlanes', () => {
    it('detects mating planes at Z = 0 and Z = 10 and side faces', () => {
      const planes = detectMatingPlanes(positions, normals);

      assert.ok(
        planes.length >= 2,
        `Expected at least 2 planes, got ${planes.length}`,
      );

      // Plane at Z = 0 with normal [0, 0, -1]
      const bottomPlane = planes.find(
        (p) =>
          Math.abs(p.normal[0]) < 0.05 &&
          Math.abs(p.normal[1]) < 0.05 &&
          Math.abs(p.normal[2] - -1) < 0.05,
      );
      assert.ok(
        bottomPlane,
        'Bottom plane with normal [0, 0, -1] should be detected',
      );
      assert.ok(
        Math.abs(bottomPlane.offset - 0) < 0.1,
        `Expected offset ~0 for Z=0 plane, got ${bottomPlane.offset}`,
      );

      // Plane at Z = 10 with normal [0, 0, 1]
      const topPlane = planes.find(
        (p) =>
          Math.abs(p.normal[0]) < 0.05 &&
          Math.abs(p.normal[1]) < 0.05 &&
          Math.abs(p.normal[2] - 1) < 0.05,
      );
      assert.ok(topPlane, 'Top plane with normal [0, 0, 1] should be detected');
      assert.ok(
        Math.abs(topPlane.offset - 10) < 0.1,
        `Expected offset ~10 for Z=10 plane, got ${topPlane.offset}`,
      );

      // Verify side faces detection
      const frontPlane = planes.find(
        (p) =>
          Math.abs(p.normal[0]) < 0.05 &&
          Math.abs(p.normal[1] - -1) < 0.05 &&
          Math.abs(p.normal[2]) < 0.05,
      );
      assert.ok(
        frontPlane,
        'Front plane with normal [0, -1, 0] should be detected',
      );

      const backPlane = planes.find(
        (p) =>
          Math.abs(p.normal[0]) < 0.05 &&
          Math.abs(p.normal[1] - 1) < 0.05 &&
          Math.abs(p.normal[2]) < 0.05,
      );
      assert.ok(
        backPlane,
        'Back plane with normal [0, 1, 0] should be detected',
      );

      const leftPlane = planes.find(
        (p) =>
          Math.abs(p.normal[0] - -1) < 0.05 &&
          Math.abs(p.normal[1]) < 0.05 &&
          Math.abs(p.normal[2]) < 0.05,
      );
      assert.ok(
        leftPlane,
        'Left plane with normal [-1, 0, 0] should be detected',
      );

      const rightPlane = planes.find(
        (p) =>
          Math.abs(p.normal[0] - 1) < 0.05 &&
          Math.abs(p.normal[1]) < 0.05 &&
          Math.abs(p.normal[2]) < 0.05,
      );
      assert.ok(
        rightPlane,
        'Right plane with normal [1, 0, 0] should be detected',
      );
    });
  });

  describe('detectCylindricalHoles', () => {
    it('detects through-hole at center [0, 0, 5] with diameter 5.0mm and axis [0, 0, 1]', () => {
      const holes = detectCylindricalHoles(positions, normals);

      assert.equal(holes.length, 1, `Expected 1 hole, got ${holes.length}`);
      const hole = holes[0];

      assert.ok(
        Math.abs(hole.diameter - 5.0) < 0.2,
        `Expected diameter ~5.0mm, got ${hole.diameter}`,
      );
      assert.ok(
        Math.abs(hole.radius - 2.5) < 0.1,
        `Expected radius ~2.5mm, got ${hole.radius}`,
      );

      // Verify axis along Z: [0, 0, 1]
      assert.ok(
        Math.abs(hole.axis[0]) < 0.05,
        `axis X should be ~0, got ${hole.axis[0]}`,
      );
      assert.ok(
        Math.abs(hole.axis[1]) < 0.05,
        `axis Y should be ~0, got ${hole.axis[1]}`,
      );
      assert.ok(
        Math.abs(Math.abs(hole.axis[2]) - 1.0) < 0.05,
        `axis Z should be ~1, got ${hole.axis[2]}`,
      );

      // Verify center [0, 0, 5]
      assert.ok(
        Math.abs(hole.center[0]) < 0.2,
        `center X should be ~0, got ${hole.center[0]}`,
      );
      assert.ok(
        Math.abs(hole.center[1]) < 0.2,
        `center Y should be ~0, got ${hole.center[1]}`,
      );
      assert.ok(
        Math.abs(hole.center[2] - 5) < 0.2,
        `center Z should be ~5, got ${hole.center[2]}`,
      );

      assert.equal(hole.isThroughHole, true);
      assert.ok(
        hole.depth && Math.abs(hole.depth - 10) < 0.2,
        `Expected depth ~10mm, got ${hole.depth}`,
      );
    });

    it('detects blind hole with isThroughHole: false for a single circular boundary loop', () => {
      // Create a conical cavity with a single circular rim of diameter 6 (radius 3) at Z = 0
      const segments = 16;
      const radius = 3;
      const pos: number[] = [];

      for (let i = 0; i < segments; i++) {
        const theta0 = (2 * Math.PI * i) / segments;
        const theta1 = (2 * Math.PI * (i + 1)) / segments;
        const x0 = radius * Math.cos(theta0);
        const y0 = radius * Math.sin(theta0);
        const x1 = radius * Math.cos(theta1);
        const y1 = radius * Math.sin(theta1);

        // Triangle from rim to cone apex at [0, 0, -5]
        pos.push(x0, y0, 0, x1, y1, 0, 0, 0, -5);
      }

      const blindHoles = detectCylindricalHoles(new Float32Array(pos));
      assert.equal(blindHoles.length, 1, 'Expected 1 blind hole');
      assert.equal(blindHoles[0].isThroughHole, false);
      assert.ok(
        Math.abs(blindHoles[0].diameter - 6.0) < 0.2,
        `Expected diameter ~6.0, got ${blindHoles[0].diameter}`,
      );
      assert.ok(
        Math.abs(blindHoles[0].center[0]) < 0.1 &&
          Math.abs(blindHoles[0].center[1]) < 0.1 &&
          Math.abs(blindHoles[0].center[2]) < 0.1,
        'Blind hole center should be at rim [0, 0, 0]',
      );
    });

    it('detects multi-hole arrays with multiple through-holes', () => {
      const segments = 16;
      const radius = 2.5; // diameter 5
      const height = 10;
      const pos: number[] = [];

      function addCylinder(cx: number, cy: number) {
        for (let i = 0; i < segments; i++) {
          const theta0 = (2 * Math.PI * i) / segments;
          const theta1 = (2 * Math.PI * (i + 1)) / segments;
          const x0 = cx + radius * Math.cos(theta0);
          const y0 = cy + radius * Math.sin(theta0);
          const x1 = cx + radius * Math.cos(theta1);
          const y1 = cy + radius * Math.sin(theta1);

          // Wall quad as 2 triangles
          pos.push(x0, y0, 0, x0, y0, height, x1, y1, 0);
          pos.push(x1, y1, 0, x0, y0, height, x1, y1, height);
        }
      }

      // Add two separated cylinders along X axis
      addCylinder(-15, 0);
      addCylinder(15, 0);

      const holes = detectCylindricalHoles(new Float32Array(pos));
      assert.equal(holes.length, 2, 'Expected 2 holes in array');
      assert.equal(holes[0].isThroughHole, true);
      assert.equal(holes[1].isThroughHole, true);

      const centers = holes.map((h) => h.center[0]).sort((a, b) => a - b);
      assert.ok(
        Math.abs(centers[0] - -15) < 0.2,
        `Expected hole 1 at X ~ -15, got ${centers[0]}`,
      );
      assert.ok(
        Math.abs(centers[1] - 15) < 0.2,
        `Expected hole 2 at X ~ 15, got ${centers[1]}`,
      );
    });

    it('handles degenerate collinear and zero-area triangles gracefully', () => {
      // 3 collinear points, 3 identical points, and another degenerate set
      const degeneratePositions = new Float32Array([
        0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 10, 10,
        10, 15, 15, 15,
      ]);

      const planes = detectMatingPlanes(degeneratePositions);
      assert.deepEqual(planes, []);

      const holes = detectCylindricalHoles(degeneratePositions);
      assert.deepEqual(holes, []);

      const bounds = computeBounds(degeneratePositions);
      assert.deepEqual(bounds.min, [0, 0, 0]);
      assert.deepEqual(bounds.max, [15, 15, 15]);
      assert.deepEqual(bounds.dimensions, [15, 15, 15]);
    });
  });

  describe('extractCadFeatures', () => {
    it('integrates bounds, planes, and holes into complete metadata', () => {
      const metadata = extractCadFeatures(
        positions,
        normals,
        'box_with_hole.step',
        1024,
        'step',
      );

      assert.equal(metadata.fileName, 'box_with_hole.step');
      assert.equal(metadata.fileSize, 1024);
      assert.equal(metadata.fileType, 'step');
      assert.deepEqual(metadata.bounds.dimensions, [40, 40, 10]);
      assert.equal(metadata.holes.length, 1);
      assert.ok(metadata.planes.length >= 2);
      assert.equal(metadata.triangleCount, positions.length / 9);
    });
  });
});
