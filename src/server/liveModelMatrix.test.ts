import { describe, it, before, after } from 'node:test';
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
  };
}

const config = resolveGatewayConfig();
if (config) {
  process.env.LITELLM_BASE_URL = config.baseUrl;
  process.env.OPENROUTER_BASE_URL = config.baseUrl;
  process.env.LITELLM_API_KEY = config.apiKey;
  process.env.OPENROUTER_API_KEY = config.apiKey;
  process.env.CADAM_SESSION_SECRET = 'live-test-secret-at-least-32-chars-long';
}

const TEST_MODELS = [
  { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
  { id: 'anthropic/claude-haiku-4-5', name: 'Claude Haiku 4.5' },
  { id: 'z-ai/glm-5.3-flash', name: 'GLM 5.3 Flash' },
  { id: 'qwen3.7-flash', name: 'Qwen 3.7 Flash' },
];

describe('Multi-Model Live Matrix & Benchmark Test Suite', () => {
  let isGatewayReachable = false;
  const reachableModels: string[] = [];

  before(async () => {
    if (!config) return;
    try {
      const res = await fetch(`${config.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        isGatewayReachable = true;
        const data = (await res.json()) as { data?: { id: string }[] };
        const availableIds = new Set(data.data?.map((m) => m.id) ?? []);

        for (const model of TEST_MODELS) {
          if (availableIds.has(model.id)) {
            reachableModels.push(model.id);
          }
        }
      }
    } catch {
      isGatewayReachable = false;
    }
  });

  for (const model of TEST_MODELS) {
    describe(`Model: ${model.name} (${model.id})`, () => {
      it(
        'generates parametric CAD via build_parametric_model tool call',
        { timeout: 60000 },
        async (t) => {
          if (
            !config ||
            !isGatewayReachable ||
            !reachableModels.includes(model.id)
          ) {
            t.skip(`Skipping: ${model.id} is not reachable on gateway`);
            return;
          }

          const res = await fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
              model: model.id,
              messages: [
                {
                  role: 'system',
                  content:
                    'You are Adam, an expert mechanical CAD designer. When asked to create a parametric 3D model, you MUST call the build_parametric_model tool. Keep internal reasoning concise. Do not respond with plain text.',
                },
                {
                  role: 'user',
                  content:
                    'Create a parametric cylindrical spacer bushing with outer diameter 25mm, inner bore 10mm, and height 15mm.',
                },
              ],
              tools: [
                {
                  type: 'function',
                  function: {
                    name: 'build_parametric_model',
                    description:
                      'Build a 3D parametric CAD model using OpenSCAD code.',
                    parameters: {
                      type: 'object',
                      properties: {
                        code: {
                          type: 'string',
                          description: 'The OpenSCAD code for the model.',
                        },
                      },
                      required: ['code'],
                    },
                  },
                },
              ],
              tool_choice: 'required',
              max_tokens: 8192,
            }),
          });

          assert.strictEqual(
            res.status,
            200,
            `Expected HTTP 200 from gateway for ${model.id}, got ${res.status}`,
          );

          const data = (await res.json()) as {
            choices: {
              message: {
                content: string | null;
                tool_calls?: {
                  function: {
                    name: string;
                    arguments: string;
                  };
                }[];
              };
            }[];
          };

          assert.ok(
            data.choices && data.choices.length > 0,
            'Response contains choices',
          );
          const message = data.choices[0].message;
          const toolCalls = message.tool_calls;

          assert.ok(
            toolCalls && toolCalls.length > 0,
            `${model.id} invoked at least one tool call`,
          );

          const buildCall = toolCalls.find(
            (call) => call.function.name === 'build_parametric_model',
          );
          assert.ok(
            buildCall,
            `${model.id} invoked build_parametric_model tool`,
          );

          const args = JSON.parse(buildCall.function.arguments);
          assert.ok(args.code, 'Tool call arguments include code');
          const code = args.code.toLowerCase();

          // Check geometry keywords and dimension references
          assert.ok(
            code.includes('cylinder') ||
              code.includes('rotate_extrude') ||
              code.includes('difference'),
            `${model.id} produced CSG cylinder/revolve OpenSCAD code`,
          );
          assert.ok(
            code.includes('25') ||
              code.includes('12.5') ||
              code.includes('d_out') ||
              code.includes('od'),
            `${model.id} code references outer diameter/radius`,
          );
        },
      );

      it(
        'routes creative 3D mesh requests to create_mesh tool call',
        { timeout: 30000 },
        async (t) => {
          if (
            !config ||
            !isGatewayReachable ||
            !reachableModels.includes(model.id)
          ) {
            t.skip(`Skipping: ${model.id} is not reachable on gateway`);
            return;
          }

          const res = await fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
              model: model.id,
              messages: [
                {
                  role: 'system',
                  content:
                    'You are Adam. In creative 3D mode, when asked for organic or artistic models, call create_mesh.',
                },
                {
                  role: 'user',
                  content:
                    'Make a stylized low-poly origami dragon figurine for 3D printing.',
                },
              ],
              tools: [
                {
                  type: 'function',
                  function: {
                    name: 'create_mesh',
                    description:
                      'Generate a 3D polygonal mesh from a text prompt.',
                    parameters: {
                      type: 'object',
                      properties: {
                        prompt: {
                          type: 'string',
                          description:
                            'Text description of the 3D model to generate.',
                        },
                      },
                      required: ['prompt'],
                    },
                  },
                },
              ],
              tool_choice: 'required',
              max_tokens: 4096,
            }),
          });

          assert.strictEqual(
            res.status,
            200,
            `Expected HTTP 200 for ${model.id}`,
          );
          const data = (await res.json()) as {
            choices: {
              message: {
                tool_calls?: {
                  function: {
                    name: string;
                    arguments: string;
                  };
                }[];
              };
            }[];
          };

          const toolCalls = data.choices[0]?.message?.tool_calls;
          assert.ok(
            toolCalls && toolCalls.length > 0,
            `${model.id} emitted tool call`,
          );
          const meshCall = toolCalls.find(
            (call) => call.function.name === 'create_mesh',
          );
          assert.ok(meshCall, `${model.id} routed to create_mesh tool`);
          const args = JSON.parse(meshCall.function.arguments);
          assert.ok(args.prompt, 'create_mesh call includes prompt');
          assert.ok(
            args.prompt.toLowerCase().includes('dragon'),
            'create_mesh prompt preserves subject dragon',
          );
        },
      );
    });
  }

  describe('End-to-End Chat Pipeline with Multi-Model DB Persistence', () => {
    const testUser = {
      id: '00000000-0000-0000-0000-000000000099',
      email: 'multimodel-matrix-test@cadam.internal',
    };
    const conversationIds: string[] = [];

    before(async () => {
      process.env.DATABASE_URL = resolveDatabaseUrl();
      if (config) {
        process.env.LITELLM_BASE_URL = config.baseUrl;
      }
      const { query } = await import('./db.ts');
      await query(
        `INSERT INTO public.profiles (id, email) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
        [testUser.id, testUser.email],
      );
    });

    after(async () => {
      try {
        const { query, closePool } = await import('./db.ts');
        for (const cid of conversationIds) {
          await query(`DELETE FROM public.conversations WHERE id = $1`, [cid]);
        }
        await query(`DELETE FROM public.profiles WHERE id = $1`, [testUser.id]);
        await closePool();
      } catch {
        // ignore
      }
    });

    it(
      'streams assistant response and verifies persistence for secondary model (claude-haiku-4-5)',
      { timeout: 60000 },
      async (t) => {
        const targetModel = 'anthropic/claude-haiku-4-5';
        if (
          !config ||
          !isGatewayReachable ||
          !reachableModels.includes(targetModel)
        ) {
          t.skip(`Skipping: ${targetModel} not reachable`);
          return;
        }

        const { query } = await import('./db.ts');
        const { signSession, createSessionCookie } = await import('./auth.ts');
        const { handleAiChatRequest } = await import('./aiChat.ts');

        const convRes = await query<{ id: string }>(
          `INSERT INTO public.conversations (user_id, title, type, privacy, settings)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [
            testUser.id,
            'Haiku Live E2E Matrix Test',
            'parametric',
            'private',
            JSON.stringify({ model: targetModel }),
          ],
        );
        const conversationId = convRes.rows[0].id;
        conversationIds.push(conversationId);

        const leafRes = await query<{ id: string }>(
          `INSERT INTO public.messages (conversation_id, user_id, role, parts, metadata)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [
            conversationId,
            testUser.id,
            'user',
            JSON.stringify([
              {
                type: 'text',
                text: 'Generate an OpenSCAD cube with bevel edges.',
              },
            ]),
            JSON.stringify({ model: targetModel }),
          ],
        );
        const leafMessageId = leafRes.rows[0].id;

        await query(
          `UPDATE public.conversations SET current_message_leaf_id = $1 WHERE id = $2`,
          [leafMessageId, conversationId],
        );

        const token = signSession(testUser);
        const cookie = createSessionCookie(token);

        const req = new Request('http://localhost:3000/api/ai/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: cookie,
          },
          body: JSON.stringify({
            conversationId,
            current_message_leaf_id: leafMessageId,
            model: targetModel,
          }),
        });

        const response = await handleAiChatRequest(req);
        assert.strictEqual(response.status, 200, 'Expected HTTP 200 stream');
        assert.ok(response.body, 'Expected streaming response body');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let streamOutput = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          streamOutput += decoder.decode(value, { stream: true });
        }

        assert.ok(
          streamOutput.includes('build_parametric_model') ||
            streamOutput.includes('tool-'),
          'Stream contains tool execution event',
        );

        const msgRes = await query<{ role: string }>(
          `SELECT role FROM public.messages WHERE conversation_id = $1 AND role = 'assistant'`,
          [conversationId],
        );
        assert.ok(
          msgRes.rows.length > 0,
          'Assistant message persisted in PostgreSQL for Claude Haiku',
        );
      },
    );
  });
});
