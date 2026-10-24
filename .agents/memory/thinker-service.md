---
name: Genius 101 thinker service
description: Provenance of the separate Freud and Kernberg API keys and avatar requirement.
---
The user says FREUD_API_KEY and KERNBERG_API_KEY come from their own Genius 101 app at https://genius101.xyz/. Freud and Kernberg should be added as two more avatars beside the existing male and female professors.

**Why:** The user explicitly identified Genius 101 as the source of these keys after explaining that the service is their own.

**How to apply:** Connect these avatars to the verified Genius 101 API. Do not assume the keys belong to OpenAI or another third-party provider based on their names, and do not present generic prompted portrayals as connections to the user's thinker systems.

Match Genius 101's native client settings rather than relying on its implicit model default.

**Why:** A request without an explicit model succeeded for Freud but failed inside Kernberg's response stream. Matching the native client's explicit Gemini selection succeeded for Kernberg, including a full course-context conversation with spoken playback.

**How to apply:** Do not remove the explicit supported-model selection as an apparently redundant field. If Genius 101 changes available models, verify both thinkers against its current client configuration before changing it.

Freud and Kernberg must support literal spoken dialogue: the student speaks to them and they speak back. Their ElevenLabs voices should have light Austrian accents, not heavy accents.

**Why:** The user explicitly emphasized spoken two-way dialogue and requested a slight Austrian accent for Kernberg and a similarly restrained Austrian accent for Freud.

**How to apply:** Preserve click-on/click-off microphone capture, automatic transcription and spoken replies for both thinkers. Keep their dedicated voices independent of the generic Dr. Male/Dr. Female lecture-voice preference. Do not claim the designed AI-portrayal voices are authentic recordings or clones of the real men.

Use the user's supplied warm elderly scholar headshot for Kernberg and formal studio portrait for Freud, rather than the illustrated portraits imported from Genius 101.

**Why:** The user explicitly selected these images as Kernberg's and Freud's avatars.

**How to apply:** Keep each user-selected portrait in both the avatar row and conversation panel; do not replace them when refreshing Genius 101 data.
