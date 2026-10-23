import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";

export function requireStudent(req: Request, res: Response, next: NextFunction): void {
  const { userId } = getAuth(req);
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
