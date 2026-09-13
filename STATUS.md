# Project Status

**Last verified against code:** 2026-09-12
**Purpose:** ground-truth snapshot of what's actually implemented, checked directly against `src/` — not a plan, not a wishlist. See [TODO.md](./TODO.md) for what's left and in what order.

This app is meant to become an Uber-like marketplace for construction material delivery: contractors post delivery requests, drivers see and accept nearby jobs, both sides track the delivery live, and money changes hands at the end. The core marketplace loop now runs end to end against the live Supabase project: a contractor posts a request, a driver sees it, accepts it atomically (with a real database-level guard against two drivers claiming the same job), and drives it through to delivered. All migrations are applied and tracked via the Supabase CLI, so schema state is verifiable rather than assumed. What's still missing is everything around that loop: **no live tracking, no geolocation, and no payment functionality**.

---

## What actually works end-to-end

- **Sign up / sign in / forgot password** (`src/screens/Auth/`) — calls Supabase's Auth REST API directly via axios (`src/services/firebase/authService.ts`), not the `@supabase/supabase-js` client despite it being a dependency. Creates a row in a `users` table keyed by `auth_id`. Role is chosen at signup (contractor / driver / admin).
- **Role-based navigation** (`src/navigation/MainNavigator.tsx`) — after login, drivers and contractors see different stacks. Admin role exists in the type/signup form but has no screens.
- **Create a delivery request** (`src/screens/Contractor/NewRequest.tsx` → `src/services/api/deliveryRequests.ts`) — real 4-step wizard (location → material → vehicle → review), validated, submitted as a genuine `POST` to `delivery_requests` in Supabase. This is fully wired, not mocked.
- **View my requests** (`src/screens/Contractor/RequestList.tsx`) — fetches the contractor's own requests from Supabase, filters by status, pull-to-refresh. Also fully wired, not mocked (older docs in this repo say otherwise — see "Docs vs. reality" below).
- **Driver job feed + accept** (`src/screens/Driver/JobsNearby.tsx`) — lists all `delivery_requests` with `status = 'pending'`, pull-to-refresh, refetches on focus. Each job has an "Accept" button calling the `accept_delivery_request` RPC (`supabase/migrations/20260825003608_enable_driver_job_matching.sql`), which atomically assigns the driver only if the job is still pending; a job already taken by another driver shows an alert and refetches instead of erroring. No distance/radius filtering yet (no coordinates captured on requests — see gaps below). Tapping "View Details" goes to `JobDetail`, which is now real (below).
- **Driver job detail + status advance** (`src/screens/Driver/JobDetail.tsx`) — loads the real request by id and carries it through its lifecycle with a single action that changes by state: Accept Job while pending, then Start Delivery (`assigned` → `in_transit`) and Mark Delivered (`in_transit` → `completed`). Status changes go through the `advance_delivery_status` RPC (`supabase/migrations/20260910000000_enable_driver_status_updates.sql`), which only moves status forward one step and only for the driver the job is assigned to. A transition that's no longer valid returns zero rows and refetches rather than erroring, matching how the accept flow handles losing a race.
- **Live driver location + ETA** (`src/hooks/useDriverLocationReporter.ts`, `src/services/realtime/supabaseRealtime.ts`) — while a driver holds an in-progress job, `watchPositionAsync` streams their position through the `report_driver_location` RPC onto the request row. The contractor's tracking screen subscribes over Supabase Realtime and shows "About N min away", estimated from straight-line distance at an assumed 30 mph. **If the realtime channel fails it falls back to 10s polling**, because the rest of the app deliberately avoids the Supabase SDK on Hermes grounds and a silently dead subscription would be worse than polling. Position is cleared when the job completes.
- **Token renewal** (`src/context/AuthContext.tsx`, `src/services/api/authInterceptor.ts`) — access tokens last an hour; they're renewed on a 45-minute timer and whenever the app returns to the foreground (iOS suspends JS timers in the background, so the timer alone isn't enough). A 401 that still slips through is retried once with a fresh token. The refresh is single-flight: Supabase rotates refresh tokens, so concurrent 401s each starting their own refresh would invalidate each other and sign the user out spuriously.
- **Contractor tracking** (`src/screens/Contractor/Tracking.tsx`) — fetches the request by id and shows a status badge, a plain-language line for the current step, and a four-step progress timeline (`pending` → `assigned` → `in_transit` → `completed`), plus route, trailer requirement, request time, and notes. Refetches on focus and pull-to-refresh; there's no live push yet, so a contractor sitting on the screen sees stale data until they refresh — that's what Supabase Realtime would fix. Status colors and labels come from `src/models/deliveryStatus.ts`, shared with `RequestList` so the two can't disagree.
- **Driver active jobs** (`src/screens/Driver/JobsNearby.tsx`) — accepting a job flips it out of `pending`, so the open-jobs feed alone left a driver no route back to a job they'd taken. The feed now also queries jobs assigned to the signed-in driver and lists them above the available ones.
- **Location capture** (`src/services/geolocation/index.ts`) — pickup/dropoff addresses are geocoded on submit via the platform geocoder (`expo-location`, no API key or billing), populating the `pickup_lat/lng` and `dropoff_lat/lng` columns that previously sat empty. The driver feed reads the device position once on mount and labels each job with straight-line distance from pickup. Both are enrichments that degrade to null rather than failing: a geocode miss still submits the request, and a denied permission just hides distances. Requests created before this shipped have no coordinates and show no distance. Verified on the simulator with a custom location set.
- **Session persistence** (`src/context/AuthContext.tsx`, `src/services/auth/sessionService.ts`) — `user`/`accessToken`/`refreshToken` are persisted via `expo-secure-store` on login and restored on launch (refreshing the access token first). Logout clears both context state and the stored session.

## What exists as UI shell only ("Coming soon")

These screens render and are reachable, but have no logic:

- `src/screens/Driver/Earnings.tsx`
- Profile screen (`src/screens/Common/Profile.tsx`) — Edit Profile, Change Password, Payment Methods, Help, Privacy, Terms all just pop an `Alert` saying "coming soon." Notification/email toggles are local `useState`, never persisted.

## What's stubbed with zero implementation (empty files)

Confirmed empty — not partially done, literally 0 lines of logic:

- `src/hooks/useRealtimeLocation.ts`
- `src/services/payments/index.ts`
- `src/components/payments/PaymentForm.tsx`
- `src/components/map/MapView.tsx`
- `src/services/api/deliveries.ts` (entire file is commented out)

## What's built but disconnected (dead code)

- **Redux** (`@reduxjs/toolkit`, `react-redux`, `src/store/`, `src/store/slices/authSlice.ts`, `jobsSlice.ts`) — fully scaffolded, **never imported anywhere**. `AuthContext` + component-local state is what the app actually runs on. Either wire it up for real state that needs it (job feeds, real-time delivery status) or delete it — right now it's dead weight that will mislead the next person who reads the codebase.

## Gaps that block basic usability, not just "nice to have"

- **No map.** `src/components/map/MapView.tsx` is still an empty file despite `react-native-maps` being installed. Live driver position now exists (above), so there is finally something worth plotting — this is the remaining half of live tracking.
- **Driver location is foreground-only.** Reporting runs while the driver has the job detail screen open; backgrounding the app stops it, and the contractor sees a "last known position" warning once a fix is over two minutes old. Background reporting needs the "always" permission plus a background-mode entitlement and a much harder App Store justification, so it was deliberately deferred.
- **No payments.** No Stripe/PayPal dependency, no pricing/estimate logic anywhere. Deliveries have no cost.
- **No push notifications.** No `expo-notifications` dependency. A contractor whose request gets assigned/updated will never know unless they manually reopen the app and re-check the list.

## Backend / infra gaps

- **Schema is now tracked and applied.** All five migrations under `supabase/migrations/` are applied to the live project and recorded in its migration history — `npm run db:diff` shows Local matching Remote for every one, so this is verifiable rather than assumed. Apply new ones with `npm run db:push`; don't paste SQL into the dashboard editor, which is how the drift below happened in the first place.
- **Known drift in the `users` table, deliberately left alone.** The live table predates migrations and stores `auth_id` as `TEXT` (not `UUID`) with a `bigint` primary key instead of `UUID`. The RLS policies cast to text to match. Retyping live columns is a separate, riskier migration and buys nothing today: `authService.ts` never reads `public.users.id` — the app's `User.id` is always the Supabase Auth UUID held in `auth_id`. The live table also carries unused `user_name` / `password_hash` columns from a pre-Supabase-Auth approach.
- Supabase CLI commands need a database password in `.env.local` (gitignored). This works around [supabase/cli#5091](https://github.com/supabase/cli/issues/5091), where the CLI's automatic login role fails on older projects with a "permission denied to alter role" error. Note that `.env` itself **is** committed — it holds only the URL and anon key, which are public by design and shipped in the app bundle; the database password must never go there.
- **Bundle identifier is `com.bluelightsuites.materialdelivery`**, set in `app.json` (iOS and Android) and both Xcode build configurations, which finally agree. It's derived from a domain the company controls and is deliberately descriptive rather than branded: it is permanent after first publish, while the display name is not, so the app can ship under any marketing name later without stranding the identifier. The display name is still "Material Delivery" and is not yet decided.
- `app.json` still has no EAS build config — not ready for store submission.

## Docs vs. reality

Three older docs in the repo root describe past implementation work and are now partially stale:
- `AUTHENTICATION_SETUP.md` — accurate for what it covers, but predates session persistence being identified as missing.
- `DELIVERY_REQUEST_FEATURE.md` — accurate for the `NewRequest` form UX.
- `POST_AUTH_NAVIGATION.md` — accurate for the navigation split.
- The old `TODO.md` said "Replace Mock Data in RequestList with Real API Calls" was **Not Started** — it's actually done. That file has been rewritten (see [TODO.md](./TODO.md)) to reflect current reality and reorganized around what's needed to reach a usable Uber-like MVP.

These three docs are left as-is as historical implementation notes; treat `STATUS.md` and `TODO.md` as the current source of truth.
