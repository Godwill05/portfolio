import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { toApiFailure } from './api-error';
import type { Cv, CvStats, CvStyle, CvDocument, CvStatus, CvTemplate, Paginated } from './models';

export interface CvListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: CvStatus;
}

export interface CreateCvPayload {
  title?: string;
  templateKey?: string;
  targetRole?: string | null;
  document?: CvDocument;
  style?: CvStyle;
  aiAssisted?: boolean;
}

@Injectable({ providedIn: 'root' })
export class CvApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/cvs';

  list(query: CvListQuery = {}): Observable<Paginated<Cv>> {
    let params = new HttpParams();
    if (query.page) params = params.set('page', query.page);
    if (query.limit) params = params.set('limit', query.limit);
    if (query.search) params = params.set('search', query.search);
    if (query.status) params = params.set('status', query.status);

    // Liste paginée : pas d'enveloppe `data`, cf. ResponseInterceptor.
    return this.http
      .get<Paginated<Cv>>(this.base, { params })
      .pipe(this.fail());
  }

  templates(): Observable<CvTemplate[]> {
    return this.http.get<{ data: CvTemplate[] }>(`${this.base}/templates`).pipe(
      map((res) => res.data),
      this.fail(),
    );
  }

  stats(): Observable<CvStats> {
    return this.http
      .get<{ data: CvStats }>(`${this.base}/stats`)
      .pipe(map((res) => res.data), this.fail());
  }

  get(id: string): Observable<Cv> {
    return this.http
      .get<{ data: Cv }>(`${this.base}/${id}`)
      .pipe(map((res) => res.data), this.fail());
  }

  create(payload: CreateCvPayload): Observable<Cv> {
    return this.http
      .post<{ data: Cv }>(this.base, payload)
      .pipe(map((res) => res.data), this.fail());
  }

  update(id: string, payload: Partial<CreateCvPayload> & { status?: CvStatus }): Observable<Cv> {
    return this.http
      .patch<{ data: Cv }>(`${this.base}/${id}`, payload)
      .pipe(map((res) => res.data), this.fail());
  }

  duplicate(id: string): Observable<Cv> {
    return this.http
      .post<{ data: Cv }>(`${this.base}/${id}/duplicate`, {})
      .pipe(map((res) => res.data), this.fail());
  }

  /** Régénère le document depuis le profil courant. */
  refresh(id: string): Observable<Cv> {
    return this.http
      .post<{ data: Cv }>(`${this.base}/${id}/refresh`, {})
      .pipe(map((res) => res.data), this.fail());
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`).pipe(this.fail());
  }

  restore(id: string): Observable<Cv> {
    return this.http
      .post<{ data: Cv }>(`${this.base}/${id}/restore`, {})
      .pipe(map((res) => res.data), this.fail());
  }

  /**
   * Télécharge le PDF en blob.
   * On passe par un blob plutôt que d'ouvrir l'URL directement, parce que
   * l'endpoint exige un header Authorization que le navigateur n'enverrait
   * pas sur une navigation nue.
   */
  downloadPdf(id: string): Observable<Blob> {
    return this.http
      .get(`${this.base}/${id}/pdf`, { responseType: 'blob' })
      .pipe(this.fail());
  }

  /** Aperçu inline pour l'iframe de prévisualisation. */
  previewBlob(id: string): Observable<Blob> {
    return this.http
      .get(`${this.base}/${id}/preview.pdf`, { responseType: 'blob' })
      .pipe(this.fail());
  }

  private fail<T>() {
    return catchError<T, Observable<never>>((error) => throwError(() => toApiFailure(error)));
  }
}
