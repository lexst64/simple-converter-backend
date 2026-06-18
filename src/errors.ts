/**
 * Custom application error class that encapsulates an HTTP status code and an error message
 */
export class AppError extends Error {
  /**
   * HTTP status code corresponding to the error
   */
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
