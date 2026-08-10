import { ErrorHandler, Injectable } from '@angular/core';

/**
 * Single capture point for uncaught errors. Logs in every environment and is
 * the one place to forward to an external reporter in production
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    console.error('[unhandled]', error);
    this.report(error);
  }

  private report(error: unknown): void {
    // Integration point.
    return;
  }
}
