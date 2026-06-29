/**
 * Returns the canonical public base URL for share links.
 * On the published site this will be the actual domain.
 * Falls back to window.location.origin only in local dev.
 */
export function getShareBaseUrl(): string {
  const origin = window.location.origin;
  // Dev server URLs contain the sandbox pattern — replace with the real domain
  if (
    origin.includes("localhost") ||
    origin.includes("127.0.0.1")
  ) {
    return "https://docsend.docshare.example.com";
  }
  return origin;
}
