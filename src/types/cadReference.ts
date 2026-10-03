export type CadFileType = 'step' | 'iges' | 'stl';

export type CadViewerDisplayMode = 'ghost' | 'wireframe' | 'hidden';
export type CadDisplayMode = CadViewerDisplayMode;

export interface CadReferenceBounds {
  min: [number, number, number];
  max: [number, number, number];
  dimensions: [number, number, number]; // [width_x, depth_y, height_z]
  center: [number, number, number];
}

export interface CadHoleFeature {
  id: string;
  center: [number, number, number];
  axis: [number, number, number];
  diameter: number;
  radius: number;
  depth?: number;
  isThroughHole: boolean;
}

export interface CadMatingPlane {
  id: string;
  name: string; // e.g., "Bottom Plane", "Top Plane", "Front Face"
  normal: [number, number, number];
  offset: number; // distance along normal from origin
  bounds: { min: [number, number]; max: [number, number] };
}

export interface CadReferenceMetadata {
  fileName: string;
  fileSize: number;
  fileType: CadFileType;
  bounds: CadReferenceBounds;
  holes: CadHoleFeature[];
  planes: CadMatingPlane[];
  triangleCount: number;
  tessellatedStlBytes?: Uint8Array; // used for OpenSCAD assembly import
}

export interface CadTessellationResult {
  positions: Float32Array;
  normals: Float32Array;
  metadata: CadReferenceMetadata;
}

export interface CadPromptOptions {
  includeInAssembly: boolean;
  clearanceMm?: number; // default 0.3mm
}

export interface CadImportWorkerRequest {
  id: string;
  fileName: string;
  fileBuffer: ArrayBuffer;
  fileType?: CadFileType;
}

export interface CadImportWorkerSuccessResponse {
  id: string;
  success: true;
  result: CadTessellationResult;
}

export interface CadImportWorkerErrorResponse {
  id: string;
  success: false;
  error: string;
}

export type CadImportWorkerResponse =
  | CadImportWorkerSuccessResponse
  | CadImportWorkerErrorResponse;
