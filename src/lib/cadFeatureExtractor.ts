import type {
  CadFileType,
  CadHoleFeature,
  CadMatingPlane,
  CadReferenceBounds,
  CadReferenceMetadata,
} from '@/types/cadReference';

/**
 * Rounds a floating-point number to 4 decimal places for stable geometric representations.
 */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Computes axis-aligned bounding box and dimensions from vertex position array.
 * Positions is a flat Float32Array where every 3 floats represent [x, y, z].
 */
export function computeBounds(positions: Float32Array): CadReferenceBounds {
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

interface PlaneCluster {
  normal: [number, number, number];
  offset: number;
  totalArea: number;
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
  sumOffset: number;
  pointCount: number;
  sumX: number;
  sumY: number;
  sumZ: number;
}

/**
 * Projects a 3D point onto the 2D plane according to dominant normal axis.
 */
function projectUV(
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
): [number, number] {
  if (Math.abs(nz) >= Math.abs(nx) && Math.abs(nz) >= Math.abs(ny)) {
    return [x, y];
  } else if (Math.abs(ny) >= Math.abs(nx) && Math.abs(ny) >= Math.abs(nz)) {
    return [x, z];
  } else {
    return [y, z];
  }
}

/**
 * Groups coplanar triangles within a 0.02 dot product tolerance and detects
 * prominent mating planes covering >5% of the total mesh surface area.
 */
export function detectMatingPlanes(
  positions: Float32Array,
  _normals?: Float32Array,
): CadMatingPlane[] {
  const triangleCount = Math.floor(positions.length / 9);
  if (triangleCount === 0) return [];

  const clusters: PlaneCluster[] = [];
  let totalSurfaceArea = 0;

  for (let i = 0; i < triangleCount; i++) {
    const pIdx = i * 9;
    const x0 = positions[pIdx];
    const y0 = positions[pIdx + 1];
    const z0 = positions[pIdx + 2];
    const x1 = positions[pIdx + 3];
    const y1 = positions[pIdx + 4];
    const z1 = positions[pIdx + 5];
    const x2 = positions[pIdx + 6];
    const y2 = positions[pIdx + 7];
    const z2 = positions[pIdx + 8];

    // Compute cross product of edges
    const ux = x1 - x0;
    const uy = y1 - y0;
    const uz = z1 - z0;
    const vx = x2 - x0;
    const vy = y2 - y0;
    const vz = z2 - z0;

    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;

    const len = Math.hypot(cx, cy, cz);
    if (len < 1e-8) continue; // Degenerate triangle

    const area = 0.5 * len;
    totalSurfaceArea += area;

    const nx = cx / len;
    const ny = cy / len;
    const nz = cz / len;

    // Plane offset d = n . point
    const centroidX = (x0 + x1 + x2) / 3;
    const centroidY = (y0 + y1 + y2) / 3;
    const centroidZ = (z0 + z1 + z2) / 3;
    const offset = nx * centroidX + ny * centroidY + nz * centroidZ;

    // Find matching cluster (dot product >= 0.98, i.e. within 0.02 dot tolerance)
    let matchedCluster: PlaneCluster | null = null;
    for (const cluster of clusters) {
      const dot =
        nx * cluster.normal[0] +
        ny * cluster.normal[1] +
        nz * cluster.normal[2];
      if (dot >= 0.98 && Math.abs(offset - cluster.offset) < 0.15) {
        matchedCluster = cluster;
        break;
      }
    }

    const [u0, v0] = projectUV(x0, y0, z0, nx, ny, nz);
    const [u1, v1] = projectUV(x1, y1, z1, nx, ny, nz);
    const [u2, v2] = projectUV(x2, y2, z2, nx, ny, nz);
    const triMinU = Math.min(u0, u1, u2);
    const triMaxU = Math.max(u0, u1, u2);
    const triMinV = Math.min(v0, v1, v2);
    const triMaxV = Math.max(v0, v1, v2);

    if (matchedCluster) {
      const newArea = matchedCluster.totalArea + area;
      const w1 = matchedCluster.totalArea / newArea;
      const w2 = area / newArea;

      let avgNx = matchedCluster.normal[0] * w1 + nx * w2;
      let avgNy = matchedCluster.normal[1] * w1 + ny * w2;
      let avgNz = matchedCluster.normal[2] * w1 + nz * w2;
      const avgLen = Math.hypot(avgNx, avgNy, avgNz);
      if (avgLen > 1e-6) {
        avgNx /= avgLen;
        avgNy /= avgLen;
        avgNz /= avgLen;
      }

      matchedCluster.normal = [avgNx, avgNy, avgNz];
      matchedCluster.offset = matchedCluster.offset * w1 + offset * w2;
      matchedCluster.totalArea = newArea;
      matchedCluster.minU = Math.min(matchedCluster.minU, triMinU);
      matchedCluster.maxU = Math.max(matchedCluster.maxU, triMaxU);
      matchedCluster.minV = Math.min(matchedCluster.minV, triMinV);
      matchedCluster.maxV = Math.max(matchedCluster.maxV, triMaxV);
      matchedCluster.sumOffset += offset * 3;
      matchedCluster.pointCount += 3;
      matchedCluster.sumX += x0 + x1 + x2;
      matchedCluster.sumY += y0 + y1 + y2;
      matchedCluster.sumZ += z0 + z1 + z2;
    } else {
      clusters.push({
        normal: [nx, ny, nz],
        offset,
        totalArea: area,
        minU: triMinU,
        maxU: triMaxU,
        minV: triMinV,
        maxV: triMaxV,
        sumOffset: offset * 3,
        pointCount: 3,
        sumX: x0 + x1 + x2,
        sumY: y0 + y1 + y2,
        sumZ: z0 + z1 + z2,
      });
    }
  }

  // Filter prominent planes covering > 5% of total surface area
  const thresholdArea = totalSurfaceArea * 0.05;
  const prominentClusters = clusters.filter(
    (c) => c.totalArea >= thresholdArea,
  );

  // Sort by area descending
  prominentClusters.sort((a, b) => b.totalArea - a.totalArea);

  const planes: CadMatingPlane[] = [];

  prominentClusters.forEach((cluster, idx) => {
    let [nx, ny, nz] = cluster.normal;

    // Snap to standard axes if within 0.02 dot tolerance
    if (Math.abs(Math.abs(nx) - 1) < 0.02) {
      nx = Math.sign(nx);
      ny = 0;
      nz = 0;
    } else if (Math.abs(Math.abs(ny) - 1) < 0.02) {
      nx = 0;
      ny = Math.sign(ny);
      nz = 0;
    } else if (Math.abs(Math.abs(nz) - 1) < 0.02) {
      nx = 0;
      ny = 0;
      nz = Math.sign(nz);
    }

    // Determine plane name
    let name = `Plane ${idx + 1}`;
    if (nz === 1) name = 'Top Plane (+Z)';
    else if (nz === -1) name = 'Bottom Plane (-Z)';
    else if (ny === 1) name = 'Back Face (+Y)';
    else if (ny === -1) name = 'Front Face (-Y)';
    else if (nx === 1) name = 'Right Face (+X)';
    else if (nx === -1) name = 'Left Face (-X)';
    else {
      name = `Plane (${round4(nx)}, ${round4(ny)}, ${round4(nz)})`;
    }

    // Recompute offset using snapped normal and average vertex position
    const finalOffset =
      cluster.pointCount > 0
        ? (cluster.sumX * nx + cluster.sumY * ny + cluster.sumZ * nz) /
          cluster.pointCount
        : cluster.offset;

    planes.push({
      id: `plane-${idx + 1}`,
      name,
      normal: [round4(nx), round4(ny), round4(nz)],
      offset: round4(finalOffset),
      bounds: {
        min: [round4(cluster.minU), round4(cluster.minV)],
        max: [round4(cluster.maxU), round4(cluster.maxV)],
      },
    });
  });

  return planes;
}

interface DetectedLoop {
  center: [number, number, number];
  axis: [number, number, number];
  radius: number;
}

/**
 * Detects cylindrical features and holes in tessellated meshes.
 * Finds circular vertex loops with constant radial distance (stdDev < 0.2mm)
 * and pairs them into through-holes or single blind holes.
 */
export function detectCylindricalHoles(
  positions: Float32Array,
  _normals?: Float32Array,
): CadHoleFeature[] {
  const triangleCount = Math.floor(positions.length / 9);
  if (triangleCount === 0) return [];

  // Quantize vertex coordinates to map identical vertices
  const coordKey = (x: number, y: number, z: number) =>
    `${Math.round(x * 1000) / 1000},${Math.round(y * 1000) / 1000},${Math.round(z * 1000) / 1000}`;

  const vertexMap = new Map<string, number>();
  const vertices: [number, number, number][] = [];

  function getVertexId(x: number, y: number, z: number): number {
    const key = coordKey(x, y, z);
    let id = vertexMap.get(key);
    if (id === undefined) {
      id = vertices.length;
      vertexMap.set(key, id);
      vertices.push([x, y, z]);
    }
    return id;
  }

  // Build edge-to-triangles map
  interface EdgeInfo {
    v0: number;
    v1: number;
    normals: [number, number, number][];
  }
  const edgeMap = new Map<string, EdgeInfo>();

  for (let i = 0; i < triangleCount; i++) {
    const pIdx = i * 9;
    const v0 = getVertexId(
      positions[pIdx],
      positions[pIdx + 1],
      positions[pIdx + 2],
    );
    const v1 = getVertexId(
      positions[pIdx + 3],
      positions[pIdx + 4],
      positions[pIdx + 5],
    );
    const v2 = getVertexId(
      positions[pIdx + 6],
      positions[pIdx + 7],
      positions[pIdx + 8],
    );

    // Compute geometric normal of triangle
    const p0 = vertices[v0];
    const p1 = vertices[v1];
    const p2 = vertices[v2];

    const ux = p1[0] - p0[0];
    const uy = p1[1] - p0[1];
    const uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0];
    const vy = p2[1] - p0[1];
    const vz = p2[2] - p0[2];

    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    const len = Math.hypot(cx, cy, cz);
    const normal: [number, number, number] =
      len > 1e-8 ? [cx / len, cy / len, cz / len] : [0, 0, 1];

    const triEdges = [
      [Math.min(v0, v1), Math.max(v0, v1)],
      [Math.min(v1, v2), Math.max(v1, v2)],
      [Math.min(v2, v0), Math.max(v2, v0)],
    ];

    for (const [ea, eb] of triEdges) {
      const eKey = `${ea}_${eb}`;
      let edge = edgeMap.get(eKey);
      if (!edge) {
        edge = { v0: ea, v1: eb, normals: [] };
        edgeMap.set(eKey, edge);
      }
      edge.normals.push(normal);
    }
  }

  // Filter sharp / boundary edges
  // Sharp edge: either boundary (1 triangle) or dot product between normals < 0.85 (angle > ~31 deg)
  const adj = new Map<number, Set<number>>();
  function addAdj(u: number, v: number) {
    if (!adj.has(u)) adj.set(u, new Set());
    if (!adj.has(v)) adj.set(v, new Set());
    adj.get(u)!.add(v);
    adj.get(v)!.add(u);
  }

  for (const edge of edgeMap.values()) {
    if (edge.normals.length === 1) {
      addAdj(edge.v0, edge.v1);
    } else if (edge.normals.length >= 2) {
      const n0 = edge.normals[0];
      const n1 = edge.normals[1];
      const dot = n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2];
      if (dot < 0.85) {
        addAdj(edge.v0, edge.v1);
      }
    }
  }

  // Trace closed cycles in the sharp edge graph
  const visitedEdges = new Set<string>();
  const edgeKey = (u: number, v: number) => (u < v ? `${u}_${v}` : `${v}_${u}`);
  const cycles: number[][] = [];

  for (const [startNode, neighbors] of adj) {
    for (const nextNode of neighbors) {
      const initialEdge = edgeKey(startNode, nextNode);
      if (visitedEdges.has(initialEdge)) continue;

      const path: number[] = [startNode];
      let curr = nextNode;
      let prev = startNode;
      visitedEdges.add(initialEdge);
      let isClosed = false;

      while (true) {
        path.push(curr);
        const currNeighbors = adj.get(curr);
        if (!currNeighbors) break;

        let next: number | null = null;
        for (const cand of currNeighbors) {
          if (cand === prev) continue;
          const eK = edgeKey(curr, cand);
          if (!visitedEdges.has(eK)) {
            next = cand;
            break;
          } else if (cand === startNode && path.length >= 3) {
            next = cand;
            break;
          }
        }

        if (next === null) break;

        if (next === startNode) {
          visitedEdges.add(edgeKey(curr, next));
          isClosed = true;
          break;
        }

        visitedEdges.add(edgeKey(curr, next));
        prev = curr;
        curr = next;

        if (path.length > 5000) break; // Infinite loop guard
      }

      if (isClosed && path.length >= 6) {
        cycles.push(path);
      }
    }
  }

  // Analyze cycles to find circular loops with stdDev < 0.2mm
  const detectedLoops: DetectedLoop[] = [];

  for (const cycle of cycles) {
    const k = cycle.length;
    let cx = 0;
    let cy = 0;
    let cz = 0;

    for (const vId of cycle) {
      const [x, y, z] = vertices[vId];
      cx += x;
      cy += y;
      cz += z;
    }
    cx /= k;
    cy /= k;
    cz /= k;

    // Newell's method for loop normal
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i < k; i++) {
      const curr = vertices[cycle[i]];
      const next = vertices[cycle[(i + 1) % k]];
      nx += (curr[1] - next[1]) * (curr[2] + next[2]);
      ny += (curr[2] - next[2]) * (curr[0] + next[0]);
      nz += (curr[0] - next[0]) * (curr[1] + next[1]);
    }
    const nLen = Math.hypot(nx, ny, nz);
    if (nLen < 1e-6) continue;
    nx /= nLen;
    ny /= nLen;
    nz /= nLen;

    // Check planarity and compute radial distances from centroid
    const radii: number[] = [];
    let sumRadius = 0;
    let isCoplanar = true;

    for (const vId of cycle) {
      const [x, y, z] = vertices[vId];
      const dx = x - cx;
      const dy = y - cy;
      const dz = z - cz;

      const planeDist = Math.abs(dx * nx + dy * ny + dz * nz);
      if (planeDist > 0.5) {
        isCoplanar = false;
        break;
      }

      const perpX = dx - (dx * nx + dy * ny + dz * nz) * nx;
      const perpY = dy - (dx * nx + dy * ny + dz * nz) * ny;
      const perpZ = dz - (dx * nx + dy * ny + dz * nz) * nz;
      const r = Math.hypot(perpX, perpY, perpZ);
      radii.push(r);
      sumRadius += r;
    }

    if (!isCoplanar) continue;

    const meanRadius = sumRadius / k;
    if (meanRadius < 0.2) continue; // Noise filter

    // Standard deviation of radial distances
    let sumSqDiff = 0;
    for (const r of radii) {
      sumSqDiff += (r - meanRadius) * (r - meanRadius);
    }
    const stdDev = Math.sqrt(sumSqDiff / k);

    // Constant radial distance tolerance: stdDev < 0.2mm
    if (stdDev < 0.2) {
      let axis: [number, number, number] = [nx, ny, nz];

      // Orient axis so dominant component is positive
      if (
        Math.abs(axis[0]) >= Math.abs(axis[1]) &&
        Math.abs(axis[0]) >= Math.abs(axis[2])
      ) {
        if (axis[0] < 0) axis = [-axis[0], -axis[1], -axis[2]];
      } else if (
        Math.abs(axis[1]) >= Math.abs(axis[0]) &&
        Math.abs(axis[1]) >= Math.abs(axis[2])
      ) {
        if (axis[1] < 0) axis = [-axis[0], -axis[1], -axis[2]];
      } else {
        if (axis[2] < 0) axis = [-axis[0], -axis[1], -axis[2]];
      }

      // Snap axis to principal axis if very close
      if (Math.abs(Math.abs(axis[0]) - 1) < 0.05)
        axis = [Math.sign(axis[0]), 0, 0];
      else if (Math.abs(Math.abs(axis[1]) - 1) < 0.05)
        axis = [0, Math.sign(axis[1]), 0];
      else if (Math.abs(Math.abs(axis[2]) - 1) < 0.05)
        axis = [0, 0, Math.sign(axis[2])];

      detectedLoops.push({
        center: [round4(cx), round4(cy), round4(cz)],
        axis: [round4(axis[0]), round4(axis[1]), round4(axis[2])],
        radius: round4(meanRadius),
      });
    }
  }

  // Pair coaxial loops into through-holes or single blind holes
  const usedLoops = new Set<number>();
  const holes: CadHoleFeature[] = [];

  for (let i = 0; i < detectedLoops.length; i++) {
    if (usedLoops.has(i)) continue;
    const loop1 = detectedLoops[i];

    let bestPairIdx = -1;
    let bestPairDist = Infinity;

    for (let j = i + 1; j < detectedLoops.length; j++) {
      if (usedLoops.has(j)) continue;
      const loop2 = detectedLoops[j];

      // Radius match within 0.2mm
      if (Math.abs(loop1.radius - loop2.radius) > 0.2) continue;

      // Axis alignment dot product > 0.95
      const dotAxis =
        loop1.axis[0] * loop2.axis[0] +
        loop1.axis[1] * loop2.axis[1] +
        loop1.axis[2] * loop2.axis[2];
      if (Math.abs(dotAxis) < 0.95) continue;

      // Check center displacement perpendicular to axis
      const dx = loop2.center[0] - loop1.center[0];
      const dy = loop2.center[1] - loop1.center[1];
      const dz = loop2.center[2] - loop1.center[2];

      const proj = dx * loop1.axis[0] + dy * loop1.axis[1] + dz * loop1.axis[2];
      const perpX = dx - proj * loop1.axis[0];
      const perpY = dy - proj * loop1.axis[1];
      const perpZ = dz - proj * loop1.axis[2];
      const perpDist = Math.hypot(perpX, perpY, perpZ);

      if (perpDist < 0.2) {
        const distAlongAxis = Math.abs(proj);
        if (distAlongAxis > 0.1 && distAlongAxis < bestPairDist) {
          bestPairDist = distAlongAxis;
          bestPairIdx = j;
        }
      }
    }

    if (bestPairIdx !== -1) {
      usedLoops.add(i);
      usedLoops.add(bestPairIdx);
      const loop2 = detectedLoops[bestPairIdx];

      const center: [number, number, number] = [
        round4((loop1.center[0] + loop2.center[0]) / 2),
        round4((loop1.center[1] + loop2.center[1]) / 2),
        round4((loop1.center[2] + loop2.center[2]) / 2),
      ];
      const radius = round4((loop1.radius + loop2.radius) / 2);
      const diameter = round4(radius * 2);
      const depth = round4(bestPairDist);

      holes.push({
        id: `hole-${holes.length + 1}`,
        center,
        axis: loop1.axis,
        radius,
        diameter,
        depth,
        isThroughHole: true,
      });
    } else {
      usedLoops.add(i);
      const radius = loop1.radius;
      const diameter = round4(radius * 2);
      holes.push({
        id: `hole-${holes.length + 1}`,
        center: loop1.center,
        axis: loop1.axis,
        radius,
        diameter,
        isThroughHole: false,
      });
    }
  }

  return holes;
}

/**
 * Main feature extraction entrypoint. Extracts bounding extents, prominent mating planes,
 * and cylindrical hole features from raw tessellated CAD geometry.
 */
export function extractCadFeatures(
  positions: Float32Array,
  normals: Float32Array,
  fileName: string,
  fileSize: number,
  fileType: CadFileType,
  tessellatedStlBytes?: Uint8Array,
): CadReferenceMetadata {
  const bounds = computeBounds(positions);
  const planes = detectMatingPlanes(positions, normals);
  const holes = detectCylindricalHoles(positions, normals);
  const triangleCount = Math.floor(positions.length / 9);

  return {
    fileName,
    fileSize,
    fileType,
    bounds,
    holes,
    planes,
    triangleCount,
    tessellatedStlBytes,
  };
}
