import { z } from 'zod';
import {
  changePasswordSchema,
  deleteAccountSchema,
  emailOnlySchema,
  googleStartSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  tokenOnlySchema,
  updateAccountSchema,
} from './schemas/auth.schemas.js';
import { calendarQuerySchema } from './schemas/calendar.schemas.js';
import { deliveriesQuerySchema, preferencesSchema } from './schemas/notifications.schemas.js';
import {
  exportQuerySchema,
  forecastQuerySchema,
  trendsQuerySchema,
} from './schemas/reports.schemas.js';
import {
  cancelSchema,
  createSubscriptionSchema,
  listQuerySchema,
  reactivateSchema,
  updateSubscriptionSchema,
} from './schemas/subscriptions.schemas.js';

// OpenAPI 3.1 description of the API. Request bodies and query parameters are generated from the
// same zod schemas that validate requests, so the docs can't drift from what the server accepts.

type Auth = 'session' | 'none' | 'cron';
interface Endpoint {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  tag: string;
  summary: string;
  description?: string;
  auth: Auth;
  body?: z.ZodType;
  query?: z.ZodObject;
  success: { status: number; description: string; csv?: boolean };
  errors?: number[];
}

// OpenAPI 3.1 uses JSON Schema 2020-12, zod's default target; the per-schema $schema key is dropped
function toJsonSchema(schema: z.ZodType) {
  const { $schema, ...json } = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
  return json;
}

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'Validation failed (see `error.details`)',
  401: 'Not logged in, or the session expired',
  403: 'Forbidden (e.g. `EMAIL_NOT_VERIFIED`, `ORIGIN_NOT_ALLOWED`)',
  404: 'Not found, or not yours',
  409: 'Conflicts with the current state (e.g. archiving an active subscription)',
  422: 'Breaks a business rule (e.g. `NEXT_BILLING_DATE_REQUIRED`)',
  429: 'Rate limited (see the `Retry-After` header)',
};

const id = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };

const ENDPOINTS: Endpoint[] = [
  {
    method: 'get',
    path: '/api/health',
    tag: 'System',
    summary: 'Health check (API and database)',
    auth: 'none',
    success: { status: 200, description: 'Healthy' },
    errors: [],
  },

  {
    method: 'post',
    path: '/api/auth/register',
    tag: 'Auth',
    summary: 'Create an account',
    description:
      'Always answers 202 ("check your email"), whether or not the email already has an account. The account is usable after verification.',
    auth: 'none',
    body: registerSchema,
    success: {
      status: 202,
      description: 'Verification email sent (or an "account exists" email to an existing owner)',
    },
    errors: [400, 429],
  },
  {
    method: 'post',
    path: '/api/auth/verify-email',
    tag: 'Auth',
    summary: 'Verify an email address',
    description:
      'Consumes the single-use token from the emailed link and logs the user in (sets the `sid` cookie).',
    auth: 'none',
    body: tokenOnlySchema,
    success: { status: 200, description: 'Verified and logged in; returns the user' },
    errors: [400, 429],
  },
  {
    method: 'post',
    path: '/api/auth/resend-verification',
    tag: 'Auth',
    summary: 'Resend the verification email',
    auth: 'none',
    body: emailOnlySchema,
    success: { status: 202, description: 'Same answer for any email' },
    errors: [400, 429],
  },
  {
    method: 'post',
    path: '/api/auth/login',
    tag: 'Auth',
    summary: 'Log in',
    auth: 'none',
    body: loginSchema,
    success: { status: 200, description: 'Logged in (sets the `sid` cookie); returns the user' },
    errors: [400, 401, 403, 429],
  },
  {
    method: 'post',
    path: '/api/auth/logout',
    tag: 'Auth',
    summary: 'Log out (ends this session)',
    auth: 'session',
    success: { status: 204, description: 'Session deleted' },
  },
  {
    method: 'post',
    path: '/api/auth/forgot-password',
    tag: 'Auth',
    summary: 'Request a password-reset email',
    auth: 'none',
    body: emailOnlySchema,
    success: { status: 202, description: 'Same answer for any email' },
    errors: [400, 429],
  },
  {
    method: 'post',
    path: '/api/auth/reset-password',
    tag: 'Auth',
    summary: 'Reset the password with an emailed token',
    description: 'Single-use, 30-minute token. Logs the user out on every device.',
    auth: 'none',
    body: resetPasswordSchema,
    success: { status: 204, description: 'Password changed' },
    errors: [400, 429],
  },
  {
    method: 'post',
    path: '/api/auth/change-password',
    tag: 'Auth',
    summary: 'Change the password',
    description: 'Ends every other session and replaces the current one.',
    auth: 'session',
    body: changePasswordSchema,
    success: { status: 204, description: 'Password changed; new `sid` cookie' },
    errors: [400, 401, 429],
  },
  {
    method: 'get',
    path: '/api/auth/me',
    tag: 'Auth',
    summary: 'The current user',
    auth: 'session',
    success: { status: 200, description: '`{ id, email, timezone, hasPassword, createdAt }`' },
  },
  {
    method: 'get',
    path: '/api/auth/providers',
    tag: 'Auth',
    summary: 'Which outside sign-in providers are configured',
    auth: 'none',
    success: { status: 200, description: '`{ google: boolean }`' },
    errors: [],
  },
  {
    method: 'get',
    path: '/api/auth/google/start',
    tag: 'Auth',
    summary: 'Start "Continue with Google" (browser navigation, not fetch)',
    description:
      'Sets a short-lived cookie holding the state, nonce and PKCE verifier, then redirects to Google. `timezone` is used if an account gets created. 404 when Google sign-in is not configured.',
    auth: 'none',
    query: googleStartSchema,
    success: { status: 303, description: "Redirect to Google's consent screen" },
    errors: [404, 429],
  },
  {
    method: 'get',
    path: '/api/auth/google/callback',
    tag: 'Auth',
    summary: 'Where Google sends the browser back',
    description:
      'Checks the state against the cookie, exchanges the code (with the PKCE verifier) for an ID token server-to-server, validates its claims, then logs in, links the account by verified email, or creates one. Redirects to the app, or to `/login?google=failed|cancelled`.',
    auth: 'none',
    success: { status: 303, description: 'Redirect to the app (sets the `sid` cookie on success)' },
    errors: [404, 429],
  },

  {
    method: 'patch',
    path: '/api/account',
    tag: 'Account',
    summary: 'Update the timezone',
    auth: 'session',
    body: updateAccountSchema,
    success: { status: 200, description: 'The updated user' },
    errors: [400, 401],
  },
  {
    method: 'delete',
    path: '/api/account',
    tag: 'Account',
    summary: 'Delete the account and all its data',
    description:
      'Confirm with `password`, or with `confirmEmail` (the account email) for accounts that only sign in with Google.',
    auth: 'session',
    body: deleteAccountSchema,
    success: { status: 204, description: 'Deleted' },
    errors: [400, 401, 429],
  },
  {
    method: 'get',
    path: '/api/notification-preferences',
    tag: 'Account',
    summary: 'Account-wide reminder settings',
    auth: 'session',
    success: { status: 200, description: '`{ remindersEnabled, defaultReminderDaysBefore }`' },
  },
  {
    method: 'patch',
    path: '/api/notification-preferences',
    tag: 'Account',
    summary: 'Update reminder settings',
    auth: 'session',
    body: preferencesSchema,
    success: { status: 200, description: 'The updated settings' },
    errors: [400, 401],
  },
  {
    method: 'get',
    path: '/api/notifications',
    tag: 'Account',
    summary: 'Reminder history',
    auth: 'session',
    query: deliveriesQuerySchema,
    success: { status: 200, description: 'Paginated: `{ data, pagination }`, newest first' },
    errors: [400, 401],
  },

  {
    method: 'get',
    path: '/api/categories',
    tag: 'Subscriptions',
    summary: 'Predefined categories',
    auth: 'session',
    success: { status: 200, description: '`[{ slug, name }]`' },
  },
  {
    method: 'get',
    path: '/api/subscriptions',
    tag: 'Subscriptions',
    summary: 'List subscriptions',
    description:
      'Filtered, sorted and paginated on the server. Archived subscriptions are hidden unless `state=archived`.',
    auth: 'session',
    query: listQuerySchema,
    success: {
      status: 200,
      description: 'Paginated: `{ data, pagination: { page, limit, total, totalPages } }`',
    },
    errors: [400, 401],
  },
  {
    method: 'post',
    path: '/api/subscriptions',
    tag: 'Subscriptions',
    summary: 'Create a subscription',
    description:
      'Amounts are decimal strings with at most the currency\'s number of decimals ("15.99" USD, "1500" JPY). Records the starting price in the price history.',
    auth: 'session',
    body: createSubscriptionSchema,
    success: { status: 201, description: 'The created subscription' },
    errors: [400, 401],
  },
  {
    method: 'get',
    path: '/api/subscriptions/export',
    tag: 'Subscriptions',
    summary: 'Download a CSV export',
    description:
      "Only the requester's data. User-entered text that a spreadsheet would run as a formula is prefixed with an apostrophe.",
    auth: 'session',
    query: exportQuerySchema,
    success: { status: 200, description: 'CSV attachment', csv: true },
    errors: [400, 401],
  },
  {
    method: 'get',
    path: '/api/subscriptions/{id}',
    tag: 'Subscriptions',
    summary: 'One subscription, with its next three billing dates',
    auth: 'session',
    success: { status: 200, description: 'The subscription' },
    errors: [401, 404],
  },
  {
    method: 'patch',
    path: '/api/subscriptions/{id}',
    tag: 'Subscriptions',
    summary: 'Update a subscription',
    description:
      'A price change is recorded in the price history in the same transaction. Changing `billingInterval`/`billingIntervalCount` requires `nextBillingDate`.',
    auth: 'session',
    body: updateSubscriptionSchema,
    success: { status: 200, description: 'The updated subscription' },
    errors: [400, 401, 404, 422],
  },
  {
    method: 'delete',
    path: '/api/subscriptions/{id}',
    tag: 'Subscriptions',
    summary: 'Delete a subscription and its history',
    auth: 'session',
    success: { status: 204, description: 'Deleted' },
    errors: [401, 404],
  },
  {
    method: 'post',
    path: '/api/subscriptions/{id}/cancel',
    tag: 'Subscriptions',
    summary: 'Record a cancellation (the provider is not contacted)',
    auth: 'session',
    body: cancelSchema,
    success: { status: 200, description: 'Now cancelled' },
    errors: [400, 401, 404, 409],
  },
  {
    method: 'post',
    path: '/api/subscriptions/{id}/reactivate',
    tag: 'Subscriptions',
    summary: 'Reactivate a cancelled subscription',
    auth: 'session',
    body: reactivateSchema,
    success: { status: 200, description: 'Active again, billing from `nextBillingDate`' },
    errors: [400, 401, 404, 409],
  },
  {
    method: 'post',
    path: '/api/subscriptions/{id}/archive',
    tag: 'Subscriptions',
    summary: 'Archive a cancelled subscription',
    auth: 'session',
    success: { status: 200, description: 'Archived (history kept)' },
    errors: [401, 404, 409],
  },
  {
    method: 'post',
    path: '/api/subscriptions/{id}/unarchive',
    tag: 'Subscriptions',
    summary: 'Unarchive (back to cancelled)',
    auth: 'session',
    success: { status: 200, description: 'Cancelled, visible again' },
    errors: [401, 404, 409],
  },
  {
    method: 'get',
    path: '/api/subscriptions/{id}/history',
    tag: 'Subscriptions',
    summary: 'Price history',
    auth: 'session',
    success: {
      status: 200,
      description:
        'Entries newest first with the previous price and change, plus the overall change',
    },
    errors: [401, 404],
  },

  {
    method: 'get',
    path: '/api/dashboard/summary',
    tag: 'Insights',
    summary: 'Totals, upcoming charges and recent price changes',
    description:
      'Monthly-equivalent and annualized totals per currency (exact fractions, rounded once), expected charges in the next 30 days, price changes in the last 90 days.',
    auth: 'session',
    success: { status: 200, description: 'The summary' },
  },
  {
    method: 'get',
    path: '/api/dashboard/category-breakdown',
    tag: 'Insights',
    summary: 'Monthly-equivalent spend per category',
    auth: 'session',
    success: { status: 200, description: 'Per currency, largest category first' },
  },
  {
    method: 'get',
    path: '/api/dashboard/spending-trends',
    tag: 'Insights',
    summary: 'Recorded monthly-equivalent cost at each month end',
    description: 'Rebuilt from start dates, cancellations and price history. Not actual payments.',
    auth: 'session',
    query: trendsQuerySchema,
    success: { status: 200, description: '`{ months, points: [{ month, date, totals }] }`' },
    errors: [400, 401],
  },
  {
    method: 'get',
    path: '/api/calendar',
    tag: 'Insights',
    summary: 'Expected charges in a date range',
    description: 'At most 366 days. Past charges use the price that applied that day.',
    auth: 'session',
    query: calendarQuerySchema,
    success: { status: 200, description: '`{ from, to, events, totals }`' },
    errors: [400, 401],
  },
  {
    method: 'get',
    path: '/api/forecast',
    tag: 'Insights',
    summary: 'Expected payments per month',
    description:
      'Unlike the monthly equivalent, a yearly plan counts in full in the month it renews.',
    auth: 'session',
    query: forecastQuerySchema,
    success: { status: 200, description: '`{ range, from, to, totals, months }`' },
    errors: [400, 401],
  },

  {
    method: 'post',
    path: '/api/internal/tick',
    tag: 'System',
    summary: 'Run background work once (scheduled trigger)',
    description:
      'Maintenance, reminder scheduling and sending. Safe to call repeatedly and concurrently. 404 when `CRON_SECRET` is not configured.',
    auth: 'cron',
    success: { status: 200, description: 'Per-step results' },
    errors: [401, 404],
  },
];

function queryParameters(schema: z.ZodObject) {
  const json = toJsonSchema(schema) as { properties?: Record<string, object>; required?: string[] };
  return Object.entries(json.properties ?? {}).map(([name, propertySchema]) => ({
    name,
    in: 'query',
    required: json.required?.includes(name) ?? false,
    schema: propertySchema,
  }));
}

function operation(endpoint: Endpoint) {
  const errors = endpoint.errors ?? (endpoint.auth === 'session' ? [401] : []);
  return {
    tags: [endpoint.tag],
    summary: endpoint.summary,
    ...(endpoint.description ? { description: endpoint.description } : {}),
    security:
      endpoint.auth === 'session'
        ? [{ session: [] }]
        : endpoint.auth === 'cron'
          ? [{ cron: [] }]
          : [],
    parameters: [
      ...(endpoint.path.includes('{id}') ? [id] : []),
      ...(endpoint.query ? queryParameters(endpoint.query) : []),
    ],
    ...(endpoint.body
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: toJsonSchema(endpoint.body) } },
          },
        }
      : {}),
    responses: {
      [endpoint.success.status]: {
        description: endpoint.success.description,
        ...(endpoint.success.status === 204 || endpoint.success.status === 303
          ? {}
          : endpoint.success.csv
            ? { content: { 'text/csv': { schema: { type: 'string' } } } }
            : {
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Data' } } },
              }),
      },
      ...Object.fromEntries(
        errors.map((status) => [
          status,
          {
            description: ERROR_DESCRIPTIONS[status],
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        ]),
      ),
    },
  };
}

export function buildOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const endpoint of ENDPOINTS) {
    paths[endpoint.path] = { ...paths[endpoint.path], [endpoint.method]: operation(endpoint) };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Subly API',
      version: '1.0.0',
      description:
        "Track recurring subscriptions: costs, renewals, price history, reminders. JSON in and out; state-changing requests must send `Content-Type: application/json` and, from browsers, come from the app's own origin. Money is a decimal string plus an ISO 4217 currency; calendar dates are `YYYY-MM-DD`.",
    },
    tags: ['Auth', 'Account', 'Subscriptions', 'Insights', 'System'].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        session: {
          type: 'apiKey',
          in: 'cookie',
          name: 'sid',
          description: 'Session cookie set by login or email verification',
        },
        cron: {
          type: 'http',
          scheme: 'bearer',
          description: 'The `CRON_SECRET` shared with the scheduler',
        },
      },
      schemas: {
        Data: {
          type: 'object',
          required: ['data'],
          properties: { data: { description: 'The result (shape described per endpoint)' } },
        },
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string', example: 'Name is required' },
                details: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { path: { type: 'string' }, message: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}
