# Specification: CAD Reference Models (STEP, IGES, STL) & Interference Context

**Author:** Antigravity  
**Date:** 2026-10-02  
**Branch:** `feat/cad-reference-models-step-iges-stl-grabcad`  
**Target Release:** `v0.9.0`  
**Status:** Approved

---

## 1. Executive Summary & Goals

Modern mechanical design rarely happens in a vacuum; parts are almost always designed to fit against or around existing components (e.g., motor mounts, Raspberry Pi enclosures, GoPro brackets, sensor housings, drone arms).

This feature empowers CADAM users to drop standard engineering files (**STEP**, **IGES**, and **STL**) directly into the chat interface. CADAM processes these models client-side in a Web Worker, extracts precise dimensional bounds, mating planes, and hole/cylinder features, injects this geometric context into the LLM prompt using a rigorous VibeCAD-inspired parametric contract, renders a translucent ghost overlay in the 3D viewport, and performs real-time collision/interference detection between the generated OpenSCAD design and the reference part.

### Key Capabilities

1. **Multi-Format Ingestion:** Client-side parsing of `.step`, `.stp`, `.iges`, `.igs`, and `.stl` files without uploading heavy CAD files to any external cloud backend.
2. **Geometric Feature Extraction:** Automated extraction of bounding box dimensions, extents, key planar boundaries, and circular hole/boss geometries (diameter, center, normal).
3. **VibeCAD-Style Grounded Prompting:** Strict prompt context anchoring the LLM to real dimensions, enforcing parametric variable declaration, and applying realistic FDM fit clearances (`0.2mm – 0.5mm`).
4. **Assembly Integration (Toggleable):** Optional automatic conversion of STEP/IGES to an optimized binary STL in the browser virtual filesystem, allowing OpenSCAD's `import("reference.stl")` to build multi-part assemblies.
5. **Ghost Viewport Overlay:** Dedicated translucent rendering layer in Three.js with an opacity slider, solid/wireframe display modes, and visibility toggles.
6. **Real-Time Interference Detection:** Fast BVH-accelerated triangle-triangle collision checking (`three-mesh-bvh`) that highlights penetrating geometry in high-contrast red and provides a one-click prompt to fix interferences.

---

## 2. Architecture & Pipeline

```
+-----------------------------------------------------------------------------------+
| Browser UI (TextAreaChat / File Upload)                                           |
| Drag & Drop: .step, .stp, .iges, .igs, .stl                                        |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| cadImportWorker.ts (Web Worker)                                                    |
|                                                                                   |
|   +-----------------------+     +------------------------+                        |
|   | occt-import-js (WASM) |     | Three.js STLLoader     |                        |
|   | STEP / IGES Parser    |     | STL Binary/ASCII       |                        |
|   +-----------------------+     +------------------------+                        |
|               \                             /                                     |
|                v                           v                                      |
|   +------------------------------------------------------+                        |
|   | Unified Triangle Mesh Buffer (Float32Array positions)|                        |
|   +------------------------------------------------------+                        |
|                              |                                                    |
|                              v                                                    |
|   +------------------------------------------------------+                        |
|   | cadFeatureExtractor.ts                                |                        |
|   | - Bounding box [min..max] & dimensions [W, D, H]     |                        |
|   | - Key planar boundaries (normals & offsets)          |                        |
|   | - Cylinder / Hole detection (RANSAC circle fitting)  |                        |
|   +------------------------------------------------------+                        |
|                              |                                                    |
|     +------------------------+------------------------+                           |
|     |                                                 |                           |
|     v                                                 v                           |
|  [Optional Assembly]                             [Ghost Mesh]                     |
|  Export binary STL -> Virtual FS                 Three.BufferGeometry             |
+-----------------------------------------------------------------------------------+
       |                                                 |
       v                                                 v
+-----------------------------+        +--------------------------------------------+
| Chat Context & LLM Prompt   |        | Three.js Viewport (OpenSCADViewer)         |
| Injected Geometric Contract |        | - Ghost translucent overlay (slider)       |
| & Mating Dimensions         |        | - three-mesh-bvh Collision Detection       |
+-----------------------------+        | - Intersecting facet highlight (Red)       |
                                       +--------------------------------------------+
```

### Privacy & Docker Portability

By running `occt-import-js` (OpenCASCADE compiled to WebAssembly) entirely inside a client-side Web Worker:

- No heavy C++ libraries (e.g. native FreeCAD, PythonOCC, OpenCASCADE) are added to the Docker container, keeping the container image light, generic, and fast to build.
- Proprietary CAD geometries uploaded by the user never leave their local browser.

---

## 3. Geometric Feature Extraction (`cadFeatureExtractor.ts`)

When a model is tessellated, the feature extractor analyzes the vertex and facet streams to derive high-value spatial constraints:

### 1. Bounding Box & Center of Geometry

- Exact extents:
  ```json
  {
    "bounds": {
      "min": [x_min, y_min, z_min],
      "max": [x_max, y_max, z_max]
    },
    "dimensions": {
      "width_x": X,
      "depth_y": Y,
      "height_z": Z
    },
    "center": [c_x, c_y, c_z]
  }
  ```

### 2. Major Planar Boundaries

- Coplanar triangle clustering identifies major flat mounting faces (e.g., bottom mounting plane at `Z = 0`, front face at `Y = 25`, etc.) with their unit normal vectors and plane offsets.

### 3. Cylinder & Hole Detection

- Detects cylindrical features such as screw mounting holes, shaft openings, and bosses by grouping curved vertex loops and fitting circles:
  - Center coordinate: `[X, Y, Z]`
  - Axis orientation: `[Nx, Ny, Nz]` (e.g., `[0, 0, 1]` for vertical holes)
  - Radius and Diameter (in mm)
  - Feature classification: `Hole` (internal negative space) vs `Boss / Shaft` (external positive feature)

---

## 4. Prompt Engineering & VibeCAD Contract

CADAM adopts the design philosophy of **VibeCAD** (AI-native parametric modeling):

- **Strict Grounding:** The LLM is explicitly forbidden from guessing dimensions or assuming pixel scale.
- **Parametric Declarations:** All mating dimensions, offsets, wall thicknesses, and tolerances must be parameterized at the top of the OpenSCAD file.
- **Fit Clearances:** Standard FDM 3D printing tolerances (`0.2mm – 0.5mm`) are explicitly specified.

### System Prompt Injection Template

```markdown
[ATTACHED REFERENCE CAD MODEL: motor_mount_base.step]
The user has attached a physical reference CAD model to mate with or enclose.
Use these measured dimensions as exact constraints for your OpenSCAD code:

- Overall Dimensions (mm): Width (X): 42.00, Depth (Y): 42.00, Height (Z): 34.00
- Bounding Box Range: X: [-21.00 .. 21.00], Y: [-21.00 .. 21.00], Z: [0.00 .. 34.00]
- Center Point: [0.00, 0.00, 17.00]
- Detected Mounting Holes:
  - Hole 1: Diameter: 3.20mm (M3 clearance), Center: [-15.50, -15.50, 0.00], Axis: [0, 0, 1]
  - Hole 2: Diameter: 3.20mm (M3 clearance), Center: [15.50, -15.50, 0.00], Axis: [0, 0, 1]
  - Hole 3: Diameter: 3.20mm (M3 clearance), Center: [15.50, 15.50, 0.00], Axis: [0, 0, 1]
  - Hole 4: Diameter: 3.20mm (M3 clearance), Center: [-15.50, 15.50, 0.00], Axis: [0, 0, 1]
- Major Planar Mating Faces:
  - Bottom Base Plane: Z = 0.00 (Normal: [0, 0, -1])
  - Top Flange Plane: Z = 34.00 (Normal: [0, 0, 1])

MODELING INSTRUCTIONS:

1. Declare all reference dimensions and clearances as parametric variables at the top of your OpenSCAD script:
   e.g.:
   clearance = 0.3; // standard FDM slip fit
   ref_w = 42.0;
   ref_d = 42.0;
   hole_spacing = 31.0;
2. Do NOT hardcode arbitrary magic numbers. Ground all mounting hole locations and cavity cutouts to the coordinates listed above.
3. If the user asked to enclose or mate with the reference, ensure cavities have proper clearance (reference dimension + 2 \* clearance).
```

### Assembly Mode Support

When the user toggles **"Include in OpenSCAD assembly"**:

- The worker saves the tessellated reference model as `motor_mount_base.stl` into the virtual browser filesystem (`MeshFilesContext`).
- The prompt instructs:
  ```openscad
  // The reference model is available in the assembly:
  %import("motor_mount_base.stl"); // Displayed as background reference
  ```

---

## 5. 3D Viewport Ghost Overlay & Collision Detection

### Three.js Scene Composition (`OpenSCADViewer.tsx`)

- Reference models are rendered in a dedicated `THREE.Group` distinct from the active OpenSCAD compilation mesh.
- **Materials & Shading:**
  - **Ghost Solid (Default):** Custom semi-transparent MeshStandardMaterial (`color: 0x4f46e5`, `roughness: 0.3`, `metalness: 0.1`, `transparent: true`, `opacity: 0.4`, `depthWrite: false`).
  - **Wireframe Mode:** High-contrast edge wireframe (`0x818cf8`).
  - **Hidden Mode:** Toggles visibility off without losing session context.
- **Viewport Control HUD:**
  - Floating widget in the top-right of the 3D viewport containing:
    - Reference Model Name and File Size.
    - Opacity Slider (`0%` to `100%`, step 5%).
    - Display Mode Selector (`Ghost` | `Wireframe` | `Hidden`).
    - Collision Highlighting Toggle (`On` / `Off`).

### Collision & Interference Checking (`three-mesh-bvh`)

1. **BVH Generation:**
   - When the reference model is ingested, compute its `MeshBVH`.
   - When OpenSCAD completes a compile turn and produces a `BufferGeometry`, compute its `MeshBVH`.
2. **Intersection Evaluation:**
   - Run `referenceBVH.intersectsGeometry(openScadGeometry, matrix)` to find intersecting facets.
3. **Collision Highlighting:**
   - Overlapping faces are highlighted with an emissive pulsing red overlay (`color: 0xef4444`).
4. **Collision Indicator Pill:**
   - When collisions > 0: Displays a pill `🔴 Interference: 42 intersecting facets` with an interactive button:
     _"Ask AI to fix interference"_ — Automatically prompts the LLM:
     > _"The generated part interferes with the reference model at coordinates near [X, Y, Z]. Please add necessary cutouts or increase the clearance envelope so the parts do not collide."_
   - When collisions == 0: Displays a pill `🟢 Clearance verified (0 collisions)`.

---

## 6. User Interface & Interactions

### 1. File Attachment in Chat (`TextAreaChat.tsx`)

- Drag-and-drop zone accepts `.step`, `.stp`, `.iges`, `.igs`, `.stl`.
- Upload button with CAD icon in the chat input bar.
- Attached Reference Pill:
  - Shows filename, file type badge, and extracted bounding box summary.
  - Checkbox: `[x] Include in OpenSCAD assembly (import into SCAD)` (default: unchecked, ghost overlay only).
  - Close button (`x`) to detach reference model.

### 2. Processing Feedback

- Progress indicator during worker tessellation (e.g., _"Tessellating STEP model (OpenCASCADE WASM)..."_).
- Instant feedback: Typical 1–5 MB STEP files tessellate in under 800ms.

---

## 7. Dependencies & Packaging

1. **`occt-import-js`**:
   - OpenCASCADE Technology compiled to WebAssembly.
   - Enables reading STEP and IGES files and converting B-Rep solids to triangle meshes directly in the browser.
2. **`three-mesh-bvh`**:
   - Spatial BVH indexing for Three.js geometries.
   - Real-time raycasting and triangle-triangle mesh intersection testing for collision detection.

---

## 8. Verification & Test Plan

1. **Unit Tests:**
   - `cadFeatureExtractor.test.ts`: Test bounding box calculation, planar face normal clustering, and circular hole recognition on synthetic cylinder/cube meshes.
   - `promptBuilder.test.ts`: Verify that extracted features are formatted correctly into the LLM system prompt.
2. **Integration Tests:**
   - Load sample test files (`sample_bracket.step`, `test_cylinder.iges`, `box.stl`).
   - Verify worker tessellation returns valid `BufferGeometry` attributes (position, normal).
3. **Browser & UI Verification:**
   - Verify ghost overlay rendering in `OpenSCADViewer`.
   - Test opacity slider updates and wireframe mode toggle.
   - Verify collision detection highlights red when OpenSCAD geometry overlaps reference geometry.
   - Verify Docker container builds cleanly without native C++ toolchain changes.

---

## 9. Versioning & Rollout

- Strictly adheres to `AGENTS.md`.
- Feature branch: `feat/cad-reference-models-step-iges-stl-grabcad`.
- Version bump: `0.8.1` -> `0.9.0` (minor version feature addition).
