---
type: doc
status: active
tags: [environment, secrets, supabase, netsuite, oauth2, edge-functions, api-key, cloudflare]
relatedTo: []
---

# Environment and secrets

The Supabase project is **McWorkshop** (`xckqgweflvfstbvppmsy`, ap-southeast-2). The prototype still runs on mock data, except the NetSuite connection test on Admin, Integration, which calls the `customers-list` Edge Function.

This file lists names only. Never put a secret value in this file, in code, in logs or in a commit. Values go into Supabase secrets (server side), `.env.local` (git ignored) or the Cloudflare dashboard.

## Browser (Vite)

Set in `.env.local` for development (see `.env.example`) and in the Cloudflare build settings. Anything starting with `VITE_` ends up in the built JavaScript.

| Name | Purpose | Status |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://xckqgweflvfstbvppmsy.supabase.co` | In use |
| `VITE_EDGE_API_KEY` | Our Edge Function API key, the same value as `EDGE_API_KEY` | In use, prototype only (see below) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key, once the app reads tables directly (RLS protects the data) | Later |
| `VITE_DATA_SOURCE` | `mock` (default) or `supabase` | Later |

**Known limit:** `VITE_EDGE_API_KEY` is visible to anyone who has the built app. That is acceptable for the read only connection test on an app that is not published. Before the workshop app is published, its browser calls move to Supabase Auth (a signed in user), and the API key stays for server to server callers only.

## Supabase secrets (Edge Functions only)

Set with `supabase secrets set` or in the dashboard. All of these exist on the project as of 11/11/2026.

| Name | Purpose |
|---|---|
| `EDGE_API_KEY` | The API key every caller must send in the `x-api-key` header. At least 32 characters. Can hold two keys separated by a comma while rotating |
| `EDGE_ALLOWED_ORIGINS` | Comma list of browser origins allowed by CORS. Currently `http://localhost:5183,http://localhost:4173`. Add the production app URL when it is deployed. Server to server callers are not affected |
| `NETSUITE_ACCOUNT_ID` | NetSuite account ID (production) |
| `NETSUITE_REST_URL` | Base URL of the account's REST services, in the form `https://<account-id>.suitetalk.api.netsuite.com`. SuiteQL, record and OAuth token paths are built from it |
| `NETSUITE_CLIENT_ID` | OAuth 2.0 client credentials (machine to machine) client ID |
| `NETSUITE_CERTIFICATE_ID` | Certificate ID for the client credentials flow, sent as the JWT `kid` |
| `NETSUITE_PRIVATE_KEY` | Unencrypted PKCS#8 (or PKCS#1 RSA) PEM private key used to sign the client assertion. RSA signs with PS256, EC with ES256 |
| `NETSUITE_WRITE_MODE` | `live` turns on NetSuite writes. Anything else is dry run: the payload is returned and nothing is sent |
| `NETSUITE_MAX_CONCURRENCY` | Cap on parallel NetSuite requests per function instance, default 2, maximum 10 |
| `SUPABASE_SERVICE_ROLE_KEY` | Provided by Supabase to Edge Functions, for the later sync and outbox workers |

## Rotating the API key

1. Generate a new key of at least 32 random characters.
2. Set `EDGE_API_KEY` to `newkey,oldkey`.
3. Update every caller to the new key (for the workshop app, `VITE_EDGE_API_KEY` in `.env.local` and the Cloudflare settings).
4. Set `EDGE_API_KEY` to `newkey`.

## Rules

- NetSuite is production only. Integration work is read only until Shane approves a specific write in the conversation.
- `NETSUITE_WRITE_MODE` defaults to dry run in code as well as in configuration.
- Logs never contain the API key, tokens, the JWT assertion, authorisation headers or customer data.
