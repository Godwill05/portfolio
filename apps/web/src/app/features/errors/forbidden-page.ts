import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-forbidden-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="wrap">
      <p class="code">403</p>
      <h1 class="title">Accès refusé</h1>
      <p class="text">
        Votre compte ne dispose pas des droits nécessaires pour consulter cette section.
      </p>
      <div class="actions">
        <a class="ff-btn ff-btn--primary" routerLink="/app/dashboard">Tableau de bord</a>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: grid;
        place-items: center;
        min-height: 60vh;
        padding: 2rem 1.5rem;
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
        color: var(--ff-danger);
        letter-spacing: 0.1em;
      }

      .title {
        font-size: var(--ff-text-2xl);
      }

      .text {
        color: var(--ff-ink-muted);
      }

      .actions {
        margin-top: 0.5rem;
      }
    `,
  ],
})
export class ForbiddenPage {}
