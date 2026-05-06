// Barbell Labs — lifecycle wiring for active-workout persistence (#226).
//
// Three layers of defense ensure the active workout is in IndexedDB before
// the OS suspends or kills the process:
//
//   1. Capacitor `appStateChange`        — fires when the native shell loses
//                                          focus (user backgrounded the app,
//                                          locked the phone, swiped to
//                                          another app). The most reliable
//                                          signal on iOS specifically.
//
//   2. Capacitor `pause` (iOS redundancy) — sometimes fires when
//                                          appStateChange doesn't, especially
//                                          on older iPhones. Belt-and-
//                                          suspenders.
//
//   3. Web `visibilitychange` to hidden  — covers the PWA / browser case
//                                          and acts as a fallback when
//                                          running in a Capacitor shell that
//                                          for any reason doesn't fire the
//                                          native events.
//
//   PLUS a 10-second heartbeat that force-saves while a workout is active —
//   defensive against any of the event listeners failing to fire.
//
// The Capacitor `App` plugin is loaded dynamically so this module also works
// in a pure web/browser context (npm start, Vercel preview) where the native
// shim isn't bound. If the dynamic import fails we fall through to the web
// listener only — same effective coverage in browser-only contexts.
//
// Caller responsibility: pass a stable `getCurrentWorkout` getter that
// returns the latest in-memory workout state. We avoid taking a snapshot at
// install-time because by the time the lifecycle event fires, the snapshot
// would be stale.

import { saveActiveWorkout } from "./persistence";

const HEARTBEAT_MS = 10_000;

// Returns a teardown function that removes every listener + interval.
// Wire from a useEffect in the component that owns the active workout state.
export function installLifecycleListeners({ uid, getCurrentWorkout }) {
  const teardowns = [];

  const flush = () => {
    const w = getCurrentWorkout();
    if (uid && w) {
      // Fire-and-forget. We can't reliably await before the OS suspends us
      // anyway, but Dexie buffers the write and the underlying IDB
      // transaction commits on the next tick which the OS does honor.
      saveActiveWorkout(uid, w);
    }
  };

  // 1. Capacitor appStateChange (and pause, for iOS redundancy)
  let capacitorAppRef = null;
  (async () => {
    try {
      const mod = await import("@capacitor/app");
      capacitorAppRef = mod.App;
      const stateSub = await capacitorAppRef.addListener(
        "appStateChange",
        ({ isActive }) => {
          if (!isActive) flush();
        }
      );
      teardowns.push(() => stateSub.remove());

      const pauseSub = await capacitorAppRef.addListener("pause", flush);
      teardowns.push(() => pauseSub.remove());
    } catch (err) {
      // Plugin not bound (running in a plain browser, not a Capacitor shell).
      // The visibilitychange listener below covers this case.
    }
  })();

  // 2. Web visibilitychange — fires in PWA, browser, and (usually) inside
  // the Capacitor webview as well. Cheap to install regardless of context.
  const onVisibility = () => {
    if (document.hidden) flush();
  };
  document.addEventListener("visibilitychange", onVisibility);
  teardowns.push(() =>
    document.removeEventListener("visibilitychange", onVisibility)
  );

  // 3. pagehide — last-chance browser event that can fire without
  // visibilitychange firing first (back/forward cache, tab close).
  const onPageHide = () => flush();
  window.addEventListener("pagehide", onPageHide);
  teardowns.push(() => window.removeEventListener("pagehide", onPageHide));

  // 4. Heartbeat — defensive 10s save. Only ticks while there's a workout
  // in flight, so an idle app pays nothing.
  const heartbeat = setInterval(() => {
    const w = getCurrentWorkout();
    if (uid && w) saveActiveWorkout(uid, w);
  }, HEARTBEAT_MS);
  teardowns.push(() => clearInterval(heartbeat));

  return () => {
    for (const fn of teardowns) {
      try { fn(); } catch (_) { /* ignore */ }
    }
  };
}
