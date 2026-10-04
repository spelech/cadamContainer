import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { describe, it, before, after } from 'node:test';

// Resolve database URL for local test runs if running on host outside docker container network
function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
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
    // fallback to default
  }
  return 'postgres://cadam:cadam_secret_pass@cadam-db:5432/cadam';
}

function resolveLiveModelConfig(): {
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

const config = resolveLiveModelConfig();

describe('Live Model End-to-End Test Suite', () => {
  let isGatewayReachable = false;

  before(async () => {
    if (!config) return;
    try {
      const res = await fetch(`${config.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        isGatewayReachable = true;
      }
    } catch {
      isGatewayReachable = false;
    }
  });

  describe('Live Parametric Model Generation (Text-to-CAD)', () => {
    it(
      'generates valid parametric OpenSCAD via build_parametric_model tool call',
      { timeout: 60000 },
      async (t) => {
        if (!config || !isGatewayReachable) {
          t.skip('Live model gateway not available in current environment');
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
                  'You are Adam, an expert mechanical engineer. When asked to create 3D CAD parts, always call build_parametric_model with clean OpenSCAD code.',
              },
              {
                role: 'user',
                content:
                  'Create a parametric mounting plate (width 30mm, length 50mm, thickness 4mm) with two 4mm mounting holes in OpenSCAD.',
              },
            ],
            tools: [
              {
                type: 'function',
                function: {
                  name: 'build_parametric_model',
                  description: 'Construct a parametric OpenSCAD model',
                  parameters: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      code: { type: 'string' },
                    },
                    required: ['title', 'code'],
                  },
                },
              },
            ],
            tool_choice: 'required',
            max_tokens: 4096,
          }),
        });

        assert.strictEqual(res.status, 200, 'Gateway returned 200 OK');
        const data = await res.json();
        const toolCalls = data.choices?.[0]?.message?.tool_calls;
        assert.ok(
          Array.isArray(toolCalls) && toolCalls.length > 0,
          'Model returned tool calls',
        );

        const buildCall = toolCalls.find(
          (call: { function?: { name?: string } }) =>
            call.function?.name === 'build_parametric_model',
        );
        assert.ok(buildCall, 'Model called build_parametric_model');

        const args = JSON.parse(buildCall.function.arguments);
        assert.ok(
          typeof args.title === 'string' && args.title.length > 0,
          'Title is non-empty',
        );
        assert.ok(
          typeof args.code === 'string' && args.code.length > 0,
          'Code is non-empty',
        );

        // Verify OpenSCAD parametric contract
        assert.ok(
          args.code.includes('=') ||
            args.code.includes('module') ||
            args.code.includes('cylinder'),
          'OpenSCAD code contains variable declarations or standard 3D primitives',
        );
      },
    );
  });

  describe('Live Creative 3D Mesh Tool Routing', () => {
    it(
      'routes 3D asset request to create_mesh tool call with correct prompt',
      { timeout: 60000 },
      async (t) => {
        if (!config || !isGatewayReachable) {
          t.skip('Live model gateway not available in current environment');
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
                  'You are Adam. In creative mode, when the user asks for a 3D asset or mesh, you must call the create_mesh tool.',
              },
              {
                role: 'user',
                content: 'Generate a 3D stylized low-poly dragon figurine',
              },
            ],
            tools: [
              {
                type: 'function',
                function: {
                  name: 'create_mesh',
                  description: 'Generate a 3D mesh model',
                  parameters: {
                    type: 'object',
                    properties: {
                      text: { type: 'string' },
                    },
                    required: ['text'],
                  },
                },
              },
            ],
            tool_choice: 'required',
            max_tokens: 1000,
          }),
        });

        assert.strictEqual(res.status, 200, 'Gateway returned 200 OK');
        const data = await res.json();
        const toolCalls = data.choices?.[0]?.message?.tool_calls;
        assert.ok(
          Array.isArray(toolCalls) && toolCalls.length > 0,
          'Model returned tool calls',
        );

        const meshCall = toolCalls.find(
          (call: { function?: { name?: string } }) =>
            call.function?.name === 'create_mesh',
        );
        assert.ok(meshCall, 'Model called create_mesh tool');

        const args = JSON.parse(meshCall.function.arguments);
        assert.ok(
          typeof args.text === 'string' &&
            args.text.toLowerCase().includes('dragon'),
          'Mesh prompt references the requested asset',
        );
      },
    );
  });

  describe('Live CAD Reference Model Prompt Grounding', () => {
    it(
      'ingests reference model features and applies clearance fitment',
      { timeout: 60000 },
      async (t) => {
        if (!config || !isGatewayReachable) {
          t.skip('Live model gateway not available in current environment');
          return;
        }

        const { formatCadReferencePrompt } = await import(
          '../lib/cadPromptBuilder.ts'
        );

        const referencePrompt = formatCadReferencePrompt({
          fileName: 'nema17_stepper.step',
          fileSize: 40960,
          fileType: 'step',
          bounds: {
            min: [-21.15, -21.15, 0],
            max: [21.15, 21.15, 40],
            dimensions: [42.3, 42.3, 40],
            center: [0, 0, 20],
          },
          holes: [
            {
              id: 'hole_1',
              diameter: 3.0,
              radius: 1.5,
              center: [-15.5, -15.5, 40],
              axis: [0, 0, 1],
              depth: 4.5,
              isThroughHole: false,
            },
            {
              id: 'hole_2',
              diameter: 3.0,
              radius: 1.5,
              center: [15.5, -15.5, 40],
              axis: [0, 0, 1],
              depth: 4.5,
              isThroughHole: false,
            },
          ],
          planes: [
            {
              id: 'plane_top',
              name: 'Top Mounting Face',
              normal: [0, 0, 1],
              offset: 40,
              bounds: { min: [-21.15, -21.15], max: [21.15, 21.15] },
            },
          ],
          triangleCount: 2400,
        });

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
                  'You are Adam, an expert mechanical CAD designer. When attached CAD reference models are provided, strictly follow fitment clearance and mating hole locations. Keep internal reasoning concise and call build_parametric_model directly.',
              },
              {
                role: 'user',
                content: `${referencePrompt}\n\nDesign a simple mounting faceplate bracket that attaches to the stepper motor holes.`,
              },
            ],
            tools: [
              {
                type: 'function',
                function: {
                  name: 'build_parametric_model',
                  description: 'Construct a parametric OpenSCAD model',
                  parameters: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      code: { type: 'string' },
                    },
                    required: ['title', 'code'],
                  },
                },
              },
            ],
            tool_choice: 'required',
            max_tokens: 8192,
          }),
        });

        assert.strictEqual(res.status, 200, 'Gateway returned 200 OK');
        const data = await res.json();
        const toolCalls = data.choices?.[0]?.message?.tool_calls;
        assert.ok(
          Array.isArray(toolCalls) && toolCalls.length > 0,
          'Model returned tool calls',
        );

        const buildCall = toolCalls.find(
          (call: { function?: { name?: string } }) =>
            call.function?.name === 'build_parametric_model',
        );
        assert.ok(buildCall, 'Model called build_parametric_model');

        const args = JSON.parse(buildCall.function.arguments);
        const code = args.code.toLowerCase();
        // Verify genuine geometric grounding: hole spacing (31mm pitch or 15.5mm offset) and hole cutouts
        const hasHolePattern =
          code.includes('31') ||
          code.includes('15.5') ||
          (code.includes('hole') && code.includes('cylinder'));
        const hasClearanceLogic =
          code.includes('clearance') ||
          code.includes('3.') ||
          code.includes('m3') ||
          code.includes('fit');
        assert.ok(
          hasHolePattern && hasClearanceLogic,
          'Generated OpenSCAD code applies reference hole spacing and clearance dimensions',
        );
      },
    );
  });

  describe('Live End-to-End Chat API Handler Pipeline', () => {
    const testUser = {
      id: 'e0000000-0000-4000-8000-000000000001',
      email: 'live-test-user@example.com',
      display_name: 'Live Test User',
    };

    let conversationId: string;
    let leafMessageId: string;

    before(async () => {
      if (!config || !isGatewayReachable) return;
      process.env.DATABASE_URL = resolveDatabaseUrl();
      process.env.CADAM_SESSION_SECRET =
        'live-test-secret-at-least-32-chars-long';
      process.env.LITELLM_BASE_URL = config.baseUrl;
      process.env.LITELLM_API_KEY = config.apiKey;

      const { query, initDatabase } = await import('./db.ts');
      await initDatabase();

      // Ensure test user exists in profiles
      await query(
        `INSERT INTO public.profiles (id, user_id, email, display_name) VALUES ($1, $1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [testUser.id, testUser.email, testUser.display_name],
      );

      // Create conversation
      const convRes = await query<{ id: string }>(
        `INSERT INTO public.conversations (user_id, title, type, settings)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [testUser.id, 'Live E2E Test', 'parametric', { model: config.model }],
      );
      conversationId = convRes.rows[0].id;

      // Create user message
      const msgRes = await query<{ id: string }>(
        `INSERT INTO public.messages (conversation_id, user_id, role, parts, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          conversationId,
          testUser.id,
          'user',
          JSON.stringify([
            { type: 'text', text: 'Create a 15mm cube in OpenSCAD' },
          ]),
          JSON.stringify({ model: config.model }),
        ],
      );
      leafMessageId = msgRes.rows[0].id;

      // Update leaf pointer
      await query(
        `UPDATE public.conversations SET current_message_leaf_id = $1 WHERE id = $2`,
        [leafMessageId, conversationId],
      );
    });

    after(async () => {
      if (!conversationId) return;
      try {
        const { query, closePool } = await import('./db.ts');
        await query(`DELETE FROM public.conversations WHERE id = $1`, [
          conversationId,
        ]);
        await query(`DELETE FROM public.profiles WHERE id = $1`, [testUser.id]);
        await closePool();
      } catch {
        // ignore
      }
    });

    it(
      'streams live assistant response with build_parametric_model tool execution and persists message',
      { timeout: 60000 },
      async (t) => {
        if (!config || !isGatewayReachable) {
          t.skip('Live model gateway not available in current environment');
          return;
        }

        const { signSession, createSessionCookie } = await import('./auth.ts');
        const { handleAiChatRequest } = await import('./aiChat.ts');
        const { query } = await import('./db.ts');

        const token = await signSession(testUser);
        const cookie = createSessionCookie(token);

        const request = new Request(
          'http://localhost:3000/api/parametric-chat',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Cookie: cookie,
            },
            body: JSON.stringify({
              conversationId,
              model: config.model,
            }),
          },
        );

        const response = await handleAiChatRequest(request);
        assert.strictEqual(
          response.status,
          200,
          'Endpoint returned 200 OK stream',
        );
        assert.ok(response.body, 'Response has readable stream body');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let streamOutput = '';
        let chunksReceived = 0;

        // Drain stream to completion so onFinish completes DB persistence
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunksReceived++;
          streamOutput += decoder.decode(value, { stream: true });
        }

        assert.ok(
          chunksReceived > 0,
          'Received streaming chunks from live model',
        );
        assert.ok(
          streamOutput.includes('build_parametric_model') ||
            streamOutput.includes('tool-'),
          'Live stream contains tool call event',
        );

        // Verify Database Persistence invariant
        const msgRes = await query<{ role: string; parts: unknown }>(
          `SELECT role, parts FROM public.messages WHERE conversation_id = $1 AND role = 'assistant'`,
          [conversationId],
        );
        assert.ok(
          msgRes.rows.length > 0,
          'Assistant message was committed to PostgreSQL database',
        );

        const convRes = await query<{ current_message_leaf_id: string }>(
          `SELECT current_message_leaf_id FROM public.conversations WHERE id = $1`,
          [conversationId],
        );
        assert.notStrictEqual(
          convRes.rows[0].current_message_leaf_id,
          leafMessageId,
          'Conversation leaf pointer was updated to point to assistant response',
        );
      },
    );
  });
});
