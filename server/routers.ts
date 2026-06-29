import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createShareLink,
  deleteDocument,
  deleteShareLink,
  getDocumentAnalyticsSummary,
  getSubDeckAnalyticsSummary,
  getSubDeckPageEngagement,
  getDocumentById,
  getDocumentPages,
  getDocumentsByUserId,
  getPageEngagement,
  getShareLinkBySlug,
  getShareLinksByDocumentId,
  getShareLinksByUserId,
  getShareLinksByComposedDeckId,
  getComposedDeckAnalyticsSummary,
  recordAnalyticsEvent,
  updateShareLink,
  getAnalyticsSummary,
  getRecentActivity,
  recordDocumentView,
  recordPageViewEvent,
  getDocumentVersions,
  getDocumentPagesByVersion,
  getSlideNarrations,
  deleteSlideNarration,
  updateSlideNarrationCrop,
  getVideoSlides,
  deleteVideoSlide,
  // Folders
  createFolder,
  getFoldersByOwner,
  getFolderById,
  updateFolder,
  deleteFolder,
  addDocumentToFolder,
  removeDocumentFromFolder,
  getFolderDocumentIds,
  createFolderMember,
  getFolderMemberByToken,
  getFolderMembers,
  acceptFolderInvite,
  deleteFolderMember,
  getFolderMemberById,
  // Narration assets
  createNarrationAsset,
  getNarrationAssetsByFolder,
  getNarrationAssetsBySlide,
  deleteNarrationAsset,
  // Composed decks
  createComposedDeck,
  getComposedDeckById,
  getComposedDecksByFolder,
  updateComposedDeck,
  deleteComposedDeck,
  saveComposedDeckSlots,
  getComposedDeckSlots,
  getDocumentPageById,
  getNarrationAssetById,
  // Sub-decks
  createSubDeck,
  getSubDecksByDocument,
  getSubDeckById,
  updateSubDeck,
  deleteSubDeck,
  saveSubDeckSlides,
  getSubDeckSlides,
  deleteDocumentPagesByDocumentId,
  updateDocumentStatus,
  createDocumentPage,
} from "./db";
import { generateThumbnails } from "./thumbnails";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendMagicLinkEmail } from "./_core/email";
import {
  getUserByEmail,
  createAuthToken,
  getValidAuthToken,
  markAuthTokenUsed,
  deleteExpiredAuthTokens,
  resolveCanonicalEmail,
  isAllowedEmail,
  getSlideTagsByDocument,
  toggleSlideTag,
  getMediaLibraryByUser,
  createMediaLibraryItem,
  deleteMediaLibraryItem,
} from "./db";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    sendOtp: publicProcedure
      .input(z.object({ email: z.string().email(), origin: z.string().optional() }))
      .mutation(async ({ input }) => {
        const rawEmail = input.email.toLowerCase().trim();
        if (!isAllowedEmail(rawEmail)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Email address not allowed." });
        }
        // Resolve alias to canonical email (alias → canonical)
        const email = resolveCanonicalEmail(rawEmail);
        // Clean up expired tokens first
        await deleteExpiredAuthTokens(email);
        // Generate a secure random 64-char token
        const { randomBytes } = await import("crypto");
        const token = randomBytes(32).toString("hex"); // 64 hex chars
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        await createAuthToken({ email, token, expiresAt });
        // Build magic link URL — use provided origin or fall back to production domain
        const baseUrl = input.origin ?? process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
        const magicLink = `${baseUrl}/api/auth/verify?token=${token}&email=${encodeURIComponent(email)}`;
        // Token is logged at DEBUG level only; never log in production.
        if (process.env.NODE_ENV === "development") console.debug(`[MagicLink] Sent to ${email}`);
        // Send email
        const sent = await sendMagicLinkEmail(email, magicLink);
        if (!sent) {
          console.error(`[MagicLink] Failed to send email to ${email}`);
          // Don't throw — token is still valid, user can use console link in dev
        }
        return { success: true };
      }),

    // Kept for future use when email sending is enabled
    verifyOtp: publicProcedure
      .input(z.object({ email: z.string().email(), otp: z.string().length(6) }))
      .mutation(async ({ ctx, input }) => {
        const email = input.email.toLowerCase().trim();
        const tokenRow = await getValidAuthToken(email, input.otp);
        if (!tokenRow) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired code. Please try again." });
        }
        await markAuthTokenUsed(tokenRow.id);
        const { upsertUser, getUserByEmail: getByEmail } = await import("./db");
        await upsertUser({
          openId: email,
          email,
          name: (() => { const n = email.split("@")[0]; return n.charAt(0).toUpperCase() + n.slice(1); })(),
          loginMethod: "email_otp",
          lastSignedIn: new Date(),
        });
        const user = await getByEmail(email);
        if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create user" });
        const { sdk } = await import("./_core/sdk");
        const sessionToken = await sdk.createSessionToken(email, { name: user.name ?? email });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, cookieOptions);
        return { success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
      }),
    completeProfile: publicProcedure
      .input(z.object({ email: z.string().email(), firstName: z.string().min(1), lastName: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const rawEmail = input.email.toLowerCase().trim();
        if (!isAllowedEmail(rawEmail)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Email address not allowed." });
        }
        // Resolve alias to canonical email
        const email = resolveCanonicalEmail(rawEmail);
        const fullName = `${input.firstName.trim()} ${input.lastName.trim()}`;
        const { upsertUser, getUserByEmail: getByEmail } = await import("./db");
        await upsertUser({
          openId: email,
          email,
          name: fullName,
          loginMethod: "email_otp",
          lastSignedIn: new Date(),
        });
        const user = await getByEmail(email);
        if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create account" });
        const { sdk } = await import("./_core/sdk");
        const sessionToken = await sdk.createSessionToken(email, { name: user.name ?? email });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, cookieOptions);
        return { success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
      }),
  }),

  // ─── Documents ──────────────────────────────────────────────────────────────

  documents: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const docs = await getDocumentsByUserId(ctx.user.id);
      const result = await Promise.all(
        docs.map(async (doc) => {
          const stats = await getDocumentAnalyticsSummary(doc.id);
          const links = await getShareLinksByDocumentId(doc.id);
          // Use the stored pageCount from the document record (updated on version promote)
          // rather than counting all pages (which would include old version pages).
          return { ...doc, stats, linkCount: links.length };
        })
      );
      return result;
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.id);
        if (!doc || doc.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        // If the document has been versioned, load only the active version's pages.
        // currentVersion === 1 means original upload (versionId IS NULL).
        let pages;
        if (doc.currentVersion && doc.currentVersion > 1) {
          const versions = await getDocumentVersions(doc.id);
          // Find the version row matching the active version number
          const activeVersion = versions.find((v) => v.versionNumber === doc.currentVersion && v.status === "ready");
          if (activeVersion) {
            pages = await getDocumentPagesByVersion(doc.id, activeVersion.id);
          } else {
            // Active version not ready yet — fall back to original pages
            pages = await getDocumentPagesByVersion(doc.id, null);
          }
        } else {
          // Original upload: pages have no versionId
          pages = await getDocumentPagesByVersion(doc.id, null);
        }
        const links = await getShareLinksByDocumentId(doc.id);
        const stats = await getDocumentAnalyticsSummary(doc.id);
        return { ...doc, pages, links, stats };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.id);
        if (!doc || doc.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await deleteDocument(input.id);
        return { success: true };
      }),
    reprocess: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.id);
        if (!doc || doc.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        if (!doc.fileUrl || !doc.fileType) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Document has no file to reprocess" });
        }
        // Mark as processing
        await updateDocumentStatus(input.id, "processing", 0);
        // Kick off async reprocessing
        setImmediate(async () => {
          try {
            // Download the original file from S3
            const fileRes = await fetch(doc.fileUrl!);
            if (!fileRes.ok) throw new Error(`Failed to fetch file: ${fileRes.status}`);
            const arrayBuf = await fileRes.arrayBuffer();
            const fileBuffer = Buffer.from(arrayBuf);
            // Clear old pages
            await deleteDocumentPagesByDocumentId(input.id);
            // Generate new thumbnails
            const thumbnails = await generateThumbnails(fileBuffer, doc.fileType as "pdf" | "pptx", input.id);
            for (const thumb of thumbnails) {
              await createDocumentPage({
                documentId: input.id,
                pageNumber: thumb.pageNumber,
                thumbnailUrl: thumb.thumbnailUrl,
                thumbnailKey: thumb.thumbnailKey,
              });
            }
            await updateDocumentStatus(input.id, "ready", thumbnails.length);
            console.log(`[Reprocess] Document ${input.id} reprocessed: ${thumbnails.length} pages`);
          } catch (err) {
            console.error(`[Reprocess] Failed for doc ${input.id}:`, err);
            await updateDocumentStatus(input.id, "error");
          }
        });
        return { success: true };
      }),
  }),

  // ─── Share Links ────────────────────────────────────────────────────────────

  shareLinks: router({
    list: protectedProcedure
      .input(z.object({ documentId: z.number() }))
      .query(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const links = await getShareLinksByDocumentId(input.documentId);
        return links;
      }),
    listForDeck: protectedProcedure
      .input(z.object({ composedDeckId: z.number() }))
      .query(async ({ ctx, input }) => {
        const deck = await getComposedDeckById(input.composedDeckId);
        if (!deck) throw new TRPCError({ code: "NOT_FOUND" });
        const folder = await getFolderById(deck.folderId);
        if (!folder || folder.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        return getShareLinksByComposedDeckId(input.composedDeckId);
      }),
    createForDeck: protectedProcedure
      .input(z.object({ composedDeckId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const deck = await getComposedDeckById(input.composedDeckId);
        if (!deck) throw new TRPCError({ code: "NOT_FOUND" });
        const folder = await getFolderById(deck.folderId);
        if (!folder || folder.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const slug = nanoid(10);
        await createShareLink({
          composedDeckId: input.composedDeckId,
          userId: ctx.user.id,
          slug,
          isEnabled: true,
          ogPreviewPageNumber: 1,
        });
        const links = await getShareLinksByComposedDeckId(input.composedDeckId);
        return links[links.length - 1];
      }),
    create: protectedProcedure
      .input(z.object({
        documentId: z.number(),
        subDeckId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const slug = nanoid(10);
        await createShareLink({
          documentId: input.documentId,
          subDeckId: input.subDeckId ?? null,
          userId: ctx.user.id,
          slug,
          isEnabled: true,
          ogPreviewPageNumber: 1,
        });
        const links = await getShareLinksByDocumentId(input.documentId);
        return links[links.length - 1];
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          isEnabled: z.boolean().optional(),
          password: z.string().nullable().optional(),
          expiresAt: z.number().nullable().optional(),
          ogPreviewPageNumber: z.number().optional(),
          label: z.string().max(256).nullable().optional(),
          slideConfig: z
            .array(z.object({ pageNumber: z.number(), hidden: z.boolean() }))
            .nullable()
            .optional(),
          ogTitle: z.string().max(256).nullable().optional(),
          ogDescription: z.string().max(500).nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const links = await getShareLinksByUserId(ctx.user.id);
        const link = links.find((l) => l.id === input.id);
        if (!link) throw new TRPCError({ code: "FORBIDDEN" });

        const updates: Record<string, unknown> = {};
        if (input.isEnabled !== undefined) updates.isEnabled = input.isEnabled;
        if (input.expiresAt !== undefined) updates.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
        if (input.ogPreviewPageNumber !== undefined) updates.ogPreviewPageNumber = input.ogPreviewPageNumber;
        if (input.label !== undefined) updates.label = input.label;
        if (input.slideConfig !== undefined) updates.slideConfig = input.slideConfig;
        if (input.ogTitle !== undefined) updates.ogTitle = input.ogTitle;
        if (input.ogDescription !== undefined) updates.ogDescription = input.ogDescription;
        if (input.password !== undefined) {
          updates.password = input.password ? await bcrypt.hash(input.password, 10) : null;
        }

        await updateShareLink(input.id, updates);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const links = await getShareLinksByUserId(ctx.user.id);
        const link = links.find((l) => l.id === input.id);
        if (!link) throw new TRPCError({ code: "FORBIDDEN" });
        await deleteShareLink(input.id);
        return { success: true };
      }),

    // Update slug (custom URL)
    updateSlug: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          slug: z
            .string()
            .min(3, "Minimum 3 characters")
            .max(64, "Maximum 64 characters")
            .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const links = await getShareLinksByUserId(ctx.user.id);
        const link = links.find((l) => l.id === input.id);
        if (!link) throw new TRPCError({ code: "FORBIDDEN" });
        // Check uniqueness
        const existing = await getShareLinkBySlug(input.slug);
        if (existing && existing.id !== input.id) {
          throw new TRPCError({ code: "CONFLICT", message: "That slug is already taken" });
        }
        await updateShareLink(input.id, { slug: input.slug });
        return { success: true, slug: input.slug };
      }),

    // Public: resolve a share link for the viewer
    view: publicProcedure
      .input(
        z.object({
          slug: z.string(),
          password: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        const link = await getShareLinkBySlug(input.slug);
        if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Link not found" });
        if (!link.isEnabled) throw new TRPCError({ code: "FORBIDDEN", message: "This link has been disabled" });
        if (link.expiresAt && new Date() > link.expiresAt) {
          throw new TRPCError({ code: "FORBIDDEN", message: "This link has expired" });
        }
        if (link.password) {
          if (!input.password) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "PASSWORD_REQUIRED" });
          }
          const valid = await bcrypt.compare(input.password, link.password);
          if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect password" });
        }

        // ── Composed Deck path ──────────────────────────────────────────────────
        if (link.composedDeckId) {
          const deck = await getComposedDeckById(link.composedDeckId);
          if (!deck) throw new TRPCError({ code: "NOT_FOUND" });
          const slots = await getComposedDeckSlots(deck.id);
          // Resolve each slot to its page data + narration
          const resolvedSlots = await Promise.all(
            slots.map(async (slot) => {
              const page = await getDocumentPageById(slot.documentPageId);
              // Prefer custom narration, then narration asset, then null
              let narrationUrl: string | null = slot.customNarrationUrl ?? null;
              if (!narrationUrl && slot.narrationAssetId) {
                const asset = await getNarrationAssetById(slot.narrationAssetId);
                narrationUrl = asset?.videoUrl ?? null;
              }
              return {
                position: slot.position,
                pageId: slot.documentPageId,
                thumbnailUrl: page?.thumbnailUrl ?? null,
                narrationUrl,
                cropX: 50,
                cropY: 50,
              };
            })
          );
          return {
            link: {
              id: link.id,
              slug: link.slug,
              label: link.label,
              ogPreviewPageNumber: 1,
              ogDescription: link.ogDescription,
              videoControls: link.videoControls,
              viewCount: link.viewCount,
              slideConfig: null,
            },
            composedDeck: {
              id: deck.id,
              name: deck.name,
              description: deck.description,
              slots: resolvedSlots,
            },
            document: null,
          };
        }

        // ── Regular Document path ───────────────────────────────────────────────
        const doc = await getDocumentById(link.documentId!);
        if (!doc) throw new TRPCError({ code: "NOT_FOUND" });

        // Get pages from the latest version; track which versionId is active
        let pages = await getDocumentPages(doc.id);
        let activeVersionId: number | null = null; // null = master/original
        if (doc.currentVersion > 1) {
          const versions = await getDocumentVersions(doc.id);
          const latestVersion = versions[0];
          if (latestVersion?.status === "ready") {
            const versionPages = await getDocumentPagesByVersion(doc.id, latestVersion.id);
            if (versionPages.length > 0) {
              pages = versionPages;
              activeVersionId = latestVersion.id;
            }
          }
        }

        // Apply per-link slide config if set
        let orderedPages = pages;
        if (link.slideConfig && Array.isArray(link.slideConfig) && link.slideConfig.length > 0) {
          const config = link.slideConfig as Array<{ pageNumber: number; hidden: boolean }>;
          orderedPages = config
            .filter((c) => !c.hidden)
            .map((c) => pages.find((p) => p.pageNumber === c.pageNumber))
            .filter(Boolean) as typeof pages;
        }

        return {
          link: {
            id: link.id,
            slug: link.slug,
            label: link.label,
            ogPreviewPageNumber: link.ogPreviewPageNumber,
            ogDescription: link.ogDescription,
            videoControls: link.videoControls,
            viewCount: link.viewCount,
            slideConfig: link.slideConfig,
          },
          composedDeck: null,
          document: {
            id: doc.id,
            title: doc.title,
            fileType: doc.fileType,
            pageCount: orderedPages.length,
            pages: orderedPages,
            /** DB id of the active documentVersion row; null = master/original */
            activeVersionId,
          },
        };
      }),
  }),
  // ─── Video Slides ──────────────────────────────────────────────────────────────────────

  videoSlides: router({
    /** List all video slides for a document (public — used by viewer) */
    list: publicProcedure
      .input(z.object({ documentId: z.number(), versionId: z.number().nullable().optional() }))
      .query(async ({ input }) => {
        return getVideoSlides(input.documentId, input.versionId ?? null);
      }),

    /** Delete a video slide (protected — owner only) */
    delete: protectedProcedure
      .input(z.object({ id: z.number(), documentId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const videoKey = await deleteVideoSlide(input.id);
        if (videoKey) {
          const { storageDelete } = await import("./storage");
          await storageDelete(videoKey).catch(() => {});
        }
        return { success: true };
      }),
  }),

  // ─── Document Versions ──────────────────────────────────────────────────────────────────────

  versions: router({ list: protectedProcedure
      .input(z.object({ documentId: z.number() }))
      .query(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        return getDocumentVersions(input.documentId);
      }),
  }),

  // ─── Analytics ──────────────────────────────────────────────────────────────

  analytics: router({
    documentStats: protectedProcedure
      .input(z.object({ documentId: z.number() }))
      .query(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const summary = await getDocumentAnalyticsSummary(input.documentId);
        const pageStats = await getPageEngagement(input.documentId);
        return { ...summary, pageStats };
      }),
    subDeckStats: protectedProcedure
      .input(z.object({ subDeckId: z.number(), documentId: z.number() }))
      .query(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const summary = await getSubDeckAnalyticsSummary(input.subDeckId);
        const pageStats = await getSubDeckPageEngagement(input.subDeckId);
        return { ...summary, pageStats };
      }),
    deckStats: protectedProcedure
      .input(z.object({ composedDeckId: z.number() }))
      .query(async ({ ctx, input }) => {
        const deck = await getComposedDeckById(input.composedDeckId);
        if (!deck) throw new TRPCError({ code: "NOT_FOUND" });
        const folder = await getFolderById(deck.folderId);
        if (!folder || folder.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const summary = await getComposedDeckAnalyticsSummary(input.composedDeckId);
        return summary;
      }),

    // Public: record a document view
    recordView: publicProcedure
      .input(
        z.object({
          shareLinkId: z.number(),
          documentId: z.number(),
          sessionId: z.string(),
          referrer: z.string().optional(),
          userAgent: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const ip = (ctx.req.headers["x-forwarded-for"] as string) || (ctx.req.socket as any)?.remoteAddress || "";
        const ua = input.userAgent || ctx.req.headers["user-agent"] || "";
        const visitorHash = crypto.createHash("sha256").update(ip + ua + input.sessionId).digest("hex").slice(0, 16);

        const viewId = await recordDocumentView({
          shareLinkId: input.shareLinkId,
          documentId: input.documentId,
          visitorHash,
          sessionId: input.sessionId,
          referrer: input.referrer,
          userAgent: ua,
        });

        return { viewId, visitorHash };
      }),

    // Public: record a page view within a session
    recordPageView: publicProcedure
      .input(
        z.object({
          viewId: z.number(),
          documentId: z.number(),
          pageNumber: z.number(),
          timeSpentSeconds: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        await recordPageViewEvent({
          viewId: input.viewId,
          documentId: input.documentId,
          pageNumber: input.pageNumber,
          timeSpentSeconds: input.timeSpentSeconds,
        });
        return { success: true };
      }),
  }),
  // ─── Narrations ────────────────────────────────────────────────────────────

  narrations: router({
    /** List all narrations for a document (public — called from viewer).
     *  versionId: null = master/original; number = specific version.
     *  If omitted, defaults to master (null). */
    list: publicProcedure
      .input(z.object({ documentId: z.number(), versionId: z.number().nullable().optional() }))
      .query(async ({ input }) => {
        return getSlideNarrations(input.documentId, input.versionId ?? null);
      }),

    /** Update crop anchor for a saved narration (protected — owner only) */
    updateCrop: protectedProcedure
      .input(z.object({ id: z.number(), documentId: z.number(), cropX: z.number().min(0).max(100), cropY: z.number().min(0).max(100) }))
      .mutation(async ({ input, ctx }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await updateSlideNarrationCrop(input.id, input.cropX, input.cropY);
        return { success: true };
      }),

    /** Delete a narration by ID (protected — owner only) */
    delete: protectedProcedure
      .input(z.object({ id: z.number(), documentId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // Verify ownership via document
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const videoKey = await deleteSlideNarration(input.id);
        // Best-effort S3 cleanup
        if (videoKey) {
          const { storageDelete } = await import("./storage");
          await storageDelete(videoKey).catch(() => {});
        }
        return { success: true };
      }),

    /** Copy master narrations forward to a specific version (protected — owner only).
     *  Only copies slides that do NOT already have a narration in the target version. */
    copyFromMaster: protectedProcedure
      .input(z.object({ documentId: z.number(), targetVersionId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { upsertSlideNarration: _upsert, getSlideNarrations: _get } = await import("./db");
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const masterNarrations = await _get(input.documentId, null);
        const versionNarrations = await _get(input.documentId, input.targetVersionId);
        const versionPageNumbers = new Set(versionNarrations.map((n) => n.pageNumber));
        let copied = 0;
        for (const n of masterNarrations) {
          if (!versionPageNumbers.has(n.pageNumber)) {
            await _upsert({
              documentId: input.documentId,
              pageNumber: n.pageNumber,
              versionId: input.targetVersionId,
              videoUrl: n.videoUrl,
              videoKey: n.videoKey,
              cropX: n.cropX ?? 50,
              cropY: n.cropY ?? 50,
            });
            copied++;
          }
        }
        return { copied };
      }),
  }),

  // ─── Folders ────────────────────────────────────────────────────────────────

  folders: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getFoldersForUser } = await import("./db");
      return getFoldersForUser(ctx.user.id);
    }),

    ensureSystemFolder: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const { ensureSystemFolder } = await import("./db");
      const folder = await ensureSystemFolder(ctx.user.id);
      return folder;
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const folder = await getFolderById(input.id);
        // Allow access if: owner, system folder (all users), or member
        if (!folder) throw new TRPCError({ code: "NOT_FOUND" });
        if (!folder.isSystemFolder && folder.ownerId !== ctx.user.id) {
          // Check membership
          const members = await getFolderMembers(folder.id);
          const isMember = members.some((m) => m.email === ctx.user.email && m.acceptedAt);
          if (!isMember) throw new TRPCError({ code: "NOT_FOUND" });
        }
        const documentIds = await getFolderDocumentIds(folder.id);
        const members = await getFolderMembers(folder.id);
        const decks = await getComposedDecksByFolder(folder.id);
        // Load full document data for each doc in the folder
        const docs = await Promise.all(
          documentIds.map(async (docId) => {
            const doc = await getDocumentById(docId);
            if (!doc) return null;
            // Get active version pages
            let pages;
            if (doc.currentVersion && doc.currentVersion > 1) {
              const versions = await getDocumentVersions(doc.id);
              const activeVersion = versions.find((v) => v.versionNumber === doc.currentVersion && v.status === "ready");
              pages = activeVersion
                ? await getDocumentPagesByVersion(doc.id, activeVersion.id)
                : await getDocumentPagesByVersion(doc.id, null);
            } else {
              pages = await getDocumentPagesByVersion(doc.id, null);
            }
            const subDecks = await getSubDecksByDocument(doc.id);
            return { ...doc, pages, subDecks };
          })
        );
        return {
          ...folder,
          documents: docs.filter(Boolean),
          members,
          decks,
        };
      }),

    create: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(256), description: z.string().max(1000).optional() }))
      .mutation(async ({ ctx, input }) => {
        const id = await createFolder({ ownerId: ctx.user.id, name: input.name, description: input.description ?? null });
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).max(256).optional(), description: z.string().max(1000).nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        const folder = await getFolderById(input.id);
        if (!folder) throw new TRPCError({ code: "NOT_FOUND" });
        if (folder.isSystemFolder && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        if (!folder.isSystemFolder && folder.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const updates: Record<string, unknown> = {};
        if (input.name !== undefined) updates.name = input.name;
        if (input.description !== undefined) updates.description = input.description;
        await updateFolder(input.id, updates as any);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const folder = await getFolderById(input.id);
        if (!folder) throw new TRPCError({ code: "NOT_FOUND" });
        if (folder.isSystemFolder) throw new TRPCError({ code: "FORBIDDEN", message: "Cannot delete a system folder." });
        if (folder.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        await deleteFolder(input.id);
        return { success: true };
      }),

    addDocument: protectedProcedure
      .input(z.object({ folderId: z.number(), documentId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const folder = await getFolderById(input.folderId);
        if (!folder) throw new TRPCError({ code: "NOT_FOUND" });
        if (folder.isSystemFolder && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can add documents to the system folder." });
        if (!folder.isSystemFolder && folder.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        await addDocumentToFolder(input.folderId, input.documentId);
        return { success: true };
      }),

    removeDocument: protectedProcedure
      .input(z.object({ folderId: z.number(), documentId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const folder = await getFolderById(input.folderId);
        if (!folder || folder.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        await removeDocumentFromFolder(input.folderId, input.documentId);
        return { success: true };
      }),

    inviteMember: protectedProcedure
      .input(z.object({ folderId: z.number(), email: z.string().email(), name: z.string().optional(), role: z.enum(["viewer", "editor"]).default("editor") }))
      .mutation(async ({ ctx, input }) => {
        const folder = await getFolderById(input.folderId);
        if (!folder || folder.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const token = nanoid(32);
        await createFolderMember({
          folderId: input.folderId,
          email: input.email,
          name: input.name ?? null,
          token,
          role: input.role,
        });
        // Send invite notification (best-effort)
        const { notifyOwner } = await import("./_core/notification");
        const inviteUrl = `${process.env.VITE_OAUTH_PORTAL_URL ? "" : ""}/join/${token}`;
        await notifyOwner({
          title: `Team invite sent to ${input.email}`,
          content: `Invite link for ${folder.name}: ${inviteUrl}\n\nToken: ${token}`,
        }).catch(() => {});
        return { token, success: true };
      }),

    removeMember: protectedProcedure
      .input(z.object({ folderId: z.number(), memberId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const folder = await getFolderById(input.folderId);
        if (!folder || folder.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        await deleteFolderMember(input.memberId);
        return { success: true };
      }),

    // Public: accept invite by token, returns folder info + sets member session
    acceptInvite: publicProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const member = await acceptFolderInvite(input.token);
        if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid or expired invite link" });
        const folder = await getFolderById(member.folderId);
        if (!folder) throw new TRPCError({ code: "NOT_FOUND" });
        // Set a member session cookie (JWT with memberId + folderId)
        const jwt = await import("jsonwebtoken");
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Server misconfiguration: JWT_SECRET not set" });
        const sessionToken = jwt.default.sign(
          { memberId: member.id, folderId: member.folderId, email: member.email, role: member.role },
          secret,
          { expiresIn: "30d" }
        );
        const { getSessionCookieOptions } = await import("./_core/cookies");
        ctx.res.cookie("folder_session", sessionToken, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: 30 * 24 * 60 * 60 * 1000,
        });
        return { success: true, folderId: folder.id, folderName: folder.name, memberName: member.name, role: member.role };
      }),

    // ─── Folder Sections ──────────────────────────────────────────────────────
    listSections: protectedProcedure
      .input(z.object({ folderId: z.number() }))
      .query(async ({ ctx, input }) => {
        const folder = await getFolderById(input.folderId);
        if (!folder) throw new TRPCError({ code: "NOT_FOUND" });
        if (!folder.isSystemFolder && folder.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const { getFolderSections } = await import("./db");
        return getFolderSections(input.folderId);
      }),

    createSection: protectedProcedure
      .input(z.object({ folderId: z.number(), name: z.string().min(1).max(256) }))
      .mutation(async ({ ctx, input }) => {
        const folder = await getFolderById(input.folderId);
        if (!folder) throw new TRPCError({ code: "NOT_FOUND" });
        if (folder.isSystemFolder && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        if (!folder.isSystemFolder && folder.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const { createFolderSection, getFolderSections } = await import("./db");
        const sections = await getFolderSections(input.folderId);
        const position = sections.length;
        const id = await createFolderSection({ folderId: input.folderId, name: input.name, position });
        return { id };
      }),

    deleteSection: protectedProcedure
      .input(z.object({ sectionId: z.number(), folderId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const folder = await getFolderById(input.folderId);
        if (!folder) throw new TRPCError({ code: "NOT_FOUND" });
        if (folder.isSystemFolder && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        if (!folder.isSystemFolder && folder.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const { deleteFolderSection } = await import("./db");
        await deleteFolderSection(input.sectionId);
        return { success: true };
      }),

    renameSection: protectedProcedure
      .input(z.object({ sectionId: z.number(), folderId: z.number(), name: z.string().min(1).max(256) }))
      .mutation(async ({ ctx, input }) => {
        const folder = await getFolderById(input.folderId);
        if (!folder) throw new TRPCError({ code: "NOT_FOUND" });
        if (folder.isSystemFolder && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        if (!folder.isSystemFolder && folder.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const { renameFolderSection } = await import("./db");
        await renameFolderSection(input.sectionId, input.name);
        return { success: true };
      }),

    // Get current folder member session (for team members who accepted invite)
    memberSession: publicProcedure.query(async ({ ctx }) => {
      const cookie = ctx.req.cookies?.folder_session;
      if (!cookie) return null;
      try {
        const jwt = await import("jsonwebtoken");
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Server misconfiguration: JWT_SECRET not set" });
        const payload = jwt.default.verify(cookie, secret) as any;
        const member = await getFolderMemberById(payload.memberId);
        if (!member) return null;
        return { memberId: member.id, folderId: member.folderId, email: member.email, name: member.name, role: member.role };
      } catch {
        return null;
      }
    }),
  }),

  // ─── Narration Assets ────────────────────────────────────────────────────────

  narrationAssets: router({
    list: protectedProcedure
      .input(z.object({ folderId: z.number() }))
      .query(async ({ ctx, input }) => {
        const folder = await getFolderById(input.folderId);
        if (!folder || folder.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        return getNarrationAssetsByFolder(input.folderId);
      }),

    recommendations: protectedProcedure
      .input(z.object({ folderId: z.number(), documentId: z.number(), pageNumber: z.number() }))
      .query(async ({ ctx, input }) => {
        const folder = await getFolderById(input.folderId);
        if (!folder || folder.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        return getNarrationAssetsBySlide(input.folderId, input.documentId, input.pageNumber);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number(), folderId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const folder = await getFolderById(input.folderId);
        if (!folder || folder.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const videoKey = await deleteNarrationAsset(input.id);
        if (videoKey) {
          const { storageDelete } = await import("./storage");
          await storageDelete(videoKey).catch(() => {});
        }
        return { success: true };
      }),
  }),

  // ─── Composed Decks ──────────────────────────────────────────────────────────

  composedDecks: router({
    list: protectedProcedure
      .input(z.object({ folderId: z.number() }))
      .query(async ({ ctx, input }) => {
        const folder = await getFolderById(input.folderId);
        if (!folder || folder.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        return getComposedDecksByFolder(input.folderId);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const deck = await getComposedDeckById(input.id);
        if (!deck) throw new TRPCError({ code: "NOT_FOUND" });
        const folder = await getFolderById(deck.folderId);
        if (!folder || folder.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const slots = await getComposedDeckSlots(deck.id);
        // Resolve each slot's page thumbnail
        const resolvedSlots = await Promise.all(
          slots.map(async (slot) => {
            const { getDocumentPageById } = await import("./db");
            const page = await getDocumentPageById(slot.documentPageId);
            return { ...slot, page: page ?? null };
          })
        );
        return { ...deck, slots: resolvedSlots };
      }),

    create: protectedProcedure
      .input(z.object({ folderId: z.number(), name: z.string().min(1).max(256), description: z.string().max(1000).optional() }))
      .mutation(async ({ ctx, input }) => {
        const folder = await getFolderById(input.folderId);
        if (!folder || folder.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const id = await createComposedDeck({
          folderId: input.folderId,
          createdByUserId: ctx.user.id,
          name: input.name,
          description: input.description ?? null,
        });
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).max(256).optional(), description: z.string().max(1000).nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        const deck = await getComposedDeckById(input.id);
        if (!deck) throw new TRPCError({ code: "NOT_FOUND" });
        const folder = await getFolderById(deck.folderId);
        if (!folder || folder.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const updates: Record<string, unknown> = {};
        if (input.name !== undefined) updates.name = input.name;
        if (input.description !== undefined) updates.description = input.description;
        await updateComposedDeck(input.id, updates as any);
        return { success: true };
      }),

    saveSlots: protectedProcedure
      .input(z.object({
        deckId: z.number(),
        slots: z.array(z.object({
          position: z.number(),
          documentPageId: z.number(),
          narrationAssetId: z.number().nullable().optional(),
          customNarrationUrl: z.string().nullable().optional(),
          customNarrationKey: z.string().nullable().optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const deck = await getComposedDeckById(input.deckId);
        if (!deck) throw new TRPCError({ code: "NOT_FOUND" });
        const folder = await getFolderById(deck.folderId);
        if (!folder || folder.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        await saveComposedDeckSlots(
          input.deckId,
          input.slots.map((s) => ({
            deckId: input.deckId,
            position: s.position,
            documentPageId: s.documentPageId,
            narrationAssetId: s.narrationAssetId ?? null,
            customNarrationUrl: s.customNarrationUrl ?? null,
            customNarrationKey: s.customNarrationKey ?? null,
          }))
        );
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const deck = await getComposedDeckById(input.id);
        if (!deck) throw new TRPCError({ code: "NOT_FOUND" });
        const folder = await getFolderById(deck.folderId);
        if (!folder || folder.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        await deleteComposedDeck(input.id);
        return { success: true };
      }),
  }),

  // ─── Sub-Decks ─────────────────────────────────────────────────────────────
  subDecks: router({
    // List all sub-decks for a document
    list: protectedProcedure
      .input(z.object({ documentId: z.number() }))
      .query(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        return getSubDecksByDocument(input.documentId);
      }),

    // Get a single sub-deck with its slides
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const deck = await getSubDeckById(input.id);
        if (!deck) throw new TRPCError({ code: "NOT_FOUND" });
        const doc = await getDocumentById(deck.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const slides = await getSubDeckSlides(input.id);
        return { ...deck, slides };
      }),

    // Create a new sub-deck (starts empty — caller saves slides separately)
    create: protectedProcedure
      .input(z.object({
        documentId: z.number(),
        name: z.string().min(1).max(256),
        description: z.string().max(1000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const id = await createSubDeck({
          documentId: input.documentId,
          name: input.name,
          description: input.description,
          createdByUserId: ctx.user.id,
        });
        return { id };
      }),

    // Update name / description
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(256).optional(),
        description: z.string().max(1000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const deck = await getSubDeckById(input.id);
        if (!deck) throw new TRPCError({ code: "NOT_FOUND" });
        const doc = await getDocumentById(deck.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        await updateSubDeck(input.id, { name: input.name, description: input.description });
        return { success: true };
      }),

    // Save (replace) all slides for a sub-deck
    saveSlides: protectedProcedure
      .input(z.object({
        subDeckId: z.number(),
        slides: z.array(z.object({
          documentPageId: z.number(),
          position: z.number(),
          isVisible: z.boolean(),
          narrationOverrideUrl: z.string().nullable().optional(),
          narrationOverrideKey: z.string().nullable().optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const deck = await getSubDeckById(input.subDeckId);
        if (!deck) throw new TRPCError({ code: "NOT_FOUND" });
        const doc = await getDocumentById(deck.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        await saveSubDeckSlides(input.subDeckId, input.slides);
        return { success: true };
      }),

    // Delete a sub-deck and all its slides
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const deck = await getSubDeckById(input.id);
        if (!deck) throw new TRPCError({ code: "NOT_FOUND" });
        const doc = await getDocumentById(deck.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        await deleteSubDeck(input.id);
        return { success: true };
      }),
  }),

  // ─── Media Library ────────────────────────────────────────────────────────────
  mediaLibrary: router({
    // List all media library items for the current user
    list: protectedProcedure
      .input(z.object({ type: z.enum(["narration", "video"]).optional() }))
      .query(async ({ ctx, input }) => {
        const { getMediaLibraryByUser } = await import("./db");
        return getMediaLibraryByUser(ctx.user.id, input.type);
      }),

    // Add a narration from the media library to a specific slide of a document
    addNarrationFromLibrary: protectedProcedure
      .input(z.object({
        documentId: z.number(),
        pageNumber: z.number(),
        mediaLibraryItemId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const { attachNarrationToSlide } = await import("./db");
        await attachNarrationToSlide(input.documentId, input.pageNumber, input.mediaLibraryItemId);
        return { success: true };
      }),

    // Add a new version to an existing media library narration item
    addVersion: protectedProcedure
      .input(z.object({
        mediaLibraryId: z.number(),
        videoUrl: z.string(),
        videoKey: z.string(),
        durationSeconds: z.number().optional(),
        fileSizeBytes: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { addNarrationVersion } = await import("./db");
        const version = await addNarrationVersion(
          input.mediaLibraryId,
          ctx.user.id,
          {
            videoUrl: input.videoUrl,
            videoKey: input.videoKey,
            durationSeconds: input.durationSeconds,
            fileSizeBytes: input.fileSizeBytes,
          }
        );
        return version;
      }),

    // Get version history for a media library narration item
    getVersions: protectedProcedure
      .input(z.object({ mediaLibraryId: z.number() }))
      .query(async ({ ctx, input }) => {
        const { getNarrationVersions, getMediaLibraryByUser } = await import("./db");
        // Verify ownership
        const items = await getMediaLibraryByUser(ctx.user.id);
        const item = items.find((i) => i.id === input.mediaLibraryId);
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        return getNarrationVersions(input.mediaLibraryId);
      }),

    // Get all slides that use a specific media library narration item
    getUsages: protectedProcedure
      .input(z.object({ mediaLibraryId: z.number() }))
      .query(async ({ ctx, input }) => {
        const { getNarrationUsages, getMediaLibraryByUser } = await import("./db");
        const items = await getMediaLibraryByUser(ctx.user.id);
        const item = items.find((i) => i.id === input.mediaLibraryId);
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        return getNarrationUsages(input.mediaLibraryId);
      }),

    // Detach a slide_narration from the library (makes it independent)
    detachFromSlide: protectedProcedure
      .input(z.object({ slideNarrationId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { detachNarrationFromSlide } = await import("./db");
        await detachNarrationFromSlide(input.slideNarrationId);
        return { success: true };
      }),

    // Rollback a library narration to a previous version
    rollbackToVersion: protectedProcedure
      .input(z.object({
        mediaLibraryId: z.number(),
        versionId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { rollbackNarrationToVersion } = await import("./db");
        await rollbackNarrationToVersion(input.mediaLibraryId, ctx.user.id, input.versionId);
        return { success: true };
      }),

    // Delete a media library item
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { deleteMediaLibraryItem } = await import("./db");
        await deleteMediaLibraryItem(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // ─── Slide Tags ─────────────────────────────────────────────────────────────────────
  slideTags: router({
    // Get all tags for a document
    list: protectedProcedure
      .input(z.object({ documentId: z.number() }))
      .query(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const { getSlideTagsByDocument } = await import("./db");
        return getSlideTagsByDocument(input.documentId);
      }),

    // Toggle PRESENT tag on a slide
    toggle: protectedProcedure
      .input(z.object({
        documentId: z.number(),
        documentPageId: z.number(),
        tag: z.enum(["present"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc || doc.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        const { toggleSlideTag } = await import("./db");
        const result = await toggleSlideTag(input.documentId, input.documentPageId, input.tag);
        return result; // { added: boolean }
      }),
  }),

  // ─── Admin ─────────────────────────────────────────────────────────────────
  admin: router({
    // List all users with document counts (admin only)
    listUsers: adminProcedure.query(async () => {
      const { getAllUsersWithDocumentCount } = await import("./db");
      return getAllUsersWithDocumentCount();
    }),

    // Update a user's role (admin only)
    updateRole: adminProcedure
      .input(z.object({ userId: z.number(), role: z.enum(["admin", "user"]) }))
      .mutation(async ({ input }) => {
        const { updateUserRole } = await import("./db");
        await updateUserRole(input.userId, input.role);
        return { success: true };
      }),
  }),
});
export type AppRouter = typeof appRouter;
