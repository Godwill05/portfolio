import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { toApiFailure } from '../../core/api-error';
import { ToastService } from '../../core/ui/toast.service';

const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

@Component({
  selector: 'app-reset-password-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="head">
      <h1 class="head__title">Nouveau mot de passe</h1>
      <p class="head__sub">Choisissez un mot de passe solide et unique.</p>
    </div>

    @if (!hasToken()) {
      <div class="alert" role="alert">
        Ce lien est incomplet ou invalide. Demandez un nouveau lien de réinitialisation.
      </div>
      <a class="ff-btn ff-btn--secondary" routerLink="/auth/forgot-password">
        Demander un nouveau lien
      </a>
    } @else {
      @if (error(); as message) {
        <div class="alert" role="alert">{{ message }}</div>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="ff-field">
          <label class="ff-label ff-label--required" for="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            class="ff-input"
            [class.ff-input--invalid]="showError()"
            formControlName="password"
            autocomplete="new-password"
          />
          <p class="ff-hint">
            10 caractères minimum, avec une majuscule, une minuscule et un chiffre.
          </p>
          @if (showError()) {
            <p class="ff-error">Le mot de passe ne respecte pas les règles ci-dessus.</p>
          }
        </div>

        <div class="ff-field">
          <label class="ff-label ff-label--required" for="confirm">Confirmer le mot de passe</label>
          <input
            id="confirm"
            type="password"
            class="ff-input"
            [class.ff-input--invalid]="mismatch()"
            formControlName="confirm"
            autocomplete="new-password"
          />
          @if (mismatch()) {
            <p class="ff-error">Les deux mots de passe ne correspondent pas.</p>
          }
        </div>

        <button type="submit" class="ff-btn ff-btn--primary ff-btn--lg submit" [disabled]="pending()">
          {{ pending() ? 'Enregistrement…' : 'Enregistrer le mot de passe' }}
        </button>
      </form>
    }
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
        gap: 1.1rem;
      }

      .submit {
        width: 100%;
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
    `,
  ],
})
export class ResetPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  private readonly token = new URLSearchParams(window.location.search).get('token') ?? '';
  protected readonly hasToken = signal(this.token.length > 0);
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    password: [
      '',
      [
        Validators.required,
        Validators.minLength(10),
        Validators.maxLength(128),
        Validators.pattern(PASSWORD_POLICY),
      ],
    ],
    confirm: ['', [Validators.required]],
  });

  protected showError(): boolean {
    const control = this.form.controls.password;
    return control.invalid && control.touched;
  }

  protected mismatch(): boolean {
    const { password, confirm } = this.form.getRawValue();
    return confirm.length > 0 && password !== confirm;
  }

  protected submit(): void {
    this.error.set(null);

    if (this.form.invalid || this.mismatch()) {
      this.form.markAllAsTouched();
      return;
    }

    this.pending.set(true);
    this.http
      .post('/api/auth/reset-password', {
        token: this.token,
        password: this.form.getRawValue().password,
      })
      .subscribe({
        next: () => {
          this.pending.set(false);
          this.toasts.success('Mot de passe mis à jour. Connectez-vous.');
          void this.router.navigate(['/auth/login']);
        },
        error: (err) => {
          const failure = toApiFailure(err);
          this.pending.set(false);
          this.error.set(
            failure.status === 400 || failure.status === 422
              ? 'Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.'
              : failure.message,
          );
        },
      });
  }
}
