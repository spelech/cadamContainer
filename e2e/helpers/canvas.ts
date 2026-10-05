import type { Page } from '@playwright/test';

export interface CanvasInspection {
  exists: boolean;
  width: number;
  height: number;
  hasWebGL: boolean;
  contextType: string | null;
}

/**
 * Waits for a WebGL canvas to appear and verifies its render dimensions.
 */
export async function inspectCanvas(
  page: Page,
  selector = 'canvas',
  timeout = 15000,
): Promise<CanvasInspection> {
  const canvas = page.locator(selector).first();
  await canvas.waitFor({ state: 'visible', timeout });

  return canvas.evaluate((el: HTMLCanvasElement) => {
    const gl2 = el.getContext('webgl2');
    const gl = gl2 || el.getContext('webgl');
    return {
      exists: true,
      width: el.width,
      height: el.height,
      hasWebGL: Boolean(gl),
      contextType: gl2 ? 'webgl2' : gl ? 'webgl' : null,
    };
  });
}
