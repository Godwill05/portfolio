import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { toApiFailure } from './api-error';
import type {
  AdminUserDetail,
  AdminUserSummary,
  AiFeature,
  AnalyticsOverview,
  AuditEntry,
  Paginated,
  SessionInfo,
  TimeseriesPoint,
  UserRole,
  AccountStatus,
} from './models';

export interface AdminUserQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole;
  status?: AccountStatus;
}

export interface AuditQuery {
  page?: number;
  limit?: number;
  search?: string;
  action?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/admin';

  overview(days = 30): Observable<AnalyticsOverview> {
    return this.data(
      this.http.get<{ data: AnalyticsOverview }>(`${this.base}/analytics/overview`, {
        params: new HttpParams().set('days', days),
      }),
    );
  }

  timeseries(days = 30): Observable<TimeseriesPoint[]> {
    return this.data(
      this.http.get<{ data: TimeseriesPoint[] }>(`${this.base}/analytics/timeseries`, {
        params: new HttpParams().set('days', days),
      }),
    );
  }

  users(query: AdminUserQuery = {}): Observable<Paginated<AdminUserSummary>> {
    let params = new HttpParams();
    if (query.page) params = params.set('page', query.page);
    if (query.limit) params = params.set('limit', query.limit);
    if (query.search) params = params.set('search', query.search);
    if (query.role) params = params.set('role', query.role);
    if (query.status) params = params.set('status', query.status);

    return this.http
      .get<Paginated<AdminUserSummary>>(`${this.base}/users`, { params })
      .pipe(this.fail());
  }

  user(id: string): Observable<AdminUserDetail> {
    return this.data(this.http.get<{ data: AdminUserDetail }>(`${this.base}/users/${id}`));
  }

  updateUser(
    id: string,
    payload: { role?: UserRole; status?: AccountStatus; firstName?: string; lastName?: string },
  ): Observable<AdminUserSummary> {
    return this.data(
      this.http.patch<{ data: AdminUserSummary }>(`${this.base}/users/${id}`, payload),
    );
  }

  adjustQuota(
    id: string,
    payload: { feature: AiFeature | '*'; delta: number; note: string },
  ): Observable<unknown> {
    return this.data(this.http.post<{ data: unknown }>(`${this.base}/users/${id}/quota`, payload));
  }

  userSessions(id: string): Observable<SessionInfo[]> {
    return this.data(this.http.get<{ data: SessionInfo[] }>(`${this.base}/users/${id}/sessions`));
  }

  revokeSessions(id: string): Observable<unknown> {
    return this.data(
      this.http.post<{ data: unknown }>(`${this.base}/users/${id}/sessions/revoke`, {}),
    );
  }

  deleteUser(id: string): Observable<unknown> {
    return this.data(this.http.delete<{ data: unknown }>(`${this.base}/users/${id}`));
  }

  audit(query: AuditQuery = {}): Observable<Paginated<AuditEntry>> {
    let params = new HttpParams();
    if (query.page) params = params.set('page', query.page);
    if (query.limit) params = params.set('limit', query.limit);
    if (query.search) params = params.set('search', query.search);
    if (query.action) params = params.set('action', query.action);

    return this.http.get<Paginated<AuditEntry>>(`${this.base}/audit`, { params }).pipe(this.fail());
  }

  private data<T>(source: Observable<{ data: T }>): Observable<T> {
    return source.pipe(
      map((res) => res.data),
      this.fail(),
    );
  }

  private fail<T>() {
    return catchError<T, Observable<never>>((error) => throwError(() => toApiFailure(error)));
  }
}
