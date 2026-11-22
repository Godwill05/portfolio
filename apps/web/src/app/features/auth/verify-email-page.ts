import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { toApiFailure } from '../../core/api-error';

type State = 'verifying' | 'success' | 'failure';

@Component({
  selector: 'app-verify-email-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @switch (state()) {
      @case ('verifying') {
        <div class="panel">
          <span class="ff-skeleton icon" aria-hidden="true"></span>
          <h1 class="title">Vérification en cours…</h1>
          <p class="text">Nous confirmons votre adresse email.</p>
        </div>
      }

      @case ('success') {
        <div class="panel">
          <span class="icon icon--ok" aria-hidden="true">✓</span>
          <h1 class="title">Adresse confirmée</h1>
          <p class="text">
            Votre email est désormais vérifié. Vous avez accès à l’ensemble des fonctionnalités.
          </p>
          <a class="ff-btn ff-btn--primary" routerLink="/app/dashboard">Accéder à mon espace</a>
        </div>
      }

      @default {
        <div class="panel">
          <span class="icon icon--ko" aria-hidden="true">!</span>
          <h1 class="title">Vérification impossible</h1>
          <p class="text">{{ message() }}</p>
          @if (authenticated()) {
            <button type="button" class="ff-btn ff-btn--secondary" [disabled]="resending()"
                    (click)="resend()">
              {{ resending() ? 'Envoi…' : 'Renvoyer l’email de vérification' }}
            </button>
          }
          <a class="ff-link" routerLink="/auth/login">Retour à la connexion</a>
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .panel {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.85rem;
      }

      .icon {
        display: grid;
        place-items: center;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: var(--ff-radius-full);
        font-weight: 700;
        font-size: 1.05rem;
        background: var(--ff-surface-muted);
      }

      .icon--ok {
        background: var(--ff-success-soft);
        color: var(--ff-success);
      }

      .icon--ko {
        background: var(--ff-danger-soft);
        color: var(--ff-danger);
      }

      .title {
        font-size: var(--ff-text-xl);
      }

      .text {
        color: var(--ff-ink-soft);
        font-size: var(--ff-text-sm);
        line-height: 1.65;
      }

      .ff-link {
        font-size: var(--ff-text-sm);
      }
    `,
  ],
})
export class VerifyEmailPage {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  protected readonly state = signal<State>('verifying');
  protected readonly message = signal('Ce lien est invalide ou a expiré.');
  protected readonly resending = signal(false);
  protected readonly authenticated = this.auth.isAuthenticated;

  private readonly token = new URLSearchParams(window.location.search).get('token') ?? '';

  constructor() {
    this.verify();
  }

  private verify(): void {
    if (!this.token) {
      this.state.set('failure');
      return;
    }

    this.http.post('/api/auth/verify-email', { token: this.token }).subscribe({
      next: () => {
        this.state.set('success');
        // Rafraîchit l'utilisateur en mémoire : `emailVerified` vient de
        // changer côté serveur.
        this.auth.bootstrap().subscribe();
      },
      error: (err) => {
        this.message.set(toApiFailure(err).message);
        this.state.set('failure');
      },
    });
  }

  protected resend(): void {
    this.resending.set(true);
    this.http.post('/api/auth/verify-email/resend', {}).subscribe({
      next: () => {
        this.resending.set(false);
        this.message.set('Un nouvel email de vérification vient d’être envoyé.');
      },
      error: (err) => {
        this.resending.set(false);
        this.message.set(toApiFailure(err).message);
      },
    });
  }
}
