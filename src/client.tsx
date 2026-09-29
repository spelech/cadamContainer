import { Buffer } from 'buffer';

declare global {
  interface Window {
    Buffer: typeof Buffer;
    global: typeof globalThis;
  }
}

if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
  window.global = window;
}
if (typeof globalThis !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Buffer = Buffer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).global = globalThis;
}

import * as Sentry from '@sentry/react';
import { StartClient } from '@tanstack/react-start/client';
import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';

import { getRouter } from './router';

function getSentryTracesSampleRate() {
  const configuredRate = import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE;

  if (configuredRate !== undefined && configuredRate !== '') {
    const parsedRate = Number(configuredRate);
    if (Number.isFinite(parsedRate) && parsedRate >= 0 && parsedRate <= 1) {
      return parsedRate;
    }
  }

  return import.meta.env.PROD ? 0.1 : 1.0;
}

const router = getRouter();

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN ?? '',
  environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? 'local',
  integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
  tracesSampleRate: getSentryTracesSampleRate(),
});

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
});
