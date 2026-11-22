import { AiProviderKind } from '../../../common/constants/domain';
import { BaseProvider } from './base.provider';
import {
  ProviderError,
  type CompletionOptions,
  type CompletionResult,
  type HealthCheckResult,
  type IAiProvider,
  type ProviderModelInfo,
  type StreamChunk,
} from './provider.interface';

/**
 * Anthropic Messages API adapter.
 * Key differences vs OpenAI: system prompt is a top-level field,
 * `max_tokens` is mandatory, content is an array of blocks, auth via `x-api-key`.
 */
export class AnthropicProvider extends BaseProvider implements IAiProvider {
  readonly kind = AiProviderKind.ANTHROPIC;

  private get baseUrl(): string {
    return (this.config.baseUrl ?? 'https://api.anthropic.com/v1').replace(/\/$/, '');
  }

  protected override headers(): Record<string, string> {
    return {
      ...super.headers(),
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2023-06-01',
      ...(this.config.extraHeaders ?? {}),
    };
  }

  private splitMessages(messages: CompletionOptions['messages']) {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const conversation = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
    return { system, conversation };
  }

  private buildBody(options: CompletionOptions, stream: boolean): Record<string, unknown> {
    const { system, conversation } = this.splitMessages(options.messages);
    const body: Record<string, unknown> = {
      model: options.model,
      max_tokens: options.maxOutputTokens ?? 2048,
      temperature: options.temperature ?? 0.7,
      messages: conversation,
      stream,
    };
    if (system) body['system'] = system;
    if (options.topP !== undefined) body['top_p'] = options.topP;
    if (options.stop?.length) body['stop_sequences'] = options.stop;
    if (stream) body['stream'] = true;
    return { ...body, ...(options.extraParams ?? {}) };
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    return this.withRetry(async () => {
      const response = await this.request(
        `${this.baseUrl}/messages`,
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(this.buildBody(options, false)),
          signal: options.signal,
        },
        'Anthropic',
      );
      const json = (await response.json()) as {
        content?: { type: string; text?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
        model?: string;
        stop_reason?: string;
        error?: { message?: string };
      };
      if (json.error) throw new ProviderError(json.error.message ?? 'Erreur Anthropic', 'SERVER', false);

      const content = (json.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('');
      if (!content) throw new ProviderError('Réponse vide d’Anthropic', 'CONTENT_FILTER', false);

      const promptTokens = json.usage?.input_tokens ?? 0;
      const completionTokens = json.usage?.output_tokens ?? 0;

      return {
        content,
        model: json.model ?? options.model,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        finishReason: json.stop_reason ?? null,
      };
    });
  }

  async *stream(options: CompletionOptions): AsyncGenerator<StreamChunk, void, unknown> {
    const response = await this.request(
      `${this.baseUrl}/messages`,
      {
        method: 'POST',
        headers: { ...this.headers(), accept: 'text/event-stream' },
        body: JSON.stringify(this.buildBody(options, true)),
        signal: options.signal,
      },
      'Anthropic',
    );

    let promptTokens = 0;
    let completionTokens = 0;

    for await (const payload of this.readSse(response, options.signal)) {
      if (payload === '[DONE]') break;
      try {
        const event = JSON.parse(payload) as {
          type?: string;
          delta?: { type?: string; text?: string };
          message?: { usage?: { input_tokens?: number } };
          usage?: { output_tokens?: number };
        };
        if (event.type === 'message_start') promptTokens = event.message?.usage?.input_tokens ?? 0;
        if (event.type === 'content_block_delta' && event.delta?.text) {
          yield { delta: event.delta.text, done: false };
        }
        if (event.type === 'message_delta') completionTokens = event.usage?.output_tokens ?? 0;
        if (event.type === 'message_stop') {
          yield { delta: '', done: true, promptTokens, completionTokens };
          return;
        }
      } catch {
        // ignore partial events
      }
    }
    yield { delta: '', done: true, promptTokens, completionTokens };
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    return this.withRetry(async () => {
      const response = await this.request(
        `${this.baseUrl}/models?limit=100`,
        { method: 'GET', headers: this.headers(), signal: undefined },
        'Anthropic',
      );
      const json = (await response.json()) as {
        data?: { id: string; display_name?: string; created_at?: string }[];
      };
      return (json.data ?? []).map((m) => ({
        modelId: m.id,
        displayName: m.display_name ?? m.id,
      }));
    });
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const started = Date.now();
    try {
      const models = await this.listModels();
      return {
        ok: true,
        message: `Connexion établie — ${models.length} modèle(s) disponible(s).`,
        latencyMs: Date.now() - started,
        models,
      };
    } catch (error) {
      return { ok: false, message: (error as ProviderError).message, latencyMs: Date.now() - started };
    }
  }
}
