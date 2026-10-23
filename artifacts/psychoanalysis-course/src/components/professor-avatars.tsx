import maleSrc from '../assets/professor-male.jpg';
import femaleSrc from '../assets/professor-female.jpg';
import type { ProfessorVoice } from '../lib/speechPreferences';

const SRC: Record<ProfessorVoice, string> = { male: maleSrc, female: femaleSrc };
const ALT: Record<ProfessorVoice, string> = {
  male: 'Fictional AI-generated portrait of the male professor voice. Not a real person.',
  female: 'Fictional AI-generated portrait of the female professor voice. Not a real person.',
};

export function ProfessorPortrait({ voice, className }: { voice: ProfessorVoice; className?: string }) {
  return <img src={SRC[voice]} alt={ALT[voice]} width={96} height={96} draggable={false}
    className={`rounded-full object-cover ${className ?? ''}`} />;
}

export default function ProfessorAvatars({ voice, onChoose }: { voice: ProfessorVoice; onChoose: (voice: ProfessorVoice) => void }) {
  return <div className="flex items-start gap-2 sm:gap-3" role="group" aria-label="Talk to a professor">
    {(['male', 'female'] as const).map((v) => {
      const selected = voice === v;
      return <button key={v} type="button" onClick={() => onChoose(v)} aria-pressed={selected}
        aria-label={`Chat with ${v} professor`} data-testid={`button-professor-avatar-${v}`}
        className="flex flex-col items-center gap-1 rounded-xl p-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315e53]">
        <span className={`block rounded-full p-0.5 ${selected ? 'ring-[3px] ring-[#315e53]' : 'ring-1 ring-[#cbd8cf]'}`}>
          <ProfessorPortrait voice={v} className="h-11 w-11 sm:h-12 sm:w-12" />
        </span>
        <span className={`text-[10px] font-bold uppercase leading-none tracking-[.06em] sm:text-[11px] ${selected ? 'text-[#315e53]' : 'text-[#697873]'}`}>
          {v === 'male' ? 'Male' : 'Female'}{selected && <span className="sr-only"> (selected)</span>}
        </span>
      </button>;
    })}
  </div>;
}
