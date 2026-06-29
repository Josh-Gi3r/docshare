// Centralized environment config for DocShare.
// JWT_SECRET is required — the process fails at startup if unset (no silent blank-key signing).

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(
      `[DocShare] Required environment variable "${key}" is not set. ` +
        `Set it in your .env file before starting the server.`
    );
  }
  return value;
}

function getEnv(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

// Fail-close at module-load time (not inside a request handler).
if (process.env.NODE_ENV !== "test") {
  requireEnv("JWT_SECRET");
}

export const ENV = {
  // App identity (used as JWT audience + OAuth client ID)
  appId: getEnv("APP_ID"),

  // REQUIRED — used to sign/verify session JWTs. Must be ≥32 random bytes.
  cookieSecret: getEnv("JWT_SECRET"),

  // MySQL-compatible connection string. Works with mysql2, TiDB, PlanetScale.
  // Example: mysql://user:pass@host:3306/dbname
  databaseUrl: getEnv("DATABASE_URL"),

  // Optional: external OAuth server URL for SSO.
  // If unset, only magic-link email auth is active.
  oAuthServerUrl: getEnv("OAUTH_SERVER_URL"),

  // Optional: openId/email of a user who is always granted admin on first sign-in.
  ownerOpenId: getEnv("OWNER_OPEN_ID"),

  // Optional: comma-separated list of admin emails auto-granted "admin" role.
  // Example: "alice@example.com,bob@example.com"
  // Leave empty — manage roles through the Admin UI instead.
  adminEmails: getEnv("ADMIN_EMAILS"),

  // Access control: comma-separated allowed email domains.
  // Example: "example.com,partner.com"
  // Set to "*" to allow any email address (open signup).
  allowedEmailDomains: getEnv("ALLOWED_EMAIL_DOMAINS", "*"),

  // Public base URL used in magic-link emails and OG share previews.
  // Example: "https://docs.example.com"
  publicBaseUrl: getEnv("PUBLIC_BASE_URL", "http://localhost:3000"),

  // ─── Email provider ────────────────────────────────────────────────────────
  // Default: Resend  (set RESEND_API_KEY)
  // Alternative: SMTP (set EMAIL_PROVIDER=smtp + SMTP_HOST/PORT/USER/PASS)
  resendApiKey: getEnv("RESEND_API_KEY"),
  emailFromAddress: getEnv("EMAIL_FROM", "DocShare <noreply@example.com>"),
  appName: getEnv("APP_NAME", "DocShare"),

  // ─── AI / LLM provider (OpenAI-compatible) ────────────────────────────────
  // Works with OpenAI, Together, Groq, Ollama, or any OpenAI-compatible proxy.
  aiApiBaseUrl: getEnv("AI_API_BASE_URL", "https://api.openai.com"),
  aiApiKey: getEnv("AI_API_KEY"),
  aiModel: getEnv("AI_MODEL", "gpt-4o-mini"),

  // ─── Storage provider ─────────────────────────────────────────────────────
  // "proxy"  — forward through an HTTP upload proxy (default)
  // "s3"     — AWS S3 / Cloudflare R2 / MinIO (set S3_* vars)
  // "local"  — write to local disk under STORAGE_LOCAL_DIR (dev/test only)
  storageProvider: getEnv("STORAGE_PROVIDER", "proxy"),

  // Proxy credentials (STORAGE_PROVIDER=proxy)
  proxyApiUrl: getEnv("PROXY_API_URL"),
  proxyApiKey: getEnv("PROXY_API_KEY"),

  // S3/R2/MinIO credentials (STORAGE_PROVIDER=s3)
  s3Bucket: getEnv("S3_BUCKET"),
  s3Region: getEnv("S3_REGION", "us-east-1"),
  s3Endpoint: getEnv("S3_ENDPOINT"), // omit for AWS S3; required for R2/MinIO
  s3AccessKeyId: getEnv("AWS_ACCESS_KEY_ID"),
  s3SecretAccessKey: getEnv("AWS_SECRET_ACCESS_KEY"),

  // Local storage directory (STORAGE_PROVIDER=local)
  storageLocalDir: getEnv("STORAGE_LOCAL_DIR", "./uploads"),

  // ─── Optional analytics ───────────────────────────────────────────────────
  // Leave both empty to disable Umami analytics entirely.
  umamiUrl: getEnv("UMAMI_SCRIPT_URL"),
  umamiWebsiteId: getEnv("UMAMI_WEBSITE_ID"),

  isProduction: process.env.NODE_ENV === "production",
};
