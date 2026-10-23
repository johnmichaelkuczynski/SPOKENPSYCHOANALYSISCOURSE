---
name: Anonymous preview quotas
description: Proxy IP collisions can block legitimate spoken previews.
---

Do not assume a server-observed IP identifies a unique anonymous visitor in the preview environment.

**Why:** A shell speech check exhausted an IP-based quota that then blocked a separate browser's first professor-audio request.

**How to apply:** Use browser/session identifiers for future per-visitor quotas. Keep the fixed opening preview replayable without consuming a new generated response on every replay.
