# AGENTS.md

- Desktop packaging stays isolated under electron and loads the official HTTPS site with sandboxed persistent browser storage; keep remote content away from Node and open external destinations in the system browser, preserving hosted auth and server behavior without a duplicate web build.

- Workspace mobile navigation keeps four quick links plus a complete sheet menu derived from the desktop sections, preserving the same role filters so destinations cannot disappear on phones.

- Gemini chat and WhatsApp media share a streaming, server-only Lovable Gateway transport with durable access pauses and per-call usage; the direct Google module remains inactive, while OpenAI/Anthropic retain their tenant-key transports.
- AI replies reserve a credit after safety checks and consolidate a single debit only on a confirmed delivered part; uncertain sends remain reserved for reconciliation, preventing automatic replay or false refunds.
- Paid credit resets use an atomic service-role RPC keyed by payment and subscription cycle; legacy topups are deprecated, preserving history and preventing repeated payment notifications from resetting used credits.
- Platform AI finance is Master-only at route, authenticated-function and RLS boundaries; measured tokens, tariff estimates, payment receipts and simulated recommendations stay distinct from cash costs and public pricing.
- Authenticated, persisted WhatsApp customer automation is awaited inside a heartbeat response stream so slow provider calls do not leave a buffered webhook connection idle; pre-authentication and intentional no-reply exits retain their normal responses.

- Checkout upgrade is explicit and support-only until provider updates and entitlement reconciliation are implemented together; ordinary payment reuses only matching-plan Asaas subscriptions, and durable subscription reservation blocks concurrent/uncertain duplicate creation.
- Customer free provisioning always uses the atomic Starter creation RPC; trial entitlement ignores purchase selection, while an explicit purchase is due immediately and only the authenticated provider payment event grants paid access. Protect billing fields against direct tenant writes so UI state cannot bypass payment.

- Master plan mutations use a service-role-only RPC after assertSuper with an explicit access period; lock the company and atomically preserve canceled subscription history, update entitlement/expiry and write existing audit_log, without calling external billing providers. Temporary grants expire through company access RLS and the app gate; permanent grants have no expiry.

- Application Supabase imports resolve through the hand-maintained connectivity wrapper, not edits to generated integrations; only live browser hosts use the allowlisted same-origin HTTP proxy, with the original session key and independent direct Realtime, so regeneration, preview authentication and RLS remain intact.

- Human escalation uses a structured AI marker or an unmarked-promise safety fallback, both sharing an atomic durable claim-and-pause RPC and a single Evolution send by the claim winner; customer acknowledgements require both delivery acknowledgement and persisted success, so concurrent deliveries and failed alerts cannot create false transfer promises.
- Group supplier updates require instance authentication and an explicit participant phone JID matching an active supplier in that company; group IDs and LIDs are never treated as phones, and group messages never enter customer automation.

- Brand identity (name, tagline, primary color, support contact) lives only in `src/config/brand.ts`; screens and server-side support messages import the shared values instead of hardcoding product names or contacts, so a rename touches one file.
- Use the shared code-native `BrandMark` for product identity and semantic theme tokens for frontend colors; tenant colors must not override product navigation, so branding stays consistent while connection states remain distinct.
- Scope reference-led presentation through landing, auth, workspace and CRM classes in the global stylesheet; decorative terrain is code-native and non-interactive to preserve functional flows.
- Outbound customer integrations are a contract: webhook events are signed with the `X-Flowa-Signature` / `X-Flowa-Event` headers, and WhatsApp connection instances are named with the `flowa_` prefix. Changing either breaks live integrations, so rename them together with the docs in `MANUAL.md`.
- WhatsApp connection is state-first and idempotent: query connectionState, create only when missing, call connect (QR) only from the explicit Connect action, never from status polling, because connect on a live session drops it.
- Connection UI serializes status checks and invalidates stale responses across actions; pairing QR is retained only while connecting, and timed-out connect calls remain locked until their underlying request settles to prevent duplicate attempts.
- Disconnected connection removal uses the authenticated company's RLS client; remote deletion is best effort but local deletion must succeed before usage is refreshed. Instance limits come from the linked plan, not a fixed UI/backend constant.
