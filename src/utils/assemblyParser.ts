export interface AssemblyPart {
  id: string;
  name: string;
  moduleName?: string;
  color?: string;
  explodeVector: [number, number, number];
  description?: string;
}

export interface AssemblyManifest {
  explodeDistanceMm: number;
  parts: AssemblyPart[];
}

export interface RuntimeAssemblyPart extends AssemblyPart {
  colorHex: string;
  meshIndex: number;
  triangleCount: number;
  center: [number, number, number];
  visible: boolean;
  isolated: boolean;
}

export interface MeshChildLike {
  geometry?: {
    attributes?: {
      position?: {
        array?: ArrayLike<number>;
      };
    };
  };
  material?: {
    color?: {
      getHexString?: () => string;
    };
  };
}

export interface MeshGroupLike {
  children?: MeshChildLike[] | readonly MeshChildLike[] | unknown[];
}

export function calculateExplodedOffset(
  vector: [number, number, number],
  fraction: number,
  distanceMm: number,
): [number, number, number] {
  let [x, y, z] = vector;
  const mag = Math.sqrt(x * x + y * y + z * z);
  if (mag <= 0.0001) {
    x = 0;
    y = 0;
    z = 1;
  } else {
    x /= mag;
    y /= mag;
    z /= mag;
  }
  const scaled = fraction * distanceMm;
  return [x * scaled, y * scaled, z * scaled];
}

export function inferAssemblyFromCodeAndMeshes(
  scadCode: string,
  meshGroup: MeshGroupLike,
  explicitManifest?: AssemblyManifest,
): RuntimeAssemblyPart[] {
  const meshes = (meshGroup.children || []) as MeshChildLike[];
  if (meshes.length === 0) return [];

  // Compute centers and triangle counts for each mesh child
  const meshStats = meshes.map((mesh, index) => {
    let hex = '888888';
    if (mesh.material?.color?.getHexString) {
      hex = mesh.material.color.getHexString();
    }
    const pos = mesh.geometry?.attributes?.position?.array;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let triCount = 0;
    if (pos && pos.length >= 9) {
      triCount = Math.floor(pos.length / 9);
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let i = 0; i < pos.length; i += 3) {
        sx += pos[i];
        sy += pos[i + 1];
        sz += pos[i + 2];
      }
      const count = pos.length / 3;
      cx = sx / count;
      cy = sy / count;
      cz = sz / count;
    }
    return {
      index,
      colorHex: hex.startsWith('#') ? hex : `#${hex}`,
      triangleCount: triCount,
      center: [cx, cy, cz] as [number, number, number],
    };
  });

  // Calculate overall assembly center
  let assemblyZSum = 0;
  for (const s of meshStats) {
    assemblyZSum += s.center[2];
  }
  const avgAssemblyZ =
    meshStats.length > 0 ? assemblyZSum / meshStats.length : 0;

  if (explicitManifest && explicitManifest.parts.length > 0) {
    return explicitManifest.parts.map((p, i) => {
      const stat = meshStats[i] || meshStats[meshStats.length - 1];
      return {
        ...p,
        colorHex: p.color || stat.colorHex,
        meshIndex: stat.index,
        triangleCount: stat.triangleCount,
        center: stat.center,
        visible: true,
        isolated: false,
      };
    });
  }

  // Fallback: Scan modules from OpenSCAD code
  const moduleRegex = /^\s*module\s+([a-zA-Z0-9_]+)\s*\(/gm;
  const detectedModules: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = moduleRegex.exec(scadCode)) !== null) {
    if (!detectedModules.includes(m[1])) {
      detectedModules.push(m[1]);
    }
  }

  return meshStats.map((stat, i) => {
    const mod = detectedModules[i] || `part_${i + 1}`;
    const name =
      mod
        .replace(/^part_|_part$/g, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase()) || `Component ${i + 1}`;

    // Vector heuristic: top parts move up [0,0,1], bottom parts move down [0,0,-1]
    const explodeVector: [number, number, number] =
      stat.center[2] >= avgAssemblyZ ? [0, 0, 1] : [0, 0, -1];

    return {
      id: mod,
      name,
      moduleName: mod,
      colorHex: stat.colorHex,
      explodeVector,
      meshIndex: stat.index,
      triangleCount: stat.triangleCount,
      center: stat.center,
      visible: true,
      isolated: false,
    };
  });
}
