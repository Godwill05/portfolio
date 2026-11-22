import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ToastService } from '../core/ui/toast.service';

@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="host" role="status" aria-live="polite" aria-atomic="false">
      @for (toast of toasts.toasts(); track toast.id) {
        <div class="toast" [class]="'toast toast--' + toast.kind">
          <span class="toast__icon" aria-hidden="true">
            @switch (toast.kind) {
              @case ('success') { ✓ }
              @case ('error') { ! }
              @case ('warning') { ! }
              @default { i }
            }
          </span>
          <p class="toast__message">{{ toast.message }}</p>
          <button
            type="button"
            class="toast__close"
            (click)="toasts.dismiss(toast.id)"
            aria-label="Fermer la notification"
          >
            ✕
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .host {
        position: fixed;
        bottom: 1.25rem;
        right: 1.25rem;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        max-width: min(24rem, calc(100vw - 2.5rem));
        pointer-events: none;
      }

      .toast {
        display: flex;
        align-items: flex-start;
        gap: 0.6rem;
        padding: 0.7rem 0.8rem;
        background: var(--ff-surface);
        border: 1px solid var(--ff-line);
        border-left: 3px solid var(--ff-ink-faint);
        border-radius: var(--ff-radius);
        box-shadow: var(--ff-shadow);
        pointer-events: auto;
        animation: slide-in 160ms cubic-bezier(0.16, 1, 0.3, 1);
      }

      .toast--success {
        border-left-color: var(--ff-success);
      }
      .toast--error {
        border-left-color: var(--ff-danger);
      }
      .toast--warning {
        border-left-color: var(--ff-warning);
      }
      .toast--info {
        border-left-color: var(--ff-info);
      }

      .toast__icon {
        display: grid;
        place-items: center;
        flex: none;
        width: 1.25rem;
        height: 1.25rem;
        border-radius: var(--ff-radius-full);
        background: var(--ff-surface-muted);
        font-size: 0.7rem;
        font-weight: 700;
        margin-top: 0.1rem;
      }

      .toast--success .toast__icon {
        background: var(--ff-success-soft);
        color: var(--ff-success);
      }
      .toast--error .toast__icon {
        background: var(--ff-danger-soft);
        color: var(--ff-danger);
      }
      .toast--warning .toast__icon {
        background: var(--ff-warning-soft);
        color: var(--ff-warning);
      }
      .toast--info .toast__icon {
        background: var(--ff-info-soft);
        color: var(--ff-info);
      }

      .toast__message {
        flex: 1;
        font-size: var(--ff-text-sm);
        line-height: 1.5;
        color: var(--ff-ink);
        overflow-wrap: anywhere;
      }

      .toast__close {
        flex: none;
        padding: 0.1rem 0.25rem;
        background: none;
        border: 0;
        color: var(--ff-ink-faint);
        font-size: 0.75rem;
        line-height: 1;
        border-radius: var(--ff-radius-sm);
      }

      .toast__close:hover {
        color: var(--ff-ink);
        background: var(--ff-surface-muted);
      }

      @keyframes slide-in {
        from {
          opacity: 0;
          transform: translateY(6px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @media (max-width: 480px) {
        .host {
          left: 1rem;
          right: 1rem;
          bottom: 1rem;
          max-width: none;
        }
      }
    `,
  ],
})
export class ToastHost {
  protected readonly toasts = inject(ToastService);
}
