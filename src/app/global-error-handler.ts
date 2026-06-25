import { ErrorHandler, Injectable } from '@angular/core';

/**
 * Single capture point for uncaught errors. Logs in every environment and is
 * the one place to forward to an external reporter (Sentry, Rollbar, …) in
 * production — so the rest of the app depends on this seam, not on a vendor.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    console.error('[unhandled]', error);
    this.report(error);
  }

  private report(error: unknown): void {
    // Integration point. Example: Sentry.captureException(error);
    void error;
  }
}
