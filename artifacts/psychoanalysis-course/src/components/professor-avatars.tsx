import maleSrc from '../assets/professor-male.jpg';
import femaleSrc from '../assets/professor-female.jpg';
import freudSrc from '../assets/professor-freud.jpg';
import kernbergSrc from '../assets/professor-kernberg.jpg';
import type { ProfessorVoice } from '../lib/speechPreferences';
import type { ProfessorPersona } from '../lib/professor-personas';

const SRC: Record<ProfessorVoice, string> = { male: maleSrc, female: femaleSrc };
const ALT: Record<ProfessorVoice, string> = {
  male: 'Fictional AI-generated portrait of Dr. Male. Not a real person.',
  female: 'Fictional AI-generated portrait of Dr. Female. Not a real person.',
};
const THINKER_SRC = { freud: freudSrc, kernberg: kernbergSrc } as const;
const THINKER_ALT = {
  freud: 'User-provided portrait for the Freud AI avatar. Not the real person speaking.',
  kernberg: 'User-provided portrait for the Kernberg AI avatar. Not the real person speaking.',
} as const;

export function ProfessorPortrait({ voice, persona = 'professor', className }: { voice: ProfessorVoice; persona?: ProfessorPersona; className?: string }) {
  const thinker = persona === 'freud' || persona === 'kernberg' ? persona : null;
  return <img src={thinker ? THINKER_SRC[thinker] : SRC[voice]} alt={thinker ? THINKER_ALT[thinker] : ALT[voice]} width={96} height={96} draggable={false}
    className={`rounded-full object-cover ${className ?? ''}`} />;
}

type Option = { key: string; voice: ProfessorVoice; persona: ProfessorPersona; label: string; aria: string; testid: string };
const OPTIONS: Option[] = [
  { key: 'male', voice: 'male', persona: 'professor', label: 'Dr. Male', aria: 'Chat with Dr. Male', testid: 'button-professor-avatar-male' },
  { key: 'female', voice: 'female', persona: 'professor', label: 'Dr. Female', aria: 'Chat with Dr. Female', testid: 'button-professor-avatar-female' },
  { key: 'freud', voice: 'male', persona: 'freud', label: 'Freud', aria: 'Chat with Freud, an AI portrayal', testid: 'button-professor-avatar-freud' },
  { key: 'kernberg', voice: 'male', persona: 'kernberg', label: 'Kernberg', aria: 'Chat with Kernberg, an AI portrayal', testid: 'button-professor-avatar-kernberg' },
];

export default function ProfessorAvatars({ voice, persona, onChoose }: { voice: ProfessorVoice; persona: ProfessorPersona; onChoose: (voice: ProfessorVoice, persona: ProfessorPersona) => void }) {
  return <div className="flex flex-wrap items-start gap-2 sm:gap-3" role="group" aria-label="Talk to a professor">
    {OPTIONS.map((o) => {
      const selected = o.persona === 'professor' ? persona === 'professor' && voice === o.voice : persona === o.persona;
      return <button key={o.key} type="button" onClick={() => onChoose(o.voice, o.persona)} aria-pressed={selected}
        aria-label={o.aria} data-testid={o.testid}
        className="flex flex-col items-center gap-1 rounded-xl p-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315e53]">
        <span className={`block rounded-full p-0.5 ${selected ? 'ring-[3px] ring-[#315e53]' : 'ring-1 ring-[#cbd8cf]'}`}>
          <ProfessorPortrait voice={o.voice} persona={o.persona} className="h-11 w-11 sm:h-12 sm:w-12" />
        </span>
        <span className={`text-[10px] font-bold uppercase leading-none tracking-[.06em] sm:text-[11px] ${selected ? 'text-[#315e53]' : 'text-[#697873]'}`}>
          {o.label}{selected && <span className="sr-only"> (selected)</span>}
        </span>
      </button>;
    })}
  </div>;
}
