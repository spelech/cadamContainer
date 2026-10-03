import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatCadReferencePrompt } from './cadPromptBuilder';
import type { CadReferenceMetadata } from '../types/cadReference';

describe('cadPromptBuilder', () => {
  const sampleMetadata: CadReferenceMetadata = {
    fileName: 'motor_mount_base.step',
    fileSize: 1048576,
    fileType: 'step',
    bounds: {
      min: [-21, -21, 0],
      max: [21, 21, 34],
      dimensions: [42, 42, 34],
      center: [0, 0, 17],
    },
    holes: [
      {
        id: 'hole_1',
        diameter: 3.2,
        radius: 1.6,
        center: [-15.5, -15.5, 0],
        axis: [0, 0, 1],
        depth: 34,
        isThroughHole: true,
      },
      {
        id: 'hole_2',
        diameter: 3.2,
        radius: 1.6,
        center: [15.5, 15.5, 0],
        axis: [0, 0, 1],
        depth: 10,
        isThroughHole: false,
      },
    ],
    planes: [
      {
        id: 'plane_bottom',
        name: 'Bottom Base Plane',
        normal: [0, 0, -1],
        offset: 0,
        bounds: { min: [-21, -21], max: [21, 21] },
      },
      {
        id: 'plane_top',
        name: 'Top Flange Plane',
        normal: [0, 0, 1],
        offset: 34,
        bounds: { min: [-21, -21], max: [21, 21] },
      },
    ],
    triangleCount: 4200,
  };

  it('formats metadata with exact millimeter values and coordinate bounds', () => {
    const prompt = formatCadReferencePrompt(sampleMetadata);

    // Header check
    assert.match(
      prompt,
      /\[ATTACHED REFERENCE CAD MODEL: motor_mount_base\.step\]/,
    );

    // Exact dimensional bounds and center
    assert.match(prompt, /Width \(X\):\s*42\.00/);
    assert.match(prompt, /Depth \(Y\):\s*42\.00/);
    assert.match(prompt, /Height \(Z\):\s*34\.00/);

    // Bounding Box Range
    assert.match(prompt, /X:\s*\[-21\.00\s*\.\.\s*21\.00\]/);
    assert.match(prompt, /Y:\s*\[-21\.00\s*\.\.\s*21\.00\]/);
    assert.match(prompt, /Z:\s*\[0\.00\s*\.\.\s*34\.00\]/);

    // Center point
    assert.match(prompt, /\[0\.00,\s*0\.00,\s*17\.00\]/);
  });

  it('lists detected holes and mating planes with clear engineering names', () => {
    const prompt = formatCadReferencePrompt(sampleMetadata);

    // Mounting holes
    assert.match(prompt, /hole_1/);
    assert.match(prompt, /3\.20mm/);
    assert.match(prompt, /Through-hole/i);
    assert.match(prompt, /Center:\s*\[-15\.50,\s*-15\.50,\s*0\.00\]/);
    assert.match(prompt, /Axis:\s*\[0\.00,\s*0\.00,\s*1\.00\]/);

    assert.match(prompt, /hole_2/);
    assert.match(prompt, /Depth:\s*10\.00mm/i);

    // Mating planes
    assert.match(prompt, /Bottom Base Plane/);
    assert.match(prompt, /Top Flange Plane/);
    assert.match(prompt, /Normal:\s*\[0\.00,\s*0\.00,\s*-1\.00\]/);
    assert.match(prompt, /Normal:\s*\[0\.00,\s*0\.00,\s*1\.00\]/);
  });

  it('explicitly requests parametric variable constraints (clearance, dimensions)', () => {
    const prompt = formatCadReferencePrompt(sampleMetadata);

    // VibeCAD rules
    assert.match(prompt, /clearance\s*=\s*0\.3/);
    assert.match(prompt, /ref_w\s*=\s*42\.00/);
    assert.match(prompt, /ref_d\s*=\s*42\.00/);
    assert.match(prompt, /ref_h\s*=\s*34\.00/);
    assert.match(prompt, /magic numbers/i);
  });

  it('allows overriding clearanceMm in prompt options', () => {
    const prompt = formatCadReferencePrompt(sampleMetadata, {
      includeInAssembly: false,
      clearanceMm: 0.5,
    });

    assert.match(prompt, /clearance\s*=\s*0\.5/);
  });

  it('includes %import instruction when includeInAssembly is true', () => {
    const prompt = formatCadReferencePrompt(sampleMetadata, {
      includeInAssembly: true,
    });

    // Should convert .step to .stl for OpenSCAD assembly import
    assert.match(prompt, /%import\("motor_mount_base\.stl"\)/);
    assert.match(prompt, /background/i);
  });

  it('omits %import instruction when includeInAssembly is false or omitted', () => {
    const promptWithoutOpts = formatCadReferencePrompt(sampleMetadata);
    assert.doesNotMatch(promptWithoutOpts, /%import/);

    const promptWithFalse = formatCadReferencePrompt(sampleMetadata, {
      includeInAssembly: false,
    });
    assert.doesNotMatch(promptWithFalse, /%import/);
  });

  it('handles models with no detected holes or mating planes gracefully', () => {
    const emptyFeaturesMetadata: CadReferenceMetadata = {
      fileName: 'plain_block.stl',
      fileSize: 500,
      fileType: 'stl',
      bounds: {
        min: [0, 0, 0],
        max: [10, 10, 10],
        dimensions: [10, 10, 10],
        center: [5, 5, 5],
      },
      holes: [],
      planes: [],
      triangleCount: 12,
    };

    const prompt = formatCadReferencePrompt(emptyFeaturesMetadata, {
      includeInAssembly: true,
    });

    assert.match(prompt, /\[ATTACHED REFERENCE CAD MODEL: plain_block\.stl\]/);
    assert.match(prompt, /None detected/i);
    assert.match(prompt, /%import\("plain_block\.stl"\)/);
  });

  it('sanitizes double quotes and backslashes in assembly %import filename', () => {
    const maliciousMetadata: CadReferenceMetadata = {
      fileName: 'bracket"bad\\name.step',
      fileSize: 100,
      fileType: 'step',
      bounds: {
        min: [0, 0, 0],
        max: [10, 10, 10],
        dimensions: [10, 10, 10],
        center: [5, 5, 5],
      },
      holes: [],
      planes: [],
      triangleCount: 12,
    };

    const prompt = formatCadReferencePrompt(maliciousMetadata, {
      includeInAssembly: true,
    });

    assert.match(prompt, /%import\("bracketbadname\.stl"\)/);
    assert.doesNotMatch(prompt, /["\\]bad/);
  });
});
