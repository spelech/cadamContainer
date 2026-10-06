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
