import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface InternalQuestion {
  question: string;
  answer: string;
}

export interface InternalExamQuestion {
  prompt: string;
  criteria: string;
}

export interface InternalLecture {
  id: number;
  title: string;
  topics: string[];
  sections: { heading: string; text: string }[];
  questions: InternalQuestion[];
}

export interface InternalCourse {
  title: string;
  subtitle: string;
  lectures: InternalLecture[];
  finalExam: { questions: InternalExamQuestion[]; rubric: string };
  gradingRules: string;
  teachingContent: string;
}

let cached: InternalCourse | undefined;

function requiredMatch(match: RegExpMatchArray | null, label: string): RegExpMatchArray {
  if (!match) throw new Error(`The canonical course source is missing ${label}.`);
  return match;
}

function parseCourse(source: string): InternalCourse {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const title = lines[0]?.trim();
  const subtitle = lines[1]?.trim();
  if (!title || !subtitle) throw new Error("The canonical course source has no title or subtitle.");

  const lectureHeaders: { id: number; title: string; line: number }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i]?.match(/^LECTURE (\d+): (.+)$/);
    if (match) lectureHeaders.push({ id: Number(match[1]), title: match[2] ?? "", line: i });
  }

  const lectures: InternalLecture[] = lectureHeaders.map((header) => {
    const questionMarker = lines.findIndex(
      (line, index) => index > header.line && line === `LECTURE ${header.id}: ORAL QUESTIONS`,
    );
    if (questionMarker < 0) throw new Error(`Lecture ${header.id} has no oral questions section.`);
    const nextHeader = lectureHeaders.find((item) => item.line > header.line);
    const sectionLines = lines.slice(header.line + 1, questionMarker);
    const topicsLine = sectionLines.find((line) => line.startsWith("Topics: "));
    if (!topicsLine) throw new Error(`Lecture ${header.id} has no topics line.`);

    const sections: InternalLecture["sections"] = [];
    for (const line of sectionLines) {
      const intro = line.match(/^Introduction\.\s*(.*)$/);
      const conclusion = line.match(/^Conclusion\.\s*(.*)$/);
      const numbered = line.match(/^(\d+)\.\s+([^.]+)\.\s+(.*)$/);
      if (intro) sections.push({ heading: "Introduction", text: intro[1] ?? "" });
      else if (numbered) {
        sections.push({
          heading: `${numbered[1]}. ${numbered[2]}`,
          text: numbered[3] ?? "",
        });
      } else if (conclusion) sections.push({ heading: "Conclusion", text: conclusion[1] ?? "" });
    }

    const questionEnd = nextHeader?.line ?? lines.findIndex((line, index) => index > questionMarker && line === "FINAL ORAL EXAM");
    const end = questionEnd < 0 ? lines.length : questionEnd;
    const questionLines = lines.slice(questionMarker + 1, end);
    const questions: InternalQuestion[] = [];
    for (const line of questionLines) {
      const match = line.match(/^\d+\.\s+(.*?)\s+\(Answer:\s*(.*?)\)$/);
      if (match) questions.push({ question: match[1] ?? "", answer: match[2] ?? "" });
    }
    if (sections.length !== 8 || questions.length !== 6) {
      throw new Error(`Lecture ${header.id} is incomplete in the canonical course source.`);
    }
    return {
      id: header.id,
      title: header.title,
      topics: topicsLine.slice("Topics: ".length).split("; "),
      sections,
      questions,
    };
  });

  const examStart = lines.findIndex((line) => line === "FINAL ORAL EXAM");
  const rubricStart = lines.findIndex((line) => line === "GRADING RUBRIC");
  requiredMatch(examStart >= 0 ? [String(examStart)] as unknown as RegExpMatchArray : null, "the final exam");
  requiredMatch(rubricStart >= 0 ? [String(rubricStart)] as unknown as RegExpMatchArray : null, "the grading rubric");

  const examLines = lines.slice(examStart + 1, rubricStart);
  const examQuestions: InternalExamQuestion[] = [];
  for (let i = 0; i < examLines.length; i += 1) {
    const question = examLines[i]?.match(/^\d+\.\s+(.+)$/);
    const criteria = examLines[i + 1]?.match(/^A strong answer covers:\s*(.+)$/);
    if (question && criteria) {
      examQuestions.push({ prompt: question[1] ?? "", criteria: criteria[1] ?? "" });
      i += 1;
    }
  }
  if (lectures.length !== 5 || examQuestions.length !== 5) {
    throw new Error("The canonical course source must contain five lectures and five final exam questions.");
  }

  const gradingRules = lines.slice(rubricStart).join("\n").trim();
  const teachingContent = [
    `${title}\n${subtitle}`,
    ...lectures.map((lecture) =>
      [
        `LECTURE ${lecture.id}: ${lecture.title}`,
        `Topics: ${lecture.topics.join("; ")}`,
        ...lecture.sections.map((section) => `${section.heading}. ${section.text}`),
      ].join("\n"),
    ),
  ].join("\n\n");

  return {
    title,
    subtitle,
    lectures,
    finalExam: { questions: examQuestions, rubric: gradingRules },
    gradingRules,
    teachingContent,
  };
}

export function getInternalCourse(): InternalCourse {
  if (cached) return cached;
  const sourcePath = resolve(process.cwd(), "src/data/course-source.txt");
  const source = readFileSync(sourcePath, "utf8");
  cached = parseCourse(source);
  return cached;
}

export function getPublicCourse() {
  const course = getInternalCourse();
  return {
    title: course.title,
    subtitle: course.subtitle,
    lectures: course.lectures.map(({ questions, ...lecture }) => ({
      ...lecture,
      questions: questions.map(({ question }) => ({ question })),
    })),
    finalExam: {
      questions: course.finalExam.questions.map(({ prompt }) => ({ prompt })),
      rubric: course.finalExam.rubric,
    },
    gradingRules: course.gradingRules,
  };
}
