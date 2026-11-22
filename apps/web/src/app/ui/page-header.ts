import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** En-tête de page homogène : titre, sous-titre, zone d'actions projetée. */
@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="header">
      <div class="header__text">
        @if (eyebrow()) {
          <p class="ff-eyebrow">{{ eyebrow() }}</p>
        }
        <h1 class="header__title">{{ title() }}</h1>
        @if (subtitle()) {
          <p class="header__subtitle">{{ subtitle() }}</p>
        }
      </div>
      <div class="header__actions">
        <ng-content />
      </div>
    </header>
  `,
  styles: [
    `
      .header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
        margin-bottom: 1.75rem;
      }

      .header__text {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        min-width: 0;
      }

      .header__title {
        font-size: var(--ff-text-xl);
        letter-spacing: -0.02em;
      }

      .header__subtitle {
        font-size: var(--ff-text-sm);
        color: var(--ff-ink-muted);
        max-width: 60ch;
        line-height: 1.6;
      }

      .header__actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
    `,
  ],
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  readonly eyebrow = input<string>();
}
