import type { NextFunction, Request, Response } from "express";

export function getEffectiveUserId(_req: Request, res: Response): string | null {
  return typeof res.locals.studentId === "string" ? res.locals.studentId : null;
}

export function requireStudent(req: Request, res: Response, next: NextFunction): void {
  const userId = getEffectiveUserId(req, res);
  if (!userId) {
    res.status(503).json({ error: "Course progress is currently unavailable." });
    return;
  }
  res.locals.studentId = userId;
  next();
}

export function getStudentId(res: Response): string {
  const studentId = res.locals.studentId;
  if (typeof studentId !== "string") {
    throw new Error("Browser progress identity is unavailable.");
  }
  return studentId;
}
