// Barbell Labs — write-through persistence for active workouts (#226).
//
// Public API:
//
//   saveActiveWorkout(uid, workout)        — write the in-flight session to
//                                            IndexedDB. Safe to call as often
//                                            as you like; record is small.
//
//   clearActiveWorkout(uid)                — remove the user's in-flight
//                                            session (call after Finish, or
//                                            when the user explicitly
//                                            discards via the recovery prompt).
//
//   loadActiveWorkout(uid)                 — read back the in-flight session,
//                                            or null. Used by the recovery
//                                            flow on app launch.
//
//   archiveDiscardedWorkout(uid, workout)  — move a discarded workout into
//                                            the recoveredWorkouts soft-delete
//                                            store with a timestamp.
//
//   getMostRecentSavedAt(uid)              — for diagnostic / breadcrumb use.
//
// Why a separate function for archive vs. just deleting: users who tap
// "Discard" on the recovery prompt sometimes mean "not now" rather than
// "obliterate this." We keep the workout for 7 days in case they realize
// the mistake. The 7-day purge is handled by recovery.js on next launch.
//
// All functions are async (Dexie is promise-based) but write times are
// well under a frame on any modern device. Callers do NOT need to await
// during normal interactive flows — fire and let it land. The exception is
// lifecycle handlers that fire on app pause, where callers should await
// (and on iOS, even synchronous-feeling calls have at most a few ms before
// the OS suspends the JS runtime).

import { sessionDB } from "./db";

export async function saveActiveWorkout(uid, workout) {
  if (!uid || !workout) return;
  try {
    await sessionDB.activeWorkouts.put({
      uid,
      workout,
      savedAt: Date.now(),
    });
  } catch (err) {
    // Never silent-fail. Surface to console so devtools shows it; once Sentry
    // is wired in a follow-up (#68 deferred), this becomes a captureException.
    console.error("[workoutSession] saveActiveWorkout failed:", err);
  }
}

export async function clearActiveWorkout(uid) {
  if (!uid) return;
  try {
    await sessionDB.activeWorkouts.delete(uid);
  } catch (err) {
    console.error("[workoutSession] clearActiveWorkout failed:", err);
  }
}

export async function loadActiveWorkout(uid) {
  if (!uid) return null;
  try {
    const row = await sessionDB.activeWorkouts.get(uid);
    return row || null;
  } catch (err) {
    console.error("[workoutSession] loadActiveWorkout failed:", err);
    return null;
  }
}

export async function archiveDiscardedWorkout(uid, workout) {
  if (!uid || !workout) return;
  try {
    await sessionDB.recoveredWorkouts.add({
      uid,
      workout,
      discardedAt: Date.now(),
    });
  } catch (err) {
    console.error("[workoutSession] archiveDiscardedWorkout failed:", err);
  }
}

export async function getMostRecentSavedAt(uid) {
  if (!uid) return null;
  try {
    const row = await sessionDB.activeWorkouts.get(uid);
    return row ? row.savedAt : null;
  } catch {
    return null;
  }
}
