import test from 'node:test';
import assert from 'node:assert/strict';
import { composeParametricSystemPrompt } from './index';

test('composeParametricSystemPrompt includes core engineering and CSG overlap rules', () => {
  const prompt = composeParametricSystemPrompt();
  assert.match(prompt, /eps\s*=\s*0\.01/);
  assert.match(prompt, /Zero-thickness|Manifold/i);
  assert.match(prompt, /build_parametric_model/);
});

test('composeParametricSystemPrompt includes 3D printing tolerances', () => {
  const prompt = composeParametricSystemPrompt();
  assert.match(prompt, /0\.3/); // Sliding fit tolerance
  assert.match(prompt, /0\.15/); // Press fit tolerance
  assert.match(prompt, /wall_thickness/i);
});

test('composeParametricSystemPrompt includes assembly module architecture and manifest instructions', () => {
  const prompt = composeParametricSystemPrompt({ enableAssembly: true });
  assert.match(prompt, /module part_/);
  assert.match(prompt, /assembly/);
  assert.match(prompt, /explode/i);
});

test('composeParametricSystemPrompt includes BOSL2 guidance and diverse examples', () => {
  const prompt = composeParametricSystemPrompt();
  assert.match(prompt, /BOSL2/);
  assert.match(prompt, /screws\.scad/);
  assert.match(prompt, /part_base/);
});
