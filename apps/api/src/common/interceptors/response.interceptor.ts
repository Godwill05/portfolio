import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, map } from 'rxjs';

export interface Paginated<T> {
  items: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Unwraps service results into a predictable envelope while leaving
 * streaming responses (SSE) untouched.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.headers.accept?.includes('text/event-stream')) return next.handle();

    return next.handle().pipe(
      map((data) => {
        if (data === undefined) return { data: null };
        if (data && typeof data === 'object' && 'items' in data && 'meta' in data) {
          return data as unknown;
        }
        return { data };
      }),
    );
  }
}
