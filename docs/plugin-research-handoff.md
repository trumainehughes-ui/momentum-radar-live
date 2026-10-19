# ChatGPT plugin research handoff (staged)
This endpoint is a **research inbox only**. It does not generate or verify sportsbook offers, affect production SGPs, or synchronize public projections.

## Setup
1. Generate a fresh, high-entropy `MOMENTUM_RESEARCH_INGEST_KEY` in Vercel server-side production and preview environments. Do not reuse sportsbook publishing or cron keys.
2. Confirm Vercel Blob storage is configured. Research payloads are encrypted using AES-256-GCM before writing to publicly addressable Blob storage. The encryption key is derived from the dedicated ingest secret. Blob object paths and sizes are still visible to anyone possessing the Blob URL. Never send private data, secrets, or provider-restricted content.
3. POST `/api/plugin-research-ingest` with `Authorization: Bearer <key>` and JSON:
```json
{"provider":"Optimal Sports Projections","league":"NFL","gameId":"401873006","observedAt":"2026-10-19T13:00:00Z","observations":[{"type":"player_projection","subject":"Example Player","description":"Projection as returned by provider","sourceReference":"Provider endpoint / lookup reference"}]}
```
4. Requests are manually initiated. ChatGPT plugin access does **not** imply autonomous scheduled publishing or provide the bearer token to ChatGPT.
5. A separate, reviewed consumer must decrypt with the same secret, validate stored observations, enforce game/player identities and freshness, and incorporate them into projections before the data can affect Momentum Radar. Never promote research to actual DraftKings/FanDuel offers or correlated SGP quotes.
6. Do not activate this endpoint until access-control, storage privacy, request limits, and provider redistribution permissions are reviewed.
