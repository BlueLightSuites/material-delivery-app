# Roadmap to a usable Uber-like delivery platform

**Last updated:** 2026-09-12
Every item below is tracked as a GitHub issue in [BlueLightSuites/material-delivery-app](https://github.com/BlueLightSuites/material-delivery-app/issues), labeled `phase-1`/`phase-2`/`phase-3`. Issue numbers are linked inline.
See [STATUS.md](./STATUS.md) first — it's the verified inventory of what's actually built. This file is the plan for what's left, ordered by what's actually blocking a working product.

The end goal: a contractor posts a delivery request, a driver sees it nearby and accepts it, both sides track it live, the delivery completes, and payment settles. Today that loop works apart from "nearby" and "track it live" — a contractor can post, a driver can see, accept, and complete a job, all against the live database. What's missing is location (so "nearby" means nothing yet), any tracking view for the contractor, and payment.

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
- **Migration:** `supabase/migrations/20260825003608_enable_driver_job_matching.sql` — adds a `SECURITY DEFINER` RPC function `accept_delivery_request(p_request_id)` that atomically sets `assigned_driver_id`/`status` only on a still-`pending` row, so no broad UPDATE policy had to be opened up for drivers (the function itself is the security boundary — it can't be used to edit request contents).
- **Bug fix included here:** that same migration also adds the SELECT policies the driver job feed (#1) actually needed to return any rows at all — the original RLS only let a request's owner see it, so `JobsNearby` was silently returning zero jobs for every driver until now. Fixed with a "pending requests are visible to any authenticated user" policy plus "assigned driver can see their own assignment."
- **Client:** `acceptDeliveryRequest()` in `src/services/api/deliveryRequests.ts` calls the RPC. Wired to an "Accept" button in `src/screens/Driver/JobsNearby.tsx`; on success the job drops out of the local list, on "already taken" (RPC returns zero rows) it shows an alert and refetches.
- **Applied to the live project** and tracked in its migration history.

### 3. Location capture for requests (needed for any real matching later) ([#3](https://github.com/BlueLightSuites/material-delivery-app/issues/3))

- **Status:** Done
- **Service:** `src/services/geolocation/index.ts` — `geocodeAddress()`, `getCurrentPosition()`, `distanceInMiles()`. Geocoding uses the platform geocoder via `expo-location` (CoreLocation / Android Geocoder), so there's no API key or billing to set up; the tradeoff is that it misses on vague input, which is what full autocomplete (#13) would fix.
- **Contractor:** `NewRequest.tsx` geocodes pickup and dropoff in parallel on submit and populates the four lat/lng columns. A geocode miss submits with nulls rather than blocking the request — coordinates are an enrichment, not a requirement.
- **Driver:** `JobsNearby.tsx` reads the device position once on mount (not on every focus, so a declined prompt isn't re-prompted) and labels each job with straight-line distance from pickup. Requests created before this shipped have no coordinates and show no distance rather than a wrong one.
- **Permissions:** declared in `app.json` for both platforms, and `NSLocationWhenInUseUsageDescription` added directly to `ios/MaterialDelivery/Info.plist` — the committed native project is what actually builds, and iOS crashes outright if a location request finds no usage string. This also satisfies the store-submission prerequisite ([#30](https://github.com/BlueLightSuites/material-delivery-app/issues/30)).
- **Not done here:** distance is displayed, not used for filtering or sorting, and the feed still fetches every pending request regardless of distance. Real radius-based matching needs a server-side query (PostGIS or a bounding-box filter) rather than client-side math over the whole table.

### 4. Driver-side request detail + active job ([#4](https://github.com/BlueLightSuites/material-delivery-app/issues/4))

- **Status:** Done
- **File:** `src/screens/Driver/JobDetail.tsx` — fetches the real request by id via `getDeliveryRequestById()` and shows status, route, material/weight, trailer requirement, and notes. One action button that changes by state: Accept Job while `pending`, Start Delivery (`assigned` → `in_transit`), Mark Delivered (`in_transit` → `completed`).
- **Migration:** `supabase/migrations/20260910000000_enable_driver_status_updates.sql` — adds `advance_delivery_status(p_request_id, p_next_status)`, a `SECURITY DEFINER` RPC following the same pattern as item 2's accept function. The existing UPDATE policy only matches `auth_id = auth.uid()` (the contractor who created the request), so a driver has no UPDATE access at all; rather than widen that and let a driver rewrite pickup/dropoff/material fields on a job merely assigned to them, the function moves `status` forward exactly one valid step and only for the assigned driver. Applied to the live project.
- Statuses used are the existing `pending` / `assigned` / `in_transit` / `completed` values already in the schema, rather than the finer-grained arrived/loaded steps sketched earlier — those would need new schema and aren't needed to close the loop.
- Still open: there's no "my active jobs" list on the driver side; a driver reaches an accepted job by tapping through from the feed. Worth its own issue if it becomes friction.

### 5. Contractor tracking screen — make it real ([#5](https://github.com/BlueLightSuites/material-delivery-app/issues/5))

- **Status:** Done
- **File:** `src/screens/Contractor/Tracking.tsx` — status badge, a plain-language line for the current step, and a four-step progress timeline, plus route, trailer requirement, request time, and notes. Refetches on focus and pull-to-refresh.
- **Shared:** `src/models/deliveryStatus.ts` holds the status vocabulary (order, labels, colors, contractor-facing descriptions). `RequestList` previously had its own inline copy of the colors and labels; both screens now read from the one module, so a status can't be orange on one screen and blue on the other. `RequestList`'s filter tabs are derived from that same order, which is how `in_transit` ended up with no tab in the first place.
- **Deliberately no map yet.** With no driver location on the wire, a map could only show pickup and dropoff — two fixed points the contractor typed in themselves. `MapView.tsx` stays empty until there's something moving to plot, so it gets built once against live positions rather than built for static pins and rebuilt later. That's part of [#8](https://github.com/BlueLightSuites/material-delivery-app/issues/8).
- **Not included:** live updates. A contractor sitting on the screen sees stale data until they refresh.

### 6. `users` table migration ([#6](https://github.com/BlueLightSuites/material-delivery-app/issues/6))

- **Status:** Done
- **Migration:** `supabase/migrations/20260825003703_create_users_table.sql` — `id`, `auth_id` (unique FK to `auth.users`), `email`, `name`, `phone`, `role`, timestamps, matching the shape `authService.ts` actually reads/writes. RLS: a user can read/insert/update only their own row.
- **Deliberately not included:** letting a contractor/driver read each other's public profile fields (e.g. a contractor seeing their assigned driver's name) once matched via `delivery_requests.assigned_driver_id`. Left for when that UI (item 4/5) actually needs it rather than opened up speculatively — see the comment in the migration.
- **Applied to the live project**, which surfaced real drift: the pre-existing table stores `auth_id` as `TEXT` and uses a `bigint` primary key, so the policies had to cast (`auth_id = auth.uid()::text`) and the missing `phone` / `updated_at` columns had to be added explicitly. See the migration's header comment and STATUS.md for why the column types are left as they are.
- A separate migration (`20260912000000_drop_legacy_users_insert_policy.sql`) removes a dashboard-created INSERT policy that only checked whether the caller was authenticated — as a permissive policy it was OR'd with the narrower own-profile check, so any signed-in user could have inserted a row claiming someone else's `auth_id`.

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

**Phase 1 is closed.** All seven items are done, and the loop has been walked end to end on two simulators: a contractor posts a request, a driver sees it with a distance, accepts it, advances it through to delivered, and the contractor watches the status move.

Two things that walk exposed, both now fixed, both worth remembering as a pattern: accepting a job removed it from the only list that could reach it, and `User.id` meant the auth UUID on some sign-in paths and the `users` table's bigint key on others. Neither showed up in code review or type-checking — the first because every piece worked in isolation, the second because a `userData as User` cast asserted away the mismatch. Walking the actual user path found both.

Next up is Phase 2, where **[#8](https://github.com/BlueLightSuites/material-delivery-app/issues/8) (live driver location)** is the natural first move: it's what makes tracking live rather than pull-to-refresh, and it's the prerequisite for the map that `src/components/map/MapView.tsx` is still an empty placeholder for. Note it needs schema work too — nothing currently stores a driver's position.
