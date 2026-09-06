import type { RequestHandler } from 'express';

export const notFoundHandler: RequestHandler = (req, res) => {
  const acceptsHtml = req.accepts(['html', 'json']) === 'html';
  if (acceptsHtml) {
    res.status(404).type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Not found — WP Advertising</title>
<link rel="stylesheet" href="/assets/site.css"></head>
<body style="font-family:IBM Plex Sans,sans-serif;padding:3rem 1.5rem">
  <h1>Page not found</h1>
  <p><a href="/">Return home</a></p>
</body></html>`);
    return;
  }

  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found', requestId: req.requestId } });
};
