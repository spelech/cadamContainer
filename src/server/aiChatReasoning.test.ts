import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChatModel, effortToTokens } from './aiChat';
import type { ChatProviders } from './aiChat';

test('effortToTokens maps efforts to sensible token caps', () => {
  assert.equal(effortToTokens('off'), 0);
  assert.equal(effortToTokens('low'), 2048);
  assert.equal(effortToTokens('medium'), 4096);
  assert.equal(effortToTokens('high'), 8192);
  assert.equal(effortToTokens('max'), 16384);
  assert.equal(effortToTokens(undefined), 2048);
});

test('buildChatModel passes effort and capped tokens to openrouter when reasoningEffort is low', () => {
  let capturedOptions: Record<string, unknown> | undefined;
  const mockProviders: ChatProviders = {
    openrouter: () =>
      ({
        chat: (_id: string, opts: Record<string, unknown>) => {
          capturedOptions = opts;
          return {} as never;
        },
      }) as never,
    anthropic: () => (() => ({}) as never) as never,
    google: () => (() => ({}) as never) as never,
  };

  buildChatModel('glm-5.3-flash', mockProviders, true, 2048, undefined, 'low');
  assert.ok(capturedOptions);
  assert.deepEqual(capturedOptions.reasoning, {
    effort: 'low',
    max_tokens: 2048,
  });
});

test('buildChatModel defaults OpenRouter reasoning to low when thinking is off to prevent runaway 10k tokens', () => {
  let capturedOptions: Record<string, unknown> | undefined;
  const mockProviders: ChatProviders = {
    openrouter: () =>
      ({
        chat: (_id: string, opts: Record<string, unknown>) => {
          capturedOptions = opts;
          return {} as never;
        },
      }) as never,
    anthropic: () => (() => ({}) as never) as never,
    google: () => (() => ({}) as never) as never,
  };

  buildChatModel(
    'glm-5.3-flash',
    mockProviders,
    false,
    undefined,
    undefined,
    undefined,
  );
  assert.ok(capturedOptions);
  assert.deepEqual(capturedOptions.reasoning, {
    effort: 'low',
    max_tokens: 2048,
  });
});
