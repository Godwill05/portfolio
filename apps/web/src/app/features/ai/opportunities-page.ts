import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { ApiFailure } from '../../core/api-error';
import { AiApi } from '../../core/ai.service';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader } from '../../ui/page-header';
import { formatRelative } from '../../core/format';
import type { JobOpportunity } from '../../core/models';

const STATUS_LABELS: Record<string, string> = {
  saved: 'Enregistrée',
  applied: 'Candidature envoyée',
  interviewing: 'Entretien',
  offer: 'Proposition',
  rejected: 'Refusée',
  archived: 'Archivée',
};

@Component({
  selector: 'app-opportunities-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader],
  template: `
    <app-page-header
      eyebrow="Candidatures"
      title="Offres suivies"
      subtitle="Les annonces que vous avez analysées, avec leur score et l’avancement de chaque candidature."
    >
      <select class="ff-select status-filter" [value]="status()"
              (change)="setStatus($any($event.target).value)"
              aria-label="Filtrer par statut">
        <option value="">Tous les statuts</option>
        @for (entry of statusEntries; track entry[0]) {
          <option [value]="entry[0]">{{ entry[1] }}</option>
        }
      </select>
    </app-page-header>

    @if (loading()) {
      <div class="list">
        @for (i of [1, 2, 3]; track i) {
          <div class="ff-card ff-card--padded">
            <div class="ff-skeleton" style="height: 1rem; width: 40%"></div>
            <div class="ff-skeleton" style="height: 0.7rem; width: 70%; margin-top: 0.6rem"></div>
          </div>
        }
      </div>
    } @else if (items().length === 0) {
      <div class="ff-card ff-card--padded empty">
        <p class="empty__title">Aucune offre suivie</p>
        <p class="empty__text">
          Analysez une annonce depuis l’assistant : elle apparaîtra ici pour que
          vous puissiez suivre l’avancement de chaque candidature.
        </p>
        <a class="ff-btn ff-btn--primary" href="/app/ai">Analyser une offre</a>
      </div>
    } @else {
      <div class="list">
        @for (item of items(); track item.id) {
          <article class="ff-card ff-card--padded card">
            <div class="card__main">
              <div class="card__head">
                <h2 class="card__title">{{ item.title }}</h2>
                @if (item.matchScore !== null) {
                  <span class="score" [class]="'score score--' + tone(item.matchScore)">
                    {{ item.matchScore }}<span class="score__unit">/100</span>
                  </span>
                }
              </div>

              <p class="card__meta">
                @if (item.company) { {{ item.company }} }
                @if (item.company && item.location) { · }
                @if (item.location) { {{ item.location }} }
                @if (!item.company && !item.location) { Sans entreprise précisée }
              </p>

              @if (item.notes) {
                <p class="card__notes">{{ item.notes }}</p>
              }

              <p class="card__date">Ajoutée {{ relative(item.createdAt) }}</p>
            </div>

            <div class="card__actions">
              <select class="ff-select" [value]="item.status"
                      (change)="changeStatus(item, $any($event.target).value)"
                      [attr.aria-label]="'Statut de ' + item.title">
                @for (entry of statusEntries; track entry[0]) {
                  <option [value]="entry[0]">{{ entry[1] }}</option>
                }
              </select>

              @if (item.url) {
                <a class="ff-btn ff-btn--secondary ff-btn--sm" [href]="item.url"
                   target="_blank" rel="noopener noreferrer">Ouvrir ↗</a>
              }
              <button type="button" class="ff-btn ff-btn--ghost ff-btn--sm danger"
                      (click)="remove(item)">Supprimer</button>
            </div>
          </article>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .status-filter {
        width: auto;
        min-width: 11rem;
      }

      .list {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
      }

      .card {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1.5rem;
        flex-wrap: wrap;
      }

      .card__main {
        min-width: 0;
        flex: 1;
      }

      .card__head {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        flex-wrap: wrap;
      }

      .card__title {
        font-size: var(--ff-text-md);
        font-weight: 600;
        letter-spacing: -0.01em;
      }

      .score {
        padding: 0.05rem 0.4rem;
        border-radius: var(--ff-radius-sm);
        font-size: var(--ff-text-xs);
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }

      .score--high {
        background: var(--ff-success-soft);
        color: var(--ff-success);
      }
      .score--mid {
        background: var(--ff-warning-soft);
        color: var(--ff-warning);
      }
      .score--low {
        background: var(--ff-danger-soft);
        color: var(--ff-danger);
      }

      .score__unit {
        font-weight: 500;
        opacity: 0.7;
        margin-left: 1px;
      }

      .card__meta {
        font-size: var(--ff-text-sm);
        color: var(--ff-ink-muted);
        margin-top: 0.15rem;
      }

      .card__notes {
        font-size: var(--ff-text-sm);
        line-height: 1.6;
        color: var(--ff-ink-soft);
        margin-top: 0.4rem;
        max-width: 70ch;
      }

      .card__date {
        font-size: var(--ff-text-xs);
        color: var(--ff-ink-faint);
        margin-top: 0.3rem;
      }

      .card__actions {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        flex-wrap: wrap;
      }

      .card__actions .ff-select {
        width: auto;
        min-width: 9.5rem;
        font-size: var(--ff-text-xs);
        padding: 0.3rem 1.8rem 0.3rem 0.5rem;
      }

      .danger {
        color: var(--ff-danger);
      }

      .danger:hover {
        background: var(--ff-danger-soft);
        color: var(--ff-danger);
      }

      .empty {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.6rem;
        padding: 2.5rem 1.5rem;
      }

      .empty__title {
        font-size: var(--ff-text-md);
        font-weight: 600;
      }

      .empty__text {
        font-size: var(--ff-text-sm);
        color: var(--ff-ink-muted);
        line-height: 1.65;
        max-width: 54ch;
      }

      @media (max-width: 640px) {
        .card {
          flex-direction: column;
          gap: 0.85rem;
        }
      }
    `,
  ],
})
export class OpportunitiesPage {
  private readonly api = inject(AiApi);
  private readonly toasts = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly items = signal<JobOpportunity[]>([]);
  protected readonly status = signal('');

  protected readonly statusEntries = Object.entries(STATUS_LABELS);

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.opportunities({ limit: 50, status: this.status() || undefined }).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.loading.set(false);
      },
      error: (failure: ApiFailure) => {
        this.loading.set(false);
        this.toasts.error(failure.message);
      },
    });
  }

  protected setStatus(value: string): void {
    this.status.set(value);
    this.load();
  }

  protected changeStatus(item: JobOpportunity, status: string): void {
    // Mise à jour optimiste : le select ne doit pas « revenir en arrière »
    // le temps de l'aller-retour réseau.
    this.items.update((list) =>
      list.map((o) => (o.id === item.id ? { ...o, status } : o)),
    );

    this.api.updateOpportunity(item.id, { status }).subscribe({
      error: (failure: ApiFailure) => {
        this.items.update((list) =>
          list.map((o) => (o.id === item.id ? { ...o, status: item.status } : o)),
        );
        this.toasts.error(failure.message);
      },
    });
  }

  protected remove(item: JobOpportunity): void {
    if (!confirm(`Supprimer « ${item.title} » de vos offres suivies ?`)) return;

    this.api.deleteOpportunity(item.id).subscribe({
      next: () => {
        this.items.update((list) => list.filter((o) => o.id !== item.id));
        this.toasts.success('Offre supprimée.');
      },
      error: (failure: ApiFailure) => this.toasts.error(failure.message),
    });
  }

  protected relative(value: string): string {
    return formatRelative(value);
  }

  protected tone(score: number): string {
    if (score >= 75) return 'high';
    if (score >= 50) return 'mid';
    return 'low';
  }

  protected readonly count = computed(() => this.items().length);
}
