import test from 'node:test';
import assert from 'node:assert/strict';
import { searchCadDocs } from './cadDocsClient';

test('searchCadDocs formats request and parses successful ContextCortex response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /admin\/api\/search\/test/);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.query, 'rotate_extrude');
    assert.equal(body.search_mode, 'hybrid');

    return new Response(
      JSON.stringify({
        results: [
          {
            score: 0.95,
            payload: {
              title: 'rotate_extrude.md',
              content: 'rotate_extrude(angle=360, convexity=2) polygon(...);',
              symbol: 'rotate_extrude',
              repo: 'openscad-docs',
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    const results = await searchCadDocs({
      query: 'rotate_extrude',
      endpointUrl: 'http://mock-contextcortex:3000',
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].title, 'rotate_extrude.md');
    assert.match(results[0].snippet, /rotate_extrude/);
    assert.equal(results[0].relevanceScore, 0.95);
    assert.equal(results[0].source, 'openscad-docs');
    assert.equal(results[0].symbol, 'rotate_extrude');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchCadDocs maps library parameter to repo filter correctly', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Record<string, unknown>[] = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await searchCadDocs({
      query: 'screw',
      library: 'bosl2',
      endpointUrl: 'http://mock-contextcortex:3000',
    });
    await searchCadDocs({
      query: 'cube',
      library: 'openscad',
      endpointUrl: 'http://mock-contextcortex:3000',
    });
    await searchCadDocs({
      query: 'gear',
      library: 'all',
      endpointUrl: 'http://mock-contextcortex:3000',
    });

    assert.equal(calls.length, 3);
    assert.equal(calls[0].repo, 'BOSL2');
    assert.equal(calls[1].repo, 'openscad-docs');
    assert.equal(calls[2].repo, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchCadDocs handles non-200 responses gracefully', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response('Not Found', { status: 404 });
  };

  try {
    const results = await searchCadDocs({
      query: 'rotate_extrude',
      endpointUrl: 'http://mock-contextcortex:3000',
    });
    assert.deepEqual(results, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchCadDocs handles network errors gracefully without throwing', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Connection refused');
  };

  try {
    const results = await searchCadDocs({
      query: 'invalid_query',
      endpointUrl: 'http://offline-cortex:3000',
    });
    assert.deepEqual(results, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
