import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiProviderKind, AiTaskType } from '../../common/constants/domain';
import { AiModel, AiProvider, AiTaskRoute } from '../../database/entities/platform.entity';
import { SecretCipher } from '../../common/utils/crypto.util';
import { AppConfig } from '../../config/app-config';
import { Errors } from '../../common/utils/errors';
import { ProviderFactory } from './providers/provider.factory';
import type { HealthCheckResult, ProviderModelInfo } from './providers/provider.interface';
import type { IAiProvider } from './providers/provider.interface';

export interface ProviderView {
  id: string;
  slug: string;
  name: string;
  kind: AiProviderKind;
  baseUrl: string | null;
  apiKeyHint: string | null;
  hasApiKey: boolean;
  isActive: boolean;
  isDefault: boolean;
  priority: number;
  timeoutMs: number;
  maxRetries: number;
  requestsPerMinute: number;
  dailyRequestLimit: number;
  monthlyBudgetCents: number;
  lastHealthCheckAt: Date | null;
  lastHealthCheckOk: boolean | null;
  lastHealthCheckMessage: string | null;
  models: {
    id: string;
    modelId: string;
    displayName: string;
    isActive: boolean;
    isDefault: boolean;
    contextWindow: number;
    maxOutputTokens: number;
    inputPricePerMTok: string;
    outputPricePerMTok: string;
  }[];
}

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);
  private readonly cipher: SecretCipher;

  constructor(
    @InjectRepository(AiProvider) private readonly providers: Repository<AiProvider>,
    @InjectRepository(AiModel) private readonly models: Repository<AiModel>,
    @InjectRepository(AiTaskRoute) private readonly routes: Repository<AiTaskRoute>,
    private readonly factory: ProviderFactory,
    private readonly config: AppConfig,
  ) {
    this.cipher = new SecretCipher(config.encryptionKey);
  }

  /** Builds a ready-to-use adapter. API keys are decrypted only in memory. */
  async buildAdapter(provider: AiProvider): Promise<IAiProvider> {
    const row = await this.providers
      .createQueryBuilder('p')
      .addSelect('p.apiKeyEncrypted')
      .where('p.id = :id', { id: provider.id })
      .getOne();
    if (!row) throw Errors.notFound('Provider');
    if (!row.apiKeyEncrypted) {
      throw Errors.validation(`Aucune clé API configurée pour le provider ${row.name}.`);
    }
    const apiKey = this.cipher.decrypt(row.apiKeyEncrypted);
    return this.factory.create(row.kind, {
      kind: row.kind,
      baseUrl: row.baseUrl,
      apiKey,
      extraHeaders: row.extraHeaders,
      timeoutMs: row.timeoutMs,
      maxRetries: row.maxRetries,
    });
  }

  private toView(provider: AiProvider, models: AiModel[]): ProviderView {
    return {
      id: provider.id,
      slug: provider.slug,
      name: provider.name,
      kind: provider.kind,
      baseUrl: provider.baseUrl,
      apiKeyHint: provider.apiKeyHint,
      hasApiKey: Boolean(provider.apiKeyHint),
      isActive: provider.isActive,
      isDefault: provider.isDefault,
      priority: provider.priority,
      timeoutMs: provider.timeoutMs,
      maxRetries: provider.maxRetries,
      requestsPerMinute: provider.requestsPerMinute,
      dailyRequestLimit: provider.dailyRequestLimit,
      monthlyBudgetCents: provider.monthlyBudgetCents,
      lastHealthCheckAt: provider.lastHealthCheckAt,
      lastHealthCheckOk: provider.lastHealthCheckOk,
      lastHealthCheckMessage: provider.lastHealthCheckMessage,
      models: models.map((m) => ({
        id: m.id,
        modelId: m.modelId,
        displayName: m.displayName,
        isActive: m.isActive,
        isDefault: m.isDefault,
        contextWindow: m.contextWindow,
        maxOutputTokens: m.maxOutputTokens,
        inputPricePerMTok: m.inputPricePerMTok,
        outputPricePerMTok: m.outputPricePerMTok,
      })),
    };
  }

  async list(): Promise<ProviderView[]> {
    const providers = await this.providers.find({ order: { priority: 'DESC', name: 'ASC' } });
    const models = await this.models.find({ order: { sortOrder: 'ASC', displayName: 'ASC' } });
    return providers.map((p) => this.toView(p, models.filter((m) => m.providerId === p.id)));
  }

  async get(id: string): Promise<ProviderView> {
    const provider = await this.providers.findOne({ where: { id } });
    if (!provider) throw Errors.notFound('Provider');
    const models = await this.models.find({ where: { providerId: id }, order: { sortOrder: 'ASC' } });
    return this.toView(provider, models);
  }

  async create(input: {
    slug: string;
    name: string;
    kind: AiProviderKind;
    baseUrl?: string | null;
    apiKey?: string;
    extraHeaders?: Record<string, string> | null;
    isActive?: boolean;
    priority?: number;
  }): Promise<ProviderView> {
    const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (await this.providers.exists({ where: { slug } })) {
      throw Errors.conflict('Ce slug de provider existe déjà.', 'PROVIDER_SLUG_TAKEN');
    }
    const provider = this.providers.create({
      slug,
      name: input.name.trim(),
      kind: input.kind,
      baseUrl: input.baseUrl ?? null,
      apiKeyEncrypted: input.apiKey ? this.cipher.encrypt(input.apiKey) : null,
      apiKeyHint: input.apiKey ? SecretCipher.hint(input.apiKey) : null,
      extraHeaders: input.extraHeaders ?? null,
      isActive: input.isActive ?? true,
      priority: input.priority ?? 0,
    });
    await this.providers.save(provider);
    return this.get(provider.id);
  }

  async update(
    id: string,
    patch: {
      name?: string;
      baseUrl?: string | null;
      apiKey?: string | null;
      extraHeaders?: Record<string, string> | null;
      isActive?: boolean;
      isDefault?: boolean;
      priority?: number;
      timeoutMs?: number;
      maxRetries?: number;
      requestsPerMinute?: number;
      dailyRequestLimit?: number;
      monthlyBudgetCents?: number;
    },
  ): Promise<ProviderView> {
    const provider = await this.providers.findOne({ where: { id } });
    if (!provider) throw Errors.notFound('Provider');

    const update: Partial<AiProvider> = {};
    if (patch.name !== undefined) update.name = patch.name.trim();
    if (patch.baseUrl !== undefined) update.baseUrl = patch.baseUrl || null;
    if (patch.extraHeaders !== undefined) update.extraHeaders = patch.extraHeaders;
    if (patch.isActive !== undefined) update.isActive = patch.isActive;
    if (patch.priority !== undefined) update.priority = patch.priority;
    if (patch.timeoutMs !== undefined) update.timeoutMs = Math.min(300_000, Math.max(5_000, patch.timeoutMs));
    if (patch.maxRetries !== undefined) update.maxRetries = Math.min(5, Math.max(0, patch.maxRetries));
    if (patch.requestsPerMinute !== undefined) update.requestsPerMinute = patch.requestsPerMinute;
    if (patch.dailyRequestLimit !== undefined) update.dailyRequestLimit = patch.dailyRequestLimit;
    if (patch.monthlyBudgetCents !== undefined) update.monthlyBudgetCents = patch.monthlyBudgetCents;

    if (patch.apiKey !== undefined) {
      if (patch.apiKey === null || patch.apiKey === '') {
        update.apiKeyEncrypted = null;
        update.apiKeyHint = null;
      } else {
        update.apiKeyEncrypted = this.cipher.encrypt(patch.apiKey);
        update.apiKeyHint = SecretCipher.hint(patch.apiKey);
      }
    }

    if (patch.isDefault) {
      // Exactly one default provider at a time.
      await this.providers.update({ isDefault: true }, { isDefault: false });
      update.isDefault = true;
      update.isActive = true;
    } else if (patch.isDefault === false) {
      update.isDefault = false;
    }

    await this.providers.update(id, update);
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const provider = await this.providers.findOne({ where: { id } });
    if (!provider) throw Errors.notFound('Provider');
    if (provider.isDefault) {
      throw Errors.conflict('Impossible de supprimer le provider par défaut. Désignez-en un autre d’abord.');
    }
    await this.providers.delete(id);
  }

  async healthCheck(id: string): Promise<HealthCheckResult> {
    const provider = await this.providers.findOne({ where: { id } });
    if (!provider) throw Errors.notFound('Provider');
    let result: HealthCheckResult;
    try {
      const adapter = await this.buildAdapter(provider);
      result = await adapter.healthCheck();
    } catch (error) {
      result = { ok: false, message: (error as Error).message, latencyMs: 0 };
    }
    await this.providers.update(id, {
      lastHealthCheckAt: new Date(),
      lastHealthCheckOk: result.ok,
      lastHealthCheckMessage: result.message.slice(0, 400),
    });
    return result;
  }

  /** Discovery: pull the provider catalogue and offer it for import. */
  async discoverModels(id: string): Promise<ProviderModelInfo[]> {
    const provider = await this.providers.findOne({ where: { id } });
    if (!provider) throw Errors.notFound('Provider');
    const adapter = await this.buildAdapter(provider);
    return adapter.listModels();
  }

  async importModels(
    id: string,
    models: { modelId: string; displayName?: string; contextWindow?: number; maxOutputTokens?: number }[],
  ): Promise<{ imported: number; skipped: number }> {
    const provider = await this.providers.findOne({ where: { id } });
    if (!provider) throw Errors.notFound('Provider');
    let imported = 0;
    let skipped = 0;
    for (const model of models.slice(0, 200)) {
      const exists = await this.models.exists({ where: { providerId: id, modelId: model.modelId } });
      if (exists) {
        skipped += 1;
        continue;
      }
      await this.models.insert({
        providerId: id,
        modelId: model.modelId.slice(0, 160),
        displayName: (model.displayName ?? model.modelId).slice(0, 160),
        contextWindow: model.contextWindow ?? 8192,
        maxOutputTokens: model.maxOutputTokens ?? 4096,
      });
      imported += 1;
    }
    return { imported, skipped };
  }

  async addModel(
    providerId: string,
    input: {
      modelId: string;
      displayName: string;
      contextWindow?: number;
      maxOutputTokens?: number;
      inputPricePerMTok?: number;
      outputPricePerMTok?: number;
      description?: string;
      params?: Record<string, unknown> | null;
      isActive?: boolean;
    },
  ): Promise<AiModel> {
    const provider = await this.providers.findOne({ where: { id: providerId } });
    if (!provider) throw Errors.notFound('Provider');
    if (await this.models.exists({ where: { providerId, modelId: input.modelId } })) {
      throw Errors.conflict('Ce modèle est déjà configuré pour ce provider.', 'MODEL_EXISTS');
    }
    const model = this.models.create({
      providerId,
      modelId: input.modelId.trim(),
      displayName: input.displayName.trim(),
      contextWindow: input.contextWindow ?? 8192,
      maxOutputTokens: input.maxOutputTokens ?? 4096,
      inputPricePerMTok: String(input.inputPricePerMTok ?? 0),
      outputPricePerMTok: String(input.outputPricePerMTok ?? 0),
      description: input.description ?? null,
      params: input.params ?? null,
      isActive: input.isActive ?? true,
    });
    return this.models.save(model);
  }

  async updateModel(
    modelId: string,
    patch: {
      displayName?: string;
      contextWindow?: number;
      maxOutputTokens?: number;
      inputPricePerMTok?: number;
      outputPricePerMTok?: number;
      description?: string | null;
      params?: Record<string, unknown> | null;
      isActive?: boolean;
      isDefault?: boolean;
    },
  ): Promise<AiModel> {
    const model = await this.models.findOne({ where: { id: modelId } });
    if (!model) throw Errors.notFound('Modèle');
    if (patch.isDefault) {
      await this.models.update({ providerId: model.providerId, isDefault: true }, { isDefault: false });
    }
    const patchPayload: Record<string, unknown> = {
      ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
      ...(patch.contextWindow !== undefined ? { contextWindow: patch.contextWindow } : {}),
      ...(patch.maxOutputTokens !== undefined ? { maxOutputTokens: patch.maxOutputTokens } : {}),
      ...(patch.inputPricePerMTok !== undefined
        ? { inputPricePerMTok: String(patch.inputPricePerMTok) }
        : {}),
      ...(patch.outputPricePerMTok !== undefined
        ? { outputPricePerMTok: String(patch.outputPricePerMTok) }
        : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.params !== undefined ? { params: patch.params } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.isDefault !== undefined ? { isDefault: patch.isDefault } : {}),
    };
    await this.models.update(modelId, patchPayload as never);
    return this.models.findOneOrFail({ where: { id: modelId } });
  }

  async removeModel(modelId: string): Promise<void> {
    const result = await this.models.delete(modelId);
    if (!result.affected) throw Errors.notFound('Modèle');
  }

  // ───────────────────────── routing slots ──────────────────────────

  async listRoutes() {
    const routes = await this.routes.find({ relations: { primaryModel: { provider: true }, fallbackModel: true } });
    return Object.values(AiTaskType).map((task) => {
      const route = routes.find((r) => r.task === task);
      return {
        task,
        primaryModelId: route?.primaryModelId ?? null,
        primaryLabel: route?.primaryModel
          ? `${route.primaryModel.provider?.name ?? '?'} · ${route.primaryModel.displayName}`
          : null,
        fallbackModelId: route?.fallbackModelId ?? null,
        fallbackLabel: route?.fallbackModel?.displayName ?? null,
        temperature: route ? Number(route.temperature) : 0.7,
        maxOutputTokens: route?.maxOutputTokens ?? 0,
      };
    });
  }

  async upsertRoute(
    task: AiTaskType,
    input: { primaryModelId?: string | null; fallbackModelId?: string | null; temperature?: number; maxOutputTokens?: number },
  ) {
    const existing = await this.routes.findOne({ where: { task } });

    // Validate every referenced model before writing, so a bad id returns a
    // clear 422 instead of a raw foreign-key error.
    for (const modelId of [input.primaryModelId, input.fallbackModelId]) {
      if (!modelId) continue;
      if (!(await this.models.exists({ where: { id: modelId } }))) {
        throw Errors.validation('Le modèle sélectionné n’existe pas.');
      }
    }

    const payload = {
      task,
      primaryModelId: input.primaryModelId ?? null,
      fallbackModelId: input.fallbackModelId ?? null,
      temperature: String(Math.min(2, Math.max(0, input.temperature ?? 0.7))),
      maxOutputTokens: input.maxOutputTokens ?? 0,
    };
    if (existing) {
      await this.routes.update(existing.id, payload);
    } else {
      await this.routes.insert(payload);
    }
    return (await this.listRoutes()).find((r) => r.task === task);
  }

  /** Models a regular user may pick, grouped by provider. */
  async userSelectableModels() {
    const models = await this.models
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.provider', 'p')
      .where('m.isActive = true AND p.isActive = true')
      .orderBy('p.priority', 'DESC')
      .addOrderBy('m.sortOrder', 'ASC')
      .getMany();
    return models.map((m) => ({
      id: m.id,
      modelId: m.modelId,
      label: m.displayName,
      provider: (m.provider as AiProvider).name,
      providerKind: (m.provider as AiProvider).kind,
      contextWindow: m.contextWindow,
    }));
  }

  async findModelWithProvider(modelId: string) {
    return this.models.findOne({ where: { id: modelId }, relations: { provider: true } });
  }
}
