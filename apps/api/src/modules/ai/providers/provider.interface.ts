import type { AiProviderKind } from '../../../common/constants/domain';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  /** Ask the provider for a JSON object when supported. */
  jsonMode?: boolean;
  /** Abort early (client disconnects, timeouts). */
  signal?: AbortSignal;
  topP?: number;
  stop?: string[];
  /** Extra provider-native parameters configured per model by the admin. */
  extraParams?: Record<string, unknown>;
}

export interface CompletionResult {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  finishReason: string | null;
  raw?: unknown;
}

export interface StreamChunk {
  delta: string;
  done: boolean;
  promptTokens?: number;
  completionTokens?: number;
}

export interface ProviderConfig {
  kind: AiProviderKind;
  baseUrl: string | null;
  apiKey: string;
  extraHeaders: Record<string, string> | null;
  timeoutMs: number;
  maxRetries: number;
}

export interface ProviderModelInfo {
  modelId: string;
  displayName: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  inputPricePerMTok?: number;
  outputPricePerMTok?: number;
  description?: string;
}

export interface HealthCheckResult {
  ok: boolean;
  message: string;
  latencyMs: number;
  models?: ProviderModelInfo[];
}

/**
 * Every provider integration implements this contract. Business code only ever
 * talks to `IAiProvider`, so adding a provider never touches feature modules.
 */
export interface IAiProvider {
  readonly kind: AiProviderKind;

  complete(options: CompletionOptions): Promise<CompletionResult>;

  stream(options: CompletionOptions): AsyncGenerator<StreamChunk, void, unknown>;

  listModels(): Promise<ProviderModelInfo[]>;

  healthCheck(): Promise<HealthCheckResult>;
}

/** Thrown by adapters so the routing layer can apply retry/fallback policy. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'AUTH'
      | 'RATE_LIMIT'
      | 'TIMEOUT'
      | 'BAD_REQUEST'
      | 'SERVER'
      | 'NETWORK'
      | 'UNSUPPORTED'
      | 'CONTENT_FILTER'
      | 'CONFIG',
    public readonly retryable: boolean,
    public readonly statusCode?: number,
    public readonly providerKind?: AiProviderKind,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
