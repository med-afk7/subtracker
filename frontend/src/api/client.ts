// Error thrown for non-2xx responses; carries the API's error code
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

// Small fetch wrapper: sends cookies, parses JSON and throws on error responses.
// Success bodies look like { data }, errors like { error: { code, message } }.
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const payload = await send(path, options);
  return payload?.data as T;
}

// For paginated lists, whose bodies are { data, pagination }
export async function requestPage<T, P>(path: string): Promise<{ data: T[]; pagination: P }> {
  return send(path, {});
}

async function send(path: string, { method = 'GET', body }: RequestOptions) {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error?.code ?? 'UNKNOWN_ERROR',
      payload?.error?.message ?? 'Something went wrong',
    );
  }

  return payload;
}

// Message to show for any caught error
export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Something went wrong';
