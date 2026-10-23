---
name: Live spoken class
description: User requirements for mandatory professor speech and ElevenLabs authentication.
---

This product is a live oral class, not a chat app with optional audio. Every professor utterance must be spoken using ElevenLabs; visible text is a transcript, not a substitute. Speech failures must be visible rather than silently continuing in text-only mode.

Use the user's own ElevenLabs API key through secure server-side configuration, not the connector proxy.

**Why:** Dr. Kuczynski repeatedly clarified that the professor speaks aloud and explicitly corrected the use of a connector instead of their ElevenLabs key.

**How to apply:** Preserve required speech for lectures, questions, dialogue replies, follow-up probes, and grading feedback. Never expose credentials in client code, chat, logs, or memory.
