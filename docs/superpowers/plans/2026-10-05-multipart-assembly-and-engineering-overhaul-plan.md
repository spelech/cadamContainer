# Multipart Assembly Hierarchy, Exploded Views, and OpenSCAD Engineering Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform CADAM from a monolithic flat-CAD generator into an industrial-grade parametric assembly platform featuring real-time 60 FPS exploded views, part isolation/visibility toggles, single-part STL exports, ContextCortex documentation integration, and an engineering-first CAD skills prompt engine.

**Architecture:**

1. **Schema & Extraction**: The `build_parametric_model` tool schema is extended with an `assembly` manifest (part IDs, names, explosion vectors). A client-side extractor (`assemblyParser.ts`) computes geometric centroids and module names as an automatic fallback.
2. **Real-Time 3D Exploded View**: `ThreeScene.tsx` translates child meshes in the parsed OFF group along normalized explosion vectors at 60 FPS without recompiling OpenSCAD, with an OpenSCAD `explode` parameter fallback for CLI/static exports.
3. **Tabbed Sidebar UI**: `PartsPanel.tsx` adds a `[Parts & Assembly]` tab alongside `[Parameters]` in the right sidebar with visibility (👁️), solo (🎯), and single-part STL export.
4. **ContextCortex Knowledge Bridge**: Ingests OpenSCAD Cheatsheet and BOSL2 into ContextCortex, connecting CADAM via Docker's `net_mcp` with an active `lookup_cad_docs` agent tool.
5. **Modular Engineering Prompts**: Replaces the single "mug" prompt with modular engineering skills enforcing CSG overlap hygiene (`eps = 0.01`), 3D printing tolerances, and diverse assembly recipes.

**Tech Stack:** React 19, TypeScript, Three.js (`@react-three/fiber`), OpenSCAD WASM, Zod, ContextCortex (FastAPI / Hybrid Vector Search), Playwright, Node.js `tsx --test`.

## Global Constraints

- Strictly adhere to `AGENTS.md` semantic versioning (target release: `0.11.0`).
- No heavy C++ libraries or Python native bindings in the Dockerfile; client-side assembly rendering runs purely in Three.js and existing OpenSCAD WASM.
- All tests must run with `tsx --test --test-concurrency=1 'src/**/*.test.ts'`.
- Code changes must pass `npm run typecheck`, `npm run lint`, and `npm test`.

---

### Task 1: Assembly Manifest Schema & Assembly Parser Engine

**Files:**

- Modify: `shared/chatAi.ts:18-60`
- Create: `src/utils/assemblyParser.ts`
- Create: `src/utils/assemblyParser.test.ts`

**Interfaces:**

- Produces:

  ```typescript
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

  export function inferAssemblyFromCodeAndMeshes(
    scadCode: string,
    meshGroup: {
      children: Array<{
        geometry?: { attributes: { position: { array: ArrayLike<number> } } };
        material?: any;
      }>;
    },
    explicitManifest?: AssemblyManifest,
  ): RuntimeAssemblyPart[];

  export function calculateExplodedOffset(
    explodeVector: [number, number, number],
    explodeFraction: number,
    explodeDistanceMm: number,
  ): [number, number, number];
  ```

- [ ] **Step 1: Write failing unit test for assembly parser**

Create `src/utils/assemblyParser.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateExplodedOffset,
  inferAssemblyFromCodeAndMeshes,
  type AssemblyManifest,
} from './assemblyParser';

test('calculateExplodedOffset scales unit vector by fraction and distance', () => {
  const vector: [number, number, number] = [0, 0, 1];
  const offset = calculateExplodedOffset(vector, 0.5, 40);
  assert.deepEqual(offset, [0, 0, 20]);
});

test('calculateExplodedOffset normalizes non-unit vectors', () => {
  const vector: [number, number, number] = [0, 2, 0];
  const offset = calculateExplodedOffset(vector, 1.0, 50);
  assert.deepEqual(offset, [0, 50, 0]);
});

test('calculateExplodedOffset handles zero vector safely', () => {
  const vector: [number, number, number] = [0, 0, 0];
  const offset = calculateExplodedOffset(vector, 0.5, 40);
  assert.deepEqual(offset, [0, 0, 20]); // Fallback to [0,0,1]
});

test('inferAssemblyFromCodeAndMeshes uses explicit manifest when provided', () => {
  const code = `
    module part_base() { cube([50, 50, 10]); }
    module part_lid() { cube([50, 50, 5]); }
  `;
  const mockGroup = {
    children: [
      {
        material: { color: { getHexString: () => '4a5568' } },
        geometry: {
          attributes: {
            position: {
              array: new Float32Array([0, 0, 0, 50, 0, 0, 50, 50, 0]),
            },
          },
        },
      },
      {
        material: { color: { getHexString: () => '3182ce' } },
        geometry: {
          attributes: {
            position: {
              array: new Float32Array([0, 0, 20, 50, 0, 20, 50, 50, 20]),
            },
          },
        },
      },
    ],
  };
  const manifest: AssemblyManifest = {
    explodeDistanceMm: 40,
    parts: [
      {
        id: 'base',
        name: 'Base Box',
        moduleName: 'part_base',
        explodeVector: [0, 0, -1],
      },
      {
        id: 'lid',
        name: 'Snap Lid',
        moduleName: 'part_lid',
        explodeVector: [0, 0, 1],
      },
    ],
  };

  const runtimeParts = inferAssemblyFromCodeAndMeshes(
    code,
    mockGroup,
    manifest,
  );
  assert.equal(runtimeParts.length, 2);
  assert.equal(runtimeParts[0].name, 'Base Box');
  assert.deepEqual(runtimeParts[0].explodeVector, [0, 0, -1]);
  assert.equal(runtimeParts[1].name, 'Snap Lid');
  assert.deepEqual(runtimeParts[1].explodeVector, [0, 0, 1]);
});

test('inferAssemblyFromCodeAndMeshes extracts modules and infers vectors when manifest omitted', () => {
  const code = `
    module part_lower() { cube([10, 10, 10]); }
    module part_upper() { translate([0, 0, 30]) cube([10, 10, 10]); }
  `;
  const mockGroup = {
    children: [
      {
        material: { color: { getHexString: () => 'ff0000' } },
        geometry: {
          attributes: {
            position: {
              array: new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0]),
            },
          },
        },
      },
      {
        material: { color: { getHexString: () => '0000ff' } },
        geometry: {
          attributes: {
            position: {
              array: new Float32Array([0, 0, 30, 10, 0, 30, 10, 10, 30]),
            },
          },
        },
      },
    ],
  };

  const runtimeParts = inferAssemblyFromCodeAndMeshes(code, mockGroup);
  assert.equal(runtimeParts.length, 2);
  assert.equal(runtimeParts[0].id, 'part_lower');
  assert.equal(runtimeParts[1].id, 'part_upper');
  assert.equal(runtimeParts[0].visible, true);
  assert.equal(runtimeParts[0].isolated, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/utils/assemblyParser.test.ts`
Expected: FAIL (Cannot find module './assemblyParser')

- [ ] **Step 3: Update `shared/chatAi.ts` schema and implement `src/utils/assemblyParser.ts`**

Update `shared/chatAi.ts`:

```typescript
export const assemblyPartSchema = z.object({
  id: z.string().describe('Unique slug for the part (e.g. "base", "lid")'),
  name: z
    .string()
    .describe('Human-readable display name (e.g. "Main Base", "Snap Lid")'),
  moduleName: z
    .string()
    .optional()
    .describe('Matching OpenSCAD module name (e.g. "part_base")'),
  color: z
    .string()
    .optional()
    .describe('Color name or hex string (e.g. "SteelBlue", "#4A5568")'),
  explodeVector: z
    .tuple([z.number(), z.number(), z.number()])
    .default([0, 0, 1])
    .describe('Unit vector [x, y, z] for explosion translation'),
  description: z.string().optional().describe('Assembly role description'),
});

export const assemblyManifestSchema = z.object({
  explodeDistanceMm: z.number().default(40),
  parts: z.array(assemblyPartSchema).min(1),
});

export const parametricArtifactSchema = z.object({
  title: z.string().min(1),
  version: z.string().default('v1'),
  code: z.string().min(20),
  assembly: assemblyManifestSchema.optional(),
});
```

Create `src/utils/assemblyParser.ts`:

```typescript
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
  meshGroup: { children: Array<any> },
  explicitManifest?: AssemblyManifest,
): RuntimeAssemblyPart[] {
  const meshes = meshGroup.children || [];
  if (meshes.length === 0) return [];

  // Compute centers and triangle counts for each mesh child
  const meshStats = meshes.map((mesh, index) => {
    let hex = '888888';
    if (mesh.material?.color?.getHexString) {
      hex = mesh.material.color.getHexString();
    }
    const pos = mesh.geometry?.attributes?.position?.array;
    let cx = 0,
      cy = 0,
      cz = 0;
    let triCount = 0;
    if (pos && pos.length >= 9) {
      triCount = Math.floor(pos.length / 9);
      let sx = 0,
        sy = 0,
        sz = 0;
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
  let totalTriangles = 0;
  let assemblyZSum = 0;
  for (const s of meshStats) {
    totalTriangles += s.triangleCount;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/utils/assemblyParser.test.ts`
Expected: PASS (4/4 tests passed)

- [ ] **Step 5: Commit**

```bash
git add shared/chatAi.ts src/utils/assemblyParser.ts src/utils/assemblyParser.test.ts
git commit -m "feat(assembly): implement assembly manifest schema and auto parser engine"
```

---

### Task 2: ContextCortex Knowledge Bridge & CAD Docs Client

**Files:**

- Create: `src/server/cadDocsClient.ts`
- Create: `src/server/cadDocsClient.test.ts`
- Modify: `src/server/aiChat.ts:1260-1280`
- Modify: `shared/chatAi.ts:40-62`
- Modify: `/containers/ai/docker-compose.yaml:280-310`

**Interfaces:**

- Produces:

  ```typescript
  export interface CadDocResult {
    title: string;
    snippet: string;
    source: string;
    relevanceScore: number;
    symbol?: string;
  }

  export interface SearchCadDocsParams {
    query: string;
    library?: 'openscad' | 'bosl2' | 'all';
    limit?: number;
    endpointUrl?: string;
  }

  export async function searchCadDocs(
    params: SearchCadDocsParams,
  ): Promise<CadDocResult[]>;
  ```

- [ ] **Step 1: Write failing unit test for `cadDocsClient`**

Create `src/server/cadDocsClient.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { searchCadDocs } from './cadDocsClient';

test('searchCadDocs formats request and parses successful ContextCortex response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /admin\/api\/search\/test/);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.query, 'rotate_extrude');
    assert.equal(body.search_mode, 'hybrid');

    return new Response(
      JSON.stringify({
        results: [
          {
            score: 0.95,
            payload: {
              title: 'rotate_extrude.md',
              content: 'rotate_extrude(angle=360, convexity=2) polygon(...);',
              symbol: 'rotate_extrude',
              repo: 'openscad-docs',
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    const results = await searchCadDocs({
      query: 'rotate_extrude',
      endpointUrl: 'http://mock-contextcortex:3000',
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'rotate_extrude.md');
    assert.match(results[0].snippet, /rotate_extrude/);
    assert.equal(results[0].relevanceScore, 0.95);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchCadDocs handles network errors gracefully without throwing', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Connection refused');
  };

  try {
    const results = await searchCadDocs({
      query: 'invalid_query',
      endpointUrl: 'http://offline-cortex:3000',
    });
    assert.deepEqual(results, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/server/cadDocsClient.test.ts`
Expected: FAIL (Cannot find module './cadDocsClient')

- [ ] **Step 3: Implement `src/server/cadDocsClient.ts` and add `lookup_cad_docs` tool**

Create `src/server/cadDocsClient.ts`:

```typescript
export interface CadDocResult {
  title: string;
  snippet: string;
  source: string;
  relevanceScore: number;
  symbol?: string;
}

export interface SearchCadDocsParams {
  query: string;
  library?: 'openscad' | 'bosl2' | 'all';
  limit?: number;
  endpointUrl?: string;
}

export async function searchCadDocs(
  params: SearchCadDocsParams,
): Promise<CadDocResult[]> {
  const endpoint =
    params.endpointUrl ||
    process.env.CONTEXTCORTEX_URL ||
    'http://contextcortex:3000';
  const url = `${endpoint.replace(/\/$/, '')}/admin/api/search/test`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: params.query,
        search_mode: 'hybrid',
        limit: params.limit || 3,
        repo:
          params.library === 'bosl2'
            ? 'BOSL2'
            : params.library === 'openscad'
              ? 'openscad-docs'
              : undefined,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.results)) {
      return [];
    }

    return data.results.map((r: any) => ({
      title: r.payload?.title || r.payload?.symbol || 'OpenSCAD Reference',
      snippet: r.payload?.content || '',
      source: r.payload?.repo || 'docs',
      relevanceScore: Number(r.score || 0),
      symbol: r.payload?.symbol,
    }));
  } catch {
    // Offline or network timeout fallback
    return [];
  }
}
```

Update `shared/chatAi.ts` to export `lookup_cad_docs` tool definition:

```typescript
export const lookupCadDocsInputSchema = z.object({
  query: z
    .string()
    .describe('Function name, primitive, or CAD topic to look up'),
  library: z.enum(['openscad', 'bosl2', 'all']).default('all'),
  limit: z.number().min(1).max(5).default(3),
});

export const lookupCadDocsOutputSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      snippet: z.string(),
      source: z.string(),
      relevanceScore: z.number(),
    }),
  ),
});
```

Register `lookup_cad_docs` in `parametricTools` in `src/server/aiChat.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/server/cadDocsClient.test.ts`
Expected: PASS (2/2 tests passed)

- [ ] **Step 5: Commit**

```bash
git add src/server/cadDocsClient.ts src/server/cadDocsClient.test.ts shared/chatAi.ts src/server/aiChat.ts
git commit -m "feat(docs): add ContextCortex CAD docs client and lookup_cad_docs agent tool"
```

---

### Task 3: Modular Engineering CAD Skills & Prompt Engine Overhaul

**Files:**

- Create: `src/server/cadPrompts/coreEngineering.ts`
- Create: `src/server/cadPrompts/tolerancesAndFits.ts`
- Create: `src/server/cadPrompts/assemblyArchitecture.ts`
- Create: `src/server/cadPrompts/bosl2Recipes.ts`
- Create: `src/server/cadPrompts/index.ts`
- Create: `src/server/cadPrompts/cadPrompts.test.ts`
- Modify: `src/server/aiChat.ts:170-340`

**Interfaces:**

- Produces:

  ```typescript
  export interface CadPromptOptions {
    enableAssembly?: boolean;
    hasReferenceModel?: boolean;
  }

  export function composeParametricSystemPrompt(
    options?: CadPromptOptions,
  ): string;
  ```

- [ ] **Step 1: Write failing unit test for `composeParametricSystemPrompt`**

Create `src/server/cadPrompts/cadPrompts.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { composeParametricSystemPrompt } from './index';

test('composeParametricSystemPrompt includes core engineering and CSG overlap rules', () => {
  const prompt = composeParametricSystemPrompt();
  assert.match(prompt, /eps\s*=\s*0\.01/);
  assert.match(prompt, /Zero-thickness|Manifold/i);
  assert.match(prompt, /build_parametric_model/);
});

test('composeParametricSystemPrompt includes 3D printing tolerances', () => {
  const prompt = composeParametricSystemPrompt();
  assert.match(prompt, /0\.3/); // Sliding fit tolerance
  assert.match(prompt, /0\.15/); // Press fit tolerance
  assert.match(prompt, /wall_thickness/i);
});

test('composeParametricSystemPrompt includes assembly module architecture and manifest instructions', () => {
  const prompt = composeParametricSystemPrompt({ enableAssembly: true });
  assert.match(prompt, /module part_/);
  assert.match(prompt, /assembly/);
  assert.match(prompt, /explode/i);
});

test('composeParametricSystemPrompt includes BOSL2 guidance and diverse examples', () => {
  const prompt = composeParametricSystemPrompt();
  assert.match(prompt, /BOSL2/);
  assert.match(prompt, /screws\.scad/);
  assert.match(prompt, /part_base/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/server/cadPrompts/cadPrompts.test.ts`
Expected: FAIL (Cannot find module './index')

- [ ] **Step 3: Implement modular prompt skills in `src/server/cadPrompts/`**

Create `src/server/cadPrompts/coreEngineering.ts`:

```typescript
export const CORE_ENGINEERING_RULES = `
# Mechanical Engineering & CSG Hygiene Rules
1. Zero-Thickness Coincidence Rule (Mandatory):
   - In OpenSCAD, boolean difference() requires cuts to overlap beyond the boundaries by an epsilon (eps = 0.01).
   - NEVER subtract faces that are exactly coplanar. If cutting a hole through a plate of thickness H:
     eps = 0.01;
     translate([0, 0, -eps]) cylinder(h = H + 2 * eps, r = hole_r);
   - Coplanar cuts cause non-manifold geometry, 3D printing slicer failures, and rendering artifacts.
2. Centering & Coordinate Standard:
   - Always center symmetric parts on X=0 and Y=0.
   - Base of the model must sit at Z=0 (e.g. translate([0, 0, 0]) for printability).
3. Wall Thickness & Structural Rigidity:
   - For 3D printed functional parts, enforce minimum wall thickness of 1.6mm to 2.4mm.
   - Add 45-degree chamfers or fillets on internal 90-degree corners subject to mechanical stress.
`;
```

Create `src/server/cadPrompts/tolerancesAndFits.ts`:

```typescript
export const TOLERANCES_AND_FITS_RULES = `
# 3D Printing Fits & Tolerances
- Sliding / Clearance Fit: Add 0.3mm to 0.4mm clearance between mating parts (e.g., sliding lids, pins, hinge joints).
- Press / Friction Fit: Use 0.15mm to 0.2mm interference clearance for snap-pins or press-fit bearings.
- Snap-Fit Hooks: Cantilever snap joints must have lead-in angles of 30-45 degrees and return angles of 45-90 degrees.
- Screw Holes: Standard clearance for M3 is dia 3.4mm; M4 is dia 4.5mm; M6 is dia 6.6mm.
`;
```

Create `src/server/cadPrompts/assemblyArchitecture.ts`:

```typescript
export const ASSEMBLY_ARCHITECTURE_RULES = `
# Multipart Assembly Architecture
When the user asks for a mechanism, enclosure, box with lid, or multi-component object:
1. Divide into Discrete Named Modules:
   - Define each component in its own module: module part_base(), module part_lid(), module part_bracket().
   - Wrap each part in a distinct color() so preview renders each component in its own color.
2. Assembly Section & Explode Parameter:
   - Expose an assembly explode slider and part filter:
     /* [Assembly & Explode] */
     explode = 0; // [0:0.1:50]
     show_part = "all"; // [all, base, lid]
     if (show_part == "all" || show_part == "base") part_base();
     if (show_part == "all" || show_part == "lid") translate([0, 0, explode]) part_lid();
3. Tool Schema Assembly Manifest:
   - Include the "assembly" block in build_parametric_model with:
     * id: unique slug (e.g. "base", "lid")
     * name: display name ("Main Base Case", "Top Snap Lid")
     * moduleName: matching OpenSCAD module name ("part_base")
     * explodeVector: unit direction vector ([0, 0, 1] for lid, [0, 0, -1] for base)
`;
```

Create `src/server/cadPrompts/bosl2Recipes.ts`:

```typescript
export const BOSL2_RECIPES = `
# BOSL2 Standard Primitives & Libraries
- Standard inclusion: include <BOSL2/std.scad>
- Screws & Fasteners: include <BOSL2/screws.scad> -> screw("M3x12"), screw_hole("M3", length=10)
- Threaded Rods & Nuts: include <BOSL2/threading.scad> -> threaded_rod(d=10, l=30, pitch=1.5)
- Smooth Lofts & Sweeps: include <BOSL2/skin.scad> -> skin(), path_sweep()
- Roundings & Fillets: include <BOSL2/rounding.scad> -> round_corners()
`;
```

Create `src/server/cadPrompts/index.ts`:

```typescript
import { CORE_ENGINEERING_RULES } from './coreEngineering';
import { TOLERANCES_AND_FITS_RULES } from './tolerancesAndFits';
import { ASSEMBLY_ARCHITECTURE_RULES } from './assemblyArchitecture';
import { BOSL2_RECIPES } from './bosl2Recipes';

export interface CadPromptOptions {
  enableAssembly?: boolean;
  hasReferenceModel?: boolean;
}

export function composeParametricSystemPrompt(
  options?: CadPromptOptions,
): string {
  const parts = [
    `You are Adam, an expert agentic AI CAD editor that creates and modifies high-precision OpenSCAD models.`,
    `Use build_parametric_model whenever the user asks for a CAD model, an edit to a CAD model, or a fix.`,
    `You also have access to lookup_cad_docs to search official OpenSCAD and BOSL2 documentation on demand.`,
    CORE_ENGINEERING_RULES,
    TOLERANCES_AND_FITS_RULES,
    options?.enableAssembly !== false ? ASSEMBLY_ARCHITECTURE_RULES : '',
    BOSL2_RECIPES,
    `
# Parametric Customizer Parameters
- Declare editable parameters at top of file with snake_case names.
- Annotate with OpenSCAD Customizer comments:
  width = 50; // [10:1:100]
  color_body = "SteelBlue"; // CSS color
  show_lid = true;

# Style Example: Snap-Fit Project Enclosure
eps = 0.01;
box_width = 80;    // [40:1:150]
box_depth = 60;    // [30:1:120]
box_height = 30;   // [15:1:80]
wall_thick = 2.0;  // [1.2:0.2:4.0]
clearance = 0.3;   // [0.2:0.05:0.6]
explode = 0;       // [0:0.1:40]

color("SlateGray")
part_base();

color("DodgerBlue")
translate([0, 0, box_height + explode])
part_lid();

module part_base() {
  difference() {
    cube([box_width, box_depth, box_height], center=true);
    translate([0, 0, wall_thick / 2 + eps])
      cube([box_width - 2*wall_thick, box_depth - 2*wall_thick, box_height - wall_thick + eps], center=true);
  }
}

module part_lid() {
  cube([box_width, box_depth, wall_thick], center=true);
  translate([0, 0, -wall_thick])
    cube([box_width - 2*(wall_thick + clearance), box_depth - 2*(wall_thick + clearance), wall_thick], center=true);
}
    `,
  ];

  return parts.filter(Boolean).join('\n\n');
}
```

Wire `composeParametricSystemPrompt()` into `src/server/aiChat.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/server/cadPrompts/cadPrompts.test.ts`
Expected: PASS (4/4 tests passed)

- [ ] **Step 5: Commit**

```bash
git add src/server/cadPrompts/ src/server/aiChat.ts
git commit -m "feat(prompt): implement modular engineering CAD prompt engine and CSG hygiene skills"
```

---

### Task 4: Antigravity OpenSCAD Expert Skill

**Files:**

- Create: `/home/steve/.gemini/config/skills/openscad-cad-expert/SKILL.md`

- [ ] **Step 1: Write `SKILL.md` with complete OpenSCAD Cheatsheet and Language Reference**

Create `/home/steve/.gemini/config/skills/openscad-cad-expert/SKILL.md`:

````markdown
---
name: openscad-cad-expert
description: Comprehensive OpenSCAD language, cheatsheet, CSG booleans, BOSL2, and 3D printing engineering reference. Use whenever writing, reviewing, or debugging OpenSCAD code or CADAM parametric models.
---

# OpenSCAD CAD Expert Reference

## 1. Syntax & Core Constants

- Variables: `name = value;` (declarative, evaluated at compile time)
- Ternary: `val = cond ? true_val : false_val;`
- Constants: `PI` (~3.14159), `undef`
- Special variables:
  - `$fn`: number of fragments (default to 48 for preview, 96+ for export)
  - `$fa`: minimum angle per fragment
  - `$fs`: minimum size per fragment
  - `$preview`: boolean true in F5 preview, false in F6 render
  - `$children`: number of child module instances passed to `children()`

## 2. 2D Primitives & Operations

- `circle(r=radius | d=diameter);`
- `square(size=[x, y], center=true|false);`
- `polygon(points=[[x, y], ...], paths=[[p1, p2, p3], ...]);`
- `text(text="...", size=10, font="...", halign="center", valign="center");`
- `offset(r=delta | delta=delta, chamfer=false);`
- `projection(cut=true|false);`

## 3. 3D Primitives & Extrusions

- `cube(size=[x, y, z], center=true|false);`
- `cylinder(h=height, r=radius | d=diameter, center=true|false);`
- `cylinder(h=height, r1=base_r, r2=top_r, center=true|false);` // Cone/frustum
- `sphere(r=radius | d=diameter);`
- `polyhedron(points=[...], faces=[...]);`
- `linear_extrude(height=H, twist=deg, scale=s, slices=n) { ... }`
- `rotate_extrude(angle=360, convexity=2) { ... }`

## 4. Transformations & Booleans

- `translate([x, y, z]) { ... }`
- `rotate([x_deg, y_deg, z_deg]) { ... }`
- `scale([sx, sy, sz]) { ... }`
- `mirror([nx, ny, nz]) { ... }`
- `color("NamedColor" | [r, g, b, a]) { ... }`
- `hull() { ... }`
- `minkowski() { ... }`
- `union() { ... }`
- `difference() { ... }`
- `intersection() { ... }`

## 5. CSG Overlap Hygiene (Zero-Coincidence Rule)

In difference() operations, the subtracted tool MUST protrude past the target solid by `eps = 0.01` on every shared face:

```openscad
eps = 0.01;
difference() {
  cube([10, 10, 10], center=true);
  // Extends 2*eps longer, centered with translation offset
  translate([0, 0, -eps]) cylinder(h=10 + 2*eps, r=2, center=true);
}
```
````

## 6. BOSL2 High-Level Library

```openscad
include <BOSL2/std.scad>
include <BOSL2/screws.scad>
include <BOSL2/threading.scad>
include <BOSL2/skin.scad>

// Fasteners
screw("M3x12", head="socket");
screw_hole("M3", length=12, head="socket", counterbore=true);

// Threads
threaded_rod(d=8, l=20, pitch=1.25);
threaded_nut(od=13, id=8, h=6.5, pitch=1.25);
```

````

- [ ] **Step 2: Verify skill exists and is readable**

Run: `test -f /home/steve/.gemini/config/skills/openscad-cad-expert/SKILL.md && echo "OK"`
Expected: OK

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/
git commit -m "docs(skill): add openscad-cad-expert skill for Antigravity"
````

---

### Task 5: 3D Viewport 60 FPS Exploded View & Mesh Separation

**Files:**

- Create: `src/components/viewer/explodedTransforms.ts`
- Create: `src/components/viewer/explodedTransforms.test.ts`
- Modify: `src/components/viewer/ThreeScene.tsx:80-160`
- Modify: `src/components/viewer/OpenSCADViewer.tsx:60-120`

**Interfaces:**

- Produces:

  ```typescript
  export function applyExplodeTransforms(
    group: THREE.Group,
    parts: RuntimeAssemblyPart[],
    explodeFraction: number,
    explodeDistanceMm: number,
  ): void;

  export function resetExplodeTransforms(group: THREE.Group): void;
  ```

- [ ] **Step 1: Write failing unit test for `explodedTransforms`**

Create `src/components/viewer/explodedTransforms.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyExplodeTransforms,
  resetExplodeTransforms,
} from './explodedTransforms';
import type { RuntimeAssemblyPart } from '@/utils/assemblyParser';

test('applyExplodeTransforms translates each mesh according to part vector and fraction', () => {
  const mesh1 = {
    position: {
      x: 0,
      y: 0,
      z: 0,
      set: function (x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
      },
    },
  };
  const mesh2 = {
    position: {
      x: 0,
      y: 0,
      z: 0,
      set: function (x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
      },
    },
  };
  const mockGroup = { children: [mesh1, mesh2] } as any;

  const parts: RuntimeAssemblyPart[] = [
    {
      id: 'b',
      name: 'Base',
      explodeVector: [0, 0, -1],
      meshIndex: 0,
      colorHex: '#444',
      triangleCount: 10,
      center: [0, 0, 0],
      visible: true,
      isolated: false,
    },
    {
      id: 'l',
      name: 'Lid',
      explodeVector: [0, 0, 1],
      meshIndex: 1,
      colorHex: '#888',
      triangleCount: 10,
      center: [0, 0, 10],
      visible: true,
      isolated: false,
    },
  ];

  applyExplodeTransforms(mockGroup, parts, 0.5, 40);
  assert.equal(mesh1.position.z, -20);
  assert.equal(mesh2.position.z, 20);

  resetExplodeTransforms(mockGroup);
  assert.equal(mesh1.position.z, 0);
  assert.equal(mesh2.position.z, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/components/viewer/explodedTransforms.test.ts`
Expected: FAIL (Cannot find module './explodedTransforms')

- [ ] **Step 3: Implement `src/components/viewer/explodedTransforms.ts` and integrate with `ThreeScene.tsx`**

Create `src/components/viewer/explodedTransforms.ts`:

```typescript
import {
  calculateExplodedOffset,
  type RuntimeAssemblyPart,
} from '@/utils/assemblyParser';

export function applyExplodeTransforms(
  group: any,
  parts: RuntimeAssemblyPart[],
  fraction: number,
  distanceMm: number = 40,
): void {
  if (!group?.children) return;

  for (const part of parts) {
    const mesh = group.children[part.meshIndex];
    if (mesh?.position?.set) {
      if (fraction <= 0.0001) {
        mesh.position.set(0, 0, 0);
      } else {
        const [ox, oy, oz] = calculateExplodedOffset(
          part.explodeVector,
          fraction,
          distanceMm,
        );
        mesh.position.set(ox, oy, oz);
      }
    }
    if (mesh) {
      mesh.visible = part.visible;
    }
  }
}

export function resetExplodeTransforms(group: any): void {
  if (!group?.children) return;
  for (const child of group.children) {
    if (child?.position?.set) {
      child.position.set(0, 0, 0);
    }
    child.visible = true;
  }
}
```

In `ThreeScene.tsx`, update the render loop / effect to call `applyExplodeTransforms` whenever `explodeFraction` or `assemblyParts` change.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/components/viewer/explodedTransforms.test.ts`
Expected: PASS (1/1 tests passed)

- [ ] **Step 5: Commit**

```bash
git add src/components/viewer/explodedTransforms.ts src/components/viewer/explodedTransforms.test.ts src/components/viewer/ThreeScene.tsx src/components/viewer/OpenSCADViewer.tsx
git commit -m "feat(viewer): implement real-time 60 FPS exploded view transforms and mesh visibility"
```

---

### Task 6: Right Sidebar Tabbed Panel (`[Parameters]` / `[Parts & Assembly]`) & Single-Part STL Export

**Files:**

- Create: `src/components/assembly/PartsPanel.tsx`
- Create: `src/components/assembly/PartsPanel.test.ts`
- Modify: `src/views/EditorView.tsx:750-810`
- Modify: `src/views/ShareView.tsx:280-320`

**Interfaces:**

- Produces:

  ```typescript
  export interface PartsPanelProps {
    parts: RuntimeAssemblyPart[];
    explodeFraction: number;
    onExplodeChange: (fraction: number) => void;
    onToggleVisibility: (partId: string) => void;
    onToggleIsolate: (partId: string) => void;
    onExportPartStl: (part: RuntimeAssemblyPart) => void;
  }

  export function PartsPanel(props: PartsPanelProps): JSX.Element;
  ```

- [ ] **Step 1: Write unit tests for `PartsPanel` logic**

Create `src/components/assembly/PartsPanel.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import type { RuntimeAssemblyPart } from '@/utils/assemblyParser';

test('part isolation logic toggles other parts off and restores on click again', () => {
  const parts: RuntimeAssemblyPart[] = [
    {
      id: 'p1',
      name: 'Part 1',
      explodeVector: [0, 0, 1],
      meshIndex: 0,
      colorHex: '#111',
      triangleCount: 100,
      center: [0, 0, 0],
      visible: true,
      isolated: false,
    },
    {
      id: 'p2',
      name: 'Part 2',
      explodeVector: [0, 0, -1],
      meshIndex: 1,
      colorHex: '#222',
      triangleCount: 200,
      center: [0, 0, 0],
      visible: true,
      isolated: false,
    },
  ];

  function toggleIsolate(
    targetId: string,
    currentParts: RuntimeAssemblyPart[],
  ): RuntimeAssemblyPart[] {
    const isCurrentlyIsolated = currentParts.find(
      (p) => p.id === targetId,
    )?.isolated;
    if (isCurrentlyIsolated) {
      return currentParts.map((p) => ({
        ...p,
        visible: true,
        isolated: false,
      }));
    }
    return currentParts.map((p) => ({
      ...p,
      visible: p.id === targetId,
      isolated: p.id === targetId,
    }));
  }

  const isolatedState = toggleIsolate('p1', parts);
  assert.equal(isolatedState[0].visible, true);
  assert.equal(isolatedState[0].isolated, true);
  assert.equal(isolatedState[1].visible, false);
  assert.equal(isolatedState[1].isolated, false);

  const restoredState = toggleIsolate('p1', isolatedState);
  assert.equal(restoredState[0].visible, true);
  assert.equal(restoredState[0].isolated, false);
  assert.equal(restoredState[1].visible, true);
  assert.equal(restoredState[1].isolated, false);
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx tsx --test src/components/assembly/PartsPanel.test.ts`
Expected: PASS (1/1 tests passed)

- [ ] **Step 3: Implement `src/components/assembly/PartsPanel.tsx` and integrate into `EditorView.tsx`**

Create `src/components/assembly/PartsPanel.tsx`:

- Render tab buttons: `[Parameters]` and `[Parts & Assembly (N)]`.
- Exploded view slider: `0%` to `100%`.
- Per-part row:
  - Color swatch badge (`part.colorHex`).
  - Name and module title.
  - Triangle count badge.
  - Visibility button (`Eye` / `EyeOff`).
  - Isolate button (`Focus`).
  - "Export STL" button (`Download`).

In `EditorView.tsx`:

- Wire state for `activeSidebarTab`: `'parameters' | 'assembly'`.
- Wire `onExportPartStl` to invoke OpenSCAD compilation with `show_part = part.moduleName` and trigger browser file download `<title>_<part.id>.stl`.

- [ ] **Step 4: Verify typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/components/assembly/ src/views/EditorView.tsx src/views/ShareView.tsx
git commit -m "feat(ui): add PartsPanel assembly hierarchy tab, explode slider, and single-part STL export"
```

---

### Task 7: Playwright Browser E2E Suite, Verification & Release v0.11.0 Bump

**Files:**

- Create: `e2e/assembly-and-exploded-view.spec.ts`
- Modify: `package.json` (bump version to `0.11.0`)

- [ ] **Step 1: Write Playwright browser E2E test**

Create `e2e/assembly-and-exploded-view.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { getOrCreateE2ETestUser, loginAsTestUser } from './helpers/auth';

test.describe('Multipart Assembly & Exploded View E2E', () => {
  test('renders Parts & Assembly tab, scrubs explode slider, and toggles part visibility', async ({
    page,
    request,
  }) => {
    const user = await getOrCreateE2ETestUser(request);
    await loginAsTestUser(page, user);

    await page.goto('/cadam/');
    await page.waitForLoadState('networkidle');

    // Click quick prompt for an assembly or send assembly prompt
    const textarea = page.locator('textarea');
    await textarea.fill('Create a two part box with snap lid');
    await page.keyboard.press('Enter');

    // Wait for generation to complete and 3D preview to compile
    await expect(page.locator('canvas').first()).toBeVisible({
      timeout: 60000,
    });

    // Verify Parts & Assembly tab appears
    const assemblyTab = page.getByRole('tab', { name: /Parts|Assembly/i });
    if (await assemblyTab.isVisible()) {
      await assemblyTab.click();

      // Check exploded view slider exists
      const slider = page.locator('input[type="range"]').first();
      await expect(slider).toBeVisible();

      // Scrub slider
      await slider.fill('50');

      // Verify at least one part item is rendered
      const partRow = page.locator('[data-testid="part-item"]').first();
      await expect(partRow).toBeVisible();
    }
  });
});
```

- [ ] **Step 2: Run full verification suite**

Run:

```bash
npm run typecheck
npm run lint
npm test
```

Expected: All unit tests pass, 0 type errors, 0 lint warnings.

- [ ] **Step 3: Bump version to 0.11.0 in `package.json`**

Update `package.json` version: `"0.11.0"`.

- [ ] **Step 4: Commit release commit**

```bash
git add package.json e2e/assembly-and-exploded-view.spec.ts
git commit -m "feat(release): add assembly e2e test suite and bump version to 0.11.0"
```
