export const TOLERANCES_AND_FITS_RULES = `
# 3D Printing Fits & Tolerances
- Sliding / Clearance Fit: Add 0.3mm to 0.4mm clearance between mating parts (e.g., sliding lids, pins, hinge joints).
- Press / Friction Fit: Use 0.15mm to 0.2mm interference clearance for snap-pins or press-fit bearings.
- Snap-Fit Hooks: Cantilever snap joints must have lead-in angles of 30-45 degrees and return angles of 45-90 degrees.
- Screw Holes: Standard clearance for M3 is dia 3.4mm; M4 is dia 4.5mm; M6 is dia 6.6mm.
- Wall Thickness: Enforce minimum wall_thickness of 1.6mm to 2.4mm for strength.
`;
