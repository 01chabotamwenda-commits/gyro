---
name: Firmware constants exposed as live settings
description: Pattern and pitfalls for making ESP32 firmware constants runtime-configurable via the settings page instead of requiring a reflash.
---

Pattern: convert the firmware `const` global to a plain mutable global, add a
`CMD:SET_*` serial/WiFi handler in `handleAppCommand` that parses and applies
it, add the field to `settingsStore.ts` (default must match firmware's
compiled default) and `lib/api-spec/openapi.yaml` (then run `pnpm run
codegen` in `lib/api-spec` to regen `api-client-react`/`api-zod`), forward the
new command from the `PUT /settings` route, and add a form section to
`settings.tsx`. One firmware reflash is needed to add the listener; value
changes after that don't need reflashing.

**Why:** caught in review — when hand-writing the `cmd.substring(N)` offset
for a new `CMD:SET_X:` prefix, it's easy to be off by one (used
`prefix.length + 1` instead of `prefix.length`), silently truncating the
first digit of every value sent (e.g. `1200` → `200`). Always verify the
offset equals the exact prefix string length, not length+1.

**How to apply:** whenever adding a new `CMD:SET_*` handler, compute the
prefix length precisely (e.g. via a quick script) and double check
`substring()` starts exactly after the trailing `:`. Also add relational
validation (e.g. min < max) server-side and in the zod schema — per-field
range checks alone don't catch inverted min/max pairs.
