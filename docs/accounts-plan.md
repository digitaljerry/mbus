# MBus accounts & sync: plan

Status: plan, not started · Nov 2026
Goal: sign in once and get the same journeys, usual buses and reminder settings on the web app and the iOS app.

## Principles
- **Optional.** MBus keeps working without an account: everything stays in the browser or on the device, like today. An account only adds sync and backup.
- **No passwords.** Sign in with Apple, passkeys, or a one-time email link.
- **Little data.** Store only journeys, usual buses, settings and device push addresses. No location history, no analytics profile.
- **EU/GDPR.** Data is stored in the EU, with export and deletion built in from the start.

## Sign-in methods

| Method | Web | iOS | Why |
| --- | --- | --- | --- |
| Sign in with Apple | ✅ (JS SDK) | ✅ native | Required by App Store rules if any third-party login is offered; one tap on iPhone |
| Passkeys (WebAuthn) | ✅ | ✅ (AuthenticationServices) | Fast, phishing-proof, synced via iCloud Keychain / Google Password Manager |
| Email magic link | ✅ | ✅ | Fallback for everyone else; also used to recover an account |
| Google | 💤 later | 💤 later | Add only if people ask |

## Recommended stack (all on Vercel)

- **Database:** Postgres from the Vercel Marketplace (Neon), EU region (Frankfurt).
- **Auth:** [Better Auth](https://better-auth.com), an open-source library that runs inside the existing Next.js app.
  - Plugins exist for Sign in with Apple, passkeys and magic links.
  - Sessions are cookies on the web and bearer tokens for the iOS app.
  - Pros: no per-user pricing, data in our own database, a single deployment.
- **Email:** Resend, for magic links.
- **Alternative:** Clerk (Vercel Marketplace), which has a native iOS SDK and hosted UI, so it's faster to start.
  - Its cost grows with users, and user data lives with Clerk.
  - Choose Clerk if speed matters more than control.

Decision needed: **Better Auth + Neon** (recommended) or **Clerk**.

## How the iOS app signs in
1. Sign in with Apple, or a passkey, natively via AuthenticationServices.
2. The app sends Apple's identity token (or the passkey assertion) to `/api/auth/*`.
3. The server verifies it and returns a session token, which the app keeps in the Keychain (shared with widgets via the App Group).
4. API calls send `Authorization: Bearer <token>`. Tokens are long-lived, can be revoked per device, and are rotated on use.
5. Universal links (`apple-app-site-association` on mbus.vercel.app) let email magic links open the app directly.

## Data model

```
users           id, email?, apple_sub?, created_at, deleted_at?
passkeys        id, user_id, credential_id, public_key, counter, device_name, created_at
sessions        id, user_id, token_hash, device_label, platform (web|ios), last_seen_at, expires_at
journeys        id, user_id, name, description?, position, updated_at, deleted_at?
journey_legs    id, journey_id, stop_id, route, to_stop_id?, position
usual_buses     id, user_id, label?, stop_id, route, destination?, time, days int[], walk_minutes,
                to_stop_id?, remind, remind_before, updated_at, deleted_at?
devices         id, user_id, kind (webpush|apns|liveactivity), endpoint_or_token, keys?, created_at, last_ok_at
settings        user_id, keep_awake, …
```

- `updated_at` / `deleted_at` (soft delete) on every synced row lets clients sync changes with last-write-wins, which is plenty for one person's settings.
- Push targets move from "one workflow per browser" to "one workflow per user". Each reminder goes to all of the user's devices, deduplicated per occurrence.

## Sync
- **API:** `GET /api/me/sync?since=<cursor>` returns everything changed since the cursor. `POST /api/me/sync` sends local changes.
- **Web:** localStorage stays the working copy. Sync runs on load, when the tab becomes visible, and after edits (debounced).
- **iOS:** SwiftData is the working copy. Sync runs on launch, on foreground and in background refresh. A silent push is sent when another device changes something.
- **Conflicts:** last write wins per row. Deletes are kept as tombstones for 30 days.

## First sign-in: migrating local data
1. On first sign-in, if the account is empty, upload this device's journeys and usual buses.
2. If both have data, offer a choice: **merge** (default; de-duplicated by stop + line + time) or **use account data**.
3. Default journeys that were never edited are not uploaded twice.

## Privacy, security, GDPR
- Stored in the EU; a short privacy page linked from the About page.
- **Export:** `GET /api/me/export` returns a JSON file with everything stored about you.
- **Delete:** `DELETE /api/me` deletes the account, stops its reminder workflows, removes push targets, and hard-deletes rows within 30 days. Also available in the iOS app, as App Store rules require.
- Session tokens are stored hashed. Sign-in endpoints are rate-limited (Vercel Firewall rules), with CSRF protection on cookie sessions.
- No third-party analytics.

## Milestones

| # | Scope | Size |
| --- | --- | --- |
| A1 | Postgres + Better Auth; Sign in with Apple, passkeys, magic link on web; sessions; account page | 1 week |
| A2 | Sync API, local-data migration, reminders per user, export/delete | 1 week |
| A3 | iOS sign-in, Keychain/App Group tokens, universal links (with iOS M1–M3) | 3–5 days |

## Open questions
- Better Auth + Neon, or Clerk?
- Do we need sharing (e.g. a parent sharing "School → Home" with a child)? It would add a `journey_members` table later.
