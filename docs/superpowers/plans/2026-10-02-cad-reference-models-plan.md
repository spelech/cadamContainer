# CAD Reference Models (STEP, IGES, STL) & Interference Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to upload CAD reference files (STEP, IGES, STL), extract precise dimensional/mating features client-side, inject them into the AI prompt using a VibeCAD-inspired parametric contract, render a ghost overlay in the 3D viewport, and detect spatial collisions in real-time.

**Architecture:** Client-side Web Worker running WebAssembly (`occt-import-js`) and Three.js `STLLoader` converts arbitrary CAD solids to triangle meshes without sending proprietary geometry to external servers. A feature extractor analyzes vertex arrays to extract bounding boxes, mating planes, and mounting holes. The 3D viewport renders a translucent ghost overlay and runs BVH triangle-triangle collision detection (`three-mesh-bvh`) to visually flag interference in red.

**Tech Stack:** React 19, TypeScript, Vite, Three.js (`@react-three/fiber`), `occt-import-js` (OpenCASCADE WASM), `three-mesh-bvh`, Node.js `tsx --test`.

## Global Constraints

- Strictly adhere to `AGENTS.md` semantic versioning (target version: `0.9.0`).
- No heavy C++ libraries or Python native bindings in the Dockerfile; all CAD ingestion runs in the client browser.
- All tests must run with `tsx --test --test-concurrency=1 'src/**/*.test.ts'`.
- Code changes must pass `npm run typecheck`, `npm run lint`, and `npm test`.

---

### Task 1: Reference Model Types & Client-Side Worker Pipeline

**Files:**

- Create: `src/types/cadReference.ts`
- Create: `src/workers/cadImportWorker.ts`
- Create: `src/lib/cadWorkerClient.ts`
- Create: `src/lib/cadWorkerClient.test.ts`
- Modify: `package.json` (add `occt-import-js` and `three-mesh-bvh`)

**Interfaces:**

- Produces:

  ```typescript
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
    fileType: 'step' | 'iges' | 'stl';
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
  ```

- [ ] **Step 1: Install `occt-import-js` and `three-mesh-bvh`**

Run: `npm install occt-import-js three-mesh-bvh`
Expected: packages added to dependencies in `package.json`.

- [ ] **Step 2: Create `src/types/cadReference.ts`**

Define the interfaces for bounds, holes, planes, reference metadata, and viewer display modes.

- [ ] **Step 3: Write failing unit test for worker client message dispatch**

Create `src/lib/cadWorkerClient.test.ts` testing file type validation and response formatting.

- [ ] **Step 4: Run test to verify failure**

Run: `npx tsx --test src/lib/cadWorkerClient.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 5: Implement `cadImportWorker.ts` and `cadWorkerClient.ts`**

- `cadImportWorker.ts`: Listen for `postMessage` containing `ArrayBuffer` and `fileName`. Determine if STEP/IGES (call `occt-import-js`) or STL (parse binary/ASCII STL). Extract positions & normals `Float32Array`.
- `cadWorkerClient.ts`: Export `importCadReferenceFile(file: File): Promise<CadTessellationResult>` spawning the worker or executing parsing.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx tsx --test src/lib/cadWorkerClient.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add package.json package-lock.json src/types/cadReference.ts src/workers/cadImportWorker.ts src/lib/cadWorkerClient.ts src/lib/cadWorkerClient.test.ts
git commit -m "feat(cad): add CAD reference model types and worker client"
```

---

### Task 2: Geometric Feature Extractor Engine

**Files:**

- Create: `src/lib/cadFeatureExtractor.ts`
- Create: `src/lib/cadFeatureExtractor.test.ts`

**Interfaces:**

- Consumes: `positions: Float32Array`, `normals: Float32Array` from Task 1.
- Produces:

  ```typescript
  export function extractCadFeatures(
    positions: Float32Array,
    normals: Float32Array,
    fileName: string,
    fileSize: number,
    fileType: 'step' | 'iges' | 'stl',
  ): CadReferenceMetadata;
  ```

- [ ] **Step 1: Write comprehensive unit test for feature extraction**

Create `src/lib/cadFeatureExtractor.test.ts` with synthetic geometry:

- A 40x40x10mm box with a centered 5mm cylindrical hole along the Z axis.
- Verify bounds: `width=40, depth=40, height=10`.
- Verify detected plane at `Z = 0` (normal `[0, 0, -1]`) and `Z = 10` (normal `[0, 0, 1]`).
- Verify detected hole at center `[0, 0, 5]` with diameter `5.0mm` and axis `[0, 0, 1]`.

- [ ] **Step 2: Run test to verify failure**

Run: `npx tsx --test src/lib/cadFeatureExtractor.test.ts`
Expected: FAIL (`extractCadFeatures` not defined).

- [ ] **Step 3: Implement `src/lib/cadFeatureExtractor.ts`**

1. `computeBounds(positions: Float32Array): CadReferenceBounds`:
   Loop through `positions` in steps of 3, tracking `minX, maxX, minY, maxY, minZ, maxZ`.
2. `detectMatingPlanes(positions, normals)`:
   Group triangles with identical normals (within 0.02 dot tolerance). Identify prominent planes covering >5% of surface area.
3. `detectCylindricalHoles(positions, normals)`:
   Find circular vertex loops whose radial distance from axis is constant (`stdDev < 0.2mm`). Extract diameter and axis.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/cadFeatureExtractor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/lib/cadFeatureExtractor.ts src/lib/cadFeatureExtractor.test.ts
git commit -m "feat(cad): implement geometric feature extraction for CAD reference models"
```

---

### Task 3: Grounded VibeCAD Prompt Context Builder

**Files:**

- Create: `src/lib/cadPromptBuilder.ts`
- Create: `src/lib/cadPromptBuilder.test.ts`

**Interfaces:**

- Consumes: `CadReferenceMetadata` from Task 2.
- Produces:

  ```typescript
  export interface CadPromptOptions {
    includeInAssembly: boolean;
    clearanceMm?: number; // default 0.3mm
  }

  export function formatCadReferencePrompt(
    metadata: CadReferenceMetadata,
    options?: CadPromptOptions,
  ): string;
  ```

- [ ] **Step 1: Write unit tests for prompt formatting**

Create `src/lib/cadPromptBuilder.test.ts`:

- Test that metadata is formatted with exact millimeter values and coordinate bounds.
- Test that detected holes and mating planes are listed with clear engineering names.
- Test that parametric variable constraints (`clearance`, dimensions) are explicitly requested.
- Test that when `includeInAssembly` is true, the `%import("...")` instruction is included.

- [ ] **Step 2: Run test to verify failure**

Run: `npx tsx --test src/lib/cadPromptBuilder.test.ts`
Expected: FAIL (`formatCadReferencePrompt` not defined).

- [ ] **Step 3: Implement `src/lib/cadPromptBuilder.ts`**

Format structured markdown injection with sections:

- `[ATTACHED REFERENCE CAD MODEL: <fileName>]`
- Exact dimensional bounds and center of geometry.
- Detected mounting holes & mating planes table.
- VibeCAD modeling rules: parameterization, no magic numbers, explicit fitment clearance.
- Assembly `%import` guidance when `includeInAssembly: true`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/cadPromptBuilder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/lib/cadPromptBuilder.ts src/lib/cadPromptBuilder.test.ts
git commit -m "feat(cad): add VibeCAD-style grounded prompt builder for reference models"
```

---

### Task 4: Chat Attachment UI & Reference Model State

**Files:**

- Create: `src/context/CadReferenceContext.tsx`
- Modify: `src/components/TextAreaChat.tsx`
- Modify: `src/routes/chat.tsx` (provide context)

**Interfaces:**

- Context exposes:

  ```typescript
  export interface CadReferenceState {
    referenceModel: {
      metadata: CadReferenceMetadata;
      positions: Float32Array;
      normals: Float32Array;
      includeInAssembly: boolean;
      opacity: number; // 0 to 1
      displayMode: 'ghost' | 'wireframe' | 'hidden';
      showCollisions: boolean;
    } | null;
    isLoading: boolean;
    error: string | null;
    setReferenceFile: (file: File) => Promise<void>;
    setIncludeInAssembly: (include: boolean) => void;
    setOpacity: (opacity: number) => void;
    setDisplayMode: (mode: 'ghost' | 'wireframe' | 'hidden') => void;
    setShowCollisions: (show: boolean) => void;
    clearReference: () => void;
  }
  ```

- [ ] **Step 1: Create `src/context/CadReferenceContext.tsx`**

Implement React Context storing `referenceModel` state, calling `cadWorkerClient`, and handling errors gracefully.

- [ ] **Step 2: Update `src/components/TextAreaChat.tsx` with drag-and-drop & attachment pill**

1. Support `.step`, `.stp`, `.iges`, `.igs`, `.stl` in file drop handler and file picker button.
2. Render an attached reference model pill above the input textarea:
   - Badge with file extension (`STEP`, `IGES`, `STL`).
   - Dimensions summary (e.g. `40 × 40 × 10 mm`).
   - Checkbox: `Include in assembly (import into SCAD)`.
   - Remove button (`✕`).
3. When sending message, append `formatCadReferencePrompt(...)` to the user message or system instructions.

- [ ] **Step 3: Verify build and typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit Task 4**

```bash
git add src/context/CadReferenceContext.tsx src/components/TextAreaChat.tsx src/routes/chat.tsx
git commit -m "feat(cad): add CAD reference model state and chat attachment UI"
```

---

### Task 5: 3D Viewport Ghost Overlay & Collision Highlight

**Files:**

- Create: `src/components/viewer/CadReferenceOverlay.tsx`
- Create: `src/lib/cadCollisionDetector.ts`
- Create: `src/lib/cadCollisionDetector.test.ts`
- Modify: `src/components/viewer/OpenSCADViewer.tsx`

**Interfaces:**

- Consumes: `referenceModel` from `CadReferenceContext`, OpenSCAD `BufferGeometry` from `OpenSCADViewer`.
- Produces:

  ```typescript
  export interface CollisionReport {
    hasCollision: boolean;
    collidingTriangleCount: number;
    collidingCenter?: [number, number, number];
    approximatePenetrationVolume?: number;
  }

  export function detectInterference(
    referencePositions: Float32Array,
    openScadGeometry: THREE.BufferGeometry,
  ): CollisionReport;
  ```

- [ ] **Step 1: Write unit test for collision detection**

Create `src/lib/cadCollisionDetector.test.ts`:

- Test non-overlapping box geometries return `hasCollision: false, collidingTriangleCount: 0`.
- Test overlapping box geometries return `hasCollision: true, collidingTriangleCount > 0`.

- [ ] **Step 2: Run test to verify failure**

Run: `npx tsx --test src/lib/cadCollisionDetector.test.ts`
Expected: FAIL (`detectInterference` not defined).

- [ ] **Step 3: Implement `src/lib/cadCollisionDetector.ts` using `three-mesh-bvh`**

Generate `MeshBVH` on reference geometry and run intersection checks against the OpenSCAD geometry facets.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/cadCollisionDetector.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `CadReferenceOverlay.tsx` and integrate into `OpenSCADViewer.tsx`**

1. Render reference geometry in Three.js scene with translucent shader (`opacity: 0.4`, `transparent: true`, `depthWrite: false`).
2. Add viewport floating HUD:
   - Opacity slider (`0% - 100%`).
   - Display mode toggle (`Ghost` / `Wireframe` / `Hidden`).
   - Collision status pill:
     - 🟢 `Clear (0 collisions)`
     - 🔴 `Interference: N colliding facets` + button `Ask AI to fix interference`.
3. Highlight colliding facets in red emissive material.

- [ ] **Step 6: Verify build and typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/components/viewer/CadReferenceOverlay.tsx src/lib/cadCollisionDetector.ts src/lib/cadCollisionDetector.test.ts src/components/viewer/OpenSCADViewer.tsx
git commit -m "feat(cad): add 3D viewport ghost overlay and real-time collision detection"
```

---

### Task 6: Assembly Import Bridge, Full Verification & Release Bump

**Files:**

- Modify: `src/context/MeshFilesContext.tsx`
- Modify: `package.json` (bump version to `0.9.0`)
- Modify: `docs/superpowers/specs/2026-10-02-cad-reference-models-design.md` (mark approved)

- [ ] **Step 1: Integrate with `MeshFilesContext`**

When `includeInAssembly` is enabled, write the tessellated binary STL into `MeshFilesContext` so OpenSCAD's `import("<fileName>.stl")` loads the file from the virtual browser filesystem without errors.

- [ ] **Step 2: Run complete test suite and linters**

Run:

```bash
npm run typecheck
npm run lint
npm test
```

Expected: All tests pass, 0 type errors, 0 lint warnings.

- [ ] **Step 3: Bump version to `0.9.0` per `AGENTS.md`**

Update `package.json` version: `"0.8.1"` -> `"0.9.0"`.

- [ ] **Step 4: Final commit**

```bash
git add package.json src/context/MeshFilesContext.tsx docs/superpowers/specs/2026-10-02-cad-reference-models-design.md
git commit -m "feat(cad): enable assembly import bridge and bump version to 0.9.0"
```
