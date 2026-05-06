// Barbell Labs — public exports for the workout-session persistence layer.
//
// App.jsx imports from here only. Internal modules (db.js, etc.) are an
// implementation detail. Future Zustand migration would expand this surface
// (#144) without changing how App.jsx talks to the layer.

export {
  saveActiveWorkout,
  clearActiveWorkout,
  loadActiveWorkout,
} from "./persistence";

export {
  checkForRecoverableWorkout,
  discardRecoverableWorkout,
  purgeOldRecoveredWorkouts,
  summarizeRecoverableWorkout,
  RECOVERY_AUTO_RESTORE_WINDOW_MS,
} from "./recovery";

export { installLifecycleListeners } from "./lifecycle";
