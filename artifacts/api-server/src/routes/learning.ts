import { and, desc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  CreateSessionBody,
  CreateSessionResponse,
  GetActivityResponse,
  GetCourseResponse,
  GetProgressResponse,
  GetSessionsResponse,
  SaveScoreBody,
  SaveScoreResponse,
  SaveTranscriptBody,
  SaveTranscriptParams,
  SaveTranscriptResponse,
  UpdateLectureProgressBody,
  UpdateLectureProgressParams,
  UpdateLectureProgressResponse,
} from "@workspace/api-zod";
import {
  db,
  lectureProgressTable,
  oralExamScenariosTable,
  oralScoresTable,
  oralSessionsTable,
  oralTranscriptsTable,
  studentsTable,
} from "@workspace/db";
import { getPublicCourse, getInternalCourse } from "../lib/courseContent";
import { getStudentId, requireStudent } from "../middlewares/requireStudent";
import { selectCourseRun } from "../middlewares/browserProgress";

const router: IRouter = Router();

async function generateRetakePrompts(): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Write five new oral-exam case prompts for a retake in an introductory course on psychoanalysis. Each must describe a fresh, distinct, plausible situation and ask the student to adjudicate it: make a judgment, support it with case evidence, and weigh a competing explanation or state what evidence could change the judgment. Test the same numbered course criterion as the matching original. Never ask for a definition, a theorist's name, recalled facts, or the explanation of a case already discussed in the lecture. Do not copy the original exam cases or lecture examples. Return JSON only in the shape {\"questions\":[{\"prompt\":\"...\"}, ...]} with exactly five questions. Do not include answers, grading criteria, hints, or explanations in the output.",
        },
        {
          role: "user",
          content: JSON.stringify({
            courseContent: getInternalCourse().teachingContent,
            originalCases: getInternalCourse().finalExam.questions.map((question) => ({
              prompt: question.prompt,
              criteria: question.criteria,
            })),
          }),
        },
      ],
    }),
  });
  if (!response.ok) throw new Error("Retake cases could not be generated.");
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Retake cases were empty.");
  const parsed = JSON.parse(content) as { questions?: { prompt?: unknown }[] };
  const prompts = parsed.questions?.map((question) =>
    typeof question.prompt === "string" ? question.prompt.trim() : "",
  );
  if (
    !prompts ||
    prompts.length !== getInternalCourse().finalExam.questions.length ||
    prompts.some((prompt) => !prompt)
  ) {
    throw new Error("Retake cases were incomplete.");
  }
  const originals = new Set(getInternalCourse().finalExam.questions.map((question) => question.prompt.trim().toLowerCase()));
  if (prompts.some((prompt) => originals.has(prompt.toLowerCase()))) {
    throw new Error("Retake cases duplicated an original case.");
  }
  return prompts;
}

async function ensureStudent(studentId: string): Promise<void> {
  await db
    .insert(studentsTable)
    .values({ clerkUserId: studentId })
    .onConflictDoUpdate({
      target: studentsTable.clerkUserId,
      set: { lastSeenAt: new Date() },
    });

  for (const lecture of getInternalCourse().lectures) {
    await db
      .insert(lectureProgressTable)
      .values({
        clerkUserId: studentId,
        lectureId: lecture.id,
        status: "available",
      })
      .onConflictDoNothing();
  }
}

router.get("/course", (_req, res): void => {
  res.json(GetCourseResponse.parse(getPublicCourse()));
});

router.use(requireStudent);

router.post("/course/restart", requireStudent, async (_req, res): Promise<void> => {
  const baseStudentId = res.locals.baseStudentId;
  if (typeof baseStudentId !== "string") {
    res.status(503).json({ error: "Your course could not be restarted. Please try again." });
    return;
  }
  const runId = randomUUID();
  // Initialize before selecting the run, so failures leave the current run intact.
  await ensureStudent(`${baseStudentId}_run_${runId}`);
  selectCourseRun(res, runId);
  res.sendStatus(204);
});

router.get("/progress", async (_req, res): Promise<void> => {
  const studentId = getStudentId(res);
  await ensureStudent(studentId);
  const [progressRows, scores, sessions] = await Promise.all([
    db.select().from(lectureProgressTable).where(eq(lectureProgressTable.clerkUserId, studentId)),
    db.select().from(oralScoresTable).where(eq(oralScoresTable.clerkUserId, studentId)),
    db.select().from(oralSessionsTable).where(eq(oralSessionsTable.clerkUserId, studentId)),
  ]);

  const latestScores = new Map<string, (typeof scores)[number]>();
  for (const score of scores) {
    const key = `${score.kind}:${score.lectureId ?? "final"}:${score.questionIndex}`;
    const prior = latestScores.get(key);
    if (
      !prior ||
      score.attempt > prior.attempt ||
      (score.attempt === prior.attempt && score.createdAt > prior.createdAt)
    ) {
      latestScores.set(key, score);
    }
  }

  const lectureTotals = new Map<number, number>();
  for (const lecture of getInternalCourse().lectures) {
    const questions = getInternalCourse().lectures[lecture.id - 1]?.questions ?? [];
    const total = questions.reduce(
      (sum, _question, index) =>
        sum + (latestScores.get(`lecture:${lecture.id}:${index}`)?.score ?? 0),
      0,
    );
    const answeredCount = questions.filter((_, index) =>
      latestScores.has(`lecture:${lecture.id}:${index}`),
    ).length;
    lectureTotals.set(lecture.id, answeredCount === questions.length ? total : 0);
  }
  const lectureTotal = [...lectureTotals.values()].reduce((sum, value) => sum + value, 0);
  const lectureProgress = getInternalCourse().lectures.map((lecture) => {
    const row = progressRows.find((item) => item.lectureId === lecture.id);
    const total = lectureTotals.get(lecture.id) ?? 0;
    const passed = total >= 8;
    return {
      lectureId: lecture.id,
      status: (passed ? "passed" : "available") as "available" | "passed",
      currentSection: row?.currentSection ?? 0,
      bestScore: total,
      attempts: row?.attempts ?? 0,
      nextRetakeAt: row?.nextRetakeAt ?? null,
    };
  });

  const examSessions = sessions
    .filter((session) => session.mode === "final_exam")
    .sort((a, b) => b.attempt - a.attempt || b.startedAt.getTime() - a.startedAt.getTime());
  const examAttempt = examSessions[0]?.attempt ?? 0;
  const examScores = [...latestScores.entries()]
    .filter(([key]) => key.startsWith("exam:final:"))
    .map(([, score]) => score);
  const examTotal = examAttempt
    ? examScores
        .filter((score) => score.attempt === examAttempt)
        .reduce((sum, score) => sum + score.score, 0)
    : 0;
  const examComplete = examScores.filter((score) => score.attempt === examAttempt).length >= 5;
  const examUnlocked = true;
  const examRetakeAt = null;
  const gradePercent =
    examComplete && lectureProgress.every((item) => item.status === "passed")
      ? (lectureTotal / 60) * 40 + (examTotal / 20) * 60
      : null;
  const result =
    gradePercent === null
      ? null
      : lectureTotal >= 54 && examTotal >= 18
        ? "distinction"
        : lectureTotal >= 42 && examTotal >= 14
          ? "pass"
          : "fail";

  res.json(
    GetProgressResponse.parse({
      displayName: "Student",
      lectures: lectureProgress,
      examUnlocked,
      examRetakeAt,
      lectureTotal,
      examTotal,
      gradePercent,
      result,
      certificateDate: result === "pass" || result === "distinction" ? new Date().toISOString().slice(0, 10) : null,
    }),
  );
});

router.get("/activity", async (_req, res): Promise<void> => {
  const studentId = getStudentId(res);
  await ensureStudent(studentId);
  const [sessions, transcriptRows, progressRows] = await Promise.all([
    db
      .select()
      .from(oralSessionsTable)
      .where(eq(oralSessionsTable.clerkUserId, studentId))
      .orderBy(desc(oralSessionsTable.startedAt))
      .limit(20),
    db.select({ id: oralTranscriptsTable.id }).from(oralTranscriptsTable).where(
      eq(oralTranscriptsTable.clerkUserId, studentId),
    ),
    db.select().from(lectureProgressTable).where(eq(lectureProgressTable.clerkUserId, studentId)),
  ]);
  const recent = sessions.slice(0, 8).map((session) => ({
    id: session.id,
    kind:
      session.mode === "final_exam"
        ? "exam"
        : session.mode === "dialogue"
          ? "dialogue"
          : "test",
    label:
      session.mode === "dialogue"
        ? "Professor conversation"
        : session.mode === "final_exam"
          ? `Final exam · attempt ${session.attempt}`
          : `Lecture ${session.lectureId} oral questions`,
    createdAt: session.startedAt,
  }));
  res.json(
    GetActivityResponse.parse({
      completedLectures: progressRows.filter((row) => row.status === "passed").length,
      totalLectures: 5,
      transcriptCount: transcriptRows.length,
      recent,
    }),
  );
});

router.put("/progress/lectures/:lectureId", async (req, res): Promise<void> => {
  const studentId = getStudentId(res);
  const params = UpdateLectureProgressParams.safeParse(req.params);
  const body = UpdateLectureProgressBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid lecture progress." });
    return;
  }
  await ensureStudent(studentId);
  const lectureId = params.data.lectureId;
  const [current] = await db
    .select()
    .from(lectureProgressTable)
    .where(and(eq(lectureProgressTable.clerkUserId, studentId), eq(lectureProgressTable.lectureId, lectureId)));
  const alreadyPassed = current?.status === "passed";
  await db
    .update(lectureProgressTable)
    .set({
      status: alreadyPassed ? "passed" : "available",
      currentSection: body.data.currentSection,
      updatedAt: new Date(),
    })
    .where(and(eq(lectureProgressTable.clerkUserId, studentId), eq(lectureProgressTable.lectureId, lectureId)));
  const [row] = await db
    .select()
    .from(lectureProgressTable)
    .where(and(eq(lectureProgressTable.clerkUserId, studentId), eq(lectureProgressTable.lectureId, lectureId)));
  res.json(
    UpdateLectureProgressResponse.parse({
      lectureId,
      status: row?.status === "passed" ? "passed" : "available",
      currentSection: row?.currentSection ?? body.data.currentSection,
      bestScore: row?.bestScore ?? null,
      attempts: row?.attempts ?? 0,
      nextRetakeAt: row?.nextRetakeAt ?? null,
    }),
  );
});

router.get("/sessions", async (_req, res): Promise<void> => {
  const studentId = getStudentId(res);
  await ensureStudent(studentId);
  const sessions = await db
    .select()
    .from(oralSessionsTable)
    .where(eq(oralSessionsTable.clerkUserId, studentId))
    .orderBy(desc(oralSessionsTable.startedAt));
  res.json(GetSessionsResponse.parse(sessions));
});

router.post("/sessions", async (req, res): Promise<void> => {
  const studentId = getStudentId(res);
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await ensureStudent(studentId);
  const { mode, lectureId, attempt } = parsed.data;

  if (mode === "lecture_questions") {
    if (lectureId == null || lectureId < 1 || lectureId > 5) {
      res.status(400).json({ error: "A valid lecture is required for a question session." });
      return;
    }
  }

  // Assessments are directly accessible. Prerequisites, retry caps and cooldowns
  // are deferred until the course's grading protocols are specified.

  let examPrompts = mode === "final_exam"
    ? getInternalCourse().finalExam.questions.map((question) => question.prompt)
    : undefined;
  if (mode === "final_exam" && attempt > 1) {
    try {
      examPrompts = await generateRetakePrompts();
    } catch {
      console.warn("New final-exam cases could not be prepared; keeping the exam open with the course's existing cases.");
    }
  }

  const session = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(oralSessionsTable)
      .values({
        clerkUserId: studentId,
        mode,
        lectureId: lectureId ?? null,
        attempt,
      })
      .returning();
    if (mode === "final_exam" && attempt > 1 && examPrompts) {
      await tx.insert(oralExamScenariosTable).values(
        examPrompts.map((prompt, questionIndex) => ({
          clerkUserId: studentId,
          sessionId: created.id,
          questionIndex,
          prompt,
          criteria: getInternalCourse().finalExam.questions[questionIndex].criteria,
        })),
      );
    }
    return created;
  });
  if (mode === "lecture_questions" && lectureId != null) {
    await db
      .update(lectureProgressTable)
      .set({ attempts: attempt, updatedAt: new Date() })
      .where(and(eq(lectureProgressTable.clerkUserId, studentId), eq(lectureProgressTable.lectureId, lectureId)));
  }
  res.status(201).json(CreateSessionResponse.parse({
    ...session,
    examQuestions: examPrompts?.map((prompt) => ({ prompt })),
  }));
});

router.post("/sessions/:sessionId/transcripts", async (req, res): Promise<void> => {
  const studentId = getStudentId(res);
  const params = SaveTranscriptParams.safeParse(req.params);
  const body = SaveTranscriptBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid transcript." });
    return;
  }
  const [session] = await db
    .select()
    .from(oralSessionsTable)
    .where(and(eq(oralSessionsTable.id, params.data.sessionId), eq(oralSessionsTable.clerkUserId, studentId)));
  if (!session) {
    res.status(404).json({ error: "Oral session not found." });
    return;
  }
  const [transcript] = await db
    .insert(oralTranscriptsTable)
    .values({
      clerkUserId: studentId,
      sessionId: session.id,
      role: body.data.role,
      text: body.data.text,
      context: body.data.context ?? null,
    })
    .returning();
  res.status(201).json(SaveTranscriptResponse.parse(transcript));
});

router.post("/scores", async (req, res): Promise<void> => {
  const studentId = getStudentId(res);
  const body = SaveScoreBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const maxScore = body.data.kind === "lecture" ? 2 : 4;
  if (body.data.score > maxScore) {
    res.status(400).json({ error: `The maximum score for this answer is ${maxScore}.` });
    return;
  }
  const expectedMode = body.data.kind === "lecture" ? "lecture_questions" : "final_exam";
  const [session] = await db
    .select()
    .from(oralSessionsTable)
    .where(and(
      eq(oralSessionsTable.clerkUserId, studentId),
      eq(oralSessionsTable.mode, expectedMode),
      eq(oralSessionsTable.attempt, body.data.attempt),
      body.data.lectureId == null
        ? isNull(oralSessionsTable.lectureId)
        : eq(oralSessionsTable.lectureId, body.data.lectureId),
    ));
  const matchingSession = session;
  if (!matchingSession) {
    res.status(404).json({ error: "Matching oral session not found." });
    return;
  }
  const [score] = await db
    .insert(oralScoresTable)
    .values({
      clerkUserId: studentId,
      sessionId: matchingSession.id,
      kind: body.data.kind,
      lectureId: body.data.lectureId ?? null,
      questionIndex: body.data.questionIndex,
      score: body.data.score,
      feedback: body.data.feedback,
      attempt: body.data.attempt,
      studentAnswer: body.data.studentAnswer,
    })
    .returning();

  if (body.data.kind === "lecture" && body.data.lectureId != null) {
    const questionScores = await db
      .select()
      .from(oralScoresTable)
      .where(and(
        eq(oralScoresTable.clerkUserId, studentId),
        eq(oralScoresTable.kind, "lecture"),
        eq(oralScoresTable.lectureId, body.data.lectureId),
      ));
    const latest = new Map<number, (typeof questionScores)[number]>();
    for (const item of questionScores) {
      const prior = latest.get(item.questionIndex);
      if (!prior || item.attempt > prior.attempt) latest.set(item.questionIndex, item);
    }
    const total = [...latest.values()].reduce((sum, item) => sum + item.score, 0);
    const attemptScores = questionScores.filter((item) => item.attempt === body.data.attempt);
    const originalScores = questionScores.filter((item) => item.attempt === 1);
    const originalByQuestion = new Map(originalScores.map((item) => [item.questionIndex, item.score]));
    const retryRequired = [...originalByQuestion.entries()].filter(([, score]) => score < 2);
    const retryCompleted = retryRequired.every(([index]) =>
      questionScores.some((item) => item.attempt === 2 && item.questionIndex === index),
    );
    const complete =
      body.data.attempt === 1
        ? attemptScores.length >= getInternalCourse().lectures[body.data.lectureId - 1].questions.length
        : body.data.attempt === 2
          ? originalScores.length >= getInternalCourse().lectures[body.data.lectureId - 1].questions.length && retryCompleted
          : attemptScores.length >= getInternalCourse().lectures[body.data.lectureId - 1].questions.length;
    await db
      .update(lectureProgressTable)
      .set({
        status: complete && total >= 8 ? "passed" : "available",
        bestScore: total,
        nextRetakeAt: complete && body.data.attempt >= 2 && total < 8
          ? new Date(Date.now() + 24 * 60 * 60 * 1000)
          : complete && total >= 8
            ? null
            : undefined,
        updatedAt: new Date(),
      })
      .where(and(
        eq(lectureProgressTable.clerkUserId, studentId),
        eq(lectureProgressTable.lectureId, body.data.lectureId),
      ));
    if (total >= 8 && body.data.lectureId < 5) {
      await db
        .update(lectureProgressTable)
        .set({ status: "available", updatedAt: new Date() })
        .where(and(
          eq(lectureProgressTable.clerkUserId, studentId),
          eq(lectureProgressTable.lectureId, body.data.lectureId + 1),
        ));
    }
  }
  res.status(201).json(
    SaveScoreResponse.parse({
      id: score?.id,
      kind: score?.kind,
      lectureId: score?.lectureId,
      questionIndex: score?.questionIndex,
      score: score?.score,
      feedback: score?.feedback,
      attempt: score?.attempt,
      createdAt: score?.createdAt,
    }),
  );
});

export default router;
