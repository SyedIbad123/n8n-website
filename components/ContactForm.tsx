"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  LIMITS,
  sanitizeContact,
  validateContact,
  type ContactData,
  type ContactField,
  type FieldErrors,
} from "@/lib/validation";

type Status = "idle" | "submitting" | "success" | "error";

const EMPTY: ContactData = { name: "", email: "", subject: "", message: "" };

const inputBase =
  "block w-full rounded-xl border bg-white px-4 py-3 text-[15px] text-ink placeholder:text-slate-400 shadow-sm transition outline-none focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-50";

function inputClass(hasError: boolean) {
  return `${inputBase} ${
    hasError
      ? "border-red-400 focus:border-red-500 focus:ring-red-100"
      : "border-slate-200 focus:border-brand-500 focus:ring-brand-100"
  }`;
}

export default function ContactForm() {
  const [values, setValues] = useState<ContactData>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [feedback, setFeedback] = useState("");
  const [honeypot, setHoneypot] = useState("");
  // A ref guards against double-submits even before React re-renders.
  const inFlight = useRef(false);

  const submitting = status === "submitting";

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const field = e.target.name as ContactField;
    setValues((v) => ({ ...v, [field]: e.target.value }));
    if (errors[field]) setErrors((er) => ({ ...er, [field]: undefined }));
    if (status === "error" || status === "success") setStatus("idle");
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;

    const clean = sanitizeContact(values);
    const found = validateContact(clean);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setStatus("error");
      setFeedback("Please correct the highlighted fields.");
      const first = Object.keys(found)[0];
      document.getElementById(`cf-${first}`)?.focus();
      return;
    }

    inFlight.current = true;
    setStatus("submitting");
    setFeedback("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...clean, website: honeypot }),
      });

      let data: { ok?: boolean; message?: string; error?: string; fieldErrors?: FieldErrors } = {};
      try {
        data = await res.json();
      } catch {
        /* non-JSON response — handled below */
      }

      if (res.ok && data.ok) {
        setStatus("success");
        setFeedback(data.message ?? "Thanks! Your message has been sent.");
        setValues(EMPTY);
        setErrors({});
      } else {
        if (data.fieldErrors) setErrors(data.fieldErrors);
        setStatus("error");
        setFeedback(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setFeedback("Network error. Please check your connection and try again.");
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight text-ink">Send us a message</h2>
        <p className="mt-1 text-sm text-slate-500">All fields are required.</p>
      </div>

      {status === "success" && (
        <div
          role="status"
          className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <svg viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0 fill-emerald-500" aria-hidden="true">
            <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3-4 4a1 1 0 0 1-1.4 0l-2-2a1 1 0 1 1 1.4-1.4L9 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4Z" />
          </svg>
          <p>
            <span className="font-semibold">Message sent.</span> {feedback} We&apos;ll be in touch soon.
          </p>
        </div>
      )}

      {status === "error" && feedback && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <svg viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0 fill-red-500" aria-hidden="true">
            <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-12a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1Zm0 8.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z" />
          </svg>
          <p>{feedback}</p>
        </div>
      )}

      <form noValidate onSubmit={handleSubmit} className="space-y-5" aria-busy={submitting}>
        {/* Honeypot — hidden from humans and assistive tech; bots tend to fill it. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="cf-website">Website</label>
          <input
            id="cf-website"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Full Name" id="cf-name" error={errors.name}>
            <input
              id="cf-name"
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Jane Doe"
              required
              maxLength={LIMITS.name}
              value={values.name}
              onChange={handleChange}
              disabled={submitting}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "cf-name-error" : undefined}
              className={inputClass(!!errors.name)}
            />
          </Field>

          <Field label="Email Address" id="cf-email" error={errors.email}>
            <input
              id="cf-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="jane@company.com"
              required
              maxLength={LIMITS.email}
              value={values.email}
              onChange={handleChange}
              disabled={submitting}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "cf-email-error" : undefined}
              className={inputClass(!!errors.email)}
            />
          </Field>
        </div>

        <Field label="Subject" id="cf-subject" error={errors.subject}>
          <input
            id="cf-subject"
            name="subject"
            type="text"
            placeholder="Project inquiry"
            required
            maxLength={LIMITS.subject}
            value={values.subject}
            onChange={handleChange}
            disabled={submitting}
            aria-invalid={!!errors.subject}
            aria-describedby={errors.subject ? "cf-subject-error" : undefined}
            className={inputClass(!!errors.subject)}
          />
        </Field>

        <Field
          label="Message"
          id="cf-message"
          error={errors.message}
          hint={`${values.message.length}/${LIMITS.message}`}
        >
          <textarea
            id="cf-message"
            name="message"
            rows={6}
            placeholder="Tell us a little about your project…"
            required
            maxLength={LIMITS.message}
            value={values.message}
            onChange={handleChange}
            disabled={submitting}
            aria-invalid={!!errors.message}
            aria-describedby={errors.message ? "cf-message-error" : undefined}
            className={`${inputClass(!!errors.message)} resize-y`}
          />
        </Field>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? (
            <>
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
                <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              </svg>
              Sending…
            </>
          ) : (
            <>
              Submit Message
              <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true">
                <path d="M3.1 2.3a.75.75 0 0 1 .8-.1l13.5 7a.75.75 0 0 1 0 1.3l-13.5 7a.75.75 0 0 1-1-.9L4.7 10 2.9 3.1a.75.75 0 0 1 .2-.8ZM6.1 10.75l-1.2 4.4L14.6 10 4.9 4.85l1.2 4.4H11a.75.75 0 0 1 0 1.5H6.1Z" />
              </svg>
            </>
          )}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  id,
  error,
  hint,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label} <span className="text-brand-600">*</span>
        </label>
        {hint && <span className="text-xs tabular-nums text-slate-400">{hint}</span>}
      </div>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
