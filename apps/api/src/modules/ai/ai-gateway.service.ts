import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiFeature, AiTaskType } from '../../common/constants/domain';
import { AiModel, AiProvider, AiTaskRoute, AiUsageLog } from '../../database/entities/platform.entity';
import { Errors } from '../../common/utils/errors';
import { AiProviderService } from './provider.service';
import { SettingsService } from '../settings/settings.service';
import {
  ProviderError,
  type ChatMessage,
  type CompletionResult,
  type IAiProvider,
  type StreamChunk,
} from './providers/provider.interface';

export interface CompletionRequest {
  feature: AiFeature;
  task?: AiTaskType;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  jsonMode?: boolean;
  /** Explicit model chosen by the user (validated against enabled models). */
  modelId?: string | null;
  userId?: string | null;
  signal?: AbortSignal;
}

interface ResolvedTarget {
  provider: AiProvider;
  model: AiModel;
  temperature: number;
  maxOutputTokens: number;
}

/**
 * Single entry point for every AI call:
 * routing slot → user model choice → default provider → fallback,
 * with cost logging and hard output caps.
 */
@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);

  constructor(
    @InjectRepository(AiProvider) private readonly providers: Repository<AiProvider>,
    @InjectRepository(AiModel) private readonly models: Repository<AiModel>,
    @InjectRepository(AiTaskRoute) private readonly routes: Repository<AiTaskRoute>,
    @InjectRepository(AiUsageLog) private readonly usage: Repository<AiUsageLog>,
    private readonly providerService: AiProviderService,
    private readonly settings: SettingsService,
  ) {}

  private async resolveTargets(request: CompletionRequest): Promise<ResolvedTarget[]> {
    const limits = this.settings.aiLimits;
    const targets: ResolvedTarget[] = [];
    const seen = new Set<string>();

    const push = async (modelId: string | null | undefined, temperature: number, maxOut: number) => {
      if (!modelId || seen.has(modelId)) return;
      const model = await this.models.findOne({
        where: { id: modelId, isActive: true },
        relations: { provider: true },
      });
      if (!model?.provider?.isActive) return;
      seen.add(modelId);
      targets.push({
        provider: model.provider,
        model,
        temperature: Math.min(2, Math.max(0, temperature)),
        maxOutputTokens: Math.min(
          limits.maxOutputTokens,
          maxOut > 0 ? maxOut : model.maxOutputTokens,
          request.maxOutputTokens ?? Number.MAX_SAFE_INTEGER,
        ),
      });
    };

    // 1. Explicit model chosen by the user (only if active).
    if (request.modelId && this.settings.aiRouting.allowUserModelChoice) {
      await push(request.modelId, request.temperature ?? 0.7, 0);
    }

    // 2. Routing slot configured by the admin.
    const slot = request.task ?? this.defaultTaskFor(request.feature);
    const route = await this.routes.findOne({ where: { task: slot } });
    if (route) {
      await push(route.primaryModelId, Number(route.temperature), route.maxOutputTokens);
      await push(route.fallbackModelId, Number(route.temperature), route.maxOutputTokens);
    }

    // 3. Provider default model.
    const defaultModel = await this.models.findOne({
      where: { isDefault: true, isActive: true } as never,
      relations: { provider: true },
    });
    if (defaultModel) await push(defaultModel.id, request.temperature ?? 0.7, 0);

    // 4. Any active model from the default provider, then any active provider.
    if (targets.length === 0) {
      const activeProviders = await this.providers.find({
        where: { isActive: true },
        order: { isDefault: 'DESC', priority: 'DESC' },
      });
      for (const provider of activeProviders) {
        const model =
          (await this.models.findOne({
            where: { providerId: provider.id, isActive: true, isDefault: true },
          })) ??
          (await this.models.findOne({
            where: { providerId: provider.id, isActive: true },
            order: { sortOrder: 'ASC' },
          }));
        if (model) {
          await push(model.id, request.temperature ?? 0.7, 0);
          if (targets.length >= 3) break;
        }
      }
    }

    return targets;
  }

  private defaultTaskFor(feature: AiFeature): AiTaskType {
    switch (feature) {
      case AiFeature.CV_GENERATE:
      case AiFeature.CV_OPTIMIZE:
        return AiTaskType.CV;
      case AiFeature.JOB_ANALYSIS:
        return AiTaskType.JOB_ANALYSIS;
      case AiFeature.CHAT:
        return AiTaskType.CHAT;
      case AiFeature.CAREER_COACH:
        return AiTaskType.COMPLEX;
      case AiFeature.COVER_LETTER:
        return AiTaskType.CV;
      default:
        return AiTaskType.SIMPLE;
    }
  }

  private estimateCost(target: ResolvedTarget, promptTokens: number, completionTokens: number): number {
    const inPrice = Number(target.model.inputPricePerMTok ?? 0);
    const outPrice = Number(target.model.outputPricePerMTok ?? 0);
    return (promptTokens / 1_000_000) * inPrice + (completionTokens / 1_000_000) * outPrice;
  }

  private async record(
    request: CompletionRequest,
    target: ResolvedTarget | null,
    meta: {
      promptTokens: number;
      completionTokens: number;
      latencyMs: number;
      success: boolean;
      errorCode?: string;
    },
  ): Promise<void> {
    try {
      await this.usage.insert({
        userId: request.userId ?? null,
        feature: request.feature,
        providerId: target?.provider.id ?? null,
        modelRef: target?.model.modelId ?? null,
        promptTokens: meta.promptTokens,
        completionTokens: meta.completionTokens,
        latencyMs: meta.latencyMs,
        estimatedCostUsd: target
          ? this.estimateCost(target, meta.promptTokens, meta.completionTokens).toFixed(6)
          : '0',
        success: meta.success,
        errorCode: meta.errorCode ?? null,
        countedAgainstQuota: meta.success,
      });
    } catch (error) {
      this.logger.error(`Impossible d'enregistrer l'usage IA: ${(error as Error).message}`);
    }
  }

  /** Non-streaming completion with automatic failover across targets. */
  async complete(request: CompletionRequest): Promise<CompletionResult & { providerId: string; modelRef: string }> {
    const targets = await this.resolveTargets(request);
    if (targets.length === 0) {
      throw Errors.aiUnavailable(
        'Aucun modèle IA n’est configuré. Un administrateur doit ajouter un provider dans le tableau de bord.',
      );
    }

    const limits = this.settings.aiLimits;
    const inputChars = request.messages.reduce((sum, m) => sum + m.content.length, 0);
    if (inputChars > limits.maxInputChars) {
      throw Errors.validation(
        `La requête dépasse la limite de ${limits.maxInputChars.toLocaleString('fr-FR')} caractères.`,
      );
    }

    let lastError: unknown;
    for (const target of targets) {
      const started = Date.now();
      try {
        const adapter = await this.providerService.buildAdapter(target.provider);
        const result = await adapter.complete({
          model: target.model.modelId,
          messages: request.messages,
          temperature: target.temperature,
          maxOutputTokens: target.maxOutputTokens,
          jsonMode: request.jsonMode,
          signal: request.signal,
          extraParams: target.model.params ?? undefined,
        });
        await this.record(request, target, {
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          latencyMs: Date.now() - started,
          success: true,
        });
        return { ...result, providerId: target.provider.id, modelRef: target.model.modelId };
      } catch (error) {
        lastError = error;
        const code = error instanceof ProviderError ? error.code : 'SERVER';
        await this.record(request, target, {
          promptTokens: 0,
          completionTokens: 0,
          latencyMs: Date.now() - started,
          success: false,
          errorCode: code,
        });
        this.logger.warn(
          `Échec ${target.provider.name}/${target.model.modelId} (${code}): ${(error as Error).message}`,
        );
        // Auth/config errors will not resolve by trying the same provider again.
        if (error instanceof ProviderError && error.code === 'AUTH' && targets.length === 1) {
          throw Errors.aiUnavailable(
            'La clé API du provider IA est invalide. Contactez l’administrateur.',
          );
        }
      }
    }

    if (lastError instanceof ProviderError && lastError.code === 'RATE_LIMIT') {
      throw Errors.aiUnavailable('Les fournisseurs IA sont saturés. Réessayez dans quelques instants.');
    }
    throw Errors.aiUnavailable(
      'Tous les fournisseurs IA ont échoué. Réessayez plus tard ou changez de modèle.',
    );
  }

  /**
   * Streaming completion. Falls back to the next target only if the failure
   * happens before any token was emitted.
   */
  async *stream(request: CompletionRequest): AsyncGenerator<
    StreamChunk & { providerId?: string; modelRef?: string },
    void,
    unknown
  > {
    const targets = await this.resolveTargets(request);
    if (targets.length === 0) {
      throw Errors.aiUnavailable(
        'Aucun modèle IA n’est configuré. Un administrateur doit ajouter un provider.',
      );
    }

    const limits = this.settings.aiLimits;
    const inputChars = request.messages.reduce((sum, m) => sum + m.content.length, 0);
    if (inputChars > limits.maxInputChars) {
      throw Errors.validation(
        `La requête dépasse la limite de ${limits.maxInputChars.toLocaleString('fr-FR')} caractères.`,
      );
    }

    let lastError: unknown;
    for (const target of targets) {
      const started = Date.now();
      let emitted = false;
      let promptTokens = 0;
      let completionTokens = 0;
      let adapter: IAiProvider | null = null;
      try {
        adapter = await this.providerService.buildAdapter(target.provider);
        const iterator = adapter.stream({
          model: target.model.modelId,
          messages: request.messages,
          temperature: target.temperature,
          maxOutputTokens: target.maxOutputTokens,
          signal: request.signal,
          extraParams: target.model.params ?? undefined,
        });

        for await (const chunk of iterator) {
          if (chunk.delta) emitted = true;
          if (chunk.promptTokens) promptTokens = chunk.promptTokens;
          if (chunk.completionTokens) completionTokens = chunk.completionTokens;
          yield { ...chunk, providerId: target.provider.id, modelRef: target.model.modelId };
        }

        await this.record(request, target, {
          promptTokens,
          completionTokens,
          latencyMs: Date.now() - started,
          success: true,
        });
        return;
      } catch (error) {
        lastError = error;
        const code = error instanceof ProviderError ? error.code : 'SERVER';
        await this.record(request, target, {
          promptTokens,
          completionTokens,
          latencyMs: Date.now() - started,
          success: false,
          errorCode: emitted ? 'STREAM_INTERRUPTED' : code,
        });
        if (emitted) {
          // Partial output already sent: surface a terminal error chunk.
          yield { delta: '', done: true };
          throw Errors.aiUnavailable('La génération a été interrompue. Réessayez.');
        }
        this.logger.warn(
          `Stream échoué ${target.provider.name}/${target.model.modelId} (${code})`,
        );
      }
    }

    if (lastError instanceof ProviderError && lastError.code === 'RATE_LIMIT') {
      throw Errors.aiUnavailable('Les fournisseurs IA sont saturés. Réessayez dans un instant.');
    }
    throw Errors.aiUnavailable('Tous les fournisseurs IA ont échoué.');
  }

  /** Cheap guard so the UI can hide the assistant when nothing is configured. */
  async isConfigured(): Promise<boolean> {
    const count = await this.providers.count({ where: { isActive: true } });
    if (count === 0) return false;
    const modelCount = await this.models.count({ where: { isActive: true } });
    return modelCount > 0;
  }
}
