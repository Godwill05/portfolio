import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../core/auth.service';
import { ThemeService } from '../core/theme.service';
import { initials } from '../core/format';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  exact?: boolean;
}

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell">
      <!-- Voile mobile -->
      @if (menuOpen()) {
        <div class="scrim" (click)="menuOpen.set(false)" aria-hidden="true"></div>
      }

      <aside class="sidebar" [class.sidebar--open]="menuOpen()">
        <a class="brand" routerLink="/app/dashboard" (click)="menuOpen.set(false)">
          <span class="brand__mark" aria-hidden="true">F</span>
          <span class="brand__name">FolioForge</span>
        </a>

        <nav class="nav" aria-label="Navigation principale">
          @for (item of nav; track item.path) {
            <a
              class="nav__link"
              [routerLink]="item.path"
              routerLinkActive="nav__link--active"
              [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
              (click)="menuOpen.set(false)"
            >
              <span class="nav__icon" aria-hidden="true">{{ item.icon }}</span>
              {{ item.label }}
            </a>
          }
        </nav>

        @if (auth.isAdmin()) {
          <div class="nav-group">
            <p class="nav-group__label">Administration</p>
            <a
              class="nav__link"
              routerLink="/app/admin/analytics"
              routerLinkActive="nav__link--active"
              (click)="menuOpen.set(false)"
            >
              <span class="nav__icon" aria-hidden="true">◱</span>
              Console admin
            </a>
          </div>
        }

        <div class="sidebar__foot">
          <a
            class="nav__link"
            routerLink="/app/settings"
            routerLinkActive="nav__link--active"
            (click)="menuOpen.set(false)"
          >
            <span class="nav__icon" aria-hidden="true">⚙</span>
            Paramètres
          </a>
        </div>
      </aside>

      <div class="content">
        <header class="topbar">
          <button
            type="button"
            class="icon-btn menu-btn"
            (click)="menuOpen.set(!menuOpen())"
            [attr.aria-expanded]="menuOpen()"
            aria-label="Ouvrir le menu"
          >
            ☰
          </button>

          <div class="topbar__spacer"></div>

          <button
            type="button"
            class="icon-btn"
            (click)="theme.toggle()"
            [attr.aria-label]="
              theme.resolved() === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'
            "
          >
            {{ theme.resolved() === 'dark' ? '☀' : '☾' }}
          </button>

          <div class="account" (click)="accountOpen.set(!accountOpen())">
            <button
              type="button"
              class="account__btn"
              [attr.aria-expanded]="accountOpen()"
              aria-haspopup="menu"
            >
              <span class="avatar" aria-hidden="true">{{ userInitials() }}</span>
              <span class="account__name">{{ auth.user()?.firstName }}</span>
              <span class="account__caret" aria-hidden="true">⌄</span>
            </button>

            @if (accountOpen()) {
              <div class="menu" role="menu">
                <div class="menu__head">
                  <p class="menu__name">
                    {{ auth.user()?.firstName }} {{ auth.user()?.lastName }}
                  </p>
                  <p class="menu__email">{{ auth.user()?.email }}</p>
                </div>
                <a class="menu__item" role="menuitem" routerLink="/app/settings"
                   (click)="accountOpen.set(false)">
                  Mon compte
                </a>
                <a class="menu__item" role="menuitem" routerLink="/app/profile/preview"
                   (click)="accountOpen.set(false)">
                  Voir mon portfolio
                </a>
                <button type="button" class="menu__item menu__item--danger" role="menuitem"
                        (click)="logout()">
                  Se déconnecter
                </button>
              </div>
            }
          </div>
        </header>

        <main class="main" id="main">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: [
    `
      .shell {
        display: flex;
        min-height: 100vh;
        background: var(--ff-bg);
      }

      /* ── Sidebar ── */
      .sidebar {
        position: fixed;
        inset: 0 auto 0 0;
        z-index: 40;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        width: var(--ff-sidebar-w);
        padding: 1.15rem 0.85rem;
        background: var(--ff-surface);
        border-right: 1px solid var(--ff-line);
        overflow-y: auto;
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        padding: 0.25rem 0.5rem;
        color: var(--ff-ink);
      }

      .brand:hover {
        text-decoration: none;
      }

      .brand__mark {
        display: grid;
        place-items: center;
        width: 1.65rem;
        height: 1.65rem;
        border-radius: var(--ff-radius-sm);
        background: var(--ff-accent);
        color: #fff;
        font-family: var(--ff-font-display);
        font-size: 0.9rem;
        font-weight: 600;
      }

      .brand__name {
        font-family: var(--ff-font-display);
        font-size: 1rem;
        font-weight: 600;
        letter-spacing: -0.01em;
      }

      .nav {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }

      .nav__link {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        padding: 0.45rem 0.55rem;
        border-radius: var(--ff-radius);
        color: var(--ff-ink-soft);
        font-size: var(--ff-text-sm);
        font-weight: 500;
        transition:
          background var(--ff-transition),
          color var(--ff-transition);
      }

      .nav__link:hover {
        background: var(--ff-surface-muted);
        color: var(--ff-ink);
        text-decoration: none;
      }

      .nav__link--active {
        background: var(--ff-accent-soft);
        color: var(--ff-accent);
        font-weight: 600;
      }

      .nav__link--active:hover {
        background: var(--ff-accent-soft);
        color: var(--ff-accent);
      }

      .nav__icon {
        display: grid;
        place-items: center;
        width: 1.15rem;
        flex: none;
        font-size: 0.85rem;
        opacity: 0.8;
      }

      .nav-group {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        padding-top: 1rem;
        border-top: 1px solid var(--ff-line);
      }

      .nav-group__label {
        padding: 0 0.55rem 0.4rem;
        font-size: var(--ff-text-xs);
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--ff-ink-faint);
      }

      .sidebar__foot {
        margin-top: auto;
        padding-top: 1rem;
        border-top: 1px solid var(--ff-line);
      }

      /* ── Zone de contenu ── */
      .content {
        flex: 1;
        min-width: 0;
        margin-left: var(--ff-sidebar-w);
        display: flex;
        flex-direction: column;
      }

      .topbar {
        position: sticky;
        top: 0;
        z-index: 30;
        display: flex;
        align-items: center;
        gap: 0.35rem;
        height: var(--ff-topbar-h);
        padding: 0 1.5rem;
        background: color-mix(in srgb, var(--ff-bg) 88%, transparent);
        backdrop-filter: blur(8px);
        border-bottom: 1px solid var(--ff-line);
      }

      .topbar__spacer {
        flex: 1;
      }

      .icon-btn {
        display: grid;
        place-items: center;
        width: 2rem;
        height: 2rem;
        background: none;
        border: 0;
        border-radius: var(--ff-radius);
        color: var(--ff-ink-muted);
        font-size: 0.95rem;
      }

      .icon-btn:hover {
        background: var(--ff-surface-muted);
        color: var(--ff-ink);
      }

      .menu-btn {
        display: none;
      }

      /* ── Compte ── */
      .account {
        position: relative;
      }

      .account__btn {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        padding: 0.25rem 0.45rem 0.25rem 0.25rem;
        background: none;
        border: 0;
        border-radius: var(--ff-radius-full);
      }

      .account__btn:hover {
        background: var(--ff-surface-muted);
      }

      .avatar {
        display: grid;
        place-items: center;
        width: 1.75rem;
        height: 1.75rem;
        border-radius: var(--ff-radius-full);
        background: var(--ff-accent-soft);
        color: var(--ff-accent);
        font-size: var(--ff-text-xs);
        font-weight: 650;
        letter-spacing: 0.02em;
      }

      .account__name {
        font-size: var(--ff-text-sm);
        font-weight: 550;
        color: var(--ff-ink-soft);
      }

      .account__caret {
        font-size: 0.7rem;
        color: var(--ff-ink-faint);
      }

      .menu {
        position: absolute;
        top: calc(100% + 0.4rem);
        right: 0;
        min-width: 13rem;
        padding: 0.3rem;
        background: var(--ff-surface);
        border: 1px solid var(--ff-line);
        border-radius: var(--ff-radius);
        box-shadow: var(--ff-shadow);
        display: flex;
        flex-direction: column;
        animation: menu-in 120ms ease-out;
      }

      .menu__head {
        padding: 0.45rem 0.55rem 0.55rem;
        border-bottom: 1px solid var(--ff-line);
        margin-bottom: 0.25rem;
      }

      .menu__name {
        font-size: var(--ff-text-sm);
        font-weight: 600;
        color: var(--ff-ink);
      }

      .menu__email {
        font-size: var(--ff-text-xs);
        color: var(--ff-ink-muted);
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .menu__item {
        display: block;
        width: 100%;
        padding: 0.45rem 0.55rem;
        background: none;
        border: 0;
        border-radius: var(--ff-radius-sm);
        text-align: left;
        font-size: var(--ff-text-sm);
        color: var(--ff-ink-soft);
      }

      .menu__item:hover {
        background: var(--ff-surface-muted);
        color: var(--ff-ink);
        text-decoration: none;
      }

      .menu__item--danger {
        color: var(--ff-danger);
      }

      .menu__item--danger:hover {
        background: var(--ff-danger-soft);
        color: var(--ff-danger);
      }

      /* ── Contenu principal ── */
      .main {
        flex: 1;
        width: 100%;
        max-width: var(--ff-content-max);
        margin: 0 auto;
        padding: 2rem 1.5rem 3.5rem;
      }

      .scrim {
        position: fixed;
        inset: 0;
        z-index: 35;
        background: rgba(20, 20, 18, 0.4);
      }

      @keyframes menu-in {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* ── Responsive ── */
      @media (max-width: 1024px) {
        .sidebar {
          transform: translateX(-100%);
          transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: var(--ff-shadow-lg);
          width: 17rem;
        }

        .sidebar--open {
          transform: translateX(0);
        }

        .content {
          margin-left: 0;
        }

        .menu-btn {
          display: grid;
        }
      }

      @media (max-width: 640px) {
        .topbar {
          padding: 0 1rem;
        }

        .main {
          padding: 1.25rem 1rem 3rem;
        }

        .account__name {
          display: none;
        }
      }
    `,
  ],
})
export class AppShell {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);

  protected readonly menuOpen = signal(false);
  protected readonly accountOpen = signal(false);

  protected readonly nav: NavItem[] = [
    { path: '/app/dashboard', label: 'Tableau de bord', icon: '◧', exact: true },
    { path: '/app/profile', label: 'Profil', icon: '◔' },
    { path: '/app/cvs', label: 'Mes CV', icon: '▤' },
    { path: '/app/ai', label: 'Assistant IA', icon: '✦' },
    { path: '/app/opportunities', label: 'Offres', icon: '◈' },
  ];

  protected userInitials(): string {
    const user = this.auth.user();
    return initials(user?.firstName, user?.lastName);
  }

  protected logout(): void {
    this.accountOpen.set(false);
    this.auth.logout();
  }
}
