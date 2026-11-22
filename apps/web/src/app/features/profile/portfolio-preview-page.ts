import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ApiFailure } from '../../core/api-error';
import { ProfileApi } from '../../core/profile.service';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader } from '../../ui/page-header';
import type { ProfileBundle } from '../../core/models';

@Component({
  selector: 'app-portfolio-preview-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeader],
  template: `
    <app-page-header
      eyebrow="Aperçu"
      title="Votre portfolio public"
      subtitle="Voici exactement ce que verront les visiteurs. Seules les sections marquées visibles apparaissent."
    >
      @if (slug(); as value) {
        <a class="ff-btn ff-btn--primary" [routerLink]="['/p', value]" target="_blank"
           rel="noopener">
          Ouvrir dans un onglet ↗
        </a>
        <button type="button" class="ff-btn ff-btn--secondary" (click)="copyLink()">
          Copier le lien
        </button>
      }
    </app-page-header>

    @if (loading()) {
      <div class="ff-card">
        <div class="ff-skeleton" style="height: 22rem"></div>
      </div>
    } @else if (bundle(); as data) {
      <!-- Barre d'adresse -->
      <div class="url-bar">
        <span class="url-bar__label">Adresse</span>
        <code class="url-bar__value">/p/{{ data.profile.slug }}</code>
        <span class="ff-badge" [class.ff-badge--accent]="data.profile.visibility === 'public'">
          {{ data.profile.visibility }}
        </span>
        @if (data.profile.indexable) {
          <span class="ff-badge ff-badge--info">Indexé</span>
        }
      </div>

      <!-- Rendu sommaire du portfolio -->
      <div class="preview">
        <div class="preview__hero">
          <span class="preview__initials">{{ monogram() }}</span>
          <div>
            <h2 class="preview__name">{{ data.profile.displayName }}</h2>
            @if (data.profile.headline) {
              <p class="preview__headline">{{ data.profile.headline }}</p>
            }
            @if (data.profile.location) {
              <p class="preview__location">{{ data.profile.location }}</p>
            }
          </div>
        </div>

        @if (data.profile.summary) {
          <p class="preview__summary">{{ data.profile.summary }}</p>
        }

        <div class="preview__stats">
          <div class="stat">
            <span class="stat__value">{{ data.experiences.length }}</span>
            <span class="stat__label">expérience(s)</span>
          </div>
          <div class="stat">
            <span class="stat__value">{{ visibleProjects().length }}</span>
            <span class="stat__label">projet(s) visible(s)</span>
          </div>
          <div class="stat">
            <span class="stat__value">{{ visibleSkills().length }}</span>
            <span class="stat__label">compétence(s) visible(s)</span>
          </div>
          <div class="stat">
            <span class="stat__value">{{ data.languages.length }}</span>
            <span class="stat__label">langue(s)</span>
          </div>
        </div>

        <!-- Sections masquées : signalées explicitement -->
        @if (hiddenSections().length > 0) {
          <div class="notice">
            <p class="notice__title">Sections masquées sur le portfolio public</p>
            <p class="notice__text">
              {{ hiddenSections().join(', ') }} — activez-les depuis l’onglet
              « Portfolio » de votre profil si vous souhaitez les afficher.
            </p>
          </div>
        }
      </div>
    } @else {
      <div class="ff-card ff-card--padded">
        <p class="ff-hint">Impossible de charger votre profil.</p>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .url-bar {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
        padding: 0.55rem 0.85rem;
        margin-bottom: 0.85rem;
        background: var(--ff-surface-muted);
        border: 1px solid var(--ff-line);
        border-radius: var(--ff-radius);
      }

      .url-bar__label {
        font-size: 0.66rem;
        font-weight: 650;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--ff-ink-faint);
      }

      .url-bar__value {
        font-size: var(--ff-text-sm);
        color: var(--ff-accent);
      }

      .preview {
        padding: 2rem;
        background: var(--ff-surface);
        border: 1px solid var(--ff-line);
        border-radius: var(--ff-radius-lg);
      }

      .preview__hero {
        display: flex;
        align-items: center;
        gap: 1.25rem;
        padding-bottom: 1.5rem;
        border-bottom: 1px solid var(--ff-line);
      }

      .preview__initials {
        display: grid;
        place-items: center;
        flex: none;
        width: 4.5rem;
        height: 4.5rem;
        border-radius: 50%;
        background: linear-gradient(150deg, var(--ff-accent), var(--ff-accent-hover));
        color: #fff;
        font-family: var(--ff-font-display);
        font-size: 1.5rem;
        font-weight: 600;
      }

      .preview__name {
        font-size: var(--ff-text-2xl);
        letter-spacing: -0.025em;
      }

      .preview__headline {
        font-size: var(--ff-text-sm);
        color: var(--ff-ink-soft);
        margin-top: 0.15rem;
      }

      .preview__location {
        font-size: var(--ff-text-xs);
        color: var(--ff-ink-muted);
        margin-top: 0.2rem;
      }

      .preview__summary {
        padding: 1.25rem 0;
        font-size: var(--ff-text-sm);
        line-height: 1.75;
        color: var(--ff-ink-soft);
        max-width: 70ch;
      }

      .preview__stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
        gap: 0.5rem;
      }

      .stat {
        display: flex;
        flex-direction: column;
        padding: 0.7rem;
        background: var(--ff-surface-muted);
        border-radius: var(--ff-radius);
      }

      .stat__value {
        font-family: var(--ff-font-display);
        font-size: var(--ff-text-lg);
        font-weight: 600;
        color: var(--ff-accent);
        line-height: 1.2;
      }

      .stat__label {
        font-size: 0.66rem;
        color: var(--ff-ink-muted);
      }

      .notice {
        margin-top: 1.25rem;
        padding: 0.7rem 0.85rem;
        background: var(--ff-warning-soft);
        border-radius: var(--ff-radius);
      }

      .notice__title {
        font-size: var(--ff-text-xs);
        font-weight: 650;
        color: var(--ff-warning);
      }

      .notice__text {
        font-size: var(--ff-text-xs);
        line-height: 1.6;
        color: var(--ff-ink-soft);
        margin-top: 0.15rem;
      }

      @media (max-width: 560px) {
        .preview {
          padding: 1.25rem;
        }

        .preview__hero {
          flex-direction: column;
          align-items: flex-start;
          gap: 0.85rem;
        }
      }
    `,
  ],
})
export class PortfolioPreviewPage {
  private readonly api = inject(ProfileApi);
  private readonly toasts = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly bundle = signal<ProfileBundle | null>(null);

  protected readonly slug = computed(() => this.bundle()?.profile?.slug);

  protected readonly visibleProjects = computed(
    () => (this.bundle()?.projects ?? []).filter((p) => p.visible),
  );

  protected readonly visibleSkills = computed(
    () => (this.bundle()?.skills ?? []).filter((s) => s.visible),
  );

  protected readonly monogram = computed(() => {
    const name = this.bundle()?.profile?.displayName ?? '';
    const parts = name.trim().split(/\s+/);
    return `${(parts[0] ?? '').charAt(0)}${(parts[1] ?? '').charAt(0)}`.toUpperCase() || '?';
  });

  /** Liste les sections explicitement désactivées, pour éviter les surprises. */
  protected readonly hiddenSections = computed(() => {
    const profile = this.bundle()?.profile;
    if (!profile) return [];
    const hidden: string[] = [];
    if (!profile.showProjects) hidden.push('Projets');
    if (!profile.showExperience) hidden.push('Expériences');
    if (!profile.showEducation) hidden.push('Formations');
    if (!profile.showSkills) hidden.push('Compétences');
    if (!profile.showEmail) hidden.push('Email');
    if (!profile.showPhone) hidden.push('Téléphone');
    return hidden;
  });

  constructor() {
    this.api.get().subscribe({
      next: (data) => {
        this.bundle.set(data);
        this.loading.set(false);
      },
      error: (failure: ApiFailure) => {
        this.loading.set(false);
        this.toasts.error(failure.message);
      },
    });
  }

  protected copyLink(): void {
    const slug = this.slug();
    if (!slug) return;

    const url = `${window.location.origin}/p/${slug}`;
    void navigator.clipboard.writeText(url).then(() => {
      this.toasts.success('Lien copié dans le presse-papiers.');
    });
  }
}
