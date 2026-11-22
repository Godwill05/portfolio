import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';

import { ApiFailure } from '../../core/api-error';
import { CvApi } from '../../core/cv.service';
import { AiApi } from '../../core/ai.service';
import { ToastService } from '../../core/ui/toast.service';
import { saveBlob, safeFilename } from '../../core/download';
import { CV_STATUS_LABELS, SECTION_TYPE_LABELS } from '../../core/format';
import type { Cv, CvSection, CvStatus, CvTemplate } from '../../core/models';

type Pane = 'content' | 'design' | 'ai';

@Component({
  selector: 'app-cv-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './cv-editor-page.html',
  styleUrl: './cv-editor-page.scss',
})
export class CvEditorPage {
  private readonly api = inject(CvApi);
  private readonly ai = inject(AiApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly toasts = inject(ToastService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly cv = signal<Cv | null>(null);
  protected readonly templates = signal<CvTemplate[]>([]);
  protected readonly pane = signal<Pane>('content');
  protected readonly previewUrl = signal<SafeResourceUrl | null>(null);
  protected readonly previewLoading = signal(false);
  protected readonly dirty = signal(false);

  /* Optimisation IA */
  protected readonly aiTargetRole = signal('');
  protected readonly aiBusy = signal(false);
  protected readonly aiResult = signal<Record<string, unknown> | null>(null);

  private currentObjectUrl: string | null = null;

  protected readonly metaForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    templateKey: [''],
    targetRole: [''],
    status: ['draft' as CvStatus],
  });

  protected readonly styleForm = this.fb.nonNullable.group({
    accentColor: ['#035c80'],
    fontScale: [100, [Validators.min(80), Validators.max(130)]],
    headingCase: ['none' as 'none' | 'upper'],
    density: ['normal' as 'compact' | 'normal' | 'relaxed'],
    showPhoto: [false],
  });

  protected readonly sections = computed(() => this.cv()?.document?.sections ?? []);

  protected readonly visibleSections = computed(() =>
    this.sections().filter((s) => s.visible),
  );

  protected readonly sectionLabels = SECTION_TYPE_LABELS;

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      void this.router.navigate(['/app/cvs']);
      return;
    }

    this.load(id);

    this.api.templates().subscribe({
      next: (list) => this.templates.set(list),
      error: () => {
        /* la liste des modèles est secondaire */
      },
    });
  }

  private load(id: string): void {
    this.loading.set(true);
    this.api.get(id).subscribe({
      next: (cv) => {
        this.cv.set(cv);
        this.metaForm.patchValue({
          title: cv.title,
          templateKey: cv.templateKey,
          targetRole: cv.targetRole ?? '',
          status: cv.status,
        });
        this.styleForm.patchValue({
          accentColor: cv.style?.accentColor ?? '#035c80',
          fontScale: cv.style?.fontScale ?? 100,
          headingCase: cv.style?.headingCase ?? 'none',
          density: cv.style?.density ?? 'normal',
          showPhoto: cv.style?.showPhoto ?? false,
        });
        this.aiTargetRole.set(cv.targetRole ?? '');
        this.loading.set(false);
        this.refreshPreview(cv.id);
      },
      error: (failure: ApiFailure) => {
        this.loading.set(false);
        this.toasts.error(failure.message);
        void this.router.navigate(['/app/cvs']);
      },
    });
  }

  /* ── Aperçu PDF ── */

  /**
   * L'endpoint PDF exige un header Authorization : on récupère donc le
   * blob et on l'injecte dans une URL objet. `bypassSecurityTrustResourceUrl`
   * est nécessaire car l'iframe refuse une URL `blob:` autrement.
   */
  protected refreshPreview(id?: string): void {
    const cvId = id ?? this.cv()?.id;
    if (!cvId) return;

    this.previewLoading.set(true);
    this.api.previewBlob(cvId).subscribe({
      next: (blob) => {
        if (this.currentObjectUrl) URL.revokeObjectURL(this.currentObjectUrl);
        this.currentObjectUrl = URL.createObjectURL(blob);
        this.previewUrl.set(
          this.sanitizer.bypassSecurityTrustResourceUrl(this.currentObjectUrl),
        );
        this.previewLoading.set(false);
      },
      error: () => {
        // L'aperçu peut échouer sans bloquer l'édition du contenu.
        this.previewLoading.set(false);
      },
    });
  }

  /* ── Enregistrement ── */

  protected save(): void {
    const current = this.cv();
    if (!current) return;

    if (this.metaForm.invalid) {
      this.metaForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const meta = this.metaForm.getRawValue();
    const style = this.styleForm.getRawValue();

    this.api
      .update(current.id, {
        title: meta.title,
        templateKey: meta.templateKey,
        targetRole: meta.targetRole || null,
        status: meta.status,
        style: {
          ...current.style,
          accentColor: style.accentColor,
          fontScale: Number(style.fontScale),
          headingCase: style.headingCase,
          density: style.density,
          showPhoto: style.showPhoto,
        },
        document: current.document,
      })
      .subscribe({
        next: (cv) => {
          this.cv.set(cv);
          this.saving.set(false);
          this.dirty.set(false);
          this.toasts.success('CV enregistré.');
          this.refreshPreview(cv.id);
        },
        error: (failure: ApiFailure) => {
          this.saving.set(false);
          this.toasts.error(failure.message);
        },
      });
  }

  protected markDirty(): void {
    this.dirty.set(true);
  }

  /* ── Édition du document ── */

  protected updateHeader(field: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.cv.update((current) => {
      if (!current) return current;
      return {
        ...current,
        document: {
          ...current.document,
          header: { ...current.document.header, [field]: value },
        },
      };
    });
    this.dirty.set(true);
  }

  protected updateSectionTitle(section: CvSection, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.patchSection(section.id, { title: value });
  }

  protected toggleSection(section: CvSection): void {
    this.patchSection(section.id, { visible: !section.visible });
  }

  protected updateSectionBody(section: CvSection, event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.patchSection(section.id, { body: value });
  }

  protected updateItemField(
    section: CvSection,
    itemId: string,
    field: string,
    event: Event,
  ): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.patchSection(section.id, {
      items: section.items.map((item) =>
        item.id === itemId ? { ...item, [field]: value } : item,
      ),
    });
  }

  private patchSection(sectionId: string, patch: Partial<CvSection>): void {
    this.cv.update((current) => {
      if (!current) return current;
      return {
        ...current,
        document: {
          ...current.document,
          sections: current.document.sections.map((s) =>
            s.id === sectionId ? { ...s, ...patch } : s,
          ),
        },
      };
    });
    this.dirty.set(true);
  }

  /* ── Actions ── */

  protected download(): void {
    const cv = this.cv();
    if (!cv) return;

    this.api.downloadPdf(cv.id).subscribe({
      next: (blob) => saveBlob(blob, safeFilename(cv.title, 'pdf')),
      error: (failure: ApiFailure) => this.toasts.error(failure.message),
    });
  }

  protected regenerate(): void {
    const cv = this.cv();
    if (!cv) return;
    if (!confirm('Régénérer le contenu depuis votre profil ? Les modifications manuelles seront perdues.')) {
      return;
    }

    this.saving.set(true);
    this.api.refresh(cv.id).subscribe({
      next: (updated) => {
        this.cv.set(updated);
        this.saving.set(false);
        this.toasts.success('CV régénéré depuis votre profil.');
        this.refreshPreview(updated.id);
      },
      error: (failure: ApiFailure) => {
        this.saving.set(false);
        this.toasts.error(failure.message);
      },
    });
  }

  protected duplicate(): void {
    const cv = this.cv();
    if (!cv) return;

    this.api.duplicate(cv.id).subscribe({
      next: (copy) => {
        this.toasts.success('Copie créée.');
        void this.router.navigate(['/app/cvs', copy.id]);
      },
      error: (failure: ApiFailure) => this.toasts.error(failure.message),
    });
  }

  /* ── Assistante IA ── */

  protected optimizeWithAi(): void {
    const cv = this.cv();
    if (!cv) return;

    this.aiBusy.set(true);
    this.ai
      .optimizeCv({
        targetRole: this.aiTargetRole() || cv.targetRole || undefined,
        currentText: cv.document.header.headline ?? undefined,
      })
      .subscribe({
        next: (result) => {
          this.aiBusy.set(false);
          this.aiResult.set(result);
          this.pane.set('ai');
        },
        error: (failure: ApiFailure) => {
          this.aiBusy.set(false);
          this.toasts.error(
            failure.isQuotaExceeded
              ? 'Quota d’optimisation atteint pour aujourd’hui.'
              : failure.message,
          );
        },
      });
  }

  /** Applique les puces suggérées à la première section d'expérience. */
  protected applySuggestion(): void {
    const result = this.aiResult();
    const bullets = (result?.['bullets'] as string[] | undefined) ?? [];
    if (bullets.length === 0) return;

    const experience = this.sections().find((s) => s.type === 'experience');
    const firstItem = experience?.items?.[0];
    if (!experience || !firstItem) {
      this.toasts.warning('Aucune expérience à enrichir dans ce CV.');
      return;
    }

    this.patchSection(experience.id, {
      items: experience.items.map((item) =>
        item.id === firstItem.id
          ? { ...item, bullets: [...(item.bullets ?? []), ...bullets] }
          : item,
      ),
    });
    this.toasts.success('Suggestions ajoutées. Enregistrez pour conserver.');
  }

  /* ── Aides d'affichage ── */

  protected statusLabel(status: string): string {
    return CV_STATUS_LABELS[status] ?? status;
  }

  protected asText(value: unknown): string {
    if (Array.isArray(value)) return value.map((v) => `• ${String(v)}`).join('\n');
    return value === null || value === undefined ? '' : String(value);
  }

  protected asList(value: unknown): string[] {
    return Array.isArray(value) ? value.map(String) : [];
  }

  protected stringify(value: unknown): string {
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  }
}
