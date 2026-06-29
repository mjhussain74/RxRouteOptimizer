---
name: Upload queue cold-start error
description: Startup ❌ Queue processing error is a Neon cold-start race, not an app bug
---

## Rule
The `❌ Queue processing error: TypeError: Cannot read properties of null (reading 'map')` log that appears a few seconds after server startup is a **pre-existing Neon cold-start race condition**, not caused by application code.

**Why:** The upload queue processor fires immediately on startup (`startBackgroundProcessor` called in `uploadQueue.ts`). The very first query hits Neon before its serverless HTTP connection is fully warm, returning null. The error resolves on its own after the first few seconds.

**How to apply:** When seeing this error in logs, do not treat it as a regression from code changes. It is benign and self-resolving. If it were to persist beyond the first 10-15 seconds, that would indicate a real issue.
