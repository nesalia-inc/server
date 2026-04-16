export interface ServerError {
  code: string;
  message: string;
  data?: Record<string, unknown>;
}