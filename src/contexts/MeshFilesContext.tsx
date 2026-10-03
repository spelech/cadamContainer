/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useRef, useCallback } from 'react';

export interface MeshFilesContextType {
  // Store a mesh file by filename
  setMeshFile: (filename: string, content: Blob) => void;
  // Get a mesh file by filename
  getMeshFile: (filename: string) => Blob | undefined;
  // Check if a mesh file exists
  hasMeshFile: (filename: string) => boolean;
  // Remove a mesh file by filename
  removeMeshFile: (filename: string) => void;
  // Get all stored mesh files as a map
  getAllMeshFiles: () => Map<string, Blob>;
  // Clear all mesh files
  clearMeshFiles: () => void;
}

export const MeshFilesContext = createContext<MeshFilesContextType | undefined>(
  undefined,
);

export function MeshFilesProvider({ children }: { children: React.ReactNode }) {
  // Use ref to avoid re-renders when files are added
  const meshFilesRef = useRef<Map<string, Blob>>(new Map());

  const setMeshFile = useCallback((filename: string, content: Blob) => {
    console.log(`[MeshFiles] Storing: "${filename}" (${content.size} bytes)`);
    meshFilesRef.current.set(filename, content);
  }, []);

  const getMeshFile = useCallback((filename: string): Blob | undefined => {
    if (meshFilesRef.current.has(filename)) {
      return meshFilesRef.current.get(filename);
    }
    const basename = filename.replace(/^.*[\\/]/, '');
    if (meshFilesRef.current.has(basename)) {
      return meshFilesRef.current.get(basename);
    }
    const lowerFilename = filename.toLowerCase();
    const lowerBasename = basename.toLowerCase();
    for (const [key, val] of meshFilesRef.current.entries()) {
      if (
        key.toLowerCase() === lowerFilename ||
        key.toLowerCase() === lowerBasename
      ) {
        return val;
      }
    }
    return undefined;
  }, []);

  const hasMeshFile = useCallback((filename: string): boolean => {
    if (meshFilesRef.current.has(filename)) return true;
    const basename = filename.replace(/^.*[\\/]/, '');
    if (meshFilesRef.current.has(basename)) return true;
    const lowerFilename = filename.toLowerCase();
    const lowerBasename = basename.toLowerCase();
    for (const key of meshFilesRef.current.keys()) {
      if (
        key.toLowerCase() === lowerFilename ||
        key.toLowerCase() === lowerBasename
      ) {
        return true;
      }
    }
    return false;
  }, []);

  const removeMeshFile = useCallback((filename: string) => {
    meshFilesRef.current.delete(filename);
    const basename = filename.replace(/^.*[\\/]/, '');
    meshFilesRef.current.delete(basename);

    const lowerFilename = filename.toLowerCase();
    const lowerBasename = basename.toLowerCase();
    for (const key of Array.from(meshFilesRef.current.keys())) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === lowerFilename || lowerKey === lowerBasename) {
        meshFilesRef.current.delete(key);
      }
    }
  }, []);

  const getAllMeshFiles = useCallback((): Map<string, Blob> => {
    return new Map(meshFilesRef.current);
  }, []);

  const clearMeshFiles = useCallback(() => {
    meshFilesRef.current.clear();
  }, []);

  return (
    <MeshFilesContext.Provider
      value={{
        setMeshFile,
        getMeshFile,
        hasMeshFile,
        removeMeshFile,
        getAllMeshFiles,
        clearMeshFiles,
      }}
    >
      {children}
    </MeshFilesContext.Provider>
  );
}

export function useMeshFiles() {
  const context = useContext(MeshFilesContext);
  if (context === undefined) {
    throw new Error('useMeshFiles must be used within a MeshFilesProvider');
  }
  return context;
}

export function useOptionalMeshFiles() {
  return useContext(MeshFilesContext);
}
