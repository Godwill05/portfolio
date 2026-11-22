import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ApiFailure } from '../../core/api-error';
import { ProfileApi, type Completeness } from '../../core/profile.service';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader } from '../../ui/page-header';
import { SectionEditor } from './section-editor';
import {
  EDUCATION_KIND_LABELS,
  EXPERIENCE_TYPE_LABELS,
  PROJECT_STATUS_LABELS,
  SKILL_LEVEL_LABELS,
  formatPeriod,
} from '../../core/format';
import type {
  Education,
  Experience,
  Language,
  Profile,
  Project,
  Skill,
} from '../../core/models';

type Tab = 'identity' | 'skills' | 'experiences' | 'projects' | 'educations' | 'languages' | 'portfolio';

@Component({
  selector: 'app-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, PageHeader, SectionEditor],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss',
})
export class ProfilePage {
  private readonly api = inject(ProfileApi);
  private readonly fb = inject(FormBuilder);
  private readonly toasts = inject(ToastService);

  protected readonly tab = signal<Tab>('identity');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);

  protected readonly profile = signal<Profile | null>(null);
  protected readonly skills = signal<Skill[]>([]);
  protected readonly projects = signal<Project[]>([]);
  protected readonly experiences = signal<Experience[]>([]);
  protected readonly educations = signal<Education[]>([]);
  protected readonly languages = signal<Language[]>([]);
  protected readonly completeness = signal<Completeness | null>(null);

  /* ── Formulaire d'identité ── */
  protected readonly form = this.fb.group({
    displayName: ['', [Validators.required, Validators.maxLength(120)]],
    headline: ['', [Validators.maxLength(180)]],
    professionalTitle: ['', [Validators.maxLength(120)]],
    summary: ['', [Validators.maxLength(4000)]],
    location: ['', [Validators.maxLength(160)]],
    publicEmail: ['', [Validators.email]],
    phone: ['', [Validators.maxLength(40)]],
    websiteUrl: [''],
    linkedinUrl: [''],
    githubUrl: [''],
    twitterUrl: [''],
    dribbbleUrl: [''],
  });

  /* ── Dialogues ── */
  protected readonly editingSkill = signal<Skill | null | undefined>(undefined);
  protected readonly editingExperience = signal<Experience | null | undefined>(undefined);
  protected readonly editingProject = signal<Project | null | undefined>(undefined);
  protected readonly editingEducation = signal<Education | null | undefined>(undefined);
  protected readonly editingLanguage = signal<Language | null | undefined>(undefined);

  protected readonly tabs: { id: Tab; label: string; count?: () => number }[] = [
    { id: 'identity', label: 'Identité' },
    { id: 'skills', label: 'Compétences', count: () => this.skills().length },
    { id: 'experiences', label: 'Expériences', count: () => this.experiences().length },
    { id: 'projects', label: 'Projets', count: () => this.projects().length },
    { id: 'educations', label: 'Formations', count: () => this.educations().length },
    { id: 'languages', label: 'Langues', count: () => this.languages().length },
    { id: 'portfolio', label: 'Portfolio' },
  ];

  protected readonly pendingChecks = computed(
    () => this.completeness()?.checks.filter((c) => !c.done) ?? [],
  );

  protected readonly summaryLength = signal(0);

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.get().subscribe({
      next: (bundle) => {
        this.profile.set(bundle.profile);
        this.skills.set(bundle.skills);
        this.projects.set(bundle.projects);
        this.experiences.set(bundle.experiences);
        this.educations.set(bundle.educations);
        this.languages.set(bundle.languages);
        this.completeness.set(bundle.completeness);

        this.form.patchValue({
          displayName: bundle.profile.displayName ?? '',
          headline: bundle.profile.headline ?? '',
          professionalTitle: bundle.profile.professionalTitle ?? '',
          summary: bundle.profile.summary ?? '',
          location: bundle.profile.location ?? '',
          publicEmail: bundle.profile.publicEmail ?? '',
          phone: bundle.profile.phone ?? '',
          websiteUrl: bundle.profile.websiteUrl ?? '',
          linkedinUrl: bundle.profile.linkedinUrl ?? '',
          githubUrl: bundle.profile.githubUrl ?? '',
          twitterUrl: bundle.profile.twitterUrl ?? '',
          dribbbleUrl: bundle.profile.dribbbleUrl ?? '',
        });
        this.summaryLength.set(bundle.profile.summary?.length ?? 0);
        this.loading.set(false);
      },
      error: (failure: ApiFailure) => {
        this.loading.set(false);
        this.toasts.error(failure.message);
      },
    });
  }

  protected saveIdentity(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    // `emptyToNull` côté serveur : on envoie des chaînes vides, l'API les
    // convertit en NULL plutôt que de stocker "".
    const raw = this.form.getRawValue();
    const payload = Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, value === '' ? null : value]),
    );

    this.api.update(payload).subscribe({
      next: (profile) => {
        this.profile.set(profile);
        this.saving.set(false);
        this.toasts.success('Profil enregistré.');
        this.refreshCompleteness();
      },
      error: (failure: ApiFailure) => {
        this.saving.set(false);
        // Les erreurs de validation arrivent en `details` : on affiche la
        // première, plus précise qu'un message générique.
        const detail = Array.isArray(failure.details) ? String(failure.details[0]) : null;
        this.toasts.error(detail ?? failure.message);
      },
    });
  }

  /* ── Complétude ── */

  private refreshCompleteness(): void {
    this.api.get().subscribe({
      next: (bundle) => {
        this.completeness.set(bundle.completeness);
        this.profile.set(bundle.profile);
      },
      error: () => {
        /* le score n'est pas critique */
      },
    });
  }

  /* ── Compétences ── */

  protected openSkill(skill?: Skill): void {
    this.editingSkill.set(skill ?? null);
  }

  protected saveSkill(payload: Partial<Skill>): void {
    const existing = this.editingSkill();
    const request = existing
      ? this.api.updateSkill(existing.id, payload)
      : this.api.createSkill(payload);

    request.subscribe({
      next: (skill) => {
        this.skills.update((list) =>
          existing ? list.map((s) => (s.id === skill.id ? skill : s)) : [...list, skill],
        );
        this.editingSkill.set(undefined);
        this.toasts.success(existing ? 'Compétence mise à jour.' : 'Compétence ajoutée.');
        this.refreshCompleteness();
      },
      error: (failure: ApiFailure) => this.toasts.error(failure.message),
    });
  }

  protected deleteSkill(skill: Skill): void {
    if (!confirm(`Supprimer la compétence « ${skill.name} » ?`)) return;

    this.api.deleteSkill(skill.id).subscribe({
      next: () => {
        this.skills.update((list) => list.filter((s) => s.id !== skill.id));
        this.toasts.success('Compétence supprimée.');
        this.refreshCompleteness();
      },
      error: (failure: ApiFailure) => this.toasts.error(failure.message),
    });
  }

  /* ── Expériences ── */

  protected openExperience(experience?: Experience): void {
    this.editingExperience.set(experience ?? null);
  }

  protected saveExperience(payload: Partial<Experience>): void {
    const existing = this.editingExperience();
    const request = existing
      ? this.api.updateExperience(existing.id, payload)
      : this.api.createExperience(payload);

    request.subscribe({
      next: (item) => {
        this.experiences.update((list) =>
          existing ? list.map((e) => (e.id === item.id ? item : e)) : [...list, item],
        );
        this.editingExperience.set(undefined);
        this.toasts.success(existing ? 'Expérience mise à jour.' : 'Expérience ajoutée.');
        this.refreshCompleteness();
      },
      error: (failure: ApiFailure) => this.toasts.error(failure.message),
    });
  }

  protected deleteExperience(experience: Experience): void {
    if (!confirm(`Supprimer l’expérience chez « ${experience.company} » ?`)) return;

    this.api.deleteExperience(experience.id).subscribe({
      next: () => {
        this.experiences.update((list) => list.filter((e) => e.id !== experience.id));
        this.toasts.success('Expérience supprimée.');
        this.refreshCompleteness();
      },
      error: (failure: ApiFailure) => this.toasts.error(failure.message),
    });
  }

  /* ── Projets ── */

  protected openProject(project?: Project): void {
    this.editingProject.set(project ?? null);
  }

  protected saveProject(payload: Partial<Project>): void {
    const existing = this.editingProject();
    const request = existing
      ? this.api.updateProject(existing.id, payload)
      : this.api.createProject(payload);

    request.subscribe({
      next: (item) => {
        this.projects.update((list) =>
          existing ? list.map((p) => (p.id === item.id ? item : p)) : [...list, item],
        );
        this.editingProject.set(undefined);
        this.toasts.success(existing ? 'Projet mis à jour.' : 'Projet ajouté.');
        this.refreshCompleteness();
      },
      error: (failure: ApiFailure) => this.toasts.error(failure.message),
    });
  }

  protected deleteProject(project: Project): void {
    if (!confirm(`Supprimer le projet « ${project.title} » ?`)) return;

    this.api.deleteProject(project.id).subscribe({
      next: () => {
        this.projects.update((list) => list.filter((p) => p.id !== project.id));
        this.toasts.success('Projet supprimé.');
        this.refreshCompleteness();
      },
      error: (failure: ApiFailure) => this.toasts.error(failure.message),
    });
  }

  /* ── Formations ── */

  protected openEducation(education?: Education): void {
    this.editingEducation.set(education ?? null);
  }

  protected saveEducation(payload: Partial<Education>): void {
    const existing = this.editingEducation();
    const request = existing
      ? this.api.updateEducation(existing.id, payload)
      : this.api.createEducation(payload);

    request.subscribe({
      next: (item) => {
        this.educations.update((list) =>
          existing ? list.map((e) => (e.id === item.id ? item : e)) : [...list, item],
        );
        this.editingEducation.set(undefined);
        this.toasts.success(existing ? 'Formation mise à jour.' : 'Formation ajoutée.');
        this.refreshCompleteness();
      },
      error: (failure: ApiFailure) => this.toasts.error(failure.message),
    });
  }

  protected deleteEducation(education: Education): void {
    if (!confirm(`Supprimer « ${education.title} » ?`)) return;

    this.api.deleteEducation(education.id).subscribe({
      next: () => {
        this.educations.update((list) => list.filter((e) => e.id !== education.id));
        this.toasts.success('Formation supprimée.');
        this.refreshCompleteness();
      },
      error: (failure: ApiFailure) => this.toasts.error(failure.message),
    });
  }

  /* ── Langues ── */

  protected openLanguage(language?: Language): void {
    this.editingLanguage.set(language ?? null);
  }

  protected saveLanguage(payload: Partial<Language>): void {
    const existing = this.editingLanguage();
    const request = existing
      ? this.api.updateLanguage(existing.id, payload)
      : this.api.createLanguage(payload);

    request.subscribe({
      next: (item) => {
        this.languages.update((list) =>
          existing ? list.map((l) => (l.id === item.id ? item : l)) : [...list, item],
        );
        this.editingLanguage.set(undefined);
        this.toasts.success(existing ? 'Langue mise à jour.' : 'Langue ajoutée.');
      },
      error: (failure: ApiFailure) => this.toasts.error(failure.message),
    });
  }

  protected deleteLanguage(language: Language): void {
    if (!confirm(`Supprimer « ${language.name} » ?`)) return;

    this.api.deleteLanguage(language.id).subscribe({
      next: () => {
        this.languages.update((list) => list.filter((l) => l.id !== language.id));
        this.toasts.success('Langue supprimée.');
      },
      error: (failure: ApiFailure) => this.toasts.error(failure.message),
    });
  }

  /* ── Aides d'affichage ── */

  protected readonly skillLevel = (level: string): string => SKILL_LEVEL_LABELS[level] ?? level;
  protected readonly expType = (type: string): string => EXPERIENCE_TYPE_LABELS[type] ?? type;
  protected readonly eduKind = (kind: string): string => EDUCATION_KIND_LABELS[kind] ?? kind;
  protected readonly projectStatus = (status: string): string =>
    PROJECT_STATUS_LABELS[status] ?? status;
  protected readonly period = (start: string | null, end: string | null): string =>
    formatPeriod(start, end);

  protected onSummaryInput(event: Event): void {
    this.summaryLength.set((event.target as HTMLTextAreaElement).value.length);
  }

  protected closeSkill = () => this.editingSkill.set(undefined);
  protected closeExperience = () => this.editingExperience.set(undefined);
  protected closeProject = () => this.editingProject.set(undefined);
  protected closeEducation = () => this.editingEducation.set(undefined);
  protected closeLanguage = () => this.editingLanguage.set(undefined);
}
