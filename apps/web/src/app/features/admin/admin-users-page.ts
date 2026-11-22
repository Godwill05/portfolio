import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';

import { ApiFailure } from '../../core/api-error';
import { AdminApi } from '../../core/admin.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/ui/toast.service';
import { Modal } from '../../ui/modal';
import {
  ACCOUNT_STATUS_LABELS,
  AI_FEATURE_LABELS,
  ROLE_LABELS,
  formatDateTime,
  formatRelative,
  initials,
} from '../../core/format';
import type { AccountStatus, AdminUserDetail, AdminUserSummary, UserRole } from '../../core/models';

@Component({
  selector: 'app-admin-users-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Modal],
  templateUrl: './admin-users-page.html',
  styleUrl: './admin-users-page.scss',
})
export class AdminUsersPage {
  private readonly api = inject(AdminApi);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly toasts = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly users = signal<AdminUserSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pages = signal(1);
  protected readonly search = signal('');
  protected readonly roleFilter = signal<UserRole | ''>('');
  protected readonly statusFilter = signal<AccountStatus | ''>('');

  protected readonly detail = signal<AdminUserDetail | null>(null);
  protected readonly detailLoading = signal(false);
  protected readonly busy = signal(false);

  protected readonly roleEntries = Object.entries(ROLE_LABELS);
  protected readonly statusEntries = Object.entries(ACCOUNT_STATUS_LABELS);
  protected readonly featureEntries = Object.entries(AI_FEATURE_LABELS);
  protected readonly currentUserId = this.auth.user()?.id;

  protected readonly editForm = this.fb.nonNullable.group({
    role: ['user' as UserRole],
    status: ['active' as AccountStatus],
  });

  protected readonly quotaForm = this.fb.nonNullable.group({
    feature: ['chat'],
    delta: [5],
    note: [''],
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api
      .users({
        page: this.page(),
        limit: 20,
        search: this.search() || undefined,
        role: this.roleFilter() || undefined,
        status: this.statusFilter() || undefined,
      })
      .subscribe({
        next: (result) => {
          this.users.set(result.items);
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

  /* ── Fiche utilisateur ── */

  protected open(user: AdminUserSummary): void {
    this.detailLoading.set(true);
    this.detail.set(null);

    this.api.user(user.id).subscribe({
      next: (data) => {
        this.detail.set(data);
        this.editForm.patchValue({ role: data.role, status: data.status });
        this.quotaForm.reset({ feature: 'chat', delta: 5, note: '' });
        this.detailLoading.set(false);
      },
      error: (failure: ApiFailure) => {
        this.detailLoading.set(false);
        this.toasts.error(failure.message);
      },
    });
  }

  protected closeDetail = () => this.detail.set(null);

  /* ── Modification ── */

  protected saveUser(): void {
    const user = this.detail();
    if (!user) return;

    const { role, status } = this.editForm.getRawValue();
    if (role === user.role && status === user.status) {
      this.toasts.info('Aucune modification à enregistrer.');
      return;
    }

    this.busy.set(true);
    this.api.updateUser(user.id, { role, status }).subscribe({
      next: () => {
        this.busy.set(false);
        this.toasts.success('Utilisateur mis à jour.');
        this.load();
        this.open({ ...user, role, status });
      },
      error: (failure: ApiFailure) => {
        this.busy.set(false);
        // Les garde-fous métier (auto-modification, dernier super-admin)
        // renvoient un 422 explicite : on l'affiche tel quel.
        this.toasts.error(failure.message);
      },
    });
  }

  /* ── Ajustement de quota ── */

  protected adjustQuota(): void {
    const user = this.detail();
    if (!user) return;

    const { feature, delta, note } = this.quotaForm.getRawValue();
    if (!note || note.trim().length < 3) {
      this.toasts.error('Une note d’au moins 3 caractères est requise pour la traçabilité.');
      return;
    }

    this.busy.set(true);
    this.api
      .adjustQuota(user.id, {
        feature: feature as never,
        delta: Number(delta),
        note: note.trim(),
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.toasts.success('Crédits ajustés.');
          this.open({ ...user });
        },
        error: (failure: ApiFailure) => {
          this.busy.set(false);
          this.toasts.error(failure.message);
        },
      });
  }

  /* ── Sessions ── */

  protected revokeSessions(): void {
    const user = this.detail();
    if (!user) return;
    if (!confirm(`Fermer toutes les sessions de ${user.email} ?`)) return;

    this.busy.set(true);
    this.api.revokeSessions(user.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.toasts.success('Sessions révoquées.');
        this.open({ ...user });
      },
      error: (failure: ApiFailure) => {
        this.busy.set(false);
        this.toasts.error(failure.message);
      },
    });
  }

  /* ── Suppression ── */

  protected deleteUser(): void {
    const user = this.detail();
    if (!user) return;
    if (!confirm(`Supprimer définitivement ${user.email} ?`)) return;

    this.busy.set(true);
    this.api.deleteUser(user.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.detail.set(null);
        this.toasts.success('Utilisateur supprimé.');
        this.load();
      },
      error: (failure: ApiFailure) => {
        this.busy.set(false);
        this.toasts.error(failure.message);
      },
    });
  }

  /* ── Aides ── */

  protected initialsOf(user: AdminUserSummary): string {
    return initials(user.firstName, user.lastName);
  }

  protected roleLabel(role: string): string {
    return ROLE_LABELS[role] ?? role;
  }

  protected statusLabel(status: string): string {
    return ACCOUNT_STATUS_LABELS[status] ?? status;
  }

  protected featureLabel(feature: string): string {
    return AI_FEATURE_LABELS[feature] ?? feature;
  }

  protected relative(value: string | null): string {
    return value ? formatRelative(value) : 'jamais';
  }

  protected when(value: string): string {
    return formatDateTime(value);
  }

  protected isSelf(user: AdminUserSummary): boolean {
    return user.id === this.currentUserId;
  }
}
