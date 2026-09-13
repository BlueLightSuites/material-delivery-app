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
- **Session persistence** (`src/context/AuthContext.tsx`, `src/services/auth/sessionService.ts`) — `user`/`accessToken`/`refreshToken` are persisted via `expo-secure-store` on login and restored on launch (refreshing the access token first). Logout clears both context state and the stored session.

## What exists as UI shell only ("Coming soon")

These screens render and are reachable, but have no logic:

- `src/screens/Driver/Earnings.tsx`
- `src/screens/Contractor/Tracking.tsx` — the screen `RequestList` navigates to when you tap a request. Shows the request ID and nothing else.
- Profile screen (`src/screens/Common/Profile.tsx`) — Edit Profile, Change Password, Payment Methods, Help, Privacy, Terms all just pop an `Alert` saying "coming soon." Notification/email toggles are local `useState`, never persisted.

## What's stubbed with zero implementation (empty files)

Confirmed empty — not partially done, literally 0 lines of logic:

- `src/services/geolocation/index.ts`
- `src/hooks/useRealtimeLocation.ts`
- `src/services/payments/index.ts`
- `src/components/payments/PaymentForm.tsx`
- `src/components/map/MapView.tsx`
- `src/services/api/deliveries.ts` (entire file is commented out)

## What's built but disconnected (dead code)

- **Redux** (`@reduxjs/toolkit`, `react-redux`, `src/store/`, `src/store/slices/authSlice.ts`, `jobsSlice.ts`) — fully scaffolded, **never imported anywhere**. `AuthContext` + component-local state is what the app actually runs on. Either wire it up for real state that needs it (job feeds, real-time delivery status) or delete it — right now it's dead weight that will mislead the next person who reads the codebase.

## Gaps that block basic usability, not just "nice to have"

- **No geolocation.** `expo-location` isn't a dependency. No permission strings are declared in `app.json` for iOS/Android. Pickup/dropoff are free-text addresses only — `pickup_lat/lng` and `dropoff_lat/lng` columns exist in the `delivery_requests` table but are never populated by the client.
- **No live tracking.** Given no geolocation and an empty `Tracking.tsx`, there's no way for a contractor to see where their delivery is.
- **No payments.** No Stripe/PayPal dependency, no pricing/estimate logic anywhere. Deliveries have no cost.
- **No push notifications.** No `expo-notifications` dependency. A contractor whose request gets assigned/updated will never know unless they manually reopen the app and re-check the list.

## Backend / infra gaps

- **Schema is now tracked and applied.** All five migrations under `supabase/migrations/` are applied to the live project and recorded in its migration history — `npm run db:diff` shows Local matching Remote for every one, so this is verifiable rather than assumed. Apply new ones with `npm run db:push`; don't paste SQL into the dashboard editor, which is how the drift below happened in the first place.
- **Known drift in the `users` table, deliberately left alone.** The live table predates migrations and stores `auth_id` as `TEXT` (not `UUID`) with a `bigint` primary key instead of `UUID`. The RLS policies cast to text to match. Retyping live columns is a separate, riskier migration and buys nothing today: `authService.ts` never reads `public.users.id` — the app's `User.id` is always the Supabase Auth UUID held in `auth_id`. The live table also carries unused `user_name` / `password_hash` columns from a pre-Supabase-Auth approach.
- Supabase CLI commands need a database password in `.env.local` (gitignored). This works around [supabase/cli#5091](https://github.com/supabase/cli/issues/5091), where the CLI's automatic login role fails on older projects with a "permission denied to alter role" error. Note that `.env` itself **is** committed — it holds only the URL and anon key, which are public by design and shipped in the app bundle; the database password must never go there.
- `app.json` has placeholder bundle identifiers (`com.yourcompany.materialdelivery`) and no permission descriptions, no EAS build config — not ready for a real device build or store submission.

## Docs vs. reality

Three older docs in the repo root describe past implementation work and are now partially stale:
- `AUTHENTICATION_SETUP.md` — accurate for what it covers, but predates session persistence being identified as missing.
- `DELIVERY_REQUEST_FEATURE.md` — accurate for the `NewRequest` form UX.
- `POST_AUTH_NAVIGATION.md` — accurate for the navigation split.
- The old `TODO.md` said "Replace Mock Data in RequestList with Real API Calls" was **Not Started** — it's actually done. That file has been rewritten (see [TODO.md](./TODO.md)) to reflect current reality and reorganized around what's needed to reach a usable Uber-like MVP.

These three docs are left as-is as historical implementation notes; treat `STATUS.md` and `TODO.md` as the current source of truth.
