/**
 * Resolves the native backend address only after its health-verified port is
 * published. Failed/early lookups never become a cached endpoint.
 */
export function createBackendBaseResolver(
  isDesktop: () => boolean,
  readPort: () => Promise<number | null>,
): () => Promise<string> {
  let resolved: string | null = null;
  let pending: Promise<string> | null = null;

  return async () => {
    if (resolved) return resolved;
    if (!pending) {
      pending = (async () => {
        if (!isDesktop()) return '/api';
        const port = await readPort();
        if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
          throw new Error('Local RedactGuard API is still starting');
        }
        return `http://127.0.0.1:${port}/api`;
      })();
    }
    try {
      resolved = await pending;
      return resolved;
    } finally {
      pending = null;
    }
  };
}
