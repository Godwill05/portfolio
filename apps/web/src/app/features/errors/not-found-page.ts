import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="wrap">
      <p class="code">404</p>
      <h1 class="title">Cette page n’existe pas</h1>
      <p class="text">
        Le lien est peut-être obsolète, ou l’adresse mal orthographiée.
      </p>
      <div class="actions">
        <a class="ff-btn ff-btn--primary" routerLink="/app/dashboard">Tableau de bord</a>
        <a class="ff-btn ff-btn--secondary" routerLink="/">Accueil</a>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: grid;
        place-items: center;
        min-height: 100vh;
        padding: 2rem 1.5rem;
        background: var(--ff-bg);
      }

      .wrap {
        max-width: 30rem;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.85rem;
      }

      .code {
        font-family: var(--ff-font-mono);
        font-size: var(--ff-text-sm);
        color: var(--ff-ink-faint);
        letter-spacing: 0.1em;
      }

      .title {
        font-size: var(--ff-text-2xl);
      }

      .text {
        color: var(--ff-ink-muted);
        font-size: var(--ff-text-base);
      }

      .actions {
        display: flex;
        gap: 0.6rem;
        margin-top: 0.5rem;
      }
    `,
  ],
})
export class NotFoundPage {}
