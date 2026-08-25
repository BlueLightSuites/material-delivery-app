# Roadmap to a usable Uber-like delivery platform

**Last updated:** 2026-08-25
Every item below is tracked as a GitHub issue in [BlueLightSuites/material-delivery-app](https://github.com/BlueLightSuites/material-delivery-app/issues), labeled `phase-1`/`phase-2`/`phase-3`. Issue numbers are linked inline.
See [STATUS.md](./STATUS.md) first — it's the verified inventory of what's actually built. This file is the plan for what's left, ordered by what's actually blocking a working product.

The end goal: a contractor posts a delivery request, a driver sees it nearby and accepts it, both sides track it live, the delivery completes, and payment settles. Today only the first step (posting a request) is real. Everything from "a driver sees it" onward doesn't exist yet.

Phases are ordered by dependency, not by size — Phase 1 is the whole reason this is a two-sided marketplace and not just a form. Don't start Phase 2 or 3 work before Phase 1 closes the loop.

---

## Phase 1 — Close the marketplace loop (blocking — nothing else matters until this works)

Without this phase, a driver account is useless and the app is just a contractor intake form.

### 1. Driver job feed — show open requests to drivers ([#1](https://github.com/BlueLightSuites/material-delivery-app/issues/1))

- **Status:** Done
- **File:** `src/screens/Driver/JobsNearby.tsx`
- Lists all `delivery_requests` with `status = 'pending'` via `getDeliveryRequests(accessToken, 'status=eq.pending')`. No distance filtering yet (needs item 3's coordinates). Shows material category, weight/unit, pickup/dropoff address, trailer requirement. Pull-to-refresh + refetch on focus, same pattern as `RequestList.tsx`. Tapping a card navigates to `JobDetail` with the request id.
- Not done yet: `JobDetail` itself is still a placeholder, so tapping through doesn't do anything useful — that's item 4. There's also no Accept action anywhere yet — that's item 2, and it needs an RLS policy change before it can work.

### 2. Accept a job — the actual matching mechanism ([#2](https://github.com/BlueLightSuites/material-delivery-app/issues/2))

- **Status:** Done
- **Migration:** `sql/enable_driver_job_matching.sql` — adds a `SECURITY DEFINER` RPC function `accept_delivery_request(p_request_id)` that atomically sets `assigned_driver_id`/`status` only on a still-`pending` row, so no broad UPDATE policy had to be opened up for drivers (the function itself is the security boundary — it can't be used to edit request contents).
- **Bug fix included here:** that same migration also adds the SELECT policies the driver job feed (#1) actually needed to return any rows at all — the original RLS only let a request's owner see it, so `JobsNearby` was silently returning zero jobs for every driver until now. Fixed with a "pending requests are visible to any authenticated user" policy plus "assigned driver can see their own assignment."
- **Client:** `acceptDeliveryRequest()` in `src/services/api/deliveryRequests.ts` calls the RPC. Wired to an "Accept" button in `src/screens/Driver/JobsNearby.tsx`; on success the job drops out of the local list, on "already taken" (RPC returns zero rows) it shows an alert and refetches.
- **Not run yet:** the SQL migration file is written but has not been applied to the live Supabase project in this checkout — run it in the Supabase SQL editor (or via migration tooling) before this will work end-to-end.

### 3. Location capture for requests (needed for any real matching later) ([#3](https://github.com/BlueLightSuites/material-delivery-app/issues/3))

- **Status:** Not started
- `pickup_lat/lng` and `dropoff_lat/lng` columns already exist in `delivery_requests` but nothing populates them.
- Minimum viable: geocode the typed address on submit (a geocoding API call) rather than building full autocomplete yet — autocomplete is Phase 3 polish, but *some* coordinate is needed before "nearby" can mean anything.
- Add `expo-location` dependency for the driver's current position (needed for "nearby" filtering and later for live tracking). Add the required permission strings to `app.json` (`NSLocationWhenInUseUsageDescription` for iOS, `ACCESS_FINE_LOCATION` for Android) — currently missing entirely.

### 4. Driver-side request detail + active job ([#4](https://github.com/BlueLightSuites/material-delivery-app/issues/4))

- **Status:** Not started
- `src/screens/Driver/JobDetail.tsx` is a placeholder. Needs real request data (fetch by id), Accept action (see item 2), and status-advance actions once accepted (arrived at pickup → picked up → en route → delivered), each a status update on the row.
- Needs a way for the driver to see their current active job after accepting — right now there's no "my active jobs" list on the driver side at all.

### 5. Contractor tracking screen — make it real ([#5](https://github.com/BlueLightSuites/material-delivery-app/issues/5))

- **Status:** Not started
- File: `src/screens/Contractor/Tracking.tsx` (currently just echoes the request ID).
- Fetch the request by id, show current status, and once "driver location" exists (Phase 1 item 3 + Phase 2 live location), show it on a map.
- `src/components/map/MapView.tsx` is an empty file despite `react-native-maps` being installed — this is where a real map component belongs.

### 6. `users` table migration ([#6](https://github.com/BlueLightSuites/material-delivery-app/issues/6))

- **Status:** Done
- **Migration:** `sql/create_users_table.sql` — `id`, `auth_id` (unique FK to `auth.users`), `email`, `name`, `phone`, `role`, timestamps, matching the shape `authService.ts` actually reads/writes. RLS: a user can read/insert/update only their own row.
- **Deliberately not included:** letting a contractor/driver read each other's public profile fields (e.g. a contractor seeing their assigned driver's name) once matched via `delivery_requests.assigned_driver_id`. Left for when that UI (item 4/5) actually needs it rather than opened up speculatively — see the comment in the migration.
- **Not run yet**, same as item 2's migration — apply via the Supabase SQL editor or migration tooling before relying on it.

### 7. Session persistence ([#7](https://github.com/BlueLightSuites/material-delivery-app/issues/7))

- **Status:** Done
- Added `expo-secure-store` (linked natively — `pod install` run, `EXSecureStore` in `ios/Podfile.lock`).
- `src/services/auth/sessionService.ts` — save/load/clear a session (`user`, `accessToken`, `refreshToken`) in the Keychain/EncryptedSharedPreferences.
- `authService.ts` now captures `refresh_token` from sign up/sign in (previously discarded entirely) and exposes a new `refreshSession()` that exchanges it for a fresh access token — Supabase rotates the refresh token on each use, so callers must persist the new one each time, not just the new access token.
- `AuthContext` restores the session on launch: loads the stored session, immediately calls `refreshSession()` (simpler and more robust than decoding the JWT client-side to check expiry), and either restores `user`/`accessToken` on success or clears the stored session and falls back to sign-in on failure. `App.tsx` shows a loading spinner while this runs so launch doesn't flash the sign-in screen for an already-logged-in user.
- `SignIn.tsx`/`SignUp.tsx` now call a new `login()` context method that sets state and persists in one step; `Profile.tsx`'s logout now calls `logout()`, which clears both.

---

## Phase 2 — Trust, safety, and money (needed before real users transact)

Nothing here matters until Phase 1's loop works, but all of it is required before this could handle real contractors and real drivers moving real money.

### 8. Live driver location + ETA ([#8](https://github.com/BlueLightSuites/material-delivery-app/issues/8))

- Depends on Phase 1 items 3 and 4. Push the driver's position periodically (foreground first; background tracking is its own can of worms — evaluate whether it's needed for v1 or whether foreground-only is acceptable given drivers keep the app open during a delivery).
- Realtime delivery to the contractor: Supabase Realtime (already a dependency via `@supabase/supabase-js`, currently unused) is the natural fit — subscribe to updates on the assigned request's row instead of polling.

### 9. Push notifications ([#9](https://github.com/BlueLightSuites/material-delivery-app/issues/9))

- Add `expo-notifications`. Minimum set: contractor notified on "driver assigned" and "delivered"; driver notified on "new job nearby" (once geofencing/radius filtering exists).

### 10. Payments ([#10](https://github.com/BlueLightSuites/material-delivery-app/issues/10))

- `src/services/payments/index.ts` and `src/components/payments/PaymentForm.tsx` are empty files with no dependency chosen yet (Stripe is the common choice for marketplace payouts — has built-in support for split payments/driver payouts via Connect, which this app will need). This needs its own scoping pass before implementation starts: pricing model (flat by weight/distance? contractor-set price?), who holds funds until delivery completes, driver payout timing, refund/dispute path.

### 11. Ratings ([#11](https://github.com/BlueLightSuites/material-delivery-app/issues/11))

- `src/components/job/Rating.tsx` exists but isn't wired to anything. Needed once deliveries actually complete, for both sides to build trust signals.

### 12. Request detail / edit / cancel for contractors ([#12](https://github.com/BlueLightSuites/material-delivery-app/issues/12))

- No `RequestDetail` screen exists; `RequestList` navigates straight to `Tracking`. A contractor currently cannot cancel or edit a request after submitting it, even while it's still pending.

---

## Phase 3 — Polish and scale (do after the marketplace actually works)

- **Address autocomplete** (replace the Phase 1 geocode-on-submit with real-time suggestions — Google Places or similar). ([#13](https://github.com/BlueLightSuites/material-delivery-app/issues/13))
- **Profile screen functionality** — every action in `src/screens/Common/Profile.tsx` (Edit Profile, Change Password, Payment Methods, Help, Privacy, Terms) is currently a placeholder `Alert`. ([#14](https://github.com/BlueLightSuites/material-delivery-app/issues/14))
- **Admin dashboard** — no screens exist. Needed for support/dispute handling and manual intervention once real users are on the platform. ([#15](https://github.com/BlueLightSuites/material-delivery-app/issues/15))
- **Redux cleanup** — `src/store/` and `src/store/slices/` are fully built but never imported anywhere. Either wire it up for state that genuinely needs it (driver job feed, live delivery status) or delete it so it stops misleading future readers of the codebase. ([#16](https://github.com/BlueLightSuites/material-delivery-app/issues/16))
- **Dead file cleanup** — `src/services/api/deliveries.ts` is entirely commented out; resolve or remove it. ([#17](https://github.com/BlueLightSuites/material-delivery-app/issues/17))
- Unit + integration test coverage (currently none beyond the Jest config existing). ([#18](https://github.com/BlueLightSuites/material-delivery-app/issues/18))
- Social auth (Google/Apple). ([#19](https://github.com/BlueLightSuites/material-delivery-app/issues/19))
- Dark mode, accessibility pass, offline mode. ([#20](https://github.com/BlueLightSuites/material-delivery-app/issues/20))
- `app.json` production readiness: real bundle identifiers (currently `com.yourcompany.materialdelivery` placeholders), app icons, EAS build config. ([#21](https://github.com/BlueLightSuites/material-delivery-app/issues/21))

---

## Suggested next step

Items 1, 2, 6, and 7 are done in code — driver job feed, accept a job, `users` migration, and session persistence. **None of the three SQL migrations in `sql/` are confirmed applied to the live Supabase project** — that needs to happen before any of the matching/accept work actually works end-to-end; it's a manual step (Supabase SQL editor or migration tooling), not something further coding fixes. Next up: item 3 (location capture) and item 4 (driver-side job detail/active job), which unblock item 5 (real tracking screen).
