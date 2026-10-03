import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getAssemblyStlFileName,
  extractImportFilenames,
} from '@/lib/cadPromptBuilder';

// Testable in-memory representation of MeshFiles store logic matching MeshFilesContext
class TestMeshFilesStore {
  private files = new Map<string, Blob>();

  setMeshFile(filename: string, content: Blob): void {
    this.files.set(filename, content);
  }

  getMeshFile(filename: string): Blob | undefined {
    if (this.files.has(filename)) {
      return this.files.get(filename);
    }
    const basename = filename.replace(/^.*[\\/]/, '');
    if (this.files.has(basename)) {
      return this.files.get(basename);
    }
    const lowerFilename = filename.toLowerCase();
    const lowerBasename = basename.toLowerCase();
    for (const [key, val] of this.files.entries()) {
      if (
        key.toLowerCase() === lowerFilename ||
        key.toLowerCase() === lowerBasename
      ) {
        return val;
      }
    }
    return undefined;
  }

  hasMeshFile(filename: string): boolean {
    if (this.files.has(filename)) return true;
    const basename = filename.replace(/^.*[\\/]/, '');
    if (this.files.has(basename)) return true;
    const lowerFilename = filename.toLowerCase();
    const lowerBasename = basename.toLowerCase();
    for (const key of this.files.keys()) {
      if (
        key.toLowerCase() === lowerFilename ||
        key.toLowerCase() === lowerBasename
      ) {
        return true;
      }
    }
    return false;
  }

  removeMeshFile(filename: string): void {
    this.files.delete(filename);
    const basename = filename.replace(/^.*[\\/]/, '');
    this.files.delete(basename);
  }

  getAllMeshFiles(): Map<string, Blob> {
    return new Map(this.files);
  }

  clearMeshFiles(): void {
    this.files.clear();
  }
}

describe('MeshFilesContext & Assembly Import Bridge', () => {
  it('stores and retrieves mesh files by exact name', () => {
    const store = new TestMeshFilesStore();
    const blob = new Blob(['solid test\nendsolid test'], { type: 'model/stl' });
    store.setMeshFile('part.stl', blob);

    assert.equal(store.hasMeshFile('part.stl'), true);
    assert.equal(store.getMeshFile('part.stl'), blob);
    assert.equal(store.hasMeshFile('nonexistent.stl'), false);
    assert.equal(store.getMeshFile('nonexistent.stl'), undefined);
  });

  it('retrieves mesh files with path prefixes using basename fallback', () => {
    const store = new TestMeshFilesStore();
    const blob = new Blob(['binary stl content'], { type: 'model/stl' });
    store.setMeshFile('motor_mount.stl', blob);

    assert.equal(store.hasMeshFile('./motor_mount.stl'), true);
    assert.equal(store.getMeshFile('./motor_mount.stl'), blob);
    assert.equal(store.hasMeshFile('models/parts/motor_mount.stl'), true);
    assert.equal(store.getMeshFile('models/parts/motor_mount.stl'), blob);
  });

  it('retrieves mesh files case-insensitively', () => {
    const store = new TestMeshFilesStore();
    const blob = new Blob(['binary stl content'], { type: 'model/stl' });
    store.setMeshFile('bracket_v2.stl', blob);

    assert.equal(store.hasMeshFile('BRACKET_V2.STL'), true);
    assert.equal(store.getMeshFile('BRACKET_V2.STL'), blob);
    assert.equal(store.hasMeshFile('./Bracket_V2.stl'), true);
    assert.equal(store.getMeshFile('./Bracket_V2.stl'), blob);
  });

  it('removes mesh files properly', () => {
    const store = new TestMeshFilesStore();
    const blob = new Blob(['sample'], { type: 'model/stl' });
    store.setMeshFile('sensor.stl', blob);
    assert.equal(store.hasMeshFile('sensor.stl'), true);

    store.removeMeshFile('sensor.stl');
    assert.equal(store.hasMeshFile('sensor.stl'), false);
    assert.equal(store.getMeshFile('sensor.stl'), undefined);
  });

  it('clears all mesh files', () => {
    const store = new TestMeshFilesStore();
    store.setMeshFile('a.stl', new Blob(['a']));
    store.setMeshFile('b.stl', new Blob(['b']));
    assert.equal(store.getAllMeshFiles().size, 2);

    store.clearMeshFiles();
    assert.equal(store.getAllMeshFiles().size, 0);
    assert.equal(store.hasMeshFile('a.stl'), false);
  });

  it('bridges STEP/IGES reference models to virtual assembly STL files', () => {
    const store = new TestMeshFilesStore();
    const fakeStepStlBytes = new Uint8Array([0x80, 0x00, 0x01, 0x02]);

    const stepFileName = 'drone_arm_bracket.step';
    const assemblyStlName = getAssemblyStlFileName(stepFileName);
    assert.equal(assemblyStlName, 'drone_arm_bracket.stl');

    const stlBlob = new Blob([fakeStepStlBytes], { type: 'model/stl' });
    store.setMeshFile(assemblyStlName, stlBlob);

    assert.equal(store.hasMeshFile('drone_arm_bracket.stl'), true);
    const retrieved = store.getMeshFile('drone_arm_bracket.stl');
    assert.ok(retrieved);
    assert.equal(retrieved.size, fakeStepStlBytes.byteLength);
  });

  describe('extractImportFilenames', () => {
    it('extracts double-quoted import filenames', () => {
      const scad = 'import("base_plate.stl");';
      const filenames = extractImportFilenames(scad);
      assert.deepEqual(filenames, ['base_plate.stl']);
    });

    it('extracts single-quoted import filenames', () => {
      const scad = "import('bracket.stl');";
      const filenames = extractImportFilenames(scad);
      assert.deepEqual(filenames, ['bracket.stl']);
    });

    it('extracts filenames from OpenSCAD background modifier %import(...)', () => {
      const scad =
        '%import("motor_mount.stl");\ntranslate([0, 0, 10]) cube([10, 10, 10]);';
      const filenames = extractImportFilenames(scad);
      assert.deepEqual(filenames, ['motor_mount.stl']);
    });

    it('extracts filenames when additional arguments or named arguments are passed', () => {
      const scad = `
        import("part1.stl", convexity = 5);
        import(file = "part2.stl", convexity = 3);
        import(file='part3.stl');
      `;
      const filenames = extractImportFilenames(scad);
      assert.deepEqual(filenames, ['part1.stl', 'part2.stl', 'part3.stl']);
    });

    it('deduplicates multiple imports of the same file', () => {
      const scad = `
        import("screw.stl");
        translate([10, 0, 0]) import("screw.stl");
        translate([20, 0, 0]) import("screw.stl");
      `;
      const filenames = extractImportFilenames(scad);
      assert.deepEqual(filenames, ['screw.stl']);
    });
  });
});
