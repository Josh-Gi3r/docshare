import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getDocumentsByUserId: vi.fn().mockResolvedValue([]),
  getDocumentById: vi.fn().mockResolvedValue(null),
  getDocumentPages: vi.fn().mockResolvedValue([]),
  getShareLinksByDocumentId: vi.fn().mockResolvedValue([]),
  getShareLinksByUserId: vi.fn().mockResolvedValue([]),
  getShareLinkBySlug: vi.fn().mockResolvedValue(null),
  getDocumentAnalyticsSummary: vi.fn().mockResolvedValue({ totalViews: 0, uniqueVisitors: 0, totalTimeSpent: 0 }),
  getPageEngagement: vi.fn().mockResolvedValue([]),
  getRecentActivity: vi.fn().mockResolvedValue([]),
  getAnalyticsSummary: vi.fn().mockResolvedValue({ totalViews: 0, uniqueVisitors: 0, totalTimeSpent: 0 }),
  createShareLink: vi.fn().mockResolvedValue(undefined),
  updateShareLink: vi.fn().mockResolvedValue(undefined),
  deleteShareLink: vi.fn().mockResolvedValue(undefined),
  deleteDocument: vi.fn().mockResolvedValue(undefined),
  recordDocumentView: vi.fn().mockResolvedValue(42),
  recordPageViewEvent: vi.fn().mockResolvedValue(undefined),
  recordAnalyticsEvent: vi.fn().mockResolvedValue(undefined),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
}));

// ─── Test context helpers ─────────────────────────────────────────────────────

function makeUser(overrides = {}) {
  return {
    id: 1,
    openId: "test-user-openid",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "google",
    role: "user" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function makeContext(user?: ReturnType<typeof makeUser>): TrpcContext {
  return {
    user: user ?? null,
    req: {
      protocol: "https",
      headers: { "user-agent": "test-agent" },
      socket: { remoteAddress: "127.0.0.1" },
    } as any,
    res: {
      clearCookie: vi.fn(),
    } as any,
  };
}

// ─── Auth tests ───────────────────────────────────────────────────────────────

describe("auth.me", () => {
  it("returns null when not authenticated", async () => {
    const caller = appRouter.createCaller(makeContext());
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns user when authenticated", async () => {
    const user = makeUser();
    const caller = appRouter.createCaller(makeContext(user));
    const result = await caller.auth.me();
    expect(result).toMatchObject({ id: 1, email: "test@example.com" });
  });
});

describe("auth.logout", () => {
  it("clears the session cookie and returns success", async () => {
    const ctx = makeContext(makeUser());
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect((ctx.res as any).clearCookie).toHaveBeenCalled();
  });
});

// ─── Documents tests ──────────────────────────────────────────────────────────

describe("documents.list", () => {
  it("returns empty array when user has no documents", async () => {
    const caller = appRouter.createCaller(makeContext(makeUser()));
    const result = await caller.documents.list();
    expect(result).toEqual([]);
  });

  it("throws UNAUTHORIZED when not authenticated", async () => {
    const caller = appRouter.createCaller(makeContext());
    await expect(caller.documents.list()).rejects.toThrow();
  });
});

describe("documents.get", () => {
  it("throws NOT_FOUND when document does not exist", async () => {
    const caller = appRouter.createCaller(makeContext(makeUser()));
    await expect(caller.documents.get({ id: 999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws NOT_FOUND when document belongs to different user", async () => {
    const { getDocumentById } = await import("./db");
    vi.mocked(getDocumentById).mockResolvedValueOnce({
      id: 1,
      userId: 999, // different user
      title: "Test Doc",
      fileName: "test.pdf",
      fileType: "pdf",
      fileUrl: "https://example.com/test.pdf",
      fileKey: "test.pdf",
      pageCount: 5,
      status: "ready",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(makeContext(makeUser({ id: 1 })));
    await expect(caller.documents.get({ id: 1 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("documents.delete", () => {
  it("throws FORBIDDEN when document belongs to different user", async () => {
    const { getDocumentById } = await import("./db");
    vi.mocked(getDocumentById).mockResolvedValueOnce({
      id: 1,
      userId: 999,
      title: "Test Doc",
      fileName: "test.pdf",
      fileType: "pdf",
      fileUrl: "https://example.com/test.pdf",
      fileKey: "test.pdf",
      pageCount: 5,
      status: "ready",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(makeContext(makeUser({ id: 1 })));
    await expect(caller.documents.delete({ id: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

// ─── Share Links tests ────────────────────────────────────────────────────────

describe("shareLinks.list", () => {
  it("throws FORBIDDEN when document belongs to different user", async () => {
    const { getDocumentById } = await import("./db");
    vi.mocked(getDocumentById).mockResolvedValueOnce({
      id: 1,
      userId: 999,
      title: "Test Doc",
      fileName: "test.pdf",
      fileType: "pdf",
      fileUrl: "https://example.com/test.pdf",
      fileKey: "test.pdf",
      pageCount: 5,
      status: "ready",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(makeContext(makeUser({ id: 1 })));
    await expect(caller.shareLinks.list({ documentId: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("shareLinks.view", () => {
  it("throws NOT_FOUND when slug does not exist", async () => {
    const caller = appRouter.createCaller(makeContext());
    await expect(caller.shareLinks.view({ slug: "nonexistent" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws FORBIDDEN when link is disabled", async () => {
    const { getShareLinkBySlug } = await import("./db");
    vi.mocked(getShareLinkBySlug).mockResolvedValueOnce({
      id: 1,
      documentId: 1,
      userId: 1,
      slug: "test-slug",
      ogPreviewPageNumber: 1,
      isEnabled: false,
      password: null,
      expiresAt: null,
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(makeContext());
    await expect(caller.shareLinks.view({ slug: "test-slug" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws UNAUTHORIZED when password is required but not provided", async () => {
    const { getShareLinkBySlug } = await import("./db");
    vi.mocked(getShareLinkBySlug).mockResolvedValueOnce({
      id: 1,
      documentId: 1,
      userId: 1,
      slug: "test-slug",
      ogPreviewPageNumber: 1,
      isEnabled: true,
      password: "$2a$10$hashedpassword",
      expiresAt: null,
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(makeContext());
    await expect(caller.shareLinks.view({ slug: "test-slug" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("throws FORBIDDEN when link has expired", async () => {
    const { getShareLinkBySlug } = await import("./db");
    vi.mocked(getShareLinkBySlug).mockResolvedValueOnce({
      id: 1,
      documentId: 1,
      userId: 1,
      slug: "test-slug",
      ogPreviewPageNumber: 1,
      isEnabled: true,
      password: null,
      expiresAt: new Date("2020-01-01"), // expired
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(makeContext());
    await expect(caller.shareLinks.view({ slug: "test-slug" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

// ─── Analytics tests ──────────────────────────────────────────────────────────

describe("analytics.recordView", () => {
  it("records a view and returns a viewId", async () => {
    const caller = appRouter.createCaller(makeContext());
    const result = await caller.analytics.recordView({
      shareLinkId: 1,
      documentId: 1,
      sessionId: "test-session-123",
      userAgent: "Mozilla/5.0",
    });
    expect(result).toMatchObject({ viewId: expect.any(Number) });
  });
});

describe("analytics.recordPageView", () => {
  it("records a page view successfully", async () => {
    const caller = appRouter.createCaller(makeContext());
    const result = await caller.analytics.recordPageView({
      viewId: 42,
      documentId: 1,
      pageNumber: 3,
      timeSpentSeconds: 15,
    });
    expect(result).toEqual({ success: true });
  });
});
