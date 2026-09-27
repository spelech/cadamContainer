export interface HeartbeatManager {
  stop: () => void;
}

/**
 * Creates an interval timer to send periodic keepalive signals over long-lived
 * HTTP streams (SSE), preventing reverse proxies (like Caddy/Nginx) and mobile
 * clients from timing out during long reasoning generations.
 */
export function createHeartbeatManager(
  emit: (msg: string) => void,
  intervalMs = 15000,
): HeartbeatManager {
  const timer = setInterval(() => {
    try {
      emit(': keepalive\n\n');
    } catch {
      // Ignore write errors on closed stream
    }
  }, intervalMs);

  return {
    stop: () => {
      clearInterval(timer);
    },
  };
}
