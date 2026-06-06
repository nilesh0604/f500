export class HttpError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface HttpResponse<T = any> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export class HttpClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(
    options: { baseUrl?: string; defaultHeaders?: Record<string, string> } = {}
  ) {
    this.baseUrl = options.baseUrl || '';
    this.defaultHeaders = options.defaultHeaders || {};
  }

  private buildUrl(endpoint: string): string {
    if (endpoint.startsWith('http')) {
      return endpoint;
    }
    return `${this.baseUrl}${endpoint}`;
  }

  private buildHeaders(
    headers?: Record<string, string>
  ): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...this.defaultHeaders,
      ...headers,
    };
  }

  async request<T = any>(
    method: string,
    endpoint: string,
    data?: any,
    options?: { headers?: Record<string, string>; timeout?: number }
  ): Promise<HttpResponse<T>> {
    const url = this.buildUrl(endpoint);
    const headers = this.buildHeaders(options?.headers);

    const controller = new AbortController();
    const timeoutId = options?.timeout
      ? setTimeout(() => controller.abort(), options.timeout)
      : null;

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
        signal: controller.signal,
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      let responseData: T;
      const contentType = response.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = (await response.text()) as unknown as T;
      }

      if (!response.ok) {
        throw new HttpError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          responseData
        );
      }

      return {
        data: responseData,
        status: response.status,
        headers: responseHeaders,
      };
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new HttpError('Request timeout');
        }
        throw error;
      }
      throw new HttpError('Unknown error occurred');
    }
  }

  async get<T = any>(
    endpoint: string,
    options?: { headers?: Record<string, string>; timeout?: number }
  ): Promise<HttpResponse<T>> {
    return this.request<T>('GET', endpoint, undefined, options);
  }

  async post<T = any>(
    endpoint: string,
    data?: any,
    options?: { headers?: Record<string, string>; timeout?: number }
  ): Promise<HttpResponse<T>> {
    return this.request<T>('POST', endpoint, data, options);
  }

  async put<T = any>(
    endpoint: string,
    data?: any,
    options?: { headers?: Record<string, string>; timeout?: number }
  ): Promise<HttpResponse<T>> {
    return this.request<T>('PUT', endpoint, data, options);
  }

  async delete<T = any>(
    endpoint: string,
    options?: { headers?: Record<string, string>; timeout?: number }
  ): Promise<HttpResponse<T>> {
    return this.request<T>('DELETE', endpoint, undefined, options);
  }

  withAuth(username: string, password: string): HttpClient {
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    return new HttpClient({
      baseUrl: this.baseUrl,
      defaultHeaders: {
        ...this.defaultHeaders,
        Authorization: `Basic ${auth}`,
      },
    });
  }

  withBearerToken(token: string): HttpClient {
    return new HttpClient({
      baseUrl: this.baseUrl,
      defaultHeaders: {
        ...this.defaultHeaders,
        Authorization: `Bearer ${token}`,
      },
    });
  }
}
