import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ApiFailure, toApiFailure } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { ThemeService, type ThemeMode } from '../../core/theme.service';
import { ToastService } from '../../core/ui/toast.service';
import { PageHeader } from '../../ui/page-header';
import { formatDateTime } from '../../core/format';
import type { SessionInfo } from '../../core/models';

@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, PageHeader],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);

  protected readonly user = this.auth.user;

  protected readonly sessions = signal<SessionInfo[]>([]);
  protected readonly sessionsLoading = signal(true);
  protected readonly passwordBusy = signal(false);
  protected readonly deleteBusy = signal(false);
  protected readonly confirmingDelete = signal(false);

  protected readonly passwordForm = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newPassword: [
      '',
      [
        Validators.required,
        Validators.minLength(10),
        Validators.maxLength(128),
        Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
      ],
    ],
  });

  protected readonly deleteForm = this.fb.nonNullable.group({
    password: ['', [Validators.required]],
  });

  protected readonly themes: { id: ThemeMode; label: string }[] = [
    { id: 'light', label: 'Clair' },
    { id: 'dark', label: 'Sombre' },
    { id: 'system', label: 'Système' },
  ];

  protected readonly initials = computed(() => {
    const u = this.user();
    return `${(u?.firstName ?? '').charAt(0)}${(u?.lastName ?? '').charAt(0)}`.toUpperCase() || '?';
  });

  constructor() {
    this.loadSessions();
  }

  private loadSessions(): void {
    this.sessionsLoading.set(true);
    this.auth.sessions().subscribe({
      next: (list) => {
        this.sessions.set(list);
        this.sessionsLoading.set(false);
      },
      error: (failure: ApiFailure) => {
        this.sessionsLoading.set(false);
        this.toasts.error(failure.message);
      },
    });
  }

  /* ── Mot de passe ── */

  protected changePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    this.passwordBusy.set(true);
    this.http.post('/api/auth/change-password', this.passwordForm.getRawValue()).subscribe({
      next: () => {
        this.passwordBusy.set(false);
        this.passwordForm.reset({ currentPassword: '', newPassword: '' });
        this.toasts.success('Mot de passe modifié. Vos autres sessions ont été révoquées.');
        this.loadSessions();
      },
      error: (err) => {
        const failure = toApiFailure(err);
        this.passwordBusy.set(false);
        this.toasts.error(
          failure.status === 401 ? 'Mot de passe actuel incorrect.' : failure.message,
        );
      },
    });
  }

  /* ── Sessions ── */

  protected revoke(session: SessionInfo): void {
    this.auth.revokeSession(session.id).subscribe({
      next: () => {
        this.sessions.update((list) => list.filter((s) => s.id !== session.id));
        this.toasts.success('Session fermée.');
      },
      error: (failure: ApiFailure) => this.toasts.error(failure.message),
    });
  }

  protected revokeAll(): void {
    if (!confirm('Fermer toutes les autres sessions ?')) return;

    this.auth.logoutEverywhere().subscribe({
      next: () => {},
      error: (failure: ApiFailure) => this.toasts.error(failure.message),
    });
  }

  /* ── Suppression de compte ── */

  protected deleteAccount(): void {
    if (this.deleteForm.invalid) {
      this.deleteForm.markAllAsTouched();
      return;
    }

    this.deleteBusy.set(true);
    this.http
      .delete('/api/auth/account', { body: { password: this.deleteForm.controls.password.value } })
      .subscribe({
        next: () => {
          this.deleteBusy.set(false);
          this.auth.clearSession();
          this.toasts.success('Compte supprimé.');
          void this.router.navigate(['/auth/login']);
        },
        error: (err) => {
          const failure = toApiFailure(err);
          this.deleteBusy.set(false);
          this.toasts.error(
            failure.status === 401 ? 'Mot de passe incorrect.' : failure.message,
          );
        },
      });
  }

  protected setTheme(mode: ThemeMode): void {
    this.theme.set(mode);
  }

  protected when(value: string): string {
    return formatDateTime(value);
  }
}
