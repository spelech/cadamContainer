import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { AuthUser } from './auth';
import {
  createChatProviders,
  buildChatModel,
  getAuxiliaryModel,
} from './aiChat';

describe('LiteLLM User Quota Attribution in aiChat', () => {
  const originalOpenrouterBaseUrl = process.env.OPENROUTER_BASE_URL;
  const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_BASE_URL = 'http://litellm:4000/v1';
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalOpenrouterBaseUrl !== undefined) {
      process.env.OPENROUTER_BASE_URL = originalOpenrouterBaseUrl;
    } else {
      delete process.env.OPENROUTER_BASE_URL;
    }
    if (originalAnthropicApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  const testUser: AuthUser = {
    id: 'usr_test_123',
    email: 'quota-tester@example.com',
    display_name: 'Quota Tester',
  };

  describe('createChatProviders', () => {
    it('attaches header x-litellm-user-id to OpenRouter client when user.email is provided', () => {
      const providers = createChatProviders(testUser);
      const model = providers.openrouter().chat('deepseek/deepseek-v4-pro-0813');
      const headers = (model as unknown as { config: { headers: () => Record<string, string> } })
        .config.headers();

      assert.strictEqual(headers['x-litellm-user-id'], 'quota-tester@example.com');
    });

    it('does not attach header x-litellm-user-id when user is omitted or has no email', () => {
      const providersNoUser = createChatProviders();
      const modelNoUser = providersNoUser.openrouter().chat('deepseek/deepseek-v4-pro-0813');
      const headersNoUser = (modelNoUser as unknown as { config: { headers: () => Record<string, string> } })
        .config.headers();

      assert.strictEqual(headersNoUser['x-litellm-user-id'], undefined);

      const userWithoutEmail: AuthUser = {
        id: 'usr_no_email',
        email: '',
        display_name: 'No Email',
      };
      const providersNoEmail = createChatProviders(userWithoutEmail);
      const modelNoEmail = providersNoEmail.openrouter().chat('deepseek/deepseek-v4-pro-0813');
      const headersNoEmail = (modelNoEmail as unknown as { config: { headers: () => Record<string, string> } })
        .config.headers();

      assert.strictEqual(headersNoEmail['x-litellm-user-id'], undefined);
    });
  });

  describe('buildChatModel', () => {
    it('passes extraBody: { user: user.email } to openrouter().chat for openrouter models', () => {
      const providers = createChatProviders(testUser);
      const { model } = buildChatModel(
        'openai/gpt-5.6-sol',
        providers,
        false,
        undefined,
        testUser,
      );

      const settings = (model as unknown as { settings: { extraBody?: Record<string, unknown>; usage?: unknown } })
        .settings;
      assert.deepStrictEqual(settings.extraBody, { user: 'quota-tester@example.com' });
    });

    it('omits extraBody when user is not provided', () => {
      const providers = createChatProviders();
      const { model } = buildChatModel(
        'openai/gpt-5.6-sol',
        providers,
        false,
      );

      const settings = (model as unknown as { settings: { extraBody?: Record<string, unknown> } })
        .settings;
      assert.strictEqual(settings.extraBody, undefined);
    });
  });

  describe('getAuxiliaryModel', () => {
    it('forwards user attribution via extraBody when user is provided', () => {
      const providers = createChatProviders(testUser);
      const model = getAuxiliaryModel(providers, testUser);

      const settings = (model as unknown as { settings: { extraBody?: Record<string, unknown> } })
        .settings;
      assert.deepStrictEqual(settings.extraBody, { user: 'quota-tester@example.com' });
    });

    it('omits extraBody when user is not provided', () => {
      const providers = createChatProviders();
      const model = getAuxiliaryModel(providers);

      const settings = (model as unknown as { settings: { extraBody?: Record<string, unknown> } })
        .settings;
      assert.strictEqual(settings.extraBody, undefined);
    });
  });
});
