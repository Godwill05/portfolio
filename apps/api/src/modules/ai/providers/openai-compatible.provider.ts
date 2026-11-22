import { AiProviderKind } from '../../../common/constants/domain';
import { BaseProvider } from './base.provider';
import {
  ProviderError,
  type CompletionOptions,
  type CompletionResult,
  type HealthCheckResult,
  type IAiProvider,
  type ProviderConfig,
  type ProviderModelInfo,
  type StreamChunk,
} from './provider.interface';

/**
 * Covers every `/v1/chat/completions` compatible API:
 * OpenAI, OpenRouter, DeepSeek, Mistral, Groq, Together, Ollama, vLLM, LM Studio…
 * Differences are limited to base URL, auth header and a few params.
 */
export class OpenAiCompatibleProvider extends BaseProvider implements IAiProvider {
  readonly kind: AiProviderKind;

  constructor(
    config: ProviderConfig,
    private readonly options: {
      /** Human label used in error messages. */
      label: string;
      extraHeaders?: Record<string, string>;
    },
  ) {
    super(config);
    this.kind = config.kind;
  }

  private get baseUrl(): string {
    const fallback =
      this.kind === AiProviderKind.OPENROUTER
        ? 'https://openrouter.ai/api/v1'
        : this.kind === AiProviderKind.DEEPSEEK
          ? 'https://api.deepseek.com/v1'
          : this.kind === AiProviderKind.MISTRAL
            ? 'https://api.mistral.ai/v1'
            : 'https://api.openai.com/v1';
    return (this.config.baseUrl ?? fallback).replace(/\/$/, '');
  }

  protected override headers(): Record<string, string> {
    return {
      ...super.headers(),
      authorization: `Bearer ${this.config.apiKey}`,
      ...(this.kind === AiProviderKind.OPENROUTER
        ? {
            'http-referer': 'https://folioforge.app',
            'x-title': 'FolioForge',
          }
        : {}),
      ...(this.options.extraHeaders ?? {}),
    };
  }

  private buildBody(options: CompletionOptions, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      stream,
    };
    if (options.maxOutputTokens) body['max_tokens'] = options.maxOutputTokens;
    if (options.topP !== undefined) body['top_p'] = options.topP;
    if (options.stop?.length) body['stop'] = options.stop;
    if (options.jsonMode) body['response_format'] = { type: 'json_object' };
    if (stream) body['stream_options'] = { include_usage: true };
    return { ...body, ...(options.extraParams ?? {}) };
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    return this.withRetry(async () => {
      const response = await this.request(
        `${this.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(this.buildBody(options, false)),
          signal: options.signal,
        },
        this.options.label,
      );

      const json = (await response.json()) as {
        choices?: { message?: { content?: string }; finish_reason?: string }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        model?: string;
        error?: { message?: string };
      };

      if (json.error) {
        throw new ProviderError(json.error.message ?? 'Erreur fournisseur', 'SERVER', false);
      }
      const content = json.choices?.[0]?.message?.content ?? '';
      if (!content) {
        throw new ProviderError('Réponse vide du fournisseur', 'CONTENT_FILTER', false);
      }

      return {
        content,
        model: json.model ?? options.model,
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
        totalTokens:
          json.usage?.total_tokens ?? (json.usage?.prompt_tokens ?? 0) + (json.usage?.completion_tokens ?? 0),
        finishReason: json.choices?.[0]?.finish_reason ?? null,
      };
    });
  }

  async *stream(options: CompletionOptions): AsyncGenerator<StreamChunk, void, unknown> {
    const response = await this.request(
      `${this.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: { ...this.headers(), accept: 'text/event-stream' },
        body: JSON.stringify(this.buildBody(options, true)),
        signal: options.signal,
      },
      this.options.label,
    );

    let promptTokens = 0;
    let completionTokens = 0;

    for await (const payload of this.readSse(response, options.signal)) {
      if (payload === '[DONE]') {
        yield { delta: '', done: true, promptTokens, completionTokens };
        return;
      }
      try {
        const parsed = JSON.parse(payload) as {
          choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const delta = parsed.choices?.[0]?.delta?.content ?? '';
        if (parsed.usage) {
          promptTokens = parsed.usage.prompt_tokens ?? promptTokens;
          completionTokens = parsed.usage.completion_tokens ?? completionTokens;
        }
        if (delta) yield { delta, done: false };
      } catch {
        // Ignore malformed keep-alive fragments.
      }
    }
    yield { delta: '', done: true, promptTokens, completionTokens };
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    return this.withRetry(async () => {
      const response = await this.request(
        `${this.baseUrl}/models`,
        { method: 'GET', headers: this.headers(), signal: undefined },
        this.options.label,
      );
      const json = (await response.json()) as {
        data?: {
          id: string;
          name?: string;
          context_length?: number;
          pricing?: { prompt?: string; completion?: string };
        }[];
      };
      return (json.data ?? [])
        .filter((m) => typeof m.id === 'string')
        .map((m) => ({
          modelId: m.id,
          displayName: m.name ?? m.id,
          contextWindow: m.context_length,
          inputPricePerMTok: m.pricing?.prompt ? Number(m.pricing.prompt) * 1_000_000 : undefined,
          outputPricePerMTok: m.pricing?.completion
            ? Number(m.pricing.completion) * 1_000_000
            : undefined,
        }))
        .sort((a, b) => a.modelId.localeCompare(b.modelId));
    });
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const started = Date.now();
    try {
      const models = await this.listModels();
      return {
        ok: true,
        message: `Connexion établie — ${models.length} modèle(s) détecté(s).`,
        latencyMs: Date.now() - started,
        models,
      };
    } catch (error) {
      const err = error as ProviderError;
      return {
        ok: false,
        message: err.message,
        latencyMs: Date.now() - started,
      };
    }
  }
}
