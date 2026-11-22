import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ToastHost } from './ui/toast-host';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHost],
  template: `
    <a class="skip-link" href="#main">Aller au contenu principal</a>
    <router-outlet />
    <app-toast-host />
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
      }

      .skip-link {
        position: absolute;
        top: -100px;
        left: 1rem;
        z-index: 999;
        padding: 0.6rem 1rem;
        background: var(--ff-accent);
        color: #fff;
        border-radius: var(--ff-radius);
        font-size: var(--ff-text-sm);
        font-weight: 550;
        transition: top 120ms ease;
      }

      .skip-link:focus {
        top: 1rem;
        text-decoration: none;
      }
    `,
  ],
})
export class App {
  protected readonly title = signal('FolioForge');

  // Instancié tôt pour appliquer le thème avant la première peinture
  // significative et éviter un flash de thème clair.
  private readonly theme = inject(ThemeService);
}
