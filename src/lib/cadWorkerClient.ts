import type {
  CadFileType,
  CadImportWorkerRequest,
  CadImportWorkerResponse,
  CadReferenceBounds,
  CadTessellationResult,
} from '@/types/cadReference';

/**
 * Validates and extracts file extension to supported CAD file types.
 * Supports .step, .stp, .iges, .igs, and .stl (case-insensitive).
 */
export function detectCadFileType(fileName: string): CadFileType | null {
  if (!fileName) return null;
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.step') || lower.endsWith('.stp')) {
    return 'step';
  }
  if (lower.endsWith('.iges') || lower.endsWith('.igs')) {
    return 'iges';
  }
  if (lower.endsWith('.stl')) {
    return 'stl';
  }
  return null;
}

/**
 * Returns true if the file extension is a supported CAD reference model format.
 */
export function isValidCadFile(fileName: string): boolean {
  return detectCadFileType(fileName) !== null;
}

/**
 * Computes axis-aligned bounding box and dimensions from vertex position array.
 */
export function computeCadBounds(positions: Float32Array): CadReferenceBounds {
  if (positions.length < 3) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0],
      dimensions: [0, 0, 0],
      center: [0, 0, 0],
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const round4 = (n: number) => Math.round(n * 10000) / 10000;

  const min: [number, number, number] = [
    round4(minX),
    round4(minY),
    round4(minZ),
  ];
  const max: [number, number, number] = [
    round4(maxX),
    round4(maxY),
    round4(maxZ),
  ];
  const dimensions: [number, number, number] = [
    round4(maxX - minX),
    round4(maxY - minY),
    round4(maxZ - minZ),
  ];
  const center: [number, number, number] = [
    round4((minX + maxX) / 2),
    round4((minY + maxY) / 2),
    round4((minZ + maxZ) / 2),
  ];

  return { min, max, dimensions, center };
}

/**
 * Serializes raw triangle positions and normals into standard binary STL bytes.
 */
export function exportBinaryStl(
  positions: Float32Array,
  normals?: Float32Array,
): Uint8Array {
  const triangleCount = Math.floor(positions.length / 9);
  const buffer = new ArrayBuffer(84 + triangleCount * 50);
  const view = new DataView(buffer);

  // 80 bytes header (zeroes)
  // uint32 triangle count at offset 80
  view.setUint32(80, triangleCount, true);

  let offset = 84;
  for (let i = 0; i < triangleCount; i++) {
    const pIdx = i * 9;
    const nIdx = i * 9;

    let nx = 0;
    let ny = 0;
    let nz = 0;

    if (normals && normals.length >= pIdx + 3) {
      nx = normals[nIdx];
      ny = normals[nIdx + 1];
      nz = normals[nIdx + 2];
    } else {
      const ax = positions[pIdx + 3] - positions[pIdx];
      const ay = positions[pIdx + 4] - positions[pIdx + 1];
      const az = positions[pIdx + 5] - positions[pIdx + 2];
      const bx = positions[pIdx + 6] - positions[pIdx];
      const by = positions[pIdx + 7] - positions[pIdx + 1];
      const bz = positions[pIdx + 8] - positions[pIdx + 2];
      nx = ay * bz - az * by;
      ny = az * bx - ax * bz;
      nz = ax * by - ay * bx;
      const len = Math.hypot(nx, ny, nz);
      if (len > 1e-6) {
        nx /= len;
        ny /= len;
        nz /= len;
      }
    }

    view.setFloat32(offset, nx, true);
    offset += 4;
    view.setFloat32(offset, ny, true);
    offset += 4;
    view.setFloat32(offset, nz, true);
    offset += 4;

    for (let v = 0; v < 3; v++) {
      view.setFloat32(offset, positions[pIdx + v * 3], true);
      offset += 4;
      view.setFloat32(offset, positions[pIdx + v * 3 + 1], true);
      offset += 4;
      view.setFloat32(offset, positions[pIdx + v * 3 + 2], true);
      offset += 4;
    }

    view.setUint16(offset, 0, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

interface OcctMesh {
  name?: string;
  attributes?: {
    position?: { array?: ArrayLike<number> };
    normal?: { array?: ArrayLike<number> };
  };
  index?: {
    array?: ArrayLike<number>;
  };
}

interface OcctResult {
  success: boolean;
  meshes?: OcctMesh[];
}

interface OcctInstance {
  ReadStepFile(content: Uint8Array, params: null | undefined): OcctResult;
  ReadIgesFile(content: Uint8Array, params: null | undefined): OcctResult;
}

/**
 * Extracts and unrolls OCCT meshes into unified contiguous Float32Arrays of positions and normals.
 */
export function extractMeshesToBuffers(meshes: OcctMesh[]): {
  positions: Float32Array;
  normals: Float32Array;
} {
  let totalTriangles = 0;
  for (const mesh of meshes) {
    if (mesh.index?.array) {
      totalTriangles += Math.floor(mesh.index.array.length / 3);
    } else if (mesh.attributes?.position?.array) {
      totalTriangles += Math.floor(mesh.attributes.position.array.length / 9);
    }
  }

  const positions = new Float32Array(totalTriangles * 9);
  const normals = new Float32Array(totalTriangles * 9);
  let pOffset = 0;
  let nOffset = 0;

  for (const mesh of meshes) {
    const posArr = mesh.attributes?.position?.array;
    if (!posArr || posArr.length === 0) continue;
    const normArr = mesh.attributes?.normal?.array;
    const idxArr = mesh.index?.array;

    if (idxArr && idxArr.length > 0) {
      const hasNormals = normArr && normArr.length >= posArr.length;
      for (let i = 0; i < idxArr.length; i += 3) {
        const i0 = idxArr[i];
        const i1 = idxArr[i + 1];
        const i2 = idxArr[i + 2];

        const p0x = posArr[i0 * 3];
        const p0y = posArr[i0 * 3 + 1];
        const p0z = posArr[i0 * 3 + 2];
        const p1x = posArr[i1 * 3];
        const p1y = posArr[i1 * 3 + 1];
        const p1z = posArr[i1 * 3 + 2];
        const p2x = posArr[i2 * 3];
        const p2y = posArr[i2 * 3 + 1];
        const p2z = posArr[i2 * 3 + 2];

        positions[pOffset++] = p0x;
        positions[pOffset++] = p0y;
        positions[pOffset++] = p0z;

        positions[pOffset++] = p1x;
        positions[pOffset++] = p1y;
        positions[pOffset++] = p1z;

        positions[pOffset++] = p2x;
        positions[pOffset++] = p2y;
        positions[pOffset++] = p2z;

        if (hasNormals) {
          normals[nOffset++] = normArr[i0 * 3];
          normals[nOffset++] = normArr[i0 * 3 + 1];
          normals[nOffset++] = normArr[i0 * 3 + 2];

          normals[nOffset++] = normArr[i1 * 3];
          normals[nOffset++] = normArr[i1 * 3 + 1];
          normals[nOffset++] = normArr[i1 * 3 + 2];

          normals[nOffset++] = normArr[i2 * 3];
          normals[nOffset++] = normArr[i2 * 3 + 1];
          normals[nOffset++] = normArr[i2 * 3 + 2];
        } else {
          const ax = p1x - p0x;
          const ay = p1y - p0y;
          const az = p1z - p0z;
          const bx = p2x - p0x;
          const by = p2y - p0y;
          const bz = p2z - p0z;
          let nx = ay * bz - az * by;
          let ny = az * bx - ax * bz;
          let nz = ax * by - ay * bx;
          const len = Math.hypot(nx, ny, nz);
          if (len > 1e-6) {
            nx /= len;
            ny /= len;
            nz /= len;
          } else {
            nx = 0;
            ny = 0;
            nz = 1;
          }
          for (let k = 0; k < 3; k++) {
            normals[nOffset++] = nx;
            normals[nOffset++] = ny;
            normals[nOffset++] = nz;
          }
        }
      }
    } else {
      // Non-indexed: clamp to full triangles (multiples of 9 floats)
      const count = Math.floor(posArr.length / 9) * 9;
      const hasNormals = normArr && normArr.length >= count;
      for (let i = 0; i < count; i++) {
        positions[pOffset++] = posArr[i];
      }
      if (hasNormals) {
        for (let i = 0; i < count; i++) {
          normals[nOffset++] = normArr[i];
        }
      } else {
        for (let i = 0; i < count; i += 9) {
          const p0x = posArr[i];
          const p0y = posArr[i + 1];
          const p0z = posArr[i + 2];
          const p1x = posArr[i + 3];
          const p1y = posArr[i + 4];
          const p1z = posArr[i + 5];
          const p2x = posArr[i + 6];
          const p2y = posArr[i + 7];
          const p2z = posArr[i + 8];
          const ax = p1x - p0x;
          const ay = p1y - p0y;
          const az = p1z - p0z;
          const bx = p2x - p0x;
          const by = p2y - p0y;
          const bz = p2z - p0z;
          let nx = ay * bz - az * by;
          let ny = az * bx - ax * bz;
          let nz = ax * by - ay * bx;
          const len = Math.hypot(nx, ny, nz);
          if (len > 1e-6) {
            nx /= len;
            ny /= len;
            nz /= len;
          } else {
            nx = 0;
            ny = 0;
            nz = 1;
          }
          for (let k = 0; k < 3; k++) {
            normals[nOffset++] = nx;
            normals[nOffset++] = ny;
            normals[nOffset++] = nz;
          }
        }
      }
    }
  }

  return { positions, normals };
}

let cachedOcctInstance: OcctInstance | null = null;

async function getOcctInstance(): Promise<OcctInstance> {
  if (cachedOcctInstance) return cachedOcctInstance;
  // @ts-expect-error occt-import-js does not provide bundled types
  const occtModule = await import('occt-import-js');
  const initOcct = (occtModule.default || occtModule) as (options?: {
    locateFile?: (path: string) => string;
  }) => Promise<OcctInstance>;

  let occtOptions: { locateFile?: (path: string) => string } | undefined =
    undefined;
  // Browser / worker environment wasm resolution
  const isBrowserOrWorker =
    typeof window !== 'undefined' ||
    (typeof self !== 'undefined' && 'importScripts' in self);

  if (isBrowserOrWorker) {
    const baseUrl =
      (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) ||
      '/cadam/';
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    occtOptions = {
      locateFile: (path: string) => {
        if (path.endsWith('.wasm')) {
          return `${normalizedBase}occt-import-js.wasm`;
        }
        return path;
      },
    };
  }

  cachedOcctInstance = await initOcct(occtOptions || undefined);
  return cachedOcctInstance;
}

/**
 * Direct parsing execution for CAD ArrayBuffers (STEP, IGES, STL).
 * Used directly in Node test environments and inside the Web Worker.
 */
export async function parseCadBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  overrideFileType?: CadFileType,
): Promise<CadTessellationResult> {
  const fileType = overrideFileType || detectCadFileType(fileName);
  if (!fileType) {
    throw new Error(
      `Unsupported CAD file format for "${fileName}". Expected .step, .stp, .iges, .igs, or .stl`,
    );
  }

  let positions: Float32Array;
  let normals: Float32Array;
  let tessellatedStlBytes: Uint8Array | undefined;

  if (fileType === 'stl') {
    const { STLLoader } = await import(
      'three/examples/jsm/loaders/STLLoader.js'
    );
    const loader = new STLLoader();
    const geometry = loader.parse(buffer);

    if (!geometry.attributes.normal) {
      geometry.computeVertexNormals();
    }

    positions = new Float32Array(geometry.attributes.position.array);
    normals = new Float32Array(geometry.attributes.normal.array);
    tessellatedStlBytes = new Uint8Array(buffer);
  } else {
    // STEP or IGES via OpenCASCADE (occt-import-js)
    const occt = await getOcctInstance();
    const fileBytes = new Uint8Array(buffer);
    const result =
      fileType === 'step'
        ? occt.ReadStepFile(fileBytes, null)
        : occt.ReadIgesFile(fileBytes, null);

    if (!result || !result.success) {
      throw new Error(
        `Failed to parse ${fileType.toUpperCase()} file: "${fileName}"`,
      );
    }

    const extracted = extractMeshesToBuffers(result.meshes || []);
    positions = extracted.positions;
    normals = extracted.normals;
    tessellatedStlBytes = exportBinaryStl(positions, normals);
  }

  const bounds = computeCadBounds(positions);
  const triangleCount = Math.floor(positions.length / 9);

  return {
    positions,
    normals,
    metadata: {
      fileName,
      fileSize: buffer.byteLength,
      fileType,
      bounds,
      holes: [], // Populated by cadFeatureExtractor
      planes: [], // Populated by cadFeatureExtractor
      triangleCount,
      tessellatedStlBytes,
    },
  };
}

let customWorkerFactory: (() => Worker) | null = null;
let workerInstance: Worker | null = null;
const pendingRequests = new Map<
  string,
  {
    resolve: (result: CadTessellationResult) => void;
    reject: (error: Error) => void;
  }
>();

/**
 * Injects a custom Worker factory (useful for unit testing or custom environments).
 */
export function setCadWorkerFactory(factory: (() => Worker) | null): void {
  if (workerInstance) {
    try {
      workerInstance.terminate();
    } catch {
      // ignore
    }
    workerInstance = null;
  }
  customWorkerFactory = factory;
}

/**
 * Creates a new CAD import Web Worker.
 */
export function createCadImportWorker(): Worker {
  if (customWorkerFactory) {
    return customWorkerFactory();
  }
  return new Worker(new URL('../workers/cadImportWorker.ts', import.meta.url), {
    type: 'module',
  });
}

function getCadWorker(): Worker {
  if (workerInstance) return workerInstance;
  workerInstance = createCadImportWorker();

  workerInstance.addEventListener(
    'message',
    (event: MessageEvent<CadImportWorkerResponse>) => {
      const data = event.data;
      if (!data || !data.id) return;
      const pending = pendingRequests.get(data.id);
      if (!pending) return;
      pendingRequests.delete(data.id);

      if (data.success) {
        pending.resolve(data.result);
      } else {
        pending.reject(new Error(data.error || 'CAD worker failed'));
      }
    },
  );

  workerInstance.addEventListener('error', (event) => {
    const errorMsg =
      'message' in event && typeof event.message === 'string'
        ? event.message
        : 'CAD worker encountered an error';
    const err = new Error(errorMsg);
    pendingRequests.forEach((p) => p.reject(err));
    pendingRequests.clear();
    if (workerInstance) {
      try {
        workerInstance.terminate();
      } catch {
        // ignore
      }
      workerInstance = null;
    }
  });

  return workerInstance;
}

/**
 * Dispatches a CAD file buffer to the worker pipeline.
 */
export async function runCadWorker(
  fileBuffer: ArrayBuffer,
  fileName: string,
  fileType: CadFileType,
): Promise<CadTessellationResult> {
  const worker = getCadWorker();
  const id = `cad-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  return new Promise<CadTessellationResult>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    const message: CadImportWorkerRequest = {
      id,
      fileName,
      fileBuffer,
      fileType,
    };
    worker.postMessage(message, [fileBuffer]);
  });
}

/**
 * Main client entrypoint for importing and tessellating a CAD reference file.
 * Handles validation, spawns Web Worker in browser environments, and provides
 * direct fallback in Node test environments.
 */
export async function importCadReferenceFile(
  file:
    | File
    | { name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> },
): Promise<CadTessellationResult> {
  const fileType = detectCadFileType(file.name);
  if (!fileType) {
    throw new Error(
      `Unsupported CAD file format: "${file.name}". Expected .step, .stp, .iges, .igs, or .stl`,
    );
  }

  const arrayBuffer = await file.arrayBuffer();

  if (customWorkerFactory || typeof Worker !== 'undefined') {
    return runCadWorker(arrayBuffer, file.name, fileType);
  }

  return parseCadBuffer(arrayBuffer, file.name, fileType);
}
