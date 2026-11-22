import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-admin-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="head">
      <div>
        <p class="ff-eyebrow">Administration</p>
        <h1 class="title">Console</h1>
      </div>

      <nav class="tabs" aria-label="Sections d’administration">
        <a class="tab" routerLink="/app/admin/analytics" routerLinkActive="tab--active">
          Analytique
        </a>
        <a class="tab" routerLink="/app/admin/users" routerLinkActive="tab--active">
          Utilisateurs
        </a>
        <a class="tab" routerLink="/app/admin/audit" routerLinkActive="tab--active">
          Journal d’audit
        </a>
      </nav>
    </div>

    <router-outlet />
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .head {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
        padding-bottom: 0.85rem;
        margin-bottom: 1.25rem;
        border-bottom: 1px solid var(--ff-line);
      }

      .title {
        font-size: var(--ff-text-xl);
        letter-spacing: -0.02em;
        margin-top: 0.1rem;
      }

      .tabs {
        display: flex;
        gap: 0.15rem;
      }

      .tab {
        padding: 0.4rem 0.7rem;
        border-radius: var(--ff-radius);
        font-size: var(--ff-text-sm);
        font-weight: 500;
        color: var(--ff-ink-muted);
        transition:
          background var(--ff-transition),
          color var(--ff-transition);
      }

      .tab:hover {
        background: var(--ff-surface-muted);
        color: var(--ff-ink);
        text-decoration: none;
      }

      .tab--active {
        background: var(--ff-accent-soft);
        color: var(--ff-accent);
        font-weight: 600;
      }

      @media (max-width: 640px) {
        .tabs {
          width: 100%;
          overflow-x: auto;
        }
      }
    `,
  ],
})
export class AdminLayout {}
