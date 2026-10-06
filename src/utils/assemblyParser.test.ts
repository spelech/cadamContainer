import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateExplodedOffset,
  inferAssemblyFromCodeAndMeshes,
  type AssemblyManifest,
} from './assemblyParser';

test('calculateExplodedOffset scales unit vector by fraction and distance', () => {
  const vector: [number, number, number] = [0, 0, 1];
  const offset = calculateExplodedOffset(vector, 0.5, 40);
  assert.deepEqual(offset, [0, 0, 20]);
});

test('calculateExplodedOffset normalizes non-unit vectors', () => {
  const vector: [number, number, number] = [0, 2, 0];
  const offset = calculateExplodedOffset(vector, 1.0, 50);
  assert.deepEqual(offset, [0, 50, 0]);
});

test('calculateExplodedOffset handles zero vector safely', () => {
  const vector: [number, number, number] = [0, 0, 0];
  const offset = calculateExplodedOffset(vector, 0.5, 40);
  assert.deepEqual(offset, [0, 0, 20]); // Fallback to [0,0,1]
});

test('inferAssemblyFromCodeAndMeshes uses explicit manifest when provided', () => {
  const code = `
    module part_base() { cube([50, 50, 10]); }
    module part_lid() { cube([50, 50, 5]); }
  `;
  const mockGroup = {
    children: [
      {
        material: { color: { getHexString: () => '4a5568' } },
        geometry: {
          attributes: {
            position: {
              array: new Float32Array([0, 0, 0, 50, 0, 0, 50, 50, 0]),
            },
          },
        },
      },
      {
        material: { color: { getHexString: () => '3182ce' } },
        geometry: {
          attributes: {
            position: {
              array: new Float32Array([0, 0, 20, 50, 0, 20, 50, 50, 20]),
            },
          },
        },
      },
    ],
  };
  const manifest: AssemblyManifest = {
    explodeDistanceMm: 40,
    parts: [
      {
        id: 'base',
        name: 'Base Box',
        moduleName: 'part_base',
        explodeVector: [0, 0, -1],
      },
      {
        id: 'lid',
        name: 'Snap Lid',
        moduleName: 'part_lid',
        explodeVector: [0, 0, 1],
      },
    ],
  };

  const runtimeParts = inferAssemblyFromCodeAndMeshes(
    code,
    mockGroup,
    manifest,
  );
  assert.equal(runtimeParts.length, 2);
  assert.equal(runtimeParts[0].name, 'Base Box');
  assert.deepEqual(runtimeParts[0].explodeVector, [0, 0, -1]);
  assert.equal(runtimeParts[1].name, 'Snap Lid');
  assert.deepEqual(runtimeParts[1].explodeVector, [0, 0, 1]);
});

test('inferAssemblyFromCodeAndMeshes extracts modules and infers vectors when manifest omitted', () => {
  const code = `
    module part_lower() { cube([10, 10, 10]); }
    module part_upper() { translate([0, 0, 30]) cube([10, 10, 10]); }
  `;
  const mockGroup = {
    children: [
      {
        material: { color: { getHexString: () => 'ff0000' } },
        geometry: {
          attributes: {
            position: {
              array: new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0]),
            },
          },
        },
      },
      {
        material: { color: { getHexString: () => '0000ff' } },
        geometry: {
          attributes: {
            position: {
              array: new Float32Array([0, 0, 30, 10, 0, 30, 10, 10, 30]),
            },
          },
        },
      },
    ],
  };

  const runtimeParts = inferAssemblyFromCodeAndMeshes(code, mockGroup);
  assert.equal(runtimeParts.length, 2);
  assert.equal(runtimeParts[0].id, 'part_lower');
  assert.equal(runtimeParts[1].id, 'part_upper');
  assert.equal(runtimeParts[0].visible, true);
  assert.equal(runtimeParts[0].isolated, false);
});

test('inferAssemblyFromCodeAndMeshes returns empty array when children empty', () => {
  const runtimeParts = inferAssemblyFromCodeAndMeshes('', { children: [] });
  assert.deepEqual(runtimeParts, []);
});
