// Barbell Labs — recovery flow for active-workout persistence (#226).
//
// On app launch, before the Log/Home screen is meaningful, we check
// IndexedDB for any in-flight workout and decide what to do:
//
//   • Found, started ≤ 12 hours ago         → AUTO-RESTORE silently. The
//                                              user lands on the Log screen
//                                              with their workout intact, no
//                                              banner, no prompt. Like they
//                                              never left. This is the
//                                              critical path for the iOS
//                                              process-kill case (the bug
//                                              that motivated #226).
//
//   • Found, started > 12 hours ago          → PROMPT the user. Some people
//                                              start a workout, get pulled
//                                              away, and come back the next
//                                              morning — auto-restoring a
//                                              stale session would be wrong.
//                                              They get a Restore / Discard
//                                              choice.
//
//   • Discard → archived to recoveredWorkouts (7-day soft-delete).
//
//   • No record                              → normal app launch.
//
// The 12-hour cutoff is a defensible default. Real users do 60-90 minute
// sessions. Anything close to a full day old is almost certainly stale.
// The constant is exported so we can tune post-launch with real data.

import { sessionDB } from "./db";
import {
  loadActiveWorkout,
  archiveDiscardedWorkout,
  clearActiveWorkout,
} from "./persistence";

export const RECOVERY_AUTO_RESTORE_WINDOW_MS = 12 * 60 * 60 * 1000; // 12 hours
const DISCARDED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Returns one of:
//   { kind: "none" }
//   { kind: "autoRestore", workout }       // < 12 hours old, just restore it
//   { kind: "prompt", workout, ageMs }     // older, need user decision
//
// Callers wire the result into App startup: kind="autoRestore" → setWorkout,
// kind="prompt" → render the recovery modal until user picks.
export async function checkForRecoverableWorkout(uid) {
  if (!uid) return { kind: "none" };
  const row = await loadActiveWorkout(uid);
  if (!row || !row.workout) return { kind: "none" };

  // The "started time" we care about is the user-visible workout start, not
  // the savedAt timestamp on the IDB row. savedAt updates on every keystroke;
  // startTime is when the user tapped "Start Workout."
  const startedAt = row.workout.startTime || row.savedAt || Date.now();
  const ageMs = Date.now() - startedAt;

  if (ageMs <= RECOVERY_AUTO_RESTORE_WINDOW_MS) {
    return { kind: "autoRestore", workout: row.workout };
  }
  return { kind: "prompt", workout: row.workout, ageMs };
}

// Called when the user picks "Discard" from the recovery prompt. Archives
// to the soft-delete store rather than hard-deleting.
export async function discardRecoverableWorkout(uid, workout) {
  if (!uid) return;
  await archiveDiscardedWorkout(uid, workout);
  await clearActiveWorkout(uid);
}

// Background housekeeping: purge soft-deleted recovered workouts older than
// 7 days. Cheap to run on every app launch; safe to skip if it errors.
export async function purgeOldRecoveredWorkouts() {
  try {
    const cutoff = Date.now() - DISCARDED_RETENTION_MS;
    await sessionDB.recoveredWorkouts
      .where("discardedAt")
      .below(cutoff)
      .delete();
  } catch (err) {
    console.warn("[workoutSession] purgeOldRecoveredWorkouts skipped:", err);
  }
}

// Format the "started X ago" string for the recovery prompt. Kept here so the
// modal doesn't have to know our internal age semantics.
export function formatWorkoutAge(ageMs) {
  const hours = Math.floor(ageMs / (60 * 60 * 1000));
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Pre-formatted summary for the recovery modal body — kept here to keep the
// modal stateless and copy in one place.
export function summarizeRecoverableWorkout(workout, ageMs) {
  const exercises = workout?.exercises?.length || 0;
  const sets = (workout?.exercises || []).reduce(
    (n, ex) => n + (ex?.sets?.length || 0),
    0
  );
  const ageStr = formatWorkoutAge(ageMs);
  const exLabel = exercises === 1 ? "exercise" : "exercises";
  const setLabel = sets === 1 ? "set" : "sets";
  return `${exercises} ${exLabel}, ${sets} ${setLabel} logged · started ${ageStr}`;
}
