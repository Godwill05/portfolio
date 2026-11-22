import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { toApiFailure } from '../../core/api-error';

@Component({
  selector: 'app-forgot-password-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    @if (sent()) {
      <div class="done">
        <span class="done__icon" aria-hidden="true">✉</span>
        <h1 class="done__title">Email envoyé</h1>
        <p class="done__text">
          Si un compte existe pour <strong>{{ email() }}</strong>, vous recevrez un lien de
          réinitialisation dans quelques instants. Pensez à vérifier vos courriers indésirables.
        </p>
        <a class="ff-btn ff-btn--secondary" routerLink="/auth/login">Retour à la connexion</a>
      </div>
    } @else {
      <div class="head">
        <h1 class="head__title">Mot de passe oublié</h1>
        <p class="head__sub">Nous vous enverrons un lien pour en choisir un nouveau.</p>
      </div>

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="ff-field">
          <label class="ff-label ff-label--required" for="email">Adresse email</label>
          <input
            id="email"
            type="email"
            class="ff-input"
            [class.ff-input--invalid]="invalid()"
            formControlName="email"
            autocomplete="email"
            inputmode="email"
            placeholder="vous@exemple.com"
          />
          @if (invalid()) {
            <p class="ff-error">Saisissez une adresse email valide.</p>
          }
        </div>

        <button type="submit" class="ff-btn ff-btn--primary ff-btn--lg submit" [disabled]="pending()">
          {{ pending() ? 'Envoi…' : 'Envoyer le lien' }}
        </button>
      </form>

      <p class="foot"><a routerLink="/auth/login">Retour à la connexion</a></p>
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

      .foot {
        margin-top: 1.35rem;
        text-align: center;
        font-size: var(--ff-text-sm);
      }

      .done {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.85rem;
      }

      .done__icon {
        display: grid;
        place-items: center;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: var(--ff-radius-full);
        background: var(--ff-accent-soft);
        color: var(--ff-accent);
        font-size: 1.1rem;
      }

      .done__title {
        font-size: var(--ff-text-xl);
      }

      .done__text {
        color: var(--ff-ink-soft);
        line-height: 1.65;
        font-size: var(--ff-text-sm);
      }
    `,
  ],
})
export class ForgotPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);

  protected readonly pending = signal(false);
  protected readonly sent = signal(false);
  protected readonly email = signal('');

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected invalid(): boolean {
    const control = this.form.controls.email;
    return control.invalid && control.touched;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email } = this.form.getRawValue();
    this.email.set(email);
    this.pending.set(true);

    // L'API répond 200 dans tous les cas : elle ne révèle pas si l'email
    // existe. On affiche donc toujours la même confirmation.
    this.http.post('/api/auth/forgot-password', { email }).subscribe({
      next: () => {
        this.pending.set(false);
        this.sent.set(true);
      },
      error: (error) => {
        this.pending.set(false);
        // Même en cas d'erreur serveur, ne pas laisser l'utilisateur bloqué.
        void toApiFailure(error);
        this.sent.set(true);
      },
    });
  }
}
