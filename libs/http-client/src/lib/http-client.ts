import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import CircuitBreaker from 'opossum';
import { logger } from '@orderflow/logger';

export interface HttpClientOptions {
  baseURL: string;
  timeout?: number;
  circuitBreakerThreshold?: number;
}

const DEFAULT_TIMEOUT = 5000;
const DEFAULT_CB_THRESHOLD = 50;

export const createHttpClient = (opts: HttpClientOptions): AxiosInstance => {
  const instance = axios.create({
    baseURL: opts.baseURL,
    timeout: opts.timeout ?? DEFAULT_TIMEOUT,
    headers: { 'Content-Type': 'application/json' },
  });

  const cb = new CircuitBreaker(
    async (config: AxiosRequestConfig) => instance.request(config),
    {
      errorThresholdPercentage:
        opts.circuitBreakerThreshold ?? DEFAULT_CB_THRESHOLD,
      timeout: opts.timeout ?? DEFAULT_TIMEOUT,
      resetTimeout: 30000,
    }
  );

  cb.on('open', () =>
    logger.warn('Circuit breaker OPEN', { baseURL: opts.baseURL })
  );
  cb.on('halfOpen', () =>
    logger.info('Circuit breaker HALF-OPEN', { baseURL: opts.baseURL })
  );
  cb.on('close', () =>
    logger.info('Circuit breaker CLOSED', { baseURL: opts.baseURL })
  );

  instance.interceptors.request.use(config => {
    const correlationId =
      (config.headers?.['x-correlation-id'] as string) ?? '';
    if (correlationId) {
      config.headers['x-correlation-id'] = correlationId;
    }
    return config;
  });

  instance.interceptors.response.use(
    (res: AxiosResponse) => res,
    err => {
      logger.error('HTTP client error', {
        url: err.config?.url,
        status: err.response?.status,
        message: err.message,
      });
      return Promise.reject(err);
    }
  );

  return instance;
};
