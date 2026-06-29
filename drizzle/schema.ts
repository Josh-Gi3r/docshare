import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  json,
  float,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Documents uploaded by users
export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  fileName: varchar("fileName", { length: 512 }).notNull(),
  fileType: mysqlEnum("fileType", ["pdf", "pptx"]).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  pageCount: int("pageCount").default(0).notNull(),
  status: mysqlEnum("status", ["processing", "ready", "error"]).default("processing").notNull(),
  // Current active version number (1-indexed)
  currentVersion: int("currentVersion").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

// Version history for each document
export const documentVersions = mysqlTable("document_versions", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("documentId").notNull(),
  versionNumber: int("versionNumber").notNull(),
  fileName: varchar("fileName", { length: 512 }).notNull(),
  fileType: mysqlEnum("fileType", ["pdf", "pptx"]).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  pageCount: int("pageCount").default(0).notNull(),
  status: mysqlEnum("status", ["processing", "ready", "error"]).default("processing").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DocumentVersion = typeof documentVersions.$inferSelect;
export type InsertDocumentVersion = typeof documentVersions.$inferInsert;

// Individual pages/slides of a document with thumbnail URLs
// versionId links pages to a specific document version
export const documentPages = mysqlTable("document_pages", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("documentId").notNull(),
  // Which version these pages belong to (null = original / v1)
  versionId: int("versionId"),
  pageNumber: int("pageNumber").notNull(),
  thumbnailUrl: text("thumbnailUrl").notNull(),
  thumbnailKey: varchar("thumbnailKey", { length: 512 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DocumentPage = typeof documentPages.$inferSelect;
export type InsertDocumentPage = typeof documentPages.$inferInsert;

// Slide config entry stored in slideConfig JSON column
export type SlideConfigEntry = {
  pageNumber: number;
  hidden: boolean;
};

// Share links for documents
export const shareLinks = mysqlTable("share_links", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("documentId"),
  // For composed deck share links
  composedDeckId: int("composedDeckId"),
  // For sub-deck share links
  subDeckId: int("subDeckId"),
  userId: int("userId").notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  // Human-readable label for this link (e.g. "Investor Version")
  label: varchar("label", { length: 256 }),
  // OG preview: which page number thumbnail to use (1-indexed)
  ogPreviewPageNumber: int("ogPreviewPageNumber").default(1).notNull(),
  // Custom OG title shown in social link previews (falls back to document title)
  ogTitle: varchar("ogTitle", { length: 256 }),
  // Custom OG description shown in social link previews
  ogDescription: text("ogDescription"),
  // Per-link slide configuration: ordered array of {pageNumber, hidden}
  // null means "use default order, show all slides"
  slideConfig: json("slideConfig").$type<SlideConfigEntry[]>(),
  // Per-link video controls: which player controls are visible to viewers
  // null means all controls enabled (default)
  videoControls: json("videoControls").$type<VideoControlsConfig>(),
  // Access controls
  isEnabled: boolean("isEnabled").default(true).notNull(),
  password: varchar("password", { length: 256 }),
  expiresAt: timestamp("expiresAt"),
  // View count (denormalized for fast reads)
  viewCount: int("viewCount").default(0).notNull(),
  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ShareLink = typeof shareLinks.$inferSelect;
export type InsertShareLink = typeof shareLinks.$inferInsert;

// Analytics events per share link view session
export const analyticsEvents = mysqlTable("analytics_events", {
  id: int("id").autoincrement().primaryKey(),
  shareLinkId: int("shareLinkId").notNull(),
  documentId: int("documentId"),
  composedDeckId: int("composedDeckId"),
  // Visitor fingerprint (hashed IP + UA, no PII stored)
  visitorHash: varchar("visitorHash", { length: 64 }),
  eventType: mysqlEnum("eventType", ["view", "page_view", "time_spent"]).notNull(),
  // For page_view events: which page was viewed
  pageNumber: int("pageNumber"),
  // For time_spent events: seconds spent on the document
  secondsSpent: int("secondsSpent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type InsertAnalyticsEvent = typeof analyticsEvents.$inferInsert;

// Per-slide video narration (Loom-style bubble)
export const slideNarrations = mysqlTable("slide_narrations", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("documentId").notNull(),
  // null = original/master (version 1); set to documentVersions.id for versioned uploads
  versionId: int("versionId"),
  pageNumber: int("pageNumber").notNull(),
  videoUrl: text("videoUrl").notNull(),
  videoKey: varchar("videoKey", { length: 512 }).notNull(),
  // FK to media_library — set when narration comes from the global library.
  // When set, videoUrl is kept in sync with the library item's current version.
  mediaLibraryId: int("mediaLibraryId"),
  // Crop anchor: percentage offset from top-left (0–100). Default 50/50 = center.
  cropX: float("cropX").default(50).notNull(),
  cropY: float("cropY").default(50).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SlideNarration = typeof slideNarrations.$inferSelect;
export type InsertSlideNarration = typeof slideNarrations.$inferInsert;

// Video controls config stored in videoControls JSON column on share_links
export type VideoControlsConfig = {
  allowPause: boolean;
  allowSkip: boolean;   // ±10 second skip buttons
  allowScrub: boolean;  // progress bar scrubbing
};

// Full-slide video embeds (MP4 uploaded to S3)
export const videoSlides = mysqlTable("video_slides", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("documentId").notNull(),
  // Which page number this video occupies in the slide order
  pageNumber: int("pageNumber").notNull(),
  videoUrl: text("videoUrl").notNull(),
  videoKey: varchar("videoKey", { length: 512 }).notNull(),
  thumbnailUrl: text("thumbnailUrl"),
  thumbnailKey: varchar("thumbnailKey", { length: 512 }),
  durationSeconds: float("durationSeconds"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VideoSlide = typeof videoSlides.$inferSelect;
export type InsertVideoSlide = typeof videoSlides.$inferInsert;

// ─── Team Folders ─────────────────────────────────────────────────────────────

// A named workspace owned by a user, containing slide libraries + composed decks
export const folders = mysqlTable("folders", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  // true = system/shared folder (auto-visible to all users; admin-only write access)
  isSystemFolder: boolean("isSystemFolder").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Folder = typeof folders.$inferSelect;
export type InsertFolder = typeof folders.$inferInsert;

// Links existing documents into a folder (a document can be in multiple folders)
export const folderDocuments = mysqlTable("folder_documents", {
  id: int("id").autoincrement().primaryKey(),
  folderId: int("folderId").notNull(),
  documentId: int("documentId").notNull(),
  addedAt: timestamp("addedAt").defaultNow().notNull(),
});

export type FolderDocument = typeof folderDocuments.$inferSelect;
export type InsertFolderDocument = typeof folderDocuments.$inferInsert;

// Team members invited to a folder via magic link (no platform account required)
export const folderMembers = mysqlTable("folder_members", {
  id: int("id").autoincrement().primaryKey(),
  folderId: int("folderId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 256 }),
  // Magic link token (nanoid, single-use for acceptance, then stored as session identifier)
  token: varchar("token", { length: 64 }).notNull().unique(),
  role: mysqlEnum("role", ["viewer", "editor"]).default("editor").notNull(),
  // null = pending (invite not yet accepted)
  acceptedAt: timestamp("acceptedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FolderMember = typeof folderMembers.$inferSelect;
export type InsertFolderMember = typeof folderMembers.$inferInsert;

// Folder-level narration asset library — standalone narration videos
// Can be linked to a specific document page (documentId + pageNumber) for recommendations
export const narrationAssets = mysqlTable("narration_assets", {
  id: int("id").autoincrement().primaryKey(),
  folderId: int("folderId").notNull(),
  // Optional: which document + page this narration is associated with (for recommendations)
  documentId: int("documentId"),
  pageNumber: int("pageNumber"),
  label: varchar("label", { length: 256 }),
  videoUrl: text("videoUrl").notNull(),
  videoKey: varchar("videoKey", { length: 512 }).notNull(),
  durationSeconds: float("durationSeconds"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type NarrationAsset = typeof narrationAssets.$inferSelect;
export type InsertNarrationAsset = typeof narrationAssets.$inferInsert;

// A composed deck: an ordered playlist of slides drawn from any documents in a folder
export const composedDecks = mysqlTable("composed_decks", {
  id: int("id").autoincrement().primaryKey(),
  folderId: int("folderId").notNull(),
  // Who created this deck — either a userId (owner) or a folderMemberId (team member)
  createdByUserId: int("createdByUserId"),
  createdByMemberId: int("createdByMemberId"),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ComposedDeck = typeof composedDecks.$inferSelect;
export type InsertComposedDeck = typeof composedDecks.$inferInsert;

// Each slot in a composed deck: one slide + optional narration override
export const composedDeckSlots = mysqlTable("composed_deck_slots", {
  id: int("id").autoincrement().primaryKey(),
  deckId: int("deckId").notNull(),
  // Position in the playlist (0-indexed)
  position: int("position").notNull(),
  // The slide (document page) referenced in this slot
  documentPageId: int("documentPageId").notNull(),
  // Optional narration: either from the folder narration library or a custom upload
  narrationAssetId: int("narrationAssetId"),
  // Custom narration uploaded directly to this slot (overrides narrationAssetId)
  customNarrationUrl: text("customNarrationUrl"),
  customNarrationKey: varchar("customNarrationKey", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ComposedDeckSlot = typeof composedDeckSlots.$inferSelect;
export type InsertComposedDeckSlot = typeof composedDeckSlots.$inferInsert;

// ─── Sub-Decks ────────────────────────────────────────────────────────────────
// A named sub-deck derived from a master document.
// Stores a custom slide order, visibility, and optional narration overrides.
export const subDecks = mysqlTable("sub_decks", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("documentId").notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SubDeck = typeof subDecks.$inferSelect;
export type InsertSubDeck = typeof subDecks.$inferInsert;

// Each slide slot in a sub-deck: references a document page with optional narration override
export const subDeckSlides = mysqlTable("sub_deck_slides", {
  id: int("id").autoincrement().primaryKey(),
  subDeckId: int("subDeckId").notNull(),
  // The page from the master document
  documentPageId: int("documentPageId").notNull(),
  // Display position in the sub-deck (0-indexed)
  position: int("position").notNull(),
  // Whether this slide is visible in the sub-deck (false = hidden)
  isVisible: boolean("isVisible").default(true).notNull(),
  // Optional narration override: replaces the master narration for this slide in this deck
  narrationOverrideUrl: text("narrationOverrideUrl"),
  narrationOverrideKey: varchar("narrationOverrideKey", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SubDeckSlide = typeof subDeckSlides.$inferSelect;
export type InsertSubDeckSlide = typeof subDeckSlides.$inferInsert;

// ─── Per-Slide Tags ───────────────────────────────────────────────────────────
// Optional tags applied to individual document pages (e.g. PRESENT = good for live presentation)
export const slideTags = mysqlTable("slide_tags", {
  id: int("id").autoincrement().primaryKey(),
  documentPageId: int("documentPageId").notNull(),
  documentId: int("documentId").notNull(),
  tag: mysqlEnum("tag", ["present"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SlideTag = typeof slideTags.$inferSelect;
export type InsertSlideTag = typeof slideTags.$inferInsert;

// ─── Folder Sections ─────────────────────────────────────────────────────────
// Optional labelled section dividers within a folder's document list.
// Documents can be assigned to a section for visual grouping.
export const folderSections = mysqlTable("folder_sections", {
  id: int("id").autoincrement().primaryKey(),
  folderId: int("folderId").notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  position: int("position").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FolderSection = typeof folderSections.$inferSelect;
export type InsertFolderSection = typeof folderSections.$inferInsert;

// ─── Media Library ────────────────────────────────────────────────────────────
// Centralised store of narration/video assets per user.
// When adding narration or video slides, user can upload new or pick from this library.
export const mediaLibrary = mysqlTable("media_library", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  label: varchar("label", { length: 256 }),
  videoUrl: text("videoUrl").notNull(),
  videoKey: varchar("videoKey", { length: 512 }).notNull(),
  type: mysqlEnum("type", ["narration", "video"]).default("narration").notNull(),
  durationSeconds: float("durationSeconds"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MediaLibraryItem = typeof mediaLibrary.$inferSelect;
export type InsertMediaLibraryItem = typeof mediaLibrary.$inferInsert;

// ─── Narration Versions ─────────────────────────────────────────────────────
// Version history for a media_library narration item.
// When a new version is uploaded, a new row is added here and media_library.videoUrl is updated.
// All slide_narrations referencing this mediaLibraryId automatically serve the latest version.
export const narrationVersions = mysqlTable("narration_versions", {
  id: int("id").autoincrement().primaryKey(),
  // The media_library item this version belongs to
  mediaLibraryId: int("mediaLibraryId").notNull(),
  versionNumber: int("versionNumber").notNull(),
  videoUrl: text("videoUrl").notNull(),
  videoKey: varchar("videoKey", { length: 512 }).notNull(),
  durationSeconds: float("durationSeconds"),
  fileSizeBytes: int("fileSizeBytes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type NarrationVersion = typeof narrationVersions.$inferSelect;
export type InsertNarrationVersion = typeof narrationVersions.$inferInsert;

// ─── Auth Tokens (Magic Link OTP) ─────────────────────────────────────────────
// One-time tokens sent to allowed email addresses for passwordless login (magic link).
export const authTokens = mysqlTable("auth_tokens", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  token: varchar("token", { length: 128 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuthToken = typeof authTokens.$inferSelect;
export type InsertAuthToken = typeof authTokens.$inferInsert;

// ─── User Aliases (Account Merge / Identity Resolution) ──────────────────────
// Maps alias openIds and emails to a canonical userId.
// Used to resolve merged/alias accounts (e.g. a secondary OAuth openId → primary user).
export const userAliases = mysqlTable("user_aliases", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  openId: varchar("openId", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 255 }),
  createdAt: varchar("createdAt", { length: 64 }).notNull(),
});
export type UserAlias = typeof userAliases.$inferSelect;
export type InsertUserAlias = typeof userAliases.$inferInsert;
