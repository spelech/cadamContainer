export const BOSL2_RECIPES = `
# BOSL2 Standard Primitives & Libraries
- Standard inclusion: include <BOSL2/std.scad>
- Screws & Fasteners: include <BOSL2/screws.scad> -> screw("M3x12"), screw_hole("M3", length=10), nut("M3")
- Threaded Rods & Nuts: include <BOSL2/threading.scad> -> threaded_rod(d=10, l=30, pitch=1.5), threaded_nut()
- Smooth Lofts & Sweeps: include <BOSL2/skin.scad> -> skin(), path_sweep()
- Curves & Paths: include <BOSL2/beziers.scad> -> bezier_curve(), bezpath_curve()
- Roundings & Fillets: include <BOSL2/rounding.scad> -> round_corners(), offset_sweep()
`;
