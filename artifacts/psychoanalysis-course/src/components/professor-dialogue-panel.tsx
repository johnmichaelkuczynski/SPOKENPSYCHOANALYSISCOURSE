import { useEffect, useRef, type ReactNode } from 'react';
import { Loader2, Mic, Send, Square, X } from 'lucide-react';

import { ProfessorPortrait } from './professor-avatars';
import type { ProfessorVoice } from '../lib/speechPreferences';

export type DialogueMessage = { role: 'student' | 'professor'; text: string };

export type ProfessorDialoguePanelProps = {
  open: boolean;
  messages: DialogueMessage[];
  inputMode: 'speak' | 'write';
  onInputMode: (mode: 'speak' | 'write') => void;
  draft: string;
  onDraft: (value: string) => void;
  transcript: string;
  recording: boolean;
  starting: boolean;
  finalizing: boolean;
  busy: boolean;
  speaking: boolean;
  error: string;
  onToggleRecording: () => void;
  onSend: () => void;
  onClose: () => void;
  audioControls: ReactNode;
  contextLabel: string;
  voice: ProfessorVoice;
};

const FOCUSABLE = 'button:not([disabled]), textarea:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function ProfessorDialoguePanel(props: ProfessorDialoguePanelProps) {
  const {
    open, messages, inputMode, onInputMode, draft, onDraft, transcript, recording, starting, finalizing, busy, speaking,
    error, onToggleRecording, onSend, onClose, audioControls, contextLabel, voice,
  } = props;
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onCloseRef.current(); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, [open]);

  useEffect(() => {
    if (open && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [open, messages, transcript, busy, error]);

  if (!open) return null;

  const locked = busy || finalizing;
  const status = finalizing ? 'Finishing your transcript' : speaking ? 'The professor is speaking' : busy ? 'The professor is considering your question' : '';

  return <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" style={{ background: 'rgba(33,48,46,.38)' }}
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="professor-dialogue-title" data-testid="professor-dialogue-panel"
      className="fade-in flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-[#ded9ce] bg-[#faf8f2] text-[#273b38] shadow-xl sm:max-w-[680px] sm:rounded-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-[#e5e0d5] px-5 py-4">
        <ProfessorPortrait voice={voice} className="h-14 w-14 shrink-0 border border-[#d6d9d0]" />
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-[#58756b]">Ask the professor</p>
          <p className="mt-0.5 text-sm font-bold" data-testid="text-dialogue-professor-identity">{voice === 'female' ? 'Female professor' : 'Male professor'}</p>
          <h2 id="professor-dialogue-title" className="serif mt-1 text-xl leading-tight">A conversation</h2>
          <p className="mt-1 text-xs text-[#697873]" data-testid="text-dialogue-context">{contextLabel}</p>
          <p className="mode-chip mt-2 !px-2.5 !py-1" data-testid="text-dialogue-not-graded">Not graded · No effect on your score</p>
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close conversation" data-testid="button-close-professor-dialogue"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#d6d9d0] text-[#315e53] hover:bg-[#efede4]">
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="border-b border-[#e5e0d5] px-5 py-3 text-sm">{audioControls}</div>

      <div ref={logRef} role="log" aria-live="polite" aria-label="Conversation transcript" data-testid="log-professor-dialogue"
        className="min-h-[140px] flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.length === 0 && !busy && <p className="serif text-[17px] leading-relaxed text-[#697873]">Ask about the course, challenge an interpretation, or explore a speculative idea. The professor answers aloud, and the written transcript stays here.</p>}
        {messages.map((m, i) => <div key={i} className={m.role === 'student' ? 'flex justify-end' : 'flex justify-start'} data-testid={`message-dialogue-${i}`}>
          <div className={m.role === 'student' ? 'max-w-[88%] rounded-2xl rounded-br-sm bg-[#e3ece6] px-4 py-3' : 'max-w-[92%] rounded-2xl rounded-bl-sm border border-[#e5e0d5] bg-[#fffdf8] px-4 py-3'}>
            <p className="eyebrow mb-1 text-[#77817b]">{m.role === 'student' ? 'You' : 'Professor'}</p>
            <p className="serif whitespace-pre-wrap text-[17px] leading-[1.65] text-[#31413f]">{m.text}</p>
          </div>
        </div>)}
        {busy && !speaking && <div className="flex items-center gap-2 text-sm text-[#58756b]" data-testid="status-professor-busy">
          <Loader2 size={15} className="animate-spin" aria-hidden="true" /> The professor is thinking
        </div>}
      </div>

      {error && <div role="alert" data-testid="text-dialogue-error" className="mx-5 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e5c9c1] bg-[#fbf1ed] px-4 py-3 text-sm text-[#8a4038]">
        <span>{error}</span>
        {draft.trim() && <button type="button" onClick={onSend} disabled={locked} className="secondary-action !px-4 !py-2" data-testid="button-retry-professor-question">Try again</button>}
      </div>}

      <div className="border-t border-[#e5e0d5] bg-[#f4f1e8] px-5 py-4">
        <div role="group" aria-label="Input mode" className="mb-3 inline-flex rounded-full border border-[#cbd8cf] p-0.5">
          {(['speak', 'write'] as const).map((mode) => <button key={mode} type="button" aria-pressed={inputMode === mode}
            onClick={() => onInputMode(mode)} data-testid={`button-dialogue-${mode}`}
            className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-[.09em] ${inputMode === mode ? 'bg-[#315e53] text-[#fffaf1]' : 'text-[#42675d]'}`}>
            {mode === 'speak' ? 'Speak' : 'Write'}
          </button>)}
        </div>

        {inputMode === 'speak' ? <div className="flex items-center gap-4">
          <button type="button" onClick={onToggleRecording} disabled={!recording && !starting && locked} data-testid="button-professor-microphone"
            aria-pressed={recording || starting} aria-label={recording ? 'Turn microphone off and send' : starting ? 'Cancel microphone connection' : 'Turn microphone on'}
            className={`talk-button !h-[68px] !w-[68px] shrink-0 ${recording ? 'recording' : ''}`}>
            {finalizing || starting ? <Loader2 size={24} className="animate-spin" aria-hidden="true" /> : recording ? <Square size={22} aria-hidden="true" /> : <Mic size={24} aria-hidden="true" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold ${recording ? 'status-live' : ''}`}>
              {recording && <span className="meter-dot" aria-hidden="true" />}
              {recording ? 'Microphone on. Click again to turn it off and send.' : starting ? 'Connecting microphone. Click again to cancel.' : finalizing ? 'Finishing your transcript' : speaking ? 'The professor is speaking' : busy ? 'Waiting for the professor' : 'Microphone off. Click once to turn it on.'}
            </p>
            <p className="serif mt-1 min-h-[1.5em] text-[16px] italic leading-snug text-[#58756b]" aria-live="polite" data-testid="text-live-transcript">
              {transcript || (recording ? 'Your words will appear here.' : 'Stopping the microphone sends your question automatically.')}
            </p>
          </div>
        </div> : <div>
          <label htmlFor="professor-question" className="sr-only">Your question for the professor</label>
          <textarea id="professor-question" data-testid="textarea-professor-question" rows={3} value={draft} disabled={locked}
            onChange={(event) => onDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && draft.trim() && !locked) onSend(); }}
            placeholder="Write your question"
            className="w-full resize-none rounded-xl border border-[#d6d9d0] bg-[#fffdf8] px-4 py-3 font-[inherit] text-[16px] leading-relaxed text-[#273b38] disabled:opacity-60" />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-[360px] text-xs text-[#697873]">The professor will also speak the reply. The written transcript is available above.</p>
            <button type="button" onClick={onSend} disabled={locked || !draft.trim()} data-testid="button-send-professor-question" className="primary-action">
              {locked ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />} Send question
            </button>
          </div>
        </div>}
        <p className="sr-only" role="status">{status}</p>
      </div>
    </div>
  </div>;
}
