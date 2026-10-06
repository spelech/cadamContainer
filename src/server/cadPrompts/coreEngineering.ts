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
   - For 3D printed functional parts, enforce minimum wall_thickness of 1.6mm to 2.4mm.
   - Add 45-degree chamfers or fillets on internal 90-degree corners subject to mechanical stress.
`;
