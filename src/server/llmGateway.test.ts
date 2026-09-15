import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateGatewayText, getGatewayConfig } from './llmGateway';

describe('LiteLLM Gateway Client (src/server/llmGateway.ts)', () => {
  it('returns default gateway config with fallback baseUrl', () => {
    const origBase = process.env.OPENROUTER_BASE_URL;
    const origLite = process.env.LITELLM_BASE_URL;
    delete process.env.OPENROUTER_BASE_URL;
    delete process.env.LITELLM_BASE_URL;

    try {
      const config = getGatewayConfig();
      assert.strictEqual(config.baseUrl, 'http://litellm:4000/v1');
      assert.ok(typeof config.apiKey === 'string');
    } finally {
      if (origBase) process.env.OPENROUTER_BASE_URL = origBase;
      if (origLite) process.env.LITELLM_BASE_URL = origLite;
    }
  });

  it('honors LITELLM_BASE_URL and user attribution header', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: unknown = null;

    const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      capturedBody = init?.body ? JSON.parse(String(init.body)) : null;

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'Generated title from LiteLLM',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    const text = await generateGatewayText({
      system: 'You generate titles',
      content: 'Make an enclosure for Raspberry Pi',
      userEmail: 'user@wileyriley.com',
      fetchFn: mockFetch,
    });

    assert.strictEqual(text, 'Generated title from LiteLLM');
    assert.ok(capturedUrl.endsWith('/chat/completions'));
    assert.strictEqual(capturedHeaders['x-litellm-user-id'], 'user@wileyriley.com');
    assert.strictEqual((capturedBody as Record<string, unknown>).user, 'user@wileyriley.com');
    assert.ok(Array.isArray((capturedBody as Record<string, unknown>).messages));
  });

  it('throws descriptive error on non-200 response', async () => {
    const mockFetch = (async () => {
      return new Response(JSON.stringify({ error: { message: 'Quota exceeded' } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    await assert.rejects(
      async () => {
        await generateGatewayText({
          content: 'test',
          fetchFn: mockFetch,
        });
      },
      /gateway error 429/i,
    );
  });
});
