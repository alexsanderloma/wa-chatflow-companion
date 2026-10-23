# AGENTS.md

- Application Supabase imports resolve through the hand-maintained connectivity wrapper, not edits to generated integrations; only live browser hosts use the allowlisted same-origin HTTP proxy, with the original session key and independent direct Realtime, so regeneration, preview authentication and RLS remain intact.

- Human escalation uses a structured AI marker or an unmarked-promise safety fallback, both sharing an atomic durable claim-and-pause RPC and a single Evolution send by the claim winner; customer acknowledgements require both delivery acknowledgement and persisted success, so concurrent deliveries and failed alerts cannot create false transfer promises.
- Group supplier updates require instance authentication and an explicit participant phone JID matching an active supplier in that company; group IDs and LIDs are never treated as phones, and group messages never enter customer automation.

- Brand identity (name, tagline, primary color, support contact) lives only in `src/config/brand.ts`; screens and server-side support messages import the shared values instead of hardcoding product names or contacts, so a rename touches one file.
- Use the shared code-native `BrandMark` for product identity and semantic theme tokens for frontend colors; tenant colors must not override product navigation, so branding stays consistent while connection states remain distinct.
- Scope reference-led presentation through landing, auth, workspace and CRM classes in the global stylesheet; decorative terrain is code-native and non-interactive to preserve functional flows.
- Outbound customer integrations are a contract: webhook events are signed with the `X-Flowa-Signature` / `X-Flowa-Event` headers, and WhatsApp connection instances are named with the `flowa_` prefix. Changing either breaks live integrations, so rename them together with the docs in `MANUAL.md`.
