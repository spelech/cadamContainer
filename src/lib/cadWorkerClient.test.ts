import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectCadFileType,
  isValidCadFile,
  importCadReferenceFile,
  parseCadBuffer,
  setCadWorkerFactory,
} from './cadWorkerClient';
import type {
  CadImportWorkerRequest,
  CadImportWorkerResponse,
  CadTessellationResult,
} from '@/types/cadReference';

describe('cadWorkerClient', () => {
  describe('detectCadFileType and isValidCadFile', () => {
    it('detects step files accurately', () => {
      assert.equal(detectCadFileType('bracket.step'), 'step');
      assert.equal(detectCadFileType('BRACKET.STP'), 'step');
      assert.equal(isValidCadFile('bracket.step'), true);
      assert.equal(isValidCadFile('bracket.stp'), true);
    });

    it('detects iges files accurately', () => {
      assert.equal(detectCadFileType('mount.iges'), 'iges');
      assert.equal(detectCadFileType('MOUNT.IGS'), 'iges');
      assert.equal(isValidCadFile('mount.iges'), true);
      assert.equal(isValidCadFile('mount.igs'), true);
    });

    it('detects stl files accurately', () => {
      assert.equal(detectCadFileType('gear.stl'), 'stl');
      assert.equal(detectCadFileType('GEAR.STL'), 'stl');
      assert.equal(isValidCadFile('gear.stl'), true);
    });

    it('returns null and false for unsupported file extensions', () => {
      assert.equal(detectCadFileType('model.obj'), null);
      assert.equal(detectCadFileType('drawing.dxf'), null);
      assert.equal(detectCadFileType('image.png'), null);
      assert.equal(detectCadFileType(''), null);
      assert.equal(isValidCadFile('model.obj'), false);
    });
  });

  describe('importCadReferenceFile validation', () => {
    it('rejects unsupported files with descriptive error', async () => {
      const fakeFile = {
        name: 'unsupported.txt',
        size: 100,
        arrayBuffer: async () => new ArrayBuffer(100),
      } as unknown as File;

      await assert.rejects(
        async () => {
          await importCadReferenceFile(fakeFile);
        },
        {
          name: 'Error',
          message: /Unsupported CAD file format/,
        },
      );
    });
  });

  describe('direct parsing pipeline (parseCadBuffer)', () => {
    it('parses an ASCII STL buffer into valid positions, normals, and metadata', async () => {
      const asciiStl = `solid test_triangle
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 10 0 0
    vertex 10 10 0
  endloop
endfacet
endsolid test_triangle`;

      const encoder = new TextEncoder();
      const buffer = encoder.encode(asciiStl).buffer;

      const result = await parseCadBuffer(buffer, 'test_triangle.stl', 'stl');

      assert.equal(result.metadata.fileName, 'test_triangle.stl');
      assert.equal(result.metadata.fileType, 'stl');
      assert.equal(result.metadata.triangleCount, 1);
      assert.equal(result.positions.length, 9);
      assert.equal(result.normals.length, 9);

      // Bounds verification
      assert.deepEqual(result.metadata.bounds.min, [0, 0, 0]);
      assert.deepEqual(result.metadata.bounds.max, [10, 10, 0]);
      assert.deepEqual(result.metadata.bounds.dimensions, [10, 10, 0]);
      assert.deepEqual(result.metadata.bounds.center, [5, 5, 0]);
      assert.ok(result.metadata.tessellatedStlBytes instanceof Uint8Array);
    });

    it('parses a STEP file buffer into valid positions, normals, and bounds', async () => {
      const fs = await import('node:fs');
      const stepPath =
        'node_modules/occt-import-js/test/testfiles/cube-10x10mm/Cube 10x10.stp';
      const fileBytes = fs.readFileSync(stepPath);
      const buffer = fileBytes.buffer.slice(
        fileBytes.byteOffset,
        fileBytes.byteOffset + fileBytes.byteLength,
      );

      const result = await parseCadBuffer(buffer, 'Cube 10x10.stp', 'step');

      assert.equal(result.metadata.fileName, 'Cube 10x10.stp');
      assert.equal(result.metadata.fileType, 'step');
      assert.equal(result.metadata.triangleCount, 12);
      assert.equal(result.positions.length, 12 * 9);
      assert.equal(result.normals.length, 12 * 9);

      // Cube 10x10 is from -5 to 5 on X, Y, Z
      const [dimX, dimY, dimZ] = result.metadata.bounds.dimensions;
      assert.ok(Math.abs(dimX - 10) < 0.01, `Expected dimX ~ 10, got ${dimX}`);
      assert.ok(Math.abs(dimY - 10) < 0.01, `Expected dimY ~ 10, got ${dimY}`);
      assert.ok(Math.abs(dimZ - 10) < 0.01, `Expected dimZ ~ 10, got ${dimZ}`);
      assert.ok(result.metadata.tessellatedStlBytes instanceof Uint8Array);
      assert.ok(result.metadata.tessellatedStlBytes.length > 84);
    });

    it('parses an IGES file buffer into valid positions, normals, and bounds', async () => {
      const fs = await import('node:fs');
      const igesPath =
        'node_modules/occt-import-js/test/testfiles/cube-10x10mm/Cube 10x10.igs';
      const fileBytes = fs.readFileSync(igesPath);
      const buffer = fileBytes.buffer.slice(
        fileBytes.byteOffset,
        fileBytes.byteOffset + fileBytes.byteLength,
      );

      const result = await parseCadBuffer(buffer, 'Cube 10x10.igs', 'iges');

      assert.equal(result.metadata.fileName, 'Cube 10x10.igs');
      assert.equal(result.metadata.fileType, 'iges');
      assert.ok(result.metadata.triangleCount >= 12);
      assert.equal(result.positions.length, result.metadata.triangleCount * 9);
      assert.equal(result.normals.length, result.metadata.triangleCount * 9);
      assert.ok(result.metadata.tessellatedStlBytes instanceof Uint8Array);
    });
  });

  describe('importCadReferenceFile integration with File object', () => {
    it('successfully processes File object in Node fallback mode', async () => {
      const asciiStl = `solid unit_box
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 1 0 0
    vertex 1 1 0
  endloop
endfacet
endsolid unit_box`;

      const encoder = new TextEncoder();
      const buffer = encoder.encode(asciiStl).buffer;

      const fakeFile = {
        name: 'unit_box.stl',
        size: buffer.byteLength,
        arrayBuffer: async () => buffer,
      } as unknown as File;

      const result = await importCadReferenceFile(fakeFile);
      assert.equal(result.metadata.fileName, 'unit_box.stl');
      assert.equal(result.metadata.fileType, 'stl');
      assert.equal(result.metadata.triangleCount, 1);
    });
  });

  describe('worker message dispatch with custom worker factory', () => {
    type MessageListener = (event: { data: CadImportWorkerResponse }) => void;
    type ErrorListener = (event: { message: string }) => void;

    it('dispatches to worker and receives parsed result successfully', async () => {
      const messageListeners: MessageListener[] = [];
      const errorListeners: ErrorListener[] = [];

      class MockWorker {
        addEventListener(event: string, listener: unknown) {
          if (event === 'message')
            messageListeners.push(listener as MessageListener);
          if (event === 'error') errorListeners.push(listener as ErrorListener);
        }
        removeEventListener() {}
        postMessage(data: CadImportWorkerRequest) {
          // Simulate worker response
          const fakeResult: CadTessellationResult = {
            positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
            normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
            metadata: {
              fileName: data.fileName,
              fileSize: 100,
              fileType: data.fileType || 'step',
              bounds: {
                min: [0, 0, 0],
                max: [1, 1, 0],
                dimensions: [1, 1, 0],
                center: [0.5, 0.5, 0],
              },
              holes: [],
              planes: [],
              triangleCount: 1,
            },
          };

          const response: CadImportWorkerResponse = {
            id: data.id,
            success: true,
            result: fakeResult,
          };

          setTimeout(() => {
            messageListeners.forEach((fn) => fn({ data: response }));
          }, 5);
        }
        terminate() {}
      }

      setCadWorkerFactory(() => new MockWorker() as unknown as Worker);

      const fakeFile = {
        name: 'test.step',
        size: 100,
        arrayBuffer: async () => new ArrayBuffer(100),
      } as unknown as File;

      const result = await importCadReferenceFile(fakeFile);
      assert.equal(result.metadata.fileName, 'test.step');
      assert.equal(result.metadata.fileType, 'step');
      assert.equal(result.positions.length, 9);

      setCadWorkerFactory(null);
    });

    it('handles worker error response properly', async () => {
      const messageListeners: MessageListener[] = [];

      class FailingWorker {
        addEventListener(event: string, listener: unknown) {
          if (event === 'message')
            messageListeners.push(listener as MessageListener);
        }
        removeEventListener() {}
        postMessage(data: CadImportWorkerRequest) {
          const response: CadImportWorkerResponse = {
            id: data.id,
            success: false,
            error: 'Corrupted CAD entity table',
          };
          setTimeout(() => {
            messageListeners.forEach((fn) => fn({ data: response }));
          }, 5);
        }
        terminate() {}
      }

      setCadWorkerFactory(() => new FailingWorker() as unknown as Worker);

      const fakeFile = {
        name: 'corrupted.step',
        size: 50,
        arrayBuffer: async () => new ArrayBuffer(50),
      } as unknown as File;

      await assert.rejects(
        async () => {
          await importCadReferenceFile(fakeFile);
        },
        {
          name: 'Error',
          message: 'Corrupted CAD entity table',
        },
      );

      setCadWorkerFactory(null);
    });
  });
});
