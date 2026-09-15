import { env } from './env';

export interface GatewayConfig {
  baseUrl: string;
  apiKey: string;
  defaultAuxiliaryModel: string;
}

export function getGatewayConfig(): GatewayConfig {
  const rawBase =
    env('LITELLM_BASE_URL') ||
    env('OPENROUTER_BASE_URL') ||
    'http://litellm:4000/v1';
  const baseUrl = rawBase.trim().replace(/\/+$/, '');
  const apiKey =
    env('LITELLM_API_KEY') ||
    env('OPENROUTER_API_KEY') ||
    'sk-none';
  const defaultAuxiliaryModel =
    env('LITELLM_AUXILIARY_MODEL') ||
    (env('OPENROUTER_BASE_URL') ? 'glm-5.3-flash' : 'openrouter/gemini-3.8-flash');

  return { baseUrl, apiKey, defaultAuxiliaryModel };
}

export interface GatewayTextOptions {
  model?: string;
  system?: string;
  content: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
  maxTokens?: number;
  temperature?: number;
  userEmail?: string;
  fetchFn?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function generateGatewayText(
  options: GatewayTextOptions,
): Promise<string> {
  const config = getGatewayConfig();
  const fetcher = options.fetchFn || fetch;
  const model = options.model || config.defaultAuxiliaryModel;
  const maxTokens = options.maxTokens ?? 250;
  const temperature = options.temperature ?? 0.7;

  const messages: Array<{ role: string; content: unknown }> = [];
  if (options.system) {
    messages.push({ role: 'system', content: options.system });
  }
  messages.push({ role: 'user', content: options.content });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  };

  if (options.userEmail) {
    headers['x-litellm-user-id'] = options.userEmail;
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
  };

  if (options.userEmail) {
    body.user = options.userEmail;
  }

  const endpoint = `${config.baseUrl}/chat/completions`;
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `LiteLLM gateway error ${response.status}: ${errorText || response.statusText}`,
    );
  }

  const data = await response.json().catch(() => null);
  if (!isRecord(data) || !Array.isArray(data.choices) || data.choices.length === 0) {
    throw new Error('LiteLLM gateway response missing choices array');
  }

  const firstChoice = data.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throw new Error('LiteLLM gateway response missing message object');
  }

  const content = firstChoice.message.content;
  if (typeof content !== 'string') {
    throw new Error('LiteLLM gateway response message content is not a string');
  }

  return content.trim();
}
