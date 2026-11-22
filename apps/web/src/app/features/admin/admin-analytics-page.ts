import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { ApiFailure } from '../../core/api-error';
import { AdminApi } from '../../core/admin.service';
import { ToastService } from '../../core/ui/toast.service';
import { AI_FEATURE_LABELS, formatCurrency, formatNumber, formatPercent } from '../../core/format';
import type { AnalyticsOverview, TimeseriesPoint } from '../../core/models';

@Component({
  selector: 'app-admin-analytics-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-analytics-page.html',
  styleUrl: './admin-analytics-page.scss',
})
export class AdminAnalyticsPage {
  private readonly api = inject(AdminApi);
  private readonly toasts = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly days = signal(30);
  protected readonly overview = signal<AnalyticsOverview | null>(null);
  protected readonly series = signal<TimeseriesPoint[]>([]);

  protected readonly windowOptions = [7, 30, 90, 365];

  protected readonly totalTokens = computed(() => {
    const ai = this.overview()?.ai;
    return ai ? ai.promptTokens + ai.completionTokens : 0;
  });

  /** Hauteur relative des barres, normalisée sur le maximum de la série. */
  protected readonly chart = computed(() => {
    const points = this.series();
    if (points.length === 0) return [];
    const max = Math.max(1, ...points.map((p) => Math.max(p.signups, p.aiRequests)));
    return points.map((p) => ({
      day: p.day,
      signups: p.signups,
      aiRequests: p.aiRequests,
      signupHeight: Math.round((p.signups / max) * 100),
      aiHeight: Math.round((p.aiRequests / max) * 100),
      label: p.day.slice(5),
    }));
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api.overview(this.days()).subscribe({
      next: (data) => {
        this.overview.set(data);
        this.loading.set(false);
      },
      error: (failure: ApiFailure) => {
        this.loading.set(false);
        this.toasts.error(failure.message);
      },
    });

    this.api.timeseries(this.days()).subscribe({
      next: (points) => this.series.set(points),
      error: () => {
        /* le graphique est secondaire par rapport aux totaux */
      },
    });
  }

  protected setWindow(days: number): void {
    this.days.set(days);
    this.load();
  }

  protected featureLabel(feature: string): string {
    return AI_FEATURE_LABELS[feature] ?? feature;
  }

  protected num(value: number | null | undefined): string {
    return formatNumber(value);
  }

  protected pct(value: number | null | undefined): string {
    return formatPercent(value);
  }

  protected money(value: number, currency: string): string {
    return formatCurrency(value, currency);
  }

  /** Largeur d'une barre de répartition, en pourcentage du max. */
  protected share(value: number, all: number[]): number {
    const max = Math.max(1, ...all);
    return Math.round((value / max) * 100);
  }

  protected roleEntries(byRole: Record<string, number>): { key: string; value: number }[] {
    return Object.entries(byRole).map(([key, value]) => ({ key, value }));
  }
}
