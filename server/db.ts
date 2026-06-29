import { eq, desc, and, or, sql, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  documents,
  documentPages,
  documentVersions,
  shareLinks,
  analyticsEvents,
  slideNarrations,
  videoSlides,
  type InsertDocument,
  type InsertDocumentPage,
  type InsertShareLink,
  type InsertAnalyticsEvent,
  type InsertDocumentVersion,
  type SlideConfigEntry,
  type InsertSlideNarration,
  type SlideNarration,
  type VideoSlide,
  type InsertVideoSlide,
  type VideoControlsConfig,
  authTokens,
  type InsertAuthToken,
  mediaLibrary,
  type InsertMediaLibraryItem,
  slideTags,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  // Admin emails loaded from ADMIN_EMAILS env var (comma-separated).
  // Example: ADMIN_EMAILS="alice@example.com,bob@example.com"
  const ADMIN_EMAILS = (ENV.adminEmails || "")
    .split(",")
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);

  const values: InsertUser = { openId: user.openId };
  // updateSet: only update fields that should change on subsequent sign-ins
  // name is NOT in updateSet — it is only set on first insert to preserve user-set names
  const updateSet: Record<string, unknown> = {};

  // email and loginMethod go into both insert values and update set
  for (const field of ["email", "loginMethod"] as const) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }

  // name only goes into insert values (not updateSet) so it is never overwritten
  if (user.name !== undefined) {
    values.name = user.name ?? null;
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }

  // Role: explicit > pre-approved admin list > ownerOpenId > default
  const email = user.email ?? user.openId;
  const isPreApprovedAdmin = ADMIN_EMAILS.includes(email.toLowerCase());
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (isPreApprovedAdmin || user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

// ─── Documents ────────────────────────────────────────────────────────────────

export async function createDocument(data: InsertDocument) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(documents).values(data);
  return result[0];
}

export async function getDocumentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return result[0];
}

export async function getDocumentsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documents).where(eq(documents.userId, userId)).orderBy(desc(documents.createdAt));
}

export async function updateDocumentStatus(
  id: number,
  status: "processing" | "ready" | "error",
  pageCount?: number
) {
  const db = await getDb();
  if (!db) return;
  const updates: Record<string, unknown> = { status };
  if (pageCount !== undefined) updates.pageCount = pageCount;
  await db.update(documents).set(updates).where(eq(documents.id, id));
}

export async function deleteDocument(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(analyticsEvents).where(eq(analyticsEvents.documentId, id));
  await db.delete(shareLinks).where(eq(shareLinks.documentId, id));
  await db.delete(documentPages).where(eq(documentPages.documentId, id));
  await db.delete(documents).where(eq(documents.id, id));
}

// ─── Document Pages ───────────────────────────────────────────────────────────

export async function createDocumentPage(data: InsertDocumentPage) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(documentPages).values(data);
}

export async function deleteDocumentPagesByDocumentId(documentId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(documentPages).where(eq(documentPages.documentId, documentId));
}
export async function getDocumentPages(documentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(documentPages)
    .where(eq(documentPages.documentId, documentId))
    .orderBy(documentPages.pageNumber);
}

// ─── Share Links ──────────────────────────────────────────────────────────────

export async function createShareLink(data: InsertShareLink) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(shareLinks).values(data);
}

export async function getShareLinkBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(shareLinks).where(eq(shareLinks.slug, slug)).limit(1);
  return result[0];
}

export async function getShareLinksByDocumentId(documentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(shareLinks).where(eq(shareLinks.documentId, documentId)).orderBy(desc(shareLinks.createdAt));
}

export async function getShareLinksByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(shareLinks).where(eq(shareLinks.userId, userId)).orderBy(desc(shareLinks.createdAt));
}

export async function updateShareLink(
  id: number,
  data: Partial<{
    isEnabled: boolean;
    password: string | null;
    expiresAt: Date | null;
    ogPreviewPageNumber: number;
    ogTitle: string | null;
    ogDescription: string | null;
    slug: string;
    label: string | null;
    slideConfig: SlideConfigEntry[] | null;
  }>
) {
  const db = await getDb();
  if (!db) return;
  await db.update(shareLinks).set(data).where(eq(shareLinks.id, id));
}

export async function deleteShareLink(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(analyticsEvents).where(eq(analyticsEvents.shareLinkId, id));
  await db.delete(shareLinks).where(eq(shareLinks.id, id));
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function recordAnalyticsEvent(data: InsertAnalyticsEvent) {
  const db = await getDb();
  if (!db) return;
  await db.insert(analyticsEvents).values(data);
}

export async function getAnalyticsSummary(shareLinkId: number) {
  const db = await getDb();
  if (!db) return { totalViews: 0, uniqueVisitors: 0, totalTimeSpent: 0 };

  const [views] = await db
    .select({ count: sql<number>`count(*)` })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.shareLinkId, shareLinkId), eq(analyticsEvents.eventType, "view")));

  const [uniq] = await db
    .select({ count: sql<number>`count(distinct visitorHash)` })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.shareLinkId, shareLinkId), eq(analyticsEvents.eventType, "view")));

  const [time] = await db
    .select({ total: sql<number>`coalesce(sum(secondsSpent), 0)` })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.shareLinkId, shareLinkId), eq(analyticsEvents.eventType, "time_spent")));

  return {
    totalViews: Number(views?.count ?? 0),
    uniqueVisitors: Number(uniq?.count ?? 0),
    totalTimeSpent: Number(time?.total ?? 0),
  };
}

export async function getDocumentAnalyticsSummary(documentId: number) {
  const db = await getDb();
  if (!db) return { totalViews: 0, uniqueVisitors: 0, totalTimeSpent: 0 };

  const [views] = await db
    .select({ count: sql<number>`count(*)` })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.documentId, documentId), eq(analyticsEvents.eventType, "view")));

  const [uniq] = await db
    .select({ count: sql<number>`count(distinct visitorHash)` })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.documentId, documentId), eq(analyticsEvents.eventType, "view")));

  const [time] = await db
    .select({ total: sql<number>`coalesce(sum(secondsSpent), 0)` })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.documentId, documentId), eq(analyticsEvents.eventType, "time_spent")));

  return {
    totalViews: Number(views?.count ?? 0),
    uniqueVisitors: Number(uniq?.count ?? 0),
    totalTimeSpent: Number(time?.total ?? 0),
  };
}

export async function getPageEngagement(documentId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      pageNumber: analyticsEvents.pageNumber,
      views: sql<number>`count(*)`,
    })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.documentId, documentId), eq(analyticsEvents.eventType, "page_view")))
    .groupBy(analyticsEvents.pageNumber)
    .orderBy(analyticsEvents.pageNumber);
}

export async function getSubDeckAnalyticsSummary(subDeckId: number) {
  const db = await getDb();
  if (!db) return { totalViews: 0, uniqueVisitors: 0, totalTimeSpent: 0 };
  // Get all share link IDs for this sub-deck
  const links = await db
    .select({ id: shareLinks.id })
    .from(shareLinks)
    .where(eq(shareLinks.subDeckId, subDeckId));
  if (links.length === 0) return { totalViews: 0, uniqueVisitors: 0, totalTimeSpent: 0 };
  const linkIds = links.map((l) => l.id);
  const [views] = await db
    .select({ count: sql<number>`count(*)` })
    .from(analyticsEvents)
    .where(and(inArray(analyticsEvents.shareLinkId, linkIds), eq(analyticsEvents.eventType, "view")));
  const [uniq] = await db
    .select({ count: sql<number>`count(distinct visitorHash)` })
    .from(analyticsEvents)
    .where(and(inArray(analyticsEvents.shareLinkId, linkIds), eq(analyticsEvents.eventType, "view")));
  const [time] = await db
    .select({ total: sql<number>`coalesce(sum(secondsSpent), 0)` })
    .from(analyticsEvents)
    .where(and(inArray(analyticsEvents.shareLinkId, linkIds), eq(analyticsEvents.eventType, "time_spent")));
  return {
    totalViews: Number(views?.count ?? 0),
    uniqueVisitors: Number(uniq?.count ?? 0),
    totalTimeSpent: Number(time?.total ?? 0),
  };
}

export async function getSubDeckPageEngagement(subDeckId: number) {
  const db = await getDb();
  if (!db) return [];
  const links = await db
    .select({ id: shareLinks.id })
    .from(shareLinks)
    .where(eq(shareLinks.subDeckId, subDeckId));
  if (links.length === 0) return [];
  const linkIds = links.map((l) => l.id);
  return db
    .select({
      pageNumber: analyticsEvents.pageNumber,
      views: sql<number>`count(*)`,
    })
    .from(analyticsEvents)
    .where(and(inArray(analyticsEvents.shareLinkId, linkIds), eq(analyticsEvents.eventType, "page_view")))
    .groupBy(analyticsEvents.pageNumber)
    .orderBy(analyticsEvents.pageNumber);
}

export async function getRecentActivity(documentId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(analyticsEvents)
    .where(eq(analyticsEvents.documentId, documentId))
    .orderBy(desc(analyticsEvents.createdAt))
    .limit(limit);
}

// ─── Extended Analytics Helpers ───────────────────────────────────────────────

/** Record a full document view session — returns a synthetic view ID (the event row id) */
export async function recordDocumentView(data: {
  shareLinkId: number;
  documentId: number;
  visitorHash: string;
  sessionId: string;
  referrer?: string;
  userAgent?: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(analyticsEvents).values({
    shareLinkId: data.shareLinkId,
    documentId: data.documentId,
    visitorHash: data.visitorHash,
    eventType: "view",
  });
  // Increment viewCount on share link
  await db
    .update(shareLinks)
    .set({ viewCount: sql`viewCount + 1` })
    .where(eq(shareLinks.id, data.shareLinkId));
  return (result[0] as any).insertId ?? 0;
}

/** Record a page view within a session */
export async function recordPageViewEvent(data: {
  viewId: number;
  documentId: number;
  pageNumber: number;
  timeSpentSeconds: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Find the share link from the view event
  const viewEvent = await db
    .select()
    .from(analyticsEvents)
    .where(eq(analyticsEvents.id, data.viewId))
    .limit(1);
  if (!viewEvent[0]) return;

  await db.insert(analyticsEvents).values({
    shareLinkId: viewEvent[0].shareLinkId,
    documentId: data.documentId,
    visitorHash: viewEvent[0].visitorHash,
    eventType: "page_view",
    pageNumber: data.pageNumber,
    secondsSpent: data.timeSpentSeconds,
  });
}

// ─── Document Versions ───────────────────────────────────────────────────────

export async function createDocumentVersion(data: InsertDocumentVersion) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(documentVersions).values(data);
  return result[0];
}

export async function getDocumentVersions(documentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(desc(documentVersions.versionNumber));
}

export async function updateDocumentVersionStatus(
  id: number,
  status: "processing" | "ready" | "error",
  pageCount?: number
) {
  const db = await getDb();
  if (!db) return;
  const updates: Record<string, unknown> = { status };
  if (pageCount !== undefined) updates.pageCount = pageCount;
  await db.update(documentVersions).set(updates).where(eq(documentVersions.id, id));
}

export async function getDocumentPagesByVersion(documentId: number, versionId: number | null) {
  const db = await getDb();
  if (!db) return [];
  if (versionId === null) {
    // Original pages (no versionId)
    return db
      .select()
      .from(documentPages)
      .where(and(eq(documentPages.documentId, documentId), sql`versionId IS NULL`))
      .orderBy(documentPages.pageNumber);
  }
  return db
    .select()
    .from(documentPages)
    .where(and(eq(documentPages.documentId, documentId), eq(documentPages.versionId, versionId)))
    .orderBy(documentPages.pageNumber);
}

export async function promoteDocumentVersion(
  documentId: number,
  versionNumber: number,
  pageCount: number
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(documents)
    .set({ currentVersion: versionNumber, pageCount, status: "ready" })
    .where(eq(documents.id, documentId));
}

// ─── Slide Narrations ────────────────────────────────────────────────────────

/** Upsert a narration record for a specific page (one per documentId + pageNumber) */
export async function upsertSlideNarration(
  data: InsertSlideNarration
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Delete existing narration for this exact (documentId, pageNumber, versionId) combination
  // versionId null = master/original; versioned uploads have a non-null versionId
  const versionFilter = data.versionId != null
    ? eq(slideNarrations.versionId, data.versionId)
    : sql`versionId IS NULL`;
  await db
    .delete(slideNarrations)
    .where(
      and(
        eq(slideNarrations.documentId, data.documentId),
        eq(slideNarrations.pageNumber, data.pageNumber),
        versionFilter
      )
    );
  await db.insert(slideNarrations).values(data);
}

/** Update only the crop anchor for an existing narration */
export async function updateSlideNarrationCrop(
  id: number,
  cropX: number,
  cropY: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(slideNarrations)
    .set({ cropX, cropY })
    .where(eq(slideNarrations.id, id));
}

/** Get narrations for a document scoped to a specific version (null = master/original) */
export async function getSlideNarrations(documentId: number, versionId?: number | null): Promise<SlideNarration[]> {
  const db = await getDb();
  if (!db) return [];
  // Narrations with versionId IS NULL are "master" narrations recorded before version scoping
  // was introduced. They must always be visible regardless of which version is active.
  // When a specific versionId is provided, return narrations for that version OR the master (null).
  // When no versionId is provided, return only master narrations.
  const versionFilter = (versionId != null)
    ? or(eq(slideNarrations.versionId, versionId), sql`${slideNarrations.versionId} IS NULL`)
    : sql`${slideNarrations.versionId} IS NULL`;
  return db
    .select()
    .from(slideNarrations)
    .where(and(eq(slideNarrations.documentId, documentId), versionFilter))
    .orderBy(slideNarrations.pageNumber);
}

/** Delete a narration by its ID; returns the videoKey for S3 cleanup */
export async function deleteSlideNarration(id: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select({ videoKey: slideNarrations.videoKey }).from(slideNarrations).where(eq(slideNarrations.id, id));
  await db.delete(slideNarrations).where(eq(slideNarrations.id, id));
  return row?.videoKey ?? null;
}

// ─── Video Slides ─────────────────────────────────────────────────────────────

/** Upsert a video slide for a specific page (one per documentId + pageNumber) */
export async function upsertVideoSlide(data: InsertVideoSlide): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(videoSlides)
    .where(and(eq(videoSlides.documentId, data.documentId), eq(videoSlides.pageNumber, data.pageNumber)));
  await db.insert(videoSlides).values(data);
}

/** Get all video slides for a document, ordered by pageNumber */
export async function getVideoSlides(documentId: number, _versionId?: number | null): Promise<VideoSlide[]> {
  // video_slides table has no versionId column yet — all video slides are shared across versions.
  // The _versionId parameter is accepted for API compatibility but not yet used as a filter.
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(videoSlides)
    .where(eq(videoSlides.documentId, documentId))
    .orderBy(videoSlides.pageNumber);
}

/** Delete a video slide by ID; returns the videoKey for S3 cleanup */
export async function deleteVideoSlide(id: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select({ videoKey: videoSlides.videoKey }).from(videoSlides).where(eq(videoSlides.id, id));
  await db.delete(videoSlides).where(eq(videoSlides.id, id));
  return row?.videoKey ?? null;
}

export type { VideoSlide, VideoControlsConfig };

/** Get avg time per page for analytics */
export async function getAvgTimeOnDocument(documentId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [result] = await db
    .select({ avg: sql<number>`coalesce(avg(secondsSpent), 0)` })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.documentId, documentId), eq(analyticsEvents.eventType, "time_spent")));
  return Number(result?.avg ?? 0);
}

// ─── Folders ──────────────────────────────────────────────────────────────────

import {
  folders,
  folderDocuments,
  folderMembers,
  narrationAssets,
  composedDecks,
  composedDeckSlots,
  subDecks,
  subDeckSlides,
  type Folder,
  type InsertFolder,
  type FolderDocument,
  type InsertFolderDocument,
  type FolderMember,
  type InsertFolderMember,
  type NarrationAsset,
  type InsertNarrationAsset,
  type ComposedDeck,
  type InsertComposedDeck,
  type ComposedDeckSlot,
  type InsertComposedDeckSlot,
  type SubDeck,
  type SubDeckSlide,
} from "../drizzle/schema";

export async function createFolder(data: InsertFolder): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(folders).values(data);
  return (result[0] as any).insertId;
}

export async function getFoldersByOwner(ownerId: number): Promise<Folder[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(folders).where(eq(folders.ownerId, ownerId)).orderBy(desc(folders.createdAt));
}

export async function getFolderById(id: number): Promise<Folder | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(folders).where(eq(folders.id, id)).limit(1);
  return result[0];
}

export async function updateFolder(id: number, data: Partial<{ name: string; description: string | null }>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(folders).set(data).where(eq(folders.id, id));
}

export async function deleteFolder(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Delete in dependency order
  const deckRows = await db.select({ id: composedDecks.id }).from(composedDecks).where(eq(composedDecks.folderId, id));
  for (const deck of deckRows) {
    await db.delete(composedDeckSlots).where(eq(composedDeckSlots.deckId, deck.id));
  }
  await db.delete(composedDecks).where(eq(composedDecks.folderId, id));
  await db.delete(narrationAssets).where(eq(narrationAssets.folderId, id));
  await db.delete(folderMembers).where(eq(folderMembers.folderId, id));
  await db.delete(folderDocuments).where(eq(folderDocuments.folderId, id));
  await db.delete(folders).where(eq(folders.id, id));
}

// ─── Folder Documents ─────────────────────────────────────────────────────────

export async function addDocumentToFolder(folderId: number, documentId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Avoid duplicates
  const existing = await db.select().from(folderDocuments)
    .where(and(eq(folderDocuments.folderId, folderId), eq(folderDocuments.documentId, documentId)))
    .limit(1);
  if (existing.length > 0) return;
  await db.insert(folderDocuments).values({ folderId, documentId });
}

export async function removeDocumentFromFolder(folderId: number, documentId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(folderDocuments).where(
    and(eq(folderDocuments.folderId, folderId), eq(folderDocuments.documentId, documentId))
  );
}

export async function getFolderDocumentIds(folderId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ documentId: folderDocuments.documentId })
    .from(folderDocuments).where(eq(folderDocuments.folderId, folderId));
  return rows.map((r) => r.documentId);
}

// ─── Folder Members ───────────────────────────────────────────────────────────

export async function createFolderMember(data: InsertFolderMember): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(folderMembers).values(data);
  return (result[0] as any).insertId;
}

export async function getFolderMemberByToken(token: string): Promise<FolderMember | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(folderMembers).where(eq(folderMembers.token, token)).limit(1);
  return result[0];
}

export async function getFolderMemberById(id: number): Promise<FolderMember | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(folderMembers).where(eq(folderMembers.id, id)).limit(1);
  return result[0];
}

export async function getFolderMembers(folderId: number): Promise<FolderMember[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(folderMembers).where(eq(folderMembers.folderId, folderId)).orderBy(folderMembers.createdAt);
}

export async function acceptFolderInvite(token: string): Promise<FolderMember | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const member = await getFolderMemberByToken(token);
  if (!member) return undefined;
  if (!member.acceptedAt) {
    await db.update(folderMembers).set({ acceptedAt: new Date() }).where(eq(folderMembers.token, token));
  }
  return { ...member, acceptedAt: member.acceptedAt ?? new Date() };
}

export async function deleteFolderMember(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(folderMembers).where(eq(folderMembers.id, id));
}

// ─── Narration Assets ─────────────────────────────────────────────────────────

export async function createNarrationAsset(data: InsertNarrationAsset): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(narrationAssets).values(data);
  return (result[0] as any).insertId;
}

export async function getNarrationAssetsByFolder(folderId: number): Promise<NarrationAsset[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(narrationAssets).where(eq(narrationAssets.folderId, folderId)).orderBy(desc(narrationAssets.createdAt));
}

export async function getNarrationAssetsBySlide(folderId: number, documentId: number, pageNumber: number): Promise<NarrationAsset[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(narrationAssets).where(
    and(
      eq(narrationAssets.folderId, folderId),
      eq(narrationAssets.documentId, documentId),
      eq(narrationAssets.pageNumber, pageNumber)
    )
  );
}

export async function deleteNarrationAsset(id: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select({ videoKey: narrationAssets.videoKey }).from(narrationAssets).where(eq(narrationAssets.id, id));
  await db.delete(narrationAssets).where(eq(narrationAssets.id, id));
  return row?.videoKey ?? null;
}

// ─── Composed Decks ───────────────────────────────────────────────────────────

export async function createComposedDeck(data: InsertComposedDeck): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(composedDecks).values(data);
  return (result[0] as any).insertId;
}

export async function getComposedDeckById(id: number): Promise<ComposedDeck | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(composedDecks).where(eq(composedDecks.id, id)).limit(1);
  return result[0];
}

export async function getComposedDecksByFolder(folderId: number): Promise<ComposedDeck[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(composedDecks).where(eq(composedDecks.folderId, folderId)).orderBy(desc(composedDecks.createdAt));
}

export async function updateComposedDeck(id: number, data: Partial<{ name: string; description: string | null }>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(composedDecks).set(data).where(eq(composedDecks.id, id));
}

export async function deleteComposedDeck(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(composedDeckSlots).where(eq(composedDeckSlots.deckId, id));
  await db.delete(composedDecks).where(eq(composedDecks.id, id));
}

// ─── Composed Deck Slots ──────────────────────────────────────────────────────

export async function saveComposedDeckSlots(deckId: number, slots: InsertComposedDeckSlot[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Replace all slots atomically
  await db.delete(composedDeckSlots).where(eq(composedDeckSlots.deckId, deckId));
  if (slots.length > 0) {
    await db.insert(composedDeckSlots).values(slots);
  }
}

export async function getComposedDeckSlots(deckId: number): Promise<ComposedDeckSlot[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(composedDeckSlots).where(eq(composedDeckSlots.deckId, deckId)).orderBy(composedDeckSlots.position);
}

export type {
  Folder, InsertFolder,
  FolderDocument, InsertFolderDocument,
  FolderMember, InsertFolderMember,
  NarrationAsset, InsertNarrationAsset,
  ComposedDeck, InsertComposedDeck,
  ComposedDeckSlot, InsertComposedDeckSlot,
};

// ─── Additional helpers needed by routers ────────────────────────────────────

export async function getDocumentPageById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(documentPages).where(eq(documentPages.id, id)).limit(1);
  return result[0];
}

export async function getNarrationAssetById(id: number): Promise<NarrationAsset | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(narrationAssets).where(eq(narrationAssets.id, id)).limit(1);
  return result[0];
}

// ─── Sub-Decks ────────────────────────────────────────────────────────────────
export async function createSubDeck(data: {
  documentId: number;
  name: string;
  description?: string;
  createdByUserId: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(subDecks).values({
    documentId: data.documentId,
    name: data.name,
    description: data.description ?? null,
    createdByUserId: data.createdByUserId,
  });
  return (result[0] as any).insertId;
}
export async function getSubDecksByDocument(documentId: number): Promise<SubDeck[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(subDecks).where(eq(subDecks.documentId, documentId)).orderBy(subDecks.createdAt);
}
export async function getSubDeckById(id: number): Promise<SubDeck | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(subDecks).where(eq(subDecks.id, id));
  return rows[0] ?? null;
}
export async function updateSubDeck(id: number, data: { name?: string; description?: string }) {
  const db = await getDb();
  if (!db) return;
  await db.update(subDecks).set(data).where(eq(subDecks.id, id));
}
export async function deleteSubDeck(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(subDeckSlides).where(eq(subDeckSlides.subDeckId, id));
  await db.delete(subDecks).where(eq(subDecks.id, id));
}
export async function saveSubDeckSlides(
  subDeckId: number,
  slides: Array<{
    documentPageId: number;
    position: number;
    isVisible: boolean;
    narrationOverrideUrl?: string | null;
    narrationOverrideKey?: string | null;
  }>
) {
  const db = await getDb();
  if (!db) return;
  await db.delete(subDeckSlides).where(eq(subDeckSlides.subDeckId, subDeckId));
  if (slides.length === 0) return;
  await db.insert(subDeckSlides).values(
    slides.map((s) => ({
      subDeckId,
      documentPageId: s.documentPageId,
      position: s.position,
      isVisible: s.isVisible,
      narrationOverrideUrl: s.narrationOverrideUrl ?? null,
      narrationOverrideKey: s.narrationOverrideKey ?? null,
    }))
  );
}
export async function getSubDeckSlides(subDeckId: number): Promise<SubDeckSlide[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(subDeckSlides)
    .where(eq(subDeckSlides.subDeckId, subDeckId))
    .orderBy(subDeckSlides.position);
}

// ─── Composed Deck Share Links ────────────────────────────────────────────────
export async function getShareLinksByComposedDeckId(composedDeckId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.composedDeckId, composedDeckId))
    .orderBy(desc(shareLinks.createdAt));
}

export async function getComposedDeckAnalyticsSummary(composedDeckId: number) {
  const db = await getDb();
  if (!db) return { totalViews: 0, uniqueVisitors: 0, totalTimeSpent: 0 };
  const [views] = await db
    .select({ count: sql<number>`count(*)` })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.composedDeckId, composedDeckId), eq(analyticsEvents.eventType, "view")));
  const [uniq] = await db
    .select({ count: sql<number>`count(distinct visitorHash)` })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.composedDeckId, composedDeckId), eq(analyticsEvents.eventType, "view")));
  const [time] = await db
    .select({ total: sql<number>`coalesce(sum(secondsSpent), 0)` })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.composedDeckId, composedDeckId), eq(analyticsEvents.eventType, "time_spent")));
  return {
    totalViews: Number(views?.count ?? 0),
    uniqueVisitors: Number(uniq?.count ?? 0),
    totalTimeSpent: Number(time?.total ?? 0),
  };
}

// ─── Auth Tokens (Magic Link OTP) ─────────────────────────────────────────────

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

export async function createAuthToken(data: InsertAuthToken) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(authTokens).values(data);
}

export async function getValidAuthToken(email: string, token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const now = new Date();
  const result = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.email, email),
        eq(authTokens.token, token),
        sql`${authTokens.expiresAt} > ${now}`,
        sql`${authTokens.usedAt} IS NULL`
      )
    )
    .limit(1);
  return result[0];
}

export async function markAuthTokenUsed(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, id));
}

export async function deleteExpiredAuthTokens(email: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(authTokens).where(
    and(eq(authTokens.email, email), sql`${authTokens.expiresAt} < NOW()`)
  );
}

// ─── Media Library ────────────────────────────────────────────────────────────

export async function createMediaLibraryItem(data: InsertMediaLibraryItem) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(mediaLibrary).values(data);
  return result[0];
}

export async function getMediaLibraryByUser(userId: number, type?: "narration" | "video") {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(mediaLibrary.userId, userId)];
  if (type) conditions.push(eq(mediaLibrary.type, type));
  return db.select().from(mediaLibrary).where(and(...conditions)).orderBy(desc(mediaLibrary.createdAt));
}

export async function deleteMediaLibraryItem(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(mediaLibrary).where(and(eq(mediaLibrary.id, id), eq(mediaLibrary.userId, userId)));
}

// ─── Slide Tags ───────────────────────────────────────────────────────────────

export async function getSlideTagsByDocument(documentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(slideTags).where(eq(slideTags.documentId, documentId));
}

export async function toggleSlideTag(documentId: number, documentPageId: number, tag: "present") {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db
    .select()
    .from(slideTags)
    .where(and(eq(slideTags.documentPageId, documentPageId), eq(slideTags.tag, tag)))
    .limit(1);
  if (existing.length > 0) {
    await db.delete(slideTags).where(eq(slideTags.id, existing[0].id));
    return { tagged: false };
  } else {
    await db.insert(slideTags).values({ documentId, documentPageId, tag });
    return { tagged: true };
  }
}

// ─── System Folder & Folder Access ──────────────────────────────────────────────

/** Get the system folder (there should only be one) */
export async function getSystemFolder(): Promise<Folder | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(folders).where(eq(folders.isSystemFolder, true)).limit(1);
  return result[0];
}

/** Create the system folder if it doesn't exist yet */
export async function ensureSystemFolder(adminUserId: number): Promise<Folder> {
  const existing = await getSystemFolder();
  if (existing) return existing;
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(folders).values({
    ownerId: adminUserId,
    name: "System",
    description: "Shared system folder — available to all users.",
    isSystemFolder: true,
  });
  const id = (result[0] as any).insertId;
  return (await getFolderById(id))!;
}

/** Get all folders visible to a user: their own + folders they are a member of + system folder */
export async function getFoldersForUser(userId: number): Promise<Folder[]> {
  const db = await getDb();
  if (!db) return [];
  // Own folders
  const own = await db.select().from(folders).where(and(eq(folders.ownerId, userId), sql`${folders.isSystemFolder} = 0`)).orderBy(desc(folders.createdAt));
  // Folders where user is a member (matched by userId stored in folderMembers after acceptance)
  const memberFolderRows = await db
    .select({ folderId: folderMembers.folderId })
    .from(folderMembers)
    .where(and(sql`${folderMembers.acceptedAt} IS NOT NULL`));
  const memberFolderIds = memberFolderRows.map((r) => r.folderId);
  let memberFolders: Folder[] = [];
  if (memberFolderIds.length > 0) {
    memberFolders = await db.select().from(folders).where(and(inArray(folders.id, memberFolderIds), sql`${folders.isSystemFolder} = 0`)).orderBy(desc(folders.createdAt));
  }
  // System folder
  const sysFolder = await getSystemFolder();
  const result: Folder[] = [];
  if (sysFolder) result.push(sysFolder);
  // Merge own + member, dedup
  const seen = new Set<number>(sysFolder ? [sysFolder.id] : []);
  for (const f of [...own, ...memberFolders]) {
    if (!seen.has(f.id)) { seen.add(f.id); result.push(f); }
  }
  return result;
}

/** Check if a user can edit a folder (owner or editor member, or admin for system folder) */
export async function canUserEditFolder(userId: number, folderId: number, userRole: string): Promise<boolean> {
  const folder = await getFolderById(folderId);
  if (!folder) return false;
  if (folder.isSystemFolder) return userRole === "admin";
  if (folder.ownerId === userId) return true;
  const db = await getDb();
  if (!db) return false;
  const [member] = await db.select().from(folderMembers).where(
    and(eq(folderMembers.folderId, folderId), sql`${folderMembers.acceptedAt} IS NOT NULL`, eq(folderMembers.role, "editor"))
  ).limit(1);
  return !!member;
}

// ─── Folder Sections ──────────────────────────────────────────────────────────
import {
  folderSections,
  type FolderSection,
  type InsertFolderSection,
} from "../drizzle/schema";

export async function getFolderSections(folderId: number): Promise<FolderSection[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(folderSections).where(eq(folderSections.folderId, folderId)).orderBy(folderSections.position);
}

export async function createFolderSection(data: InsertFolderSection): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(folderSections).values(data);
  return (result[0] as any).insertId;
}

export async function deleteFolderSection(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(folderSections).where(eq(folderSections.id, id));
}

export async function renameFolderSection(id: number, name: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(folderSections).set({ name }).where(eq(folderSections.id, id));
}

// ─── Email Alias Resolution ───────────────────────────────────────────────────
// Alias mapping is loaded from the EMAIL_ALIASES env var at startup.
// Format: "alias@domain.com=canonical@domain.com,another@domain.com=main@domain.com"

function buildAliasMap(): Record<string, string> {
  const raw = process.env.EMAIL_ALIASES ?? "";
  if (!raw.trim()) return {};
  return Object.fromEntries(
    raw.split(",")
      .map((pair: string) => pair.trim().split("=").map((s: string) => s.trim().toLowerCase()))
      .filter((parts: string[]) => parts.length === 2 && parts[0] && parts[1])
  );
}

// Cached at module load.
const EMAIL_ALIASES: Record<string, string> = buildAliasMap();

/**
 * Given any email (including aliases), returns the canonical email that
 * owns the account in the DB. Falls back to the original email unchanged.
 */
export function resolveCanonicalEmail(email: string): string {
  const lower = email.toLowerCase().trim();
  return EMAIL_ALIASES[lower] ?? lower;
}

/**
 * Returns true if the given email is allowed to sign in.
 * Checked in order:
 *   1. ALLOWED_EMAIL_DOMAINS="*" → any address passes
 *   2. Email domain matches a comma-separated entry in ALLOWED_EMAIL_DOMAINS
 *   3. Email is an explicit alias in EMAIL_ALIASES
 */
export function isAllowedEmail(email: string): boolean {
  const lower = email.toLowerCase().trim();
  const domains = (process.env.ALLOWED_EMAIL_DOMAINS ?? "*")
    .split(",")
    .map((d: string) => d.trim().toLowerCase())
    .filter(Boolean);

  if (domains.includes("*")) return true;
  const domain = lower.split("@")[1];
  if (domain && domains.includes(domain)) return true;
  if (lower in EMAIL_ALIASES) return true;
  return false;
}

// ─── Narration Library (Versioned) ───────────────────────────────────────────
import {
  narrationVersions,
  type NarrationVersion,
  type InsertNarrationVersion,
} from "../drizzle/schema";

/**
 * Add a new version to an existing media_library narration item.
 * Updates the library item's videoUrl/videoKey/duration to the new version,
 * and propagates the new URL to all slide_narrations referencing this item.
 */
export async function addNarrationVersion(
  mediaLibraryId: number,
  userId: number,
  data: {
    videoUrl: string;
    videoKey: string;
    durationSeconds?: number;
    fileSizeBytes?: number;
  }
): Promise<NarrationVersion> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Get current version count
  const [versionCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(narrationVersions)
    .where(eq(narrationVersions.mediaLibraryId, mediaLibraryId));
  const nextVersion = Number(versionCount?.count ?? 0) + 1;

  // Insert new version record
  const result = await db.insert(narrationVersions).values({
    mediaLibraryId,
    versionNumber: nextVersion,
    videoUrl: data.videoUrl,
    videoKey: data.videoKey,
    durationSeconds: data.durationSeconds,
    fileSizeBytes: data.fileSizeBytes,
  });
  const versionId = (result[0] as any).insertId;

  // Update the media_library item to point to the new video
  await db.update(mediaLibrary).set({
    videoUrl: data.videoUrl,
    videoKey: data.videoKey,
    durationSeconds: data.durationSeconds,
  }).where(and(eq(mediaLibrary.id, mediaLibraryId), eq(mediaLibrary.userId, userId)));

  // Propagate new URL to all slide_narrations referencing this library item
  await db.update(slideNarrations).set({
    videoUrl: data.videoUrl,
    videoKey: data.videoKey,
  }).where(eq(slideNarrations.mediaLibraryId, mediaLibraryId));

  const [version] = await db.select().from(narrationVersions).where(eq(narrationVersions.id, versionId)).limit(1);
  return version;
}

/**
 * Get all version history for a media_library narration item, newest first.
 */
export async function getNarrationVersions(mediaLibraryId: number): Promise<NarrationVersion[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(narrationVersions)
    .where(eq(narrationVersions.mediaLibraryId, mediaLibraryId))
    .orderBy(desc(narrationVersions.versionNumber));
}

/**
 * Get all slide_narrations that reference a media_library item,
 * joined with document info for the usage map.
 */
export async function getNarrationUsages(mediaLibraryId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      narrationId: slideNarrations.id,
      documentId: slideNarrations.documentId,
      pageNumber: slideNarrations.pageNumber,
      documentTitle: documents.title,
    })
    .from(slideNarrations)
    .innerJoin(documents, eq(slideNarrations.documentId, documents.id))
    .where(eq(slideNarrations.mediaLibraryId, mediaLibraryId))
    .orderBy(documents.title, slideNarrations.pageNumber);
  return rows;
}

/**
 * Attach a media_library narration to a specific document page.
 * Upserts the slide_narrations row and sets mediaLibraryId.
 */
export async function attachNarrationToSlide(
  documentId: number,
  pageNumber: number,
  mediaLibraryId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Get the library item to copy its current video URL
  const [item] = await db
    .select()
    .from(mediaLibrary)
    .where(eq(mediaLibrary.id, mediaLibraryId))
    .limit(1);
  if (!item) throw new Error("Media library item not found");

  // Check if a narration already exists for this slide
  const [existing] = await db
    .select()
    .from(slideNarrations)
    .where(and(eq(slideNarrations.documentId, documentId), eq(slideNarrations.pageNumber, pageNumber)))
    .limit(1);

  if (existing) {
    await db.update(slideNarrations).set({
      videoUrl: item.videoUrl,
      videoKey: item.videoKey,
      mediaLibraryId,
    }).where(eq(slideNarrations.id, existing.id));
  } else {
    await db.insert(slideNarrations).values({
      documentId,
      pageNumber,
      videoUrl: item.videoUrl,
      videoKey: item.videoKey,
      mediaLibraryId,
    });
  }
}

/**
 * Detach a media_library narration from a slide (removes the link but keeps the slide_narration row
 * with its existing video URL — it becomes an independent narration).
 */
export async function detachNarrationFromSlide(slideNarrationId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(slideNarrations).set({ mediaLibraryId: null }).where(eq(slideNarrations.id, slideNarrationId));
}

/**
 * Rollback a media_library narration to a specific version.
 * Updates the library item and propagates to all linked slide_narrations.
 */
export async function rollbackNarrationToVersion(
  mediaLibraryId: number,
  userId: number,
  versionId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [version] = await db
    .select()
    .from(narrationVersions)
    .where(and(eq(narrationVersions.id, versionId), eq(narrationVersions.mediaLibraryId, mediaLibraryId)))
    .limit(1);
  if (!version) throw new Error("Version not found");

  await db.update(mediaLibrary).set({
    videoUrl: version.videoUrl,
    videoKey: version.videoKey,
    durationSeconds: version.durationSeconds ?? undefined,
  }).where(and(eq(mediaLibrary.id, mediaLibraryId), eq(mediaLibrary.userId, userId)));

  await db.update(slideNarrations).set({
    videoUrl: version.videoUrl,
    videoKey: version.videoKey,
  }).where(eq(slideNarrations.mediaLibraryId, mediaLibraryId));
}

// ─── User Alias Resolution ──────────────────────────────────────────────────────
import { userAliases } from "../drizzle/schema";

/**
 * Given an alias openId (e.g. from an OAuth provider), return the canonical user row.
 */
export async function getUserByAliasOpenId(aliasOpenId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const aliasResult = await db
    .select({ userId: userAliases.userId })
    .from(userAliases)
    .where(eq(userAliases.openId, aliasOpenId))
    .limit(1);
  if (aliasResult.length === 0) return undefined;
  const userResult = await db
    .select()
    .from(users)
    .where(eq(users.id, aliasResult[0].userId))
    .limit(1);
  return userResult[0];
}

/**
 * Given an alias email, return the canonical user row.
 */
export async function getUserByAliasEmail(aliasEmail: string) {
  const db = await getDb();
  if (!db) return undefined;
  const aliasResult = await db
    .select({ userId: userAliases.userId })
    .from(userAliases)
    .where(eq(userAliases.email, aliasEmail))
    .limit(1);
  if (aliasResult.length === 0) return undefined;
  const userResult = await db
    .select()
    .from(users)
    .where(eq(users.id, aliasResult[0].userId))
    .limit(1);
  return userResult[0];
}

// ─── Admin User Management ────────────────────────────────────────────────────

/**
 * Returns all users ordered by createdAt desc, with document count per user.
 */
export async function getAllUsersWithDocumentCount() {
  const db = await getDb();
  if (!db) return [];
  const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
  // Fetch document counts for all users
  const userIds = allUsers.map(u => u.id);
  if (userIds.length === 0) return allUsers.map(u => ({ ...u, documentCount: 0 }));
  const docCounts = await db
    .select({ userId: documents.userId, count: sql<number>`COUNT(*)` })
    .from(documents)
    .where(inArray(documents.userId, userIds))
    .groupBy(documents.userId);
  const countMap = new Map(docCounts.map(r => [r.userId, Number(r.count)]));
  return allUsers.map(u => ({ ...u, documentCount: countMap.get(u.id) ?? 0 }));
}

/**
 * Update a user's role (admin/user).
 */
export async function updateUserRole(userId: number, role: "admin" | "user"): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}
