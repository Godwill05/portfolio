import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { ApiFailure } from '../../core/api-error';
import { AdminApi } from '../../core/admin.service';
import { ToastService } from '../../core/ui/toast.service';
import { formatDateTime } from '../../core/format';
import type { AuditEntry } from '../../core/models';

@Component({
  selector: 'app-admin-audit-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-audit-page.html',
  styleUrl: './admin-audit-page.scss',
})
export class AdminAuditPage {
  private readonly api = inject(AdminApi);
  private readonly toasts = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly entries = signal<AuditEntry[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pages = signal(1);
  protected readonly search = signal('');
  protected readonly action = signal('');
  protected readonly expanded = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api
      .audit({
        page: this.page(),
        limit: 30,
        search: this.search() || undefined,
        action: this.action() || undefined,
      })
      .subscribe({
        next: (result) => {
          this.entries.set(result.items);
          this.total.set(result.meta.total);
          this.pages.set(result.meta.pages);
          this.loading.set(false);
        },
        error: (failure: ApiFailure) => {
          this.loading.set(false);
          this.toasts.error(failure.message);
        },
      });
  }

  protected applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  protected goToPage(next: number): void {
    if (next < 1 || next > this.pages()) return;
    this.page.set(next);
    this.load();
  }

  protected toggle(id: string): void {
    this.expanded.update((current) => (current === id ? null : id));
  }

  protected when(value: string): string {
    return formatDateTime(value);
  }

  /** Résumé lisible des champs modifiés, sans dérouler tout le JSON. */
  protected changesSummary(entry: AuditEntry): string {
    if (!entry.changes) return '';
    const keys = Object.keys(entry.changes);
    if (keys.length === 0) return '';
    return keys.slice(0, 3).join(', ') + (keys.length > 3 ? ` +${keys.length - 3}` : '');
  }

  protected prettyChanges(entry: AuditEntry): string {
    return JSON.stringify(entry.changes, null, 2);
  }

  /** Icône et tonalité par famille d'action. */
  protected tone(action: string): string {
    if (action.startsWith('user.quota')) return 'warn';
    if (action.startsWith('user.delete') || action.startsWith('auth.failed')) return 'danger';
    if (action.startsWith('auth')) return 'info';
    if (action.startsWith('ai.')) return 'accent';
    return 'neutral';
  }
}
