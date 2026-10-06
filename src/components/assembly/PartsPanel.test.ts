import test from 'node:test';
import assert from 'node:assert/strict';
import type { RuntimeAssemblyPart } from '@/utils/assemblyParser';
import {
  togglePartIsolation,
  togglePartVisibility,
  isolateScadPart,
} from './assemblyUtils';

test('part isolation logic toggles other parts off and restores on click again', () => {
  const parts: RuntimeAssemblyPart[] = [
    {
      id: 'p1',
      name: 'Part 1',
      explodeVector: [0, 0, 1],
      meshIndex: 0,
      colorHex: '#111',
      triangleCount: 100,
      center: [0, 0, 0],
      visible: true,
      isolated: false,
    },
    {
      id: 'p2',
      name: 'Part 2',
      explodeVector: [0, 0, -1],
      meshIndex: 1,
      colorHex: '#222',
      triangleCount: 200,
      center: [0, 0, 0],
      visible: true,
      isolated: false,
    },
  ];

  const isolatedState = togglePartIsolation('p1', parts);
  assert.equal(isolatedState[0].visible, true);
  assert.equal(isolatedState[0].isolated, true);
  assert.equal(isolatedState[1].visible, false);
  assert.equal(isolatedState[1].isolated, false);

  const restoredState = togglePartIsolation('p1', isolatedState);
  assert.equal(restoredState[0].visible, true);
  assert.equal(restoredState[0].isolated, false);
  assert.equal(restoredState[1].visible, true);
  assert.equal(restoredState[1].isolated, false);
});

test('part isolation switching to another part isolates that part instead', () => {
  const parts: RuntimeAssemblyPart[] = [
    {
      id: 'p1',
      name: 'Part 1',
      explodeVector: [0, 0, 1],
      meshIndex: 0,
      colorHex: '#111',
      triangleCount: 100,
      center: [0, 0, 0],
      visible: true,
      isolated: false,
    },
    {
      id: 'p2',
      name: 'Part 2',
      explodeVector: [0, 0, -1],
      meshIndex: 1,
      colorHex: '#222',
      triangleCount: 200,
      center: [0, 0, 0],
      visible: true,
      isolated: false,
    },
  ];

  const isolatedState = togglePartIsolation('p1', parts);
  const switchedState = togglePartIsolation('p2', isolatedState);
  assert.equal(switchedState[0].visible, false);
  assert.equal(switchedState[0].isolated, false);
  assert.equal(switchedState[1].visible, true);
  assert.equal(switchedState[1].isolated, true);
});

test('part visibility toggle flips visible state and clears isolated when hidden', () => {
  const parts: RuntimeAssemblyPart[] = [
    {
      id: 'p1',
      name: 'Part 1',
      explodeVector: [0, 0, 1],
      meshIndex: 0,
      colorHex: '#111',
      triangleCount: 100,
      center: [0, 0, 0],
      visible: true,
      isolated: true,
    },
  ];

  const hidden = togglePartVisibility('p1', parts);
  assert.equal(hidden[0].visible, false);
  assert.equal(hidden[0].isolated, false);

  const visibleAgain = togglePartVisibility('p1', hidden);
  assert.equal(visibleAgain[0].visible, true);
  assert.equal(visibleAgain[0].isolated, false);
});

test('isolateScadPart updates show_part variable when present in SCAD code', () => {
  const code = `
explode = 0;
show_part = "all"; // [all, base, lid]
if (show_part == "all" || show_part == "base") part_base();
if (show_part == "all" || show_part == "lid") part_lid();

module part_base() { cube(10); }
module part_lid() { cube(10); }
`;

  const part: RuntimeAssemblyPart = {
    id: 'base',
    name: 'Base Case',
    moduleName: 'part_base',
    explodeVector: [0, 0, -1],
    meshIndex: 0,
    colorHex: '#333333',
    triangleCount: 12,
    center: [0, 0, 0],
    visible: true,
    isolated: false,
  };

  const isolatedCode = isolateScadPart(code, part);
  assert.match(isolatedCode, /show_part\s*=\s*"base";/);
  assert.doesNotMatch(isolatedCode, /show_part\s*=\s*"all";/);
});

test('isolateScadPart appends root modifier ! when show_part is absent', () => {
  const code = `
part_base();
part_lid();

module part_base() { cube(10); }
module part_lid() { cube(10); }
`;

  const part: RuntimeAssemblyPart = {
    id: 'part_lid',
    name: 'Lid',
    moduleName: 'part_lid',
    explodeVector: [0, 0, 1],
    meshIndex: 1,
    colorHex: '#888888',
    triangleCount: 12,
    center: [0, 0, 10],
    visible: true,
    isolated: false,
  };

  const isolatedCode = isolateScadPart(code, part);
  assert.match(isolatedCode, /!part_lid\(\);/);
});
