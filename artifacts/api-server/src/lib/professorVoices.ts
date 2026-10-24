export type SpeechPersona = "professor" | "freud" | "kernberg";

/** Original designed voices in the user's own ElevenLabs account, not clones. */
export function resolveProfessorVoice(voice: "male" | "female" = "male", persona: SpeechPersona = "professor"): string {
  if (persona === "freud") return process.env.ELEVENLABS_FREUD_VOICE_ID || "nyOzaJdcqQvzdoKUyLNC";
  if (persona === "kernberg") return process.env.ELEVENLABS_KERNBERG_VOICE_ID || "38h8lQHr2EH9K7ZZsMYf";
  return voice === "female"
    ? process.env.ELEVENLABS_FEMALE_VOICE_ID || "EXAVITQu4vr4xnSDxMaL"
    : process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
}
