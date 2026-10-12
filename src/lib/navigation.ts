/** Return a same-origin application path, never an absolute or protocol-relative URL. */
export function safeNextPath(value: string | null | undefined, fallback = "/") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) {
    return fallback;
  }

  return value;
}

/** Convert a completed form POST into a GET navigation at its destination. */
export const POST_FORM_REDIRECT_STATUS = 303;
