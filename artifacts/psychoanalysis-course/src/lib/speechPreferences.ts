import { useSyncExternalStore } from "react";

export type ProfessorVoice = "male" | "female";
type Preferences = { voice: ProfessorVoice; speed: number };
const storageKey = "professor-speech-preferences";
const listeners = new Set<() => void>();
const defaults: Preferences = { voice: "male", speed: 1 };

function readPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    return {
      voice: saved.voice === "female" ? "female" : "male",
      speed: typeof saved.speed === "number" && saved.speed >= 0.5 && saved.speed <= 2 ? saved.speed : 1,
    };
  } catch {
    return defaults;
  }
}

let preferences = readPreferences();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => preferences;

export function updateSpeechPreferences(update: Partial<Preferences>) {
  preferences = { ...preferences, ...update };
  try { localStorage.setItem(storageKey, JSON.stringify(preferences)); } catch { /* Still usable when storage is disabled. */ }
  listeners.forEach((listener) => listener());
}

window.addEventListener("storage", (event) => {
  if (event.key !== storageKey) return;
  preferences = readPreferences();
  listeners.forEach((listener) => listener());
});

export function useSpeechPreferences() {
  return useSyncExternalStore(subscribe, snapshot);
}
