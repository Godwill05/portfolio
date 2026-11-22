import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, throwError } from 'rxjs';

import { ApiFailure, toApiFailure } from './api-error';
import { AuthService } from './auth.service';
import { TokenStore } from './token.store';
import type {
  AiConversation,
  AiConversationSummary,
  CareerPlan,
  ChatStreamEvent,
  CoverLetter,
  CvOptimization,
  JobAnalysis,
  JobOpportunity,
  Paginated,
  QuotaHistoryPoint,
  QuotaSummary,
} from './models';

export interface OptimizeCvPayload {
  targetRole?: string;
  section?: string;
  currentText?: string;
  modelId?: string | null;
}

export interface AnalyzeJobPayload {
  text?: string;
  title?: string;
  company?: string;
  sourceUrl?: string;
  opportunityId?: string;
  save?: boolean;
  modelId?: string | null;
}

export interface CoverLetterPayload {
  jobTitle: string;
  company?: string;
  jobText: string;
  modelId?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AiApi {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly base = '/api/ai';

  /* ── Quotas ── */

  quota(): Observable<QuotaSummary> {
    return this.data(this.http.get<{ data: QuotaSummary }>(`${this.base}/quota`));
  }

  quotaHistory(): Observable<QuotaHistoryPoint[]> {
    return this.data(
      this.http.get<{ data: QuotaHistoryPoint[] | { items: QuotaHistoryPoint[] } }>(
        `${this.base}/quota/history`,
      ),
    ).pipe(map((d) => (Array.isArray(d) ? d : d.items)));
  }

  status(): Observable<{ models: unknown[]; quota: QuotaSummary }> {
    return this.data(
      this.http.get<{ data: { models: unknown[]; quota: QuotaSummary } }>(`${this.base}/status`),
    );
  }

  context(): Observable<unknown> {
    return this.data(this.http.get<{ data: unknown }>(`${this.base}/context`));
  }

  /* ── Conversations ── */

  conversations(query: { page?: number; limit?: number } = {}): Observable<
    Paginated<AiConversationSummary>
  > {
    let params = new HttpParams();
    if (query.page) params = params.set('page', query.page);
    if (query.limit) params = params.set('limit', query.limit);

    return this.http
      .get<Paginated<AiConversationSummary>>(`${this.base}/conversations`, { params })
      .pipe(this.fail());
  }

  createConversation(title?: string): Observable<AiConversationSummary> {
    return this.data(
      this.http.post<{ data: AiConversationSummary }>(`${this.base}/conversations`, {
        title: title ?? 'Nouvelle conversation',
      }),
    );
  }

  conversation(id: string): Observable<AiConversation> {
    return this.data(this.http.get<{ data: AiConversation }>(`${this.base}/conversations/${id}`));
  }

  renameConversation(id: string, title: string): Observable<AiConversationSummary> {
    return this.data(
      this.http.patch<{ data: AiConversationSummary }>(`${this.base}/conversations/${id}`, {
        title,
      }),
    );
  }

  pinConversation(id: string, pinned: boolean): Observable<unknown> {
    return this.data(
      this.http.patch<{ data: unknown }>(`${this.base}/conversations/${id}/pin`, { pinned }),
    );
  }

  deleteConversation(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/conversations/${id}`).pipe(this.fail());
  }

  /* ── Chat (non streaming) ── */

  chat(message: string, conversationId?: string): Observable<unknown> {
    return this.data(
      this.http.post<{ data: unknown }>(`${this.base}/chat`, { message, conversationId }),
    );
  }

  /* ── Fonctions structurées ── */

  optimizeCv(payload: OptimizeCvPayload): Observable<CvOptimization> {
    return this.data(this.http.post<{ data: CvOptimization }>(`${this.base}/cv/optimize`, payload));
  }

  generateCv(payload: { targetRole?: string; style?: string }): Observable<unknown> {
    return this.data(this.http.post<{ data: unknown }>(`${this.base}/cv/generate`, payload));
  }

  analyzeJob(payload: AnalyzeJobPayload): Observable<JobAnalysis> {
    return this.data(this.http.post<{ data: JobAnalysis }>(`${this.base}/jobs/analyze`, payload));
  }

  coverLetter(payload: CoverLetterPayload): Observable<CoverLetter> {
    return this.data(this.http.post<{ data: CoverLetter }>(`${this.base}/cover-letter`, payload));
  }

  careerPlan(goal: string): Observable<CareerPlan> {
    return this.data(this.http.post<{ data: CareerPlan }>(`${this.base}/career/plan`, { goal }));
  }

  /* ── Opportunités ── */

  opportunities(query: { page?: number; limit?: number; status?: string } = {}): Observable<
    Paginated<JobOpportunity>
  > {
    let params = new HttpParams();
    if (query.page) params = params.set('page', query.page);
    if (query.limit) params = params.set('limit', query.limit);
    if (query.status) params = params.set('status', query.status);

    return this.http
      .get<Paginated<JobOpportunity>>(`${this.base}/opportunities`, { params })
      .pipe(this.fail());
  }

  updateOpportunity(id: string, payload: Partial<JobOpportunity>): Observable<JobOpportunity> {
    return this.data(
      this.http.patch<{ data: JobOpportunity }>(`${this.base}/opportunities/${id}`, payload),
    );
  }

  deleteOpportunity(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/opportunities/${id}`).pipe(this.fail());
  }

  /* ── Streaming ── */

  /**
   * Consomme `/api/ai/chat/stream` en SSE via `fetch`.
   *
   * On n'utilise pas `HttpClient` : il ne sait pas exposer un flux
   * incrémental en HTTP/1.1. `EventSource` est exclu pour deux raisons —
   * il n'accepte pas de header Authorization, et le POST est impossible.
   *
   * Le flux est parcouru manuellement pour reconstruire les trames SSE :
   * chaque événement arrive sous la forme `event: <nom>\ndata: <json>\n\n`.
   */
  streamChat(
    message: string,
    conversationId?: string,
    options: { modelId?: string | null; signal?: AbortSignal } = {},
  ): Observable<ChatStreamEvent> {
    return new Observable<ChatStreamEvent>((subscriber) => {
      const controller = new AbortController();
      const external = options.signal;

      // Relie l'annulation externe au contrôleur interne.
      const onExternalAbort = () => controller.abort();
      external?.addEventListener('abort', onExternalAbort);

      void (async () => {
        try {
          const response = await fetch(`${this.base}/chat/stream`, {
            method: 'POST',
            credentials: 'include', // indispensable : cookie de refresh
            headers: {
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
              ...(this.tokens.get() ? { Authorization: `Bearer ${this.tokens.get()}` } : {}),
            },
            body: JSON.stringify({ message, conversationId, modelId: options.modelId ?? null }),
            signal: controller.signal,
          });

          if (response.status === 401) {
            // Le jeton a expiré entre-temps : on tente un refresh unique.
            this.auth.refreshSession().subscribe({
              next: (user) => {
                if (user) subscriber.error(new ApiFailure(401, 'RETRY', 'Session rafraîchie.'));
                else void this.router.navigate(['/auth/login']);
              },
            });
            return;
          }

          if (!response.ok || !response.body) {
            subscriber.error(await this.toStreamError(response));
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Les trames sont séparées par une ligne vide.
            let boundary = buffer.indexOf('\n\n');
            while (boundary !== -1) {
              const frame = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);

              const parsed = parseFrame(frame);
              if (parsed) {
                subscriber.next(parsed);
                if (parsed.type === 'error') {
                  subscriber.error(
                    new ApiFailure(502, parsed.code, parsed.message),
                  );
                  return;
                }
                if (parsed.type === 'done') {
                  subscriber.complete();
                  return;
                }
              }
              boundary = buffer.indexOf('\n\n');
            }
          }

          subscriber.complete();
        } catch (error) {
          if ((error as Error)?.name === 'AbortError') {
            subscriber.complete();
            return;
          }
          subscriber.error(toApiFailure(error));
        } finally {
          external?.removeEventListener('abort', onExternalAbort);
        }
      })();

      // Nettoyage à la désinscription : coupe la connexion réseau.
      return () => {
        external?.removeEventListener('abort', onExternalAbort);
        controller.abort();
      };
    });
  }

  private async toStreamError(response: Response): Promise<ApiFailure> {
    try {
      const body = (await response.json()) as {
        code?: string;
        message?: string;
        details?: unknown;
        requestId?: string;
      };
      return new ApiFailure(
        response.status,
        body.code ?? 'ERROR',
        body.message ?? `Erreur ${response.status}`,
        body.details,
        body.requestId,
      );
    } catch {
      return new ApiFailure(response.status, 'ERROR', `Erreur ${response.status}`);
    }
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

/** Décode une trame SSE `event: x\ndata: {...}`. */
function parseFrame(frame: string): ChatStreamEvent | null {
  let dataLine: string | null = null;

  for (const line of frame.split('\n')) {
    // `data:` peut apparaître plusieurs fois ; les directives de
    // reconnexion SSE (`retry:`, `id:`) ne nous intéressent pas.
    const match = /^data:\s?(.*)$/.exec(line);
    if (match) {
      dataLine = dataLine ? `${dataLine}\n${match[1]}` : match[1];
    }
  }

  if (!dataLine) return null;

  try {
    return JSON.parse(dataLine) as ChatStreamEvent;
  } catch {
    return null;
  }
}
