import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AiFeature,
  AiMessageRole,
  AiTaskType,
  EducationKind,
  NotificationType,
  SkillLevel,
} from '../../common/constants/domain';
import {
  AiConversation,
  AiMessage,
  JobOpportunity,
} from '../../database/entities/platform.entity';
import {
  Education,
  Experience,
  Language_,
  ProfessionalProfile,
  Project,
  Skill,
} from '../../database/entities/profile.entity';
import { Errors } from '../../common/utils/errors';
import { fetchPageText, UrlFetchError } from '../../common/utils/url-fetcher';
import { AiGatewayService } from './ai-gateway.service';
import { AiQuotaService } from './quota.service';
import { AiProviderService } from './provider.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationService } from '../notifications/notification.service';
import {
  careerCoachMessages,
  coverLetterMessages,
  cvGenerationMessages,
  cvOptimizeMessages,
  jobAnalysisMessages,
  parseJsonResponse,
  profileContext,
  SYSTEM_ASSISTANT,
  type ProfileContextInput,
} from './prompts';
import type { ChatMessage } from './providers/provider.interface';

const MAX_HISTORY_MESSAGES = 20;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @InjectRepository(AiConversation) private readonly conversations: Repository<AiConversation>,
    @InjectRepository(AiMessage) private readonly messages: Repository<AiMessage>,
    @InjectRepository(JobOpportunity) private readonly opportunities: Repository<JobOpportunity>,
    @InjectRepository(ProfessionalProfile) private readonly profiles: Repository<ProfessionalProfile>,
    @InjectRepository(Skill) private readonly skills: Repository<Skill>,
    @InjectRepository(Experience) private readonly experiences: Repository<Experience>,
    @InjectRepository(Education) private readonly educations: Repository<Education>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Language_) private readonly languages: Repository<Language_>,
    private readonly gateway: AiGatewayService,
    private readonly quota: AiQuotaService,
    private readonly providers: AiProviderService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Assembles the user's real profile as AI context.
   * Nothing beyond the user's own data is ever sent to a provider.
   */
  async buildProfileContext(userId: string): Promise<ProfileContextInput> {
    const profile = await this.profiles.findOne({ where: { userId } });
    if (!profile) throw Errors.notFound('Profil');

    const [skills, experiences, educations, projects, languages] = await Promise.all([
      this.skills.find({ where: { profileId: profile.id }, order: { featured: 'DESC', sortOrder: 'ASC' } }),
      this.experiences.find({ where: { profileId: profile.id }, order: { sortOrder: 'ASC' } }),
      this.educations.find({ where: { profileId: profile.id }, order: { sortOrder: 'ASC' } }),
      this.projects.find({ where: { profileId: profile.id }, order: { sortOrder: 'ASC' } }),
      this.languages.find({ where: { profileId: profile.id }, order: { sortOrder: 'ASC' } }),
    ]);

    const levelLabel: Record<SkillLevel, string> = {
      [SkillLevel.BEGINNER]: 'débutant',
      [SkillLevel.INTERMEDIATE]: 'intermédiaire',
      [SkillLevel.ADVANCED]: 'avancé',
      [SkillLevel.EXPERT]: 'expert',
    };

    return {
      displayName: profile.displayName,
      headline: profile.professionalTitle ?? profile.headline,
      summary: profile.summary,
      location: profile.location,
      skills: skills.map((s) => ({
        name: s.name,
        category: s.category,
        level: levelLabel[s.level],
        years: s.yearsOfExperience || undefined,
      })),
      experiences: experiences.map((e) => ({
        role: e.role,
        company: e.company,
        startDate: e.startDate,
        endDate: e.endDate,
        isCurrent: e.isCurrent,
        description: e.description,
        achievements: e.achievements,
        technologies: e.technologies,
      })),
      educations: educations.map((e) => ({
        title: e.degree || e.title || e.fieldOfStudy || (e.kind === EducationKind.CERTIFICATION ? 'Certification' : 'Formation'),
        institution: e.institution,
        year: e.endDate?.slice(0, 4) ?? e.startDate?.slice(0, 4) ?? null,
        kind: e.kind,
      })),
      projects: projects.map((p) => ({
        title: p.title,
        description: p.description,
        technologies: p.technologies,
        outcome: p.outcome,
      })),
      languages: languages.map((l) => ({ name: l.name, proficiency: l.proficiency })),
    };
  }

  // ─────────────────────────── helpers ───────────────────────────

  private async assertConversationOwner(userId: string, conversationId: string): Promise<AiConversation> {
    const conversation = await this.conversations.findOne({ where: { id: conversationId } });
    if (!conversation || conversation.userId !== userId) throw Errors.notFound('Conversation');
    return conversation;
  }

  private async history(conversationId: string): Promise<ChatMessage[]> {
    const rows = await this.messages.find({
      where: { conversationId },
      order: { createdAt: 'DESC' },
      take: MAX_HISTORY_MESSAGES,
    });
    return rows
      .reverse()
      .filter((m) => m.role !== AiMessageRole.SYSTEM)
      .map((m) => ({ role: m.role === AiMessageRole.ASSISTANT ? 'assistant' : 'user', content: m.content }));
  }

  private deriveTitle(text: string): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= 60) return clean || 'Nouvelle conversation';
    return `${clean.slice(0, 57)}…`;
  }

  // ───────────────────────── conversation ─────────────────────────

  async listConversations(userId: string) {
    const rows = await this.conversations.find({
      where: { userId },
      order: { pinned: 'DESC', updatedAt: 'DESC' },
      take: 100,
    });
    return rows.map((c) => ({
      id: c.id,
      title: c.title,
      feature: c.feature,
      messageCount: c.messageCount,
      pinned: c.pinned,
      updatedAt: c.updatedAt,
      createdAt: c.createdAt,
    }));
  }

  async getConversation(userId: string, id: string) {
    const conversation = await this.assertConversationOwner(userId, id);
    const messages = await this.messages.find({
      where: { conversationId: id },
      order: { createdAt: 'ASC' },
    });
    return {
      conversation: {
        id: conversation.id,
        title: conversation.title,
        feature: conversation.feature,
        modelId: conversation.modelId,
        messageCount: messages.length,
        totalTokens: conversation.totalTokens,
        pinned: conversation.pinned,
        updatedAt: conversation.updatedAt,
      },
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        promptTokens: m.promptTokens,
        completionTokens: m.completionTokens,
        createdAt: m.createdAt,
      })),
    };
  }

  async createConversation(
    userId: string,
    input: { title?: string; feature?: AiFeature; modelId?: string | null },
  ): Promise<AiConversation> {
    return this.conversations.save(
      this.conversations.create({
        userId,
        title: input.title?.slice(0, 200) || 'Nouvelle conversation',
        feature: input.feature ?? AiFeature.CHAT,
        modelId: input.modelId ?? null,
      }),
    );
  }

  async renameConversation(userId: string, id: string, title: string): Promise<void> {
    await this.assertConversationOwner(userId, id);
    await this.conversations.update(id, { title: title.trim().slice(0, 200) });
  }

  async togglePin(userId: string, id: string, pinned: boolean): Promise<void> {
    await this.assertConversationOwner(userId, id);
    await this.conversations.update(id, { pinned });
  }

  async deleteConversation(userId: string, id: string): Promise<void> {
    await this.assertConversationOwner(userId, id);
    await this.conversations.delete(id);
  }

  async clearConversations(userId: string): Promise<void> {
    await this.conversations.delete({ userId });
  }

  /**
   * Streaming chat. Quota is consumed *before* any provider call and refunded
   * automatically if generation fails, so users never pay for our errors.
   */
  async *streamChat(
    userId: string,
    input: {
      conversationId?: string;
      message: string;
      modelId?: string | null;
      feature?: AiFeature;
      signal?: AbortSignal;
    },
  ): AsyncGenerator<
    | { type: 'meta'; conversationId: string; userMessageId: string; assistantMessageId: string }
    | { type: 'delta'; content: string }
    | { type: 'done'; content: string; promptTokens: number; completionTokens: number }
    | { type: 'error'; code: string; message: string },
    void,
    unknown
  > {
    const feature = input.feature ?? AiFeature.CHAT;
    const limits = this.settings.aiLimits;

    if (input.message.length > limits.maxInputChars) {
      throw Errors.validation('Message trop long.');
    }

    // 1. Quota — enforced server-side, before the provider is contacted.
    await this.quota.consume(userId, feature, 1);

    let conversation: AiConversation;
    if (input.conversationId) {
      conversation = await this.assertConversationOwner(userId, input.conversationId);
    } else {
      conversation = await this.createConversation(userId, {
        title: this.deriveTitle(input.message),
        feature,
        modelId: input.modelId ?? null,
      });
    }

    const userMessage = await this.messages.save(
      this.messages.create({
        conversationId: conversation.id,
        role: AiMessageRole.USER,
        content: input.message,
      }),
    );

    const assistantMessage = await this.messages.save(
      this.messages.create({
        conversationId: conversation.id,
        role: AiMessageRole.ASSISTANT,
        content: '',
        modelId: input.modelId ?? null,
      }),
    );

    yield {
      type: 'meta',
      conversationId: conversation.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
    };

    const context = await this.history(conversation.id);
    const payload: ChatMessage[] = [{ role: 'system', content: SYSTEM_ASSISTANT }, ...context];

    let fullContent = '';
    let promptTokens = 0;
    let completionTokens = 0;

    try {
      const stream = this.gateway.stream({
        feature,
        task: AiTaskType.CHAT,
        messages: payload,
        modelId: input.modelId ?? conversation.modelId,
        userId,
        signal: input.signal,
      });

      for await (const chunk of stream) {
        if (chunk.delta) {
          fullContent += chunk.delta;
          yield { type: 'delta', content: chunk.delta };
        }
        if (chunk.promptTokens) promptTokens = chunk.promptTokens;
        if (chunk.completionTokens) completionTokens = chunk.completionTokens;
      }

      await this.messages.update(assistantMessage.id, {
        content: fullContent,
        promptTokens,
        completionTokens,
      });
      await this.conversations.update(conversation.id, {
        messageCount: conversation.messageCount + 2,
        totalTokens: conversation.totalTokens + promptTokens + completionTokens,
      });

      yield { type: 'done', content: fullContent, promptTokens, completionTokens };
    } catch (error) {
      // Refund the quota unit: the failure is ours, not the user's.
      await this.quota.refund(userId, feature, 1);
      const message = (error as Error).message ?? 'Erreur de génération';
      await this.messages.delete(assistantMessage.id);
      // The user turn is kept so the question is not lost, but the counter must
      // reflect what is actually persisted.
      await this.conversations.update(conversation.id, {
        messageCount: conversation.messageCount + 1,
      });
      this.logger.warn(`Chat stream failed for user ${userId}: ${message}`);
      yield { type: 'error', code: 'AI_ERROR', message };
    }
  }

  /** Non-streaming version (simpler clients, tests). */
  async chat(
    userId: string,
    input: { message: string; conversationId?: string; modelId?: string | null },
  ) {
    await this.quota.consume(userId, AiFeature.CHAT, 1);
    const conversation = input.conversationId
      ? await this.assertConversationOwner(userId, input.conversationId)
      : await this.createConversation(userId, { title: this.deriveTitle(input.message) });

    await this.messages.save(
      this.messages.create({ conversationId: conversation.id, role: AiMessageRole.USER, content: input.message }),
    );

    const context = await this.history(conversation.id);
    try {
      const result = await this.gateway.complete({
        feature: AiFeature.CHAT,
        task: AiTaskType.CHAT,
        messages: [{ role: 'system', content: SYSTEM_ASSISTANT }, ...context],
        modelId: input.modelId ?? conversation.modelId,
        userId,
      });
      const assistantMessage = await this.messages.save(
        this.messages.create({
          conversationId: conversation.id,
          role: AiMessageRole.ASSISTANT,
          content: result.content,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          modelId: input.modelId ?? null,
        }),
      );
      await this.conversations.update(conversation.id, {
        messageCount: conversation.messageCount + 2,
        totalTokens: conversation.totalTokens + result.totalTokens,
      });
      return {
        conversationId: conversation.id,
        messageId: assistantMessage.id,
        content: result.content,
        usage: { promptTokens: result.promptTokens, completionTokens: result.completionTokens },
      };
    } catch (error) {
      await this.quota.refund(userId, AiFeature.CHAT, 1);
      throw error;
    }
  }

  /**
   * Structured-output guard. A provider that ignores `jsonMode` (or drifts into
   * prose) must not reach the user as a 201 with an empty panel: this throws so
   * the caller refunds the quota unit and the UI can offer a retry.
   */
  private requireStructured<T>(content: string, what: string): T {
    const parsed = parseJsonResponse<T>(content);
    if (!parsed || typeof parsed !== 'object') {
      this.logger.warn(`Réponse non structurée pour ${what} (${content.slice(0, 120)}…)`);
      throw Errors.aiUnavailable(
        `Le modèle n’a pas renvoyé un résultat exploitable pour ${what}. Réessayez ou changez de modèle dans l’administration.`,
      );
    }
    return parsed;
  }

  // ────────────────────── career-oriented features ────────────────

  async optimizeCv(
    userId: string,
    input: { targetRole?: string; section?: string; currentText?: string; modelId?: string | null },
  ) {
    const context = await this.buildProfileContext(userId);
    await this.quota.consume(userId, AiFeature.CV_OPTIMIZE, 1);
    try {
      const result = await this.gateway.complete({
        feature: AiFeature.CV_OPTIMIZE,
        task: AiTaskType.CV,
        messages: cvOptimizeMessages(context, input),
        modelId: input.modelId,
        userId,
        jsonMode: true,
        temperature: 0.4,
      });
      return {
        raw: result.content,
        data: this.requireStructured<Record<string, unknown>>(result.content, 'l’optimisation de CV'),
        usage: { promptTokens: result.promptTokens, completionTokens: result.completionTokens },
        disclaimer:
          'Suggestions générées à partir de votre profil. Vérifiez chaque information avant de l’utiliser : aucune donnée n’a été inventée.',
      };
    } catch (error) {
      await this.quota.refund(userId, AiFeature.CV_OPTIMIZE, 1);
      throw error;
    }
  }

  async generateCvContent(
    userId: string,
    input: { targetRole?: string; style?: string; modelId?: string | null },
  ) {
    const context = await this.buildProfileContext(userId);
    await this.quota.consume(userId, AiFeature.CV_GENERATE, 1);
    try {
      const result = await this.gateway.complete({
        feature: AiFeature.CV_GENERATE,
        task: AiTaskType.CV,
        messages: cvGenerationMessages(context, input),
        modelId: input.modelId,
        userId,
        jsonMode: true,
        temperature: 0.5,
      });
      return {
        raw: result.content,
        data: this.requireStructured<Record<string, unknown>>(result.content, 'la génération de CV'),
        usage: { promptTokens: result.promptTokens, completionTokens: result.completionTokens },
        disclaimer:
          'Contenu proposé à partir des données de votre profil. Vérifiez et ajustez avant publication.',
      };
    } catch (error) {
      await this.quota.refund(userId, AiFeature.CV_GENERATE, 1);
      throw error;
    }
  }

  async analyzeJob(
    userId: string,
    input: {
      text?: string;
      title?: string;
      company?: string;
      sourceUrl?: string;
      opportunityId?: string;
      modelId?: string | null;
      save?: boolean;
    },
  ) {
    let jobText = (input.text ?? '').trim();
    let fetched: { finalUrl: string; title: string | null; truncated: boolean } | null = null;

    // Fetch first, consume quota second: a broken link must not cost a credit.
    if (jobText.length < 80 && input.sourceUrl) {
      try {
        const page = await fetchPageText(input.sourceUrl, {
          timeoutMs: 8000,
          maxBytes: 512 * 1024,
          maxRedirects: 3,
          maxChars: 20000,
        });
        if (page.text.length < 80) {
          throw new UrlFetchError(
            'La page ne contient pas assez de texte exploitable. Collez le texte de l’offre.',
            'UNSUPPORTED_CONTENT',
          );
        }
        jobText = page.text;
        fetched = { finalUrl: page.finalUrl, title: page.title, truncated: page.truncated };
      } catch (error) {
        if (error instanceof UrlFetchError) {
          throw Errors.validation(
            `Impossible de lire cette offre : ${error.message} Vous pouvez coller le texte manuellement.`,
          );
        }
        throw error;
      }
    }

    if (jobText.length < 80) {
      throw Errors.validation(
        'Le texte de l’offre est trop court. Collez au moins quelques lignes de l’annonce, ou fournissez un lien.',
      );
    }

    const context = await this.buildProfileContext(userId);
    await this.quota.consume(userId, AiFeature.JOB_ANALYSIS, 1);

    try {
      const result = await this.gateway.complete({
        feature: AiFeature.JOB_ANALYSIS,
        task: AiTaskType.JOB_ANALYSIS,
        messages: jobAnalysisMessages(context, {
          title: input.title ?? fetched?.title ?? undefined,
          company: input.company,
          text: jobText,
        }),
        modelId: input.modelId,
        userId,
        jsonMode: true,
        temperature: 0.3,
      });

      const analysis = this.requireStructured<{
        matchScore?: number;
        summary?: string;
        requiredSkills?: string[];
        matchingSkills?: string[];
        missingSkills?: string[];
        strengths?: string[];
        gaps?: string[];
        recommendations?: string[];
        keywords?: string[];
        interviewQuestions?: string[];
      }>(result.content, 'l’analyse de l’offre');

      let opportunityId = input.opportunityId ?? null;
      if (input.save !== false) {
        if (opportunityId) {
          const existing = await this.opportunities.findOne({ where: { id: opportunityId, userId } });
          if (!existing) throw Errors.notFound('Opportunité');
          await this.opportunities.update(opportunityId, {
            analysis: analysis as never,
            matchScore: analysis?.matchScore ?? null,
            analyzedAt: new Date(),
            rawText: jobText.slice(0, 60000),
          });
        } else {
          const created = await this.opportunities.save(
            this.opportunities.create({
              userId,
              title:
                input.title?.slice(0, 200) ||
                fetched?.title?.slice(0, 200) ||
                'Offre analysée',
              company: input.company?.slice(0, 200) ?? null,
              sourceUrl: (fetched?.finalUrl ?? input.sourceUrl)?.slice(0, 400) ?? null,
              rawText: jobText.slice(0, 60000),
              analysis: analysis as never,
              matchScore: analysis?.matchScore ?? null,
              analyzedAt: new Date(),
              status: 'analyzed',
            }),
          );
          opportunityId = created.id;
        }
      }

      return {
        opportunityId,
        analysis,
        source: fetched
          ? { fetched: true, url: fetched.finalUrl, title: fetched.title, truncated: fetched.truncated }
          : { fetched: false },
        raw: result.content,
        usage: { promptTokens: result.promptTokens, completionTokens: result.completionTokens },
        disclaimer:
          'Analyse indicative basée sur votre profil enregistré. Aucune compétence ou expérience n’a été inventée.',
      };
    } catch (error) {
      await this.quota.refund(userId, AiFeature.JOB_ANALYSIS, 1);
      throw error;
    }
  }

  async generateCoverLetter(
    userId: string,
    input: { jobTitle: string; company?: string; jobText: string; modelId?: string | null },
  ) {
    const context = await this.buildProfileContext(userId);
    await this.quota.consume(userId, AiFeature.COVER_LETTER, 1);
    try {
      const result = await this.gateway.complete({
        feature: AiFeature.COVER_LETTER,
        task: AiTaskType.CV,
        messages: coverLetterMessages(context, {
          title: input.jobTitle,
          company: input.company,
          text: input.jobText,
        }),
        modelId: input.modelId,
        userId,
        temperature: 0.6,
        maxOutputTokens: 1200,
      });
      return {
        content: result.content,
        usage: { promptTokens: result.promptTokens, completionTokens: result.completionTokens },
        disclaimer: 'Lettre générée à partir de votre profil. Relisez-la et personnalisez-la avant envoi.',
      };
    } catch (error) {
      await this.quota.refund(userId, AiFeature.COVER_LETTER, 1);
      throw error;
    }
  }

  async careerCoach(userId: string, input: { goal: string; modelId?: string | null }) {
    const context = await this.buildProfileContext(userId);
    await this.quota.consume(userId, AiFeature.CAREER_COACH, 1);
    try {
      const result = await this.gateway.complete({
        feature: AiFeature.CAREER_COACH,
        task: AiTaskType.COMPLEX,
        messages: careerCoachMessages(context, input.goal),
        modelId: input.modelId,
        userId,
        jsonMode: true,
        temperature: 0.5,
      });
      return {
        data: this.requireStructured<Record<string, unknown>>(result.content, 'le plan de carrière'),
        raw: result.content,
        usage: { promptTokens: result.promptTokens, completionTokens: result.completionTokens },
      };
    } catch (error) {
      await this.quota.refund(userId, AiFeature.CAREER_COACH, 1);
      throw error;
    }
  }

  // ────────────────────── opportunities CRUD ──────────────────────

  async listOpportunities(userId: string, params: { page: number; limit: number; status?: string }) {
    const qb = this.opportunities
      .createQueryBuilder('o')
      .where('o.userId = :userId', { userId })
      .orderBy('o.updatedAt', 'DESC');
    if (params.status) qb.andWhere('o.status = :status', { status: params.status });
    const [items, total] = await qb
      .skip((params.page - 1) * params.limit)
      .take(params.limit)
      .getManyAndCount();
    return {
      items: items.map((o) => ({
        id: o.id,
        title: o.title,
        company: o.company,
        location: o.location,
        status: o.status,
        matchScore: o.matchScore,
        analyzedAt: o.analyzedAt,
        createdAt: o.createdAt,
        summary: o.analysis?.summary ?? null,
      })),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
        hasNext: params.page * params.limit < total,
        hasPrev: params.page > 1,
      },
    };
  }

  async getOpportunity(userId: string, id: string) {
    const opportunity = await this.opportunities.findOne({ where: { id, userId } });
    if (!opportunity) throw Errors.notFound('Opportunité');
    return opportunity;
  }

  async updateOpportunity(userId: string, id: string, patch: { status?: string; title?: string; company?: string }) {
    const opportunity = await this.getOpportunity(userId, id);
    await this.opportunities.update(opportunity.id, {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.title ? { title: patch.title.slice(0, 200) } : {}),
      ...(patch.company !== undefined ? { company: patch.company?.slice(0, 200) ?? null } : {}),
    });
    return this.getOpportunity(userId, id);
  }

  async deleteOpportunity(userId: string, id: string): Promise<void> {
    const opportunity = await this.getOpportunity(userId, id);
    await this.opportunities.delete(opportunity.id);
  }

  async notifyAiStatus(userId: string): Promise<void> {
    const configured = await this.gateway.isConfigured();
    if (!configured) {
      await this.notifications.create(userId, {
        type: NotificationType.AI,
        title: 'Assistant IA non configuré',
        body: 'Un administrateur doit configurer un fournisseur IA pour activer l’assistant.',
      });
    }
  }

  async modelsAvailable() {
    return this.providers.userSelectableModels();
  }

  /** Context preview shown in the UI so users know exactly what is sent. */
  async contextPreview(userId: string) {
    const context = await this.buildProfileContext(userId);
    return {
      text: profileContext(context),
      generatedAt: new Date().toISOString(),
    };
  }
}
