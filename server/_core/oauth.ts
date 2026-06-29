import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Look up user_aliases table to find the canonical user for a given openId or email.
 * Uses Drizzle ORM helpers — safe for TiDB (no raw ? placeholder).
 */
async function resolveAliasToUser(openId: string, email: string | null) {
  // Check by openId first
  const byOpenId = await db.getUserByAliasOpenId(openId);
  if (byOpenId) return byOpenId;

  // Check by email if provided
  if (email) {
    const byEmail = await db.getUserByAliasEmail(email);
    if (byEmail) return byEmail;
  }

  return null;
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      const incomingEmail = userInfo.email ?? null;

      // Check if this openId or email is an alias for an existing canonical user
      const canonicalUser = await resolveAliasToUser(userInfo.openId, incomingEmail);

      let effectiveOpenId: string;
      if (canonicalUser) {
        // Use the canonical user's openId — this ensures upsertUser finds the right row
        effectiveOpenId = canonicalUser.openId;
        console.log(`[OAuth] Alias resolved: ${userInfo.openId} / ${incomingEmail} -> canonical user ${canonicalUser.id} (${canonicalUser.openId})`);
      } else {
        effectiveOpenId = userInfo.openId;
      }

      await db.upsertUser({
        openId: effectiveOpenId,
        name: userInfo.name || null,
        email: canonicalUser?.email ?? incomingEmail,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(effectiveOpenId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
