import { Injectable, Logger } from '@nestjs/common';
import { AiProviderKind } from '../../../common/constants/domain';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';
import { AnthropicProvider } from './anthropic.provider';
import { GeminiProvider } from './gemini.provider';
import type { IAiProvider, ProviderConfig } from './provider.interface';

/**
 * Adapter registry. Adding a provider = one adapter + one case here
 * (no change in any feature module).
 */
@Injectable()
export class ProviderFactory {
  private readonly logger = new Logger(ProviderFactory.name);

  create(kind: AiProviderKind, config: ProviderConfig): IAiProvider {
    switch (kind) {
      case AiProviderKind.ANTHROPIC:
        return new AnthropicProvider(config);
      case AiProviderKind.GEMINI:
        return new GeminiProvider(config);
      case AiProviderKind.OPENAI:
        return new OpenAiCompatibleProvider(config, { label: 'OpenAI' });
      case AiProviderKind.OPENROUTER:
        return new OpenAiCompatibleProvider(config, { label: 'OpenRouter' });
      case AiProviderKind.MISTRAL:
        return new OpenAiCompatibleProvider(config, { label: 'Mistral' });
      case AiProviderKind.DEEPSEEK:
        return new OpenAiCompatibleProvider(config, { label: 'DeepSeek' });
      case AiProviderKind.OPENAI_COMPATIBLE:
        return new OpenAiCompatibleProvider(config, { label: 'Provider compatible OpenAI' });
      default: {
        const exhaustive: never = kind;
        this.logger.error(`Provider non supporté: ${String(exhaustive)}`);
        throw new Error(`Provider non supporté: ${String(kind)}`);
      }
    }
  }
}
