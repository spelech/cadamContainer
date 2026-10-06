# Design Specification: Multipart Assembly Hierarchy, Exploded Views, and OpenSCAD Engineering Overhaul

- **Target Version**: `0.11.0` (Semantic Minor Feature Release per `AGENTS.md`)
- **Status**: `Approved`
- **Authors**: Antigravity & Steve
- **Date**: 2026-10-05
- **Branch**: `feat/multipart-assembly-exploded-view-engineering-overhaul`

---

## 1. Executive Summary & Goals

### 1.1 Problem Statement

1. **Monolithic OpenSCAD Flat Code**: Upstream's CAD generation treats all 3D models as flat, single-body OpenSCAD scripts. Even when multi-part mechanisms (enclosures with lids, gearboxes, articulated hinges) are requested, the generated code combines all geometry without labeled sub-assemblies. The user cannot isolate individual components, verify internal fitment, or 3D-print separate parts independently.
2. **Naive System Prompt & Construction Flow**: Upstream's `PARAMETRIC_AGENT_PROMPT` contains only a single few-shot example (a coffee mug) and lacks mechanical engineering principles:
   - Zero CSG overlap hygiene (missing `eps = 0.01` leading to non-manifold zero-thickness cutting boundaries and slicer failures).
   - No standardized 3D-printing tolerances (sliding fit vs press fit vs snap-fit).
   - No uniform wall thickness or structural fillet/chamfer guidance.
   - Fragile iteration loops that blindly rely on multi-view screenshot feedback rather than engineering contracts.
3. **No Exploded View Capability**: Users cannot scrub an exploded view slider to inspect how parts mate together or verify internal component clearance.
4. **Untapped OpenSCAD Depth**: OpenSCAD offers rich list comprehensions, 2D offsets, rotate/linear extrusions, vector math (`cross`, `norm`, `atan2`), `$children` recursion, and the BOSL2 library. Today, models frequently hallucinate unsupported functions or fall back to naive cylinder/cube stacks because they have no access to current OpenSCAD language and cheat sheet documentation.

### 1.2 Core Objectives

1. **Multipart Assembly Hierarchy**: Provide an integrated `[Parts & Assembly]` panel in the editor sidebar alongside `[Parameters]`. Allow toggling part visibility (👁️), isolating/soloing parts, and downloading individual part STLs for 3D printing.
2. **Interactive 60 FPS Exploded View**: Add an Exploded View slider in the 3D viewport that smoothly separates parts along their calculated explosion vectors in real-time Three.js space, with an OpenSCAD `explode` parameter fallback for static exports.
3. **Engineering-Grade CAD Prompt & Skills**: Re-architect CADAM's prompt engine into modular engineering skills covering CSG hygiene, 3D printing fitment tolerances, assembly structure, and BOSL2 recipes.
4. **ContextCortex Documentation Ingestion**: Connect CADAM to the running `ContextCortex` MCP/RAG service (`http://contextcortex:3000` via Docker's `net_mcp`), indexing the complete OpenSCAD CheatSheet, Language Reference, and BOSL2 documentation. Give the AI agent an active `lookup_cad_docs` tool for live syntax and module verification.
5. **Antigravity OpenSCAD Expert Skill**: Create a dedicated Antigravity skill (`openscad-cad-expert`) providing pair programming agents and subagents immediate access to OpenSCAD functions, idioms, and cheatsheet specs.

---

## 2. System Architecture

```
                    ┌────────────────────────────────────────┐
                    │            USER / BROWSER              │
                    └───────────────────┬────────────────────┘
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             ▼                                                     ▼
┌─────────────────────────┐                               ┌─────────────────────────┐
│     3D Viewport         │                               │     Right Sidebar       │
│  - ThreeScene.tsx       │                               │  - Tab: [Parameters]    │
│  - Colored OFF Meshes   │                               │  - Tab: [Parts/Assembly]│
│  - 60 FPS Explode Slider│                               │    * Visibility Toggles │
│  - Sub-mesh Transforms  │                               │    * Part Isolation     │
│  - Single Part STL Gen  │                               │    * Single Part STLs   │
└────────────▲────────────┘                               └────────────▲────────────┘
             │                                                         │
             └──────────────────────────┬──────────────────────────────┘
                                        │ (Assembly State & Manifest)
                                        ▼
                         ┌─────────────────────────────┐
                         │   CADAM Fullstack Server    │
                         │   (src/server/aiChat.ts)    │
                         └──────────────┬──────────────┘
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           ▼                            ▼                            ▼
┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│  build_parametric_   │   │  lookup_cad_docs     │   │ Modular CAD Skills   │
│  model Tool Schema   │   │  Agent Tool          │   │ - CSG Overlap/Eps    │
│  - title, version    │   │  (Hybrid Vector/BM25)│   │ - 3D Print Fits      │
│  - code (OpenSCAD)   │   └──────────┬───────────┘   │ - BOSL2 Recipes      │
│  - assembly.parts    │              │               │ - Assembly Modules   │
└──────────────────────┘              │               └──────────────────────┘
                                      ▼
                         ┌─────────────────────────────┐
                         │      ContextCortex          │
                         │   (http://contextcortex:3000│
                         │     via net_mcp network)    │
                         │  - OpenSCAD Language Ref    │
                         │  - OpenSCAD CheatSheet      │
                         │  - BOSL2 Documentation      │
                         └─────────────────────────────┘
```

---

## 3. Subsystem Specifications

### 3.1 Subsystem 1: Assembly Manifest Schema & Automatic Part Extractor

#### 3.1.1 Tool Schema Extension (`shared/chatAi.ts`)

We extend `parametricArtifactSchema` to accept an optional `assembly` object while preserving 100% backward compatibility with flat models:

```typescript
export const assemblyPartSchema = z.object({
  id: z
    .string()
    .describe('Unique slug for the part (e.g., "base_case", "top_lid")'),
  name: z
    .string()
    .describe(
      'Human-readable display name (e.g., "Main Base Case", "Snap-Fit Lid")',
    ),
  moduleName: z
    .string()
    .optional()
    .describe('Matching OpenSCAD module name (e.g., "part_base")'),
  color: z
    .string()
    .optional()
    .describe('Display color or CSS/Hex (e.g., "SlateBlue", "#4A5568")'),
  explodeVector: z
    .tuple([z.number(), z.number(), z.number()])
    .default([0, 0, 1])
    .describe(
      'Unit vector [x, y, z] direction along which this part moves when exploded',
    ),
  description: z
    .string()
    .optional()
    .describe('Function and assembly notes for this part'),
});

export const assemblyManifestSchema = z.object({
  explodeDistanceMm: z
    .number()
    .default(40)
    .describe('Total explosion translation distance in mm'),
  parts: z.array(assemblyPartSchema).min(1),
});

export const parametricArtifactSchema = z.object({
  title: z.string().min(1),
  version: z.string().default('v1'),
  code: z.string().min(20),
  assembly: assemblyManifestSchema.optional(),
});
```

#### 3.1.2 Client-Side Automatic Assembly Extractor (`src/utils/assemblyParser.ts`)

When an LLM outputs raw OpenSCAD code without an explicit `assembly` manifest (or when the user pastes custom code), the client-side `assemblyParser` automatically infers parts using a two-pass strategy:

1. **Module Syntax Pass**: Scans for top-level `module (part_[a-z0-9_]+|[a-z0-9_]+_part)\(\)` or explicit `module [A-Z][a-zA-Z0-9_]*\(\)` declarations.
2. **Color Mesh Correspondence Pass**:
   - Parses the compiled OFF mesh output from OpenSCAD.
   - OpenSCAD's OFF format groups triangles by distinct `color(...)` calls.
   - For each color mesh group, calculates its geometric centroid $\mathbf{C}_i = \frac{1}{N}\sum \mathbf{v}$.
   - The assembly center $\mathbf{C}_{\text{assembly}}$ is the centroid of the entire bounding box.
   - The default explosion vector $\hat{\mathbf{e}}_i$ is the normalized displacement $\frac{\mathbf{C}_i - \mathbf{C}_{\text{assembly}}}{\|\mathbf{C}_i - \mathbf{C}_{\text{assembly}}\|}$.
   - If a part is purely on top ($Z > Z_{\text{mid}}$), it defaults to `[0, 0, 1]`; bottom parts default to `[0, 0, -1]`.

```typescript
export interface ExtractedAssemblyPart {
  id: string;
  name: string;
  moduleName?: string;
  colorHex: string;
  explodeVector: [number, number, number];
  meshIndex?: number;
  triangleCount: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  visible: boolean;
  isolated: boolean;
}

export function inferAssemblyFromCodeAndMeshes(
  scadCode: string,
  meshGroup: THREE.Group,
  explicitManifest?: z.infer<typeof assemblyManifestSchema>,
): ExtractedAssemblyPart[];
```

---

### 3.2 Subsystem 2: 3D Viewport Exploded View & Mesh Separation

#### 3.2.1 Real-Time 60 FPS Exploded Transformation

When OpenSCAD compiles via WebAssembly, it produces an OFF stream parsed into `THREE.Group` by `src/utils/coloredOffMesh.ts`.
Each distinct part/color is instantiated as an independent `THREE.Mesh` child of the assembly group.

Instead of triggering an expensive OpenSCAD WASM recompile on every slider movement, the exploded view slider directly modifies the local translation of each child mesh:
$$\mathbf{P}_{\text{exploded}}(t) = \mathbf{P}_{\text{initial}} + \hat{\mathbf{e}}_i \cdot (t \times d_{\text{max}})$$
where:

- $t \in [0.0, 1.0]$ is the exploded view slider percentage ($0\%$ to $100\%$).
- $\hat{\mathbf{e}}_i$ is the normalized explosion vector for part $i$.
- $d_{\text{max}}$ is the explosion distance (default: $40\,\text{mm}$, or auto-scaled to $0.75 \times \text{bounding box diagonal}$).

#### 3.2.2 OpenSCAD Assembly Compatibility Fallback

The prompt instructs models to include an assembly preview parameter:

```openscad
/* [Assembly & Explode] */
explode = 0; // [0:0.1:50]
show_part = "all"; // [all, base, lid, tray]

if (show_part == "all" || show_part == "base") part_base();
if (show_part == "all" || show_part == "lid") translate([0, 0, explode]) part_lid();
```

This guarantees that even in static command-line OpenSCAD exports or third-party viewers, the exploded view and part isolation work out of the box.

#### 3.2.3 Single-Part STL Export (`exportPartStl`)

In addition to downloading the entire assembly as a single STL/DXF, each part in the Parts panel gains an **"Export Part STL"** button:

1. OpenSCAD code is temporarily wrapped or invoked with `show_part = "<part_id>";` or rendering only the selected `module()`.
2. OpenSCAD compiles that single part in the background worker.
3. The browser downloads `<model_name>_<part_id>.stl` with the part automatically re-oriented flat on the print bed ($Z_{\text{min}} = 0$).

---

### 3.3 Subsystem 3: UI Layout & Tabbed Sidebar

#### 3.3.1 Sidebar Tabs (`src/views/EditorView.tsx` & `src/views/ShareView.tsx`)

In the right sidebar, replace the single parameter header with a clean tab switcher:

```
┌──────────────────────────────────────────────────────────┐
│  [  ⚙️ Parameters  ]   [  🧩 Parts & Assembly (3)  ]     │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Exploded View                                           │
│  [========🔘=============================] 25%           │
│                                                          │
│  Assembly Components (3 parts)                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 👁️ 🎯 🔵 Top Enclosure Lid                         │  │
│  │    Module: part_lid | 1,420 triangles              │  │
│  │    [ ⬇️ Export STL ]                                │  │
│  ├────────────────────────────────────────────────────┤  │
│  │ 👁️ 🎯 🟣 Main Enclosure Body                       │  │
│  │    Module: part_base | 3,890 triangles             │  │
│  │    [ ⬇️ Export STL ]                                │  │
│  ├────────────────────────────────────────────────────┤  │
│  │ 👁️ 🎯 🟡 Internal PCB Bracket                     │  │
│  │    Module: part_bracket | 640 triangles            │  │
│  │    [ ⬇️ Export STL ]                                │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

#### 3.3.2 Interaction Controls

- **👁️ Eye Icon (Visibility)**: Toggles `mesh.visible = !mesh.visible`.
- **🎯 Target Icon (Isolate / Solo)**: Hides all other parts, focusing exclusively on the selected component. Clicking again restores full assembly view.
- **Color Indicator**: Displays the real OFF material color with a clickable swatch for visual identification.
- **Exploded View Slider**: Scrubbing immediately updates the 3D viewport canvas at 60 FPS without layout shift or loading spinners.

---

### 3.4 Subsystem 4: ContextCortex Knowledge Bridge & Agent Tooling

#### 3.4.1 Docker Network Bridge

In `/containers/ai/docker-compose.yaml`:

- Connect `cadam` to the external network `net_mcp`.
- This gives CADAM direct, low-latency container-to-container access to `http://contextcortex:3000` via Docker DNS.

#### 3.4.2 Documentation Ingestion into ContextCortex

Register the following repositories in ContextCortex via `POST http://localhost:8021/admin/api/repos`:

1. **`BOSL2` Repository**: `https://github.com/BelfrySCAD/BOSL2.git` (complete module docs, tutorials, function definitions).
2. **`OpenSCAD Documentation`**: OpenSCAD cheatsheet index, language reference, and user manual wikibooks.
   ContextCortex auto-syncs, chunks, and indexes all symbols and markdown into hybrid vector + BM25 embeddings.

#### 3.4.3 CADAM Tool: `lookup_cad_docs` (`src/server/cadDocsClient.ts`)

Add a new agent tool to `src/server/aiChat.ts`:

```typescript
export const lookupCadDocsInputSchema = z.object({
  query: z
    .string()
    .describe(
      'Keywords, function name, or CAD pattern to look up (e.g. "rotate_extrude", "screw_hole", "minkowski", "snap fit")',
    ),
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

When Adam is asked to build an articulated joint, custom thread, or organic curved loft, it calls `lookup_cad_docs` to verify the exact parameters, arguments, and best-practice examples before generating code.

---

### 3.5 Subsystem 5: Modular CAD Skills & Prompt Engineering Overhaul

Replace the single monolithic `PARAMETRIC_AGENT_PROMPT` in `src/server/aiChat.ts` with a modular prompt composer (`src/server/cadPrompts/index.ts`):

```typescript
export function composeParametricSystemPrompt(options?: {
  enableAssembly?: boolean;
  hasReferenceModel?: boolean;
}): string;
```

The modular prompt includes:

#### 1. Core Engineering & CSG Overlap Hygiene

- **Zero-Thickness Coincidence Rule**: All `difference()` cutouts must exceed the subtracted body by `eps = 0.01` on both ends (`translate([0, 0, -eps]) cylinder(h = H + 2*eps, ...)`). Zero-thickness face overlaps are strictly forbidden as they corrupt CSG booleans and 3D printing slicers.
- **Center of Origin Standard**: All single parts and assemblies must be centered at $(X=0, Y=0)$ with the base sitting on $Z=0$.

#### 2. 3D Printing Fits & Tolerances

- **Sliding / Clearance Fit**: $0.3\,\text{mm}$ to $0.4\,\text{mm}$ diametrical clearance.
- **Press / Friction Fit**: $0.15\,\text{mm}$ to $0.2\,\text{mm}$ clearance.
- **Minimum Wall Thickness**: $1.6\,\text{mm}$ to $2.4\,\text{mm}$ for structural rigidity in FDM printing.
- **Fillets on Stress Concentrations**: Chamfers ($45^\circ$) or fillets on internal $90^\circ$ corners to prevent layer separation.

#### 3. Assembly Module Architecture

- Every multi-component object must be partitioned into named modules: `module part_base()`, `module part_lid()`, `module part_hardware()`.
- Standardized assembly block:
  ```openscad
  /* [Assembly & Explode] */
  explode = 0; // [0:0.1:50]
  show_part = "all"; // [all, base, lid]
  ```
- Output the `assembly` manifest in the `build_parametric_model` tool call with matching IDs, descriptive names, and unit explosion vectors.

#### 4. Expanded Diverse Examples

Replace the solitary "mug" with 3 distinct production patterns:

- **Snap-fit Electronics Enclosure** (two-part shell, screw standoffs, port openings, $0.3\,\text{mm}$ clearance lip, `eps` cuts).
- **Mechanical Joint / Mechanism** (clevis hinge, pin with retaining groove, articulated motion).
- **Parametric Bracket / Mount** (countersunk screw holes, structural gussets/ribs, load-bearing fillets).

---

### 3.6 Subsystem 6: Antigravity OpenSCAD Expert Skill

Create a permanent Antigravity skill at `/home/steve/.gemini/config/skills/openscad-cad-expert/SKILL.md`:

- Complete OpenSCAD Cheatsheet reference: 2D primitives, 3D primitives, boolean operations, transformations, list comprehensions, flow control, special variables (`$fn`, `$fa`, `$fs`, `$children`), and mathematical functions.
- Language reference: User-defined functions, modules, recursion, matrix transformations (`multmatrix`).
- BOSL2 cheat sheet: `<BOSL2/std.scad>`, `<BOSL2/screws.scad>`, `<BOSL2/threading.scad>`, `<BOSL2/beziers.scad>`, `<BOSL2/skin.scad>`.
- Rules of engagement for AI CAD generation.

---

## 4. Error Handling & Edge Cases

| Edge Case                                     | Failure Mode                                                            | Mitigation Strategy                                                                                                                            |
| :-------------------------------------------- | :---------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| **ContextCortex Offline / Unreachable**       | Tool call `lookup_cad_docs` network failure.                            | Fallback gracefully to built-in prompt knowledge; return empty search results with warning without failing the chat generation turn.           |
| **Model Emits No `assembly` Manifest**        | Flat or legacy code generated.                                          | `assemblyParser` automatically extracts modules or segments OFF meshes by face colors and centroids.                                           |
| **Model Specifies Degenerate Explode Vector** | Vector is `[0, 0, 0]` or `NaN`.                                         | Sanitize vector to default `[0, 0, 1]` and log a warning.                                                                                      |
| **Single-Part Model**                         | User requests a simple standalone object (e.g. spacer, single bracket). | Assembly manifest is omitted or contains 1 part; Exploded View slider and Parts tab gracefully hide or show single component info.             |
| **Large Assembly Mesh Memory Leak**           | Repeated scrubbing of exploded slider.                                  | Modifies existing Three.js mesh `position` vectors in place; zero memory allocation or geometry cloning during slider scrubbing.               |
| **Export Single Part Failure**                | Selected part code cannot be isolated cleanly.                          | If module compilation fails, fallback to extracting that sub-mesh's triangle buffer directly from the parsed OFF group into binary STL format. |

---

## 5. Security & Isolation

- **Docker Network Security**: CADAM connects to `net_mcp` exclusively to query `http://contextcortex:3000`. No external ports or untrusted networks are exposed.
- **Client-Side WASM Safety**: All OpenSCAD rendering remains completely sandboxed inside the client's WebAssembly worker.
- **Input Sanitization**: All part IDs, names, and OpenSCAD module names in the assembly manifest are sanitized against script injection (`^[a-zA-Z0-9_-]+$`).

---

## 6. Testing & Quality Assurance Plan

### 6.1 Unit Tests (`src/**/*.test.ts`)

- `src/utils/assemblyParser.test.ts`: Test parsing of explicit assembly manifests, module regex extraction, and geometric centroid fallback calculation.
- `src/server/cadPrompts.test.ts`: Verify modular prompt composition, inclusion of CSG hygiene rules, tolerances, and BOSL2 recipes.
- `src/server/cadDocsClient.test.ts`: Test ContextCortex search integration, query formatting, response normalization, and timeout handling.
- `src/components/assembly/PartsPanel.test.ts`: Verify tab switching, part visibility toggling, isolate/solo logic, and exploded slider calculations.

### 6.2 Multi-Model Matrix Live Tests (`src/server/liveModelMatrix.test.ts`)

- Test live assembly generation across models (Gemini 3.1 Pro, Claude Sonnet 4.6, GLM-5.3):
  - Request: _"Create a two-part snap-fit project box for an Arduino Uno with mounting standoffs and cable cutouts."_
  - Assert that:
    1. Tool call `build_parametric_model` includes `assembly.parts` with at least 2 parts (base + lid).
    2. OpenSCAD code compiles cleanly with 0 errors.
    3. Both parts have distinct colors and non-zero triangle counts.

### 6.3 Playwright Browser E2E Tests (`e2e/assembly-and-exploded-view.spec.ts`)

- Navigate to CADAM in real Chromium browser.
- Load an assembly model.
- Verify `[Parameters]` and `[Parts & Assembly]` tabs render in the right sidebar.
- Switch to `[Parts & Assembly]` tab:
  - Scrub Exploded View slider from 0% to 100%; verify 3D mesh children change position.
  - Click visibility eye icon for Part 1; verify `mesh.visible` becomes `false`.
  - Click isolate target icon for Part 2; verify other meshes hide.
  - Verify "Export Part STL" button is present and triggers a valid STL download.

---

## 7. Versioning & AGENTS.md Compliance

Following the rules in `AGENTS.md`:

- **Version Bump**: `0.10.0` $\rightarrow$ `0.11.0` (MINOR bump for added backward-compatible features: multipart assemblies, exploded view, ContextCortex docs bridge).
- **CI/CD Build**: Push to `main` triggers `.github/workflows/docker-build.yml`, automatically building and deploying `ghcr.io/spelech/cadamcontainer:0.11.0` and `latest`.
- **Zero Secrets**: Dynamic configuration uses runtime environment variables and Docker network resolution.

---

## 8. Approval & Sign-Off

- [ ] Steve (User Approval)
- [ ] Antigravity (Implementation Plan Ready)
