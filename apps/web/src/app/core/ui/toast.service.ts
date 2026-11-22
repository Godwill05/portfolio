import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const MAX_VISIBLE = 4;

/** Notifications transitoires. Volontairement minimal : pas de file persistante. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  success(message: string): void {
    this.push('success', message);
  }

  error(message: string): void {
    this.push('error', message);
  }

  info(message: string): void {
    this.push('info', message);
  }

  warning(message: string): void {
    this.push('warning', message);
  }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(kind: ToastKind, message: string): void {
    const id = ++this.seq;
    this._toasts.update((list) => [...list, { id, kind, message }].slice(-MAX_VISIBLE));

    // Les erreurs restent un peu plus longtemps : elles demandent lecture.
    const ttl = kind === 'error' ? 6000 : 3500;
    setTimeout(() => this.dismiss(id), ttl);
  }
}
