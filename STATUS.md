# Project Status

**Last verified against code:** 2026-08-25
**Purpose:** ground-truth snapshot of what's actually implemented, checked directly against `src/` — not a plan, not a wishlist. See [TODO.md](./TODO.md) for what's left and in what order.

This app is meant to become an Uber-like marketplace for construction material delivery: contractors post delivery requests, drivers see and accept nearby jobs, both sides track the delivery live, and money changes hands at the end. Today it has a working **request intake pipeline** (contractor signs up, submits a request, sees it in a list) but **no matching, dispatch, driver-side, tracking, or payment functionality** — those are the pieces that make it "Uber-like," and they don't exist yet, not even as a manual/admin-assisted process.

---

## What actually works end-to-end

- **Sign up / sign in / forgot password** (`src/screens/Auth/`) — calls Supabase's Auth REST API directly via axios (`src/services/firebase/authService.ts`), not the `@supabase/supabase-js` client despite it being a dependency. Creates a row in a `users` table keyed by `auth_id`. Role is chosen at signup (contractor / driver / admin).
- **Role-based navigation** (`src/navigation/MainNavigator.tsx`) — after login, drivers and contractors see different stacks. Admin role exists in the type/signup form but has no screens.
- **Create a delivery request** (`src/screens/Contractor/NewRequest.tsx` → `src/services/api/deliveryRequests.ts`) — real 4-step wizard (location → material → vehicle → review), validated, submitted as a genuine `POST` to `delivery_requests` in Supabase. This is fully wired, not mocked.
- **View my requests** (`src/screens/Contractor/RequestList.tsx`) — fetches the contractor's own requests from Supabase, filters by status, pull-to-refresh. Also fully wired, not mocked (older docs in this repo say otherwise — see "Docs vs. reality" below).
- **Driver job feed** (`src/screens/Driver/JobsNearby.tsx`) — lists all `delivery_requests` with `status = 'pending'`, pull-to-refresh, refetches on focus. A driver can now see open requests. No distance/radius filtering yet (no coordinates captured on requests — see gaps below). Tapping a job goes to `JobDetail`, which is still a placeholder, and there is no Accept action anywhere yet, so a driver can look but not act.
- **Logout** — clears in-memory auth state (see session caveat below).

## What exists as UI shell only ("Coming soon")

These screens render and are reachable, but have no logic:

- `src/screens/Driver/JobDetail.tsx`, `src/screens/Driver/Earnings.tsx`
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

- **No session persistence.** `AuthContext` (`src/context/AuthContext.tsx`) holds `user` and `accessToken` in plain `useState`. Force-quit the app and you're logged out — every session starts at the sign-in screen. No `expo-secure-store` or equivalent is installed.
- **No token refresh.** The Supabase access token is short-lived; nothing refreshes it, so a session left open will start silently failing requests.
- **No accept/dispatch mechanism.** Drivers can now *see* pending requests (`JobsNearby.tsx`), but there is no way for one to claim a job — no Accept action, and the current RLS policies on `delivery_requests` only allow the request's owner to UPDATE it, so even a naive "accept" button would be rejected by the database as written. This is still the core gap standing between this app and being "Uber-like."
- **No geolocation.** `expo-location` isn't a dependency. No permission strings are declared in `app.json` for iOS/Android. Pickup/dropoff are free-text addresses only — `pickup_lat/lng` and `dropoff_lat/lng` columns exist in the `delivery_requests` table but are never populated by the client.
- **No live tracking.** Given no geolocation and an empty `Tracking.tsx`, there's no way for a contractor to see where their delivery is.
- **No payments.** No Stripe/PayPal dependency, no pricing/estimate logic anywhere. Deliveries have no cost.
- **No push notifications.** No `expo-notifications` dependency. A contractor whose request gets assigned/updated will never know unless they manually reopen the app and re-check the list.

## Backend / infra gaps

- Only one migration is checked in: `sql/create_delivery_requests_table.sql`. The `users` table that `authService.ts` reads and writes has **no migration file in the repo** — it exists only in the live Supabase project (or doesn't, if this is a fresh environment). Anyone setting this project up from scratch cannot reproduce the schema.
- `.env` is present but both `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are currently blank in this checkout — the app cannot talk to Supabase until those are filled in locally.
- `app.json` has placeholder bundle identifiers (`com.yourcompany.materialdelivery`) and no permission descriptions, no EAS build config — not ready for a real device build or store submission.
- Working tree currently has uncommitted changes (`ios/MaterialDelivery.xcodeproj/project.pbxproj`, `package.json`, `package-lock.json`) and untracked files (`ios/MaterialDelivery.xcworkspace/`, `ios/Podfile.lock`, `patches/`) from a recent `pod install`/prebuild — worth committing or reviewing before they're lost, separate from the feature work tracked here.

## Docs vs. reality

Three older docs in the repo root describe past implementation work and are now partially stale:
- `AUTHENTICATION_SETUP.md` — accurate for what it covers, but predates session persistence being identified as missing.
- `DELIVERY_REQUEST_FEATURE.md` — accurate for the `NewRequest` form UX.
- `POST_AUTH_NAVIGATION.md` — accurate for the navigation split.
- The old `TODO.md` said "Replace Mock Data in RequestList with Real API Calls" was **Not Started** — it's actually done. That file has been rewritten (see [TODO.md](./TODO.md)) to reflect current reality and reorganized around what's needed to reach a usable Uber-like MVP.

These three docs are left as-is as historical implementation notes; treat `STATUS.md` and `TODO.md` as the current source of truth.
