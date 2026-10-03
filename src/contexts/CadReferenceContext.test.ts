import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import {
  CadReferenceProvider,
  useCadReference,
  useOptionalCadReference,
  cadReferenceReducer,
  type CadReferenceModel,
  type CadReferenceInternalState,
} from './CadReferenceContext';
import { formatCadReferencePrompt } from '@/lib/cadPromptBuilder';
import type { CadReferenceMetadata } from '@/types/cadReference';

describe('CadReferenceContext', () => {
  const sampleMetadata: CadReferenceMetadata = {
    fileName: 'motor_mount.step',
    fileSize: 10240,
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
        center: [-15, -15, 0],
        axis: [0, 0, 1],
        depth: 34,
        isThroughHole: true,
      },
    ],
    planes: [
      {
        id: 'plane_bottom',
        name: 'Bottom Mating Plane',
        normal: [0, 0, -1],
        offset: 0,
        bounds: { min: [-21, -21], max: [21, 21] },
      },
    ],
    triangleCount: 1200,
  };

  const sampleModel: CadReferenceModel = {
    metadata: sampleMetadata,
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    includeInAssembly: false,
    opacity: 0.4,
    displayMode: 'ghost',
    showCollisions: true,
  };

  describe('cadReferenceReducer state transitions', () => {
    const initialState: CadReferenceInternalState = {
      referenceModel: null,
      isLoading: false,
      error: null,
    };

    it('sets loading state and clears prior error', () => {
      const stateWithError: CadReferenceInternalState = {
        ...initialState,
        error: 'Prior error',
      };
      const next = cadReferenceReducer(stateWithError, { type: 'SET_LOADING' });
      assert.equal(next.isLoading, true);
      assert.equal(next.error, null);
    });

    it('populates model with standard defaults on SET_MODEL', () => {
      const next = cadReferenceReducer(initialState, {
        type: 'SET_MODEL',
        payload: {
          metadata: sampleMetadata,
          positions: sampleModel.positions,
          normals: sampleModel.normals,
        },
      });

      assert.equal(next.isLoading, false);
      assert.equal(next.error, null);
      assert.notEqual(next.referenceModel, null);
      assert.equal(next.referenceModel?.metadata.fileName, 'motor_mount.step');
      assert.equal(next.referenceModel?.includeInAssembly, false);
      assert.equal(next.referenceModel?.opacity, 0.4);
      assert.equal(next.referenceModel?.displayMode, 'ghost');
      assert.equal(next.referenceModel?.showCollisions, true);
    });

    it('sets error and clears model on SET_ERROR', () => {
      const stateWithModel: CadReferenceInternalState = {
        referenceModel: sampleModel,
        isLoading: true,
        error: null,
      };

      const next = cadReferenceReducer(stateWithModel, {
        type: 'SET_ERROR',
        error: 'Mesh parsing failure',
      });

      assert.equal(next.isLoading, false);
      assert.equal(next.error, 'Mesh parsing failure');
      assert.equal(next.referenceModel, null);
    });

    it('toggles includeInAssembly', () => {
      const stateWithModel: CadReferenceInternalState = {
        ...initialState,
        referenceModel: sampleModel,
      };

      const enabled = cadReferenceReducer(stateWithModel, {
        type: 'SET_INCLUDE_IN_ASSEMBLY',
        include: true,
      });
      assert.equal(enabled.referenceModel?.includeInAssembly, true);

      const disabled = cadReferenceReducer(enabled, {
        type: 'SET_INCLUDE_IN_ASSEMBLY',
        include: false,
      });
      assert.equal(disabled.referenceModel?.includeInAssembly, false);
    });

    it('clamps opacity between 0.0 and 1.0', () => {
      const stateWithModel: CadReferenceInternalState = {
        ...initialState,
        referenceModel: sampleModel,
      };

      const normal = cadReferenceReducer(stateWithModel, {
        type: 'SET_OPACITY',
        opacity: 0.75,
      });
      assert.equal(normal.referenceModel?.opacity, 0.75);

      const over = cadReferenceReducer(stateWithModel, {
        type: 'SET_OPACITY',
        opacity: 1.5,
      });
      assert.equal(over.referenceModel?.opacity, 1.0);

      const under = cadReferenceReducer(stateWithModel, {
        type: 'SET_OPACITY',
        opacity: -0.2,
      });
      assert.equal(under.referenceModel?.opacity, 0.0);
    });

    it('updates displayMode between ghost, wireframe, and hidden', () => {
      const stateWithModel: CadReferenceInternalState = {
        ...initialState,
        referenceModel: sampleModel,
      };

      const wireframe = cadReferenceReducer(stateWithModel, {
        type: 'SET_DISPLAY_MODE',
        mode: 'wireframe',
      });
      assert.equal(wireframe.referenceModel?.displayMode, 'wireframe');

      const hidden = cadReferenceReducer(stateWithModel, {
        type: 'SET_DISPLAY_MODE',
        mode: 'hidden',
      });
      assert.equal(hidden.referenceModel?.displayMode, 'hidden');

      const ghost = cadReferenceReducer(stateWithModel, {
        type: 'SET_DISPLAY_MODE',
        mode: 'ghost',
      });
      assert.equal(ghost.referenceModel?.displayMode, 'ghost');
    });

    it('toggles showCollisions', () => {
      const stateWithModel: CadReferenceInternalState = {
        ...initialState,
        referenceModel: sampleModel,
      };

      const noCollisions = cadReferenceReducer(stateWithModel, {
        type: 'SET_SHOW_COLLISIONS',
        show: false,
      });
      assert.equal(noCollisions.referenceModel?.showCollisions, false);

      const withCollisions = cadReferenceReducer(noCollisions, {
        type: 'SET_SHOW_COLLISIONS',
        show: true,
      });
      assert.equal(withCollisions.referenceModel?.showCollisions, true);
    });

    it('clears reference state on CLEAR', () => {
      const activeState: CadReferenceInternalState = {
        referenceModel: sampleModel,
        isLoading: false,
        error: 'Old error',
      };

      const cleared = cadReferenceReducer(activeState, { type: 'CLEAR' });
      assert.equal(cleared.referenceModel, null);
      assert.equal(cleared.isLoading, false);
      assert.equal(cleared.error, null);
    });

    it('handles property setters as no-op when referenceModel is null', () => {
      const nullModel = cadReferenceReducer(initialState, {
        type: 'SET_INCLUDE_IN_ASSEMBLY',
        include: true,
      });
      assert.equal(nullModel.referenceModel, null);

      const nullOpacity = cadReferenceReducer(initialState, {
        type: 'SET_OPACITY',
        opacity: 0.8,
      });
      assert.equal(nullOpacity.referenceModel, null);

      const nullMode = cadReferenceReducer(initialState, {
        type: 'SET_DISPLAY_MODE',
        mode: 'wireframe',
      });
      assert.equal(nullMode.referenceModel, null);

      const nullCollision = cadReferenceReducer(initialState, {
        type: 'SET_SHOW_COLLISIONS',
        show: false,
      });
      assert.equal(nullCollision.referenceModel, null);
    });
  });

  describe('React context integration and hooks', () => {
    it('throws when useCadReference is invoked outside CadReferenceProvider', () => {
      function Consumer() {
        useCadReference();
        return null;
      }

      assert.throws(() => {
        ReactDOMServer.renderToString(React.createElement(Consumer));
      }, /useCadReference must be used within a CadReferenceProvider/);
    });

    it('returns null when useOptionalCadReference is invoked outside CadReferenceProvider', () => {
      let result: unknown = 'uninitialized';
      function Consumer() {
        result = useOptionalCadReference();
        return null;
      }

      ReactDOMServer.renderToString(React.createElement(Consumer));
      assert.equal(result, null);
    });

    it('provides default initial state inside CadReferenceProvider', () => {
      let capturedState: ReturnType<typeof useCadReference> | undefined;
      function Consumer() {
        capturedState = useCadReference();
        return null;
      }

      ReactDOMServer.renderToString(
        React.createElement(
          CadReferenceProvider,
          null,
          React.createElement(Consumer),
        ),
      );

      assert.notEqual(capturedState, undefined);
      assert.equal(capturedState?.referenceModel, null);
      assert.equal(capturedState?.isLoading, false);
      assert.equal(capturedState?.error, null);
      assert.equal(typeof capturedState?.setReferenceFile, 'function');
      assert.equal(typeof capturedState?.setIncludeInAssembly, 'function');
      assert.equal(typeof capturedState?.setOpacity, 'function');
      assert.equal(typeof capturedState?.setDisplayMode, 'function');
      assert.equal(typeof capturedState?.setShowCollisions, 'function');
      assert.equal(typeof capturedState?.clearReference, 'function');
    });

    it('provides initialModel when provided to CadReferenceProvider', () => {
      let capturedState: ReturnType<typeof useCadReference> | undefined;
      function Consumer() {
        capturedState = useCadReference();
        return null;
      }

      ReactDOMServer.renderToString(
        React.createElement(
          CadReferenceProvider,
          { initialModel: sampleModel },
          React.createElement(Consumer),
        ),
      );

      assert.notEqual(capturedState, undefined);
      assert.equal(
        capturedState?.referenceModel?.metadata.fileName,
        'motor_mount.step',
      );
      assert.equal(capturedState?.referenceModel?.displayMode, 'ghost');
      assert.equal(capturedState?.referenceModel?.opacity, 0.4);
    });
  });

  describe('Prompt generation and assembly toggling', () => {
    it('generates prompt without assembly %import when includeInAssembly is false', () => {
      const prompt = formatCadReferencePrompt(sampleModel.metadata, {
        includeInAssembly: false,
      });

      assert.match(
        prompt,
        /\[ATTACHED REFERENCE CAD MODEL: motor_mount\.step\]/,
      );
      assert.match(
        prompt,
        /Width \(X\): 42\.00, Depth \(Y\): 42\.00, Height \(Z\): 34\.00/,
      );
      assert.match(prompt, /hole_1: Diameter: 3\.20mm/);
      assert.match(prompt, /Bottom Mating Plane/);
      assert.doesNotMatch(prompt, /ASSEMBLY REFERENCE IMPORT/);
      assert.doesNotMatch(prompt, /%import/);
    });

    it('generates prompt with virtual assembly %import when includeInAssembly is true', () => {
      const prompt = formatCadReferencePrompt(sampleModel.metadata, {
        includeInAssembly: true,
      });

      assert.match(
        prompt,
        /\[ATTACHED REFERENCE CAD MODEL: motor_mount\.step\]/,
      );
      assert.match(prompt, /ASSEMBLY REFERENCE IMPORT:/);
      assert.match(prompt, /%import\("motor_mount\.stl"\);/);
      assert.match(prompt, /Use the background modifier '%'/);
    });

    it('generates prompt reflecting assembly toggling through reducer state changes', () => {
      let state: CadReferenceInternalState = {
        referenceModel: sampleModel,
        isLoading: false,
        error: null,
      };

      // Initially false
      let prompt = formatCadReferencePrompt(state.referenceModel!.metadata, {
        includeInAssembly: state.referenceModel!.includeInAssembly,
      });
      assert.doesNotMatch(prompt, /%import/);

      // Toggle to true
      state = cadReferenceReducer(state, {
        type: 'SET_INCLUDE_IN_ASSEMBLY',
        include: true,
      });
      prompt = formatCadReferencePrompt(state.referenceModel!.metadata, {
        includeInAssembly: state.referenceModel!.includeInAssembly,
      });
      assert.match(prompt, /%import\("motor_mount\.stl"\);/);

      // Toggle back to false
      state = cadReferenceReducer(state, {
        type: 'SET_INCLUDE_IN_ASSEMBLY',
        include: false,
      });
      prompt = formatCadReferencePrompt(state.referenceModel!.metadata, {
        includeInAssembly: state.referenceModel!.includeInAssembly,
      });
      assert.doesNotMatch(prompt, /%import/);
    });
  });
});
