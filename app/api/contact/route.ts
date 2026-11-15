import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { sanitizeContact, validateContact } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const N8N_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 20_000;
const IS_DEV = process.env.NODE_ENV !== "production";

/** Stable, machine-readable failure codes returned to the client and written to logs. */
type ErrorCode =
  | "INVALID_CONTENT_TYPE"
  | "INVALID_JSON"
  | "PAYLOAD_TOO_LARGE"
  | "VALIDATION_FAILED"
  | "CONFIG_MISSING"
  | "UPSTREAM_AUTH_FAILED"
  | "UPSTREAM_NOT_FOUND"
  | "UPSTREAM_REJECTED"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_UNREACHABLE";

type ApiResponse =
  | { ok: true; message: string; requestId: string }
  | {
      ok: false;
      code: ErrorCode;
      error: string;
      requestId: string;
      fieldErrors?: Record<string, string>;
    };

function respond(body: ApiResponse, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": body.requestId },
  });
}

/** Structured log line. Never pass submitted form data, the full webhook URL or the secret. */
function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown>) {
  const line = JSON.stringify({ scope: "contact", event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

/** Remove whitespace and accidental wrapping quotes that often sneak in when pasting env values. */
function cleanEnv(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const v = value.trim().replace(/^(['"])(.*)\1$/, "$2").trim();
  return v === "" ? undefined : v;
}

/** Short one-way fingerprint so a secret mismatch can be diagnosed from logs without revealing it. */
function fingerprint(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 8);
}

function readConfig():
  | { ok: true; url: URL; secret?: string }
  | { ok: false; reason: "url_missing" | "url_invalid" } {
  const rawUrl = cleanEnv(process.env.N8N_WEBHOOK_URL);
  if (!rawUrl) return { ok: false, reason: "url_missing" };
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "url_invalid" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "url_invalid" };
  }
  return { ok: true, url, secret: cleanEnv(process.env.N8N_WEBHOOK_SECRET) };
}

/** Extract n8n's own error message (e.g. "Authorization data is wrong!"), bounded in size. */
async function readUpstreamMessage(res: Response): Promise<string | undefined> {
  try {
    const text = (await res.text()).slice(0, 2000);
    if (!text) return undefined;
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const msg = parsed.message ?? parsed.error;
      return typeof msg === "string" ? msg.slice(0, 200) : undefined;
    } catch {
      return undefined; // Non-JSON body: don't log arbitrary upstream content.
    }
  } catch {
    return undefined;
  }
}

/** Map an unsuccessful n8n status to our own code, HTTP status and visitor-facing message. */
function mapUpstreamFailure(status: number): { code: ErrorCode; status: number; error: string; hint: string } {
  if (status === 401 || status === 403) {
    return {
      code: "UPSTREAM_AUTH_FAILED",
      status: 500, // Our server is misconfigured — not the visitor's fault.
      error: "The contact form is misconfigured. Please try again later.",
      hint: "n8n rejected the x-webhook-secret header. Make sure N8N_WEBHOOK_SECRET exactly matches the Header Auth credential value in n8n, is enabled for this Vercel environment, and that you redeployed after changing it.",
    };
  }
  if (status === 404) {
    return {
      code: "UPSTREAM_NOT_FOUND",
      status: 502,
      error: "The contact form is temporarily unavailable. Please try again later.",
      hint: "n8n returned 404. The workflow is probably inactive, or the Webhook node's path/method (must be POST) doesn't match N8N_WEBHOOK_URL.",
    };
  }
  if (status === 429) {
    return {
      code: "UPSTREAM_RATE_LIMITED",
      status: 503,
      error: "We're receiving a lot of messages right now. Please try again in a minute.",
      hint: "n8n returned 429 (rate limited).",
    };
  }
  if (status >= 400 && status < 500) {
    return {
      code: "UPSTREAM_REJECTED",
      status: 502,
      error: "We couldn't deliver your message. Please try again later.",
      hint: `n8n rejected the request with HTTP ${status}. Check the Webhook node settings and the workflow's input handling.`,
    };
  }
  return {
    code: "UPSTREAM_ERROR",
    status: 502,
    error: "We couldn't deliver your message right now. Please try again shortly.",
    hint: `n8n returned HTTP ${status}. Open the n8n Executions tab to see which node failed.`,
  };
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const fail = (code: ErrorCode, status: number, error: string, extra?: Partial<ApiResponse>) =>
    respond({ ok: false, code, error, requestId, ...extra } as ApiResponse, status);

  // --- 1. Parse body safely --------------------------------------------------
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return fail("INVALID_CONTENT_TYPE", 415, "Requests must be sent as JSON.");
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return fail("INVALID_JSON", 400, "Could not read the request.");
  }
  if (raw.length > MAX_BODY_BYTES) {
    return fail("PAYLOAD_TOO_LARGE", 413, "Your submission is too large.");
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("INVALID_JSON", 400, "Invalid request format.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail("INVALID_JSON", 400, "Invalid request format.");
  }
  const input = body as Record<string, unknown>;

  // --- 2. Honeypot: bots fill hidden fields. Accept quietly, forward nothing. --
  if (typeof input.website === "string" && input.website.trim() !== "") {
    log("info", "honeypot_triggered", { requestId });
    return respond({ ok: true, message: "Thanks! Your message has been sent.", requestId }, 200);
  }

  // --- 3. Sanitize + validate (never trust the client) -----------------------
  const data = sanitizeContact(input);
  const fieldErrors = validateContact(data);
  if (Object.keys(fieldErrors).length > 0) {
    return fail("VALIDATION_FAILED", 400, "Please correct the highlighted fields.", {
      fieldErrors: fieldErrors as Record<string, string>,
    });
  }

  // --- 4. Read server-side configuration -------------------------------------
  const config = readConfig();
  if (!config.ok) {
    log("error", "config_missing", { requestId, reason: config.reason });
    return fail(
      "CONFIG_MISSING",
      500,
      IS_DEV
        ? `Configuration error: N8N_WEBHOOK_URL is ${config.reason === "url_missing" ? "not set" : "not a valid URL"}. Add it to .env.local and restart the dev server.`
        : "The contact form is temporarily unavailable. Please try again later.",
    );
  }

  const target = { host: config.url.host, path: config.url.pathname };
  const secretInfo = {
    secretConfigured: Boolean(config.secret),
    secretFingerprint: config.secret ? fingerprint(config.secret) : null,
  };

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

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(config.url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(N8N_TIMEOUT_MS),
      cache: "no-store",
      redirect: "error",
    });
  } catch (err) {
    const durationMs = Date.now() - started;
    const isTimeout =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    const cause =
      err instanceof Error && err.cause && typeof err.cause === "object" && "code" in err.cause
        ? String((err.cause as { code: unknown }).code)
        : err instanceof Error
          ? err.name
          : "unknown";
    log("error", isTimeout ? "upstream_timeout" : "upstream_unreachable", {
      requestId,
      ...target,
      durationMs,
      cause,
    });
    return isTimeout
      ? fail("UPSTREAM_TIMEOUT", 504, "The request timed out. Please try again.")
      : fail("UPSTREAM_UNREACHABLE", 503, "We couldn't reach our server. Please try again shortly.");
  }

  const durationMs = Date.now() - started;

  // --- 6. Unsuccessful n8n response -------------------------------------------
  if (!res.ok) {
    const upstreamMessage = await readUpstreamMessage(res);
    const mapped = mapUpstreamFailure(res.status);
    log("error", "upstream_failed", {
      requestId,
      code: mapped.code,
      upstreamStatus: res.status,
      upstreamMessage,
      ...target,
      ...secretInfo,
      durationMs,
      hint: mapped.hint,
    });
    return fail(mapped.code, mapped.status, IS_DEV ? `${mapped.error} [${mapped.hint}]` : mapped.error);
  }

  // --- 7. 2xx — but honour an explicit failure flag if the workflow returns one --
  let explicitFailure = false;
  try {
    const text = await res.text();
    if (text) {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      explicitFailure = parsed?.ok === false || parsed?.success === false;
    }
  } catch {
    /* Non-JSON or empty 2xx body (e.g. "Workflow was started") counts as success. */
  }

  if (explicitFailure) {
    log("error", "upstream_reported_failure", {
      requestId,
      upstreamStatus: res.status,
      ...target,
      durationMs,
    });
    return fail("UPSTREAM_ERROR", 502, "We couldn't deliver your message right now. Please try again shortly.");
  }

  log("info", "delivered", { requestId, upstreamStatus: res.status, ...target, durationMs });
  return respond({ ok: true, message: "Thanks! Your message has been sent.", requestId }, 200);
}
