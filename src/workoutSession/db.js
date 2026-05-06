// Barbell Labs — IndexedDB schema for the active-workout persistence layer (#226).
//
// Two stores live in the `barbellLabsSession` database:
//
//   activeWorkouts     — at most one row per user (keyed by uid). Holds the
//                        in-flight workout that the user is currently logging.
//                        Writes happen on every meaningful state change so this
//                        record survives iOS process kill, app crashes, force
//                        quits, low-memory eviction, etc. The recovery flow
//                        reads from here on app launch.
//
//   recoveredWorkouts  — soft-delete graveyard for workouts the user told us
//                        to "Discard" from the recovery prompt. Auto-purged
//                        after 7 days (handled in recovery.js). Safety net
//                        for the "I meant to keep that" case.
//
// The active-workout record is intentionally small (single user's current
// session) so writes are near-instant and there's no perceivable cost to
// saving on every change.
//
// Schema is keyed on `uid` so the same browser/device can serve multiple
// signed-in users without crossing wires. Pre-auth (no uid yet) workouts
// would never be in flight in this app — startWorkout is gated by the
// authenticated session — so we don't model an anonymous case.

import Dexie from "dexie";

class WorkoutSessionDB extends Dexie {
  constructor() {
    super("barbellLabsSession");
    // v1 schema. The primary key in both stores is `uid` for activeWorkouts
    // (one in-flight session per user) and an autoincrement id for the
    // recovered graveyard so multiple discarded sessions per user can coexist.
    this.version(1).stores({
      activeWorkouts: "uid, savedAt",
      recoveredWorkouts: "++id, uid, discardedAt",
    });
  }
}

export const sessionDB = new WorkoutSessionDB();
