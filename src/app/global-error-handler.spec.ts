import { GlobalErrorHandler } from './global-error-handler';

describe('GlobalErrorHandler', () => {
  it('captures errors without throwing and logs them', () => {
    const handler = new GlobalErrorHandler();
    const spy = spyOn(console, 'error');
    const error = new Error('boom');

    expect(() => handler.handleError(error)).not.toThrow();
    expect(spy).toHaveBeenCalledWith('[unhandled]', error);
  });
});
