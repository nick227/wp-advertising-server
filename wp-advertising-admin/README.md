# WP Advertising Admin

Separate Railway service: owner BFF/UI for the ad server.

- **No database** — all reads/writes go to `AD_SERVER_BASE_URL` `/admin/*`
- Login with the ad-server `ADMIN_TOKEN`
- Local: `npm install && npm run dev` (default port 4200)

Env: see `.env.example`.

## Local testing

1. Start the ad server on `:4100` with matching `ADMIN_TOKEN` (see `wp-advertising-server/.env`).
2. Copy `.env.example` → `.env` (`AD_SERVER_BASE_URL=http://localhost:4100/v1`).
3. `npm run dev` → open http://localhost:4200/login and paste the token.
4. Automated: `npm test` (mocks the ad server; no DB required).

```bash
npm run check
```
