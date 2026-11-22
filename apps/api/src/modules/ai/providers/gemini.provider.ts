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
 * Google Gemini (generateContent / streamGenerateContent) adapter.
 * Auth via `x-goog-api-key`; roles are `user` / `model`.
 */
export class GeminiProvider extends BaseProvider implements IAiProvider {
  readonly kind = AiProviderKind.GEMINI;

  private get baseUrl(): string {
    return (
      this.config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta'
    ).replace(/\/$/, '');
  }

  protected override headers(): Record<string, string> {
    return {
      ...super.headers(),
      'x-goog-api-key': this.config.apiKey,
      ...(this.config.extraHeaders ?? {}),
    };
  }

  private buildBody(options: CompletionOptions) {
    const systemInstruction = options.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const contents = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxOutputTokens ?? 2048,
        ...(options.topP !== undefined ? { topP: options.topP } : {}),
        ...(options.stop?.length ? { stopSequences: options.stop } : {}),
        ...(options.jsonMode ? { responseMimeType: 'application/json' } : {}),
      },
      ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
      ...(options.extraParams ?? {}),
    };
    return body;
  }

  private extractText(json: {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  }): string {
    return (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('');
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    return this.withRetry(async () => {
      const response = await this.request(
        `${this.baseUrl}/models/${encodeURIComponent(options.model)}:generateContent`,
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(this.buildBody(options)),
          signal: options.signal,
        },
        'Gemini',
      );
      const json = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
        promptFeedback?: { blockReason?: string };
        error?: { message?: string };
      };
      if (json.error) throw new ProviderError(json.error.message ?? 'Erreur Gemini', 'SERVER', false);
      if (json.promptFeedback?.blockReason) {
        throw new ProviderError(
          `Contenu bloqué par les filtres de sécurité Google (${json.promptFeedback.blockReason}).`,
          'CONTENT_FILTER',
          false,
        );
      }
      const content = this.extractText(json);
      if (!content) throw new ProviderError('Réponse vide de Gemini', 'CONTENT_FILTER', false);

      return {
        content,
        model: options.model,
        promptTokens: json.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: json.usageMetadata?.totalTokenCount ?? 0,
        finishReason: json.candidates?.[0]?.finishReason ?? null,
      };
    });
  }

  async *stream(options: CompletionOptions): AsyncGenerator<StreamChunk, void, unknown> {
    const url = `${this.baseUrl}/models/${encodeURIComponent(options.model)}:streamGenerateContent?alt=sse`;
    const response = await this.request(
      url,
      {
        method: 'POST',
        headers: { ...this.headers(), accept: 'text/event-stream' },
        body: JSON.stringify(this.buildBody(options)),
        signal: options.signal,
      },
      'Gemini',
    );

    let promptTokens = 0;
    let completionTokens = 0;

    for await (const payload of this.readSse(response, options.signal)) {
      try {
        const json = JSON.parse(payload) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        };
        const text = this.extractText(json);
        if (json.usageMetadata) {
          promptTokens = json.usageMetadata.promptTokenCount ?? promptTokens;
          completionTokens = json.usageMetadata.candidatesTokenCount ?? completionTokens;
        }
        if (text) yield { delta: text, done: false };
      } catch {
        // ignore
      }
    }
    yield { delta: '', done: true, promptTokens, completionTokens };
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    return this.withRetry(async () => {
      const response = await this.request(
        `${this.baseUrl}/models?pageSize=100`,
        { method: 'GET', headers: this.headers(), signal: undefined },
        'Gemini',
      );
      const json = (await response.json()) as {
        models?: {
          name: string;
          displayName?: string;
          inputTokenLimit?: number;
          outputTokenLimit?: number;
          supportedGenerationMethods?: string[];
        }[];
      };
      return (json.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => ({
          modelId: m.name.replace(/^models\//, ''),
          displayName: m.displayName ?? m.name,
          contextWindow: m.inputTokenLimit,
          maxOutputTokens: m.outputTokenLimit,
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
