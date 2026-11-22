import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { Modal } from '../../ui/modal';
import { SKILL_LEVEL_LABELS } from '../../core/format';
import type { Education, Experience, Language, Project, Skill } from '../../core/models';

export type EditorKind = 'skill' | 'experience' | 'project' | 'education' | 'language';

/**
 * Éditeur générique pour une entrée de section.
 *
 * Un seul composant plutôt que cinq quasi identiques : le formulaire est
 * construit dynamiquement à partir du type, ce qui garde la cohérence des
 * styles et de la validation à un seul endroit.
 */
@Component({
  selector: 'app-section-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Modal],
  template: `
    <app-modal [title]="title()" [description]="description()" (closed)="cancelled.emit()">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="form">
        <!-- Compétence -->
        @if (kind() === 'skill') {
          <div class="ff-field">
            <label class="ff-label ff-label--required" for="se-name">Nom</label>
            <input id="se-name" class="ff-input" formControlName="name" maxlength="120" />
            @if (invalid('name')) {
              <p class="ff-error">Le nom est requis.</p>
            }
          </div>

          <div class="row">
            <div class="ff-field">
              <label class="ff-label" for="se-category">Catégorie</label>
              <input id="se-category" class="ff-input" formControlName="category"
                     placeholder="Langages, Frameworks…" maxlength="80" />
            </div>
            <div class="ff-field">
              <label class="ff-label" for="se-level">Niveau</label>
              <select id="se-level" class="ff-select" formControlName="level">
                @for (entry of skillLevels; track entry[0]) {
                  <option [value]="entry[0]">{{ entry[1] }}</option>
                }
              </select>
            </div>
          </div>

          <div class="row">
            <div class="ff-field">
              <label class="ff-label" for="se-years">Années d’expérience</label>
              <input id="se-years" type="number" class="ff-input" formControlName="yearsOfExperience"
                     min="0" max="60" />
            </div>
            <div class="ff-field">
              <label class="ff-label" for="se-rating">Note (1 à 5)</label>
              <input id="se-rating" type="number" class="ff-input" formControlName="rating"
                     min="1" max="5" />
            </div>
          </div>

          <label class="check">
            <input type="checkbox" formControlName="featured" />
            <span>Mettre en avant sur le portfolio</span>
          </label>
        }

        <!-- Expérience -->
        @if (kind() === 'experience') {
          <div class="ff-field">
            <label class="ff-label ff-label--required" for="se-role">Poste</label>
            <input id="se-role" class="ff-input" formControlName="role" maxlength="180" />
            @if (invalid('role')) {
              <p class="ff-error">Le poste est requis.</p>
            }
          </div>

          <div class="row">
            <div class="ff-field">
              <label class="ff-label ff-label--required" for="se-company">Entreprise</label>
              <input id="se-company" class="ff-input" formControlName="company" maxlength="180" />
              @if (invalid('company')) {
                <p class="ff-error">L’entreprise est requise.</p>
              }
            </div>
            <div class="ff-field">
              <label class="ff-label" for="se-type">Type de contrat</label>
              <select id="se-type" class="ff-select" formControlName="type">
                @for (entry of experienceTypes; track entry[0]) {
                  <option [value]="entry[0]">{{ entry[1] }}</option>
                }
              </select>
            </div>
          </div>

          <div class="row">
            <div class="ff-field">
              <label class="ff-label ff-label--required" for="se-start">Début</label>
              <input id="se-start" type="date" class="ff-input" formControlName="startDate" />
              @if (invalid('startDate')) {
                <p class="ff-error">La date de début est requise.</p>
              }
            </div>
            <div class="ff-field">
              <label class="ff-label" for="se-end">Fin</label>
              <input id="se-end" type="date" class="ff-input" formControlName="endDate"
                     [attr.disabled]="current() ? '' : null" />
            </div>
          </div>

          <label class="check">
            <input type="checkbox" formControlName="isCurrent" (change)="onCurrentChange($event)" />
            <span>Poste actuel</span>
          </label>

          <div class="ff-field">
            <label class="ff-label" for="se-location">Lieu</label>
            <input id="se-location" class="ff-input" formControlName="location"
                   placeholder="Cotonou, Bénin" maxlength="160" />
          </div>

          <div class="ff-field">
            <label class="ff-label" for="se-desc">Description</label>
            <textarea id="se-desc" class="ff-textarea" formControlName="description"
                      rows="4" maxlength="3000"></textarea>
          </div>

          <div class="ff-field">
            <label class="ff-label" for="se-highlights">Points clés</label>
            <textarea id="se-highlights" class="ff-textarea" formControlName="highlights"
                      rows="3" placeholder="Une réalisation par ligne"></textarea>
            <p class="ff-hint">Une ligne par point. Les résultats chiffrés sont les plus lus.</p>
          </div>
        }

        <!-- Projet -->
        @if (kind() === 'project') {
          <div class="ff-field">
            <label class="ff-label ff-label--required" for="se-title">Titre</label>
            <input id="se-title" class="ff-input" formControlName="title" maxlength="180" />
            @if (invalid('title')) {
              <p class="ff-error">Le titre est requis.</p>
            }
          </div>

          <div class="ff-field">
            <label class="ff-label" for="se-subtitle">Sous-titre</label>
            <input id="se-subtitle" class="ff-input" formControlName="subtitle" maxlength="220" />
          </div>

          <div class="row">
            <div class="ff-field">
              <label class="ff-label" for="se-pstatus">Statut</label>
              <select id="se-pstatus" class="ff-select" formControlName="status">
                @for (entry of projectStatuses; track entry[0]) {
                  <option [value]="entry[0]">{{ entry[1] }}</option>
                }
              </select>
            </div>
            <div class="ff-field">
              <label class="ff-label" for="se-pcategory">Catégorie</label>
              <input id="se-pcategory" class="ff-input" formControlName="category"
                     maxlength="80" />
            </div>
          </div>

          <div class="ff-field">
            <label class="ff-label" for="se-pdesc">Description</label>
            <textarea id="se-pdesc" class="ff-textarea" formControlName="description"
                      rows="4" maxlength="6000"></textarea>
          </div>

          <div class="ff-field">
            <label class="ff-label" for="se-tech">Technologies</label>
            <input id="se-tech" class="ff-input" formControlName="technologies"
                   placeholder="Angular, NestJS, MySQL" />
            <p class="ff-hint">Séparées par des virgules.</p>
          </div>

          <div class="row">
            <div class="ff-field">
              <label class="ff-label" for="se-demo">Démo</label>
              <input id="se-demo" type="url" class="ff-input" formControlName="demoUrl"
                     placeholder="https://" />
            </div>
            <div class="ff-field">
              <label class="ff-label" for="se-repo">Dépôt</label>
              <input id="se-repo" type="url" class="ff-input" formControlName="repositoryUrl"
                     placeholder="https://" />
            </div>
          </div>

          <label class="check">
            <input type="checkbox" formControlName="isHighlighted" />
            <span>Projet mis en avant</span>
          </label>
        }

        <!-- Formation -->
        @if (kind() === 'education') {
          <div class="ff-field">
            <label class="ff-label ff-label--required" for="se-edtitle">Intitulé</label>
            <input id="se-edtitle" class="ff-input" formControlName="title" maxlength="180" />
            @if (invalid('title')) {
              <p class="ff-error">L’intitulé est requis.</p>
            }
          </div>

          <div class="row">
            <div class="ff-field">
              <label class="ff-label ff-label--required" for="se-institution">Établissement</label>
              <input id="se-institution" class="ff-input" formControlName="institution"
                     maxlength="180" />
              @if (invalid('institution')) {
                <p class="ff-error">L’établissement est requis.</p>
              }
            </div>
            <div class="ff-field">
              <label class="ff-label" for="se-kind">Type</label>
              <select id="se-kind" class="ff-select" formControlName="kind">
                @for (entry of educationKinds; track entry[0]) {
                  <option [value]="entry[0]">{{ entry[1] }}</option>
                }
              </select>
            </div>
          </div>

          <div class="row">
            <div class="ff-field">
              <label class="ff-label" for="se-field">Domaine</label>
              <input id="se-field" class="ff-input" formControlName="field" maxlength="160" />
            </div>
            <div class="ff-field">
              <label class="ff-label" for="se-grade">Mention</label>
              <input id="se-grade" class="ff-input" formControlName="grade" maxlength="80" />
            </div>
          </div>

          <div class="row">
            <div class="ff-field">
              <label class="ff-label" for="se-edstart">Début</label>
              <input id="se-edstart" type="date" class="ff-input" formControlName="startDate" />
            </div>
            <div class="ff-field">
              <label class="ff-label" for="se-edend">Fin</label>
              <input id="se-edend" type="date" class="ff-input" formControlName="endDate" />
            </div>
          </div>
        }

        <!-- Langue -->
        @if (kind() === 'language') {
          <div class="ff-field">
            <label class="ff-label ff-label--required" for="se-lang">Langue</label>
            <input id="se-lang" class="ff-input" formControlName="name" maxlength="80" />
            @if (invalid('name')) {
              <p class="ff-error">La langue est requise.</p>
            }
          </div>

          <div class="row">
            <div class="ff-field">
              <label class="ff-label" for="se-langlevel">Niveau</label>
              <select id="se-langlevel" class="ff-select" formControlName="level">
                @for (entry of languageLevels; track entry[0]) {
                  <option [value]="entry[0]">{{ entry[1] }}</option>
                }
              </select>
            </div>
            <div class="ff-field">
              <label class="ff-label" for="se-proficiency">Maîtrise (1 à 5)</label>
              <input id="se-proficiency" type="number" class="ff-input"
                     formControlName="proficiency" min="1" max="5" />
            </div>
          </div>

          <label class="check">
            <input type="checkbox" formControlName="isNative" />
            <span>Langue maternelle</span>
          </label>
        }

        <footer class="actions">
          <button type="button" class="ff-btn ff-btn--secondary" (click)="cancelled.emit()">
            Annuler
          </button>
          <button type="submit" class="ff-btn ff-btn--primary" [disabled]="saving()">
            {{ isEdit() ? 'Enregistrer' : 'Ajouter' }}
          </button>
        </footer>
      </form>
    </app-modal>
  `,
  styles: [
    `
      .form {
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
      }

      .row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
      }

      .check {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: var(--ff-text-sm);
        color: var(--ff-ink-soft);
        cursor: pointer;
      }

      .check input {
        width: 1rem;
        height: 1rem;
        accent-color: var(--ff-accent);
      }

      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        padding-top: 0.4rem;
        border-top: 1px solid var(--ff-line);
        margin-top: 0.3rem;
      }

      @media (max-width: 520px) {
        .row {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class SectionEditor {
  readonly kind = input.required<EditorKind>();
  /** `null` = création, objet = édition, `undefined` = fermé. */
  readonly value = input<Skill | Experience | Project | Education | Language | null>();
  readonly saving = input(false);

  readonly saved = output<Record<string, unknown>>();
  readonly cancelled = output<void>();

  private readonly fb = inject(FormBuilder);

  protected readonly skillLevels = Object.entries(SKILL_LEVEL_LABELS);
  protected readonly experienceTypes = Object.entries({
    full_time: 'CDI',
    part_time: 'Temps partiel',
    contract: 'Contrat',
    freelance: 'Freelance',
    internship: 'Stage',
    apprenticeship: 'Alternance',
    volunteer: 'Bénévolat',
  });
  protected readonly projectStatuses = Object.entries({
    planned: 'Prévu',
    in_progress: 'En cours',
    completed: 'Terminé',
    archived: 'Archivé',
  });
  protected readonly educationKinds = Object.entries({
    degree: 'Diplôme',
    certification: 'Certification',
    training: 'Formation',
    academic_project: 'Projet académique',
  });
  protected readonly languageLevels = [
    ['basic', 'Notions'],
    ['intermediate', 'Intermédiaire'],
    ['advanced', 'Avancé'],
    ['fluent', 'Courant'],
    ['native', 'Langue maternelle'],
  ] as const;

  protected readonly isEdit = computed(() => Boolean(this.value()));

  protected readonly title = computed(() => {
    const prefix = this.isEdit() ? 'Modifier' : 'Ajouter';
    switch (this.kind()) {
      case 'skill':
        return `${prefix} une compétence`;
      case 'experience':
        return `${prefix} une expérience`;
      case 'project':
        return `${prefix} un projet`;
      case 'education':
        return `${prefix} une formation`;
      default:
        return `${prefix} une langue`;
    }
  });

  protected readonly description = computed<string | undefined>(() =>
    this.kind() === 'experience'
      ? 'Les résultats concrets valent mieux qu’une liste de tâches.'
      : undefined,
  );

  protected readonly current = signal(false);

  protected readonly form = this.buildForm();

  private buildForm() {
    const value = this.value() as Record<string, unknown> | null | undefined;
    const kind = this.kind();

    const group: Record<string, FormControl> = {};

    const add = (name: string, control: FormControl) => {
      group[name] = control;
    };
    const text = (initial?: unknown, validators: unknown[] = []) =>
      new FormControl(String(initial ?? ''), { validators: validators as never, nonNullable: true });
    const num = (initial?: unknown) =>
      new FormControl(initial === null || initial === undefined ? null : Number(initial));

    switch (kind) {
      case 'skill':
        add('name', text(value?.['name'], [Validators.required, Validators.maxLength(120)]));
        add('category', text(value?.['category'], [Validators.maxLength(80)]));
        add('level', text(value?.['level'] ?? 'intermediate'));
        add('yearsOfExperience', num(value?.['yearsOfExperience']));
        add('rating', num(value?.['rating']));
        add('featured', new FormControl(Boolean(value?.['featured'])));
        break;

      case 'experience':
        add('role', text(value?.['role'], [Validators.required, Validators.maxLength(180)]));
        add('company', text(value?.['company'], [Validators.required, Validators.maxLength(180)]));
        add('type', text(value?.['type'] ?? 'full_time'));
        add('startDate', text(this.toDateInput(value?.['startDate']), [Validators.required]));
        add('endDate', text(this.toDateInput(value?.['endDate'])));
        add('isCurrent', new FormControl(Boolean(value?.['isCurrent'])));
        add('location', text(value?.['location'], [Validators.maxLength(160)]));
        add('description', text(value?.['description']));
        add(
          'highlights',
          text(((value?.['highlights'] as string[]) ?? []).join('\n')),
        );
        break;

      case 'project':
        add('title', text(value?.['title'], [Validators.required, Validators.maxLength(180)]));
        add('subtitle', text(value?.['subtitle'], [Validators.maxLength(220)]));
        add('status', text(value?.['status'] ?? 'in_progress'));
        add('category', text(value?.['category'], [Validators.maxLength(80)]));
        add('description', text(value?.['description']));
        add(
          'technologies',
          text(((value?.['technologies'] as string[]) ?? []).join(', ')),
        );
        add('demoUrl', text(value?.['demoUrl']));
        add('repositoryUrl', text(value?.['repositoryUrl']));
        add('isHighlighted', new FormControl(Boolean(value?.['isHighlighted'])));
        break;

      case 'education':
        add('title', text(value?.['title'], [Validators.required, Validators.maxLength(180)]));
        add(
          'institution',
          text(value?.['institution'], [Validators.required, Validators.maxLength(180)]),
        );
        add('kind', text(value?.['kind'] ?? 'degree'));
        add('field', text(value?.['field'], [Validators.maxLength(160)]));
        add('grade', text(value?.['grade'], [Validators.maxLength(80)]));
        add('startDate', text(this.toDateInput(value?.['startDate'])));
        add('endDate', text(this.toDateInput(value?.['endDate'])));
        break;

      default:
        add('name', text(value?.['name'], [Validators.required, Validators.maxLength(80)]));
        add('level', text(value?.['level'] ?? 'fluent'));
        add('proficiency', num(value?.['proficiency']));
        add('isNative', new FormControl(Boolean(value?.['isNative'])));
    }

    return this.fb.group(group);
  }

  /** `<input type="date">` exige `YYYY-MM-DD`, pas un timestamp ISO complet. */
  private toDateInput(value: unknown): string {
    if (!value) return '';
    const raw = String(value);
    return raw.length >= 10 ? raw.slice(0, 10) : raw;
  }

  protected invalid(field: string): boolean {
    const control = this.form.get(field);
    return Boolean(control?.invalid && control.touched);
  }

  protected onCurrentChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.current.set(checked);
    if (checked) this.form.get('endDate')?.setValue('');
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue() as Record<string, unknown>;
    const kind = this.kind();
    const payload: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(raw)) {
      if (value === '' || value === null) continue;

      // Champs transformés : listes en texte → tableaux, nombres → entiers.
      if (key === 'technologies') {
        payload[key] = String(value)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (key === 'highlights') {
        payload[key] = String(value)
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (key === 'yearsOfExperience' || key === 'rating' || key === 'proficiency') {
        payload[key] = Number(value);
      } else {
        payload[key] = value;
      }
    }

    // Un poste « actuel » n'a pas de date de fin.
    if (kind === 'experience' && raw['isCurrent']) payload['endDate'] = null;

    this.saved.emit(payload);
  }
}
