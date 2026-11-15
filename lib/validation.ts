export const LIMITS = {
  name: 100,
  email: 254,
  subject: 150,
  message: 5000,
} as const;

export const MIN_MESSAGE_LENGTH = 10;

export type ContactField = keyof typeof LIMITS;

export type ContactData = Record<ContactField, string>;

export type FieldErrors = Partial<Record<ContactField, string>>;

// Pragmatic email check: one "@", no spaces, a dot in the domain, sane TLD.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Strip control characters (keeping newlines/tabs in the message) and trim. */
export function sanitize(value: unknown, allowNewlines = false): string {
  if (typeof value !== "string") return "";
  const pattern = allowNewlines
    ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
    : /[\u0000-\u001F\u007F]/g;
  return value.normalize("NFC").replace(pattern, "").trim();
}

export function sanitizeContact(input: Record<string, unknown>): ContactData {
  return {
    name: sanitize(input.name).replace(/\s+/g, " "),
    email: sanitize(input.email).toLowerCase(),
    subject: sanitize(input.subject).replace(/\s+/g, " "),
    message: sanitize(input.message, true).replace(/\r\n?/g, "\n"),
  };
}

export function validateContact(data: ContactData): FieldErrors {
  const errors: FieldErrors = {};

  if (!data.name) errors.name = "Please enter your full name.";
  else if (data.name.length < 2) errors.name = "Name must be at least 2 characters.";
  else if (data.name.length > LIMITS.name)
    errors.name = `Name must be ${LIMITS.name} characters or fewer.`;

  if (!data.email) errors.email = "Please enter your email address.";
  else if (data.email.length > LIMITS.email)
    errors.email = `Email must be ${LIMITS.email} characters or fewer.`;
  else if (!EMAIL_RE.test(data.email)) errors.email = "Please enter a valid email address.";

  if (!data.subject) errors.subject = "Please enter a subject.";
  else if (data.subject.length > LIMITS.subject)
    errors.subject = `Subject must be ${LIMITS.subject} characters or fewer.`;

  if (!data.message) errors.message = "Please enter a message.";
  else if (data.message.length < MIN_MESSAGE_LENGTH)
    errors.message = `Message must be at least ${MIN_MESSAGE_LENGTH} characters.`;
  else if (data.message.length > LIMITS.message)
    errors.message = `Message must be ${LIMITS.message} characters or fewer.`;

  return errors;
}
