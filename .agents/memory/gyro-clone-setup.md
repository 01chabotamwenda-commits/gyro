---
name: Gyro clone setup
description: How the gyro repo was cloned into this workspace and what the registration workaround was.
---

When cloning a full repo into an existing Replit workspace (including `artifacts/` dirs with their own `artifact.toml`), the platform won't auto-register new artifacts found on disk. `createArtifact` fails if the target directory already exists.

**Workaround:** Move the cloned artifact dir to /tmp, call `createArtifact` (gets a proper ID and managed workflow), then `cp -r` all source files (src/, public/, index.html, package.json, tsconfig.json, vite.config.ts, components.json) back — leaving the new `.replit-artifact/artifact.toml` in place.

**Why:** The platform ties artifact registration to `createArtifact` returning a valid ID + workflow name. A pre-existing `artifact.toml` with a non-UUID `id` field is silently ignored.

**How to apply:** Any time a cloned/imported repo has `artifacts/<slug>/` directories that need to be live Replit artifacts, use this move-create-restore sequence. Only restore non-`.replit-artifact` files.

**DB schema:** Always run `pnpm --filter @workspace/db run push` after cloning — the DB tables won't exist in the new environment.
