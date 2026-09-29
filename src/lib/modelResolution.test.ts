import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ModelConfig } from '@/types/misc';
import {
  detectModelFamily,
  getBareModelSlug,
  resolveModelWithFallback,
} from './modelResolution';

const mockModels: ModelConfig[] = [
  {
    id: 'openrouter/gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    description: 'Fast Google model',
    provider: 'Openrouter',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: 'Pro Google model',
    provider: 'Google',
  },
  {
    id: 'deepseek/deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    description: 'DeepSeek model',
    provider: 'DeepSeek',
  },
  {
    id: 'qwen/qwen3-coder-flash',
    name: 'Qwen 3 Coder Flash',
    description: 'Qwen coder model',
    provider: 'Qwen',
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    description: 'Anthropic haiku model',
    provider: 'Anthropic',
  },
];

describe('modelResolution', () => {
  describe('detectModelFamily', () => {
    it('detects families correctly', () => {
      assert.equal(
        detectModelFamily('google/gemini-3.1-pro-preview'),
        'gemini',
      );
      assert.equal(detectModelFamily('openrouter/gemini-3.8-flash'), 'gemini');
      assert.equal(detectModelFamily('claude-3-5-sonnet'), 'claude');
      assert.equal(detectModelFamily('openai/gpt-5.6-sol'), 'gpt');
      assert.equal(detectModelFamily('deepseek-chat'), 'deepseek');
      assert.equal(detectModelFamily('qwen2.5-coder:7b'), 'qwen');
      assert.equal(detectModelFamily('meta-llama/llama-3.1-8b'), 'llama');
    });
  });

  describe('getBareModelSlug', () => {
    it('strips namespaces', () => {
      assert.equal(
        getBareModelSlug('google/gemini-3.8-flash'),
        'gemini-3.8-flash',
      );
      assert.equal(getBareModelSlug('gemini-3.8-flash'), 'gemini-3.8-flash');
      assert.equal(getBareModelSlug(''), '');
    });
  });

  describe('resolveModelWithFallback', () => {
    it('returns exact match if present', () => {
      const match = resolveModelWithFallback(mockModels, 'gemini-2.5-pro');
      assert.equal(match?.id, 'gemini-2.5-pro');
    });

    it('matches bare model slug when namespace differs', () => {
      const match = resolveModelWithFallback(
        mockModels,
        'google/gemini-3.8-flash',
      );
      assert.equal(match?.id, 'openrouter/gemini-3.8-flash');
    });

    it('falls back to preferred default if requested model is unknown and default exists', () => {
      const match = resolveModelWithFallback(
        mockModels,
        'nonexistent-model',
        'deepseek/deepseek-v4-pro',
      );
      assert.equal(match?.id, 'deepseek/deepseek-v4-pro');
    });

    it('falls back to similar family model when exact model is unavailable', () => {
      // requested gemini-3.1-pro-preview should match a gemini model (preferring pro if available)
      const match = resolveModelWithFallback(
        mockModels,
        'google/gemini-3.1-pro-preview',
      );
      assert.equal(match?.id, 'gemini-2.5-pro');

      // requested claude-opus should match claude-haiku-4-5
      const claudeMatch = resolveModelWithFallback(
        mockModels,
        'anthropic/claude-opus-4.8',
      );
      assert.equal(claudeMatch?.id, 'claude-haiku-4-5');
    });

    it('falls back to first available model if family has no match', () => {
      const match = resolveModelWithFallback(
        mockModels,
        'mistral/codestral-2501',
      );
      assert.equal(match?.id, 'openrouter/gemini-3.8-flash');
    });

    it('returns undefined if models array is empty', () => {
      const match = resolveModelWithFallback([], 'gemini-2.5-pro');
      assert.equal(match, undefined);
    });
  });
});
