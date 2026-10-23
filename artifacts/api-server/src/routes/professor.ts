import { Readable } from "node:stream";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  AskProfessorBody,
  AskProfessorResponse,
  GetTranscriptionTokenResponse,
  GradeExamAnswerBody,
  GradeExamAnswerResponse,
  GradeLectureAnswerBody,
  GradeLectureAnswerResponse,
  SpeakTextBody,
} from "@workspace/api-zod";
import { db, oralExamScenariosTable, oralSessionsTable } from "@workspace/db";
import { getInternalCourse } from "../lib/courseContent";
import { getEffectiveUserId, getStudentId, requireStudent } from "../middlewares/requireStudent";

const router: IRouter = Router();
const openingPreviewAudio = new Map<string, Buffer>();
const guestUse = new Map<string, number>();
const guestPending = new Set<string>();
const guestIntervalMs = 24 * 60 * 60 * 1000;
const wordCount = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;

function allowOneGuestUse(req: Request, res: Response, key: string): boolean {
  const now = Date.now();
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const storeKey = `${key}:${ip}`;
  const lastUse = guestUse.get(storeKey);
  if ((lastUse && now - lastUse < guestIntervalMs) || guestPending.has(storeKey)) {
    res.status(429).json({ error: "The spoken preview limit has been reached. Please try again later." });
    return false;
  }
  guestPending.add(storeKey);
  return true;
}

function finishGuestUse(req: Request, key: string, success: boolean): void {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const storeKey = `${key}:${ip}`;
  guestPending.delete(storeKey);
  if (success) guestUse.set(storeKey, Date.now());
}

async function openAiJson<T>(messages: unknown[]): Promise<T> {
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
      messages,
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  if (!response.ok) throw new Error("The AI professor could not complete the request.");
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("The AI professor returned an empty response.");
  return JSON.parse(content) as T;
}

function providerError(res: Response, message: string): void {
  res.status(502).json({ error: message });
}

router.post("/professor/dialogue", async (req, res): Promise<void> => {
  const authUserId = getEffectiveUserId(req, res);
  const parsed = AskProfessorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (wordCount(parsed.data.question) > 350 || parsed.data.history.length > 24) {
    res.status(413).json({ error: "Please ask a shorter question or start a new conversation." });
    return;
  }
  if (!authUserId && !allowOneGuestUse(req, res, "dialogue")) return;
  const history = parsed.data.history.slice(-12).map((message) => ({
    role: message.role,
    content: message.content.slice(0, 4000),
  }));
  try {
    const result = await openAiJson<{ answer?: string }>([
      {
        role: "system",
        content:
          "You are a professor teaching Basic Tenets of Psychoanalysis. Answer the student's questions clearly and concisely in spoken style (short paragraphs, no lists or markdown). Ground answers in the course content provided below. You may go beyond it to clarify, but never contradict it. Engage objections seriously. Keep answers under about 150 words unless the student asks for more.\n\n" +
          getInternalCourse().teachingContent,
      },
      ...history,
      { role: "user", content: parsed.data.question },
      {
        role: "system",
        content: 'Return strict JSON only in the shape {"answer":"..."}; the answer must be plain spoken prose, not markdown.',
      },
    ]);
    if (!result.answer?.trim()) throw new Error("The AI professor returned no answer.");
    if (!authUserId) finishGuestUse(req, "dialogue", true);
    res.json(AskProfessorResponse.parse({ answer: result.answer.trim() }));
  } catch {
    if (!authUserId) finishGuestUse(req, "dialogue", false);
    providerError(res, "The professor could not respond. Please try again.");
  }
});

router.post("/professor/grade-lecture", requireStudent, async (req, res): Promise<void> => {
  const parsed = GradeLectureAnswerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const lecture = getInternalCourse().lectures[parsed.data.lectureId - 1];
  const question = lecture?.questions[parsed.data.questionIndex];
  if (!question) {
    res.status(404).json({ error: "Lecture question not found." });
    return;
  }
  try {
    const result = await openAiJson<{ score?: number; feedback?: string }>([
      {
        role: "system",
        content:
          "This is an applied course, not a memorization test. Each question presents a fresh situation for the student to adjudicate. Grade the student's spoken reasoning, not wording or agreement with a single preferred interpretation. Rubric: 2 = a defensible judgment applying the relevant lecture concepts to specific case details, with supporting reasons and alternatives or limits when requested; 1 = relevant but partial, vague, or insufficiently justified application; 0 = no relevant case-based reasoning, serious conceptual error, or no answer. Naming a concept or repeating a definition without applying it earns at most 1, never full credit. Accept well-supported alternative interpretations, including a justified rejection of the proposed psychoanalytic reading. Treat the supplied assessment criteria as guidance, not a script or a uniquely correct hidden motive. Do not demand every illustrative criterion when the main adjudication is sound. Do not infer a diagnosis, recovered memory, or certainty about motives from a brief vignette. Return JSON only with score (0, 1, or 2) and concise conversational feedback explaining one strength or gap in the student's reasoning. Never reveal the criteria verbatim.",
      },
      {
        role: "user",
        content: JSON.stringify({
          question: question.question,
          assessmentCriteria: question.answer,
          lectureContent: lecture?.sections.map((section) => `${section.heading}. ${section.text}`).join("\n\n"),
          studentAnswer: parsed.data.studentAnswer,
        }),
      },
    ]);
    const score = Number(result.score);
    if (![0, 1, 2].includes(score) || typeof result.feedback !== "string") {
      throw new Error("Invalid grade response.");
    }
    res.json(GradeLectureAnswerResponse.parse({ score, feedback: result.feedback.trim() }));
  } catch {
    providerError(res, "The answer could not be graded. Please try again.");
  }
});

router.post("/professor/grade-exam", requireStudent, async (req, res): Promise<void> => {
  const parsed = GradeExamAnswerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const questionIndex = parsed.data.questionIndex;
  const studentId = getStudentId(res);
  const [session] = await db
    .select()
    .from(oralSessionsTable)
    .where(and(
      eq(oralSessionsTable.id, parsed.data.sessionId),
      eq(oralSessionsTable.clerkUserId, studentId),
      eq(oralSessionsTable.mode, "final_exam"),
    ));
  if (!session || parsed.data.retake !== (session.attempt > 1)) {
    res.status(403).json({ error: "This exam question is not part of the active session." });
    return;
  }
  const originalQuestion = getInternalCourse().finalExam.questions[questionIndex];
  const [retakeQuestion] = session.attempt > 1
    ? await db
        .select()
        .from(oralExamScenariosTable)
        .where(and(
          eq(oralExamScenariosTable.sessionId, session.id),
          eq(oralExamScenariosTable.clerkUserId, studentId),
          eq(oralExamScenariosTable.questionIndex, questionIndex),
        ))
    : [];
  const question = session.attempt > 1
    ? retakeQuestion && { prompt: retakeQuestion.prompt, criteria: retakeQuestion.criteria }
    : originalQuestion;
  if (!question) {
    res.status(404).json({ error: "Final exam question not found." });
    return;
  }
  try {
    if (!parsed.data.followUpAnswer?.trim()) {
      const assessment = await openAiJson<{ needsFollowUp?: boolean; followUp?: string | null }>([
        {
          role: "system",
          content:
            "Assess whether the student's oral exam answer makes and justifies a judgment about the fresh situation. Use the supplied criteria as guidance, not a uniquely correct interpretation or checklist. Accept supported alternatives, including a reasoned rejection of a proposed reading. A label or definition without case-based reasoning is incomplete. If the reasoning is vague or materially incomplete, ask exactly one short follow-up about the evidence or judgment, not a recall question. If it is sufficiently complete, do not ask a follow-up. Return strict JSON with needsFollowUp (boolean) and followUp (string or null). Do not reveal the criteria.",
        },
        {
          role: "user",
          content: JSON.stringify({ question: question.prompt, criteria: question.criteria, answer: parsed.data.studentAnswer }),
        },
      ]);
      if (assessment.needsFollowUp && String(assessment.followUp ?? "").trim()) {
        res.json(GradeExamAnswerResponse.parse({
          needsFollowUp: true,
          followUp: String(assessment.followUp).trim(),
          score: null,
          feedback: null,
        }));
        return;
      }
    }

    const grade = await openAiJson<{ score?: number; feedback?: string }>([
      {
        role: "system",
        content:
          "Grade the final oral exam answer and its single follow-up response, if present. This is adjudication of a fresh case, not recall of lecture examples. Rubric: 4 = correct concepts, applied precisely to the scenario, conclusion justified, no prompting needed; 3 = sound with minor gaps, or needed one follow-up; 2 = correct concepts but weak application or unjustified conclusion; 1 = uses terms without showing understanding; 0 = wrong or no substantive answer. Accept well-supported alternative judgments, including a justified rejection of a proposed psychoanalytic interpretation. Treat criteria as guidance rather than one mandatory explanation. Consider case evidence, competing explanations, and acknowledged limits; do not demand certainty about hidden motives or a diagnosis. Return JSON only with integer score 0-4 and feedback of at most two sentences. Judge meaning, not wording. Do not reveal the criteria.",
      },
      {
        role: "user",
        content: JSON.stringify({
          question: question.prompt,
          criteria: question.criteria,
          answer: parsed.data.studentAnswer,
          followUpAnswer: parsed.data.followUpAnswer,
          followUpUsed: Boolean(parsed.data.followUpAnswer?.trim()),
        }),
      },
    ]);
    const score = Number(grade.score);
    if (!Number.isInteger(score) || score < 0 || score > 4 || typeof grade.feedback !== "string") {
      throw new Error("Invalid exam grade.");
    }
    res.json(GradeExamAnswerResponse.parse({
      needsFollowUp: false,
      followUp: null,
      score,
      feedback: grade.feedback.trim(),
    }));
  } catch {
    providerError(res, "The exam answer could not be evaluated. Please try again.");
  }
});

router.post("/voice/transcription-token", async (req, res): Promise<void> => {
  const authUserId = getEffectiveUserId(req, res);
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "Speech transcription is not configured." });
    return;
  }
  if (!authUserId && !allowOneGuestUse(req, res, "transcription-token")) return;
  try {
    const response = await fetch("https://api.assemblyai.com/v3/realtime/token?expires_in=60", {
      method: "GET",
      headers: { authorization: apiKey },
    });
    if (!response.ok) throw new Error("AssemblyAI token request failed.");
    const result = (await response.json()) as { token?: string };
    if (!result.token) throw new Error("AssemblyAI returned no token.");
    if (!authUserId) finishGuestUse(req, "transcription-token", true);
    res.json(GetTranscriptionTokenResponse.parse({
      token: result.token,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }));
  } catch {
    if (!authUserId) finishGuestUse(req, "transcription-token", false);
    providerError(res, "A microphone session could not be started. Check your connection and try again.");
  }
});

router.post("/voice/speech", async (req, res): Promise<void> => {
  const authUserId = getEffectiveUserId(req, res);
  const parsed = SpeakTextBody.safeParse(req.body);
  if (!parsed.success || parsed.data.text.trim().length === 0) {
    res.status(400).json({ error: "Professor speech requires text." });
    return;
  }
  if (parsed.data.text.length > (authUserId ? 12_000 : 1_200)) {
    res.status(413).json({ error: "This spoken passage is too long." });
    return;
  }
  const opening = getInternalCourse().lectures[0]?.sections[0];
  const isOpeningPreview = Boolean(opening && parsed.data.text.trim() === `${opening.heading}. ${opening.text}`);
  const limitedGuest = !authUserId && !isOpeningPreview;
  const voiceId = parsed.data.voice === "female"
    ? process.env.ELEVENLABS_FEMALE_VOICE_ID || "EXAVITQu4vr4xnSDxMaL"
    : process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
  const cachedPreview = openingPreviewAudio.get(voiceId);
  if (isOpeningPreview && cachedPreview) {
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(cachedPreview);
    return;
  }
  if (limitedGuest && !allowOneGuestUse(req, res, "speech")) return;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    if (limitedGuest) finishGuestUse(req, "speech", false);
    res.status(503).json({ error: "ELEVENLABS_API_KEY is not configured." });
    return;
  }
  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "content-type": "application/json",
          accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: parsed.data.text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.55, similarity_boost: 0.75, speed: 0.96 },
        }),
      },
    );
    if (!upstream.ok || !upstream.body) {
      if (limitedGuest) finishGuestUse(req, "speech", false);
      res.status(502).json({ error: "ElevenLabs could not generate professor speech." });
      return;
    }
    if (limitedGuest) finishGuestUse(req, "speech", true);
    res.status(200);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    const audioStream = Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream);
    if (isOpeningPreview) {
      const chunks: Buffer[] = [];
      audioStream.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      audioStream.on("end", () => { openingPreviewAudio.set(voiceId, Buffer.concat(chunks)); });
    }
    audioStream.on("error", () => res.destroy());
    audioStream.pipe(res);
  } catch {
    if (limitedGuest) finishGuestUse(req, "speech", false);
    providerError(res, "ElevenLabs speech is unavailable. No text-only professor response was provided.");
  }
});

export default router;
