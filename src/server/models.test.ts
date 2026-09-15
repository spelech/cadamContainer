import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { PARAMETRIC_MODELS } from '@/lib/utils';
import {
  clearModelsCache,
  fetchAvailableModels,
  transformLiteLLMModels,
  Route,
} from '@/routes/api/models';

describe('Dynamic LiteLLM Models Discovery', () => {
  beforeEach(() => {
    clearModelsCache();
  });

  describe('transformLiteLLMModels', () => {
    it('transforms standard LiteLLM models into ModelConfig format', () => {
      const raw = [
        {
          id: 'google/gemini-3.8-flash',
          object: 'model',
          created: 1700000000,
          owned_by: 'google',
        },
      ];

      const result = transformLiteLLMModels(raw);
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 'google/gemini-3.8-flash');
      assert.equal(result[0].name, 'Gemini 3.8 Flash');
      assert.equal(result[0].provider, 'Google');
      assert.equal(result[0].supportsTools, true);
      assert.equal(result[0].supportsThinking, true);
      assert.equal(result[0].supportsVision, true);
    });

    it('preserves and maps custom attributes when provided', () => {
      const raw = [
        {
          id: 'custom-org/special-model',
          name: 'Special Model V2',
          description: 'Custom fine-tuned OpenSCAD model',
          provider: 'Custom Org',
          supportsTools: true,
          supportsThinking: false,
          supportsVision: false,
        },
      ];

      const result = transformLiteLLMModels(raw);
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 'custom-org/special-model');
      assert.equal(result[0].name, 'Special Model V2');
      assert.equal(result[0].description, 'Custom fine-tuned OpenSCAD model');
      assert.equal(result[0].provider, 'Custom Org');
      assert.equal(result[0].supportsTools, true);
      assert.equal(result[0].supportsThinking, false);
      assert.equal(result[0].supportsVision, false);
    });

    it('derives readable name and provider for unknown models without metadata', () => {
      const raw = [
        {
          id: 'meta-llama/llama-3.3-70b-instruct',
          owned_by: 'meta',
        },
      ];

      const result = transformLiteLLMModels(raw);
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 'meta-llama/llama-3.3-70b-instruct');
      assert.ok(result[0].name.length > 0);
      assert.ok(result[0].provider && result[0].provider.length > 0);
      assert.equal(result[0].supportsTools, true);
      assert.equal(result[0].supportsThinking, true);
      assert.equal(result[0].supportsVision, true);
    });

    it('returns empty array when input is empty or invalid', () => {
      assert.deepEqual(transformLiteLLMModels([]), []);
      assert.deepEqual(transformLiteLLMModels(null as unknown as unknown[]), []);
      assert.deepEqual(transformLiteLLMModels(undefined as unknown as unknown[]), []);
    });
  });

  describe('fetchAvailableModels', () => {
    it('fetches from LiteLLM endpoint with authorization and transforms data', async () => {
      let requestedUrl = '';
      let requestedHeaders: Record<string, string> = {};

      const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        requestedUrl = String(input);
        requestedHeaders = (init?.headers as Record<string, string>) || {};
        return new Response(
          JSON.stringify({
            object: 'list',
            data: [
              {
                id: 'z-ai/glm-5.3-flash',
                name: 'GLM 5.3 Flash',
                description: 'Fast Z.AI multimodal',
                provider: 'Z.AI',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      };

      const models = await fetchAvailableModels({
        baseUrl: 'http://litellm-test:4000/v1',
        apiKey: 'sk-test-key',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      assert.equal(requestedUrl, 'http://litellm-test:4000/v1/model/info');
      assert.equal(requestedHeaders['Authorization'], 'Bearer sk-test-key');
      assert.equal(models.length, 1);
      assert.equal(models[0].id, 'z-ai/glm-5.3-flash');
      assert.equal(models[0].name, 'GLM 5.3 Flash');
    });

    it('extracts maxOutputTokens from model_info in /model/info response', async () => {
      const mockFetch = async () => {
        return new Response(
          JSON.stringify({
            data: [
              {
                model_name: 'z-ai/glm-5.3',
                model_info: {
                  max_output_tokens: 262144,
                  max_tokens: 262144,
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      };

      const models = await fetchAvailableModels({
        baseUrl: 'http://litellm-test:4000/v1',
        fetchFn: mockFetch as unknown as typeof fetch,
        forceRefresh: true,
      });

      assert.equal(models.length, 1);
      assert.equal(models[0].id, 'z-ai/glm-5.3');
      assert.equal(models[0].maxOutputTokens, 262144);
    });

    it('caches response in-memory and avoids repeat network requests within TTL', async () => {
      let callCount = 0;
      const mockFetch = async () => {
        callCount++;
        return new Response(
          JSON.stringify({
            data: [{ id: `model-call-${callCount}` }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      };

      const firstCall = await fetchAvailableModels({
        baseUrl: 'http://litellm-test:4000/v1',
        fetchFn: mockFetch as unknown as typeof fetch,
        ttlMs: 60000,
      });
      assert.equal(callCount, 1);
      assert.equal(firstCall[0].id, 'model-call-1');

      const secondCall = await fetchAvailableModels({
        baseUrl: 'http://litellm-test:4000/v1',
        fetchFn: mockFetch as unknown as typeof fetch,
        ttlMs: 60000,
      });
      assert.equal(callCount, 1);
      assert.equal(secondCall[0].id, 'model-call-1');

      // When forceRefresh is true, re-fetches
      const thirdCall = await fetchAvailableModels({
        baseUrl: 'http://litellm-test:4000/v1',
        fetchFn: mockFetch as unknown as typeof fetch,
        forceRefresh: true,
        ttlMs: 60000,
      });
      assert.equal(callCount, 2);
      assert.equal(thirdCall[0].id, 'model-call-2');
    });

    it('falls back to PARAMETRIC_MODELS when LiteLLM is unreachable or network throws', async () => {
      const mockFailingFetch = async () => {
        throw new Error('Connection refused: http://litellm:4000/v1/models');
      };

      const models = await fetchAvailableModels({
        baseUrl: 'http://litellm-unreachable:4000/v1',
        fetchFn: mockFailingFetch as unknown as typeof fetch,
      });

      assert.deepEqual(models, PARAMETRIC_MODELS);
    });

    it('falls back to PARAMETRIC_MODELS when endpoint returns non-200 status', async () => {
      const mockErrorResponseFetch = async () => {
        return new Response('Gateway error', { status: 502 });
      };

      const models = await fetchAvailableModels({
        baseUrl: 'http://litellm:4000/v1',
        fetchFn: mockErrorResponseFetch as unknown as typeof fetch,
      });

      assert.deepEqual(models, PARAMETRIC_MODELS);
    });

    it('falls back to PARAMETRIC_MODELS when endpoint returns empty list', async () => {
      const mockEmptyFetch = async () => {
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const models = await fetchAvailableModels({
        baseUrl: 'http://litellm:4000/v1',
        fetchFn: mockEmptyFetch as unknown as typeof fetch,
      });

      assert.deepEqual(models, PARAMETRIC_MODELS);
    });
  });

type RouteHandler = (opts: {
  request: Request;
  params?: Record<string, string>;
}) => Promise<Response> | Response;

function getHandler(
  route: { options: { server?: { handlers?: unknown } } },
  method: string,
): RouteHandler {
  const handlers = route.options.server?.handlers as
    | Record<string, RouteHandler>
    | undefined;
  return handlers?.[method] as RouteHandler;
}

  describe('Route handler', () => {
    it('GET handler returns 200 JSON with models array', async () => {
      const handler = getHandler(Route, 'GET');
      assert.ok(handler, 'GET handler should be defined');

      const response = await handler({
        request: new Request('http://localhost/api/models'),
      });

      assert.equal(response.status, 200);
      const json = (await response.json()) as unknown[];
      assert.ok(Array.isArray(json));
      assert.ok(json.length > 0);
    });

    it('OPTIONS handler returns preflight response', async () => {
      const handler = getHandler(Route, 'OPTIONS');
      assert.ok(handler, 'OPTIONS handler should be defined');

      const response = await handler({
        request: new Request('http://localhost/api/models', { method: 'OPTIONS' }),
      });

      assert.equal(response.status, 200);
    });
  });
});
