import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import {
  MeshFilesProvider,
  useMeshFiles,
  useOptionalMeshFiles,
  type MeshFilesContextType,
} from './MeshFilesContext';
import { getAssemblyStlFileName } from '@/lib/cadPromptBuilder';

describe('MeshFilesContext & Real React Provider', () => {
  it('throws when useMeshFiles is invoked outside MeshFilesProvider', () => {
    function Consumer() {
      useMeshFiles();
      return null;
    }

    assert.throws(() => {
      ReactDOMServer.renderToString(React.createElement(Consumer));
    }, /useMeshFiles must be used within a MeshFilesProvider/);
  });

  it('returns undefined when useOptionalMeshFiles is invoked outside MeshFilesProvider', () => {
    let captured: MeshFilesContextType | undefined = undefined;
    function Consumer() {
      captured = useOptionalMeshFiles();
      return null;
    }

    ReactDOMServer.renderToString(React.createElement(Consumer));
    assert.equal(captured, undefined);
  });

  function renderWithProvider(callback: (store: MeshFilesContextType) => void) {
    let capturedStore: MeshFilesContextType | undefined;
    function Consumer() {
      const store = useMeshFiles();
      const optionalStore = useOptionalMeshFiles();
      assert.equal(store, optionalStore);
      capturedStore = store;
      callback(store);
      return null;
    }

    ReactDOMServer.renderToString(
      React.createElement(
        MeshFilesProvider,
        null,
        React.createElement(Consumer),
      ),
    );

    return capturedStore!;
  }

  it('stores and retrieves mesh files by exact name', () => {
    renderWithProvider((store) => {
      const blob = new Blob(['solid test\nendsolid test'], {
        type: 'model/stl',
      });
      store.setMeshFile('part.stl', blob);

      assert.equal(store.hasMeshFile('part.stl'), true);
      assert.equal(store.getMeshFile('part.stl'), blob);
      assert.equal(store.hasMeshFile('nonexistent.stl'), false);
      assert.equal(store.getMeshFile('nonexistent.stl'), undefined);
    });
  });

  it('retrieves mesh files with path prefixes using basename fallback', () => {
    renderWithProvider((store) => {
      const blob = new Blob(['binary stl content'], { type: 'model/stl' });
      store.setMeshFile('motor_mount.stl', blob);

      assert.equal(store.hasMeshFile('./motor_mount.stl'), true);
      assert.equal(store.getMeshFile('./motor_mount.stl'), blob);
      assert.equal(store.hasMeshFile('models/parts/motor_mount.stl'), true);
      assert.equal(store.getMeshFile('models/parts/motor_mount.stl'), blob);
    });
  });

  it('retrieves mesh files case-insensitively', () => {
    renderWithProvider((store) => {
      const blob = new Blob(['binary stl content'], { type: 'model/stl' });
      store.setMeshFile('bracket_v2.stl', blob);

      assert.equal(store.hasMeshFile('BRACKET_V2.STL'), true);
      assert.equal(store.getMeshFile('BRACKET_V2.STL'), blob);
      assert.equal(store.hasMeshFile('./Bracket_V2.stl'), true);
      assert.equal(store.getMeshFile('./Bracket_V2.stl'), blob);
    });
  });

  it('removes mesh files properly including case-insensitively', () => {
    renderWithProvider((store) => {
      const blob = new Blob(['sample'], { type: 'model/stl' });
      store.setMeshFile('sensor_bracket.stl', blob);
      assert.equal(store.hasMeshFile('sensor_bracket.stl'), true);

      store.removeMeshFile('SENSOR_BRACKET.STL');
      assert.equal(store.hasMeshFile('sensor_bracket.stl'), false);
      assert.equal(store.getMeshFile('sensor_bracket.stl'), undefined);
    });
  });

  it('clears all mesh files', () => {
    renderWithProvider((store) => {
      store.setMeshFile('a.stl', new Blob(['a']));
      store.setMeshFile('b.stl', new Blob(['b']));
      assert.equal(store.getAllMeshFiles().size, 2);

      store.clearMeshFiles();
      assert.equal(store.getAllMeshFiles().size, 0);
      assert.equal(store.hasMeshFile('a.stl'), false);
    });
  });

  it('bridges STEP/IGES reference models to virtual assembly STL files', () => {
    renderWithProvider((store) => {
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
  });
});
