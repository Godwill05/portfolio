import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * Dialogue modal minimal, natif.
 *
 * S'appuie sur `<dialog>` : la gestion du focus, de la touche Échap et de
 * l'inertisation de l'arrière-plan est déjà assurée par le navigateur, ce
 * qu'une implémentation maison rate presque toujours.
 */
@Component({
  selector: 'app-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="dialog" (close)="closed.emit()" (click)="onBackdrop($event)">
      <div class="panel" [style.max-width]="width()">
        <header class="panel__head">
          <div>
            <h2 class="panel__title">{{ title() }}</h2>
            @if (description()) {
              <p class="panel__desc">{{ description() }}</p>
            }
          </div>
          <button type="button" class="close" (click)="close()" aria-label="Fermer">✕</button>
        </header>

        <div class="panel__body">
          <ng-content />
        </div>
      </div>
    </dialog>
  `,
  styles: [
    `
      .dialog {
        border: 0;
        padding: 0;
        background: transparent;
        max-width: 100vw;
        max-height: 100vh;
        width: 100%;
        height: 100%;
      }

      .dialog::backdrop {
        background: rgba(20, 20, 18, 0.45);
        backdrop-filter: blur(2px);
      }

      .panel {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: min(calc(100vw - 2rem), 34rem);
        max-height: calc(100vh - 4rem);
        display: flex;
        flex-direction: column;
        background: var(--ff-surface);
        border: 1px solid var(--ff-line);
        border-radius: var(--ff-radius-lg);
        box-shadow: var(--ff-shadow-lg);
        animation: dialog-in 160ms cubic-bezier(0.16, 1, 0.3, 1);
      }

      .panel__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        padding: 1.15rem 1.25rem 0.85rem;
        border-bottom: 1px solid var(--ff-line);
      }

      .panel__title {
        font-size: var(--ff-text-lg);
        font-weight: 600;
      }

      .panel__desc {
        font-size: var(--ff-text-xs);
        color: var(--ff-ink-muted);
        margin-top: 0.15rem;
      }

      .close {
        flex: none;
        padding: 0.25rem 0.35rem;
        background: none;
        border: 0;
        border-radius: var(--ff-radius-sm);
        color: var(--ff-ink-faint);
        font-size: 0.8rem;
        line-height: 1;
      }

      .close:hover {
        background: var(--ff-surface-muted);
        color: var(--ff-ink);
      }

      .panel__body {
        padding: 1.25rem;
        overflow-y: auto;
      }

      @keyframes dialog-in {
        from {
          opacity: 0;
          transform: translate(-50%, -48%) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }

      @media (max-width: 640px) {
        .panel {
          top: auto;
          bottom: 0;
          left: 0;
          transform: none;
          width: 100%;
          max-height: 88vh;
          border-radius: var(--ff-radius-lg) var(--ff-radius-lg) 0 0;
        }

        @keyframes dialog-in {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      }
    `,
  ],
})
export class Modal {
  readonly title = input.required<string>();
  readonly description = input<string>();
  readonly width = input('34rem');
  readonly closed = output<void>();

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // `showModal()` doit être appelé après l'insertion dans le DOM.
    effect(() => {
      const el = this.dialogRef().nativeElement;
      if (!el.open) el.showModal();
    });
  }

  close(): void {
    this.dialogRef().nativeElement.close();
  }

  /** Clic sur le fond uniquement — pas sur le contenu du panneau. */
  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialogRef().nativeElement) this.close();
  }
}
