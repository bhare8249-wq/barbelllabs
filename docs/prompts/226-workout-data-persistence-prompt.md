# #226 — Workout Data Persistence & Recovery (CRITICAL, launch-blocking)

## Why this matters

Two real users have lost active workout data on iPhone — workouts simply disappeared while the app was open but backgrounded. This is almost certainly **iOS aggressive memory reclamation killing the background process** while the user is texting / using Spotify / etc. When they return to Barbell Labs, the app reloads from scratch and the in-memory React state is gone.

This bug, left unfixed, will end the app at launch. App Store reviews will hammer "lost my workout" and Week-1 reviews carry permanent weight. We cannot ship without solving this.

## Context from sync report

Current state of the codebase (relevant pieces):

- **App.jsx is 6,652 lines** — single file, no module structure
- **Firestore offline persistence:** NOT enabled. `firebase.js` is 21 lines, just `getFirestore(app)`. No `enableIndexedDbPersistence` / `persistentLocalCache` / `initializeFirestore` anywhere.
- **Active workout state:** Only Firestore via `useStorage` (writes whole user doc on save) + optimistic UI from PR #43. **No localStorage / Capacitor Preferences / IndexedDB persistence of in-progress workout state.**
- **localStorage usage:** Rest timer state (`bl_timer_v1`), onboarding flag, cookie consent, theme. No active workout data.
- **IndexedDB:** Not used directly. Dexie not installed.
- **Capacitor Preferences:** NOT installed.
- **Capacitor lifecycle listeners:** NONE. Only `@capacitor/core`, `/ios`, `/android`, `/cli` are installed (v8.3.1). No `@capacitor/app`. No `App.addListener` for `pause` / `appStateChange` anywhere. The only lifecycle hook is web `document.addEventListener("visibilitychange")` in RestTimer for catch-up.
- **Sentry (#68):** NOT installed.
- **`set.done` field:** New field added in #217 by the ✓ button. Persists via `useStorage`. Use this for "user-completed" intent.

## Architectural decision (important)

The persistence layer for active workouts is significant new code (~500-800 lines of infrastructure when done right). Adding all of it inline into App.jsx would push the monolith from 6,652 lines to ~7,500 lines and make it untestable.

**Recommended approach: Use this work as the start of the #144 refactor.**

Don't refactor everything at once — but **extract the workout state management into its own module(s)** as part of building the persistence layer. This creates the first proper module boundary in the codebase without trying to refactor the whole monolith.

Suggested structure (your call on exact shape):

```
src/
  workoutSession/
    WorkoutSessionContext.jsx     // React context + provider
    workoutSessionState.js         // pure state shape + reducers
    workoutSessionPersistence.js   // IndexedDB write-through layer
    workoutSessionRecovery.js      // app-launch recovery logic
    lifecycleListeners.js          // Capacitor + web lifecycle wiring
    index.js                       // public exports
```

App.jsx imports from `./workoutSession`. Active workout state moves out of App.jsx component state into the new context/provider. This is also where future Zustand migration would land.

If you decide a different structure makes more sense given how App.jsx is organized today, that's fine — the principle is: **don't dump 500+ lines of persistence infra inline into App.jsx.**

---

## Goal

**Active workout state must survive anything iOS or Android throws at it** — backgrounding, process kill, app crash, force-quit, network loss, low memory pressure. When the app is reopened, the workout is exactly as the user left it.

---

## Architecture: write-through to multiple layers

Every state-changing action during an active workout writes to multiple layers immediately:

1. **In-memory React state** (fastest, current behavior — keep)
2. **IndexedDB** (NEW — survives iOS process kill, readable on app launch, primary recovery source)
3. **Firestore** (network-dependent, eventual sync, source of truth across devices)

The critical layer is **IndexedDB**. It survives iOS process kill and is readable instantly on app relaunch. It is the primary source of truth for in-progress workouts on mobile. Firestore syncs eventually as best-effort.

**Library recommendation: Dexie.js.** It's the standard IndexedDB wrapper for React apps — small (~40KB), reactive hooks available, simple API. If you prefer raw IndexedDB or another wrapper, your call — but justify in your sync report.

---

## Persistence triggers

Every meaningful state change during an active workout writes to IndexedDB immediately:

- Set logged (weight, reps, RPE entered)
- Set marked done (✓ tap, `set.done` toggled)
- Set edited
- Set deleted
- Exercise added
- Exercise removed
- Notes typed (debounced 300ms after last keystroke)
- Rest timer started/stopped/reset
- Workout-level metadata changes (name, tags, etc.)
- App backgrounded (Capacitor `pause` event) → force-save synchronously
- App focus lost (web `visibilitychange` to hidden) → force-save
- Every 10 seconds during active workout → save (heartbeat — defensive against missed events)

The active workout object is small (single user's current session). Writes should be near-instant and have no perceptible cost. If write performance is ever a problem, batching is the answer — but start with synchronous writes.

---

## Capacitor lifecycle wiring (NEW infrastructure)

Currently no Capacitor lifecycle listeners exist. You need to:

1. Install `@capacitor/app`:
   ```
   npm install @capacitor/app
   npx cap sync
   ```

2. Wire `App.addListener('appStateChange', ...)` to force-save on background:
   ```js
   import { App } from '@capacitor/app';

   App.addListener('appStateChange', ({ isActive }) => {
     if (!isActive) {
       // force synchronous save to IndexedDB
       saveActiveWorkoutNow();
     }
   });
   ```

3. Also wire `pause` and `resume` for redundancy on iOS specifically (sometimes more reliable than `appStateChange`).

4. Keep the web `visibilitychange` listener as a fallback for browser/PWA contexts.

---

## Firestore offline persistence (separate task in same fix)

Modern Firebase v9+ uses `initializeFirestore` with `persistentLocalCache`:

```js
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
```

This replaces the existing `getFirestore(app)` call in `firebase.js`. After this, Firestore writes queue locally when offline and sync when reconnected — critical for spotty gym wifi.

**Important:** Test that this doesn't break existing reads/writes. The IndexedDB cache that Firestore manages is separate from the IndexedDB store you'll build for active workout state — they coexist fine, but verify.

---

## Recovery flow on app launch

When the app launches, before showing Home or any other screen:

1. Check IndexedDB for any active (unfinished) workout
2. **If found and "recent" (started within last 12 hours):** Auto-restore. User lands on the Log screen with their workout intact, no banner, no prompt. Like they never left.
3. **If found but older than 12 hours:** Show a recovery prompt:
   - Title: "We found a workout from earlier"
   - Body: "[Workout name] — [N exercises, M sets logged] — started [time ago]"
   - Buttons: "Restore" (primary) / "Discard" (secondary, destructive styling)
4. **If user discards:** Move workout to a separate `recovered_workouts` IndexedDB store (don't hard delete). After 7 days, auto-purge. This is a safety net for "I meant to keep that."
5. **If no active workout:** Normal app launch.

The 12-hour window is configurable. Recommend defaulting to 12 hours for now; can be tuned post-launch with real data.

---

## Heartbeat save during active workout

In addition to event-based saves, run a 10-second interval that force-saves the active workout to IndexedDB. This is defensive — if any event listener fails to fire (rare but possible on backgrounding), the heartbeat catches it.

```js
useEffect(() => {
  if (!hasActiveWorkout) return;
  const interval = setInterval(() => {
    saveActiveWorkoutNow();
  }, 10_000);
  return () => clearInterval(interval);
}, [hasActiveWorkout]);
```

Small cost, high insurance value.

---

## Sentry integration (executes #68)

Install Sentry as part of this work — it's needed to verify the fix is actually working in the wild post-launch.

```
npm install @sentry/react
```

Configure with workout-context tagging: when an active workout is in progress, every Sentry event should be tagged with `workout_active: true`. Lets you filter "did this user crash mid-workout" post-launch.

Specifically log breadcrumbs for:
- Workout started
- Workout saved to IndexedDB (with size, duration since last save)
- Lifecycle event fired (pause, resume, appStateChange)
- Recovery flow triggered (restored / discarded / no recovery)
- IndexedDB write failures (the most important one — never silent-fail)

Don't log full workout data (PII concerns); log structural info only (exercise count, set count, duration).

---

## Acceptance criteria

Test these specifically before declaring done:

- **Force-quit mid-workout** → reopen → workout intact, exactly as left
- **Background the app for 30 minutes** → reopen → workout intact
- **Background, then kill the process via task manager** → reopen → workout intact
- **Lose network mid-workout** → continue logging → reconnect → all data syncs to Firestore
- **Crash the app artificially mid-workout** (throw an error) → reopen → workout intact
- **Tested on iPhone** — especially older models with less RAM (iPhone 12 or older if possible). iOS 17+. Memory pressure is real on older devices.
- **Tested on Android** — Samsung especially has aggressive battery-management process killing. Test on a Samsung device if available.
- **Tested with 60+ minute active workouts** — longer sessions = more iOS pressure to kill. Don't just test with 5-minute workouts.
- **Recovery prompt** displays correctly for 12+ hour old workouts
- **Discarded workouts** are recoverable from `recovered_workouts` store within 7 days

---

## What NOT to do

- **Don't try to refactor all of App.jsx in this PR.** Just extract workout state management. The rest of the refactor (#144) is its own future task.
- **Don't change existing Firestore data shape.** Active workout state in IndexedDB is a *cache + recovery layer*, not a replacement. Firestore remains the source of truth across devices.
- **Don't break existing optimistic UI from PR #43.** That stays.
- **Don't change `useStorage` semantics for non-workout data.** Other things using `useStorage` (templates, profile, history) work fine — leave them alone.
- **Don't bundle in unrelated work.** This is critical and large enough on its own.
- **Don't use localStorage for workout state.** It's synchronous (blocks UI), size-limited (~5-10MB), and stringly-typed. IndexedDB is the right tool.

---

## Bundling opportunity to consider

Code's sync flagged: **#218 (swipe-to-delete state persistence)** may be related — swipe state may be part of what's getting lost on iOS kill. Quick check during this work: is swipe state currently in React state only? If so, it's getting wiped by the same process kill that wipes workout state. The fix for #226 may incidentally help.

**However:** if #218 needs more than a trivial fix, save it for the workout safety bundle (next prompt). Don't expand scope of #226 just to cover #218.

---

## Sync-back format

When done, send back:

- PR number(s) and version bump (manually bump version this time — pre-commit hook is missing on desktop, see #227)
- New module structure (file paths and brief description of what each does)
- Confirmation of which acceptance criteria are met (with test details — what device, what scenario)
- Any decisions you made that diverged from the spec, and why
- Any items discovered along the way that should be added to the master list
- Confirmation of whether #218 was incidentally fixed by this work, or if it still needs its own fix
- Sentry setup status (installed, configured, breadcrumbs wired)

---

## Closing context

This fix is the single most important thing standing between the app and a viable launch. Take the time to do it right — extract the module structure cleanly, test on real devices including older iPhones and Samsung, instrument with Sentry so you can see if it's working post-launch.

If you hit something during implementation that requires a decision Brian needs to make (architectural fork, library choice, scope question), pause and ask. Don't unilaterally make calls on critical-path infrastructure.
