import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { ApiFailure } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/ui/toast.service';

@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="head">
      <h1 class="head__title">Connexion</h1>
      <p class="head__sub">Accédez à votre espace FolioForge.</p>
    </div>

    @if (error(); as message) {
      <div class="alert" role="alert">{{ message }}</div>
    }

    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
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
          [attr.aria-invalid]="showError('email')"
          [attr.aria-describedby]="showError('email') ? 'email-err' : null"
        />
        @if (showError('email')) {
          <p class="ff-error" id="email-err">Saisissez une adresse email valide.</p>
        }
      </div>

      <div class="ff-field">
        <div class="label-row">
          <label class="ff-label ff-label--required" for="password">Mot de passe</label>
          <a class="ff-hint" routerLink="/auth/forgot-password">Oublié ?</a>
        </div>
        <div class="input-group">
          <input
            id="password"
            [type]="showPassword() ? 'text' : 'password'"
            class="ff-input"
            [class.ff-input--invalid]="showError('password')"
            formControlName="password"
            autocomplete="current-password"
            [attr.aria-invalid]="showError('password')"
          />
          <button
            type="button"
            class="reveal"
            (click)="showPassword.set(!showPassword())"
            [attr.aria-label]="showPassword() ? 'Masquer le mot de passe' : 'Afficher le mot de passe'"
          >
            {{ showPassword() ? 'Masquer' : 'Afficher' }}
          </button>
        </div>
        @if (showError('password')) {
          <p class="ff-error">Le mot de passe est requis.</p>
        }
      </div>

      <button type="submit" class="ff-btn ff-btn--primary ff-btn--lg submit" [disabled]="pending()">
        @if (pending()) {
          <span class="spinner" aria-hidden="true"></span>
          Connexion…
        } @else {
          Se connecter
        }
      </button>
    </form>

    <p class="foot">
      Pas encore de compte ?
      <a routerLink="/auth/register">Créer un compte</a>
    </p>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .head {
        margin-bottom: 1.75rem;
      }

      .head__title {
        font-size: var(--ff-text-2xl);
        margin-bottom: 0.35rem;
      }

      .head__sub {
        color: var(--ff-ink-muted);
        font-size: var(--ff-text-base);
      }

      form {
        display: flex;
        flex-direction: column;
        gap: 1.1rem;
      }

      .label-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
      }

      .input-group {
        position: relative;
      }

      .input-group .ff-input {
        padding-right: 4.75rem;
      }

      .reveal {
        position: absolute;
        top: 50%;
        right: 0.35rem;
        transform: translateY(-50%);
        padding: 0.25rem 0.5rem;
        background: none;
        border: 0;
        border-radius: var(--ff-radius-sm);
        font-size: var(--ff-text-xs);
        font-weight: 550;
        color: var(--ff-ink-muted);
      }

      .reveal:hover {
        color: var(--ff-ink);
        background: var(--ff-surface-muted);
      }

      .submit {
        width: 100%;
        margin-top: 0.35rem;
      }

      .foot {
        margin-top: 1.5rem;
        text-align: center;
        font-size: var(--ff-text-sm);
        color: var(--ff-ink-muted);
      }

      .alert {
        padding: 0.65rem 0.8rem;
        margin-bottom: 1.1rem;
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
    `,
  ],
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly pending = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly error = signal<string | null>(null);
  private submitted = false;

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected showError(field: 'email' | 'password'): boolean {
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
    const { email, password } = this.form.getRawValue();

    this.auth.login({ email, password }).subscribe({
      next: () => {
        this.pending.set(false);
        this.toasts.success('Connexion réussie.');

        // Retour à la page demandée avant la redirection vers le login.
        const next = new URLSearchParams(window.location.search).get('next');
        void this.router.navigateByUrl(next && next.startsWith('/') ? next : '/app/dashboard');
      },
      error: (failure: ApiFailure) => {
        this.pending.set(false);
        // Message générique volontaire : ne pas révéler si l'email existe.
        this.error.set(
          failure.status === 401
            ? 'Email ou mot de passe incorrect.'
            : failure.message,
        );
      },
    });
  }
}
