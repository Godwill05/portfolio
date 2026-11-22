import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { AuthService } from '../../core/auth.service';
import { CvApi } from '../../core/cv.service';
import { ProfileApi, type Completeness } from '../../core/profile.service';
import { AiApi } from '../../core/ai.service';
import { formatRelative } from '../../core/format';
import { PageHeader } from '../../ui/page-header';
import type { CvStats, ProfileBundle, QuotaSummary } from '../../core/models';

@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeader],
  template: `
    <app-page-header
      [eyebrow]="greeting()"
      title="Tableau de bord"
      subtitle="Vue d’ensemble de votre profil, de vos CV et de votre consommation IA."
    >
      <a class="ff-btn ff-btn--secondary" routerLink="/app/profile/preview">
        Voir mon portfolio
      </a>
      <a class="ff-btn ff-btn--primary" routerLink="/app/cvs">Créer un CV</a>
    </app-page-header>

    @if (loading()) {
      <div class="grid">
        @for (i of [1, 2, 3]; track i) {
          <div class="ff-card ff-card--padded">
            <div class="ff-skeleton" style="height: 0.8rem; width: 40%"></div>
            <div class="ff-skeleton" style="height: 2rem; width: 60%; margin-top: 0.8rem"></div>
          </div>
        }
      </div>
    } @else {
      <!-- Complétude du profil : le levier le plus direct sur la qualité des CV. -->
      <section class="ff-card ff-card--padded completeness">
        <div class="completeness__head">
          <div>
            <p class="ff-eyebrow">Complétude du profil</p>
            <p class="completeness__score">
              {{ completeness()?.score ?? 0 }}<span class="completeness__unit">%</span>
            </p>
          </div>
          <a class="ff-btn ff-btn--secondary ff-btn--sm" routerLink="/app/profile">
            Compléter
          </a>
        </div>

        <div
          class="bar"
          role="progressbar"
          [attr.aria-valuenow]="completeness()?.score ?? 0"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label="Complétude du profil"
        >
          <span class="bar__fill" [style.width.%]="completeness()?.score ?? 0"></span>
        </div>

        @if (pendingChecks().length > 0) {
          <ul class="checks">
            @for (check of pendingChecks(); track check.key) {
              <li class="checks__item">
                <span class="checks__dot" aria-hidden="true"></span>
                {{ check.label }}
                <span class="checks__weight">+{{ check.weight }}</span>
              </li>
            }
          </ul>
        }
      </section>

      <!-- Chiffres clés -->
      <div class="grid">
        <article class="ff-card ff-card--padded stat">
          <p class="stat__label">CV créés</p>
          <p class="stat__value">{{ cvs()?.total ?? 0 }}</p>
          <p class="stat__foot">
            {{ cvs()?.published ?? 0 }} publié(s) · {{ cvs()?.aiAssisted ?? 0 }} assisté(s) par IA
          </p>
        </article>

        <article class="ff-card ff-card--padded stat">
          <p class="stat__label">Compétences</p>
          <p class="stat__value">{{ bundle()?.skills?.length ?? 0 }}</p>
          <p class="stat__foot">
            {{ featuredSkills() }} mise(s) en avant
          </p>
        </article>

        <article class="ff-card ff-card--padded stat">
          <p class="stat__label">Crédits IA restants</p>
          <p class="stat__value">{{ remainingToday() }}</p>
          <p class="stat__foot">
            @if (quota()?.unlimited) {
              Illimité sur votre compte
            } @else {
              Aujourd’hui · {{ quota()?.bonusCredits ?? 0 }} bonus
            }
          </p>
        </article>
      </div>

      <div class="columns">
        <!-- Quotas par fonctionnalité -->
        <section class="ff-card ff-card--padded">
          <div class="section-head">
            <h2 class="section-title">Quotas IA du jour</h2>
            <a class="ff-hint" routerLink="/app/ai">Assistant</a>
          </div>

          @if ((quota()?.features?.length ?? 0) === 0) {
            <p class="empty">Aucun quota à afficher.</p>
          } @else {
            <ul class="quotas">
              @for (feature of quota()?.features ?? []; track feature.feature) {
                <li class="quota">
                  <div class="quota__row">
                    <span class="quota__label">{{ featureLabel(feature.feature) }}</span>
                    <span class="quota__count" [class.quota__count--empty]="feature.remaining === 0">
                      {{ feature.remaining }} / {{ feature.limit }}
                    </span>
                  </div>
                  <div class="quota__bar">
                    <span
                      class="quota__fill"
                      [class.quota__fill--low]="feature.remaining === 0"
                      [style.width.%]="usagePercent(feature.remaining, feature.limit)"
                    ></span>
                  </div>
                </li>
              }
            </ul>
          }
        </section>

        <!-- Activité récente -->
        <section class="ff-card ff-card--padded">
          <div class="section-head">
            <h2 class="section-title">Derniers CV</h2>
            <a class="ff-hint" routerLink="/app/cvs">Tout voir</a>
          </div>

          @if (recentCvs().length === 0) {
            <div class="empty-state">
              <p class="empty">Vous n’avez pas encore de CV.</p>
              <a class="ff-btn ff-btn--primary ff-btn--sm" routerLink="/app/cvs">
                Créer mon premier CV
              </a>
            </div>
          } @else {
            <ul class="cvs">
              @for (cv of recentCvs(); track cv.id) {
                <li>
                  <a class="cv-row" [routerLink]="['/app/cvs', cv.id]">
                    <span class="cv-row__main">
                      <span class="cv-row__title">{{ cv.title }}</span>
                      <span class="cv-row__meta">
                        {{ cv.templateKey }} · modifié {{ relative(cv.updatedAt) }}
                      </span>
                    </span>
                    <span class="ff-badge" [class.ff-badge--accent]="cv.status === 'published'">
                      {{ statusLabel(cv.status) }}
                    </span>
                  </a>
                </li>
              }
            </ul>
          }
        </section>
      </div>

      <!-- Raccourcis -->
      <section class="actions">
        <a class="action" routerLink="/app/ai">
          <span class="action__icon" aria-hidden="true">✦</span>
          <span class="action__title">Analyser une offre</span>
          <span class="action__text">Collez une annonce, obtenez un score de correspondance.</span>
        </a>
        <a class="action" routerLink="/app/profile">
          <span class="action__icon" aria-hidden="true">◔</span>
          <span class="action__title">Enrichir mon profil</span>
          <span class="action__text">Chaque section ajoutée améliore vos CV générés.</span>
        </a>
        <a class="action" [routerLink]="publicLink()">
          <span class="action__icon" aria-hidden="true">◈</span>
          <span class="action__title">Mon portfolio public</span>
          <span class="action__text">Partagez une adresse unique, sans compte requis.</span>
        </a>
      </section>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
        gap: 0.85rem;
        margin-bottom: 0.85rem;
      }

      .columns {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
        gap: 0.85rem;
      }

      /* ── Complétude ── */
      .completeness {
        margin-bottom: 0.85rem;
      }

      .completeness__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 0.7rem;
      }

      .completeness__score {
        font-family: var(--ff-font-display);
        font-size: var(--ff-text-2xl);
        font-weight: 600;
        line-height: 1.1;
        margin-top: 0.15rem;
      }

      .completeness__unit {
        font-size: var(--ff-text-lg);
        color: var(--ff-ink-faint);
        margin-left: 0.1rem;
      }

      .bar {
        height: 6px;
        border-radius: var(--ff-radius-full);
        background: var(--ff-surface-sunken);
        overflow: hidden;
      }

      .bar__fill {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--ff-accent);
        transition: width 400ms cubic-bezier(0.16, 1, 0.3, 1);
      }

      .checks {
        list-style: none;
        margin: 0.85rem 0 0;
        padding: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }

      .checks__item {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.2rem 0.5rem;
        background: var(--ff-surface-muted);
        border-radius: var(--ff-radius-sm);
        font-size: var(--ff-text-xs);
        color: var(--ff-ink-soft);
      }

      .checks__dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--ff-warning);
      }

      .checks__weight {
        color: var(--ff-ink-faint);
        font-variant-numeric: tabular-nums;
      }

      /* ── Statistiques ── */
      .stat__label {
        font-size: var(--ff-text-xs);
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--ff-ink-muted);
      }

      .stat__value {
        font-family: var(--ff-font-display);
        font-size: var(--ff-text-2xl);
        font-weight: 600;
        line-height: 1.15;
        margin: 0.25rem 0 0.15rem;
        font-variant-numeric: tabular-nums;
      }

      .stat__foot {
        font-size: var(--ff-text-xs);
        color: var(--ff-ink-muted);
      }

      /* ── Sections ── */
      .section-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 0.9rem;
      }

      .section-title {
        font-family: var(--ff-font-body);
        font-size: var(--ff-text-sm);
        font-weight: 650;
        letter-spacing: 0;
        color: var(--ff-ink);
      }

      .empty {
        font-size: var(--ff-text-sm);
        color: var(--ff-ink-muted);
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.7rem;
      }

      /* ── Quotas ── */
      .quotas {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
      }

      .quota__row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 0.25rem;
      }

      .quota__label {
        font-size: var(--ff-text-sm);
        color: var(--ff-ink-soft);
      }

      .quota__count {
        font-size: var(--ff-text-xs);
        font-variant-numeric: tabular-nums;
        color: var(--ff-ink-muted);
      }

      .quota__count--empty {
        color: var(--ff-danger);
        font-weight: 600;
      }

      .quota__bar {
        height: 4px;
        border-radius: var(--ff-radius-full);
        background: var(--ff-surface-sunken);
        overflow: hidden;
      }

      .quota__fill {
        display: block;
        height: 100%;
        background: var(--ff-accent);
        border-radius: inherit;
        transition: width 300ms ease;
      }

      .quota__fill--low {
        background: var(--ff-line-strong);
      }

      /* ── Liste de CV ── */
      .cvs {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
      }

      .cv-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.6rem 0.5rem;
        border-radius: var(--ff-radius);
        color: var(--ff-ink);
        margin: 0 -0.5rem;
      }

      .cv-row:hover {
        background: var(--ff-surface-muted);
        text-decoration: none;
      }

      .cv-row__main {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        min-width: 0;
      }

      .cv-row__title {
        font-size: var(--ff-text-sm);
        font-weight: 550;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .cv-row__meta {
        font-size: var(--ff-text-xs);
        color: var(--ff-ink-muted);
      }

      /* ── Raccourcis ── */
      .actions {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
        gap: 0.85rem;
        margin-top: 0.85rem;
      }

      .action {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding: 1rem;
        background: var(--ff-surface);
        border: 1px solid var(--ff-line);
        border-radius: var(--ff-radius-lg);
        color: var(--ff-ink);
        transition:
          border-color var(--ff-transition),
          box-shadow var(--ff-transition),
          transform var(--ff-transition);
      }

      .action:hover {
        text-decoration: none;
        border-color: var(--ff-accent-line);
        box-shadow: var(--ff-shadow-sm);
        transform: translateY(-1px);
      }

      .action__icon {
        font-size: 1rem;
        color: var(--ff-accent);
      }

      .action__title {
        font-size: var(--ff-text-sm);
        font-weight: 600;
      }

      .action__text {
        font-size: var(--ff-text-xs);
        color: var(--ff-ink-muted);
        line-height: 1.5;
      }
    `,
  ],
})
export class DashboardPage {
  private readonly profileApi = inject(ProfileApi);
  private readonly cvApi = inject(CvApi);
  private readonly aiApi = inject(AiApi);
  protected readonly auth = inject(AuthService);

  protected readonly loading = signal(true);
  protected readonly bundle = signal<ProfileBundle | null>(null);
  protected readonly completeness = signal<Completeness | null>(null);
  protected readonly cvs = signal<CvStats | null>(null);
  protected readonly quota = signal<QuotaSummary | null>(null);
  protected readonly recentCvs = signal<{ id: string; title: string; templateKey: string; status: string; updatedAt: string }[]>([]);

  protected readonly greeting = computed(() => {
    const hour = new Date().getHours();
    const part = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
    return `${part}, ${this.auth.user()?.firstName ?? ''}`.trim();
  });

  protected readonly pendingChecks = computed(
    () => this.completeness()?.checks.filter((c) => !c.done).slice(0, 4) ?? [],
  );

  protected readonly featuredSkills = computed(
    () => this.bundle()?.skills.filter((s) => s.featured).length ?? 0,
  );

  protected readonly remainingToday = computed(() => {
    const quota = this.quota();
    if (!quota) return 0;
    if (quota.unlimited) return '∞';
    return quota.features.reduce((sum, f) => sum + f.remaining, 0);
  });

  protected readonly publicLink = computed(() => {
    const slug = this.bundle()?.profile?.slug;
    return slug ? `/p/${slug}` : '/app/profile';
  });

  constructor() {
    // On charge en parallèle : aucune de ces données ne dépend d'une autre,
    // et un échec isolé ne doit pas masquer le reste du tableau de bord.
    forkJoin({
      profile: this.profileApi.get(),
      stats: this.cvApi.stats(),
      quota: this.aiApi.quota(),
      list: this.cvApi.list({ limit: 4 }),
    }).subscribe({
      next: ({ profile, stats, quota, list }) => {
        this.bundle.set(profile);
        this.completeness.set(profile.completeness);
        this.cvs.set(stats);
        this.quota.set(quota);
        this.recentCvs.set(
          list.items.map((cv) => ({
            id: cv.id,
            title: cv.title,
            templateKey: cv.templateKey,
            status: cv.status,
            updatedAt: cv.updatedAt,
          })),
        );
        this.loading.set(false);
      },
      error: () => {
        // Le shell reste utilisable même si les données sont indisponibles.
        this.loading.set(false);
      },
    });
  }

  protected relative(value: string): string {
    return formatRelative(value);
  }

  protected usagePercent(remaining: number, limit: number): number {
    if (limit <= 0) return 0;
    return Math.min(100, Math.round((remaining / limit) * 100));
  }

  protected featureLabel(feature: string): string {
    const labels: Record<string, string> = {
      chat: 'Assistant',
      'cv.generate': 'Génération de CV',
      'cv.optimize': 'Optimisation de CV',
      'job.analysis': 'Analyse d’offre',
      'career.coach': 'Coach carrière',
      cover_letter: 'Lettre de motivation',
    };
    return labels[feature] ?? feature;
  }

  protected statusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft: 'Brouillon',
      published: 'Publié',
      archived: 'Archivé',
    };
    return labels[status] ?? status;
  }
}
