/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
} from 'react';
import type {
  CadReferenceMetadata,
  CadViewerDisplayMode,
} from '@/types/cadReference';
import { importCadReferenceFile } from '@/lib/cadWorkerClient';

export interface CadReferenceModel {
  metadata: CadReferenceMetadata;
  positions: Float32Array;
  normals: Float32Array;
  includeInAssembly: boolean;
  opacity: number; // 0 to 1
  displayMode: CadViewerDisplayMode;
  showCollisions: boolean;
}

export interface CadReferenceState {
  referenceModel: CadReferenceModel | null;
  isLoading: boolean;
  error: string | null;
  setReferenceFile: (file: File) => Promise<void>;
  setIncludeInAssembly: (include: boolean) => void;
  setOpacity: (opacity: number) => void;
  setDisplayMode: (mode: CadViewerDisplayMode) => void;
  setShowCollisions: (show: boolean) => void;
  clearReference: () => void;
}

export type CadReferenceAction =
  | { type: 'SET_LOADING' }
  | {
      type: 'SET_MODEL';
      payload: {
        metadata: CadReferenceMetadata;
        positions: Float32Array;
        normals: Float32Array;
      };
    }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'SET_INCLUDE_IN_ASSEMBLY'; include: boolean }
  | { type: 'SET_OPACITY'; opacity: number }
  | { type: 'SET_DISPLAY_MODE'; mode: CadViewerDisplayMode }
  | { type: 'SET_SHOW_COLLISIONS'; show: boolean }
  | { type: 'CLEAR' };

export interface CadReferenceInternalState {
  referenceModel: CadReferenceModel | null;
  isLoading: boolean;
  error: string | null;
}

export function cadReferenceReducer(
  state: CadReferenceInternalState,
  action: CadReferenceAction,
): CadReferenceInternalState {
  switch (action.type) {
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    case 'SET_MODEL':
      return {
        isLoading: false,
        error: null,
        referenceModel: {
          metadata: action.payload.metadata,
          positions: action.payload.positions,
          normals: action.payload.normals,
          includeInAssembly: false,
          opacity: 0.4,
          displayMode: 'ghost',
          showCollisions: true,
        },
      };
    case 'SET_ERROR':
      return {
        isLoading: false,
        error: action.error,
        referenceModel: null,
      };
    case 'SET_INCLUDE_IN_ASSEMBLY':
      return {
        ...state,
        referenceModel: state.referenceModel
          ? { ...state.referenceModel, includeInAssembly: action.include }
          : null,
      };
    case 'SET_OPACITY': {
      const clamped = Math.max(0, Math.min(1, action.opacity));
      return {
        ...state,
        referenceModel: state.referenceModel
          ? { ...state.referenceModel, opacity: clamped }
          : null,
      };
    }
    case 'SET_DISPLAY_MODE':
      return {
        ...state,
        referenceModel: state.referenceModel
          ? { ...state.referenceModel, displayMode: action.mode }
          : null,
      };
    case 'SET_SHOW_COLLISIONS':
      return {
        ...state,
        referenceModel: state.referenceModel
          ? { ...state.referenceModel, showCollisions: action.show }
          : null,
      };
    case 'CLEAR':
      return {
        isLoading: false,
        error: null,
        referenceModel: null,
      };
    default:
      return state;
  }
}

export const CadReferenceContext = createContext<CadReferenceState | undefined>(
  undefined,
);

export async function executeSetReferenceFile(
  file: File,
  dispatch: (action: CadReferenceAction) => void,
): Promise<void> {
  dispatch({ type: 'SET_LOADING' });
  try {
    const result = await importCadReferenceFile(file);
    dispatch({
      type: 'SET_MODEL',
      payload: {
        metadata: result.metadata,
        positions: result.positions,
        normals: result.normals,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Failed to import CAD reference file';
    dispatch({ type: 'SET_ERROR', error: message });
    throw err;
  }
}

export function CadReferenceProvider({
  children,
  initialModel = null,
}: {
  children?: React.ReactNode;
  initialModel?: CadReferenceModel | null;
}) {
  const [state, dispatch] = useReducer(cadReferenceReducer, {
    referenceModel: initialModel,
    isLoading: false,
    error: null,
  });

  const setReferenceFile = useCallback(async (file: File): Promise<void> => {
    return executeSetReferenceFile(file, dispatch);
  }, []);

  const setIncludeInAssembly = useCallback((include: boolean) => {
    dispatch({ type: 'SET_INCLUDE_IN_ASSEMBLY', include });
  }, []);

  const setOpacity = useCallback((opacity: number) => {
    dispatch({ type: 'SET_OPACITY', opacity });
  }, []);

  const setDisplayMode = useCallback((mode: CadViewerDisplayMode) => {
    dispatch({ type: 'SET_DISPLAY_MODE', mode });
  }, []);

  const setShowCollisions = useCallback((show: boolean) => {
    dispatch({ type: 'SET_SHOW_COLLISIONS', show });
  }, []);

  const clearReference = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  const value = useMemo<CadReferenceState>(
    () => ({
      referenceModel: state.referenceModel,
      isLoading: state.isLoading,
      error: state.error,
      setReferenceFile,
      setIncludeInAssembly,
      setOpacity,
      setDisplayMode,
      setShowCollisions,
      clearReference,
    }),
    [
      state.referenceModel,
      state.isLoading,
      state.error,
      setReferenceFile,
      setIncludeInAssembly,
      setOpacity,
      setDisplayMode,
      setShowCollisions,
      clearReference,
    ],
  );

  return (
    <CadReferenceContext.Provider value={value}>
      {children}
    </CadReferenceContext.Provider>
  );
}

export function useCadReference(): CadReferenceState {
  const context = useContext(CadReferenceContext);
  if (!context) {
    throw new Error(
      'useCadReference must be used within a CadReferenceProvider',
    );
  }
  return context;
}

export function useOptionalCadReference(): CadReferenceState | null {
  return useContext(CadReferenceContext) ?? null;
}
