# Material Delivery App - TODO List

## 🔴 Critical Issues (Must Fix)

### 1. Add Form Validation to All Forms

- **Status:** Not Started
- **Priority:** HIGH
- **Files Affected:**
  - `src/screens/Contractor/NewRequest.tsx` (currently has basic validation)
  - `src/screens/Auth/SignIn.tsx` (has validation ✓)
  - `src/screens/Auth/SignUp.tsx` (has validation ✓)
- **Details:**
  - Validate that all required fields are filled before proceeding to next step
  - Show real-time validation feedback (red borders, error messages)
  - Validate email format, password strength, address fields
  - Test on all platforms (iOS/Android)
- **Acceptance Criteria:**
  - All form inputs show validation errors on blur/change
  - Next/Submit buttons disabled until form is valid
  - Error messages are clear and helpful

### 2. Fix Delivery Request Submission Failure

- **Status:** In Progress
- **Priority:** HIGH
- **Error:** "Failed to submit request. Please try again."
- **Investigation Steps:**
  1. Verify `delivery_requests` table exists in Supabase
  2. Check RLS policies allow INSERT from authenticated users
  3. Verify auth_id column exists and matches schema
  4. Check console logs for specific API error codes (400/401/403/404)
  5. Validate request payload matches table columns exactly
- **Possible Causes:**
  - Table doesn't exist in Supabase (need to run SQL migration)
  - RLS policies blocking INSERT operation (403 Forbidden)
  - Missing or misnamed columns in table
  - Invalid data types in payload (e.g., weight as string instead of number)
  - Access token expired or invalid
- **Solution Path:**
  1. Check Supabase dashboard > Tables > delivery_requests exists
  2. Check RLS policies are enabled and correct
  3. Enable detailed error logging (already done)
  4. Test with curl or Postman to isolate client vs API issue
  5. Add request/response logging to axios interceptors

### 3. Implement Session Persistence

- **Status:** Not Started
- **Priority:** HIGH
- **Details:**
  - Store accessToken in SecureStore (iOS) or EncryptedSharedPreferences (Android)
  - Restore session on app launch from stored token
  - Handle token expiration and refresh
  - Auto-logout if token is invalid
- **Files to Create/Modify:**
  - Create `src/services/auth/sessionService.ts`
  - Update `src/App.tsx` to restore session on mount
  - Update `AuthContext.tsx` to support persistent state
- **Dependencies:** `react-native-encrypted-storage` or `expo-secure-store`
- **Acceptance Criteria:**
  - User stays logged in after closing and reopening app
  - Token refresh happens automatically
  - Invalid tokens trigger re-authentication
  - No plaintext tokens stored anywhere

---

## 🟡 Important Features (Should Fix Soon)

### 4. Replace Mock Data in RequestList with Real API Calls

- **Status:** Not Started
- **Priority:** HIGH
- **Files Affected:** `src/screens/Contractor/RequestList.tsx`
- **Details:**
  - Remove MOCK_REQUESTS constant
  - Fetch requests from `getDeliveryRequests()` on component mount
  - Add pull-to-refresh functionality
  - Add pagination/infinite scroll for large lists
  - Show loading skeleton while fetching
  - Handle empty state and errors gracefully
- **Implementation:**
  ```typescript
  useEffect(() => {
    if (accessToken && user?.id) {
      fetchRequests(accessToken, `auth_id=eq.${user.id}`);
    }
  }, [accessToken, user?.id]);
  ```
- **Acceptance Criteria:**
  - Requests load from database on component mount
  - Filtered by current user's auth_id
  - Pull-to-refresh triggers new fetch
  - Empty state shows when user has no requests
  - Loading states properly displayed

### 5. Implement Delivery Request Details/Edit Screen

- **Status:** Not Started
- **Priority:** MEDIUM
- **Files to Create:**
  - `src/screens/Contractor/RequestDetail.tsx`
- **Details:**
  - Show full request details (location map view, material info, vehicle requirements)
  - Allow editing of pending requests only
  - Allow cancellation of pending requests
  - Show request status timeline
  - Show assigned driver info (when assigned)
- **Navigation:** RequestList → RequestDetail (on card tap)
- **Acceptance Criteria:**
  - All request fields displayed clearly
  - Edit button navigates to edit screen
  - Delete/cancel only available for pending requests
  - Changes saved back to database

### 6. Implement Driver Dashboard (JobsNearby)

- **Status:** Not Started
- **Priority:** MEDIUM
- **Files Affected:** `src/screens/Driver/JobsNearby.tsx`
- **Details:**
  - Display available delivery requests near driver's location
  - Filter by distance, material type, vehicle requirements
  - Show estimated earnings for each job
  - Accept/reject jobs with confirmation
  - Add to active jobs list when accepted
- **Features Needed:**
  - Real-time location tracking (GPS)
  - Distance calculation from driver location to pickup/dropoff
  - Job matching algorithm
  - Notifications when new jobs available nearby
- **Acceptance Criteria:**
  - Jobs load and display with distance calculated
  - Driver can accept jobs
  - Accepted jobs move to active list
  - No jobs shown outside driver's service area

### 7. Implement Active Jobs/Tracking Screen

- **Status:** Not Started
- **Priority:** MEDIUM
- **Files Affected:** `src/screens/Contractor/Tracking.tsx` (expand), `src/screens/Driver/ActiveJobs.tsx` (create)
- **Details:**
  - Show real-time tracking of in-transit deliveries
  - Display driver location on map
  - Show delivery progress (pickup → in transit → dropped off)
  - Allow status updates (arrived at pickup, loaded, en route, arrived at dropoff)
  - Show estimated time of arrival
- **Features:**
  - Real-time location updates via WebSocket or polling
  - Maps integration for route visualization
  - Status update buttons/UI
- **Acceptance Criteria:**
  - Map shows current driver location
  - Delivery status updates in real-time
  - ETA calculated and displayed
  - Status history logged

### 8. Implement Profile Screen Functionality

- **Status:** Partially Done (UI complete, no functionality)
- **Priority:** MEDIUM
- **Files Affected:** `src/screens/Common/Profile.tsx`
- **Details:**
  - Edit Profile button → navigate to edit screen
  - Change Password → password reset flow
  - Payment Methods → manage payment cards/accounts
  - Toggle notifications/email preferences (save to database)
  - Help & Support → open support link/email
  - Privacy Policy/Terms → open in browser or in-app modal
  - Logout → clear session (✓ already done)
- **Files to Create:**
  - `src/screens/Common/EditProfile.tsx`
  - `src/screens/Common/ChangePassword.tsx`
  - `src/screens/Common/PaymentMethods.tsx`
- **Acceptance Criteria:**
  - All menu items navigate or perform actions
  - Settings persist to database
  - User preferences reflected across app
  - Links open correctly

### 9. Add Address Autocomplete

- **Status:** Not Started
- **Priority:** MEDIUM
- **Files Affected:** `src/screens/Contractor/NewRequest.tsx`
- **Details:**
  - Integrate Google Places API for address suggestions
  - Show dropdown of address suggestions as user types
  - Extract lat/lng from selected address
  - Store coordinates with request
- **Dependencies:** `@react-native-community/google-places` or similar
- **Implementation:**
  - Add places API to config
  - Update pickup/dropoff input components
  - Test address parsing and coordinate extraction
- **Acceptance Criteria:**
  - Address suggestions appear as user types
  - Selecting address populates coordinates
  - Invalid addresses rejected on submit

### 10. Add GPS/Geolocation Services

- **Status:** Not Started
- **Priority:** MEDIUM
- **Files to Create:** `src/services/geolocation/locationService.ts` (expand existing stub)
- **Details:**
  - Real-time location tracking for active jobs
  - Distance calculation between points
  - Geofencing for pickup/dropoff locations
  - Background location updates for drivers
- **Dependencies:** `expo-location`
- **Permissions:** Request location permissions on iOS/Android
- **Acceptance Criteria:**
  - Driver location updates while job is active
  - Distance calculations are accurate
  - Arrival notifications when near pickup/dropoff

### 11. Add Push Notifications

- **Status:** Not Started
- **Priority:** MEDIUM
- **Files to Create:** `src/services/notifications/notificationService.ts`
- **Details:**
  - Notify contractors when driver assigned to request
  - Notify drivers of new nearby jobs
  - Notify contractors of delivery status updates
  - Notify drivers of pickup/dropoff location details
- **Dependencies:** `expo-notifications`
- **Implementation:**
  - Request notification permissions
  - Set up Firebase Cloud Messaging (FCM) / APNs
  - Handle notification taps to navigate to relevant screens
- **Acceptance Criteria:**
  - Notifications appear when expected
  - Tapping notification opens relevant screen
  - User can enable/disable notifications in Profile

---

## 🟢 Nice-to-Have Features (Future)

### 12. Implement Payment System

- **Status:** Not Started
- **Priority:** LOW
- **Files to Create:** `src/screens/Payments/` directory
- **Details:**
  - Show delivery pricing breakdown
  - Process payments for completed requests
  - Store payment methods securely
  - Show payment history
  - Calculate driver earnings
- **Dependencies:** Stripe or PayPal integration
- **Note:** Requires PCI compliance and backend payment processing

### 13. Add Analytics/Reporting

- **Status:** Not Started
- **Priority:** LOW
- **Details:**
  - Track delivery metrics (completed, in-transit, pending)
  - Calculate driver earnings/performance
  - Generate reports for contractors and drivers
  - Track app usage and user behavior
- **Dependencies:** Firebase Analytics, Segment, or similar
- **Files to Create:** Analytics service wrapper

### 14. Implement Admin Dashboard

- **Status:** Not Started
- **Priority:** LOW
- **Files to Create:** `src/screens/Admin/` directory
- **Details:**
  - View all users, requests, and jobs
  - Approve/reject contractors
  - Suspend/ban users
  - View system metrics and health
  - Manage platform settings
- **Authentication:** Admin role check in navigation

### 15. Add Social Authentication

- **Status:** Not Started
- **Priority:** LOW
- **Details:**
  - Sign in with Google
  - Sign in with Apple (required for iOS)
  - Link social accounts to existing profiles
- **Dependencies:** `@react-native-google-signin/google-signin`

### 16. Implement Dark Mode

- **Status:** Not Started
- **Priority:** LOW
- **Details:**
  - Create dark theme color scheme
  - Toggle dark/light mode in Profile
  - Persist user preference
- **Files to Modify:** All components' StyleSheets

### 17. Add Accessibility Features

- **Status:** Not Started
- **Priority:** LOW
- **Details:**
  - Add accessibility labels to all interactive elements
  - Test with screen readers (VoiceOver on iOS)
  - Ensure minimum font sizes
  - High contrast mode support
  - Keyboard navigation support

### 18. Implement Offline Mode

- **Status:** Not Started
- **Priority:** LOW
- **Details:**
  - Cache requests/jobs locally
  - Queue actions when offline
  - Sync when connection restored
  - Show offline indicator to user

---

## 📋 Testing & QA

### 19. Add Unit Tests

- **Status:** Not Started
- **Priority:** MEDIUM
- **Details:**
  - Test authentication flow
  - Test form validation
  - Test API service calls (with mocks)
  - Test context state management
- **Framework:** Jest + React Native Testing Library
- **Target Coverage:** 70%+

### 20. Add Integration Tests

- **Status:** Not Started
- **Priority:** MEDIUM
- **Details:**
  - Test signup → dashboard flow
  - Test request creation → view in list
  - Test driver accepting job flow
  - End-to-end delivery workflow

### 21. Perform Manual QA Testing

- **Status:** Not Started
- **Priority:** HIGH
- **Devices:** iPhone, iPad, Android phones
- **Test Cases:**
  - Signup/login/logout flows
  - Form submissions and validation
  - Navigation between screens
  - Offline behavior
  - Memory/performance on old devices

---

## 📚 Documentation

### 22. Add Code Comments & JSDoc

- **Status:** Not Started
- **Priority:** LOW
- **Details:**
  - Document all public functions
  - Add inline comments for complex logic
  - Document API service methods
  - Create architectural overview document

### 23. Create API Documentation

- **Status:** Not Started
- **Priority:** LOW
- **Details:**
  - Document all Supabase endpoints used
  - Document error codes and handling
  - Create API integration guide for new developers

### 24. Create Setup & Deployment Guide

- **Status:** Not Started
- **Priority:** LOW
- **Details:**
  - Environment setup instructions
  - Supabase configuration guide
  - iOS/Android build instructions
  - Deployment checklist

---

## 🔧 Code Quality & Maintenance

### 25. Fix Linting Issues

- **Status:** Not Started
- **Priority:** LOW
- **Details:**
  - Configure ESLint rules
  - Run linter across codebase
  - Fix all warnings and errors
  - Add pre-commit hooks

### 26. Refactor/Optimize Components

- **Status:** Not Started
- **Priority:** LOW
- **Details:**
  - Break down large components
  - Reduce re-renders with useMemo/useCallback
  - Optimize StyleSheets
  - Remove unused imports

### 27. Update Dependencies

- **Status:** Not Started
- **Priority:** MEDIUM
- **Details:**
  - Check for outdated packages
  - Update to latest stable versions
  - Test for breaking changes
  - Review security advisories

---

## 📊 Current Status Summary

| Category           | Total  | Done  | In Progress | Not Started |
| ------------------ | ------ | ----- | ----------- | ----------- |
| Critical Issues    | 3      | 0     | 1           | 2           |
| Important Features | 8      | 0     | 0           | 8           |
| Nice-to-Have       | 7      | 0     | 0           | 7           |
| Testing & QA       | 3      | 0     | 0           | 3           |
| Documentation      | 3      | 0     | 0           | 3           |
| Code Quality       | 3      | 0     | 0           | 3           |
| **TOTAL**          | **27** | **0** | **1**       | **26**      |

---

## 🎯 Next Steps (Recommended Priority Order)

1. **Fix Delivery Request Submission** (#2) - Blocking feature testing
2. **Add Form Validation** (#1) - Improves UX and prevents errors
3. **Implement Session Persistence** (#3) - Core user experience
4. **Replace Mock Data** (#4) - Enable real data testing
5. **Implement Driver Dashboard** (#6) - Core feature for drivers

---

## Notes

- All dates are as of March 19, 2026
- Some tasks depend on others (e.g., #4 requires #2 to work)
- Prioritization can change based on business requirements
- Community feedback should influence prioritization
- Security and critical bugs take precedence over features
