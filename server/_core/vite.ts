import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // For /view/:slug routes, inject dynamic OG meta tags into index.html.
  // This ensures crawlers (iMessage, WhatsApp, Telegram, Slack, etc.) get the
  // correct first-slide thumbnail even in production where the CDN may serve
  // static files before the dedicated Express route fires.
  app.use("/view/:slug", async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const { getShareLinkBySlug, getDocumentById, getDocumentPages } = await import("../db");
      const slug = req.params.slug;
      const link = await getShareLinkBySlug(slug);
      if (!link || !link.isEnabled) { next(); return; }
      const doc = await getDocumentById(link.documentId!);
      if (!doc) { next(); return; }
      const pages = await getDocumentPages(doc.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const previewPage = pages.find((p: any) => p.pageNumber === (link.ogPreviewPageNumber ?? 1)) || pages[0];
      const proto = (req as any).get("x-forwarded-proto") || (req as any).protocol;
      const host = (req as any).get("x-forwarded-host") || (req as any).get("host");
      const publicBase = `${proto}://${host}`;
      const shareUrl = `${publicBase}/view/${escHtml(slug)}`;
      // Use the resize endpoint for og:image — serves 1200x630 JPEG < 300KB
      const imageUrl = `${publicBase}/api/og-image/${escHtml(slug)}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const title = escHtml((link as any).ogTitle || doc.title || "Shared Document");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const description = escHtml((link as any).ogDescription || `${doc.pageCount} pages · Shared via DocShare`);
      const ogTags = [
        `<meta property="og:title" content="${title}" />`,
        `<meta property="og:description" content="${description}" />`,
        `<meta property="og:image" content="${imageUrl}" />`,
        `<meta property="og:image:width" content="1200" />`,
        `<meta property="og:image:height" content="630" />`,
        `<meta property="og:url" content="${shareUrl}" />`,
        `<meta property="og:type" content="website" />`,
        `<meta property="og:site_name" content="DocShare" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${title}" />`,
        `<meta name="twitter:description" content="${description}" />`,
        `<meta name="twitter:image" content="${imageUrl}" />`,
      ].join("\n  ");
      const indexHtml = await fs.promises.readFile(path.resolve(distPath, "index.html"), "utf-8");
      const injected = indexHtml.replace("</head>", `  ${ogTags}\n</head>`);
      res.setHeader("Content-Type", "text/html");
      res.send(injected);
    } catch (err) {
      console.error("[OG Static] Error:", err);
      next();
    }
  });

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
