# QuickConnect

A lightweight contact website built with **Next.js 15 (App Router)**, **TypeScript** and **Tailwind CSS v4**. Messages submitted through the contact form go to an **n8n webhook** via a server-side API route.

```
Browser ──► POST /api/contact (Next.js, server) ──► n8n webhook
            validates + sanitizes                  x-webhook-secret header
```

The browser only ever talks to `/api/contact`. The webhook URL and secret stay on the server and are never shipped to the client.

## Project structure

```
app/
  page.tsx               Landing page (hero + contact form)
  layout.tsx             Root layout, font, metadata
  globals.css            Tailwind + theme tokens
  api/contact/route.ts   Server route that validates input and forwards it to n8n
components/
  Navbar.tsx
  ContactForm.tsx        Client form: validation, loading/success/error states, honeypot
  Footer.tsx
lib/
  validation.ts          Shared sanitizing + validation rules (client and server)
.env.example
```

## Local development

Requires Node.js 18.18 or newer (20+ recommended).

```bash
npm install
cp .env.example .env.local     # then edit the values
npm run dev                    # http://localhost:3000
```

`.env.local`:

```env
N8N_WEBHOOK_URL=https://your-n8n-domain.com/webhook/contact-form
N8N_WEBHOOK_SECRET=your-secret-here
```

| Variable             | Required | Description                                                                 |
| -------------------- | -------- | --------------------------------------------------------------------------- |
| `N8N_WEBHOOK_URL`    | Yes      | Full URL of your n8n Webhook node (use the **Production URL** in production). |
| `N8N_WEBHOOK_SECRET` | No       | If set, it is sent as the `x-webhook-secret` header on every request.        |

Do **not** prefix these with `NEXT_PUBLIC_`. That would expose them to the browser.

If `N8N_WEBHOOK_URL` is missing, the form shows a clear configuration error in development. In production it shows a generic "temporarily unavailable" message. Neither case ever reports a fake success.

## Payload sent to n8n

```json
{
  "name": "Visitor Name",
  "email": "visitor@example.com",
  "subject": "Project Inquiry",
  "message": "I want to discuss a project.",
  "source": "QuickConnect Website",
  "submittedAt": "2026-01-01T12:00:00.000Z"
}
```

Headers: `Content-Type: application/json`, plus `x-webhook-secret: <secret>` when configured.

## Setting up the n8n workflow

1. Add a **Webhook** node: method `POST`, path e.g. `contact-form`.
2. **Authentication** (recommended): choose **Header Auth** and create a credential with
   name `x-webhook-secret` and value equal to your `N8N_WEBHOOK_SECRET`. n8n will then reject requests without the correct header.
3. Set **Respond** to "Immediately" (or use a *Respond to Webhook* node). Any 2xx response counts as success. Anything else is shown to the visitor as a delivery error.
4. Add your processing nodes (email, CRM, Google Sheets, Slack, …). Fields are available as `{{$json.body.name}}`, `{{$json.body.email}}`, and so on.
5. **Activate** the workflow and copy the **Production URL** (`/webhook/...`, not `/webhook-test/...`).

## Deploying to Vercel

1. Push this project to a GitHub/GitLab/Bitbucket repository.
2. In Vercel, click **Add New → Project** and import the repository. The framework preset is detected as **Next.js** and no build settings need changing.
3. Before deploying (or afterwards, under **Project → Settings → Environment Variables**), add:
   - `N8N_WEBHOOK_URL` = your n8n production webhook URL
   - `N8N_WEBHOOK_SECRET` = your secret (optional, but recommended)

   Tick the environments where each should apply (**Production**, and optionally **Preview** / **Development**).
4. Click **Deploy**. If you add or change variables after a deployment, open **Deployments → ⋯ → Redeploy**, because environment variables only take effect on a new deployment.

Via the CLI instead:

```bash
npm i -g vercel
vercel env add N8N_WEBHOOK_URL production
vercel env add N8N_WEBHOOK_SECRET production
vercel --prod
```

## API reference: `POST /api/contact`

Request body (JSON): `name`, `email`, `subject`, `message`, plus optional `website` (the honeypot field, which should be left empty).

| Status | Meaning                                                      |
| ------ | ------------------------------------------------------------ |
| 200    | Delivered to n8n (`{ "ok": true, "message": "..." }`)        |
| 400    | Invalid input (`fieldErrors` lists the problem for each field) |
| 405    | Method other than POST                                       |
| 413    | Body too large                                               |
| 415    | Body was not sent as JSON                                    |
| 502    | n8n responded with a non-2xx status                          |
| 503    | Webhook not configured, or n8n unreachable                   |
| 504    | n8n did not respond within 10 seconds                        |

## Security notes

- The webhook URL and secret are read only on the server (`process.env`) and never appear in client bundles.
- Input is validated and sanitized on the server whatever the client sends: required fields, email format, length limits, control-character stripping, and a 20 KB body cap.
- **Honeypot:** a hidden `website` field. If it is filled in, the request is acknowledged but **not** forwarded to n8n.
- Double submissions are blocked on the client while a request is in flight.
- Error responses are generic. Server logs record only status codes and error types, never submitted content or secrets.
- Nothing is stored in `localStorage` or cookies.

For heavier spam protection, consider adding rate limiting (e.g. Vercel Firewall rules) or a CAPTCHA such as Cloudflare Turnstile.

## Scripts

```bash
npm run dev     # development server
npm run build   # production build
npm run start   # serve the production build
```
