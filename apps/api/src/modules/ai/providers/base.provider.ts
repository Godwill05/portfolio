import { ProviderError, type ProviderConfig } from './provider.interface';

/**
 * Shared HTTP plumbing: timeout, retries with jittered backoff,
 * consistent error classification. Adapters only map payloads.
 */
export abstract class BaseProvider {
  constructor(protected readonly config: ProviderConfig) {}

  protected headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      ...(this.config.extraHeaders ?? {}),
    };
  }

  /** Fetch with hard timeout and abort propagation. */
  protected async request(
    url: string,
    init: RequestInit,
    label: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const externalSignal = init.signal;
    const onAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onAbort);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw this.classifyError(response.status, body, label);
      }
      return response;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if ((error as Error).name === 'AbortError') {
        throw new ProviderError(`Délai dépassé auprès de ${label}`, 'TIMEOUT', true);
      }
      throw new ProviderError(
        `Erreur réseau vers ${label}: ${(error as Error).message}`,
        'NETWORK',
        true,
      );
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', onAbort);
    }
  }

  protected classifyError(status: number, body: string, label: string): ProviderError {
    const trimmed = body.slice(0, 500);
    if (status === 401 || status === 403) {
      return new ProviderError(
        `Clé API ${label} refusée. Vérifiez la configuration du provider.`,
        'AUTH',
        false,
        status,
      );
    }
    if (status === 429) {
      return new ProviderError(`${label} a renvoyé une limite de débit (429).`, 'RATE_LIMIT', true, status);
    }
    if (status === 400 || status === 422) {
      return new ProviderError(`Requête refusée par ${label}: ${trimmed}`, 'BAD_REQUEST', false, status);
    }
    if (status >= 500) {
      return new ProviderError(`${label} est indisponible (${status}).`, 'SERVER', true, status);
    }
    return new ProviderError(`${label} a renvoyé une erreur ${status}: ${trimmed}`, 'SERVER', false, status);
  }

  /** Exponential backoff with jitter; never retries non-retryable errors. */
  protected async withRetry<T>(fn: () => Promise<T>, attempts = this.config.maxRetries + 1): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const retryable = error instanceof ProviderError ? error.retryable : false;
        if (!retryable || attempt === attempts - 1) break;
        const delay = Math.min(4000, 400 * 2 ** attempt) + Math.random() * 250;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  /** Reads an SSE stream and yields raw `data:` payload lines. */
  protected async *readSse(response: Response, signal?: AbortSignal): AsyncGenerator<string> {
    if (!response.body) throw new ProviderError('Réponse de streaming vide', 'SERVER', true);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        if (signal?.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed.startsWith('data:')) {
            const payload = trimmed.slice(5).trim();
            if (payload) yield payload;
          }
        }
      }
      if (buffer.trim().startsWith('data:')) {
        const payload = buffer.trim().slice(5).trim();
        if (payload) yield payload;
      }
    } finally {
      reader.releaseLock();
    }
  }


}
