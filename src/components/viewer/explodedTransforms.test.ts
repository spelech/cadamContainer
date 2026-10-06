import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyExplodeTransforms,
  resetExplodeTransforms,
  type ExplodableChildLike,
  type ExplodableGroupLike,
} from './explodedTransforms';
import type { RuntimeAssemblyPart } from '@/utils/assemblyParser';

function createMockMesh(): ExplodableChildLike {
  return {
    position: {
      x: 0,
      y: 0,
      z: 0,
      set: function (x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
      },
    },
    visible: true,
  };
}

test('applyExplodeTransforms translates each mesh according to part vector and fraction', () => {
  const mesh1 = createMockMesh();
  const mesh2 = createMockMesh();
  const mockGroup: ExplodableGroupLike = { children: [mesh1, mesh2] };

  const parts: RuntimeAssemblyPart[] = [
    {
      id: 'b',
      name: 'Base',
      explodeVector: [0, 0, -1],
      meshIndex: 0,
      colorHex: '#444',
      triangleCount: 10,
      center: [0, 0, 0],
      visible: true,
      isolated: false,
    },
    {
      id: 'l',
      name: 'Lid',
      explodeVector: [0, 0, 1],
      meshIndex: 1,
      colorHex: '#888',
      triangleCount: 10,
      center: [0, 0, 10],
      visible: true,
      isolated: false,
    },
  ];

  applyExplodeTransforms(mockGroup, parts, 0.5, 40);
  assert.equal(mesh1.position?.z, -20);
  assert.equal(mesh2.position?.z, 20);

  resetExplodeTransforms(mockGroup);
  assert.equal(mesh1.position?.z, 0);
  assert.equal(mesh2.position?.z, 0);
});

test('applyExplodeTransforms updates mesh visibility based on part.visible', () => {
  const mesh1 = createMockMesh();
  const mesh2 = createMockMesh();
  const mockGroup: ExplodableGroupLike = { children: [mesh1, mesh2] };

  const parts: RuntimeAssemblyPart[] = [
    {
      id: 'b',
      name: 'Base',
      explodeVector: [0, 0, -1],
      meshIndex: 0,
      colorHex: '#444',
      triangleCount: 10,
      center: [0, 0, 0],
      visible: false,
      isolated: false,
    },
    {
      id: 'l',
      name: 'Lid',
      explodeVector: [0, 0, 1],
      meshIndex: 1,
      colorHex: '#888',
      triangleCount: 10,
      center: [0, 0, 10],
      visible: true,
      isolated: false,
    },
  ];

  applyExplodeTransforms(mockGroup, parts, 0.25, 40);
  assert.equal(mesh1.visible, false);
  assert.equal(mesh2.visible, true);

  resetExplodeTransforms(mockGroup);
  assert.equal(mesh1.visible, true);
  assert.equal(mesh2.visible, true);
});

test('applyExplodeTransforms handles fraction <= 0.0001 by resetting position to (0, 0, 0)', () => {
  const mesh1 = createMockMesh();
  mesh1.position?.set?.(10, 20, 30);
  const mockGroup: ExplodableGroupLike = { children: [mesh1] };

  const parts: RuntimeAssemblyPart[] = [
    {
      id: 'b',
      name: 'Base',
      explodeVector: [0, 1, 0],
      meshIndex: 0,
      colorHex: '#444',
      triangleCount: 10,
      center: [0, 0, 0],
      visible: true,
      isolated: false,
    },
  ];

  applyExplodeTransforms(mockGroup, parts, 0, 40);
  assert.equal(mesh1.position?.x, 0);
  assert.equal(mesh1.position?.y, 0);
  assert.equal(mesh1.position?.z, 0);
});

test('applyExplodeTransforms uses default distance of 40mm when distanceMm is omitted', () => {
  const mesh1 = createMockMesh();
  const mockGroup: ExplodableGroupLike = { children: [mesh1] };

  const parts: RuntimeAssemblyPart[] = [
    {
      id: 'b',
      name: 'Base',
      explodeVector: [0, 0, 1],
      meshIndex: 0,
      colorHex: '#444',
      triangleCount: 10,
      center: [0, 0, 0],
      visible: true,
      isolated: false,
    },
  ];

  applyExplodeTransforms(mockGroup, parts, 1.0);
  assert.equal(mesh1.position?.z, 40);
});

test('applyExplodeTransforms and resetExplodeTransforms handle null/empty group safely', () => {
  const parts: RuntimeAssemblyPart[] = [];
  assert.doesNotThrow(() => applyExplodeTransforms(null, parts, 0.5));
  assert.doesNotThrow(() => applyExplodeTransforms({}, parts, 0.5));
  assert.doesNotThrow(() => resetExplodeTransforms(null));
  assert.doesNotThrow(() => resetExplodeTransforms({}));
});
