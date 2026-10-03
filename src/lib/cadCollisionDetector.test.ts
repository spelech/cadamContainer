import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { detectInterference } from './cadCollisionDetector';

describe('cadCollisionDetector', () => {
  it('detects interference between overlapping box geometries', () => {
    // Reference box: 10x10x10 centered at origin [-5, 5]
    const refBox = new THREE.BoxGeometry(10, 10, 10);
    const refPositions = new Float32Array(
      refBox.attributes.position.array as Float32Array,
    );

    // OpenSCAD box: 10x10x10 shifted by [5, 0, 0] (overlaps with refBox in [0, 5])
    const scadBox = new THREE.BoxGeometry(10, 10, 10);
    scadBox.translate(5, 0, 0);

    const report = detectInterference(refPositions, scadBox);

    assert.equal(report.hasCollision, true);
    assert.ok(
      report.collidingTriangleCount > 0,
      `Expected collidingTriangleCount > 0, got ${report.collidingTriangleCount}`,
    );
    assert.ok(report.collidingPositions !== undefined);
    assert.equal(report.collidingPositions.length % 9, 0);

    assert.ok(report.collidingCenter !== undefined);
    assert.ok(
      Math.abs(report.collidingCenter[0] - 2.5) < 0.5,
      `Expected center X ~ 2.5, got ${report.collidingCenter[0]}`,
    );
    assert.ok(
      Math.abs(report.collidingCenter[1] - 0) < 0.5,
      `Expected center Y ~ 0, got ${report.collidingCenter[1]}`,
    );
    assert.ok(
      Math.abs(report.collidingCenter[2] - 0) < 0.5,
      `Expected center Z ~ 0, got ${report.collidingCenter[2]}`,
    );

    assert.ok(
      typeof report.approximatePenetrationVolume === 'number' &&
        report.approximatePenetrationVolume >= 400 &&
        report.approximatePenetrationVolume <= 600,
      `Expected approximatePenetrationVolume between 400 and 600, got ${report.approximatePenetrationVolume}`,
    );
  });

  it('returns no collision for non-overlapping box geometries', () => {
    // Reference box: 10x10x10 centered at origin
    const refBox = new THREE.BoxGeometry(10, 10, 10);
    const refPositions = new Float32Array(
      refBox.attributes.position.array as Float32Array,
    );

    // OpenSCAD box: 10x10x10 translated far away to [100, 0, 0]
    const scadBox = new THREE.BoxGeometry(10, 10, 10);
    scadBox.translate(100, 0, 0);

    const report = detectInterference(refPositions, scadBox);

    assert.equal(report.hasCollision, false);
    assert.equal(report.collidingTriangleCount, 0);
    assert.equal(report.collidingCenter, undefined);
  });

  it('handles empty or degenerate geometries gracefully without throwing', () => {
    const emptyRefPositions = new Float32Array([]);
    const emptyScadGeom = new THREE.BufferGeometry();

    const report1 = detectInterference(emptyRefPositions, emptyScadGeom);
    assert.equal(report1.hasCollision, false);
    assert.equal(report1.collidingTriangleCount, 0);

    const validBox = new THREE.BoxGeometry(10, 10, 10);
    const validPositions = new Float32Array(
      validBox.attributes.position.array as Float32Array,
    );
    const report2 = detectInterference(validPositions, emptyScadGeom);
    assert.equal(report2.hasCollision, false);
    assert.equal(report2.collidingTriangleCount, 0);
  });
});
