import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { ApiFailure } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/ui/toast.service';

/**
 * Règles identiques à celles du DTO backend — les dupliquer ici évite un
 * aller-retour réseau pour un mot de passe manifestement trop faible.
 */
const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

@Component({
  selector: 'app-register-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="head">
      <h1 class="head__title">Créer un compte</h1>
      <p class="head__sub">Quelques instants suffisent pour démarrer.</p>
    </div>

    @if (error(); as message) {
      <div class="alert" role="alert">{{ message }}</div>
    }

    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="row">
        <div class="ff-field">
          <label class="ff-label ff-label--required" for="firstName">Prénom</label>
          <input
            id="firstName"
            class="ff-input"
            [class.ff-input--invalid]="showError('firstName')"
            formControlName="firstName"
            autocomplete="given-name"
            maxlength="100"
          />
          @if (showError('firstName')) {
            <p class="ff-error">Le prénom est requis.</p>
          }
        </div>

        <div class="ff-field">
          <label class="ff-label ff-label--required" for="lastName">Nom</label>
          <input
            id="lastName"
            class="ff-input"
            [class.ff-input--invalid]="showError('lastName')"
            formControlName="lastName"
            autocomplete="family-name"
            maxlength="100"
          />
          @if (showError('lastName')) {
            <p class="ff-error">Le nom est requis.</p>
          }
        </div>
      </div>

      <div class="ff-field">
        <label class="ff-label ff-label--required" for="email">Adresse email</label>
        <input
          id="email"
          type="email"
          class="ff-input"
          [class.ff-input--invalid]="showError('email')"
          formControlName="email"
          autocomplete="email"
          inputmode="email"
          placeholder="vous@exemple.com"
        />
        @if (showError('email')) {
          <p class="ff-error">Saisissez une adresse email valide.</p>
        }
      </div>

      <div class="ff-field">
        <label class="ff-label ff-label--required" for="password">Mot de passe</label>
        <input
          id="password"
          type="password"
          class="ff-input"
          [class.ff-input--invalid]="showError('password')"
          formControlName="password"
          autocomplete="new-password"
          aria-describedby="password-hint"
        />

        <!-- Retour visuel progressif plutôt qu'un simple message d'erreur. -->
        <div class="meter" aria-hidden="true">
          @for (i of [1, 2, 3, 4]; track i) {
            <span class="meter__bar" [class.meter__bar--on]="strength() >= i"
                  [class.meter__bar--weak]="strength() === 1"
                  [class.meter__bar--ok]="strength() === 3"></span>
          }
        </div>

        <p class="ff-hint" id="password-hint">
          10 caractères minimum, avec une majuscule, une minuscule et un chiffre.
          @if (passwordValue().length > 0) {
            <span class="meter__label">— {{ strengthLabel() }}</span>
          }
        </p>
        @if (showError('password')) {
          <p class="ff-error">{{ passwordMessage() }}</p>
        }
      </div>

      <div class="ff-field">
        <label class="ff-label" for="locale">Langue de l’interface</label>
        <select id="locale" class="ff-select" formControlName="locale">
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </div>

      <button type="submit" class="ff-btn ff-btn--primary ff-btn--lg submit" [disabled]="pending()">
        @if (pending()) {
          <span class="spinner" aria-hidden="true"></span>
          Création…
        } @else {
          Créer mon compte
        }
      </button>
    </form>

    <p class="foot">
      Déjà inscrit ?
      <a routerLink="/auth/login">Se connecter</a>
    </p>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .head {
        margin-bottom: 1.5rem;
      }

      .head__title {
        font-size: var(--ff-text-2xl);
        margin-bottom: 0.35rem;
      }

      .head__sub {
        color: var(--ff-ink-muted);
      }

      form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
      }

      .meter {
        display: flex;
        gap: 0.25rem;
        margin-top: 0.1rem;
      }

      .meter__bar {
        height: 3px;
        flex: 1;
        border-radius: 2px;
        background: var(--ff-line);
        transition: background var(--ff-transition);
      }

      .meter__bar--on {
        background: var(--ff-success);
      }

      .meter__bar--weak {
        background: var(--ff-danger);
      }

      .meter__bar--ok {
        background: var(--ff-success);
      }

      .meter__label {
        color: var(--ff-ink-soft);
        font-weight: 550;
      }

      .submit {
        width: 100%;
        margin-top: 0.25rem;
      }

      .foot {
        margin-top: 1.35rem;
        text-align: center;
        font-size: var(--ff-text-sm);
        color: var(--ff-ink-muted);
      }

      .alert {
        padding: 0.65rem 0.8rem;
        margin-bottom: 1rem;
        background: var(--ff-danger-soft);
        color: var(--ff-danger);
        border-radius: var(--ff-radius);
        font-size: var(--ff-text-sm);
        border-left: 3px solid var(--ff-danger);
      }

      .spinner {
        width: 0.85rem;
        height: 0.85rem;
        border: 2px solid rgba(255, 255, 255, 0.35);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (max-width: 420px) {
        .row {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  private submitted = false;

  protected readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(100)]],
    lastName: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    password: [
      '',
      [
        Validators.required,
        Validators.minLength(10),
        Validators.maxLength(128),
        Validators.pattern(PASSWORD_POLICY),
      ],
    ],
    locale: ['fr'],
  });

  protected readonly passwordValue = computed(() => this.form.controls.password.value ?? '');

  /** 0 à 4 — combine longueur et variété des caractères. */
  protected readonly strength = computed(() => {
    const value = this.passwordValue();
    if (!value) return 0;

    let score = 0;
    if (value.length >= 10) score++;
    if (value.length >= 14) score++;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
    if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score++;
    return score;
  });

  protected readonly strengthLabel = computed(() => {
    switch (this.strength()) {
      case 1:
        return 'Faible';
      case 2:
        return 'Moyen';
      case 3:
        return 'Bon';
      default:
        return 'Excellent';
    }
  });

  protected readonly passwordMessage = computed(() => {
    const value = this.passwordValue();
    if (value.length > 0 && value.length < 10) {
      return 'Le mot de passe doit contenir au moins 10 caractères.';
    }
    if (value.length >= 10 && !PASSWORD_POLICY.test(value)) {
      return 'Ajoutez une majuscule, une minuscule et un chiffre.';
    }
    return 'Le mot de passe est requis.';
  });

  protected showError(field: 'firstName' | 'lastName' | 'email' | 'password'): boolean {
    if (!this.submitted) return false;
    const control = this.form.controls[field];
    return control.invalid && control.touched;
  }

  protected submit(): void {
    this.submitted = true;
    this.error.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.pending.set(true);
    this.auth.register(this.form.getRawValue()).subscribe({
      next: () => {
        this.pending.set(false);
        this.toasts.success('Compte créé. Bienvenue !');
        void this.router.navigate(['/app/dashboard']);
      },
      error: (failure: ApiFailure) => {
        this.pending.set(false);
        if (failure.status === 409) {
          this.error.set('Un compte existe déjà avec cette adresse email.');
          return;
        }
        // Les erreurs de validation arrivent dans `details` : on remonte le
        // premier message, plus parlant qu'un « données invalides ».
        const firstDetail = Array.isArray(failure.details)
          ? String(failure.details[0])
          : null;
        this.error.set(firstDetail ?? failure.message);
      },
    });
  }
}
