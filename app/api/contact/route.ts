import { NextResponse } from "next/server";
import { sanitizeContact, validateContact } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const N8N_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 20_000;
const IS_DEV = process.env.NODE_ENV !== "production";

type ApiResponse =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function json(body: ApiResponse, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function getWebhookConfig(): { url: URL; secret?: string } | null {
  const rawUrl = process.env.N8N_WEBHOOK_URL?.trim();
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const secret = process.env.N8N_WEBHOOK_SECRET?.trim() || undefined;
    return { url, secret };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  // --- 1. Parse body safely --------------------------------------------------
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return json({ ok: false, error: "Requests must be sent as JSON." }, 415);
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json({ ok: false, error: "Could not read the request." }, 400);
  }
  if (raw.length > MAX_BODY_BYTES) {
    return json({ ok: false, error: "Your submission is too large." }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "Invalid request format." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "Invalid request format." }, 400);
  }
  const input = body as Record<string, unknown>;

  // --- 2. Honeypot: bots fill hidden fields. Accept quietly, forward nothing. --
  if (typeof input.website === "string" && input.website.trim() !== "") {
    return json({ ok: true, message: "Thanks! Your message has been sent." }, 200);
  }

  // --- 3. Sanitize + validate (never trust the client) -----------------------
  const data = sanitizeContact(input);
  const fieldErrors = validateContact(data);
  if (Object.keys(fieldErrors).length > 0) {
    return json(
      {
        ok: false,
        error: "Please correct the highlighted fields.",
        fieldErrors: fieldErrors as Record<string, string>,
      },
      400,
    );
  }

  // --- 4. Read server-side configuration -------------------------------------
  const config = getWebhookConfig();
  if (!config) {
    console.error("[contact] N8N_WEBHOOK_URL is missing or invalid.");
    return json(
      {
        ok: false,
        error: IS_DEV
          ? "Configuration error: N8N_WEBHOOK_URL is not set (or is not a valid URL). Add it to .env.local and restart the dev server."
          : "The contact form is temporarily unavailable. Please try again later.",
      },
      503,
    );
  }

  // --- 5. Forward to n8n ------------------------------------------------------
  const payload = {
    name: data.name,
    email: data.email,
    subject: data.subject,
    message: data.message,
    source: "QuickConnect Website",
    submittedAt: new Date().toISOString(),
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
  };
  if (config.secret) headers["x-webhook-secret"] = config.secret;

  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(N8N_TIMEOUT_MS),
      cache: "no-store",
      redirect: "error",
    });

    if (!res.ok) {
      // Log only the status — never the submitted data, URL or secret.
      console.error(`[contact] n8n webhook responded with HTTP ${res.status}.`);
      return json(
        {
          ok: false,
          error: "We couldn't deliver your message right now. Please try again shortly.",
        },
        502,
      );
    }

    return json({ ok: true, message: "Thanks! Your message has been sent." }, 200);
  } catch (err) {
    const isTimeout =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    console.error(
      isTimeout
        ? `[contact] n8n webhook timed out after ${N8N_TIMEOUT_MS}ms.`
        : "[contact] Network error while contacting n8n webhook.",
    );
    return json(
      {
        ok: false,
        error: isTimeout
          ? "The request timed out. Please try again."
          : "We couldn't reach our server. Please try again shortly.",
      },
      isTimeout ? 504 : 503,
    );
  }
}
