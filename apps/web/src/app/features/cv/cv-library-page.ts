import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ApiFailure } from '../../core/api-error';
import { CvApi } from '../../core/cv.service';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader } from '../../ui/page-header';
import { Modal } from '../../ui/modal';
import { saveBlob, safeFilename } from '../../core/download';
import { CV_STATUS_LABELS, formatRelative } from '../../core/format';
import type { Cv, CvStatus, CvTemplate } from '../../core/models';

@Component({
  selector: 'app-cv-library-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeader, Modal],
  templateUrl: './cv-library-page.html',
  styleUrl: './cv-library-page.scss',
})
export class CvLibraryPage {
  private readonly api = inject(CvApi);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly cvs = signal<Cv[]>([]);
  protected readonly templates = signal<CvTemplate[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly limit = 12;

  protected readonly search = signal('');
  protected readonly statusFilter = signal<CvStatus | ''>('');
  protected readonly busyId = signal<string | null>(null);

  /* Assistant de création */
  protected readonly creating = signal(false);
  protected readonly newTitle = signal('');
  protected readonly newTemplate = signal('meridian');
  protected readonly newTargetRole = signal('');

  protected readonly filtered = computed(() => {
    // Le filtrage serveur est déjà appliqué ; on refiltre localement la
    // recherche pour un retour instantané sans nouvelle requête.
    const term = this.search().trim().toLowerCase();
    if (!term) return this.cvs();
    return this.cvs().filter(
      (cv) =>
        cv.title.toLowerCase().includes(term) ||
        (cv.targetRole ?? '').toLowerCase().includes(term),
    );
  });

  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.limit)));

  /** Regroupement par catégorie pour la galerie de modèles. */
  protected readonly templatesByCategory = computed(() => {
    const groups = new Map<string, CvTemplate[]>();
    for (const template of this.templates()) {
      const key = template.category;
      const list = groups.get(key) ?? [];
      list.push(template);
      groups.set(key, list);
    }
    return [...groups.entries()].map(([category, items]) => ({ category, items }));
  });

  constructor() {
    this.load();
    this.api.templates().subscribe({
      next: (list) => {
        this.templates.set(list);
        if (list.length > 0) this.newTemplate.set(list[0].key);
      },
      error: () => {
        /* la galerie est secondaire */
      },
    });
  }

  private load(): void {
    this.loading.set(true);
    this.api
      .list({
        page: this.page(),
        limit: this.limit,
        search: this.search() || undefined,
        status: this.statusFilter() || undefined,
      })
      .subscribe({
        next: (result) => {
          this.cvs.set(result.items);
          this.total.set(result.meta.total);
          this.loading.set(false);
        },
        error: (failure: ApiFailure) => {
          this.loading.set(false);
          this.toasts.error(failure.message);
        },
      });
  }

  protected applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  protected goToPage(next: number): void {
    if (next < 1 || next > this.pages()) return;
    this.page.set(next);
    this.load();
  }

  /* ── Création ── */

  protected openCreate(): void {
    this.newTitle.set('');
    this.newTargetRole.set('');
    this.creating.set(true);
  }

  protected create(): void {
    const title = this.newTitle().trim();
    if (!title) {
      this.toasts.error('Donnez un titre à votre CV.');
      return;
    }

    this.api
      .create({
        title,
        templateKey: this.newTemplate(),
        targetRole: this.newTargetRole().trim() || null,
      })
      .subscribe({
        next: (cv) => {
          this.creating.set(false);
          this.toasts.success('CV créé.');
          void this.router.navigate(['/app/cvs', cv.id]);
        },
        error: (failure: ApiFailure) => this.toasts.error(failure.message),
      });
  }

  /* ── Actions par CV ── */

  protected duplicate(cv: Cv): void {
    this.busyId.set(cv.id);
    this.api.duplicate(cv.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toasts.success('CV dupliqué.');
        this.load();
      },
      error: (failure: ApiFailure) => {
        this.busyId.set(null);
        this.toasts.error(failure.message);
      },
    });
  }

  protected download(cv: Cv): void {
    this.busyId.set(cv.id);
    this.api.downloadPdf(cv.id).subscribe({
      next: (blob) => {
        this.busyId.set(null);
        saveBlob(blob, safeFilename(cv.title, 'pdf'));
      },
      error: (failure: ApiFailure) => {
        this.busyId.set(null);
        this.toasts.error(failure.message);
      },
    });
  }

  protected remove(cv: Cv): void {
    if (!confirm(`Supprimer « ${cv.title} » ? Cette action est réversible via l’API.`)) return;

    this.busyId.set(cv.id);
    this.api.remove(cv.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toasts.success('CV supprimé.');
        this.load();
      },
      error: (failure: ApiFailure) => {
        this.busyId.set(null);
        this.toasts.error(failure.message);
      },
    });
  }

  protected relative(value: string): string {
    return formatRelative(value);
  }

  protected statusLabel(status: string): string {
    return CV_STATUS_LABELS[status] ?? status;
  }

  protected templateName(key: string): string {
    return this.templates().find((t) => t.key === key)?.name ?? key;
  }

  protected closeCreate = () => this.creating.set(false);
}
