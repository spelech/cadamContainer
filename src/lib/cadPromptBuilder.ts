import type {
  CadReferenceMetadata,
  CadPromptOptions,
  CadHoleFeature,
  CadMatingPlane,
} from '../types/cadReference';

export type { CadPromptOptions };

/**
 * Formats a 3D coordinate vector to 2 decimal places: "[X.XX, Y.XX, Z.XX]".
 */
function formatVec3(vec: [number, number, number]): string {
  return `[${vec[0].toFixed(2)}, ${vec[1].toFixed(2)}, ${vec[2].toFixed(2)}]`;
}

/**
 * Generates an engineering description for a detected mounting hole.
 */
function formatHole(hole: CadHoleFeature, index: number): string {
  const name = hole.id || `Hole ${index + 1}`;
  const dia = `${hole.diameter.toFixed(2)}mm`;
  const rad = `${hole.radius.toFixed(2)}mm`;
  const typeStr = hole.isThroughHole
    ? 'Through-hole'
    : hole.depth !== undefined
      ? `Depth: ${hole.depth.toFixed(2)}mm`
      : 'Blind hole';

  return `  - ${name}: Diameter: ${dia} (Radius: ${rad}, ${typeStr}), Center: ${formatVec3(hole.center)}, Axis: ${formatVec3(hole.axis)}`;
}

/**
 * Generates an engineering description for a detected mating plane.
 */
function formatPlane(plane: CadMatingPlane, index: number): string {
  const name = plane.name || `Plane ${index + 1}`;
  const normStr = formatVec3(plane.normal);
  const offsetStr = `${plane.offset.toFixed(2)}mm`;

  // Provide axis-aligned coordinate notation if normal aligns closely with X, Y, or Z
  let axisNotation = '';
  const [nx, ny, nz] = plane.normal;
  if (Math.abs(nx) > 0.99) {
    axisNotation = ` (X = ${plane.offset.toFixed(2)})`;
  } else if (Math.abs(ny) > 0.99) {
    axisNotation = ` (Y = ${plane.offset.toFixed(2)})`;
  } else if (Math.abs(nz) > 0.99) {
    axisNotation = ` (Z = ${plane.offset.toFixed(2)})`;
  }

  return `  - ${name}: Normal: ${normStr}, Offset: ${offsetStr}${axisNotation}`;
}

/**
 * Converts any CAD reference file name to its tessellated STL equivalent for OpenSCAD assembly import.
 */
export function getAssemblyStlFileName(fileName: string): string {
  const sanitized = fileName.replace(/["\\]/g, '');
  if (/\.stl$/i.test(sanitized)) {
    return sanitized;
  }
  return `${sanitized.replace(/\.[^/.]+$/, '')}.stl`;
}

/**
 * Formats a VibeCAD-inspired structured engineering prompt injection for the LLM.
 *
 * Provides exact dimensional bounds, detected mounting holes and mating planes,
 * strict parametric modeling rules (no magic numbers, top-level clearance variables),
 * and assembly %import guidance when requested.
 */
export function formatCadReferencePrompt(
  metadata: CadReferenceMetadata,
  options?: CadPromptOptions,
): string {
  const clearance = options?.clearanceMm ?? 0.3;
  const includeInAssembly = Boolean(options?.includeInAssembly);

  const { bounds, holes, planes, fileName } = metadata;
  const cleanFileName = fileName.replace(/["\\]/g, '');
  const [dimX, dimY, dimZ] = bounds.dimensions;
  const [minX, minY, minZ] = bounds.min;
  const [maxX, maxY, maxZ] = bounds.max;

  const lines: string[] = [
    `[ATTACHED REFERENCE CAD MODEL: ${cleanFileName}]`,
    'The user has attached a physical reference CAD model to mate with or enclose.',
    'Use these measured dimensions as exact constraints for your OpenSCAD code:',
    '',
    `- Overall Dimensions (mm): Width (X): ${dimX.toFixed(2)}, Depth (Y): ${dimY.toFixed(2)}, Height (Z): ${dimZ.toFixed(2)}`,
    `- Bounding Box Range: X: [${minX.toFixed(2)} .. ${maxX.toFixed(2)}], Y: [${minY.toFixed(2)} .. ${maxY.toFixed(2)}], Z: [${minZ.toFixed(2)} .. ${maxZ.toFixed(2)}]`,
    `- Center Point: ${formatVec3(bounds.center)}`,
    '',
    '- Detected Mounting Holes:',
  ];

  if (holes.length > 0) {
    for (let i = 0; i < holes.length; i++) {
      lines.push(formatHole(holes[i], i));
    }
  } else {
    lines.push('  (None detected)');
  }

  lines.push('');
  lines.push('- Major Planar Mating Faces:');

  if (planes.length > 0) {
    for (let i = 0; i < planes.length; i++) {
      lines.push(formatPlane(planes[i], i));
    }
  } else {
    lines.push('  (None detected)');
  }

  lines.push('');
  lines.push('PARAMETRIC MODELING RULES:');
  lines.push(
    '1. Declare all reference dimensions and fit clearances as parametric variables at the top of your OpenSCAD script:',
  );
  lines.push('   e.g.:');
  lines.push(
    `   clearance = ${clearance.toFixed(clearance % 1 === 0 ? 1 : 2)}; // fitment clearance (default ${clearance}mm)`,
  );
  lines.push(`   ref_w = ${dimX.toFixed(2)};`);
  lines.push(`   ref_d = ${dimY.toFixed(2)};`);
  lines.push(`   ref_h = ${dimZ.toFixed(2)};`);
  lines.push(
    '2. Do NOT hardcode arbitrary magic numbers. Ground all mounting hole locations, cavity cutouts, and offsets to the coordinates listed above.',
  );
  lines.push(
    '3. If the user asked to enclose or mate with the reference, ensure cavities have proper clearance (e.g., reference dimension + 2 * clearance).',
  );

  if (includeInAssembly) {
    const stlName = getAssemblyStlFileName(fileName);
    lines.push('');
    lines.push('ASSEMBLY REFERENCE IMPORT:');
    lines.push(
      'The reference model is available in the virtual assembly filesystem:',
    );
    lines.push('```openscad');
    lines.push(
      `// Displayed as background reference (does not affect exported solid):`,
    );
    lines.push(`%import("${stlName}");`);
    lines.push('```');
    lines.push(
      `Note: Use the background modifier '%' so OpenSCAD displays the reference model for visual fitment without including it in the final exported part.`,
    );
  }

  return lines.join('\n');
}
