import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  path: string;
  timestamp: string;
  requestId?: string;
}

/**
 * Centralises error shaping and guarantees that internal details
 * (stack traces, SQL, secrets) never leak to clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Une erreur interne est survenue.';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
        code = HttpStatus[status] ?? 'ERROR';
      } else {
        const obj = payload as Record<string, unknown>;
        code = (obj['code'] as string) ?? (obj['error'] as string) ?? HttpStatus[status] ?? 'ERROR';
        const rawMessage = obj['message'];
        if (Array.isArray(rawMessage)) {
          message = 'Les données fournies sont invalides.';
          details = rawMessage;
          code = 'VALIDATION_ERROR';
          status = status === 400 ? HttpStatus.UNPROCESSABLE_ENTITY : status;
        } else {
          message = (rawMessage as string) ?? message;
        }
        if (obj['details'] !== undefined) details = obj['details'];
      }
    } else if (exception instanceof QueryFailedError) {
      const driverError = (exception as QueryFailedError & { driverError?: { code?: string } })
        .driverError;
      const mysqlCode = driverError?.code;
      if (mysqlCode === 'ER_DUP_ENTRY') {
        status = HttpStatus.CONFLICT;
        code = 'DUPLICATE_ENTRY';
        message = 'Cette valeur existe déjà.';
      } else if (mysqlCode === 'ER_NO_REFERENCED_ROW_2' || mysqlCode === 'ER_ROW_IS_REFERENCED_2') {
        status = HttpStatus.CONFLICT;
        code = 'RELATION_CONFLICT';
        message = 'Cette opération entre en conflit avec des données liées.';
      }
      this.logger.error(`DB error ${mysqlCode ?? ''} on ${request.method} ${request.url}: ${exception.message}`);
    } else {
      const err = exception as Error;
      this.logger.error(
        `Unhandled error on ${request.method} ${request.url}: ${err?.message}`,
        err?.stack,
      );
    }

    const body: ErrorBody = {
      statusCode: status,
      code: code.toUpperCase().replace(/\s+/g, '_'),
      message,
      ...(details !== undefined ? { details } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(request.id ? { requestId: request.id } : {}),
    };

    if (response.headersSent) return;
    response.status(status).json(body);
  }
}
