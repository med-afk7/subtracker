import type { RequestHandler } from 'express';
import { buildOpenApiDocument } from '../openapi.js';

const document = buildOpenApiDocument();

export const openApiJson: RequestHandler = (_req, res) => {
  res.status(200).json(document);
};

// Swagger UI, pinned to an exact version on a CDN. This page alone loosens the API's deny-all
// Content-Security-Policy, and only to that CDN plus our own init script (no inline code).
const SWAGGER_UI = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14';
const CSP = [
  "default-src 'none'",
  `script-src 'self' ${SWAGGER_UI}/`,
  `style-src ${SWAGGER_UI}/`,
  "img-src 'self' data:",
  "connect-src 'self'",
].join('; ');

export const docsPage: RequestHandler = (_req, res) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Subly API</title>
    <link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css" />
  </head>
  <body>
    <div id="docs"></div>
    <script src="${SWAGGER_UI}/swagger-ui-bundle.js"></script>
    <script src="/api/docs/init.js"></script>
  </body>
</html>`);
};

export const docsInitScript: RequestHandler = (_req, res) => {
  res
    .type('application/javascript')
    .send(
      "window.SwaggerUIBundle({ url: '/api/docs/openapi.json', dom_id: '#docs', deepLinking: true });",
    );
};
