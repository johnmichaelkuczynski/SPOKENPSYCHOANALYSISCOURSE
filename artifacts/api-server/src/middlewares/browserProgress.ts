import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const cookieName = "course_progress";

// This is not a login: it keeps each browser's course work separate until
// account authentication is added. Existing account records are not changed.
export function browserProgress(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    res.status(503).json({ error: "Course progress storage is not configured." });
    return;
  }
  const sign = (id: string) => createHmac("sha256", secret).update(id).digest("hex");
  const cookie = req.headers.cookie?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const [id = "", signature = ""] = (cookie ?? "").split(".");
  const validId = /^[0-9a-f-]{36}$/.test(id);
  const validSignature = /^[0-9a-f]{64}$/.test(signature) &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(sign(id)));
  const browserId = validId && validSignature ? id : randomUUID();
  res.locals.studentId = process.env.NODE_ENV === "development"
    ? "development-preview-student"
    : `browser_${browserId}`;
  if (!validId || !validSignature) {
    res.cookie(cookieName, `${browserId}.${sign(browserId)}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api",
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });
  }
  next();
}
