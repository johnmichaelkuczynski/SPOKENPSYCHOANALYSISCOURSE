import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const studentsTable = pgTable("oral_course_students", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const lectureProgressTable = pgTable(
  "oral_course_lecture_progress",
  {
    clerkUserId: text("clerk_user_id")
      .notNull()
      .references(() => studentsTable.clerkUserId, { onDelete: "cascade" }),
    lectureId: integer("lecture_id").notNull(),
    status: text("status").notNull().default("locked"),
    currentSection: integer("current_section").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    bestScore: integer("best_score"),
    nextRetakeAt: timestamp("next_retake_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.clerkUserId, table.lectureId] })],
);

export const oralSessionsTable = pgTable("oral_course_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id")
    .notNull()
    .references(() => studentsTable.clerkUserId, { onDelete: "cascade" }),
  mode: text("mode").notNull(),
  lectureId: integer("lecture_id"),
  attempt: integer("attempt").notNull().default(1),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const oralExamScenariosTable = pgTable(
  "oral_course_exam_scenarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id")
      .notNull()
      .references(() => studentsTable.clerkUserId, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => oralSessionsTable.id, { onDelete: "cascade" }),
    questionIndex: integer("question_index").notNull(),
    prompt: text("prompt").notNull(),
    criteria: text("criteria").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("oral_course_exam_scenarios_session_question_idx").on(table.sessionId, table.questionIndex)],
);

export const oralTranscriptsTable = pgTable("oral_course_transcripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id")
    .notNull()
    .references(() => studentsTable.clerkUserId, { onDelete: "cascade" }),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => oralSessionsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  text: text("text").notNull(),
  context: text("context"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const oralScoresTable = pgTable("oral_course_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id")
    .notNull()
    .references(() => studentsTable.clerkUserId, { onDelete: "cascade" }),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => oralSessionsTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  lectureId: integer("lecture_id"),
  questionIndex: integer("question_index").notNull(),
  score: integer("score").notNull(),
  feedback: text("feedback").notNull(),
  attempt: integer("attempt").notNull(),
  studentAnswer: text("student_answer").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOralSessionSchema = createInsertSchema(oralSessionsTable).omit({
  id: true,
  startedAt: true,
  endedAt: true,
});
export const insertOralTranscriptSchema = createInsertSchema(oralTranscriptsTable).omit({
  id: true,
  createdAt: true,
});
export const insertOralScoreSchema = createInsertSchema(oralScoresTable).omit({
  id: true,
  createdAt: true,
});

export type InsertOralSession = z.infer<typeof insertOralSessionSchema>;
export type InsertOralTranscript = z.infer<typeof insertOralTranscriptSchema>;
export type InsertOralScore = z.infer<typeof insertOralScoreSchema>;
