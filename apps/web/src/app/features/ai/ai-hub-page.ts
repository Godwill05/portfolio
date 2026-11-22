import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ApiFailure } from '../../core/api-error';
import { AiApi } from '../../core/ai.service';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader } from '../../ui/page-header';
import { MarkdownPipe } from './markdown.pipe';
import { AI_FEATURE_LABELS, formatRelative } from '../../core/format';
import type {
  AiConversation,
  AiConversationSummary,
  CareerPlan,
  CoverLetter,
  CvOptimization,
  JobAnalysis,
  QuotaSummary,
} from '../../core/models';

type Tool = 'chat' | 'job' | 'cover' | 'career' | 'cv';

interface ChatLine {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

@Component({
  selector: 'app-ai-hub-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, PageHeader, MarkdownPipe],
  templateUrl: './ai-hub-page.html',
  styleUrl: './ai-hub-page.scss',
})
export class AiHubPage {
  private readonly api = inject(AiApi);
  private readonly fb = inject(FormBuilder);
  private readonly toasts = inject(ToastService);

  protected readonly tool = signal<Tool>('chat');
  protected readonly quota = signal<QuotaSummary | null>(null);

  /* ── Chat ── */
  protected readonly conversations = signal<AiConversationSummary[]>([]);
  protected readonly activeId = signal<string | null>(null);
  protected readonly messages = signal<ChatLine[]>([]);
  protected readonly streaming = signal(false);
  private abortController: AbortController | null = null;

  protected readonly chatForm = this.fb.nonNullable.group({
    message: ['', [Validators.required, Validators.maxLength(8000)]],
  });

  /* ── Analyse d'offre ── */
  protected readonly jobBusy = signal(false);
  protected readonly jobResult = signal<JobAnalysis | null>(null);
  protected readonly jobForm = this.fb.nonNullable.group({
    text: ['', [Validators.required, Validators.minLength(80), Validators.maxLength(40000)]],
    title: [''],
    company: [''],
  });

  /* ── Lettre de motivation ── */
  protected readonly coverBusy = signal(false);
  protected readonly coverResult = signal<CoverLetter | null>(null);
  protected readonly coverForm = this.fb.nonNullable.group({
    jobTitle: ['', [Validators.required, Validators.maxLength(200)]],
    company: [''],
    jobText: ['', [Validators.required, Validators.minLength(80), Validators.maxLength(30000)]],
  });

  /* ── Plan de carrière ── */
  protected readonly careerBusy = signal(false);
  protected readonly careerResult = signal<CareerPlan | null>(null);
  protected readonly careerForm = this.fb.nonNullable.group({
    goal: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(2000)]],
  });

  /* ── Optimisation CV ── */
  protected readonly cvBusy = signal(false);
  protected readonly cvResult = signal<CvOptimization | null>(null);
  protected readonly cvForm = this.fb.nonNullable.group({
    targetRole: ['', [Validators.required, Validators.maxLength(200)]],
    currentText: ['', [Validators.maxLength(8000)]],
  });

  protected readonly tools: { id: Tool; label: string; hint: string; feature: string }[] = [
    { id: 'chat', label: 'Assistant', hint: 'Poser une question libre', feature: 'chat' },
    { id: 'job', label: 'Analyser une offre', hint: 'Score de correspondance', feature: 'job.analysis' },
    { id: 'cover', label: 'Lettre de motivation', hint: 'À partir d’une annonce', feature: 'cover_letter' },
    { id: 'career', label: 'Plan de carrière', hint: 'Prochaines étapes', feature: 'career.coach' },
    { id: 'cv', label: 'Optimiser mon CV', hint: 'Formulations et mots-clés', feature: 'cv.optimize' },
  ];

  protected readonly remainingForActive = computed(() => {
    const feature = this.tools.find((t) => t.id === this.tool())?.feature;
    const quota = this.quota();
    if (!feature || !quota) return null;
    if (quota.unlimited) return '∞';
    return quota.features.find((f) => f.feature === feature)?.remaining ?? 0;
  });

  protected readonly canSend = computed(
    () => !this.streaming() && this.chatForm.controls.message.value.trim().length > 0,
  );

  constructor() {
    this.loadQuota();
    this.loadConversations();
  }

  /* ── Quotas ── */

  private loadQuota(): void {
    this.api.quota().subscribe({
      next: (quota) => this.quota.set(quota),
      error: () => {
        /* le quota est informatif, pas bloquant pour l'affichage */
      },
    });
  }

  private loadConversations(): void {
    this.api.conversations({ limit: 30 }).subscribe({
      next: (page) => this.conversations.set(page.items),
      error: () => {
        /* la liste des conversations est secondaire */
      },
    });
  }

  /* ── Chat ── */

  protected send(): void {
    const message = this.chatForm.controls.message.value.trim();
    if (!message || this.streaming()) return;

    // La ligne utilisateur apparaît immédiatement : l'attente perçue
    // diminue nettement quand l'echo est instantané.
    this.messages.update((list) => [...list, { role: 'user', content: message }]);
    this.messages.update((list) => [...list, { role: 'assistant', content: '', streaming: true }]);
    this.chatForm.reset({ message: '' });
    this.streaming.set(true);

    this.abortController = new AbortController();

    this.api
      .streamChat(message, this.activeId() ?? undefined, { signal: this.abortController.signal })
      .subscribe({
        next: (event) => {
          if (event.type === 'meta') {
            this.activeId.set(event.conversationId);
          } else if (event.type === 'delta') {
            this.appendToLast(event.content);
          } else if (event.type === 'done') {
            // On remplace le contenu accumulé par la version finale : elle
            // fait foi, et évite toute dérive entre deltas et total.
            this.replaceLast(event.content);
            this.markLastComplete();
            this.streaming.set(false);
            this.loadQuota();
          }
        },
        error: (raw: unknown) => {
          const failure = raw instanceof ApiFailure ? raw : null;
          this.markLastComplete();
          this.streaming.set(false);

          if (failure?.isQuotaExceeded) {
            this.toasts.warning('Quota atteint pour aujourd’hui.');
            this.loadQuota();
            return;
          }
          if (failure?.code === 'RETRY') {
            this.toasts.info('Session rafraîchie, réessayez.');
            return;
          }

          const lastMessage = failure?.message ?? 'L’assistant est injoignable.';
          // Une bulle d'erreur dans le fil vaut mieux qu'un toast fugace :
          // l'utilisateur voit où la réponse s'est arrêtée.
          this.replaceLast(
            this.messages().at(-1)?.content
              ? `${this.messages().at(-1)?.content}\n\n_${lastMessage}_`
              : lastMessage,
          );
          this.toasts.error(lastMessage);
        },
      });
  }

  protected stopStreaming(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.streaming.set(false);
    this.markLastComplete();
  }

  protected newConversation(): void {
    this.abortController?.abort();
    this.activeId.set(null);
    this.messages.set([]);
    this.streaming.set(false);
  }

  protected openConversation(id: string): void {
    this.api.conversation(id).subscribe({
      next: (conversation) => {
        this.activeId.set(conversation.id);
        this.messages.set(
          (conversation.messages ?? [])
            .filter((m) => m.role !== 'system')
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        );
      },
      error: (failure: ApiFailure) => this.toasts.error(failure.message),
    });
  }

  protected deleteConversation(id: string, event: Event): void {
    event.stopPropagation();
    this.api.deleteConversation(id).subscribe({
      next: () => {
        this.conversations.update((list) => list.filter((c) => c.id !== id));
        if (this.activeId() === id) this.newConversation();
      },
      error: (failure: ApiFailure) => this.toasts.error(failure.message),
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    // Entrée envoie, Maj+Entrée retourne à la ligne — convention des chats.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  private appendToLast(chunk: string): void {
    this.messages.update((list) => {
      if (list.length === 0) return list;
      const copy = [...list];
      const last = copy[copy.length - 1];
      copy[copy.length - 1] = { ...last, content: last.content + chunk };
      return copy;
    });
  }

  private replaceLast(content: string): void {
    this.messages.update((list) => {
      if (list.length === 0) return list;
      const copy = [...list];
      copy[copy.length - 1] = { ...copy[copy.length - 1], content };
      return copy;
    });
  }

  private markLastComplete(): void {
    this.messages.update((list) => {
      if (list.length === 0) return list;
      const copy = [...list];
      copy[copy.length - 1] = { ...copy[copy.length - 1], streaming: false };
      return copy;
    });
  }

  /* ── Outils structurés ── */

  protected analyzeJob(): void {
    if (this.jobForm.invalid) {
      this.jobForm.markAllAsTouched();
      return;
    }

    this.jobBusy.set(true);
    this.jobResult.set(null);
    this.api.analyzeJob(this.jobForm.getRawValue()).subscribe({
      next: (result) => {
        this.jobBusy.set(false);
        this.jobResult.set(result);
        this.loadQuota();
      },
      error: (failure: ApiFailure) => {
        this.jobBusy.set(false);
        this.toasts.error(this.explain(failure));
      },
    });
  }

  protected writeCoverLetter(): void {
    if (this.coverForm.invalid) {
      this.coverForm.markAllAsTouched();
      return;
    }

    this.coverBusy.set(true);
    this.coverResult.set(null);
    this.api.coverLetter(this.coverForm.getRawValue()).subscribe({
      next: (result) => {
        this.coverBusy.set(false);
        this.coverResult.set(result);
        this.loadQuota();
      },
      error: (failure: ApiFailure) => {
        this.coverBusy.set(false);
        this.toasts.error(this.explain(failure));
      },
    });
  }

  protected planCareer(): void {
    if (this.careerForm.invalid) {
      this.careerForm.markAllAsTouched();
      return;
    }

    this.careerBusy.set(true);
    this.careerResult.set(null);
    this.api.careerPlan(this.careerForm.controls.goal.value).subscribe({
      next: (result) => {
        this.careerBusy.set(false);
        this.careerResult.set(result);
        this.loadQuota();
      },
      error: (failure: ApiFailure) => {
        this.careerBusy.set(false);
        this.toasts.error(this.explain(failure));
      },
    });
  }

  protected optimizeCv(): void {
    if (this.cvForm.invalid) {
      this.cvForm.markAllAsTouched();
      return;
    }

    this.cvBusy.set(true);
    this.cvResult.set(null);
    this.api.optimizeCv(this.cvForm.getRawValue()).subscribe({
      next: (result) => {
        this.cvBusy.set(false);
        this.cvResult.set(result);
        this.loadQuota();
      },
      error: (failure: ApiFailure) => {
        this.cvBusy.set(false);
        this.toasts.error(this.explain(failure));
      },
    });
  }

  protected copyCoverLetter(): void {
    const letter = this.coverResult();
    if (!letter?.body) return;
    void navigator.clipboard.writeText(letter.body).then(() => {
      this.toasts.success('Lettre copiée dans le presse-papiers.');
    });
  }

  private explain(failure: ApiFailure): string {
    if (failure.isQuotaExceeded) return 'Quota atteint pour aujourd’hui sur cette fonctionnalité.';
    if (failure.status === 503) {
      return 'Aucun modèle IA n’est configuré. Un administrateur doit activer un fournisseur.';
    }
    return failure.message;
  }

  /* ── Aides d'affichage ── */

  protected featureLabel(feature: string): string {
    return AI_FEATURE_LABELS[feature] ?? feature;
  }

  protected relative(value: string): string {
    return formatRelative(value);
  }

  protected asList(value: unknown): string[] {
    return Array.isArray(value) ? value.map(String) : [];
  }

  protected asText(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  protected asMilestones(value: unknown): { title: string; description?: string; timeframe?: string }[] {
    return Array.isArray(value)
      ? (value as { title: string; description?: string; timeframe?: string }[])
      : [];
  }

  protected scoreTone(score: number): string {
    if (score >= 75) return 'high';
    if (score >= 50) return 'mid';
    return 'low';
  }

  protected trackIndex(index: number): number {
    return index;
  }
}
