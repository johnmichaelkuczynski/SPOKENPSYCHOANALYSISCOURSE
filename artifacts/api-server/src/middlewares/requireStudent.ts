import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";

// A separate, persistent local student; never accepted by a production server.
export function getEffectiveUserId(req: Request): string | null {
  return getAuth(req).userId ??
    (process.env.NODE_ENV === "development" ? "development-preview-student" : null);
}

export function requireStudent(req: Request, res: Response, next: NextFunction): void {
  const userId = getEffectiveUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to save course progress." });
    return;
  }
  res.locals.studentId = userId;
  next();
}

export function getStudentId(res: Response): string {
  const studentId = res.locals.studentId;
  if (typeof studentId !== "string") {
    throw new Error("Authenticated student identity is unavailable.");
  }
  return studentId;
}
