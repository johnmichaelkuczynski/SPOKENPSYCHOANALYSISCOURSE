import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, CircleHelp, Headphones, Loader2, Mic, RotateCcw, Volume2 } from 'lucide-react';
import { Link, Redirect, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import {
  useAskProfessor, useCreateSession, useGetActivity, useGetCourse, useGetProgress,
  useGetSessions, useGetTranscriptionToken, useGradeExamAnswer, useGradeLectureAnswer,
  useSaveScore, useSaveTranscript, useSpeakText, useUpdateLectureProgress, useRestartCourse
} from '@workspace/api-client-react';
import type { ActivityFeed, Course, Lecture, OralSession, Progress } from '@workspace/api-client-react';
import NotFound from '@/pages/not-found';
import { updateSpeechPreferences, useSpeechPreferences, type ProfessorVoice } from '@/lib/speechPreferences';
import ProfessorAvatars from '@/components/professor-avatars';
import ProfessorDialoguePanel, { type DialogueMessage } from '@/components/professor-dialogue-panel';
import RecordedAnswerPlayback from '@/components/recorded-answer-playback';
import { encodeRecordedAnswer } from '@/lib/recorded-audio';
import { closeCaptureAudioContext } from '@/lib/audio-context-cleanup';
import type { ProfessorPersona } from '@/lib/professor-personas';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const DialogueContext = createContext<{ open: (voice?: ProfessorVoice, persona?: ProfessorPersona) => void; isOpen: boolean; persona: ProfessorPersona }>({ open: () => {}, isOpen: false, persona: 'professor' });

function Brand() {
  return <Link href="/" className="brand-mark" data-testid="link-home-brand">
    <span className="brand-symbol" aria-hidden="true">∿</span>
    <span><span className="brand-name">Basic Tenets</span><span className="brand-caption block">An oral course</span></span>
  </Link>;
}

function RestartClassButton() {
  const restart = useRestartCourse();
  return <span className="inline-flex flex-col items-end gap-1">
    <button type="button" className="quiet-link inline-flex items-center gap-1.5"
      data-testid="button-restart-class" disabled={restart.isPending || restart.isSuccess}
      title="Start a fresh course run at Lecture 1. Previous records are kept."
      onClick={() => restart.mutate(undefined, { onSuccess: () => {
        try {
          Object.keys(sessionStorage).filter((key) => key.startsWith('basic-tenets-'))
            .forEach((key) => sessionStorage.removeItem(key));
        } finally {
          // Reload also discards recordings, dialogue, and every previous-run query.
          window.location.assign(`${basePath}/lecture/1`);
        }
      } })}>
      {restart.isPending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
      {restart.isPending ? 'Restarting…' : 'Restart class'}
    </button>
    {restart.isError && <span role="alert" className="text-[#a44d43]">Could not restart. Please try again.</span>}
  </span>;
}

function Header(_props: { signedIn?: boolean }) {
  const preferences = useSpeechPreferences();
  const dialogue = useContext(DialogueContext);
  return <header className="topbar sticky top-0 z-40 !h-auto min-h-[72px] !flex-wrap gap-3 !py-3">
    <Brand />
    <div className="order-3 w-full md:order-2 md:w-auto md:flex-1 ml-auto flex flex-wrap justify-end items-center gap-x-5 gap-y-2 text-xs text-[#58756b]">
      <button type="button" onClick={() => dialogue.open()} className="quiet-link inline-flex items-center gap-1.5"
        data-testid="button-open-professor-dialogue" aria-haspopup="dialog"><CircleHelp size={15} /> Ask the professor</button>
      <RestartClassButton />
      <label className="inline-flex items-center gap-2">Professor voice
        <select aria-label="Professor voice" data-testid="select-professor-voice" value={preferences.voice}
          onChange={(event) => updateSpeechPreferences({ voice: event.target.value === 'female' ? 'female' : 'male' })}
          className="rounded-lg border border-[#ded9ce] bg-transparent px-2 py-1.5 text-[#273b38]">
          <option value="male">Male</option><option value="female">Female</option>
        </select>
      </label>
      <label className="inline-flex items-center gap-2">Lecture speed
        <input type="range" aria-label="Lecture speed" data-testid="input-lecture-speed" min="0.5" max="2" step="0.05"
          value={preferences.speed} onChange={(event) => updateSpeechPreferences({ speed: Number(event.target.value) })}
          className="w-24 accent-[#315e53]" />
        <output className="w-10 tabular-nums">{preferences.speed.toFixed(2)}×</output>
      </label>
    </div>
    <div className="order-2 md:order-3 ml-auto max-w-full"><ProfessorAvatars voice={preferences.voice} persona={dialogue.persona} onChoose={(voice, persona) => dialogue.open(voice, persona)} /></div>
  </header>;
}

function Loading({ label = 'Loading course material' }: { label?: string }) {
  return <div className="page-shell"><Header /><main className="content-column py-14" aria-label={label}>
    <div className="loading-line w-28 mb-8" /><div className="loading-line w-3/4 h-8 mb-4" />
    <div className="loading-line w-1/2 mb-12" /><div className="space-y-4"><div className="loading-line w-full" /><div className="loading-line w-[92%]" /><div className="loading-line w-[84%]" /></div>
  </main></div>;
}

function QueryError({ retry }: { retry: () => void }) {
  return <div className="rounded-xl border border-[#e5c9c1] bg-[#fbf1ed] p-6 text-center">
    <p className="serif text-xl mb-2">The course could not be reached.</p><p className="text-sm text-[#697873] mb-4">Please try again in a moment.</p>
    <button onClick={retry} className="secondary-action" data-testid="button-retry-load">Try again</button>
  </div>;
}

function CourseHome() {
  const courseQuery = useGetCourse();
  if (courseQuery.isLoading) return <Loading />;
  if (courseQuery.isError || !courseQuery.data) return <div className="page-shell"><Header /><main className="content-column py-16"><QueryError retry={() => courseQuery.refetch()} /></main></div>;
  return <Portal course={courseQuery.data} />;
}

function CourseIntroduction({ course }: { course: Course }) {
  return <div className="page-shell">
    <Header />
    <main className="main-wrap">
      <section className="pt-20 pb-16 md:pt-28 md:pb-24 fade-in">
        <p className="eyebrow text-[#58756b] mb-7">A guided course in psychoanalysis</p>
        <h1 className="serif text-[clamp(48px,8vw,82px)] leading-[1.03] tracking-[-.045em] max-w-[780px] text-[#263b38]" data-testid="text-course-title">{course.title}</h1>
        <p className="serif text-[clamp(21px,3vw,29px)] leading-relaxed text-[#65716b] mt-6 max-w-[650px]" data-testid="text-course-subtitle">{course.subtitle}</p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link href="/" className="primary-action" data-testid="link-begin-study">Begin studying <ArrowRight size={16} /></Link>
          <span className="text-sm text-[#7c827b]">An oral class, at your own pace</span>
        </div>
        {course.lectures[0]?.sections[0] && <ProfessorPreview text={`${course.lectures[0].sections[0].heading}. ${course.lectures[0].sections[0].text}`} />}
      </section>
      <div className="divider-label mb-8">The course of study</div>
      <section className="pb-20">
        {course.lectures.map((lecture, i) => <article key={lecture.id} className="grid grid-cols-[52px_1fr] gap-4 md:gap-7 py-7 border-b border-[#e5e0d5]">
          <span className="serif text-2xl text-[#9a9d91] pt-1">{String(i + 1).padStart(2, '0')}</span>
          <div><h2 className="serif text-[24px] md:text-[29px] text-[#2d403c]">{lecture.title}</h2>
            <p className="text-sm text-[#77817b] mt-2 leading-relaxed">{lecture.topics.join(' · ')}</p>
          </div>
        </article>)}
        <article className="grid grid-cols-[52px_1fr] gap-4 md:gap-7 py-7 border-b border-[#e5e0d5]">
          <span className="serif text-2xl text-[#9a9d91] pt-1">{String(course.lectures.length + 1).padStart(2, '0')}</span>
          <div><h2 className="serif text-[24px] md:text-[29px] text-[#2d403c]">Final oral exam</h2><p className="text-sm text-[#77817b] mt-2">Application of the course concepts to cases.</p></div>
        </article>
      </section>
      <section className="border-t border-[#ded9ce] py-12">
        <div><p className="eyebrow text-[#58756b] mb-3">How learning happens</p><h2 className="serif text-3xl text-[#2d403c]">Read closely. Think aloud.</h2>
          <p className="mt-4 text-[15px] leading-7 text-[#64716b] max-w-xl">Each lecture is presented in its original text. Afterward, respond to questions aloud and receive feedback on your understanding.</p>
        </div>
        <div className="border-l border-[#ded9ce] pl-6"><Headphones size={19} className="text-[#55766a] mb-3" /><p className="text-sm leading-6 text-[#64716b]">A microphone is required for oral responses. No written-answer alternative is provided.</p></div>
      </section>
      <section className="border-t border-[#ded9ce] py-12">
        <p className="eyebrow text-[#58756b] mb-3">Grading rules</p>
        <div className="serif whitespace-pre-wrap text-[16px] leading-7 text-[#5c6c64] max-w-3xl" data-testid="text-grading-rules">{course.gradingRules}</div>
      </section>
      <footer className="border-t border-[#ded9ce] py-7 flex justify-between text-xs text-[#879087]"><span>Basic Tenets · An Oral Course</span><span>Study at your own pace</span></footer>
    </main>
  </div>;
}

function Portal({ course }: { course: Course }) {
  const professorDialogue = useContext(DialogueContext);
  const progressQuery = useGetProgress();
  const activityQuery = useGetActivity();
  const updateProgress = useUpdateLectureProgress();
  const [portalError, setPortalError] = useState('');
  const [, setLocation] = useLocation();
  if (progressQuery.isLoading) return <Loading label="Loading your course portal" />;
  if (progressQuery.isError || !progressQuery.data) return <div className="page-shell"><Header signedIn /><main className="content-column py-14"><QueryError retry={() => progressQuery.refetch()} /></main></div>;
  const progress = progressQuery.data;
  const lectures = course.lectures;
  const completed = progress.lectures.filter((item) => item.status === 'passed').length;
  const openLecture = progress.lectures.find((item) => item.status === 'available') ?? progress.lectures.find((item) => item.status !== 'locked') ?? progress.lectures[0];
  const openLectureStatus = progress.lectures.find((item) => item.lectureId === openLecture?.lectureId)?.status;
  const continueStudy = () => {
    if (!openLecture) return;
    setPortalError('');
    updateProgress.mutate({ lectureId: openLecture.lectureId, data: { status: openLectureStatus === 'passed' ? 'passed' : 'available', currentSection: openLecture.currentSection } }, {
      onSuccess: () => setLocation(`/lecture/${openLecture.lectureId}`),
      onError: () => setPortalError('Your course position could not be updated. Try again.'),
    });
  };
  return <div className="page-shell"><Header signedIn />
    <main className="main-wrap py-12 md:py-16 fade-in">
      <div className="flex flex-wrap items-end justify-between gap-5 mb-11">
        <div><p className="eyebrow text-[#58756b] mb-3">Your course room</p><h1 className="serif text-4xl md:text-5xl text-[#263b38]">Welcome, {progress.displayName}</h1></div>
        <div className="flex gap-3">
          <button type="button" onClick={() => professorDialogue.open()} className="secondary-action" data-testid="link-dialogue"><CircleHelp size={16} /> Ask the professor</button>
          <Link href="/results" className="secondary-action" data-testid="link-results">Results <ArrowRight size={15} /></Link>
        </div>
      </div>
      <section className="mb-11 border-y border-[#dfdbd0] py-5 flex flex-wrap gap-x-10 gap-y-4 text-sm">
        <span><strong className="text-[#315e53]">{completed}</strong><span className="text-[#7b827b]"> / {progress.lectureTotal} lectures passed</span></span>
        <span><strong className="text-[#315e53]">{progress.gradePercent ?? '—'}%</strong><span className="text-[#7b827b]"> course grade</span></span>
        <span><strong className="text-[#315e53]">{activityQuery.data?.transcriptCount ?? 0}</strong><span className="text-[#7b827b]"> oral responses</span></span>
      </section>
      <div>
        <section>
          <div className="flex items-center justify-between mb-3"><h2 className="eyebrow text-[#718078]">Lectures</h2><span className="text-xs text-[#858b83]">{completed} of {lectures.length} complete</span></div>
          <div className="border-t border-[#dfdbd0]">
            {lectures.map((lecture, i) => {
              const item = progress.lectures.find((p) => p.lectureId === lecture.id);
              const passed = item?.status === 'passed';
              return <div key={lecture.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 py-4 border-b border-[#dfdbd0]">
                <button onClick={() => setLocation(`/lecture/${lecture.id}`)} className="flex-1 min-w-[240px] text-left grid grid-cols-[40px_1fr_auto] gap-3 items-center py-1" data-testid={`button-lecture-${lecture.id}`}>
                <span className="serif text-xl text-[#8d978f]">{String(i + 1).padStart(2, '0')}</span>
                <span><span className="block serif text-xl text-[#2d403c]">{lecture.title}</span><span className="block mt-1 text-xs text-[#818980]">{passed ? 'Passed' : item?.attempts ? `Attempt ${item.attempts}` : 'Available'}</span></span>
                {passed ? <Check size={18} className="text-[#55766a]" /> : <ArrowRight size={17} className="text-[#55766a]" />}
                </button>
                <Link href={`/lecture/${lecture.id}/questions`} className="secondary-action !px-4 !py-2 text-xs" data-testid={`link-assessment-${lecture.id}`}>Post-lecture assessment <ArrowRight size={14} /></Link>
              </div>;
            })}
          </div>
          <Link href="/exam" className="w-full text-left grid grid-cols-[40px_1fr_auto] gap-3 items-center py-5 border-b border-[#dfdbd0]" data-testid="button-final-exam">
            <span className="serif text-xl text-[#8d978f]">{String(lectures.length + 1).padStart(2, '0')}</span><span><span className="block serif text-xl text-[#2d403c]">Final oral exam</span><span className="block mt-1 text-xs text-[#818980]">Open directly · No prerequisites</span></span>
            <ArrowRight size={17} className="text-[#55766a]" />
          </Link>
          {openLecture && <button onClick={continueStudy} className="primary-action mt-7" disabled={updateProgress.isPending} data-testid="button-continue-study">{updateProgress.isPending ? 'Opening lecture…' : 'Continue studying'} <ArrowRight size={16} /></button>}
          {portalError && <p className="mt-3 text-sm text-[#a34b43]" role="alert">{portalError}</p>}
        </section>
        <aside className="mt-12 pt-8 border-t border-[#dfdbd0]">
          <h2 className="eyebrow text-[#718078] mb-4">Recent activity</h2>
          {activityQuery.isLoading ? <div className="space-y-3"><div className="loading-line" /><div className="loading-line w-4/5" /></div> : activityQuery.isError ? <button className="quiet-link" onClick={() => activityQuery.refetch()}>Retry activity</button> : activityQuery.data?.recent.length ? <ol className="space-y-4">
            {activityQuery.data.recent.map((event) => <li key={event.id} className="border-l border-[#d7d4c9] pl-3"><span className="block text-sm text-[#53645e]">{event.label}</span><time className="text-xs text-[#93978e]">{new Date(event.createdAt).toLocaleDateString()}</time></li>)}
          </ol> : <p className="text-sm leading-6 text-[#828981]">Your course activity will appear here as you study.</p>}
          <div className="mt-10 border-t border-[#dfdbd0] pt-5"><p className="eyebrow text-[#718078] mb-3">Grading rules</p><p className="text-sm leading-6 text-[#6b766f] whitespace-pre-wrap">{course.gradingRules}</p></div>
        </aside>
      </div>
    </main>
  </div>;
}

function useProfessorSpeech(channel: 'course' | 'dialogue' = 'course', persona: ProfessorPersona = 'professor') {
  const speak = useSpeakText();
  const preferences = useSpeechPreferences();
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const speechPersonaRef = useRef(persona);
  speechPersonaRef.current = persona;
  const audioVoiceRef = useRef(preferences.voice);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const requestSequence = useRef(0);
  const dialogueHeld = useRef(false);
  const resumeAfterDialogue = useRef(false);
  const completionRef = useRef<((played: boolean) => void) | null>(null);
  const lastTextRef = useRef('');
  const [playing, setPlaying] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speechError, setSpeechError] = useState('');
  useEffect(() => {
    if (channel !== 'course') return;
    const onDialogueOpen = () => {
      dialogueHeld.current = true;
      const audio = audioRef.current;
      resumeAfterDialogue.current = Boolean(audio && !audio.ended && !audio.paused);
      if (audio && !audio.paused) {
        audio.pause();
        setPlaying(false);
        setPaused(true);
      }
    };
    const onDialogueClose = () => {
      dialogueHeld.current = false;
      if (resumeAfterDialogue.current && audioRef.current && !audioRef.current.ended) {
        void audioRef.current.play().then(() => { setPaused(false); setPlaying(true); })
          .catch(() => setSpeechError('Professor audio could not resume. Please replay the spoken material.'));
      }
      resumeAfterDialogue.current = false;
    };
    window.addEventListener('professor-dialogue-open', onDialogueOpen);
    window.addEventListener('professor-dialogue-close', onDialogueClose);
    return () => {
      window.removeEventListener('professor-dialogue-open', onDialogueOpen);
      window.removeEventListener('professor-dialogue-close', onDialogueClose);
    };
  }, [channel]);
  const play = useCallback(async (text: string): Promise<boolean> => {
    const sequence = ++requestSequence.current;
    const speechPersona = speechPersonaRef.current;
    lastTextRef.current = text;
    setSpeechError('');
    completionRef.current?.(false);
    completionRef.current = null;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.remove();
    }
    setPlaying(false);
    setPaused(false);
    setRequesting(true);
    const audio = new Audio();
    // Keep the active media element inspectable without displaying native controls.
    audio.dataset.professorAudio = channel;
    audio.hidden = true;
    document.body.appendChild(audio);
    const voice = preferencesRef.current.voice;
    audioVoiceRef.current = voice;
    audio.defaultPlaybackRate = preferencesRef.current.speed;
    audio.playbackRate = preferencesRef.current.speed;
    audio.preservesPitch = true;
    audioRef.current = audio;
    let finish: ((played: boolean) => void) | null = null;
    const completed = new Promise<boolean>((resolve) => { finish = resolve; });
    completionRef.current = (played) => {
      finish?.(played);
      completionRef.current = null;
    };
    const setFailure = () => {
      if (sequence !== requestSequence.current) return;
      setPlaying(false);
      setPaused(false);
      setRequesting(false);
      setSpeechError('The professor’s speech could not be generated or played. Audio is required for this class; retry the spoken section.');
      completionRef.current?.(false);
    };
    try {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
      const mimeType = 'audio/mpeg';
      const canStream = typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(mimeType);
      if (canStream) {
        const mediaSource = new MediaSource();
        const url = URL.createObjectURL(mediaSource);
        objectUrlRef.current = url;
        audio.src = url;
        audio.onended = () => {
          if (sequence === requestSequence.current) {
            setPlaying(false);
            setPaused(false);
            setRequesting(false);
          }
          completionRef.current?.(true);
        };
        audio.onerror = setFailure;
        const open = new Promise<void>((resolve, reject) => {
          mediaSource.addEventListener('sourceopen', () => resolve(), { once: true });
          mediaSource.addEventListener('error', () => reject(new Error('Audio stream failed.')), { once: true });
        });
        const playback = audio.play().then(() => {
          if (sequence === requestSequence.current) {
            setRequesting(false);
            if (dialogueHeld.current) {
              resumeAfterDialogue.current = true;
              audio.pause();
              setPaused(true);
              setPlaying(false);
            } else setPlaying(true);
          }
        }).catch(setFailure);
        const response = await fetch(`${basePath}/api/voice/speech`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
            body: JSON.stringify({ text, voice, persona: speechPersona }),
        });
        if (!response.ok || !response.body) throw new Error('Audio stream unavailable.');
        await open;
        if (sequence !== requestSequence.current) return false;
        const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
        const append = (chunk: Uint8Array) => new Promise<void>((resolve, reject) => {
          const onUpdate = () => { sourceBuffer.removeEventListener('updateend', onUpdate); resolve(); };
          const onError = () => { sourceBuffer.removeEventListener('error', onError); reject(new Error('Audio stream could not be decoded.')); };
          sourceBuffer.addEventListener('updateend', onUpdate, { once: true });
          sourceBuffer.addEventListener('error', onError, { once: true });
          try { sourceBuffer.appendBuffer(new Uint8Array(chunk).buffer); } catch (error) { reject(error); }
        });
        const reader = response.body.getReader();
        let firstChunk = true;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (sequence !== requestSequence.current) { await reader.cancel(); return false; }
          await append(value);
          if (firstChunk) {
            firstChunk = false;
            setRequesting(false);
          }
        }
        if (firstChunk) throw new Error('The speech stream was empty.');
        if (mediaSource.readyState === 'open') mediaSource.endOfStream();
        await playback;
      } else {
        const blob = await speak.mutateAsync({ data: { text, voice, persona: speechPersona } });
        if (sequence !== requestSequence.current) return false;
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        audio.src = url;
        audio.onended = () => {
          if (sequence === requestSequence.current) {
            setPlaying(false);
            setPaused(false);
            setRequesting(false);
          }
          completionRef.current?.(true);
        };
        audio.onerror = setFailure;
        await audio.play();
        setRequesting(false);
        if (dialogueHeld.current) {
          resumeAfterDialogue.current = true;
          audio.pause();
          setPaused(true);
          setPlaying(false);
        } else setPlaying(true);
      }
      if (sequence !== requestSequence.current) return false;
      return await completed;
    } catch {
      if (sequence === requestSequence.current) setFailure();
      return false;
    }
  }, [speak]);
  const playRef = useRef(play);
  playRef.current = play;
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.defaultPlaybackRate = preferences.speed;
      audioRef.current.playbackRate = preferences.speed;
    }
  }, [preferences.speed]);
  useEffect(() => {
    if (persona === 'professor' && audioVoiceRef.current !== preferences.voice && lastTextRef.current && audioRef.current) {
      void playRef.current(lastTextRef.current);
    }
  }, [preferences.voice, persona]);
  const stop = useCallback(() => { requestSequence.current += 1; completionRef.current?.(false); completionRef.current = null; audioRef.current?.pause(); audioRef.current?.remove(); audioRef.current = null; setRequesting(false); setPlaying(false); setPaused(false); setSpeechError(''); }, []);
  const reset = useCallback((lastText = '', voice?: ProfessorVoice) => { stop(); lastTextRef.current = lastText; audioVoiceRef.current = voice ?? preferencesRef.current.voice; }, [stop]);
  const pause = useCallback(() => { if (audioRef.current) { audioRef.current.pause(); setPaused(true); setPlaying(false); } }, []);
  const resume = useCallback(() => { if (audioRef.current) { void audioRef.current.play().then(() => { setPaused(false); setPlaying(true); }).catch(() => setSpeechError('Professor audio could not resume. Please replay the spoken material.')); } }, []);
  const retry = useCallback(() => {
    if (audioRef.current && !speechError && objectUrlRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play().then(() => {
        if (dialogueHeld.current) { audioRef.current?.pause(); resumeAfterDialogue.current = true; setPaused(true); }
        else { setPlaying(true); setPaused(false); }
      }).catch(() => {
        if (lastTextRef.current) void play(lastTextRef.current);
      });
    } else if (lastTextRef.current) void play(lastTextRef.current);
  }, [play, speechError]);
  useEffect(() => () => { audioRef.current?.pause(); audioRef.current?.remove(); if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); }, []);
  return { play, stop, reset, pause, resume, retry, hasSpeech: !!lastTextRef.current, speaking: speak.isPending || requesting || playing, paused, speechError };
}

function ProfessorPreview({ text }: { text: string }) {
  const speech = useProfessorSpeech();
  return <div className="mt-8 border-l-2 border-[#b7c8bd] pl-5">
    <p className="text-sm text-[#64716b] mb-3">Hear the professor teach the opening passage. No account required.</p>
    {!speech.hasSpeech && <button className="secondary-action" onClick={() => void speech.play(text)} data-testid="button-hear-professor"><Volume2 size={16} /> Hear the professor</button>}
    <ProfessorAudioControls speech={speech} />
  </div>;
}

type OralMode = 'dialogue' | 'lecture_questions' | 'final_exam';
type AnswerGrade = { score: number; feedback: string } | null;

function useOralRecorder() {
  const token = useGetTranscriptionToken();
  const getToken = token.mutateAsync;
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const captureRef = useRef<any>(null);
  const finalTextRef = useRef('');
  const startingRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [transcript, setTranscriptState] = useState('');
  const [recordingUrl, setRecordingUrl] = useState('');
  const recordingUrlRef = useRef('');
  const resetRecording = useCallback(() => {
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    recordingUrlRef.current = '';
    setRecordingUrl('');
  }, []);
  const setTranscript = useCallback((text: string) => {
    setTranscriptState(text);
    if (!text) resetRecording();
  }, [resetRecording]);
  const [error, setError] = useState('');
  const stopRequestedRef = useRef(false);
  const canRecognize = typeof window !== 'undefined' && typeof WebSocket !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia && ('AudioContext' in window || 'webkitAudioContext' in window);
  const releaseCapture = useCallback((capture: any, saveRecording = true) => {
    if (!capture) return;
    if (capture.finishTimer) clearTimeout(capture.finishTimer);
    try { capture.processor?.disconnect(); } catch { /* Processor already disconnected. */ }
    try { capture.source?.disconnect(); } catch { /* Source already disconnected. */ }
    if (saveRecording && capture.samples?.length && !capture.recordingSaved) {
      capture.recordingSaved = true;
      try {
        const audio = new Blob([encodeRecordedAnswer(capture.samples)], { type: 'audio/wav' });
        if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
        recordingUrlRef.current = URL.createObjectURL(audio);
        setRecordingUrl(recordingUrlRef.current);
      } catch {
        setError('Your answer could not be prepared for playback. Your transcript is still available.');
      }
    }
    if (capture.samples) capture.samples = [];
    capture.stream?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    void closeCaptureAudioContext(capture);
  }, []);
  const start = useCallback(async () => {
    if (startingRef.current || captureRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setError('');
    setFinalizing(false);
    stopRequestedRef.current = false;
    if (!canRecognize) {
      startingRef.current = false;
      setStarting(false);
      setError('A microphone and live speech transcription are required. This browser cannot provide voice-only answers.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const capture: any = { stream, turns: new Map<number, string>(), samples: [] as Int16Array[] };
      captureRef.current = capture;
      if (stopRequestedRef.current) {
        releaseCapture(capture);
        captureRef.current = null;
        return;
      }
      const temporary = await getTokenRef.current();
      if (stopRequestedRef.current) {
        releaseCapture(capture);
        captureRef.current = null;
        return;
      }
      const w = window as any;
      const AudioContextConstructor = w.AudioContext || w.webkitAudioContext;
      const context = new AudioContextConstructor({ sampleRate: 16000 });
      capture.context = context;
      await context.resume();
      if (stopRequestedRef.current) {
        releaseCapture(capture);
        captureRef.current = null;
        return;
      }
      const socket = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&format_turns=true&token=${encodeURIComponent(temporary.token)}`);
      capture.socket = socket;
      setTranscript('');
      finalTextRef.current = '';
      setRecording(true);
      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        socket.onerror = () => reject(new Error('Live transcription connection failed.'));
        socket.onclose = () => reject(new Error('Live transcription connection ended during setup.'));
      });
      socket.onmessage = (message) => {
        try {
          const result = JSON.parse(String(message.data));
          if (result.type === 'Turn') {
            const ordered = [...capture.turns.entries()].sort(([a], [b]) => a - b).map(([, text]) => text);
            if (result.end_of_turn && result.turn_is_formatted) {
              capture.turns.set(result.turn_order, result.transcript || '');
              finalTextRef.current = [...capture.turns.entries()].sort(([a], [b]) => a - b).map(([, text]) => text).join(' ').trim();
              setTranscript(finalTextRef.current);
              if (stopRequestedRef.current && captureRef.current === null) {
                clearTimeout(capture.finishTimer);
                socket.send(JSON.stringify({ type: 'Terminate' }));
                socket.close();
                setFinalizing(false);
              }
            } else if (!result.end_of_turn) {
              setTranscript([...ordered, result.transcript || ''].filter(Boolean).join(' ').trim());
            }
          }
        } catch { /* Ignore non-transcript control messages. */ }
      };
      socket.onclose = () => {
        setRecording(false);
        setFinalizing(false);
        if (capture.finishTimer) clearTimeout(capture.finishTimer);
        if (captureRef.current === capture) {
          releaseCapture(capture);
          captureRef.current = null;
        }
      };
      socket.onerror = () => {
        setRecording(false);
        setFinalizing(false);
        setError('Live speech transcription failed. Please try recording again.');
        if (captureRef.current === capture) {
          releaseCapture(capture);
          captureRef.current = null;
        }
      };
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      capture.source = source;
      capture.processor = processor;
      processor.onaudioprocess = (event: AudioProcessingEvent) => {
        event.outputBuffer.getChannelData(0).fill(0);
        if (socket.readyState !== WebSocket.OPEN) return;
        const input = event.inputBuffer.getChannelData(0);
        const ratio = context.sampleRate / 16000;
        const output = new Int16Array(Math.floor(input.length / ratio));
        for (let i = 0; i < output.length; i++) {
          const sample = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)]));
          output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }
        capture.samples.push(output);
        socket.send(output.buffer);
      };
      source.connect(processor);
      processor.connect(context.destination);
      if (stopRequestedRef.current) {
        releaseCapture(capture);
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'Terminate' }));
        captureRef.current = null;
        setRecording(false);
      }
    } catch {
      setRecording(false);
      setFinalizing(false);
      const capture = captureRef.current;
      releaseCapture(capture);
      try { capture?.socket?.close(); } catch { /* Connection already closed. */ }
      captureRef.current = null;
      if (!stopRequestedRef.current) setError('Microphone access or live transcription is unavailable. Allow microphone access and try again.');
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [canRecognize, releaseCapture]);
  const stop = useCallback(() => {
    // Cancellation applies during every asynchronous setup step, not just before getUserMedia.
    stopRequestedRef.current = true;
    setRecording(false);
    const capture = captureRef.current;
    if (!capture) return;
    releaseCapture(capture);
    try {
      if (capture.socket?.readyState === WebSocket.OPEN) {
        setFinalizing(true);
        capture.socket.send(JSON.stringify({ type: 'ForceEndpoint' }));
        capture.finishTimer = setTimeout(() => {
          capture.socket?.close();
          setFinalizing(false);
        }, 5000);
      } else {
        setFinalizing(false);
        capture.socket?.close();
      }
    } catch { /* Socket already ended. */ }
    captureRef.current = null;
    setRecording(false);
  }, [releaseCapture]);
  useEffect(() => () => {
    const capture = captureRef.current;
    releaseCapture(capture, false);
    try { capture?.socket?.close(); } catch { /* Socket already ended. */ }
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
  }, [releaseCapture]);
  return { start, stop, starting, recording, finalizing, transcript, setTranscript, recordingUrl, error, setError, supported: canRecognize };
}

function OralRoom({ mode, lectureId }: { mode: OralMode; lectureId?: number }) {
  const { isOpen: dialogueOpen } = useContext(DialogueContext);
  const courseQuery = useGetCourse();
  const progressQuery = useGetProgress();
  const sessionQuery = useGetSessions();
  const createSession = useCreateSession();
  const saveTranscript = useSaveTranscript();
  const saveScore = useSaveScore();
  const askProfessor = useAskProfessor();
  const gradeLecture = useGradeLectureAnswer();
  const gradeExam = useGradeExamAnswer();
  const updateProgress = useUpdateLectureProgress();
  const cache = useQueryClient();
  const [location, setLocation] = useLocation();
  const course = courseQuery.data;
  const lecture: Lecture | undefined = course?.lectures.find((item) => item.id === lectureId);
  const lectureProgress = progressQuery.data?.lectures.find((item) => item.lectureId === lectureId);
  const recorder = useOralRecorder();
  const speech = useProfessorSpeech();
  const [session, setSession] = useState<OralSession | null>(null);
  const sessionOpeningFor = useRef<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [redoUsed, setRedoUsed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hasCapturedAnswer, setHasCapturedAnswer] = useState(false);
  const [grade, setGrade] = useState<AnswerGrade>(null);
  const [followUp, setFollowUp] = useState('');
  const [followUpPending, setFollowUpPending] = useState(false);
  const [examInitialAnswer, setExamInitialAnswer] = useState('');
  const [questionScores, setQuestionScores] = useState<number[]>([]);
  const [dialogue, setDialogue] = useState<{ role: 'student' | 'professor'; text: string }[]>([]);
  const [voiceNotice, setVoiceNotice] = useState('');
  const [finishError, setFinishError] = useState('');
  const modeLabel = mode === 'dialogue' ? 'Professor dialogue' : mode === 'lecture_questions' ? 'Lecture questions' : 'Final oral exam';
  const readyForAnswer = !submitted && !grade;
  const canRecordAnswer = !dialogueOpen && readyForAnswer && !recorder.finalizing && !speech.speaking && !speech.paused && !speech.speechError && (recorder.recording || !hasCapturedAnswer || (redoUsed && !recorder.transcript));
  const stopTestRecording = useRef(recorder.stop);
  stopTestRecording.current = recorder.stop;
  useEffect(() => {
    if (dialogueOpen) stopTestRecording.current();
  }, [dialogueOpen]);
  const questions = mode === 'lecture_questions'
    ? lecture?.questions ?? []
    : session?.examQuestions ?? course?.finalExam.questions ?? [];
  const nextExamAttempt = Math.max(0, ...(sessionQuery.data ?? []).filter((item) => item.mode === 'final_exam').map((item) => item.attempt)) + 1;
  const attempt = mode === 'lecture_questions'
    ? Math.max(lectureProgress?.attempts ?? 0, ...(sessionQuery.data ?? []).filter((item) => item.mode === 'lecture_questions' && item.lectureId === lectureId).map((item) => item.attempt)) + 1
    : mode === 'final_exam'
      ? nextExamAttempt
      : 1;
  const activeAttempt = session?.attempt ?? attempt;
  const retryKey = `basic-tenets-lecture-${lectureId}-missed`;
  const questionIndices = questions.map((_, index) => index);
  const questionNumber = questionIndices[questionIndex] ?? questionIndex;
  const currentQuestion = mode === 'lecture_questions' ? questions[questionNumber] : questions[questionIndex];
  const currentPrompt = mode === 'lecture_questions' ? (currentQuestion as { question: string } | undefined)?.question : (currentQuestion as { prompt: string } | undefined)?.prompt;

  useEffect(() => {
    if (recorder.transcript.trim()) setHasCapturedAnswer(true);
  }, [recorder.transcript]);

  useEffect(() => {
    if (courseQuery.isLoading || !course || sessionQuery.isLoading || sessionQuery.isError || (mode !== 'dialogue' && (progressQuery.isLoading || progressQuery.isError))) return;
    if (mode === 'lecture_questions' && !lecture) return;
    if (sessionOpeningFor.current === location) return;
    sessionOpeningFor.current = location;
    if (mode === 'lecture_questions') sessionStorage.setItem('basic-tenets-active-test', `lecture_questions:${lectureId}`);
    if (mode === 'final_exam') sessionStorage.setItem('basic-tenets-active-test', 'final_exam');
    const sessionMode = mode === 'dialogue' ? 'dialogue' : mode === 'lecture_questions' ? 'lecture_questions' : 'final_exam';
    createSession.mutate({ data: { mode: sessionMode, lectureId: mode === 'lecture_questions' ? lectureId : null, attempt } }, {
      onSuccess: (newSession) => {
        setSession(newSession);
        cache.setQueryData<OralSession[]>(['/api/sessions'], (sessions) => [...(sessions ?? []), newSession]);
      },
      onError: () => {
        sessionOpeningFor.current = null;
        setVoiceNotice('This assessment session could not be opened. Reload the assessment to try again.');
      },
    });
    // Each URL represents a distinct oral session; avoid creating repeated sessions on re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, sessionQuery.isLoading, sessionQuery.isError, courseQuery.isLoading, progressQuery.isLoading, progressQuery.isError]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (dialogueOpen || event.code !== 'Space' || event.repeat || (!canRecordAnswer && !recorder.recording && !recorder.starting)) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName))) return;
      event.preventDefault();
      if (recorder.recording || recorder.starting) recorder.stop();
      else void recorder.start();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); };
  }, [recorder.start, recorder.stop, recorder.recording, recorder.starting, canRecordAnswer, dialogueOpen]);

  useEffect(() => {
    if (mode === 'lecture_questions' && lecture && questions.length) {
      speech.play(lecture.questions[questionNumber]?.question ?? '');
    }
    if (mode === 'final_exam' && currentPrompt) speech.play(currentPrompt);
    // Speech is only started when the active question changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionIndex, mode, lecture?.id, currentPrompt]);


  if (courseQuery.isLoading || progressQuery.isLoading) return <Loading label="Loading oral session" />;
  if (courseQuery.isError || !course || (mode !== 'dialogue' && progressQuery.isError)) return <div className="page-shell"><Header signedIn /><main className="content-column py-14"><QueryError retry={() => { courseQuery.refetch(); progressQuery.refetch(); }} /></main></div>;
  if (mode === 'lecture_questions' && !lecture) return <Redirect to="/" />;
  if (sessionQuery.isError) return <div className="page-shell"><Header signedIn /><main className="content-column py-14"><QueryError retry={() => sessionQuery.refetch()} /></main></div>;

  const persistTranscript = async (role: 'student' | 'professor', text: string, context: string) => {
    if (!session || !text.trim()) return;
    await saveTranscript.mutateAsync({ sessionId: session.id, data: { role, text: text.trim(), context } });
    await cache.invalidateQueries({ queryKey: ['/api/activity'] });
  };
  const resetForNext = () => {
    setQuestionIndex((n) => n + 1);
    setRedoUsed(false);
    setSubmitted(false);
    setGrade(null);
    setFollowUp('');
    setHasCapturedAnswer(false);
    setVoiceNotice('');
    recorder.setTranscript('');
    recorder.setError('');
  };
  const submitAnswer = async () => {
    const answer = recorder.transcript.trim();
    if (!answer || submitted || !session) return;
    setSubmitted(true);
    try {
      await persistTranscript('student', answer, `${modeLabel} · ${questionIndex + 1}`);
      if (mode === 'lecture_questions' && lectureId !== undefined) {
        const graded = await gradeLecture.mutateAsync({ data: { lectureId, questionIndex: questionNumber, studentAnswer: answer } });
        setGrade(graded);
        setQuestionScores((scores) => { const next = [...scores]; next[questionNumber] = graded.score; return next; });
        speech.play(graded.feedback);
        await saveScore.mutateAsync({ data: { kind: 'lecture', lectureId, questionIndex: questionNumber, score: graded.score, feedback: graded.feedback, attempt: activeAttempt, studentAnswer: answer } });
      } else if (mode === 'final_exam') {
        setExamInitialAnswer(answer);
        const graded = await gradeExam.mutateAsync({ data: { sessionId: session.id, questionIndex, studentAnswer: answer, retake: activeAttempt > 1 } });
        if (graded.needsFollowUp && graded.followUp) {
          setFollowUp(graded.followUp);
          setFollowUpPending(true);
          setRedoUsed(false);
          setHasCapturedAnswer(false);
          recorder.setTranscript('');
          speech.play(graded.followUp);
          setSubmitted(false);
        } else {
          setGrade({ score: graded.score ?? 0, feedback: graded.feedback ?? '' });
          speech.play(graded.feedback ?? '');
          setQuestionScores((scores) => { const next = [...scores]; next[questionIndex] = graded.score ?? 0; return next; });
          await saveScore.mutateAsync({ data: { kind: 'exam', questionIndex, score: graded.score ?? 0, feedback: graded.feedback ?? '', attempt: activeAttempt, studentAnswer: answer } });
        }
      } else {
        const reply = await askProfessor.mutateAsync({ data: { question: answer, history: dialogue.map((item) => ({ role: item.role === 'student' ? 'user' as const : 'assistant' as const, content: item.text })) } });
        await persistTranscript('professor', reply.answer, 'Professor dialogue');
        setDialogue((current) => [...current, { role: 'student', text: answer }, { role: 'professor', text: reply.answer }]);
        speech.play(reply.answer);
        setSubmitted(false);
        setRedoUsed(false);
        setHasCapturedAnswer(false);
        recorder.setTranscript('');
      }
    } catch {
      setVoiceNotice('Your response could not be saved. Please try again.');
      setSubmitted(false);
    }
  };

  const submitFollowUp = async () => {
    const answer = recorder.transcript.trim();
    if (!answer || !session || !currentPrompt) return;
    setSubmitted(true);
    try {
      await persistTranscript('student', answer, `${modeLabel} · follow-up ${questionIndex + 1}`);
      const graded = await gradeExam.mutateAsync({ data: { sessionId: session.id, questionIndex, studentAnswer: examInitialAnswer, followUpAnswer: answer, retake: activeAttempt > 1 } });
      setGrade({ score: graded.score ?? 0, feedback: graded.feedback ?? '' });
      speech.play(graded.feedback ?? '');
      setQuestionScores((scores) => { const next = [...scores]; next[questionIndex] = graded.score ?? 0; return next; });
      await saveScore.mutateAsync({ data: { kind: 'exam', questionIndex, score: graded.score ?? 0, feedback: graded.feedback ?? '', attempt: activeAttempt, studentAnswer: `${examInitialAnswer} Follow-up: ${answer}` } });
      setFollowUpPending(false);
    } catch {
      setVoiceNotice('The follow-up could not be saved. Please try again.');
      setSubmitted(false);
    }
  };

  const finishTest = async () => {
    setFinishError('');
    try {
      if (mode === 'lecture_questions' && lectureId !== undefined && lecture) {
        const savedScores = activeAttempt > 1 ? (() => { try { return JSON.parse(sessionStorage.getItem(`${retryKey}-scores`) ?? '[]') as number[]; } catch { return []; } })() : [];
        const combinedScores = Array.from({ length: questions.length }, (_, index) => questionScores[index] ?? savedScores[index] ?? 0);
        if (activeAttempt === 1) {
          const missed = combinedScores.map((score, index) => score < 2 ? index : -1).filter((index) => index >= 0);
          sessionStorage.setItem(retryKey, JSON.stringify(missed));
          sessionStorage.setItem(`${retryKey}-scores`, JSON.stringify(combinedScores));
        } else {
          sessionStorage.removeItem(retryKey);
          sessionStorage.removeItem(`${retryKey}-scores`);
        }
        await updateProgress.mutateAsync({ lectureId, data: { status: 'available', currentSection: lecture.sections.length } });
      }
      if (mode === 'final_exam') await cache.invalidateQueries();
      sessionStorage.removeItem('basic-tenets-active-test');
      setLocation('/');
    } catch {
      setFinishError('Your assessment result could not be finalized. Please try again.');
    }
  };

  const beginAnswer = () => {
    if (recorder.recording || recorder.starting) recorder.stop();
    else if (!canRecordAnswer) return;
    else {
      setVoiceNotice('');
      recorder.setError('');
      void recorder.start();
    }
  };
  const needsFinalScore = grade && questionIndex < questions.length - 1;

  return <div className="page-shell">
    <Header signedIn />
    <main className="content-column py-9 md:py-12 fade-in">
      <div className="flex items-center justify-between mb-9">
        <Link href="/" className="quiet-link inline-flex items-center gap-2" data-testid="link-back-portal"><ChevronLeft size={16} /> Course room</Link>
        <span className="mode-chip" data-testid="status-active-mode"><span className="meter-dot" />{modeLabel}</span>
      </div>
      {mode === 'dialogue' ? <section>
        <p className="eyebrow text-[#718078] mb-3">Open conversation</p>
        <h1 className="serif text-4xl md:text-5xl text-[#263b38] mb-3">Ask the professor</h1>
        <p className="text-sm leading-6 text-[#77817b] mb-9">Speak a question about the course. Dialogue is available outside oral tests.</p>
        <div className="space-y-5 mb-8" aria-live="polite">
          {!dialogue.length && <div className="border-l-2 border-[#b7c8bd] pl-5 py-1"><p className="serif text-lg text-[#52635d]">Your conversation will appear here.</p></div>}
          {dialogue.map((line, i) => <article key={`${i}-${line.role}`} className={`border-l-2 pl-5 py-1 ${line.role === 'professor' ? 'border-[#b7c8bd]' : 'border-[#d9c7aa]'}`}><p className="eyebrow text-[#839087] mb-2">{line.role === 'student' ? 'You' : 'Professor'}</p><p className="serif text-lg leading-7 text-[#40524c]">{line.text}</p></article>)}
        </div>
        <RecorderPanel recorder={recorder} canAnswer={readyForAnswer} canRecord={canRecordAnswer} busy={recorder.finalizing || askProfessor.isPending || saveTranscript.isPending} onToggle={beginAnswer} onSubmit={submitAnswer} redoUsed={redoUsed} onRedo={() => { setRedoUsed(true); recorder.setTranscript(''); }} />
        {voiceNotice && <p className="text-sm text-[#a34b43] mt-3" role="alert">{voiceNotice}</p>}
        {recorder.error && <p className="mt-3 text-sm text-[#a34b43]" role="alert">{recorder.error}</p>}
        <ProfessorAudioControls speech={speech} />
      </section> : mode === 'lecture_questions' || mode === 'final_exam' ? <section>
        <p className="eyebrow text-[#718078] mb-3">{mode === 'lecture_questions' ? lecture?.title : 'Final oral exam'}</p>
        <div className="flex items-end justify-between gap-4 mb-8"><h1 className="serif text-4xl md:text-5xl text-[#263b38]">{mode === 'lecture_questions' ? 'Oral questions' : 'Final examination'}</h1><span className="text-sm text-[#758078] pb-2">{Math.min(questionIndex + 1, questionIndices.length)} / {questionIndices.length}</span></div>
        {currentPrompt ? <div className="border-y border-[#dfdbd0] py-7 mb-7">
        <p className="eyebrow text-[#8a9188] mb-4">Question {questionIndex + 1}{mode === 'lecture_questions' && activeAttempt > 1 ? ' · retry' : ''}</p>
          <p className="serif text-[25px] md:text-[31px] leading-[1.42] text-[#2d403c]" data-testid={`text-question-${questionIndex}`}>{currentPrompt}</p>
          {followUpPending && <div className="mt-6 p-5 bg-[#f0eee5] border-l-2 border-[#a88d62]"><p className="eyebrow text-[#8a7658] mb-2">Follow-up</p><p className="serif text-xl leading-7">{followUp}</p></div>}
        </div> : <div className="border-y border-[#dfdbd0] py-8 text-[#78827b]">All questions in this test have been answered.</div>}
        {grade && <div className="mb-7 border-l-2 border-[#6c8d7d] pl-5 py-1" data-testid="panel-score-feedback"><p className="eyebrow text-[#718078] mb-2">Score · {grade.score}{mode === 'lecture_questions' ? ' / 2' : ' / 4'}</p><p className="serif text-lg leading-7 text-[#46564f]">{grade.feedback}</p></div>}
        {currentPrompt && !grade && <RecorderPanel recorder={recorder} canAnswer={!submitted} canRecord={canRecordAnswer} busy={recorder.finalizing || submitted || gradeLecture.isPending || gradeExam.isPending || createSession.isPending} onToggle={beginAnswer} onSubmit={followUpPending ? submitFollowUp : submitAnswer} redoUsed={redoUsed} onRedo={() => { if (redoUsed) return; setRedoUsed(true); recorder.setTranscript(''); setSubmitted(false); }} />}
        {recorder.error && <p className="mt-3 text-sm text-[#a34b43]" role="alert">{recorder.error}</p>}
        {voiceNotice && <p className="mt-2 text-sm text-[#a34b43]" role="alert">{voiceNotice}</p>}
        <ProfessorAudioControls speech={speech} />
        {finishError && <p className="mt-4 text-sm text-[#a34b43]" role="alert" data-testid="error-finish-assessment">{finishError}</p>}
        {grade && (needsFinalScore || questionIndex === questionIndices.length - 1) && <div className="flex justify-between items-center mt-8">
          {questionIndex < questionIndices.length - 1 ? <button disabled={speech.speaking || speech.paused || !!speech.speechError} onClick={resetForNext} className="primary-action" data-testid="button-next-question">Next question <ArrowRight size={16} /></button> :
            <button disabled={speech.speaking || speech.paused || !!speech.speechError} onClick={finishTest} className="primary-action" data-testid="button-finish-test">{mode === 'lecture_questions' ? 'Finish lecture test' : 'Finish final exam'} <Check size={16} /></button>}
          <span className="text-xs text-[#7f877e]">Your response and score are saved.</span>
        </div>}
      </section> : null}
      {saveTranscript.isPending && <p className="mt-3 text-xs text-[#8a9188]">Saving your transcript…</p>}
    </main>
  </div>;
}

function RecorderPanel({ recorder, canAnswer, canRecord = canAnswer, busy, onToggle, onSubmit, redoUsed, onRedo }: {
  recorder: ReturnType<typeof useOralRecorder>; canAnswer: boolean; canRecord?: boolean; busy: boolean; onToggle: () => void;
  onSubmit: () => void; redoUsed: boolean; onRedo: () => void;
}) {
  return <div className="rounded-2xl border border-[#e2ded3] bg-[#fbfaf5] px-5 py-6 md:px-7">
    <div className="flex flex-col sm:flex-row sm:items-center gap-5">
      <button type="button" className={`talk-button shrink-0 ${recorder.recording ? 'recording' : ''}`} disabled={!recorder.recording && !recorder.starting && (busy || !canRecord)}
        onClick={onToggle} aria-pressed={recorder.recording || recorder.starting}
        aria-label={recorder.recording ? 'Turn microphone off' : recorder.starting ? 'Cancel microphone connection' : 'Turn microphone on'} data-testid="button-push-to-talk">
        {recorder.recording ? <span className="text-xs font-semibold">ON</span> : recorder.starting ? <Loader2 size={25} className="animate-spin" /> : <Mic size={27} strokeWidth={1.6} />}
      </button>
      <div className="flex-1">
        <p className={`eyebrow mb-2 ${recorder.recording ? 'status-live text-[#a34b43]' : 'text-[#718078]'}`}><span className="meter-dot" />{recorder.recording ? 'Microphone on · Listening' : recorder.starting ? 'Connecting microphone' : 'Microphone off'}</p>
        <p className="text-sm leading-6 text-[#758078]">{recorder.recording ? 'Click again to turn the microphone off and finish your response.' : recorder.starting ? 'Click again to cancel the microphone connection.' : recorder.finalizing ? 'Finishing your spoken response…' : 'Click once to turn the microphone on. Click again to turn it off.'}</p>
        {recorder.transcript && <p className="serif text-base leading-6 text-[#43534d] mt-4" aria-live="polite">“{recorder.transcript}”</p>}
      </div>
      {!recorder.recording && recorder.transcript && !busy && <div className="flex flex-wrap gap-2">
        {!redoUsed && <button type="button" onClick={onRedo} className="secondary-action !px-3 !py-2" data-testid="button-rerecord"><RotateCcw size={14} /> Re-record</button>}
        <button type="button" onClick={onSubmit} disabled={!canAnswer || busy} className="primary-action !px-4 !py-2.5" data-testid="button-submit-answer">Submit <ArrowRight size={15} /></button>
      </div>}
      {busy && <span className="text-sm text-[#6c7d74]">Working…</span>}
    </div>
    {!recorder.recording && recorder.recordingUrl && <RecordedAnswerPlayback url={recorder.recordingUrl} />}
    <p className="mt-5 pt-4 border-t border-[#e7e3d9] text-[11px] text-[#899087]">Oral response only · One re-record is allowed before submission.</p>
  </div>;
}

function ProfessorAudioControls({ speech, allowReplay = true }: { speech: ReturnType<typeof useProfessorSpeech>; allowReplay?: boolean }) {
  return <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
    {speech.speaking && <span className="text-xs text-[#58756b] inline-flex items-center gap-2" role="status"><span className="meter-dot" /> Professor speaking</span>}
    {speech.paused && <span className="text-xs text-[#7e765e]" role="status">Professor audio paused</span>}
    {allowReplay && speech.hasSpeech && !speech.speaking && !speech.paused && <button onClick={speech.retry} className="quiet-link inline-flex items-center gap-1" data-testid="button-replay-professor-audio"><Volume2 size={14} /> Replay professor audio</button>}
    {(speech.speaking || speech.paused) && <>
      {speech.speaking && <button onClick={speech.pause} className="quiet-link inline-flex items-center gap-1" data-testid="button-pause-professor-audio">Pause</button>}
      {speech.paused && <button onClick={speech.resume} className="quiet-link inline-flex items-center gap-1" data-testid="button-resume-professor-audio">Resume</button>}
      <button onClick={speech.stop} className="quiet-link inline-flex items-center gap-1" data-testid="button-stop-professor-audio">Stop audio</button>
    </>}
    {speech.speechError && <div className="w-full flex flex-wrap items-center gap-3" role="alert" data-testid="error-professor-speech"><p className="text-sm text-[#a34b43]">{speech.speechError}</p><button onClick={speech.retry} className="quiet-link" data-testid="button-retry-professor-speech">Retry speech</button></div>}
  </div>;
}

function LecturePage({ lectureId }: { lectureId: number }) {
  const courseQuery = useGetCourse();
  const progressQuery = useGetProgress();
  const progressMutation = useUpdateLectureProgress();
  const speech = useProfessorSpeech();
  const [, setLocation] = useLocation();
  const lecture = courseQuery.data?.lectures.find((item) => item.id === lectureId);
  const [section, setSection] = useState(0);
  useEffect(() => {
    const saved = progressQuery.data?.lectures.find((item) => item.lectureId === lectureId);
    if (saved) setSection(Math.min(saved.currentSection, Math.max(0, (lecture?.sections.length ?? 1) - 1)));
  }, [lectureId, progressQuery.data?.lectures, lecture?.sections.length]);
  useEffect(() => {
    if (currentSectionText(lecture, section)) {
      const currentSection = lecture?.sections[section];
      if (currentSection) speech.play(`${currentSection.heading}. ${currentSection.text}`);
    }
    // Automatically speak every section when it becomes the active lecture text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lecture?.id, section]);
  if (courseQuery.isLoading || progressQuery.isLoading) return <Loading label="Loading lecture" />;
  if (courseQuery.isError || progressQuery.isError || !courseQuery.data || !lecture) return <div className="page-shell"><Header signedIn /><main className="content-column py-12"><QueryError retry={() => { courseQuery.refetch(); progressQuery.refetch(); }} /></main></div>;
  const current = lecture.sections[section];
  const move = (next: number) => {
    const bounded = Math.max(0, Math.min(next, lecture.sections.length - 1));
    setSection(bounded);
    const savedStatus = progressQuery.data?.lectures.find((item) => item.lectureId === lectureId)?.status;
    progressMutation.mutate({ lectureId, data: { status: savedStatus === 'passed' ? 'passed' : 'available', currentSection: bounded } });
  };
  return <div className="page-shell"><Header signedIn /><main className="content-column py-9 md:py-12 fade-in">
    <div className="flex items-center justify-between mb-9"><Link href="/" className="quiet-link inline-flex items-center gap-2"><ChevronLeft size={16} /> Course room</Link><span className="mode-chip"><BookOpen size={13} /> Lecture</span></div>
    <p className="eyebrow text-[#718078] mb-3">Lecture {lectureId}</p>
    <h1 className="serif text-4xl md:text-[52px] leading-tight text-[#263b38] mb-5" data-testid="text-lecture-title">{lecture.title}</h1>
    <p className="text-sm leading-6 text-[#78817b] mb-8">{lecture.topics.join(' · ')}</p>
    <div className="flex items-center justify-between border-y border-[#dfdbd0] py-3 mb-10 text-xs text-[#818980]"><span>Section {section + 1} of {lecture.sections.length}</span><div className="flex items-center gap-1">{lecture.sections.map((_, i) => <span key={i} className={`block h-1.5 rounded-full ${i === section ? 'w-7 bg-[#54776a]' : i < section ? 'w-3 bg-[#b0c2b8]' : 'w-3 bg-[#e1ded5]'}`} />)}</div></div>
    <article className="lecture-copy">
      <h2 className="serif text-[27px] md:text-[32px] leading-tight text-[#314743] mb-6">{current.heading}</h2>
      {current.text.split(/\n+/).filter(Boolean).map((paragraph, i) => <p key={`${section}-${i}`}>{paragraph}</p>)}
    </article>
    <div className="flex flex-wrap items-center gap-3 mt-10">
      <button className="secondary-action" onClick={() => speech.play(`${current.heading}. ${current.text}`)} disabled={speech.speaking} data-testid="button-replay-lecture"><Volume2 size={16} /> Replay this section</button>
    </div>
    <ProfessorAudioControls speech={speech} allowReplay={false} />
    <div className="mt-12 pt-6 border-t border-[#dfdbd0] flex items-center justify-between gap-3">
      <button className="secondary-action" disabled={section === 0} onClick={() => move(section - 1)} data-testid="button-previous-section"><ChevronLeft size={16} /> Previous</button>
      {section < lecture.sections.length - 1 ? <button className="primary-action" onClick={() => move(section + 1)} data-testid="button-next-section">Continue <ChevronRight size={16} /></button> :
        <button className="primary-action" onClick={() => setLocation(`/lecture/${lectureId}/questions`)} data-testid="button-start-lecture-test">Begin oral questions <ArrowRight size={16} /></button>}
    </div>
    {progressMutation.isError && <p role="alert" className="text-sm text-[#a34b43] mt-3">Your reading position could not be saved.</p>}
  </main></div>;
}

function currentSectionText(lecture: Lecture | undefined, section: number) {
  return lecture?.sections[section]?.text;
}

function Results() {
  const progressQuery = useGetProgress();
  const activityQuery = useGetActivity();
  const courseQuery = useGetCourse();
  if (progressQuery.isLoading || courseQuery.isLoading) return <Loading label="Loading results" />;
  if (progressQuery.isError || !progressQuery.data || courseQuery.isError || !courseQuery.data) return <div className="page-shell"><Header signedIn /><main className="content-column py-12"><QueryError retry={() => { progressQuery.refetch(); courseQuery.refetch(); }} /></main></div>;
  const p: Progress = progressQuery.data;
  const activity: ActivityFeed | undefined = activityQuery.data;
  return <div className="page-shell"><Header signedIn /><main className="content-column py-10 md:py-14">
    <Link href="/" className="quiet-link inline-flex items-center gap-2 mb-9"><ChevronLeft size={16} /> Course room</Link>
    <p className="eyebrow text-[#718078] mb-3">Course record</p><h1 className="serif text-5xl text-[#263b38] mb-9">Results</h1>
    {p.result && p.certificateDate ? <div className="cert-paper mb-10">
      <p className="eyebrow text-[#7a846f] mb-5">Certificate of completion</p>
      <h2 className="serif text-3xl md:text-4xl text-[#2d403c] mb-4">{courseQuery.data.title}</h2>
      <p className="serif text-lg text-[#68736b]">Awarded to</p><p className="serif text-2xl text-[#315e53] mt-1">{p.displayName}</p>
      <p className="mt-5 text-sm text-[#78817b]">{p.result === 'distinction' ? 'Pass with distinction' : p.result === 'pass' ? 'Passed' : 'Course result'}</p>
      <p className="mt-2 text-xs text-[#8d9389]">{new Date(p.certificateDate).toLocaleDateString()}</p>
    </div> : <div className="border border-[#e2ded3] bg-[#fbfaf5] p-6 mb-9"><p className="serif text-xl text-[#344844]">Your certificate will appear here when your course result is recorded.</p><p className="text-sm text-[#7b837b] mt-2">Continue through the lectures and final exam to complete the course.</p></div>}
    <section className="grid grid-cols-2 gap-5 border-y border-[#dfdbd0] py-6">
      <div><p className="eyebrow text-[#839087]">Overall grade</p><p className="serif text-4xl text-[#315e53] mt-2">{p.gradePercent === null ? '—' : `${p.gradePercent}%`}</p></div>
      <div><p className="eyebrow text-[#839087]">Result</p><p className="serif text-2xl text-[#315e53] mt-3 capitalize">{p.result ?? 'In progress'}</p></div>
    </section>
    <section className="py-8"><h2 className="eyebrow text-[#718078] mb-5">Assessment record</h2>
      <div className="space-y-3">{courseQuery.data.lectures.map((lecture) => {
        const record = p.lectures.find((item) => item.lectureId === lecture.id);
        return <div key={lecture.id} className="flex justify-between gap-3 py-3 border-b border-[#e7e3d9]"><span className="serif text-lg text-[#40514b]">{lecture.title}</span><span className="text-sm text-[#77817b]">{record?.bestScore === null || record?.bestScore === undefined ? 'Not yet assessed' : `${record.bestScore} / 12`} · {record?.status === 'passed' ? 'Passed' : 'In progress'}</span></div>;
      })}<div className="flex justify-between gap-3 py-3 border-b border-[#e7e3d9]"><span className="serif text-lg text-[#40514b]">Final oral exam</span><span className="text-sm text-[#77817b]">{p.examTotal} / 20</span></div></div>
    </section>
    <p className="text-xs leading-5 text-[#899087]">Activity recorded: {activity?.completedLectures ?? 0} lecture tests completed · {activity?.transcriptCount ?? 0} oral transcripts.</p>
  </main></div>;
}

function ProfessorConversationProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { voice } = useSpeechPreferences();
  const [persona, setPersona] = useState<ProfessorPersona>('professor');
  const personaRef = useRef<ProfessorPersona>('professor');
  const conversations = useRef<Record<ProfessorPersona, DialogueMessage[]>>({ professor: [], freud: [], kernberg: [] });
  const drafts = useRef<Record<ProfessorPersona, string>>({ professor: '', freud: '', kernberg: '' });
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DialogueMessage[]>([]);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [inputMode, setInputMode] = useState<'speak' | 'write'>('speak');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [replyPlaying, setReplyPlaying] = useState(false);
  const busyRef = useRef(false);
  const pendingVoice = useRef(false);
  const requestId = useRef(0);
  const [error, setError] = useState('');
  const recorder = useOralRecorder();
  const speech = useProfessorSpeech('dialogue', persona);
  const ask = useAskProfessor();
  const askRef = useRef(ask.mutateAsync);
  askRef.current = ask.mutateAsync;
  const speechRef = useRef(speech.play);
  speechRef.current = speech.play;

  const openDialogue = useCallback((selectedVoice?: ProfessorVoice, selectedPersona: ProfessorPersona = 'professor') => {
    if (selectedVoice) updateSpeechPreferences({ voice: selectedVoice });
    if (selectedPersona !== personaRef.current) {
      conversations.current[personaRef.current] = messagesRef.current;
      drafts.current[personaRef.current] = draft;
      pendingVoice.current = false;
      requestId.current += 1;
      busyRef.current = false;
      setBusy(false);
      setReplyPlaying(false);
      recorder.stop();
      recorder.setTranscript('');
      speech.reset(conversations.current[selectedPersona].at(-1)?.text ?? '', selectedVoice);
      setMessages(conversations.current[selectedPersona]);
      messagesRef.current = conversations.current[selectedPersona];
      setDraft(drafts.current[selectedPersona]);
      setError('');
      personaRef.current = selectedPersona;
      setPersona(selectedPersona);
    }
    if (open) return;
    window.dispatchEvent(new Event('professor-dialogue-open'));
    setOpen(true);
  }, [open, draft, recorder.stop, recorder.setTranscript, speech.reset]);
  const closeDialogue = useCallback(() => {
    pendingVoice.current = false;
    requestId.current += 1;
    busyRef.current = false;
    setBusy(false);
    setReplyPlaying(false);
    recorder.stop();
    speech.stop();
    setOpen(false);
    window.dispatchEvent(new Event('professor-dialogue-close'));
  }, [recorder.stop, speech.stop]);
  const sendQuestion = useCallback(async (question: string) => {
    const text = question.trim();
    if (!text || busyRef.current) return;
    if (speech.speechError) {
      setError('Replay the professor’s last spoken reply before continuing.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    const sequence = ++requestId.current;
    const history = messagesRef.current.slice(-12).map(({ role, text: content }) => ({
      role: role === 'student' ? 'user' as const : 'assistant' as const,
      content,
    }));
    try {
      const reply = await askRef.current({ data: { question: text, history, persona: personaRef.current } });
      if (sequence !== requestId.current) return;
      setMessages((previous) => [...previous, { role: 'student', text }, { role: 'professor', text: reply.answer }]);
      setDraft('');
      setReplyPlaying(true);
      const heard = await speechRef.current(reply.answer);
      if (sequence !== requestId.current) return;
      if (!heard) setError('The professor’s reply was not heard. Use Retry speech to hear it before continuing.');
    } catch (failure) {
      if (sequence === requestId.current) {
        setDraft(text);
        const message = (failure as { data?: { error?: unknown } } | null)?.data?.error;
        setError(typeof message === 'string' ? message : 'The professor could not answer. Your question is still here; try again.');
      }
    } finally {
      if (sequence === requestId.current) {
        busyRef.current = false;
        setBusy(false);
        setReplyPlaying(false);
      }
    }
  }, [speech.speechError]);
  const sendRef = useRef(sendQuestion);
  sendRef.current = sendQuestion;
  useEffect(() => {
    if (pendingVoice.current && !recorder.recording && !recorder.finalizing) {
      pendingVoice.current = false;
      const question = recorder.transcript.trim();
      if (question) void sendRef.current(question);
      else setError(recorder.error || 'I could not hear a question. Please try speaking again or choose Write.');
    }
  }, [recorder.recording, recorder.finalizing, recorder.transcript, recorder.error]);
  const toggleRecording = () => {
    if (recorder.recording || recorder.starting) {
      pendingVoice.current = recorder.recording;
      recorder.stop();
    } else {
      setError('');
      if (!recorder.supported) {
        setError('This browser cannot use a microphone. Choose Write to ask your question.');
        return;
      }
      void recorder.start();
    }
  };
  const setMode = (mode: 'speak' | 'write') => {
    if (recorder.recording || recorder.starting) {
      pendingVoice.current = false;
      if (mode === 'write') setDraft(recorder.transcript);
      recorder.stop();
    }
    setInputMode(mode);
  };
  const contextLabel = location.includes('/questions') ? 'Questions in progress · your test stays where you left it' :
    location.includes('/lecture/') ? 'Lecture in progress · return here after your conversation' :
    location.includes('/exam') ? 'Final exam in progress · your answers are unaffected' :
    'Available throughout your course';

  return <DialogueContext.Provider value={{ open: openDialogue, isOpen: open, persona }}>
    {children}
    <ProfessorDialoguePanel open={open} voice={voice} persona={persona} messages={messages} inputMode={inputMode} onInputMode={setMode}
      draft={draft} onDraft={setDraft} transcript={recorder.transcript} recording={recorder.recording}
      starting={recorder.starting} finalizing={recorder.finalizing} busy={busy} speaking={replyPlaying} error={error || recorder.error} onToggleRecording={toggleRecording}
      onSend={() => void sendQuestion(inputMode === 'write' ? draft : recorder.transcript)}
      onClose={closeDialogue} contextLabel={contextLabel}
      audioControls={<ProfessorAudioControls speech={speech} />} />
  </DialogueContext.Provider>;
}

function DialogueRoute() {
  const { open } = useContext(DialogueContext);
  useEffect(() => { open(); }, []); // Preserve old /dialogue links without taking the student out of the course room.
  return <CourseHome />;
}

function OverviewPage() {
  const query = useGetCourse();
  if (query.isLoading) return <Loading />;
  if (!query.data || query.isError) return <div className="page-shell"><Header /><main className="content-column py-14"><QueryError retry={() => query.refetch()} /></main></div>;
  return <CourseIntroduction course={query.data} />;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation()[0];
  return <div key={location}>{children}</div>;
}

function Routes() {
  return <RoutedErrorBoundary><Switch>
    <Route path="/" component={CourseHome} />
    <Route path="/overview" component={OverviewPage} />
    <Route path="/sign-in/*?">{() => <Redirect to="/" />}</Route>
    <Route path="/sign-up/*?">{() => <Redirect to="/" />}</Route>
    <Route path="/lecture/:lectureId/questions">{(params) => <OralRoom mode="lecture_questions" lectureId={Number(params.lectureId)} />}</Route>
    <Route path="/lecture/:lectureId">{(params) => <LecturePage lectureId={Number(params.lectureId)} />}</Route>
    <Route path="/dialogue" component={DialogueRoute} />
    <Route path="/exam">{() => <OralRoom mode="final_exam" />}</Route>
    <Route path="/results">{() => <Results />}</Route>
    <Route component={NotFound} />
  </Switch></RoutedErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><WouterRouter base={basePath}><ProfessorConversationProvider><Routes /></ProfessorConversationProvider></WouterRouter></QueryClientProvider>;
}

export default App;
