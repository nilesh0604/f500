export type HealthStatus = 'ok' | 'degraded' | 'down';

export interface HealthResponse {
  status: HealthStatus;
  timestamp: string;
  version: string;
  checks?: Record<string, HealthStatus>;
}
