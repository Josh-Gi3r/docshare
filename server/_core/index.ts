import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import multer from "multer";
import {
  createDocument,
  createDocumentPage,
  updateDocumentStatus,
  createDocumentVersion,
  updateDocumentVersionStatus,
  promoteDocumentVersion,
  getDocumentVersions,
  getDocumentById,
  upsertSlideNarration,
  deleteSlideNarration,
  upsertVideoSlide,
  getValidAuthToken,
  markAuthTokenUsed,
  getUserByEmail,
  upsertUser,
  resolveCanonicalEmail,
  isAllowedEmail,
} from "../db";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { generateThumbnails } from "../thumbnails";
import { storagePut } from "../storage";
import { sdk } from "./sdk";
import { getUserByOpenId } from "../db";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-powerpoint",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and PPTX files are allowed"));
    }
  },
});

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max for video
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "video/x-msvideo",
      "video/x-matroska",
    ];
    // Also allow by extension for browsers that report generic MIME
    const ext = file.originalname.toLowerCase();
    if (allowed.includes(file.mimetype) || ext.endsWith(".mp4") || ext.endsWith(".mov") || ext.endsWith(".webm")) {
      cb(null, true);
    } else {
      cb(new Error("Only video files (mp4, mov, webm) are allowed"));
    }
  },
});

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  registerOAuthRoutes(app);

  // ─── Magic Link Verify Endpoint ───────────────────────────────────────────
  // GET /api/auth/verify?token=<token>&email=<email>
  // Called when user clicks the magic link in their email.
  // Validates token, creates session for returning users, redirects new users
  // to /welcome for name entry.
  app.get("/api/auth/verify", async (req: express.Request, res: express.Response) => {
    const token = (req.query.token as string) || "";
    const rawEmail = decodeURIComponent((req.query.email as string) || "").toLowerCase().trim();

    if (!token || !rawEmail || !isAllowedEmail(rawEmail)) {
      res.redirect("/?error=invalid_link");
      return;
    }

    // Resolve alias to canonical email (alias → canonical)
    const email = resolveCanonicalEmail(rawEmail);

    try {
      // Validate the token
      const tokenRow = await getValidAuthToken(email, token);
      if (!tokenRow) {
        console.warn(`[MagicLink] Invalid or expired token for ${email}`);
        res.redirect("/?error=invalid_link");
        return;
      }

      // Mark token as used (one-time use)
      await markAuthTokenUsed(tokenRow.id);

      // Check if user already exists
      const existingUser = await getUserByEmail(email);

      if (!existingUser) {
        // New user — redirect to /welcome to collect first + last name
        // Pass email as query param so the welcome page can complete profile
        const welcomeUrl = `/welcome?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
        res.redirect(welcomeUrl);
        return;
      }

      // Returning user — upsert (updates lastSignedIn), create session, redirect to dashboard
      await upsertUser({
        openId: email,
        email,
        loginMethod: "magic_link",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(email, {
        name: existingUser.name ?? email,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, cookieOptions);
      res.redirect("/dashboard");
    } catch (err) {
      console.error("[MagicLink] Verify error:", err);
      res.redirect("/?error=server_error");
    }
  });

  // ─── Document Upload Endpoint ─────────────────────────────────────────────
  app.post(
    "/api/upload",
    upload.single("file"),
    async (req: express.Request, res: express.Response) => {
      try {
        // Authenticate user via session cookie
        let user;
        try {
          user = await sdk.authenticateRequest(req);
          if (!user) throw new Error("No user");
        } catch {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }

        const file = req.file;
        if (!file) {
          res.status(400).json({ error: "No file provided" });
          return;
        }

        const isPdf =
          file.mimetype === "application/pdf" ||
          file.originalname.toLowerCase().endsWith(".pdf");
        const fileType: "pdf" | "pptx" = isPdf ? "pdf" : "pptx";
        const title = (req.body.title as string) || file.originalname.replace(/\.[^.]+$/, "");

        // Upload original file to S3
        const fileKey = `documents/user-${user.id}/${Date.now()}-${file.originalname}`;
        const { url: fileUrl } = await storagePut(fileKey, file.buffer, file.mimetype);

        // Create document record in DB
        const dbResult = await createDocument({
          userId: user.id,
          title,
          fileName: file.originalname,
          fileType,
          fileUrl,
          fileKey,
          pageCount: 0,
          status: "processing",
        });

        // Get the inserted document ID
        const insertId = (dbResult as any).insertId as number;

        // Respond immediately so the client can show progress
        res.json({ success: true, documentId: insertId });

        // Process thumbnails asynchronously.
        // Hard 8-minute total job timeout — if the job hangs (e.g. OOM-killed page),
        // we still set status to error so the reprocess button appears.
        const JOB_TIMEOUT_MS = 8 * 60 * 1000;
        setImmediate(async () => {
          const jobTimer = setTimeout(async () => {
            console.error(`[Upload] Job timeout for doc ${insertId} — forcing error status`);
            try { await updateDocumentStatus(insertId, "error"); } catch {}
          }, JOB_TIMEOUT_MS);
          try {
            const thumbnails = await generateThumbnails(file.buffer, fileType, insertId);
            clearTimeout(jobTimer);
            for (const thumb of thumbnails) {
              await createDocumentPage({
                documentId: insertId,
                pageNumber: thumb.pageNumber,
                thumbnailUrl: thumb.thumbnailUrl,
                thumbnailKey: thumb.thumbnailKey,
              });
            }
            await updateDocumentStatus(insertId, "ready", thumbnails.length);
            console.log(`[Upload] Document ${insertId} processed: ${thumbnails.length} pages`);
          } catch (err) {
            clearTimeout(jobTimer);
            console.error(`[Upload] Thumbnail generation failed for doc ${insertId}:`, err);
            await updateDocumentStatus(insertId, "error");
          }
        });
      } catch (err) {
        console.error("[Upload] Error:", err);
        res.status(500).json({ error: "Upload failed" });
      }
    }
  );

  // ─── Upload New Version Endpoint ──────────────────────────────────────────
  app.post(
    "/api/upload-version",
    upload.single("file"),
    async (req: express.Request, res: express.Response) => {
      try {
        let user;
        try {
          user = await sdk.authenticateRequest(req);
          if (!user) throw new Error("No user");
        } catch {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }
        const file = req.file;
        if (!file) { res.status(400).json({ error: "No file provided" }); return; }
        const documentId = parseInt(req.body.documentId as string);
        if (!documentId) { res.status(400).json({ error: "documentId required" }); return; }

        // Verify ownership
        const doc = await getDocumentById(documentId);
        if (!doc || doc.userId !== user.id) { res.status(403).json({ error: "Forbidden" }); return; }

        const isPdf = file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
        const fileType: "pdf" | "pptx" = isPdf ? "pdf" : "pptx";
        const nextVersionNumber = doc.currentVersion + 1;

        // Upload file to S3
        const fileKey = `documents/user-${user.id}/${Date.now()}-v${nextVersionNumber}-${file.originalname}`;
        const { url: fileUrl } = await storagePut(fileKey, file.buffer, file.mimetype);

        // Create version record
        const versionResult = await createDocumentVersion({
          documentId,
          versionNumber: nextVersionNumber,
          fileName: file.originalname,
          fileType,
          fileUrl,
          fileKey,
          pageCount: 0,
          status: "processing",
        });
        const versionId = (versionResult as any).insertId as number;

        res.json({ success: true, versionId, versionNumber: nextVersionNumber });

        // Process thumbnails asynchronously.
        const VERSION_JOB_TIMEOUT_MS = 8 * 60 * 1000;
        setImmediate(async () => {
          const jobTimer = setTimeout(async () => {
            console.error(`[Upload-Version] Job timeout for doc ${documentId} v${nextVersionNumber}`);
            try { await updateDocumentVersionStatus(versionId, "error"); } catch {}
          }, VERSION_JOB_TIMEOUT_MS);
          try {
            const thumbnails = await generateThumbnails(file.buffer, fileType, documentId);
            clearTimeout(jobTimer);
            for (const thumb of thumbnails) {
              await createDocumentPage({
                documentId,
                versionId,
                pageNumber: thumb.pageNumber,
                thumbnailUrl: thumb.thumbnailUrl,
                thumbnailKey: thumb.thumbnailKey,
              });
            }
            await updateDocumentVersionStatus(versionId, "ready", thumbnails.length);
            await promoteDocumentVersion(documentId, nextVersionNumber, thumbnails.length);
            console.log(`[Upload-Version] Doc ${documentId} v${nextVersionNumber}: ${thumbnails.length} pages`);
          } catch (err) {
            clearTimeout(jobTimer);
            console.error(`[Upload-Version] Failed for doc ${documentId} v${nextVersionNumber}:`, err);
            await updateDocumentVersionStatus(versionId, "error");
          }
        });
      } catch (err) {
        console.error("[Upload-Version] Error:", err);
        res.status(500).json({ error: "Upload failed" });
      }
    }
  );

  // ─── Narration Upload Endpoint ───────────────────────────────────────────
  // POST /api/upload-narration
  // Body: multipart/form-data — file (video), documentId, pageNumber
  // Stores video to S3, upserts slide_narrations row.
  app.post(
    "/api/upload-narration",
    videoUpload.single("file"),
    async (req: express.Request, res: express.Response) => {
      try {
        let user;
        try {
          user = await sdk.authenticateRequest(req);
          if (!user) throw new Error("No user");
        } catch {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }

        const file = req.file;
        if (!file) { res.status(400).json({ error: "No file provided" }); return; }

        const documentId = parseInt(req.body.documentId as string);
        const pageNumber = parseInt(req.body.pageNumber as string);
        // versionId: absent/null = master; number = specific document version
        const versionIdRaw = req.body.versionId as string | undefined;
        const versionId = versionIdRaw && versionIdRaw !== "null" && versionIdRaw !== "undefined" ? parseInt(versionIdRaw) : null;
        if (!documentId || !pageNumber) {
          res.status(400).json({ error: "documentId and pageNumber are required" });
          return;
        }

        // Verify ownership
        const doc = await getDocumentById(documentId);
        if (!doc || doc.userId !== user.id) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }

        // Upload video to S3
        const ext = file.originalname.split(".").pop() || "mp4";
        const videoKey = `narrations/doc-${documentId}/page-${pageNumber}-${Date.now()}.${ext}`;
        const { url: videoUrl } = await storagePut(videoKey, file.buffer, file.mimetype || "video/mp4");

        // Save to global narration library so it appears in the narration library page
        const { createMediaLibraryItem } = await import("../db");
        const label = file.originalname.replace(/\.[^/.]+$/, "") || `Slide ${pageNumber} narration`;
        const libResult = await createMediaLibraryItem({
          userId: user.id,
          label,
          videoUrl,
          videoKey,
          type: "narration",
          durationSeconds: undefined,
        });
        const mediaLibraryId = (libResult as any).insertId as number;

        // Also add the initial version record to narration_versions
        const { addNarrationVersion } = await import("../db");
        await addNarrationVersion(mediaLibraryId, user.id, {
          videoUrl,
          videoKey,
          fileSizeBytes: file.size,
        });

        // Upsert narration scoped to (documentId, pageNumber, versionId).
        // versionId null = master/original; non-null = specific document version.
        await upsertSlideNarration({ documentId, pageNumber, versionId, videoUrl, videoKey, cropX: 50, cropY: 50, mediaLibraryId });

        res.json({ success: true, videoUrl, pageNumber, mediaLibraryId, versionId });
      } catch (err) {
        console.error("[Upload-Narration] Error:", err);
        res.status(500).json({ error: "Upload failed" });
      }
    }
  );

  // ─── Media Library Upload Endpoint ─────────────────────────────────────────────────────
  // POST /api/upload-to-library
  // Body: multipart/form-data — file (video), type (narration|video), label (optional)
  // Stores video to S3, inserts into media_library.
  app.post(
    "/api/upload-to-library",
    videoUpload.single("file"),
    async (req: express.Request, res: express.Response) => {
      try {
        let user;
        try {
          user = await sdk.authenticateRequest(req);
          if (!user) throw new Error("No user");
        } catch {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }

        const file = req.file;
        if (!file) { res.status(400).json({ error: "No file provided" }); return; }

        const type = (req.body.type as string) === "video" ? "video" : "narration";
        const label = (req.body.label as string) || file.originalname;

        // Upload video to S3
        const ext = file.originalname.split(".").pop() || "mp4";
        const videoKey = `media-library/user-${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { url: videoUrl } = await storagePut(videoKey, file.buffer, file.mimetype || "video/mp4");

        // Insert into media_library
        const { createMediaLibraryItem } = await import("../db");
        const id = await createMediaLibraryItem({ userId: user.id, label, videoUrl, videoKey, type });

        res.json({ success: true, id, videoUrl, label, type });
      } catch (err) {
        console.error("[Upload-To-Library] Error:", err);
        res.status(500).json({ error: "Upload failed" });
      }
    }
  );

  // ─── Video Slide Upload Endpoint ─────────────────────────────────────────────────────
  // POST /api/upload-video-slideody: multipart/form-data — file (video), documentId, pageNumber
  // Stores video to S3, extracts thumbnail with ffmpeg, upserts video_slides row.
  app.post(
    "/api/upload-video-slide",
    videoUpload.single("file"),
    async (req: express.Request, res: express.Response) => {
      try {
        let user;
        try {
          user = await sdk.authenticateRequest(req);
          if (!user) throw new Error("No user");
        } catch {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }

        const file = req.file;
        if (!file) { res.status(400).json({ error: "No file provided" }); return; }

        const documentId = parseInt(req.body.documentId as string);
        const pageNumber = parseInt(req.body.pageNumber as string);
        if (!documentId || !pageNumber) {
          res.status(400).json({ error: "documentId and pageNumber are required" });
          return;
        }

        // Verify ownership
        const doc = await getDocumentById(documentId);
        if (!doc || doc.userId !== user.id) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }

        // Upload video to S3
        const ext = file.originalname.split(".").pop() || "mp4";
        const videoKey = `video-slides/doc-${documentId}/page-${pageNumber}-${Date.now()}.${ext}`;
        const { url: videoUrl } = await storagePut(videoKey, file.buffer, file.mimetype || "video/mp4");

        // Extract thumbnail from first frame using ffmpeg
        let thumbnailUrl: string | undefined;
        let thumbnailKey: string | undefined;
        let durationSeconds: number | undefined;
        try {
          const os = await import("os");
          const path = await import("path");
          const fs = await import("fs/promises");
          const { execFile } = await import("child_process");
          const { promisify } = await import("util");
          const execFileAsync = promisify(execFile);

          const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `vs-${documentId}-`));
          const inputPath = path.join(tmpDir, `input.${ext}`);
          const thumbPath = path.join(tmpDir, "thumb.jpg");

          await fs.writeFile(inputPath, file.buffer);

          // Extract duration
          try {
            const { stdout } = await execFileAsync("ffprobe", [
              "-v", "error", "-show_entries", "format=duration",
              "-of", "default=noprint_wrappers=1:nokey=1", inputPath,
            ]);
            durationSeconds = parseFloat(stdout.trim()) || undefined;
          } catch { /* non-fatal */ }

          // Extract first frame as JPEG
          await execFileAsync("ffmpeg", [
            "-i", inputPath, "-ss", "0", "-vframes", "1",
            "-vf", "scale=1920:-1", "-q:v", "2", thumbPath,
          ]);

          const thumbBuffer = await fs.readFile(thumbPath);
          thumbnailKey = `video-slides/doc-${documentId}/page-${pageNumber}-thumb-${Date.now()}.jpg`;
          const { url } = await storagePut(thumbnailKey, thumbBuffer, "image/jpeg");
          thumbnailUrl = url;

          await fs.rm(tmpDir, { recursive: true, force: true });
        } catch (thumbErr) {
          console.warn("[Upload-VideoSlide] Thumbnail extraction failed:", thumbErr);
        }

        await upsertVideoSlide({ documentId, pageNumber, videoUrl, videoKey, thumbnailUrl, thumbnailKey, durationSeconds });

        res.json({ success: true, videoUrl, thumbnailUrl, pageNumber, durationSeconds });
      } catch (err) {
        console.error("[Upload-VideoSlide] Error:", err);
        res.status(500).json({ error: "Upload failed" });
      }
    }
  );

  // ─── OG Image Resize Endpoint ──────────────────────────────────────────────
  // Fetches the S3 thumbnail and resizes to 1200x630 JPEG for social previews.
  // Social platforms (WhatsApp, iMessage, Telegram) reject images > 600KB or > 1200px.
  app.get("/api/og-image/:slug", async (req: express.Request, res: express.Response) => {
    try {
      const { getShareLinkBySlug, getDocumentById, getDocumentPages } = await import("../db");
      const slug = req.params.slug;
      const link = await getShareLinkBySlug(slug);
      if (!link) { res.status(404).end(); return; }
      const doc = await getDocumentById(link.documentId!);
      if (!doc) { res.status(404).end(); return; }
      const pages = await getDocumentPages(doc.id);
      const previewPage = pages.find((p) => p.pageNumber === (link.ogPreviewPageNumber ?? 1)) || pages[0];
      if (!previewPage?.thumbnailUrl) { res.status(404).end(); return; }

      // Fetch original image from S3/CDN
      const fetch = (await import("node-fetch")).default;
      const imgRes = await fetch(previewPage.thumbnailUrl);
      if (!imgRes.ok) { res.status(502).end(); return; }
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

      // Resize to 1200x630 JPEG, quality 82 (target < 300KB)
      const sharp = (await import("sharp")).default;
      const resized = await sharp(imgBuffer)
        .resize(1200, 630, { fit: "cover", position: "top" })
        .jpeg({ quality: 82, progressive: true })
        .toBuffer();

      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400"); // 24h cache
      res.setHeader("Content-Length", resized.length);
      res.end(resized);
    } catch (err) {
      console.error("[OG-Image] Error:", err);
      res.status(500).end();
    }
  });

  // ─── Bot/Crawler OG Intercept for /view/:slug ────────────────────────
  // Telegram, Slack, WhatsApp, Twitter etc. crawl the share URL directly.
  // We detect the bot User-Agent and serve a minimal HTML page with
  // dynamic OG meta tags so the link preview shows the document's slide.
  // Escape HTML special chars to prevent malformed OG meta tags
  function escHtml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Detect any non-browser agent: bots, crawlers, iOS link preview (no "Mozilla"),
  // Slack, Telegram, WhatsApp, Discord, iMessage (dataaccessd / LinkPresentation), etc.
  function isCrawler(ua: string): boolean {
    if (!ua) return true; // no UA → likely a headless crawler
    // iOS iMessage / Safari Reading List / Apple link preview agents
    if (/dataaccessd|LinkPresentation|Iframely|preview\.icloud/i.test(ua)) return true;
    // Known named bots
    if (/bot|crawler|spider|facebookexternalhit|twitterbot|slackbot|telegrambot|whatsapp|linkedinbot|discordbot|embedly|quora|outbrain|pinterest|vkshare|w3c_validator|baiduspider|yandexbot|duckduckbot|applebot|googlebot|bingbot|semrushbot|ahrefsbot|iframely|rogerbot|bufferbot|bitlybot|flipboard|nuzzel|tumblr|viberbot|line-poker|skypeuripreview|xing-contenttabreceiver|curl|python-requests|go-http-client/i.test(ua)) return true;
    // Any UA that does NOT contain "Mozilla" is almost certainly not a real browser
    if (!/mozilla/i.test(ua)) return true;
    return false;
  }

  // /api/og/:slug — the shareable URL for social previews.
  // API routes always go through Express in production (CDN does not bypass /api/*).
  // Crawlers read the OG tags; real browsers get an instant JS redirect to /view/:slug.
  app.get("/api/og/:slug", async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const { getShareLinkBySlug, getDocumentById, getDocumentPages } = await import("../db");
      const slug = req.params.slug;
      const link = await getShareLinkBySlug(slug);
      if (!link || !link.isEnabled) { res.status(404).send("Not found"); return; }
      const doc = await getDocumentById(link.documentId!);
      if (!doc) { res.status(404).send("Not found"); return; }
      const pages = await getDocumentPages(doc.id);
      const previewPage = pages.find((p) => p.pageNumber === (link.ogPreviewPageNumber ?? 1)) || pages[0];
      const proto = req.get("x-forwarded-proto") || req.protocol;
      const host = req.get("x-forwarded-host") || req.get("host");
      const publicBase = `${proto}://${host}`;
      const viewerUrl = `${publicBase}/view/${escHtml(slug)}`;
      const ogUrl = `${publicBase}/api/og/${escHtml(slug)}`;
      // Use the resize endpoint for og:image — serves 1200x630 JPEG < 300KB
      const imageUrl = `${publicBase}/api/og-image/${escHtml(slug)}`;
      const title = escHtml((link as any).ogTitle || doc.title || "Shared Document");
      const description = escHtml((link as any).ogDescription || `${doc.pageCount} pages · Shared via DocShare`);
      res.setHeader("Content-Type", "text/html");
      res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title} — DocShare</title>
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${imageUrl}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${ogUrl}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="DocShare" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${imageUrl}" />
  <meta http-equiv="refresh" content="0;url=${viewerUrl}" />
  <script>window.location.replace("${viewerUrl}");<\/script>
</head>
<body><p><a href="${viewerUrl}">${title}</a></p></body>
</html>`);
    } catch (err) {
      console.error("[OG API] Error:", err);
      next();
    }
  });

  // Keep /view/:slug serving OG for dev mode (Vite proxies through Express).
  app.get("/view/:slug", async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const { getShareLinkBySlug, getDocumentById, getDocumentPages } = await import("../db");
      const slug = req.params.slug;
      const link = await getShareLinkBySlug(slug);
      if (!link || !link.isEnabled) { next(); return; }
      const doc = await getDocumentById(link.documentId!);
      if (!doc) { next(); return; }
      const pages = await getDocumentPages(doc.id);
      const previewPage = pages.find((p) => p.pageNumber === (link.ogPreviewPageNumber ?? 1)) || pages[0];
      const proto = req.get("x-forwarded-proto") || req.protocol;
      const host = req.get("x-forwarded-host") || req.get("host");
      const publicBase = `${proto}://${host}`;
      const shareUrl = `${publicBase}/view/${escHtml(slug)}`;
      // Use the resize endpoint for og:image — serves 1200x630 JPEG < 300KB
      const imageUrl = `${publicBase}/api/og-image/${escHtml(slug)}`;
      const title = escHtml((link as any).ogTitle || doc.title || "Shared Document");
      const description = escHtml((link as any).ogDescription || `${doc.pageCount} pages · Shared via DocShare`);
      res.setHeader("Content-Type", "text/html");
      res.send(`<!DOCTYPE html>
<head>
  <meta charset="utf-8" />
  <title>${title} — DocShare</title>
  <!-- OG / social preview -->
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${imageUrl}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${shareUrl}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="DocShare" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${imageUrl}" />
  <!-- Instant redirect for real browsers — fires before page renders -->
  <meta http-equiv="refresh" content="0;url=${shareUrl}" />
  <script>window.location.replace("${shareUrl}");<\/script>
</head>
<body><p><a href="${shareUrl}">${title}</a></p></body>
</html>`);
    } catch (err) {
      console.error("[OG] Error:", err);
      next();
    }
  });

  // ─── tRPC ─────────────────────────────────────────────────────────────────
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
