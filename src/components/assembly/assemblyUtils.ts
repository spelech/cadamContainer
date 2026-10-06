import type { RuntimeAssemblyPart } from '@/utils/assemblyParser';

/**
 * Toggles isolation for a target part.
 * If the target part is already isolated, restores all parts to visible and not isolated.
 * Otherwise, isolates the target part (only target is visible and marked isolated).
 */
export function togglePartIsolation(
  targetId: string,
  currentParts: RuntimeAssemblyPart[],
): RuntimeAssemblyPart[] {
  const targetPart = currentParts.find((p) => p.id === targetId);
  const isCurrentlyIsolated = targetPart?.isolated;
  if (isCurrentlyIsolated) {
    return currentParts.map((p) => ({ ...p, visible: true, isolated: false }));
  }
  return currentParts.map((p) => ({
    ...p,
    visible: p.id === targetId,
    isolated: p.id === targetId,
  }));
}

/**
 * Toggles visibility for a specific part.
 * If hiding an isolated part, clears its isolated state.
 */
export function togglePartVisibility(
  targetId: string,
  currentParts: RuntimeAssemblyPart[],
): RuntimeAssemblyPart[] {
  return currentParts.map((p) => {
    if (p.id === targetId) {
      const nextVisible = !p.visible;
      return {
        ...p,
        visible: nextVisible,
        isolated: nextVisible ? p.isolated : false,
      };
    }
    return p;
  });
}

/**
 * Wraps or parameterizes OpenSCAD code to render only an isolated part.
 * 1. If `show_part = ...;` is in the code, updates it to the part's ID or moduleName.
 * 2. If the module exists, appends OpenSCAD root modifier `!moduleName();`.
 * 3. Fallback: prepends `show_part = "...";`.
 */
export function isolateScadPart(
  code: string,
  part: RuntimeAssemblyPart,
): string {
  const targetId = part.id;
  const moduleName = part.moduleName || part.id;

  // 1. If the code defines `show_part = ...;`, replace the assignment with the matching part slug
  if (/^\s*show_part\s*=/m.test(code)) {
    const targetValue =
      targetId && code.includes(`"${targetId}"`)
        ? targetId
        : moduleName && code.includes(`"${moduleName}"`)
          ? moduleName
          : targetId || moduleName;
    return code.replace(
      /^\s*show_part\s*=\s*[^;]+;/m,
      `show_part = "${targetValue}";`,
    );
  }

  // 2. If the module name exists in the code, use OpenSCAD's root modifier `!`
  if (
    moduleName &&
    new RegExp(`\\bmodule\\s+${moduleName}\\s*\\(`, 'm').test(code)
  ) {
    return `${code}\n\n// Isolated part render\n!${moduleName}();\n`;
  }

  // 3. Fallback: prepend show_part declaration
  return `show_part = "${targetId}";\n${code}`;
}
