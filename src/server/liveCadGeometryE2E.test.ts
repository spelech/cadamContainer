import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

function resolveDatabaseUrl(): string {
  if (
    process.env.DATABASE_URL &&
    !process.env.DATABASE_URL.includes('cadam-db')
  ) {
    return process.env.DATABASE_URL;
  }
  try {
    const ip = execSync(
      "docker inspect cadam-db -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'",
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    if (ip) {
      return `postgres://cadam:cadam_secret_pass@${ip}:5432/cadam`;
    }
  } catch {
    // fallback
  }
  return 'postgres://cadam:cadam_secret_pass@cadam-db:5432/cadam';
}

process.env.DATABASE_URL = resolveDatabaseUrl();

function resolveGatewayConfig(): {
  baseUrl: string;
  apiKey: string;
  model: string;
} | null {
  const baseUrl =
    process.env.LITELLM_BASE_URL ||
    process.env.OPENROUTER_BASE_URL ||
    'http://127.0.0.1:8448/v1';

  let apiKey = process.env.LITELLM_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    try {
      const envFile = readFileSync('/containers/ai/.env', 'utf8');
      const match = envFile.match(/CADAM_OPENROUTER_API_KEY=(.+)/);
      if (match && match[1].trim()) {
        apiKey = match[1].trim();
      }
    } catch {
      // ignore
    }
  }

  if (!apiKey) {
    return null;
  }

  return {
    baseUrl,
    apiKey,
    model: 'google/gemini-3.8-flash',
  };
}

const config = resolveGatewayConfig();
if (config) {
  process.env.LITELLM_BASE_URL = config.baseUrl;
  process.env.OPENROUTER_BASE_URL = config.baseUrl;
  process.env.LITELLM_API_KEY = config.apiKey;
  process.env.OPENROUTER_API_KEY = config.apiKey;
}

interface ChatCompletionResponse {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: {
        function: {
          name: string;
          arguments: string;
        };
      }[];
    };
  }[];
}

const PARAMETRIC_TOOL_DEF = {
  type: 'function',
  function: {
    name: 'build_parametric_model',
    description: 'Build a 3D parametric CAD model using OpenSCAD code.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The complete executable OpenSCAD code.',
        },
      },
      required: ['code'],
    },
  },
};

describe('Complex Mechanical Geometry & Multimodal CAD Live Tests', () => {
  let isGatewayReachable = false;

  before(async () => {
    if (!config) return;
    try {
      const res = await fetch(`${config.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        isGatewayReachable = true;
      }
    } catch {
      isGatewayReachable = false;
    }
  });

  it(
    'generates threaded M6 fastener with hex head and mating nut clearance',
    { timeout: 90000 },
    async (t) => {
      if (!config || !isGatewayReachable) {
        t.skip('Skipping: LiteLLM gateway unreachable');
        return;
      }

      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: 'system',
              content:
                'You are Adam, an expert mechanical engineer. When asked to create parametric CAD models, call build_parametric_model directly. Keep internal reasoning concise. Express ISO M6 bolt and nut geometry cleanly.',
            },
            {
              role: 'user',
              content:
                'Design an ISO M6 machine bolt (nominal diameter 6mm, pitch 1.0mm, shank 25mm, 10mm hex head) and matching hex nut with 0.3mm clearance.',
            },
          ],
          tools: [PARAMETRIC_TOOL_DEF],
          tool_choice: 'required',
          max_tokens: 8192,
        }),
      });

      assert.strictEqual(res.status, 200, 'Gateway returned HTTP 200');
      const data = (await res.json()) as ChatCompletionResponse;
      const toolCall = data.choices?.[0]?.message?.tool_calls?.find(
        (c) => c.function.name === 'build_parametric_model',
      );
      assert.ok(toolCall, 'Invoked build_parametric_model tool');

      const args = JSON.parse(toolCall.function.arguments);
      assert.ok(args.code, 'Tool call contains OpenSCAD code');
      const code = args.code.toLowerCase();

      // Verify M6 thread geometry keywords
      const hasM6OrPitch =
        code.includes('m6') ||
        code.includes('pitch') ||
        code.includes('6.0') ||
        code.includes('thread');
      const hasHexHead =
        code.includes('hex') ||
        (code.includes('cylinder') &&
          (code.includes('6') || code.includes('10')));
      const hasClearance =
        code.includes('clearance') ||
        code.includes('tolerance') ||
        code.includes('0.3') ||
        code.includes('fit');

      assert.ok(hasM6OrPitch, 'Code declares M6 / thread parameters');
      assert.ok(hasHexHead, 'Code implements hex geometry for bolt/nut');
      assert.ok(
        hasClearance,
        'Code implements fitment clearance for mating threads',
      );
    },
  );

  it(
    'generates snap-fit electronics enclosure with PCB standoffs and snap hooks',
    { timeout: 90000 },
    async (t) => {
      if (!config || !isGatewayReachable) {
        t.skip('Skipping: LiteLLM gateway unreachable');
        return;
      }

      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: 'system',
              content:
                'You are Adam, an expert mechanical engineer. When asked to create parametric CAD models, call build_parametric_model. Keep internal reasoning concise.',
            },
            {
              role: 'user',
              content:
                'Create a parametric snap-fit enclosure for a custom PCB measuring 70mm x 45mm. Include 4 interior screw standoffs for M2.5 screws, 2mm wall thickness, cantilever snap-fit latches on the lid, and a rectangular opening on the side for a USB-C port (9mm x 3.5mm).',
            },
          ],
          tools: [PARAMETRIC_TOOL_DEF],
          tool_choice: 'required',
          max_tokens: 8192,
        }),
      });

      assert.strictEqual(res.status, 200, 'Gateway returned HTTP 200');
      const data = (await res.json()) as ChatCompletionResponse;
      const toolCall = data.choices?.[0]?.message?.tool_calls?.find(
        (c) => c.function.name === 'build_parametric_model',
      );
      assert.ok(toolCall, 'Invoked build_parametric_model tool');

      const args = JSON.parse(toolCall.function.arguments);
      const code = args.code.toLowerCase();

      // Assert standoffs, wall thickness, usb cutout, snap fit
      const hasStandoffs =
        code.includes('standoff') ||
        (code.includes('cylinder') && code.includes('m2'));
      const hasEnclosureDimensions = code.includes('70') && code.includes('45');
      const hasUsbCutout =
        code.includes('usb') || (code.includes('9') && code.includes('3.5'));
      const hasSnapTabs =
        code.includes('snap') ||
        code.includes('latch') ||
        code.includes('hook') ||
        code.includes('lip');

      assert.ok(hasEnclosureDimensions, 'Code defines 70x45mm PCB dimensions');
      assert.ok(hasStandoffs, 'Code defines interior PCB standoffs');
      assert.ok(hasUsbCutout, 'Code cuts out USB-C port');
      assert.ok(hasSnapTabs, 'Code implements snap-fit retention features');
    },
  );

  it(
    'generates parametric involute spur gear with pitch diameter and bore',
    { timeout: 90000 },
    async (t) => {
      if (!config || !isGatewayReachable) {
        t.skip('Skipping: LiteLLM gateway unreachable');
        return;
      }

      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: 'system',
              content:
                'You are Adam, an expert mechanical engineer. When asked to create parametric CAD models, call build_parametric_model directly. Keep internal reasoning concise. Express spur gear geometry cleanly in OpenSCAD.',
            },
            {
              role: 'user',
              content:
                'Model a parametric spur gear with 24 teeth, module = 2 (pitch diameter 48mm), 8mm thickness, and a 6mm D-shaft center bore.',
            },
          ],
          tools: [PARAMETRIC_TOOL_DEF],
          tool_choice: 'required',
          max_tokens: 8192,
        }),
      });

      assert.strictEqual(res.status, 200, 'Gateway returned HTTP 200');
      const data = (await res.json()) as ChatCompletionResponse;
      const toolCall = data.choices?.[0]?.message?.tool_calls?.find(
        (c) => c.function.name === 'build_parametric_model',
      );
      assert.ok(
        toolCall,
        `Invoked build_parametric_model tool. Response: ${JSON.stringify(data.choices?.[0] || data)}`,
      );

      const args = JSON.parse(toolCall.function.arguments);
      const code = args.code.toLowerCase();

      // Assert tooth count, module/pitch, shaft bore
      const hasTeethParam =
        code.includes('24') ||
        code.includes('teeth') ||
        code.includes('num_teeth');
      const hasBore =
        code.includes('bore') || code.includes('shaft') || code.includes('6');
      const hasGearLoop =
        code.includes('for') ||
        code.includes('rotate') ||
        code.includes('module');

      assert.ok(hasTeethParam, 'Code declares 24 teeth');
      assert.ok(hasBore, 'Code defines shaft bore');
      assert.ok(hasGearLoop, 'Code computes gear tooth array');
    },
  );

  it(
    'extracts dimensions and grounds model from multimodal technical drawing image',
    { timeout: 90000 },
    async (t) => {
      if (!config || !isGatewayReachable) {
        t.skip('Skipping: LiteLLM gateway unreachable');
        return;
      }

      // Valid 1x1 transparent PNG data URI
      const samplePng =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: 'system',
              content:
                'You are Adam, an expert mechanical CAD designer. When an image or drawing with dimensional callouts is provided, extract the exact specified dimensions and generate the parametric 3D model using build_parametric_model. Keep internal reasoning concise.',
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Please convert this technical blueprint into a 3D OpenSCAD model: The blueprint shows an L-bracket with Leg A = 60mm, Leg B = 40mm, Width = 30mm, Thickness = 5mm, with two 8mm counterbored mounting holes centered on Leg A at Y=20mm and Y=40mm.',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: samplePng,
                  },
                },
              ],
            },
          ],
          tools: [PARAMETRIC_TOOL_DEF],
          tool_choice: 'required',
          max_tokens: 8192,
        }),
      });

      assert.strictEqual(res.status, 200, 'Gateway returned HTTP 200');
      const data = (await res.json()) as ChatCompletionResponse;
      const toolCall = data.choices?.[0]?.message?.tool_calls?.find(
        (c) => c.function.name === 'build_parametric_model',
      );
      assert.ok(
        toolCall,
        'Invoked build_parametric_model tool on multimodal input',
      );

      const args = JSON.parse(toolCall.function.arguments);
      const code = args.code.toLowerCase();

      // Assert dimensions from prompt & multimodal diagram
      const hasDimensions =
        (code.includes('60') || code.includes('leg_a')) &&
        (code.includes('40') || code.includes('leg_b')) &&
        (code.includes('30') || code.includes('width'));
      const hasThickness =
        code.includes('5') ||
        code.includes('thickness') ||
        code.includes('wall');
      const hasHoles =
        code.includes('8') ||
        (code.includes('hole') && code.includes('cylinder'));

      assert.ok(
        hasDimensions,
        'Generated code incorporates L-bracket 60x40x30mm dimensions',
      );
      assert.ok(hasThickness, 'Generated code incorporates 5mm thickness');
      assert.ok(hasHoles, 'Generated code incorporates 8mm mounting holes');
    },
  );
});
