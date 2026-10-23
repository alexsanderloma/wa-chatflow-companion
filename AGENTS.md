# AGENTS.md

- Brand identity (name, tagline, primary color, support contact) lives only in `src/config/brand.ts`; screens import `brand` instead of hardcoding the product name, so a rename touches one file.
- Outbound customer integrations are a contract: webhook events are signed with the `X-Flowa-Signature` / `X-Flowa-Event` headers, and WhatsApp connection instances are named with the `flowa_` prefix. Changing either breaks live integrations, so rename them together with the docs in `MANUAL.md`.
