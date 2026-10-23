import { useEffect, useRef, useState } from 'react';

export default function RecordedAnswerPlayback({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    const audio = audioRef.current;
    return () => { audio?.pause(); };
  }, [url]);

  return <div className="mt-5 border-t border-[#e7e3d9] pt-4" data-testid="panel-recorded-answer">
    <p className="text-sm font-semibold text-[#43534d] mb-2">Hear your recorded answer</p>
    <audio ref={audioRef} controls src={url} preload="metadata" className="w-full"
      aria-label="Your recorded answer" data-testid="audio-recorded-answer" onError={() => setFailed(true)} />
    {failed && <p role="alert" className="text-sm text-[#a34b43] mt-2">Your recording could not be played. Try playing it again or re-record your answer.</p>}
  </div>;
}
