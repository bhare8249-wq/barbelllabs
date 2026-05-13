import { useState, useEffect, useRef, createContext, useContext } from "react";
import { auth, googleProvider, db } from "./firebase";
import { doc, onSnapshot, setDoc, deleteDoc } from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendEmailVerification,
  signInWithPopup,
  updateEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  verifyBeforeUpdateEmail,
  sendPasswordResetEmail,
  deleteUser,
} from "firebase/auth";
import { HELP_CONTENT } from "./helpContent";
import { GYM_BIBLE } from "./exerciseDatabase";
import {
  saveActiveWorkout,
  clearActiveWorkout,
  checkForRecoverableWorkout,
  discardRecoverableWorkout,
  purgeOldRecoveredWorkouts,
  summarizeRecoverableWorkout,
  installLifecycleListeners,
} from "./workoutSession";

// ── Theme ─────────────────────────────────────────────────────────────
const ThemeCtx = createContext("dark");
const useT = () => {
  const theme = useContext(ThemeCtx);
  return THEMES[theme];
};
const useS = () => {
  const theme = useContext(ThemeCtx);
  return makeStyles(THEMES[theme]);
};

const THEMES = {
  dark: {
    bg:          "#0A0A0A",
    surface:     "#141416",
    surfaceHigh: "#1C1C1E",
    surfaceHov:  "#242428",
    border:      "#2C2C30",
    borderSub:   "#1E1E22",
    text:        "#F0F4F8",
    textSub:     "#A8C8E8",
    textMuted:   "#5B7A96",
    // Apple-tier polish: inputs feel "lifted" not "recessed". Subtle white
    // overlay catches light off the dark background; near-invisible border
    // until the global :focus rule paints a Steel Blue accent ring.
    inputBg:     "rgba(255,255,255,0.04)",
    inputBorder: "rgba(255,255,255,0.08)",
    navBg:       "#0A0A0A",
    navBorder:   "#1C1C1E",
  },
  light: {
    bg:          "#E8F4FD",
    surface:     "#FFFFFF",
    surfaceHigh: "#D6ECFF",
    surfaceHov:  "#C4E0F8",
    border:      "#A8C8E8",
    borderSub:   "#C8DFF0",
    text:        "#0A0A0A",
    textSub:     "#2A4A6A",
    textMuted:   "#5B7A96",
    // Apple-tier polish: matching depth in light mode — soft layered surface
    // over the card, hairline border, accent ring on focus.
    inputBg:     "rgba(255,255,255,0.62)",
    inputBorder: "rgba(91,155,213,0.18)",
    navBg:       "#FFFFFF",
    navBorder:   "#A8C8E8",
  },
};
const accent     = "#5B9BD5";   // Steel Blue
const accentGlow = "rgba(91,155,213,0.20)";
// Fix #98: shared toast position — all transient bottom-floating toasts use this offset so they
// consistently clear the bottom nav (62px) + the Profile-tab Sign Out button (sits ~50px tall
// above the nav) + breathing room (~16px). Animation across all toasts is `bl-card-in 0.25s`
// (defined in the global style block); success-flash duration is 2200ms, error banners persist
// until dismissed or auto-cleared on next successful save.
const TOAST_BOTTOM = "calc(140px + env(safe-area-inset-bottom, 0px))";
const haptic = (pattern = 10) => { try { navigator.vibrate(pattern); } catch (_) {} };

// Fix #218: stable IDs on sets + workouts. Previously sets were keyed by array index
// in the React .map, so deleting set 3 of 5 caused React to reuse set 4's component
// instance for the new "set 3" — carrying along stale local state (notably the
// SwipeableRow's swipe offset). The visible bug: a swipe-revealed delete button that
// stayed open after the row beside it was deleted. Same class of bug at the workout
// level in History (WorkoutHistoryCard has its own swipe state). Stable IDs let React
// reconcile by identity, not position.
const makeId = () => {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch (_) { /* fall through */ }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

// Backfill helper for legacy data. Originally for #218 stable ids; extended in #97
// to also default the set.type field. Called when a workout is loaded into active
// state (startWorkout, template, repeat-last, recovery from IndexedDB) AND when
// analytics / history code reads sets that may be legacy. Idempotent — never
// overwrites an existing id or type, never strips other fields.
//
// set.type values: "working" (default), "warmup", "dropset".
// Legacy sets without the field are working sets by convention.
const SET_TYPES = ["working", "warmup", "dropset"];
const isValidSetType = (t) => SET_TYPES.includes(t);

// Fix #97: analytics predicates.
//   isWorking      — strict "working set" — for PRs, top-set detection, e1RM
//                     calculations, anything that wants the user's max effort.
//   isNonWarmup    — "set that counts toward volume / frequency / tonnage"
//                     i.e. working + dropset. Warmups never count toward these
//                     because they're prep, not training stimulus.
// Legacy sets without `type` count as working, so they pass both predicates.
const isWorking   = (s) => !s.type || s.type === "working";
const isNonWarmup = (s) => !s.type || s.type !== "warmup";
const normalizeWorkoutIds = (w) => {
  if (!w) return w;
  const exercises = (w.exercises || []).map(ex => ({
    ...ex,
    sets: (ex.sets || []).map(s => {
      const next = { ...s };
      if (!next.id) next.id = makeId();
      if (!isValidSetType(next.type)) next.type = "working";
      return next;
    }),
  }));
  return { ...w, id: w.id || makeId(), exercises };
};

// Fix #77: lightweight Web-Audio tone player. Off by default — opt-in via Settings → Workout Preferences.
// Reads the toggle from window so non-React callers can stay simple. Helpers update __bl_sound below.
let __bl_audio_ctx = null;
const playTone = (freq = 880, ms = 120, type = "sine", vol = 0.18) => {
  try {
    if (!window.__bl_sound) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!__bl_audio_ctx) __bl_audio_ctx = new Ctx();
    const ctx = __bl_audio_ctx;
    if (ctx.state === "suspended") ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = vol;
    osc.connect(gain).connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + ms / 1000);
    osc.start(now);
    osc.stop(now + ms / 1000);
  } catch {}
};
const playDing      = () => playTone(880, 120, "sine", 0.12);
const playComplete  = () => { playTone(660, 100, "sine", 0.15); setTimeout(() => playTone(990, 160, "sine", 0.18), 110); };
const playRestDone  = () => { playTone(523, 100, "sine", 0.18); setTimeout(() => playTone(659, 100, "sine", 0.18), 110); setTimeout(() => playTone(784, 200, "sine", 0.20), 220); };

const makeStyles = (t) => ({
  // Apple-tier card: hairline white border + inset top highlight catches light from
  // above, giving every card a subtle "lifted off the canvas" feel. Outer shadow
  // unchanged. Single update → every consumer in the app picks this up for free.
  card: (extra = {}) => ({
    background: t.surfaceHigh, borderRadius: 18, padding: "18px 20px", marginBottom: 14,
    border: "1px solid rgba(255,255,255,0.06)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 24px rgba(0,0,0,0.22)",
    ...extra
  }),
  inputStyle: (extra = {}) => ({
    background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 12,
    color: t.text, padding: "13px 14px", fontSize: 16, outline: "none", width: 120,
    transition: "border-color 0.2s, box-shadow 0.2s", WebkitAppearance: "none",
    ...extra
  }),
  // Apple-tier icon button: subtle translucent press background appears on hover/tap
  // via inline event handlers; default is invisible chrome. Keeps the tap target
  // generous (44×44) but the resting state stays clean.
  iconBtn: (color) => ({
    background: "transparent", border: "none", cursor: "pointer",
    color: color || t.textMuted, padding: 10, display: "flex", alignItems: "center",
    justifyContent: "center", borderRadius: 10, transition: "background 0.15s, color 0.15s, opacity 0.15s",
    minWidth: 44, minHeight: 44, touchAction: "manipulation",
  }),
  // Apple polish: ghost buttons no longer use dashed borders (that pattern read as
  // unfinished / placeholder). New recipe is a subtle translucent fill with a
  // hairline border — same understated weight, more refined silhouette. The dash
  // disappears, the affordance stays.
  ghostBtn: (extra = {}) => ({
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
    borderRadius: 14, color: t.textMuted,
    padding: "13px 16px", fontSize: 14, cursor: "pointer", minHeight: 48,
    fontWeight: 600, letterSpacing: 0.2,
    transition: "background 0.18s, border-color 0.18s, color 0.18s",
    ...extra
  }),
  // Apple-tier primary CTA: gradient + inset top highlight (lit-from-above) + soft
  // outer glow. The 1px white inner line gives the button a subtle 3D edge that
  // catches light, matching iOS Lock Screen action buttons.
  solidBtn: (extra = {}) => ({
    background: `linear-gradient(135deg, ${accent}, #4A8BC4)`,
    color: "#ffffff", border: "none", borderRadius: 14, padding: "15px 24px",
    fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
    letterSpacing: 0.3, fontSize: 16,
    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.16), 0 4px 20px ${accentGlow}`,
    transition: "opacity 0.2s, transform 0.15s, box-shadow 0.2s",
    touchAction: "manipulation",
    minHeight: 48,
    ...extra
  }),
  // Apple-tier select: tinted Steel-Blue ghost with the opacity recipe. Inset
  // top highlight catches light; soft border reads as a tappable affordance
  // without being a hard frame.
  select: (extra = {}) => ({
    background: `${accent}14`,
    color: accent,
    border: `1px solid ${accent}55`,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07)",
    borderRadius: 12, padding: "10px 32px 10px 14px", fontSize: 13, fontWeight: 700,
    cursor: "pointer", outline: "none", appearance: "none", WebkitAppearance: "none",
    letterSpacing: 0.3, minHeight: 44,
    transition: "background 0.18s, border-color 0.18s",
    ...extra
  }),
});

// ── Version ───────────────────────────────────────────────────────────
// Versioning convention:
//   MAJOR.MINOR.PATCH
//   • MAJOR — complete redesign or breaking change (1.x.x → 2.x.x)
//   • MINOR — new feature added (1.0.x → 1.1.x)
//   • PATCH — bug fix, small tweak, or UI polish (1.0.0 → 1.0.1)
//
// ── Changelog ────────────────────────────────────────────────────────
// v1.0.1  2026-04-08  Export button moved from History header to fixed centre-bottom bar
// v1.0.2  2026-04-08  Fixed CSV export using data URI for sandbox compatibility
// v1.0.3  2026-04-08  User manual PDF filename now includes version and build date
// v1.0.4  2026-04-08  Replaced jsPDF generator with direct link to pre-built PDF in public folder
// v1.0.5  2026-04-08  Rest timer now supports manual custom time input (minutes and seconds)
// v1.0.6  2026-04-08  Profile: Country and City fields added; Sign Out moved to fixed bottom centre
// v1.1.0  2026-04-08  Admin account and panel added (user management, stats, delete accounts)
// v1.1.1  2026-04-08  Height field split into separate feet and inches inputs
// v1.1.2  2026-04-08  Inches input now supports 0.5 increments
// v1.1.3  2026-04-08  Home nav icon changed from dumbbell to house icon
// v1.1.4  2026-04-08  Removed floating dumbbell icon from Home empty state
// v1.1.5  2026-04-08  Help button replaced with compact ? icon on all pages
// v1.1.6  2026-04-08  Help button now shows ? Help label
// v1.1.7  2026-04-08  Help button ? moved after Help text in orange badge
// v1.1.8  2026-04-08  Help badge redesigned — borderless, orange circle, clean
// v1.1.9  2026-04-08  Help badge colour changed from orange to app accent yellow
// v1.2.0  2026-04-08  Help button redesigned as consistent pill button across all pages
// v1.2.1  2026-04-08  Profile: Security Settings added — change email and password with verification flow
// v1.2.2  2026-04-08  Fixed critical bug: useStorage useEffect was resetting user data on profile edits
// v2.0.0  2026-04-16  Rebranded to Rep Set. Steel Blue colour system. Visual overhaul. 1RM estimator, exercise notes, plate calculator.
// v2.1.0  2026-04-18  Gym Bible: 224-exercise library with category + equipment filters in exercise picker
// v2.2.0  2026-04-18  My Top Lifts: fully customizable — pick any 3 exercises to track as personal records
// v2.2.1  2026-04-18  Touch UX pass: all tap targets ≥44px, exercise picker chips enlarged, rest timer, RPE, labels, coach buttons
// v2.2.2  2026-04-18  My Top Lifts Edit/Cancel/Save buttons styled as pills matching Help button
// v2.2.3  2026-04-18  Exercise picker chip rows: swipeable with pan-x + iOS momentum scroll
// v2.3.0  2026-04-18  iOS momentum scrolling on all containers + global touch polish in index.html
// v2.3.1  2026-04-18  Pill buttons unified: shared pillBtn/pillBtnPrimary style, Help + Edit now identical height
// v2.3.2  2026-04-18  Settings button on home restyled to match Help pill
// v2.3.3  2026-04-18  Settings pill moved from Home to Profile nav, sits beside Edit and Help
// v2.3.4  2026-04-18  User manual HTML created; Profile section opens /user-manual.html in new tab
// v2.3.5  2026-04-18  Renamed all gymtrack references to barbelllabs across project
// v2.4.0  2026-04-18  Weekly volume bar chart in Progress tab; bodyweight log + mini chart on Home tab
// v2.4.1  2026-04-18  Bodyweight chart upgraded to full interactive progression chart; widget moved to Profile tab
const APP_VERSION = "2.7.4";
const BUILD_DATE  = "2026-05-13";

function useStorage(uid) {
  const [data, setData] = useState({ workouts: [], bodyweight: [] });
  // Fix #69: optimistic UI — local state updates immediately, Firestore write happens in
  // background. If the write fails, expose the error + a retry handle so the UI can
  // surface a non-blocking banner instead of silently losing the user's work.
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    if (!uid) { setData({ workouts: [], bodyweight: [] }); return; }
    const ref = doc(db, "users", uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) setData(snap.data());
      else setData({ workouts: [], bodyweight: [] });
    });
    return unsub;
  }, [uid]);

  const save = (next, opts = {}) => {
    setData(next);
    if (!uid) return;
    setDoc(doc(db, "users", uid), next).then(() => {
      // Successful write — clear any prior error so the banner goes away.
      setSaveError(prev => (prev ? null : prev));
    }).catch(err => {
      console.error("[useStorage] Firestore write failed:", err);
      setSaveError({
        message: opts.errorContext || "Couldn't sync your changes",
        retry: () => save(next, opts),
        dismiss: () => setSaveError(null),
        timestamp: Date.now(),
      });
    });
  };

  return [data, save, saveError];
}

// Tracks browser online/offline state. Used by the offline indicator banner so users
// know writes are being queued locally rather than failing silently. Firestore's offline
// persistence already handles the actual sync — this hook is purely for user awareness.
function useOnlineStatus() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);
  return online;
}

// ── Admin ─────────────────────────────────────────────────────────────
const isAdminUser = () => false;

(() => {
  try {
  } catch {}
})();


// GYM_BIBLE moved to ./exerciseDatabase.js (1,640 entries — original 215 curated + 1,425 from taxonomy import)

// ── Fix #12: Starter Program Library ──────────────────────────────────
// Helper to stamp N empty sets at a given rep prescription.
const _ps = (reps, n = 3) => Array.from({ length: n }, () => ({ weight: "", reps: String(reps) }));
const STARTER_PROGRAMS = [
  {
    id: "ppl", name: "Push / Pull / Legs", short: "PPL",
    level: "Intermediate", goal: "Hypertrophy", frequency: "3–6 days/week",
    description: "Classic hypertrophy split. Each day hits one movement pattern hard — push (chest/shoulders/triceps), pull (back/biceps), or legs. Run 3 days/week minimum; 6 days/week for max volume.",
    workouts: [
      { name: "Push Day", exercises: [
        { name: "Barbell Bench Press", sets: _ps(8, 4) },
        { name: "Incline Dumbbell Press", sets: _ps(10, 3) },
        { name: "Barbell Overhead Press (Standing)", sets: _ps(8, 3) },
        { name: "Lateral Raise", sets: _ps(12, 3) },
        { name: "Cable Pushdown (Rope)", sets: _ps(12, 3) },
        { name: "Overhead Cable Tricep Extension", sets: _ps(12, 3) },
      ]},
      { name: "Pull Day", exercises: [
        { name: "Conventional Deadlift", sets: _ps(5, 3) },
        { name: "Pull-Up (Overhand)", sets: _ps(8, 3) },
        { name: "Barbell Row (Bent-Over)", sets: _ps(8, 3) },
        { name: "Lat Pulldown (Wide Grip)", sets: _ps(10, 3) },
        { name: "Face Pull", sets: _ps(15, 3) },
        { name: "Barbell Curl", sets: _ps(10, 3) },
        { name: "Hammer Curl", sets: _ps(12, 3) },
      ]},
      { name: "Leg Day", exercises: [
        { name: "Barbell Back Squat", sets: _ps(8, 4) },
        { name: "Romanian Deadlift", sets: _ps(8, 3) },
        { name: "Leg Press", sets: _ps(10, 3) },
        { name: "Leg Extension", sets: _ps(12, 3) },
        { name: "Lying Leg Curl", sets: _ps(12, 3) },
        { name: "Standing Calf Raise Machine", sets: _ps(15, 4) },
      ]},
    ],
  },
  {
    id: "upper-lower", name: "Upper / Lower", short: "U/L",
    level: "Intermediate", goal: "Hypertrophy", frequency: "4 days/week",
    description: "Balanced split rotating upper and lower body. Great for recovery management — each muscle group hit twice per week.",
    workouts: [
      { name: "Upper Day", exercises: [
        { name: "Barbell Bench Press", sets: _ps(6, 4) },
        { name: "Barbell Row (Bent-Over)", sets: _ps(8, 4) },
        { name: "Barbell Overhead Press (Standing)", sets: _ps(8, 3) },
        { name: "Lat Pulldown (Wide Grip)", sets: _ps(10, 3) },
        { name: "Lateral Raise", sets: _ps(12, 3) },
        { name: "Barbell Curl", sets: _ps(10, 3) },
        { name: "Cable Pushdown (Rope)", sets: _ps(12, 3) },
      ]},
      { name: "Lower Day", exercises: [
        { name: "Barbell Back Squat", sets: _ps(6, 4) },
        { name: "Romanian Deadlift", sets: _ps(8, 3) },
        { name: "Leg Press", sets: _ps(10, 3) },
        { name: "Lying Leg Curl", sets: _ps(12, 3) },
        { name: "Leg Extension", sets: _ps(12, 3) },
        { name: "Standing Calf Raise Machine", sets: _ps(15, 4) },
      ]},
    ],
  },
  {
    id: "full-body-3x", name: "Full Body 3x/Week", short: "Full Body",
    level: "Beginner", goal: "General", frequency: "3 days/week",
    description: "Every major movement pattern each session. Ideal starter template — high frequency per muscle, low total volume per workout. Run Mon/Wed/Fri.",
    workouts: [
      { name: "Full Body", exercises: [
        { name: "Barbell Back Squat", sets: _ps(5, 3) },
        { name: "Barbell Bench Press", sets: _ps(5, 3) },
        { name: "Barbell Row (Bent-Over)", sets: _ps(8, 3) },
        { name: "Barbell Overhead Press (Standing)", sets: _ps(8, 3) },
        { name: "Romanian Deadlift", sets: _ps(8, 2) },
        { name: "Barbell Curl", sets: _ps(10, 2) },
        { name: "Standing Calf Raise Machine", sets: _ps(15, 3) },
      ]},
    ],
  },
  {
    id: "bro-split", name: "Bro Split", short: "Bro Split",
    level: "Intermediate", goal: "Hypertrophy", frequency: "5 days/week",
    description: "One muscle group per day, hit hard with lots of volume. Classic bodybuilding template — each muscle gets a full week to recover.",
    workouts: [
      { name: "Chest Day", exercises: [
        { name: "Barbell Bench Press", sets: _ps(8, 4) },
        { name: "Incline Dumbbell Press", sets: _ps(10, 3) },
        { name: "Cable Crossover", sets: _ps(12, 3) },
        { name: "Chest Dips", sets: _ps(10, 3) },
        { name: "Pec Deck / Butterfly Machine", sets: _ps(15, 3) },
      ]},
      { name: "Back Day", exercises: [
        { name: "Conventional Deadlift", sets: _ps(5, 3) },
        { name: "Pull-Up (Overhand)", sets: _ps(8, 3) },
        { name: "Barbell Row (Bent-Over)", sets: _ps(8, 3) },
        { name: "Lat Pulldown (Wide Grip)", sets: _ps(10, 3) },
        { name: "Seated Cable Row (Close Grip)", sets: _ps(12, 3) },
        { name: "Face Pull", sets: _ps(15, 3) },
      ]},
      { name: "Shoulder Day", exercises: [
        { name: "Barbell Overhead Press (Standing)", sets: _ps(6, 4) },
        { name: "Arnold Press", sets: _ps(10, 3) },
        { name: "Lateral Raise", sets: _ps(12, 4) },
        { name: "Bent-Over Rear Delt Raise", sets: _ps(12, 3) },
        { name: "Barbell Shrug", sets: _ps(12, 3) },
      ]},
      { name: "Leg Day", exercises: [
        { name: "Barbell Back Squat", sets: _ps(8, 4) },
        { name: "Romanian Deadlift", sets: _ps(8, 3) },
        { name: "Leg Press", sets: _ps(10, 3) },
        { name: "Leg Extension", sets: _ps(12, 3) },
        { name: "Lying Leg Curl", sets: _ps(12, 3) },
        { name: "Standing Calf Raise Machine", sets: _ps(15, 4) },
      ]},
      { name: "Arm Day", exercises: [
        { name: "Barbell Curl", sets: _ps(10, 4) },
        { name: "Hammer Curl", sets: _ps(12, 3) },
        { name: "Preacher Curl (EZ-Bar)", sets: _ps(10, 3) },
        { name: "Cable Pushdown (Rope)", sets: _ps(12, 4) },
        { name: "Overhead Cable Tricep Extension", sets: _ps(12, 3) },
        { name: "Skull Crusher (EZ-Bar)", sets: _ps(10, 3) },
      ]},
    ],
  },
  {
    id: "531-bbb", name: "5/3/1 Boring But Big", short: "5/3/1 BBB",
    level: "Advanced", goal: "Strength", frequency: "4 days/week", author: "Jim Wendler",
    description: "Four-day main-lift split with a high-volume supplemental (Boring But Big = 5×10 at 50–60% of training max). This is a static snapshot — real 5/3/1 runs a 4-week percentage cycle. Load this as a starting point, then track your main lift by the book.",
    workouts: [
      { name: "Squat Day", exercises: [
        { name: "Barbell Back Squat", sets: _ps(5, 3) },
        { name: "Barbell Back Squat", sets: _ps(10, 5) },
        { name: "Lying Leg Curl", sets: _ps(10, 5) },
        { name: "Hanging Leg Raise", sets: _ps(10, 5) },
      ]},
      { name: "Bench Day", exercises: [
        { name: "Barbell Bench Press", sets: _ps(5, 3) },
        { name: "Barbell Bench Press", sets: _ps(10, 5) },
        { name: "Dumbbell Row (One-Arm)", sets: _ps(10, 5) },
        { name: "Barbell Curl", sets: _ps(10, 5) },
      ]},
      { name: "Deadlift Day", exercises: [
        { name: "Conventional Deadlift", sets: _ps(5, 3) },
        { name: "Conventional Deadlift", sets: _ps(10, 5) },
        { name: "Hanging Leg Raise", sets: _ps(10, 5) },
        { name: "Back Extension (Roman Chair)", sets: _ps(10, 5) },
      ]},
      { name: "Press Day", exercises: [
        { name: "Barbell Overhead Press (Standing)", sets: _ps(5, 3) },
        { name: "Barbell Overhead Press (Standing)", sets: _ps(10, 5) },
        { name: "Pull-Up (Overhand)", sets: _ps(10, 5) },
        { name: "Dumbbell Curl (Alternating)", sets: _ps(10, 5) },
      ]},
    ],
  },
  {
    id: "starting-strength", name: "Starting Strength", short: "SS",
    level: "Beginner", goal: "Strength", frequency: "3 days/week", author: "Mark Rippetoe",
    description: "The classic novice linear-progression program. Alternate Workout A and B, adding 5 lb each session on upper lifts, 10 lb on deadlift. This is the static workout shell — track the linear progression yourself.",
    workouts: [
      { name: "Workout A", exercises: [
        { name: "Barbell Back Squat", sets: _ps(5, 3) },
        { name: "Barbell Overhead Press (Standing)", sets: _ps(5, 3) },
        { name: "Conventional Deadlift", sets: _ps(5, 1) },
      ]},
      { name: "Workout B", exercises: [
        { name: "Barbell Back Squat", sets: _ps(5, 3) },
        { name: "Barbell Bench Press", sets: _ps(5, 3) },
        { name: "Power Clean", sets: _ps(3, 5) },
      ]},
    ],
  },
  {
    id: "stronglifts-5x5", name: "StrongLifts 5×5", short: "SL 5×5",
    level: "Beginner", goal: "Strength", frequency: "3 days/week", author: "Mehdi",
    description: "Beginner barbell program with 5 sets of 5. Alternate Workout A and B, add 5 lb every session on main lifts, 10 lb on deadlift. Load this as the shell; progress by feel.",
    workouts: [
      { name: "Workout A", exercises: [
        { name: "Barbell Back Squat", sets: _ps(5, 5) },
        { name: "Barbell Bench Press", sets: _ps(5, 5) },
        { name: "Barbell Row (Bent-Over)", sets: _ps(5, 5) },
      ]},
      { name: "Workout B", exercises: [
        { name: "Barbell Back Squat", sets: _ps(5, 5) },
        { name: "Barbell Overhead Press (Standing)", sets: _ps(5, 5) },
        { name: "Conventional Deadlift", sets: _ps(5, 1) },
      ]},
    ],
  },
  {
    id: "phul", name: "PHUL (Power Hypertrophy Upper Lower)", short: "PHUL",
    level: "Intermediate", goal: "Strength + Hypertrophy", frequency: "4 days/week",
    description: "Two power days (low reps, heavy) plus two hypertrophy days (higher reps, volume). Blends strength work with bodybuilding volume.",
    workouts: [
      { name: "Upper Power", exercises: [
        { name: "Barbell Bench Press", sets: _ps(4, 4) },
        { name: "Incline Dumbbell Press", sets: _ps(8, 3) },
        { name: "Barbell Row (Bent-Over)", sets: _ps(4, 4) },
        { name: "Lat Pulldown (Wide Grip)", sets: _ps(8, 3) },
        { name: "Barbell Curl", sets: _ps(6, 3) },
        { name: "Skull Crusher (EZ-Bar)", sets: _ps(6, 3) },
      ]},
      { name: "Lower Power", exercises: [
        { name: "Barbell Back Squat", sets: _ps(4, 4) },
        { name: "Conventional Deadlift", sets: _ps(4, 3) },
        { name: "Leg Press", sets: _ps(8, 3) },
        { name: "Lying Leg Curl", sets: _ps(8, 3) },
        { name: "Standing Calf Raise Machine", sets: _ps(8, 4) },
      ]},
      { name: "Upper Hypertrophy", exercises: [
        { name: "Incline Barbell Bench Press", sets: _ps(10, 4) },
        { name: "Dumbbell Bench Press", sets: _ps(12, 3) },
        { name: "Seated Cable Row (Close Grip)", sets: _ps(10, 4) },
        { name: "Lat Pulldown (Close Grip)", sets: _ps(12, 3) },
        { name: "Lateral Raise", sets: _ps(12, 4) },
        { name: "Cable Curl (Rope)", sets: _ps(12, 3) },
        { name: "Cable Pushdown (Rope)", sets: _ps(12, 3) },
      ]},
      { name: "Lower Hypertrophy", exercises: [
        { name: "Barbell Front Squat", sets: _ps(10, 4) },
        { name: "Barbell Romanian Deadlift", sets: _ps(10, 3) },
        { name: "Leg Extension", sets: _ps(12, 4) },
        { name: "Seated Leg Curl", sets: _ps(12, 4) },
        { name: "Seated Calf Raise Machine", sets: _ps(15, 4) },
      ]},
    ],
  },
  {
    id: "phat", name: "PHAT (Power Hypertrophy Adaptive Training)", short: "PHAT",
    level: "Advanced", goal: "Strength + Hypertrophy", frequency: "5 days/week", author: "Layne Norton",
    description: "Two power days (heavy compounds) plus three body-part hypertrophy days. High volume — designed for advanced lifters who've plateaued on pure hypertrophy or strength programs.",
    workouts: [
      { name: "Upper Power", exercises: [
        { name: "Barbell Bench Press", sets: _ps(4, 4) },
        { name: "Barbell Row (Bent-Over)", sets: _ps(4, 4) },
        { name: "Barbell Overhead Press (Standing)", sets: _ps(5, 3) },
        { name: "Lat Pulldown (Wide Grip)", sets: _ps(8, 3) },
      ]},
      { name: "Lower Power", exercises: [
        { name: "Barbell Back Squat", sets: _ps(4, 4) },
        { name: "Conventional Deadlift", sets: _ps(4, 3) },
        { name: "Leg Press", sets: _ps(8, 3) },
        { name: "Lying Leg Curl", sets: _ps(8, 3) },
      ]},
      { name: "Back / Shoulders Hypertrophy", exercises: [
        { name: "Pull-Up (Overhand)", sets: _ps(8, 4) },
        { name: "Seated Cable Row (Close Grip)", sets: _ps(10, 4) },
        { name: "Lat Pulldown (Close Grip)", sets: _ps(12, 3) },
        { name: "Lateral Raise", sets: _ps(12, 4) },
        { name: "Face Pull", sets: _ps(15, 4) },
      ]},
      { name: "Leg Hypertrophy", exercises: [
        { name: "Barbell Front Squat", sets: _ps(10, 4) },
        { name: "Barbell Romanian Deadlift", sets: _ps(10, 3) },
        { name: "Leg Press", sets: _ps(12, 3) },
        { name: "Leg Extension", sets: _ps(15, 3) },
        { name: "Seated Leg Curl", sets: _ps(15, 3) },
        { name: "Standing Calf Raise Machine", sets: _ps(15, 4) },
      ]},
      { name: "Chest / Arms Hypertrophy", exercises: [
        { name: "Incline Barbell Bench Press", sets: _ps(10, 4) },
        { name: "Dumbbell Bench Press", sets: _ps(12, 3) },
        { name: "Cable Crossover", sets: _ps(15, 3) },
        { name: "Barbell Curl", sets: _ps(12, 3) },
        { name: "Cable Pushdown (Rope)", sets: _ps(12, 3) },
        { name: "Skull Crusher (EZ-Bar)", sets: _ps(12, 3) },
      ]},
    ],
  },
  {
    id: "arnold-split", name: "Arnold Split", short: "Arnold",
    level: "Advanced", goal: "Hypertrophy", frequency: "6 days/week", author: "Arnold Schwarzenegger",
    description: "The original golden-era split: Chest/Back, Shoulders/Arms, and Legs — each hit TWICE per week (Mon+Thu, Tue+Fri, Wed+Sat). Massive volume. Fork the three templates and run them back-to-back-to-back.",
    workouts: [
      { name: "Chest + Back", exercises: [
        { name: "Barbell Bench Press", sets: _ps(8, 4) },
        { name: "Incline Barbell Bench Press", sets: _ps(10, 3) },
        { name: "Dumbbell Flye", sets: _ps(12, 3) },
        { name: "Pull-Up (Overhand)", sets: _ps(8, 4) },
        { name: "Barbell Row (Bent-Over)", sets: _ps(8, 3) },
        { name: "Dumbbell Pullover", sets: _ps(12, 3) },
      ]},
      { name: "Shoulders + Arms", exercises: [
        { name: "Barbell Overhead Press (Standing)", sets: _ps(8, 4) },
        { name: "Lateral Raise", sets: _ps(12, 4) },
        { name: "Front Raise", sets: _ps(12, 3) },
        { name: "Barbell Curl", sets: _ps(10, 4) },
        { name: "Preacher Curl (EZ-Bar)", sets: _ps(10, 3) },
        { name: "Cable Pushdown (Rope)", sets: _ps(12, 4) },
        { name: "Skull Crusher (EZ-Bar)", sets: _ps(10, 3) },
      ]},
      { name: "Legs", exercises: [
        { name: "Barbell Back Squat", sets: _ps(8, 5) },
        { name: "Barbell Front Squat", sets: _ps(10, 3) },
        { name: "Leg Press", sets: _ps(12, 3) },
        { name: "Lying Leg Curl", sets: _ps(12, 4) },
        { name: "Standing Calf Raise Machine", sets: _ps(15, 5) },
        { name: "Hanging Leg Raise", sets: _ps(15, 3) },
      ]},
    ],
  },
];

// Exercise picker filter constants
// Fix #16: Steel-Blue-harmonized category palette — more saturated, distinct, on-brand
const EX_CATS = [
  { id: "all",       label: "All" },
  { id: "chest",     label: "Chest",     color: "#E67E6B" },
  { id: "back",      label: "Back",      color: "#4A9EB8" },
  { id: "shoulders", label: "Shoulders", color: "#D4A64E" },
  { id: "arms",      label: "Arms",      color: "#7FB069" },
  { id: "legs",      label: "Legs",      color: "#9E7ABF" },
  { id: "core",      label: "Core",      color: "#D96B7A" },
  { id: "cardio",    label: "Cardio",    color: "#E8B64C" },
  { id: "full",      label: "Full Body", color: "#5BB588" },
  { id: "mobility",  label: "Mobility",  color: "#7DC4B7" },
];
const EX_EQUIPS = [
  { id: "all",        label: "All Equip" },
  { id: "barbell",    label: "Barbell" },
  { id: "dumbbell",   label: "Dumbbell" },
  { id: "machine",    label: "Machine" },
  { id: "cable",      label: "Cable" },
  { id: "bodyweight", label: "Bodyweight" },
  { id: "other",      label: "Other" },
];
const CAT_COLORS = { chest:"#E67E6B", back:"#4A9EB8", shoulders:"#D4A64E", arms:"#7FB069", legs:"#9E7ABF", core:"#D96B7A", cardio:"#E8B64C", full:"#5BB588", mobility:"#7DC4B7", custom:"#888" };
// Muscle families — when a user searches a muscle term in the picker, we look up
// the related muscles that count as the "same family" from a training perspective.
// E.g. Hammer Curl's anatomical primary muscle is the Brachialis, but every lifter
// trains it on bicep day, so a "bicep" search should surface it. Same with
// brachioradialis (Reverse Curl), Soleus/Gastrocnemius for "calf", etc.
//
// Lookup is by lowercased search term; both singular and plural keys are listed
// to catch user input variations. The values are matched as whole words against
// the FIRST entry in an exercise's muscles list (the primary-target muscle).
const _BICEP    = ["biceps", "bicep", "brachialis", "brachioradialis", "brachii"];
const _TRICEP   = ["triceps", "tricep"];
const _FOREARM  = ["forearms", "forearm", "forearm flexors", "forearm extensors", "brachioradialis", "wrist"];
const _CHEST    = ["pecs", "pec", "chest", "pectorals", "serratus"];
const _BACK     = ["lats", "lat", "back", "rhomboids", "rhomboid", "traps", "trap", "teres", "erectors"];
const _LAT      = ["lats", "lat"];
const _TRAP     = ["traps", "trap"];
const _SHOULDER = ["delts", "delt", "shoulders", "shoulder", "deltoids", "rear delts", "side delts", "front delts"];
const _GLUTE    = ["glutes", "glute"];
const _QUAD     = ["quads", "quad", "quadriceps"];
const _HAMSTRING= ["hamstrings", "hamstring", "hams", "ham"];
const _CALF     = ["calves", "calf", "soleus", "gastrocnemius"];
const _CORE     = ["abs", "ab", "core", "abdominals", "rectus abdominis", "obliques", "oblique"];
const _ABS      = ["abs", "ab", "abdominals", "rectus abdominis"];
const _OBLIQUE  = ["obliques", "oblique"];
const MUSCLE_FAMILIES = {
  bicep: _BICEP, biceps: _BICEP,
  tricep: _TRICEP, triceps: _TRICEP,
  forearm: _FOREARM, forearms: _FOREARM,
  chest: _CHEST, pec: _CHEST, pecs: _CHEST,
  back: _BACK,
  lat: _LAT, lats: _LAT,
  trap: _TRAP, traps: _TRAP,
  shoulder: _SHOULDER, shoulders: _SHOULDER, delt: _SHOULDER, delts: _SHOULDER,
  glute: _GLUTE, glutes: _GLUTE,
  quad: _QUAD, quads: _QUAD, quadricep: _QUAD, quadriceps: _QUAD,
  ham: _HAMSTRING, hams: _HAMSTRING, hamstring: _HAMSTRING, hamstrings: _HAMSTRING,
  calf: _CALF, calves: _CALF,
  ab: _ABS, abs: _ABS,
  core: _CORE,
  oblique: _OBLIQUE, obliques: _OBLIQUE,
};
// Fix #17/#19: auto-suggest workout tags based on exercise categories
const TAG_CAP = 5;
function suggestTags(exercises) {
  if (!exercises || exercises.length === 0) return [];
  const cats = new Set();
  exercises.forEach(ex => {
    const hit = GYM_BIBLE.find(g => g.name === ex.name);
    if (hit) cats.add(hit.cat);
  });
  const hasChest = cats.has("chest");
  const hasBack = cats.has("back");
  const hasShoulders = cats.has("shoulders");
  const hasLegs = cats.has("legs");
  const hasArms = cats.has("arms");
  const hasCore = cats.has("core");
  const hasCardio = cats.has("cardio");
  const tags = [];
  if (hasChest || hasShoulders) tags.push("push");
  if (hasBack) tags.push("pull");
  if (hasLegs) tags.push("legs");
  if ((hasChest || hasShoulders) && hasBack) tags.push("upperbody");
  if (hasArms && !hasChest && !hasShoulders && !hasBack) tags.push("arms");
  if (hasCore) tags.push("abs");
  if (hasCardio) tags.push("cardio");
  return tags.slice(0, TAG_CAP);
}

const WORKOUT_LABELS = [
  { id: "legs",      label: "Legs",       emoji: "🦵", color: "#5bb85b", bg: "rgba(91,184,91,0.12)",  border: "rgba(91,184,91,0.3)" },
  { id: "push",      label: "Push",       emoji: "💪", color: "#5b9bd5", bg: "rgba(91,155,213,0.12)", border: "rgba(91,155,213,0.3)" },
  { id: "pull",      label: "Pull",       emoji: "🔗", color: "#b55bd5", bg: "rgba(181,91,213,0.12)", border: "rgba(181,91,213,0.3)" },
  { id: "upperbody", label: "Upper Body", emoji: "🏋️", color: "#d5a55b", bg: "rgba(213,165,91,0.12)", border: "rgba(213,165,91,0.3)" },
  { id: "lowerbody", label: "Lower Body", emoji: "⚡", color: "#d55b5b", bg: "rgba(213,91,91,0.12)",  border: "rgba(213,91,91,0.3)" },
  { id: "shoulders", label: "Shoulders",  emoji: "🎯", color: "#5bd5d5", bg: "rgba(91,213,213,0.12)", border: "rgba(91,213,213,0.3)" },
  { id: "arms",      label: "Arms",       emoji: "💥", color: "#d55ba0", bg: "rgba(213,91,160,0.12)", border: "rgba(213,91,160,0.3)" },
  { id: "abs",       label: "Abs",        emoji: "🔥", color: "#A8C8E8", bg: "rgba(168,200,232,0.10)", border: "rgba(168,200,232,0.35)" },
  { id: "glutes",    label: "Glutes",     emoji: "🍑", color: "#ff9500", bg: "rgba(255,149,0,0.12)",  border: "rgba(255,149,0,0.3)" },
  { id: "cardio",    label: "Cardio",     emoji: "🏃", color: "#5BB588", bg: "rgba(91,181,136,0.12)", border: "rgba(91,181,136,0.3)" },
];

// Fix #18: Preset color palette for user-created tags (Steel-Blue-harmonized)
const CUSTOM_TAG_COLORS = ["#5B9BD5", "#E67E6B", "#4A9EB8", "#D4A64E", "#7FB069", "#9E7ABF", "#D96B7A", "#E8B64C"];
// Fix #18: derive bg + border from a tag's color at render time (custom tags store only color)
const tagRenderCfg = (tag) => {
  if (tag.bg && tag.border) return tag;
  const c = tag.color || "#5B9BD5";
  return { ...tag, bg: `${c}1f`, border: `${c}66` };
};

const GOALS = [
  { id: "muscle",   label: "Build Muscle",  emoji: "💪", desc: "Hypertrophy & size",    color: "#5b9bd5" },
  { id: "strength", label: "Strength",      emoji: "🏋️", desc: "Max power & 1RM",      color: "#D4A64E" },
  { id: "cardio",   label: "Cardio",        emoji: "🏃", desc: "Endurance & fitness",   color: "#5bb85b" },
  { id: "cut",      label: "Cut / Lean Out",emoji: "🔥", desc: "Fat loss & definition", color: "#ff9500" },
  { id: "maintain", label: "Maintain",      emoji: "⚖️", desc: "Stay consistent",       color: "#b55bd5" },
];

// Fix #46: profile field options
const SEX_OPTIONS = [
  { id: "male",   label: "Male" },
  { id: "female", label: "Female" },
  { id: "other",  label: "Other / Prefer not to say" },
];
const EXPERIENCE_LEVELS = [
  { id: "beginner",     label: "Beginner",     desc: "< 1 year of consistent training" },
  { id: "intermediate", label: "Intermediate", desc: "1–3 years" },
  { id: "advanced",     label: "Advanced",     desc: "3+ years" },
];
const TRAINING_LOCATIONS = [
  { id: "gym",  label: "Commercial Gym", emoji: "🏋️" },
  { id: "home", label: "Home",           emoji: "🏠" },
  { id: "both", label: "Both",           emoji: "🔄" },
];

// ── Helpers ───────────────────────────────────────────────────────────
const todayISO = () => new Date().toISOString().split("T")[0];
const formatDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const formatDay  = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const epley1RM   = (w, r) => (w > 0 && r > 0 && r <= 15) ? Math.round(w * (1 + r / 30)) : null;

// ── AI Coach ──────────────────────────────────────────────────────────
// Pure function: analyses past sessions for an exercise and returns a
// contextual suggestion pushing progressive overload (or recovery).
// Returns null if nothing useful to say (e.g., zero history and no data).
function coachFor(exerciseName, workouts) {
  const sessions = (workouts || [])
    .filter(w => w.exercises?.some(e => e.name === exerciseName))
    .map(w => {
      const ex = w.exercises.find(e => e.name === exerciseName);
      // Fix #97: top set / PR detection uses working sets only. Drop sets (which deload
      // mid-set) and warmups (which precede the working sets) can't be PRs.
      const topSet = ex.sets.filter(isWorking).reduce((best, s) => {
        const wt = parseFloat(s.weight), rp = parseFloat(s.reps);
        if (!wt || !rp) return best;
        if (!best) return { weight: wt, reps: rp, rpe: s.rpe, rir: s.rir };
        if (wt > best.weight || (wt === best.weight && rp > best.reps)) return { weight: wt, reps: rp, rpe: s.rpe, rir: s.rir };
        return best;
      }, null);
      const avgRpe = (() => {
        const r = ex.sets.map(s => parseFloat(s.rpe)).filter(n => !isNaN(n));
        return r.length ? r.reduce((a,b)=>a+b,0) / r.length : null;
      })();
      const avgRir = (() => {
        const r = ex.sets.map(s => parseFloat(s.rir)).filter(n => !isNaN(n));
        return r.length ? r.reduce((a,b)=>a+b,0) / r.length : null;
      })();
      return { date: w.date, top: topSet, avgRpe, avgRir, setCount: ex.sets.length };
    })
    .filter(s => s.top)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (sessions.length === 0) {
    return { tone: "intro", message: "First time logging this lift — start light and own the form. We'll track progress from here." };
  }

  const last = sessions[0];
  const daysSince = Math.round((Date.now() - new Date(last.date)) / 86400000);

  // Welcome back
  if (daysSince >= 14) {
    return { tone: "comeback", target: { weight: Math.round(last.top.weight * 0.9 / 2.5) * 2.5, reps: last.top.reps },
      message: `Back after ${daysSince} days — ease in around ${Math.round(last.top.weight * 0.9 / 2.5) * 2.5} × ${last.top.reps}, rebuild before pushing.` };
  }

  // Over-reaching: recent avg RPE ≥ 9.5
  const recent3 = sessions.slice(0, 3);
  const avgRpeRecent = recent3.map(s => s.avgRpe).filter(x => x != null);
  if (avgRpeRecent.length >= 2 && avgRpeRecent.reduce((a,b)=>a+b,0)/avgRpeRecent.length >= 9.2) {
    const deload = Math.round(last.top.weight * 0.9 / 2.5) * 2.5;
    return { tone: "recover", target: { weight: deload, reps: last.top.reps },
      message: `You've been redlining (avg RPE ~${(avgRpeRecent.reduce((a,b)=>a+b,0)/avgRpeRecent.length).toFixed(1)}). Deload to ${deload} × ${last.top.reps} — come back stronger.` };
  }

  // Reps in reserve ≥ 2 → user has room to push
  if (last.avgRir != null && last.avgRir >= 2) {
    const extraReps = Math.min(Math.floor(last.avgRir), 3);
    return { tone: "push", target: { weight: last.top.weight, reps: last.top.reps + extraReps },
      message: `You left ${last.avgRir.toFixed(0)} in the tank last time. Push for ${last.top.weight} × ${last.top.reps + extraReps} today.` };
  }
  if (last.avgRpe != null && last.avgRpe <= 7.5) {
    const extraReps = 2;
    return { tone: "push", target: { weight: last.top.weight, reps: last.top.reps + extraReps },
      message: `RPE was only ~${last.avgRpe.toFixed(1)} — you can do more. Aim for ${last.top.weight} × ${last.top.reps + extraReps}.` };
  }

  // Stalled: same top weight × reps for 3+ sessions
  if (sessions.length >= 3 &&
      sessions.slice(0,3).every(s => s.top.weight === last.top.weight && s.top.reps === last.top.reps)) {
    const bumpW = last.top.weight + (last.top.weight >= 135 ? 5 : 2.5);
    return { tone: "breakthrough", target: { weight: bumpW, reps: last.top.reps },
      message: `Stalled at ${last.top.weight} × ${last.top.reps} for 3 sessions. Time to break through — try ${bumpW} × ${last.top.reps}.` };
  }

  // Default progressive overload nudge
  const nextReps = last.top.reps + 1;
  if (nextReps <= 12) {
    return { tone: "progress", target: { weight: last.top.weight, reps: nextReps },
      message: `Last: ${last.top.weight} × ${last.top.reps}. Go for ${last.top.weight} × ${nextReps} today — one more rep is a PR.` };
  }
  const bumpW = last.top.weight + (last.top.weight >= 135 ? 5 : 2.5);
  return { tone: "progress", target: { weight: bumpW, reps: Math.max(5, last.top.reps - 2) },
    message: `You're cruising at ${last.top.reps} reps — bump the weight to ${bumpW} × ${Math.max(5, last.top.reps - 2)}.` };
}

// ── Icons ─────────────────────────────────────────────────────────────
const Icon = ({ name, size = 18, color }) => {
  const p = {
    plus:     <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    trash:    <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></>,
    dumbbell: <><path d="M6.5 6.5h11"/><path d="M6.5 17.5h11"/><path d="M3 9.5h3v5H3z"/><path d="M18 9.5h3v5h-3z"/></>,
    chart:    <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
    history:  <><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></>,
    x:        <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    trophy:   <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></>,
    chevronDown: <polyline points="6 9 12 15 18 9"/>,
    tag:      <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>,
    user:     <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    check:    <polyline points="20 6 9 20 4 14"/>,
    edit2:    <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    timer:    <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    sun:      <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>,
    moon:     <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>,
    home:     <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
    book:     <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>,
    shield:   <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    zap:      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>,
    gear:         <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    chevronRight: <polyline points="9 18 15 12 9 6"/>,
    help:         <><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    bell:         <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></>,
    moreH:        <><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{p[name]}</svg>;
};


// ── Help Modal ────────────────────────────────────────────────────────
function HelpModal({ page, onClose, onReplayTour }) {
  const t = useT();
  const [versionCopied, setVersionCopied] = useState(false);
  const content = HELP_CONTENT[page];
  if (!content) return null;
  // Fix #30: tap version string → clipboard copy with toast
  const copyVersion = async () => {
    const text = `Barbell Labs v${APP_VERSION} · Built ${BUILD_DATE}`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
      else { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); }
      haptic(8);
      setVersionCopied(true);
      setTimeout(() => setVersionCopied(false), 1600);
    } catch {}
  };
  return (
    <div data-hswipe-safe style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onClose}>
      {/* Backdrop */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)" }} />
      {/* Sheet */}
      <div onClick={e => e.stopPropagation()} style={{
        position: "relative", width: "100%", maxWidth: 420,
        background: t.surfaceHigh, borderRadius: "20px 20px 0 0",
        padding: "0 0 32px", maxHeight: "82vh", display: "flex", flexDirection: "column",
        border: `1px solid ${t.border}`, borderBottom: "none",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.4)",
      }}>
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: t.border }} />
        </div>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>{content.emoji}</span>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, letterSpacing: 1, color: t.text }}>
              {content.title} <span style={{ color: accent }}>Help</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: t.textMuted }}>
            <Icon name="x" size={16} />
          </button>
        </div>
        {/* Scrollable content */}
        <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 20px", flex: 1 }}>
          {content.sections.map((s, i) => (
            <div key={i} style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 3, height: 16, background: accent, borderRadius: 2, flexShrink: 0 }} />
                <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>{s.heading}</div>
              </div>
              <div style={{ fontSize: 13, color: t.textSub, lineHeight: 1.65, paddingLeft: 11 }}>{s.body}</div>
            </div>
          ))}
          <div style={{ textAlign: "center", paddingTop: 8, paddingBottom: 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            {onReplayTour && (
              <button onClick={onReplayTour} style={{ background: "transparent", border: "none", color: accent, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "4px 8px", fontFamily: "inherit" }}>
                Replay intro tour
              </button>
            )}
            <button onClick={copyVersion} style={{ background: "transparent", border: "none", color: versionCopied ? accent : t.textMuted, fontSize: 11, cursor: "pointer", padding: "4px 8px", fontFamily: "inherit", transition: "color 0.2s" }}>
              {versionCopied ? "✓ Copied to clipboard" : <>Barbell Labs v{APP_VERSION} · Built {BUILD_DATE}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared pill button style ──────────────────────────────────────────
// Used for Help, Edit, Cancel, Save across all pages.
const pillBtn = (t, extra = {}) => ({
  background: t.surfaceHigh,
  border: `1px solid ${t.border}`,
  borderRadius: 20,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 14px",
  fontSize: 12,
  fontWeight: 600,
  color: t.textSub,
  flexShrink: 0,
  minHeight: 44,
  touchAction: "manipulation",
  ...extra,
});

const pillBtnPrimary = (extra = {}) => ({
  background: `linear-gradient(135deg, ${accent}, #4A8BC4)`,
  border: "none",
  borderRadius: 20,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 16px",
  fontSize: 12,
  fontWeight: 700,
  color: "#fff",
  flexShrink: 0,
  minHeight: 44,
  touchAction: "manipulation",
  ...extra,
});

// ── Top Actions (icon-only buttons for top-right nav slot) ────────────
function IconBtn({ icon, onClick, label, badge }) {
  const t = useT();
  return (
    <button onClick={onClick} aria-label={label} title={label} style={{
      position: "relative",
      width: 36, height: 36, borderRadius: "50%",
      background: t.surfaceHigh, border: `1px solid ${t.border}`,
      color: t.textSub, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 0, flexShrink: 0, transition: "background 0.15s, color 0.15s",
    }}>
      <Icon name={icon} size={16} />
      {badge > 0 && (
        <span style={{
          position: "absolute", top: -2, right: -2,
          minWidth: 16, height: 16, padding: "0 4px",
          borderRadius: 8, background: "#ff3b30", color: "#fff",
          fontSize: 10, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
          display: "flex", alignItems: "center", justifyContent: "center",
          border: `2px solid ${t.bg}`, boxSizing: "content-box",
        }}>{badge > 9 ? "9+" : badge}</span>
      )}
    </button>
  );
}

const TopActions = ({ children }) => (
  <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
    {children}
  </div>
);

// ── Help Button ───────────────────────────────────────────────────────
function HelpBtn({ page, onOpen }) {
  return <IconBtn icon="help" onClick={onOpen} label="Help" />;
}

// ── Rest Timer ────────────────────────────────────────────────────────
function RestTimer() {
  const t = useT(); const S = useS();
  const PRESETS = [30, 60, 90, 120, 180];
  // Fix #80: timestamp-based timer. endsAt is the wall-clock time the timer should fire.
  // We derive `remaining` from (endsAt - Date.now()) on every render — this is robust against
  // background-tab throttling that breaks setInterval-based countdowns. Persisted to
  // localStorage so the timer survives navigation, refresh, and screen lock.
  const LS_KEY = "barbell.restTimer.v1";
  const loadPersisted = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
  };
  const persisted = loadPersisted();
  const [seconds, setSeconds] = useState(persisted.seconds || 90);
  const [endsAt, setEndsAt] = useState(persisted.endsAt && persisted.endsAt > Date.now() ? persisted.endsAt : null);
  // pausedRemaining is the seconds-left-on-pause; null when timer is running or fresh.
  const [pausedRemaining, setPausedRemaining] = useState(persisted.pausedRemaining ?? null);
  const [done, setDone] = useState(false);
  const [customMin, setCustomMin] = useState("");
  const [customSec, setCustomSec] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [expanded, setExpanded] = useState(false); // compact by default
  const [, forceTick] = useState(0); // forces re-render every 250ms while running so the display updates
  const notifTimeout = useRef(null);
  const doneFiredRef = useRef(false); // ensures the "rest done" haptic/sound fires exactly once per timer

  const running = endsAt !== null;
  // Broadcast timer "active" state on a window global so ExerciseBlock's Add Set handler
  // can decide between silent reset (timer idle/done) and prompting (timer running).
  // Active = running or paused — done is not active.
  useEffect(() => {
    try { window.__bl_timerActive = (endsAt !== null) || (pausedRemaining != null); } catch {}
    return () => { try { window.__bl_timerActive = false; } catch {} };
  }, [endsAt, pausedRemaining]);
  const remaining = running
    ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
    : (pausedRemaining ?? seconds);

  // Persist whenever the relevant state changes
  useEffect(() => {
    try {
      if (endsAt || pausedRemaining != null || seconds !== 90) {
        localStorage.setItem(LS_KEY, JSON.stringify({ seconds, endsAt, pausedRemaining }));
      } else {
        localStorage.removeItem(LS_KEY);
      }
    } catch {}
  }, [seconds, endsAt, pausedRemaining]);

  const scheduleNotif = (secs) => {
    if (!("Notification" in window)) return;
    Notification.requestPermission().then(perm => {
      if (perm !== "granted") return;
      if (notifTimeout.current) clearTimeout(notifTimeout.current);
      notifTimeout.current = setTimeout(() => {
        navigator.serviceWorker?.ready.then(reg => {
          reg.showNotification("Rest complete! 💪", {
            body: "Time to hit your next set",
            icon: "/logo192.png",
            tag: "rest-timer",
            renotify: true,
            vibrate: [200, 100, 200],
          });
        });
      }, secs * 1000);
    });
  };
  const cancelNotif = () => {
    if (notifTimeout.current) { clearTimeout(notifTimeout.current); notifTimeout.current = null; }
  };

  // Tick loop: force re-render every 250ms while running so remaining updates smoothly.
  // setInterval throttles in background but that's fine — when we come back to foreground,
  // the remaining recalculation from endsAt handles the catch-up.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => forceTick(n => n + 1), 250);
    return () => clearInterval(id);
  }, [running]);

  // Done detection: when remaining hits 0 while running, fire the "rest complete" sequence
  // once (idempotent via doneFiredRef). Also catches the case where the user returns to the
  // app after backgrounding past the endsAt — the next render computes remaining=0 and fires.
  useEffect(() => {
    if (!running) { doneFiredRef.current = false; return; }
    if (remaining <= 0 && !doneFiredRef.current) {
      doneFiredRef.current = true;
      setEndsAt(null);
      setDone(true);
      haptic([0, 80, 40, 80]);
      playRestDone();
      cancelNotif();
    }
  }, [running, remaining]);

  // Visibility change: when the user returns to the app, force a re-render so we re-evaluate
  // remaining against current Date.now() and fire the done sequence if we crossed the line
  // while the tab was hidden.
  useEffect(() => {
    const onVis = () => { if (!document.hidden) forceTick(n => n + 1); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // External "gt-start-timer" event — always resets to full duration.
  // Used when the user explicitly confirms "I just finished a set" (✓ tap or
  // Add Set "Yes, reset"), or when Add Set fires silently because the timer is idle.
  useEffect(() => {
    const handler = () => {
      setEndsAt(Date.now() + seconds * 1000);
      setPausedRemaining(null);
      setDone(false);
      doneFiredRef.current = false;
      haptic(10); scheduleNotif(seconds);
    };
    window.addEventListener("gt-start-timer", handler);
    return () => window.removeEventListener("gt-start-timer", handler);
  }, [seconds]); // eslint-disable-line

  // External "gt-start-timer-if-idle" event — only starts if not running/paused. "done"
  // counts as idle (previous rest cycle is over). Used by focus-to-start so tapping into
  // an empty set's input naturally kicks off the timer at the start of an exercise, but
  // doesn't disrupt an already-running rest.
  useEffect(() => {
    const handler = () => {
      if (endsAt !== null || pausedRemaining != null) return;
      setEndsAt(Date.now() + seconds * 1000);
      setDone(false);
      doneFiredRef.current = false;
      haptic(10); scheduleNotif(seconds);
    };
    window.addEventListener("gt-start-timer-if-idle", handler);
    return () => window.removeEventListener("gt-start-timer-if-idle", handler);
  }, [seconds, endsAt, pausedRemaining]); // eslint-disable-line


  const applyCustom = () => {
    const m = parseInt(customMin) || 0;
    const s = parseInt(customSec) || 0;
    const total = m * 60 + s;
    if (total > 0 && total <= 3600) {
      setSeconds(total); setEndsAt(null); setPausedRemaining(null); setDone(false);
      setShowCustom(false);
    }
  };

  const setPreset = (p) => { setSeconds(p); setEndsAt(null); setPausedRemaining(null); setDone(false); setShowCustom(false); };
  // Start a fresh timer (used by Start button when nothing is paused).
  const start  = () => {
    setEndsAt(Date.now() + seconds * 1000); setPausedRemaining(null); setDone(false);
    doneFiredRef.current = false;
    haptic(10); scheduleNotif(seconds);
  };
  // Resume from pausedRemaining (true continuation, not a reset).
  const resume = () => {
    if (pausedRemaining == null) { start(); return; }
    setEndsAt(Date.now() + pausedRemaining * 1000); setPausedRemaining(null); setDone(false);
    doneFiredRef.current = false;
    haptic(10); scheduleNotif(pausedRemaining);
  };
  const pause  = () => {
    if (!running) return;
    const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    setPausedRemaining(left);
    setEndsAt(null);
    cancelNotif();
  };
  const stop   = () => { setEndsAt(null); setPausedRemaining(null); setDone(false); doneFiredRef.current = false; cancelNotif(); };
  const fmt    = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const progress = (running || pausedRemaining != null) ? remaining / seconds : 1;
  const R = 34, circ = 2 * Math.PI * R;

  const isCustomActive = !PRESETS.includes(seconds);

  // Compact mode — slim row with countdown + start/pause/resume + expand chevron
  if (!expanded) {
    const dotColor = done ? "#5bb85b" : running ? accent : t.textMuted;
    const isPaused = pausedRemaining != null;
    // Apple polish: compact rest timer.
    //   - Bigger time digits (was 22 → 26), Bebas Neue letterspaced
    //   - Hairline border + top inner highlight for depth
    //   - Primary button uses the same Steel Blue gradient as Add Exercise / Coach Apply
    //   - Pause / Reset buttons use the new opacity ghost recipe
    return (
      <div style={{
        background: t.surfaceHigh,
        border: `1px solid ${done ? "rgba(91,184,91,0.4)" : "rgba(255,255,255,0.08)"}`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
        borderRadius: 14,
        padding: "10px 12px 10px 16px",
        marginBottom: 14,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0, animation: running ? "bl-card-in 1s ease-in-out infinite alternate" : "none", boxShadow: running ? `0 0 12px ${dotColor}` : "none" }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, letterSpacing: 0.9, textTransform: "uppercase" }}>Rest</span>
        <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 26, letterSpacing: 1.2, color: done ? "#5bb85b" : (running ? t.text : t.textSub), lineHeight: 1, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
          {done ? "✓" : fmt(remaining)}
        </span>
        {done && <span style={{ fontSize: 11, color: "#5bb85b", fontWeight: 600, flex: 1 }}>Rest complete</span>}
        {!done && <div style={{ flex: 1 }} />}
        {!running && !done && (
          <button onClick={isPaused ? resume : start} style={{
            background: `linear-gradient(135deg, ${accent}, #4A8BC4)`,
            color: "#fff", border: "none", borderRadius: 10,
            padding: "8px 16px", fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 2px 12px ${accentGlow}`,
            cursor: "pointer", touchAction: "manipulation",
          }}>{isPaused ? "Resume" : "Start"}</button>
        )}
        {running && (
          <>
            <button onClick={pause} style={{
              background: "rgba(255,255,255,0.06)", color: t.text,
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
              borderRadius: 10, padding: "8px 14px", fontSize: 12, fontWeight: 700,
              cursor: "pointer", touchAction: "manipulation",
            }}>Pause</button>
            <button onClick={stop} aria-label="Reset rest timer" style={{
              background: "transparent", color: t.textMuted,
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10, padding: "8px 10px", fontSize: 12, fontWeight: 600,
              cursor: "pointer", touchAction: "manipulation",
            }}>Reset</button>
          </>
        )}
        {!running && isPaused && (
          <button onClick={stop} aria-label="Reset rest timer" style={{
            background: "transparent", color: t.textMuted,
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10, padding: "8px 10px", fontSize: 12, fontWeight: 600,
            cursor: "pointer", touchAction: "manipulation",
          }}>Reset</button>
        )}
        {done && (
          <button onClick={stop} style={{
            background: "transparent", color: t.textMuted,
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10, padding: "8px 12px", fontSize: 12, fontWeight: 600,
            cursor: "pointer", touchAction: "manipulation",
          }}>Reset</button>
        )}
        <button onClick={() => setExpanded(true)} aria-label="Expand rest timer" style={{ background: "transparent", border: "none", color: t.textMuted, cursor: "pointer", padding: 4, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name="chevronDown" size={14} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Icon name="timer" size={14} />
        <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 15, letterSpacing: 1, color: t.text }}>REST TIMER</span>
        {done && <span style={{ fontSize: 12, color: "#5bb85b", fontWeight: 700 }}>✓ Rest complete!</span>}
        <div style={{ flex: 1 }} />
        <button onClick={() => setExpanded(false)} aria-label="Collapse rest timer" style={{ background: "transparent", border: "none", color: t.textMuted, cursor: "pointer", padding: 4, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(180deg)" }}>
          <Icon name="chevronDown" size={14} />
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* Ring */}
        <div style={{ flexShrink: 0 }}>
          <svg width={86} height={86}>
            <circle cx={43} cy={43} r={R} fill="none" stroke={t.border} strokeWidth={5} />
            <circle cx={43} cy={43} r={R} fill="none"
              stroke={done ? "#5bb85b" : running ? accent : t.textMuted}
              strokeWidth={5} strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={circ * (1 - progress)}
              transform="rotate(-90 43 43)"
              style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }} />
            <text x="43" y="49" textAnchor="middle" fontSize="17" fontWeight="700"
              fill={done ? "#5bb85b" : t.text} fontFamily="'Bebas Neue', cursive">
              {fmt(remaining)}
            </text>
          </svg>
        </div>

        <div style={{ flex: 1 }}>
          {/* Presets + Custom button */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
            {PRESETS.map(p => (
              <button key={p} onClick={() => setPreset(p)} style={{
                background: seconds === p && !running && !isCustomActive ? accent : t.inputBg,
                color: seconds === p && !running && !isCustomActive ? "#ffffff" : t.textSub,
                border: `1px solid ${seconds === p && !running && !isCustomActive ? accent : t.border}`,
                borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 44, touchAction: "manipulation",
              }}>{p >= 60 ? `${p/60}m` : `${p}s`}</button>
            ))}
            <button onClick={() => setShowCustom(v => !v)} style={{
              background: isCustomActive ? accent : t.inputBg,
              color: isCustomActive ? "#ffffff" : t.textSub,
              border: `1px solid ${isCustomActive ? accent : t.border}`,
              borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 44, touchAction: "manipulation",
            }}>Custom</button>
          </div>

          {/* Custom time input */}
          {showCustom && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, background: t.inputBg, borderRadius: 8, padding: "8px 10px", border: `1px solid ${t.border}` }}>
              <input
                type="number" min="0" max="59" placeholder="0"
                value={customMin}
                onChange={e => setCustomMin(e.target.value)}
                style={{ width: 40, background: "transparent", border: "none", color: t.text, fontSize: 16, fontWeight: 700, textAlign: "center", outline: "none" }}
              />
              <span style={{ color: t.textMuted, fontWeight: 700, fontSize: 16 }}>m</span>
              <span style={{ color: t.border, fontSize: 18 }}>:</span>
              <input
                type="number" min="0" max="59" placeholder="0"
                value={customSec}
                onChange={e => setCustomSec(e.target.value)}
                onKeyDown={e => e.key === "Enter" && applyCustom()}
                style={{ width: 40, background: "transparent", border: "none", color: t.text, fontSize: 16, fontWeight: 700, textAlign: "center", outline: "none" }}
              />
              <span style={{ color: t.textMuted, fontWeight: 700, fontSize: 16 }}>s</span>
              <button onClick={applyCustom} style={{ marginLeft: 4, background: `linear-gradient(135deg, ${accent}, #4A8BC4)`, color: "#ffffff", border: "none", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 44, touchAction: "manipulation" }}>Set</button>
            </div>
          )}

          {/* Controls */}
          <div style={{ display: "flex", gap: 8 }}>
            {!running
              ? <button onClick={pausedRemaining != null ? resume : start} style={{ ...S.solidBtn(), flex: 1, padding: "11px 0", fontSize: 14, borderRadius: 10, minHeight: 42 }}>{pausedRemaining != null ? "Resume" : "Start"}</button>
              : <button onClick={pause} style={{ flex: 1, background: t.inputBg, border: `1px solid ${t.border}`, color: t.text, borderRadius: 10, padding: "11px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", minHeight: 42, touchAction: "manipulation" }}>Pause</button>
            }
            <button onClick={stop} style={{ background: "transparent", border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 10, padding: "11px 16px", fontSize: 14, cursor: "pointer", minHeight: 42, touchAction: "manipulation" }}>Reset</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Dual Line Chart (Weight + Reps) ──────────────────────────────────
const WEIGHT_COLOR = "#5B9BD5"; // Steel Blue
const REPS_COLOR   = "#5bb85b"; // Green

function LineChart({ points, lineColor = WEIGHT_COLOR }) {
  return <DualLineChart points={points} lineColor={lineColor} />;
}

function DualLineChart({ points, lineColor = WEIGHT_COLOR }) {
  const t = useT();
  const [selected, setSelected] = useState(null);
  const svgRef = useRef(null);
  const dismissRef = useRef(null);

  if (!points.length) return (
    <div style={{ color: t.textMuted, fontSize: 13, padding: "20px 0", textAlign: "center" }}>
      Log at least one session to see this chart
    </div>
  );

  // Fix #33: single data point has no meaningful Y-axis, so show a summary tile instead of a broken chart
  if (points.length === 1) {
    const p = points[0];
    return (
      <div style={{ padding: "24px 16px", textAlign: "center", background: `${lineColor}0a`, border: `1px solid ${lineColor}26`, borderRadius: 14 }}>
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 32, letterSpacing: 1, color: lineColor, lineHeight: 1, marginBottom: 6 }}>
          {p.value}{p.reps ? <span style={{ color: t.textMuted, fontSize: 18, marginLeft: 6 }}>× {p.reps}</span> : null}
        </div>
        <div style={{ color: t.textMuted, fontSize: 12, lineHeight: 1.5 }}>
          Baseline logged · log another session to unlock progression
        </div>
      </div>
    );
  }

  const W = 340, H = 170, padL = 38, padR = 38, padT = 36, padB = 32;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const wVals = points.map(p => p.value);
  const wMin = Math.min(...wVals), wMax = Math.max(...wVals), wRange = wMax - wMin || 1;

  const hasReps = points.some(p => p.reps > 0);
  const rVals = points.map(p => p.reps || 0);
  const rMin = Math.max(0, Math.min(...rVals) - 1), rMax = Math.max(...rVals) + 1, rRange = rMax - rMin || 1;

  const toX  = (i) => padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const toYw = (v) => padT + plotH - ((v - wMin) / wRange) * plotH;
  const toYr = (v) => padT + plotH - ((v - rMin) / rRange) * plotH;

  const prIdx = points.reduce((best, p, i) => {
    const b = points[best];
    if (p.value > b.value) return i;
    if (p.value === b.value && (p.reps || 0) > (b.reps || 0)) return i;
    return best;
  }, 0);

  const wPolyline = points.map((p, i) => `${toX(i)},${toYw(p.value)}`).join(" ");
  const rPolyline = hasReps ? points.map((p, i) => `${toX(i)},${toYr(p.reps || 0)}`).join(" ") : "";
  const wAreaPath = points.length > 1
    ? `M${toX(0)},${toYw(points[0].value)} ${points.slice(1).map((p, i) => `L${toX(i+1)},${toYw(p.value)}`).join(" ")} L${toX(points.length-1)},${padT+plotH} L${toX(0)},${padT+plotH} Z`
    : "";

  // Fix #34: reduce tick count when range is small so labels don't overlap
  const yTickCount = wRange < 10 ? 3 : 4;
  const yTickVals = Array.from({ length: yTickCount }, (_, i) => wMin + (wRange / (yTickCount - 1)) * i);
  const rTickCount = rRange < 5 ? 3 : 4;
  const rTickVals = hasReps ? Array.from({ length: rTickCount }, (_, i) => Math.round(rMin + (rRange / (rTickCount - 1)) * i)) : [];
  const wGradId = `wgrad-${lineColor.replace("#", "")}`;

  // ── Touch / mouse interaction ──────────────────────────────────────
  // Finds nearest point index from a raw clientX coordinate
  const nearestIdx = (clientX) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * W;
    let best = 0, bestD = Infinity;
    points.forEach((_, i) => { const d = Math.abs(toX(i) - svgX); if (d < bestD) { bestD = d; best = i; } });
    return best;
  };

  const onInteract = (e) => {
    e.preventDefault();
    clearTimeout(dismissRef.current);
    const src = e.touches ? e.touches[0] : e;
    setSelected(nearestIdx(src.clientX));
  };

  const onTouchEnd = () => {
    // Keep tooltip visible for 4 s after lifting finger, then fade
    clearTimeout(dismissRef.current);
    dismissRef.current = setTimeout(() => setSelected(null), 4000);
  };

  const onMouseLeave = () => {
    clearTimeout(dismissRef.current);
    setSelected(null);
  };

  // ── Render ─────────────────────────────────────────────────────────
  const selPt   = selected !== null ? points[selected] : null;
  const selX    = selected !== null ? toX(selected) : null;
  const selIsPR = selected === prIdx;

  // Info pill content — built as a string so we can measure width
  const pillText = selPt
    ? `${formatDay(selPt.date)}  ·  ${selPt.value} lbs${hasReps && selPt.reps > 0 ? `  ·  ${selPt.reps} reps` : ""}${selIsPR ? "  👑" : ""}`
    : "";
  const pillW = Math.min(plotW, 60 + pillText.length * 6.2);
  const pillH = 26;
  const pillY = 4;
  const pillX = selX !== null ? Math.min(Math.max(selX - pillW / 2, padL), W - padR - pillW) : 0;

  // X-axis label index set
  const xShown = (() => {
    const n = points.length;
    if (n <= 1) return new Set([0]);
    const slots = Math.min(5, n);
    const step = (n - 1) / (slots - 1);
    return new Set(Array.from({ length: slots }, (_, k) => Math.round(k * step)));
  })();

  return (
    <div data-hswipe-safe>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <svg ref={svgRef} width={W} height={H} style={{ display: "block", overflow: "visible", touchAction: "none" }}>
          <defs>
            <linearGradient id={wGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={WEIGHT_COLOR} stopOpacity="0.15" />
              <stop offset="100%" stopColor={WEIGHT_COLOR} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid + left axis */}
          {yTickVals.map((v, i) => (
            <g key={i}>
              <line x1={padL} y1={toYw(v)} x2={W-padR} y2={toYw(v)} stroke={t.border} strokeWidth="1" strokeDasharray={i === 0 ? "0" : "3,3"} />
              <text x={padL-5} y={toYw(v)+4} textAnchor="end" fontSize="9" fill={WEIGHT_COLOR} opacity="0.8">{Math.round(v)}</text>
            </g>
          ))}

          {/* Right (reps) axis */}
          {hasReps && rTickVals.map((v, i) => (
            <text key={i} x={W-padR+5} y={toYr(v)+4} textAnchor="start" fontSize="9" fill={REPS_COLOR} opacity="0.8">{v}</text>
          ))}

          {/* Fix #34: axis labels on the axes (replaces footer legend). X-axis date labels below each dot already convey "date". */}
          <text x={padL-5} y={padT-14} textAnchor="end" fontSize="9" fontWeight="700" fill={WEIGHT_COLOR} letterSpacing="0.5">WEIGHT (LBS)</text>
          {hasReps && <text x={W-padR+5} y={padT-14} textAnchor="start" fontSize="9" fontWeight="700" fill={REPS_COLOR} letterSpacing="0.5">REPS</text>}

          {/* Area fill */}
          {wAreaPath && <path d={wAreaPath} fill={`url(#${wGradId})`} />}

          {/* Reps line */}
          {hasReps && points.length > 1 && (
            <polyline points={rPolyline} fill="none" stroke={REPS_COLOR} strokeWidth="2" strokeDasharray="5,3" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
          )}

          {/* Weight line */}
          {points.length > 1 && (
            <polyline points={wPolyline} fill="none" stroke={WEIGHT_COLOR} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          )}

          {/* Vertical guide line for selected point */}
          {selX !== null && (
            <line x1={selX} y1={padT} x2={selX} y2={padT+plotH}
              stroke={selIsPR ? "#ff9500" : "#5B9BD5"} strokeWidth="1.5" strokeDasharray="4,3" opacity="0.55" />
          )}

          {/* Dots */}
          {points.map((p, i) => {
            const cx = toX(i), cyw = toYw(p.value), cyr = hasReps ? toYr(p.reps || 0) : null;
            const isPR = i === prIdx, isSel = selected === i;
            return (
              <g key={i}>
                {/* Weight dot — glow ring when selected */}
                {isSel && <circle cx={cx} cy={cyw} r={11} fill={isPR ? "#ff9500" : WEIGHT_COLOR} opacity="0.12" />}
                <circle cx={cx} cy={cyw} r={isPR ? 5.5 : isSel ? 5.5 : 3.5}
                  fill={isPR ? "#ff9500" : WEIGHT_COLOR}
                  stroke={isSel || isPR ? "#fff" : "transparent"} strokeWidth="2" />
                {isPR && <text x={cx} y={cyw-11} textAnchor="middle" fontSize="12">👑</text>}
                {/* Reps dot */}
                {hasReps && cyr !== null && (
                  <g>
                    {isSel && <circle cx={cx} cy={cyr} r={9} fill={REPS_COLOR} opacity="0.12" />}
                    <circle cx={cx} cy={cyr} r={isSel ? 5 : 3}
                      fill={REPS_COLOR} stroke={isSel ? "#fff" : "transparent"} strokeWidth="1.5" />
                  </g>
                )}
                {/* X-axis label — highlighted when selected */}
                {(xShown.has(i) || isSel) && (
                  <text x={cx} y={H-4} textAnchor="middle" fontSize="9"
                    fill={isSel ? (selIsPR ? "#ff9500" : "#5B9BD5") : t.textMuted}
                    fontWeight={isSel ? "700" : "400"}>
                    {formatDay(p.date)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Info pill — anchored to top, always fully visible */}
          {selPt && (
            <g>
              <rect x={pillX} y={pillY} width={pillW} height={pillH} rx={13}
                fill={t.surfaceHigh}
                stroke={selIsPR ? "#ff9500" : "#5B9BD5"} strokeWidth="1.5"
                style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.35))" }} />
              <text x={pillX + pillW/2} y={pillY + 17} textAnchor="middle"
                fontSize="10.5" fontWeight="700" fill={selIsPR ? "#ff9500" : t.text}>
                {pillText}
              </text>
            </g>
          )}

          {/* Single full-area touch/mouse capture overlay — renders last so it's on top */}
          <rect x={padL} y={padT} width={plotW} height={plotH}
            fill="transparent"
            style={{ cursor: "crosshair", WebkitTapHighlightColor: "transparent" }}
            onMouseMove={onInteract}
            onMouseLeave={onMouseLeave}
            onTouchStart={onInteract}
            onTouchMove={onInteract}
            onTouchEnd={onTouchEnd}
          />

          {/* Axis lines */}
          <line x1={padL} y1={padT} x2={padL} y2={padT+plotH} stroke={t.border} strokeWidth="1" />
          {hasReps && <line x1={W-padR} y1={padT} x2={W-padR} y2={padT+plotH} stroke={t.border} strokeWidth="1" />}
        </svg>
      </div>

    </div>
  );
}

// ── Weekly Volume Bar Chart ───────────────────────────────────────────
function VolumeBarChart({ workouts }) {
  const t = useT();
  const [selected, setSelected] = useState(null);

  const weeks = (() => {
    const map = {};
    workouts.forEach(w => {
      const d = new Date(w.date + "T12:00:00");
      const day = d.getDay();
      const mon = new Date(d); mon.setDate(d.getDate() - ((day + 6) % 7));
      const key = mon.toISOString().slice(0, 10);
      // Fix #97: weekly volume excludes warmup sets (training stimulus only). Drop sets
      // count because they're real working sets at reduced load.
      const vol = w.exercises.reduce((sum, ex) =>
        sum + ex.sets.filter(isNonWarmup).reduce((s2, s) =>
          s2 + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0), 0);
      map[key] = (map[key] || 0) + vol;
    });
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([key, vol]) => ({ key, vol, label: new Date(key + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) }));
  })();

  if (!weeks.length) return null;

  const W = 340, H = 160, padL = 40, padR = 12, padT = 20, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxVol = Math.max(...weeks.map(w => w.vol), 1);
  const barW = Math.max(8, (plotW / weeks.length) * 0.6);
  const gap   = plotW / weeks.length;

  const barX = (i) => padL + i * gap + (gap - barW) / 2;
  const barH = (v) => (v / maxVol) * plotH;
  const barY = (v) => padT + plotH - barH(v);

  const yticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxVol * f));

  const xShown = (() => {
    const n = weeks.length;
    if (n <= 4) return new Set(weeks.map((_, i) => i));
    const slots = Math.min(4, n);
    const step  = (n - 1) / (slots - 1);
    return new Set(Array.from({ length: slots }, (_, k) => Math.round(k * step)));
  })();

  const fmtVol = (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : `${Math.round(v)}`;

  const selW = weeks[selected];
  const pillText = selW ? `${selW.label}  ·  ${fmtVol(selW.vol)} lbs` : "";
  const pillW = Math.min(plotW, 40 + pillText.length * 6.4);
  const pillH = 24;
  const pillY  = 2;
  const pillX  = selected !== null
    ? Math.min(Math.max(barX(selected) + barW / 2 - pillW / 2, padL), W - padR - pillW)
    : 0;

  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}
        onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const svgX = ((e.clientX - rect.left) / rect.width) * W;
          let best = null, bestD = Infinity;
          weeks.forEach((_, i) => { const cx = barX(i) + barW / 2; const d = Math.abs(cx - svgX); if (d < bestD) { bestD = d; best = i; } });
          setSelected(s => s === best ? null : best);
        }}
        onTouchEnd={e => {
          const touch = e.changedTouches[0];
          const rect = e.currentTarget.getBoundingClientRect();
          const svgX = ((touch.clientX - rect.left) / rect.width) * W;
          let best = null, bestD = Infinity;
          weeks.forEach((_, i) => { const cx = barX(i) + barW / 2; const d = Math.abs(cx - svgX); if (d < bestD) { bestD = d; best = i; } });
          setSelected(s => s === best ? null : best);
        }}
      >
        {/* Y-axis ticks */}
        {yticks.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={barY(v)} x2={W - padR} y2={barY(v)} stroke={t.border} strokeWidth="1" strokeDasharray={i === 0 ? "0" : "3,3"} />
            {i > 0 && <text x={padL - 4} y={barY(v) + 4} textAnchor="end" fontSize="9" fill={accent} opacity="0.75">{fmtVol(v)}</text>}
          </g>
        ))}
        {/* Bars */}
        {weeks.map((w, i) => {
          const isSel = selected === i;
          const h = Math.max(3, barH(w.vol));
          return (
            <g key={w.key}>
              <rect
                x={barX(i)} y={barY(w.vol)} width={barW} height={h}
                rx={4}
                fill={isSel ? accent : `${accent}55`}
                style={{ transition: "fill 0.15s" }}
              />
              {(xShown.has(i) || isSel) && (
                <text x={barX(i) + barW / 2} y={H - 4} textAnchor="middle" fontSize="9"
                  fill={isSel ? accent : t.textMuted} fontWeight={isSel ? "700" : "400"}>
                  {w.label}
                </text>
              )}
            </g>
          );
        })}
        {/* Axis */}
        <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke={t.border} strokeWidth="1" />
        {/* Tooltip pill */}
        {selW && (
          <g>
            <rect x={pillX} y={pillY} width={pillW} height={pillH} rx={12}
              fill={t.surfaceHigh} stroke={accent} strokeWidth="1.5"
              style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.35))" }} />
            <text x={pillX + pillW / 2} y={pillY + 16} textAnchor="middle"
              fontSize="10" fontWeight="700" fill={accent}>{pillText}</text>
          </g>
        )}
      </svg>
    </div>
  );
}

// ── Bodyweight Mini Chart ─────────────────────────────────────────────
// Fix #49: historical entry, goal weight + progress viz, trend indicator, range picker.
function BodyweightWidget({ bodyweight, onAdd, goalWeight, onSaveGoal }) {
  const t = useT(); const S = useS();
  const [input, setInput] = useState("");
  const [pastDate, setPastDate] = useState("");
  const [pastWeight, setPastWeight] = useState("");
  const [showPastEntry, setShowPastEntry] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [showGoalEditor, setShowGoalEditor] = useState(false);
  const [range, setRange] = useState("90d"); // 30d | 90d | 1y | all

  const sorted = [...bodyweight].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.length ? sorted[sorted.length - 1] : null;
  const today = todayISO();
  const alreadyToday = latest?.date === today;

  // Filter to the selected range for the chart
  const rangeCutoff = (() => {
    if (range === "all") return null;
    const d = new Date();
    if (range === "30d") d.setDate(d.getDate() - 30);
    else if (range === "90d") d.setDate(d.getDate() - 90);
    else if (range === "1y") d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const visible = rangeCutoff ? sorted.filter(e => e.date >= rangeCutoff) : sorted;
  const chartPoints = visible.map(e => ({ date: e.date, value: e.weight }));

  // Trend: latest vs oldest entry within last 30d (and 90d for secondary)
  const trend30 = (() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const windowed = sorted.filter(e => e.date >= cutoffStr);
    if (windowed.length < 2) return null;
    return windowed[windowed.length - 1].weight - windowed[0].weight;
  })();

  // Goal delta
  const goalDelta = (latest && goalWeight) ? latest.weight - goalWeight : null;
  const goalMet = goalDelta !== null && Math.abs(goalDelta) < 1;

  const submit = () => {
    const w = parseFloat(input);
    if (!w || w < 50 || w > 700) return;
    onAdd(w, today);
    setInput("");
  };
  const submitPast = () => {
    const w = parseFloat(pastWeight);
    if (!w || w < 50 || w > 700) return;
    if (!pastDate) return;
    onAdd(w, pastDate);
    setPastWeight(""); setPastDate(""); setShowPastEntry(false);
  };
  const submitGoal = () => {
    const w = parseFloat(goalInput);
    if (!w || w < 50 || w > 700) { setShowGoalEditor(false); return; }
    onSaveGoal?.(w);
    setGoalInput("");
    setShowGoalEditor(false);
  };
  const clearGoal = () => { onSaveGoal?.(null); setGoalInput(""); setShowGoalEditor(false); };

  return (
    <div style={S.card()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 18, letterSpacing: 1, color: t.textSub }}>
            BODY<span style={{ color: accent }}>WEIGHT</span>
          </div>
          {latest ? (
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span>Last: <span style={{ color: t.text, fontWeight: 600 }}>{latest.weight} lbs</span> · {formatDate(latest.date)}</span>
              {trend30 !== null && (
                <span style={{ color: trend30 > 0 ? "#d5a55b" : trend30 < 0 ? "#5bb85b" : t.textMuted, fontWeight: 700 }}>
                  {trend30 > 0 ? "▲" : trend30 < 0 ? "▼" : "—"} {Math.abs(trend30).toFixed(1)} lbs / 30d
                </span>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>Not logged yet — add your first entry below</div>
          )}
        </div>
        {alreadyToday && <div style={{ fontSize: 12, color: "#5bb85b", fontWeight: 700, flexShrink: 0 }}>✓ Today</div>}
      </div>

      {/* Goal display / editor */}
      {onSaveGoal && (
        <div style={{ marginBottom: 14, padding: "10px 12px", background: goalMet ? "rgba(91,184,91,0.08)" : `${accent}0a`, border: `1px solid ${goalMet ? "rgba(91,184,91,0.3)" : accent + "26"}`, borderRadius: 10 }}>
          {showGoalEditor ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="number" inputMode="decimal" placeholder="Goal (lbs)" value={goalInput} onFocus={e => e.target.select()} onChange={e => setGoalInput(e.target.value)} onKeyDown={e => e.key === "Enter" && submitGoal()} style={{ ...S.inputStyle({ flex: 1, padding: "9px 12px", fontSize: 14, width: "auto" }) }} />
              <button onClick={submitGoal} style={{ background: accent, border: "none", color: "#fff", borderRadius: 8, padding: "9px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save</button>
              {goalWeight && <button onClick={clearGoal} style={{ background: "transparent", border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 8, padding: "9px 10px", fontSize: 12, cursor: "pointer" }}>Clear</button>}
              <button onClick={() => setShowGoalEditor(false)} style={{ background: "transparent", border: "none", color: t.textMuted, cursor: "pointer", padding: 6, display: "flex" }}><Icon name="x" size={14} /></button>
            </div>
          ) : goalWeight ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>Goal</div>
                <div style={{ fontSize: 14, color: t.text, fontWeight: 600 }}>
                  {goalWeight} lbs
                  {goalDelta !== null && (
                    goalMet ? <span style={{ color: "#5bb85b", fontSize: 12, marginLeft: 6 }}>✓ Met your goal</span>
                    : <span style={{ color: t.textMuted, fontSize: 12, marginLeft: 6 }}>
                        · {Math.abs(goalDelta).toFixed(1)} lbs {goalDelta > 0 ? "to lose" : "to gain"}
                      </span>
                  )}
                </div>
              </div>
              <button onClick={() => { setShowGoalEditor(true); setGoalInput(String(goalWeight)); }} style={{ background: "transparent", border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 8, padding: "5px 10px", fontSize: 11, cursor: "pointer", flexShrink: 0 }}>Edit</button>
            </div>
          ) : (
            <button onClick={() => { setShowGoalEditor(true); setGoalInput(latest ? String(latest.weight) : ""); }} style={{ background: "transparent", border: "none", color: accent, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
              + Set a goal weight
            </button>
          )}
        </div>
      )}

      {/* Today quick-add */}
      {!alreadyToday && (
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input
            type="number" inputMode="decimal" placeholder="Enter weight (lbs)"
            value={input} onChange={e => setInput(e.target.value)} onFocus={e => e.target.select()}
            onKeyDown={e => e.key === "Enter" && submit()}
            style={{ ...S.inputStyle({ flex: 1, width: "auto" }) }}
          />
          <button onClick={submit} style={{ ...S.solidBtn(), padding: "12px 18px", fontSize: 13, borderRadius: 12, minHeight: 44, touchAction: "manipulation" }}>Save</button>
        </div>
      )}

      {/* Past-date entry */}
      <div style={{ marginBottom: chartPoints.length ? 14 : 0 }}>
        {!showPastEntry ? (
          <button onClick={() => setShowPastEntry(true)} style={{ background: "transparent", border: "none", color: accent, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}>
            + Add past entry
          </button>
        ) : (
          <div style={{ padding: "10px 12px", background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 10 }}>
            <div style={{ fontSize: 10, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, marginBottom: 8 }}>Log a Past Weigh-in</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="date" value={pastDate} onChange={e => setPastDate(e.target.value)} max={today} style={{ ...S.inputStyle({ padding: "9px 10px", fontSize: 13, width: "auto", flex: 1 }), colorScheme: "dark" }} />
              <input type="number" inputMode="decimal" placeholder="lbs" value={pastWeight} onFocus={e => e.target.select()} onChange={e => setPastWeight(e.target.value)} style={{ ...S.inputStyle({ padding: "9px 10px", fontSize: 13, width: 80 }) }} />
              <button onClick={submitPast} style={{ background: accent, border: "none", color: "#fff", borderRadius: 8, padding: "9px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Add</button>
              <button onClick={() => { setShowPastEntry(false); setPastDate(""); setPastWeight(""); }} style={{ background: "transparent", border: "none", color: t.textMuted, cursor: "pointer", padding: 6, display: "flex" }}><Icon name="x" size={14} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Chart range picker */}
      {sorted.length > 0 && (
        <div style={{ display: "flex", gap: 4, marginBottom: 10, background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 10, padding: 3 }}>
          {[
            { id: "30d", label: "30D" },
            { id: "90d", label: "90D" },
            { id: "1y",  label: "1Y" },
            { id: "all", label: "All" },
          ].map(r => {
            const active = range === r.id;
            return (
              <button key={r.id} onClick={() => setRange(r.id)} style={{ flex: 1, background: active ? accent : "transparent", color: active ? "#fff" : t.textMuted, border: "none", borderRadius: 7, padding: "6px 0", fontSize: 11, fontWeight: 700, cursor: "pointer", touchAction: "manipulation" }}>{r.label}</button>
            );
          })}
        </div>
      )}

      {chartPoints.length > 0 && (
        <DualLineChart points={chartPoints} lineColor="#5bb85b" />
      )}
      {sorted.length > 0 && chartPoints.length === 0 && (
        <div style={{ color: t.textMuted, fontSize: 12, textAlign: "center", padding: "16px 0" }}>
          No entries in this range — pick a wider range to see your chart.
        </div>
      )}
      {sorted.length === 0 && (
        <div style={{ color: t.textMuted, fontSize: 13, textAlign: "center", padding: "12px 0" }}>
          Log your first weigh-in above to start tracking
        </div>
      )}
    </div>
  );
}

// ── Muscle Group Breakdown ────────────────────────────────────────────
const MUSCLE_KEYWORDS = [
  { group: "Chest",      color: "#d55b5b", icon: "💪", keys: ["bench", "chest", "fly", "flye", "pec", "push up", "pushup", "dip"] },
  { group: "Back",       color: "#5B9BD5", icon: "🏋️", keys: ["row", "pulldown", "pull-up", "pullup", "chin", "deadlift", "lat ", "t-bar", "rack pull", "shrug"] },
  { group: "Shoulders",  color: "#A8C8E8", icon: "🔝", keys: ["shoulder", "press", "lateral", "front raise", "rear delt", "face pull", "overhead", "ohp", "arnold", "upright row"] },
  { group: "Legs",       color: "#5bb85b", icon: "🦵", keys: ["squat", "leg ", "lunge", "hamstring", "quad", "calf", "glute", "hip thrust", "rdl", "romanian", "hack squat", "leg press", "step up", "sumo"] },
  { group: "Biceps",     color: "#b55bd5", icon: "💪", keys: ["curl", "bicep", "hammer", "preacher", "concentration"] },
  { group: "Triceps",    color: "#d5a55b", icon: "💪", keys: ["tricep", "extension", "pushdown", "skull", "close grip", "overhead tri"] },
  { group: "Core",       color: "#ff9500", icon: "🔥", keys: ["ab ", "abs", "core", "plank", "crunch", "sit up", "situp", "oblique", "hanging", "cable crunch", "russian twist"] },
  { group: "Cardio",     color: "#5bd5d5", icon: "🏃", keys: ["run", "bike", "row machine", "elliptical", "cardio", "treadmill", "jump"] },
];

function getMuscleGroup(exerciseName) {
  const lower = exerciseName.toLowerCase();
  // Shoulders before chest/back to catch "overhead press"
  for (const mg of MUSCLE_KEYWORDS) {
    if (mg.keys.some(k => lower.includes(k))) return mg;
  }
  return null;
}

function MuscleBreakdown({ workouts }) {
  const t = useT();
  const [range, setRange] = useState("week");

  const now = new Date();
  const cutoff = new Date(now);
  if (range === "week") cutoff.setDate(now.getDate() - 7);
  else if (range === "month") cutoff.setDate(now.getDate() - 30);
  else cutoff.setFullYear(now.getFullYear() - 1);

  const recent = workouts.filter(w => new Date(w.date) >= cutoff);
  const counts = {};
  recent.forEach(w => {
    w.exercises.forEach(ex => {
      const mg = getMuscleGroup(ex.name);
      if (mg) {
        counts[mg.group] = counts[mg.group] || { ...mg, sets: 0, sessions: new Set() };
        counts[mg.group].sets += ex.sets.length;
        counts[mg.group].sessions.add(w.date);
      }
    });
  });

  const groups = Object.values(counts).sort((a, b) => b.sets - a.sets);
  if (!groups.length) return null;

  const maxSets = Math.max(...groups.map(g => g.sets));

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ borderTop: `1px solid ${t.border}`, margin: "0 0 18px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 20, letterSpacing: 1, color: t.textSub }}>MUSCLE GROUPS</div>
        <div style={{ display: "flex", background: t.surfaceHigh, borderRadius: 8, padding: 2, gap: 2 }}>
          {[["week","7D"],["month","30D"],["year","1Y"]].map(([val, label]) => (
            <button key={val} onClick={() => setRange(val)} style={{ background: range === val ? accent : "transparent", color: range === val ? "#fff" : t.textMuted, border: "none", borderRadius: 6, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 44, touchAction: "manipulation", transition: "all 0.2s" }}>{label}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {groups.map(g => (
          <div key={g.group} style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 12, padding: "10px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>{g.icon}</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: t.text }}>{g.group}</span>
              </div>
              <div style={{ fontSize: 12, color: t.textMuted }}>{g.sets} sets · {g.sessions.size} session{g.sessions.size !== 1 ? "s" : ""}</div>
            </div>
            <div style={{ height: 6, background: t.border, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round((g.sets / maxSets) * 100)}%`, background: g.color, borderRadius: 3, transition: "width 0.6s ease" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Big 3 PRs ─────────────────────────────────────────────────────────
const DEFAULT_BIG3 = ["Barbell Bench Press", "Barbell Back Squat", "Conventional Deadlift"];

function slotCfg(name) {
  const ex = GYM_BIBLE.find(e => e.name === name);
  const color = ex ? (CAT_COLORS[ex.cat] || accent) : accent;
  // Build a short 2-letter badge: skip common filler words, take initials
  const skipWords = new Set(["Barbell","Dumbbell","Cable","Machine","Smith","Seated","Standing","Lying","Romanian","Single","Arm","Close","Wide","High","Low","Over","Under","Parallel","Assisted","Resistance"]);
  const meaningful = name.split(" ").filter(w => w.length > 1 && !skipWords.has(w));
  const label = meaningful.length >= 2
    ? (meaningful[0][0] + meaningful[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return { label, color, borderColor: color + "33", bgColor: color + "14" };
}

function Big3PRs({ workouts, profile, onSave, onLogExercise }) {
  const t = useT();
  const big3 = (profile?.big3?.length === 3) ? profile.big3 : DEFAULT_BIG3;

  const [editing, setEditing]       = useState(false);
  const [draft, setDraft]           = useState(big3);
  const [activeSlot, setActiveSlot] = useState(null);
  const [slotSearch, setSlotSearch] = useState("");

  // Keep draft in sync if profile changes from outside
  const startEdit = () => { setDraft(big3); setEditing(true); setActiveSlot(null); setSlotSearch(""); };
  const cancelEdit = () => { setEditing(false); setActiveSlot(null); setSlotSearch(""); };
  const saveEdit  = () => { onSave(draft); setEditing(false); setActiveSlot(null); setSlotSearch(""); };

  const openSlot  = (i) => { setActiveSlot(i); setSlotSearch(""); };
  const pickEx    = (name) => {
    const next = [...draft]; next[activeSlot] = name; setDraft(next);
    setActiveSlot(null); setSlotSearch("");
  };

  const getPR   = (name) => {
    const ws = workouts.flatMap(w => w.exercises.filter(e => e.name === name).flatMap(e => e.sets)).map(s => parseFloat(s.weight)).filter(v => !isNaN(v) && v > 0);
    return ws.length ? Math.max(...ws) : null;
  };
  const getDate = (name) => { const w = workouts.find(w => w.exercises.some(e => e.name === name)); return w ? formatDate(w.date) : null; };
  const prs     = big3.map(name => ({ name, pr: getPR(name), date: getDate(name) }));
  const maxPR   = Math.max(...prs.map(p => p.pr || 0));

  // Slot-search results: filter GYM_BIBLE + any custom logged exercises
  const allNames = [...new Set([...GYM_BIBLE.map(e => e.name), ...workouts.flatMap(w => w.exercises.map(e => e.name))])];
  const slotResults = slotSearch.trim()
    ? allNames.filter(n => n.toLowerCase().includes(slotSearch.toLowerCase())).slice(0, 30)
    : allNames.slice(0, 30);

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Icon name="trophy" size={17} />
        <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 20, letterSpacing: 1.5, flex: 1 }}>MY TOP LIFTS</span>
        {!editing
          ? <button onClick={startEdit} style={pillBtn(t)}>Edit</button>
          : <div style={{ display: "flex", gap: 8 }}>
              <button onClick={cancelEdit} style={pillBtn(t)}>Cancel</button>
              <button onClick={saveEdit}   style={pillBtnPrimary()}>Save</button>
            </div>
        }
      </div>

      {/* Edit mode */}
      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {draft.map((name, i) => {
            const c = slotCfg(name);
            return (
              <div key={i}>
                {/* Slot row */}
                <div
                  onClick={() => activeSlot === i ? setActiveSlot(null) : openSlot(i)}
                  style={{ background: activeSlot === i ? `${accent}11` : t.surface, border: `1px solid ${activeSlot === i ? accent : t.border}`, borderRadius: activeSlot === i ? "12px 12px 0 0" : 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", touchAction: "manipulation", transition: "all 0.15s" }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: `${c.color}20`, border: `1px solid ${c.color}50`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Bebas Neue', cursive", fontSize: 14, letterSpacing: 1, color: c.color, flexShrink: 0 }}>{c.label}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 1 }}>LIFT {i + 1}</div>
                    <div style={{ fontSize: 14, color: t.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                  </div>
                  <Icon name={activeSlot === i ? "chevron-up" : "chevron-down"} size={14} color={t.textMuted} />
                </div>

                {/* Inline search + picker for this slot */}
                {activeSlot === i && (
                  <div style={{ border: `1px solid ${accent}`, borderTop: "none", borderRadius: "0 0 12px 12px", background: t.surface, overflow: "hidden" }}>
                    <div style={{ padding: "10px 12px 8px" }}>
                      <input
                        autoFocus
                        value={slotSearch}
                        onChange={e => setSlotSearch(e.target.value)}
                        placeholder="Search exercises…"
                        style={{ width: "100%", background: t.surfaceHigh || t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, color: t.text, outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                    <div style={{ maxHeight: 200, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
                      {slotResults.map(n => {
                        const sc = slotCfg(n);
                        return (
                          <button key={n} onClick={() => pickEx(n)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: n === name ? `${accent}15` : "transparent", border: "none", borderBottom: `1px solid ${t.border}`, color: t.text, textAlign: "left", padding: "10px 14px", cursor: "pointer", fontSize: 14, touchAction: "manipulation", minHeight: 44 }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: sc.color, flexShrink: 0 }} />
                            <span style={{ flex: 1 }}>{n}</span>
                            {n === name && <Icon name="check" size={13} color={accent} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Normal PR display */
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {prs.map(({ name, pr, date }) => {
            const c = slotCfg(name); const isTop = pr && pr === maxPR;
            const canLog = !pr && onLogExercise;
            return (
              <div key={name} onClick={canLog ? () => onLogExercise(name) : undefined} role={canLog ? "button" : undefined} style={{ background: c.bgColor, border: `1px solid ${pr ? c.borderColor : t.border}`, borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, position: "relative", overflow: "hidden", cursor: canLog ? "pointer" : "default", transition: "transform 0.1s" }}>
                {pr && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: c.color, borderRadius: "14px 0 0 14px" }} />}
                <div style={{ width: 46, height: 46, borderRadius: 12, background: `${c.color}18`, border: `1px solid ${c.color}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "'Bebas Neue', cursive", fontSize: 15, letterSpacing: 1, color: c.color }}>{c.label}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                  {pr
                    ? <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}><span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 32, letterSpacing: 1, color: c.color, lineHeight: 1 }}>{pr}</span><span style={{ color: t.textMuted, fontSize: 14 }}>lbs</span></div>
                    : <div style={{ color: canLog ? accent : t.textMuted, fontSize: 13, marginTop: 2, fontWeight: canLog ? 600 : 400 }}>{canLog ? "Tap to log →" : "Not logged yet"}</div>
                  }
                  {date && <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>Last: {date}</div>}
                </div>
                {pr && (
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <div style={{ fontSize: 20, marginBottom: 2 }}>👑</div>
                    <div style={{ background: isTop ? accent : t.surfaceHov, color: isTop ? "#ffffff" : t.textMuted, borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>{isTop ? "TOP PR" : "PR"}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Set Row ───────────────────────────────────────────────────────────
function SetRow({ set, index, onChange, onRemove, effortMetric = "rpe", onFirstFocus, onMarkDone }) {
  const t = useT(); const S = useS();
  const [showRpe, setShowRpe] = useState(false);
  // Focus-to-start fires once per set-row lifecycle when the user taps any input on
  // any set (empty or pre-filled). Signals the parent to kick the rest timer if it's
  // idle. Captures the "user just walked back from lifting" moment regardless of
  // whether the row was a fresh empty fill, a pre-loaded template entry, or an edit
  // of a previously-logged value. Tabbing through fields on the same row only fires
  // once. The parent's handler uses gt-start-timer-if-idle, so a running timer is
  // never disrupted (preload-during-rest stays safe).
  const firstFocusFiredRef = useRef(false);
  const handleFirstFocus = () => {
    if (firstFocusFiredRef.current) return;
    firstFocusFiredRef.current = true;
    onFirstFocus?.();
  };
  // Note: a per-set `toggleDone` helper used to live here, called by an inline ✓
  // button at the end of the row. That UI is gone (#228) — completion is now
  // gestural (hold or swipe-right) and un-marking happens by tapping the green
  // ✓ pill that replaces the type indicator when set.done is true. Both code
  // paths handle done-flipping inline where they need it, so no shared helper
  // is required anymore.
  // Fix #97: per-set type indicator. Default "working" sets render exactly like before
  // (just the set number, no visual chrome) — sleek for the 90%+ case. Warmup and
  // dropset show a small colored pill with "W" or "D" in place of the number. Tap
  // cycles the type: working → warmup → dropset → working. The chip-as-set-number
  // pattern avoids adding another control to the already-busy row.
  const setType = isValidSetType(set.type) ? set.type : "working";
  const cycleSetType = () => {
    const next = setType === "working" ? "warmup" : setType === "warmup" ? "dropset" : "working";
    onChange({ ...set, type: next });
    haptic(8);
  };
  const typeColor = setType === "warmup" ? "#E8B547" : setType === "dropset" ? "#FF7849" : t.textMuted;
  const typeLabel = setType === "warmup" ? "W" : setType === "dropset" ? "D" : (index + 1).toString();
  const rpe = set.rpe != null ? parseFloat(set.rpe) : null;
  const rir = set.rir != null ? parseFloat(set.rir) : (rpe != null ? Math.round(10 - rpe) : null);
  const hasRpe = rpe != null;

  // Fix #106: auto-collapse RPE panel ~3.8s after the last value change so the row stays
  // compact once the user has logged effort. Each rpe/rir change restarts the timer, so
  // continuous adjustments keep the panel open. Initial open with no value yet stays
  // open until the user picks something. Tapping the chip still manually toggles. Future
  // enhancement: skip auto-collapse during fast-paced sessions (drop sets / supersets) —
  // defer until we have user signal that the default timing is too aggressive.
  useEffect(() => {
    if (!showRpe) return;
    if (rpe == null && rir == null) return;
    const id = setTimeout(() => setShowRpe(false), 3800);
    return () => clearTimeout(id);
  }, [showRpe, set.rpe, set.rir]); // eslint-disable-line react-hooks/exhaustive-deps
  // Fix #82: respect user's preferred effort metric for the chip label
  const chipValue = effortMetric === "rir"
    ? (rir != null ? rir : null)
    : rpe;
  const hasChip = chipValue != null;
  const chipLabel = effortMetric === "rir"
    ? (hasChip ? `${chipValue} RIR` : "RIR")
    : (hasChip ? `@${chipValue % 1 === 0 ? chipValue : chipValue.toFixed(1)}` : "RPE");

  const toneColor = rpe == null ? t.textMuted
    : rpe >= 9.5 ? "#d55b5b"
    : rpe >= 8.5 ? "#ff9500"
    : "#5bb85b";

  // Fix #97 (Brian feedback): full-row opacity tint, no gradient. The whole row
  // says "this is a warmup" or "this is a drop set" at a glance. Amber = warmup,
  // orange = drop set; the color IS the legend (paired with the W/D character).
  // Working sets keep the flat surfaceHigh — no chrome, sleek default.
  // Opacity tuned so the inputs / RPE chip remain readable on top of the tint.
  const rowBg = setType === "warmup"
    ? `${typeColor}1a`        // amber wash ~10%
    : setType === "dropset"
      ? `${typeColor}24`      // orange wash ~14% (a touch more saturated since
                              // drop sets ARE training stimulus, not prep)
      : t.surfaceHigh;

  // #228 — Hold-to-confirm gesture. The user long-presses anywhere on the row
  // (away from interactive elements like inputs / pill / RPE chip), the row
  // fills green from left to right over HOLD_DURATION_MS, and at full fill we
  // mark the set done with a satisfying haptic pop. Movement >= HOLD_CANCEL_PX
  // cancels the gesture so swipe gestures still take priority for swipe-delete /
  // swipe-complete.
  const HOLD_DURATION_MS = 520;
  const HOLD_CANCEL_PX = 10;
  const [holdProgress, setHoldProgress] = useState(0);
  const holdRafRef = useRef(null);
  const holdStartTsRef = useRef(0);
  const holdStartPosRef = useRef({ x: 0, y: 0 });
  const holdDoneRef = useRef(false);
  const cancelHold = () => {
    if (holdRafRef.current) cancelAnimationFrame(holdRafRef.current);
    holdRafRef.current = null;
    holdStartTsRef.current = 0;
    holdDoneRef.current = false;
    setHoldProgress(0);
  };
  const isInteractiveTarget = (target) => {
    if (!target || !target.closest) return false;
    return !!target.closest('input, textarea, button, select, [role="button"]');
  };
  const startHold = (clientX, clientY, target) => {
    if (set.done) return;                  // already done — long-press would do nothing
    if (isInteractiveTarget(target)) return; // don't fight inputs / chips / pills
    holdStartTsRef.current = Date.now();
    holdStartPosRef.current = { x: clientX, y: clientY };
    holdDoneRef.current = false;
    const tick = () => {
      const elapsed = Date.now() - holdStartTsRef.current;
      const p = Math.min(elapsed / HOLD_DURATION_MS, 1);
      setHoldProgress(p);
      if (p >= 1 && !holdDoneRef.current) {
        holdDoneRef.current = true;
        onChange({ ...set, done: true });
        haptic([0, 60, 30, 90]);
        onMarkDone?.(set.type);
        // Brief pause at full so the user sees the bar finish, then reset.
        setTimeout(() => { setHoldProgress(0); }, 180);
        return;
      }
      holdRafRef.current = requestAnimationFrame(tick);
    };
    holdRafRef.current = requestAnimationFrame(tick);
  };
  const moveHold = (clientX, clientY) => {
    if (!holdStartTsRef.current) return;
    const dx = clientX - holdStartPosRef.current.x;
    const dy = clientY - holdStartPosRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > HOLD_CANCEL_PX) cancelHold();
  };
  return (
    <div style={{ marginBottom: 8 }}>
      <SwipeableRow flat onDelete={onRemove} bgColor={rowBg} onComplete={() => { if (!set.done) { onChange({ ...set, done: true }); haptic([0, 60, 30, 90]); onMarkDone?.(set.type); } }}>
        {/* #228 — gestural completion layer. The hold-to-confirm handlers attach
            here so they fire on the row body but not on interactive children
            (inputs / chips / pill — `isInteractiveTarget` filters those). The
            green progress fill is an absolute overlay behind the row content
            that grows left-to-right as the user holds.

            When `set.done` is true we add an inset 3px green left-edge accent
            and dim the row to ~85% opacity — the iOS "this item is settled"
            visual language. */}
        <div
          onTouchStart={(e) => { const t0 = e.touches[0]; startHold(t0.clientX, t0.clientY, e.target); }}
          onTouchMove={(e) => { const t0 = e.touches[0]; moveHold(t0.clientX, t0.clientY); }}
          onTouchEnd={cancelHold}
          onTouchCancel={cancelHold}
          onMouseDown={(e) => startHold(e.clientX, e.clientY, e.target)}
          onMouseMove={(e) => { if (holdStartTsRef.current) moveHold(e.clientX, e.clientY); }}
          onMouseUp={cancelHold}
          onMouseLeave={cancelHold}
          style={{
            position: "relative",
            boxShadow: set.done ? "inset 3px 0 0 #5bb85b" : "none",
            opacity: set.done ? 0.86 : 1,
            transition: "opacity 0.3s, box-shadow 0.3s",
          }}
        >
          {/* Hold-to-confirm green fill — grows from left to right behind the row content */}
          {holdProgress > 0 && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 0, top: 0, bottom: 0,
                width: `${holdProgress * 100}%`,
                background: "linear-gradient(90deg, rgba(91,184,91,0.32) 0%, rgba(91,184,91,0.14) 100%)",
                pointerEvents: "none",
                zIndex: 0,
                transition: "none",
              }}
            />
          )}
        <div style={{ display: "flex", gap: 6, alignItems: "center", position: "relative", zIndex: 1 }}>
          {/* Fix #97: clickable type indicator. Cycles working → warmup → dropset.
              For working sets it looks identical to the previous static index number.
              touch events are stopped from bubbling so the SwipeableRow's gesture
              detector doesn't mistake a tap-and-twitch on the indicator for a swipe
              and leave the trash reveal partially open.

              #228: when `set.done` the pill becomes a green ✓ and tapping it
              un-marks (toggling done off) — the same surface, two roles. */}
          <button
            onClick={set.done ? () => { onChange({ ...set, done: false }); haptic(8); } : cycleSetType}
            onTouchStart={e => e.stopPropagation()}
            onTouchMove={e => e.stopPropagation()}
            onTouchEnd={e => e.stopPropagation()}
            aria-label={set.done ? `Unmark set ${index + 1}` : `Set ${index + 1} type: ${setType}. Tap to change.`}
            style={{
              // Apple opacity recipe: ${color}1f fill + ${color}66 border + 1px white
              // inner highlight on the top edge to catch light. Working set stays
              // chromeless (just the muted number) so it reads as default.
              // When set.done = true the pill flips to a solid Steel-meets-Green ✓
              // glyph and acts as the un-mark control.
              width: 28, height: 28, padding: 0,
              background: set.done
                ? "linear-gradient(135deg, #5bb85b, #3a8a3a)"
                : setType === "working" ? "transparent" : `${typeColor}1f`,
              border: set.done
                ? "1px solid rgba(91,184,91,0.7)"
                : setType === "working" ? "none" : `1px solid ${typeColor}66`,
              boxShadow: set.done
                ? "inset 0 1px 0 rgba(255,255,255,0.18), 0 2px 10px rgba(91,184,91,0.28)"
                : setType === "working" ? "none" : "inset 0 1px 0 rgba(255,255,255,0.08)",
              borderRadius: 8,
              color: set.done ? "#fff" : typeColor,
              fontSize: 13,
              fontWeight: setType === "working" && !set.done ? 400 : 800,
              letterSpacing: setType === "working" && !set.done ? 0 : 0.4,
              cursor: "pointer",
              flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              touchAction: "manipulation",
              transition: "background 0.22s, border-color 0.22s, color 0.22s, box-shadow 0.22s",
            }}
          >
            {set.done ? <Icon name="check" size={14} /> : typeLabel}
          </button>
          <input type="number" inputMode="decimal" enterKeyHint="next" placeholder="lbs" value={set.weight} onFocus={e => { e.target.select(); handleFirstFocus(); }} onChange={e => onChange({ ...set, weight: e.target.value })} style={S.inputStyle({ width: 72, padding: "11px 10px" })} />
          <span style={{ color: t.textMuted, fontSize: 13, flexShrink: 0 }}>×</span>
          <input type="number" inputMode="numeric" enterKeyHint="done" placeholder="reps" value={set.reps} onFocus={e => { e.target.select(); handleFirstFocus(); }} onChange={e => onChange({ ...set, reps: e.target.value })} style={S.inputStyle({ width: 60, padding: "11px 10px" })} />
          {/* RPE chip — Apple polish: opacity recipe, no chevron, tone-colored text.
              When empty: ghost — `RPE` in muted, near-invisible border. When set:
              tone-tinted bg + top inner highlight + bold tone-colored value. The
              tap-to-expand behavior is unchanged; the chevron arrow was visual noise
              for a state that's already obvious from the value being there. */}
          <button
            onClick={() => { setShowRpe(v => !v); haptic(8); }}
            style={{
              background: hasChip ? `${toneColor}1f` : "rgba(255,255,255,0.04)",
              border: `1px solid ${hasChip ? `${toneColor}66` : "rgba(255,255,255,0.08)"}`,
              boxShadow: hasChip ? "inset 0 1px 0 rgba(255,255,255,0.08)" : "none",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 12, fontWeight: 700,
              color: hasChip ? toneColor : t.textMuted,
              cursor: "pointer",
              whiteSpace: "nowrap", flexShrink: 0, minHeight: 44, touchAction: "manipulation",
              transition: "background 0.18s, border-color 0.18s, color 0.18s, box-shadow 0.18s",
              display: "inline-flex", alignItems: "center", gap: 4,
              letterSpacing: 0.3,
            }}
          >
            {chipLabel}
          </button>
          {/* Inline ✓ button removed in favor of gestural completion (#228 pass 2):
                - Hold anywhere on the row to confirm (green fills the row → tap)
                - OR swipe right to reveal a green ✓ panel
              When set.done = true, the set-number pill itself becomes the green ✓
              (and tapping it un-marks). The row is now button-free for a clean,
              futuristic logging surface — Apple Lock Screen / Watch language. */}
          <div style={{ marginLeft: "auto", flexShrink: 0, width: 4 }} />
        </div>
        </div>{/* close hold-to-confirm wrapper */}
      </SwipeableRow>

      {/* Expanded RPE/RIR panel */}
      {showRpe && (
        <div style={{
          marginTop: 8, marginLeft: 30, background: t.surfaceHigh,
          border: `1px solid ${t.border}`, borderRadius: 12, padding: "14px 16px",
        }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: 0.5 }}>RPE — Rate of Perceived Exertion</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: toneColor }}>{rpe != null ? rpe : "—"}</span>
            </div>
            <input
              type="range" min="6" max="10" step="0.5"
              value={rpe ?? 7}
              onChange={e => {
                const v = parseFloat(e.target.value);
                onChange({ ...set, rpe: v, rir: set.rir != null ? set.rir : Math.round(10 - v) });
              }}
              style={{ width: "100%", accentColor: toneColor, cursor: "pointer" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: t.textMuted, marginTop: 2 }}>
              <span>6 Easy</span><span>7.5 Moderate</span><span>9 Hard</span><span>10 Max</span>
            </div>
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: 0.5 }}>RIR — Reps in Reserve</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: accent }}>{rir != null ? rir : "—"}</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {[0, 1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => onChange({ ...set, rir: n, rpe: set.rpe != null ? set.rpe : Math.max(6, 10 - n) })}
                  style={{
                    flex: 1, padding: "8px 0", fontSize: 13, fontWeight: 700, borderRadius: 8,
                    background: rir === n ? `${accent}22` : "transparent",
                    border: `1px solid ${rir === n ? accent : t.border}`,
                    color: rir === n ? accent : t.textSub,
                    cursor: "pointer", touchAction: "manipulation",
                  }}
                >{n}</button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: t.textMuted, marginTop: 4, textAlign: "center" }}>
              0 = nothing left · 3 = 3 more possible
            </div>
          </div>
          <button onClick={() => { onChange({ ...set, rpe: undefined, rir: undefined }); setShowRpe(false); }}
            style={{ marginTop: 12, background: "transparent", border: `1px solid ${t.border}`, borderRadius: 8, padding: "6px 14px", fontSize: 11, color: t.textMuted, cursor: "pointer", width: "100%", touchAction: "manipulation" }}>
            Clear RPE / RIR
          </button>
        </div>
      )}
    </div>
  );
}

// ── Exercise Block ────────────────────────────────────────────────────
function ExerciseBlock({ exercise, onChange, onRemove, workouts, effortMetric, autoStartRest = false, mode = "active", onFocus, queueIndex, triggerUndo }) {
  const S = useS();
  const t = useT();
  const [coachDismissed, setCoachDismissed] = useState(false);
  // Fix #106: collapsible Notes. Defaults to expanded if there's no note (first-time entry)
  // and collapsed if a note already exists (so the row stays compact when re-opening an
  // exercise). Tapping the collapsed pill expands + focuses the textarea; blur with
  // content collapses again.
  const [notesExpanded, setNotesExpanded] = useState(!exercise.note);
  const noteRef = useRef(null);
  // Smooth Done transition — when user taps "Done with this exercise" we play an exit
  // animation on the active card (fade + collapse) for 380ms BEFORE flipping the model
  // to done:true. Without this, the active card unmounts instantly and the done pill
  // mounts in its new position with no visual continuity. The 380ms gives the eye a
  // chance to track the transition.
  const [isFinishing, setIsFinishing] = useState(false);
  // Add Set "Just finished?" prompt — only renders for the genuinely ambiguous case:
  // user tapped Add Set with last set complete + ✓ NOT used yet + timer already running.
  // Auto-dismisses to "No, still resting" after 6s (less destructive default).
  const [showAddSetPrompt, setShowAddSetPrompt] = useState(false);
  useEffect(() => {
    if (!showAddSetPrompt) return;
    const id = setTimeout(() => setShowAddSetPrompt(false), 6000);
    return () => clearTimeout(id);
  }, [showAddSetPrompt]);

  // "Done Exercise" — collapsed pill view when exercise.done is truthy.
  // Entrance animation (bl-done-in keyframes injected globally) slides the pill down from
  // above with a slight overshoot so it visually flows from the active card's old position
  // to its new home at the bottom of the list — replaces the instant snap.
  if (exercise.done) {
    const validSets = exercise.sets.filter(s => s.weight && s.reps);
    const topSet = validSets.reduce((best, s) => {
      if (!best) return s;
      return (parseFloat(s.weight) || 0) > (parseFloat(best.weight) || 0) ? s : best;
    }, null);
    return (
      <button
        onClick={() => { onChange({ ...exercise, done: false }); onFocus?.(); }}
        style={{
          // Apple-tier done pill: subtle green tint + inset top highlight + 3px
          // green left-edge accent. Reads as "settled" without being celebratory.
          width: "100%", textAlign: "left",
          background: "linear-gradient(to right, rgba(91,184,91,0.10), rgba(91,184,91,0.03) 60%, " + t.surfaceHigh + ")",
          border: "1px solid rgba(91,184,91,0.28)",
          borderLeft: "3px solid #5bb85b",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
          borderRadius: 12, padding: "12px 14px 12px 14px", marginBottom: 10,
          display: "flex", alignItems: "center", gap: 12, cursor: "pointer", touchAction: "manipulation",
          animation: "bl-done-in 0.85s cubic-bezier(0.22,1,0.36,1) both",
          transition: "background 0.2s, border-color 0.2s",
        }}
      >
        <span style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(91,184,91,0.18)", border: "1px solid rgba(91,184,91,0.5)", display: "flex", alignItems: "center", justifyContent: "center", color: "#5bb85b", flexShrink: 0 }}>
          <Icon name="check" size={14} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 17, letterSpacing: 0.5, color: t.text, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{exercise.name}</div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 3 }}>
            {validSets.length === 0
              ? "No sets logged · tap to edit"
              : <>{validSets.length} set{validSets.length !== 1 ? "s" : ""}{topSet ? ` · top ${topSet.weight} × ${topSet.reps}` : ""}{exercise.note ? " · 📝" : ""}</>}
          </div>
        </div>
        <span style={{ color: t.textMuted, transform: "rotate(180deg)", display: "flex", flexShrink: 0 }}><Icon name="chevronDown" size={16} /></span>
      </button>
    );
  }

  // Queued — collapsed blue pill, tap to focus and become active
  if (mode === "queued") {
    return (
      <button
        onClick={() => onFocus?.()}
        style={{
          // Apple-tier queued pill: subtle Steel-Blue tint + inset top highlight +
          // 3px accent on the left edge. Same recipe as the done pill but in
          // brand color → tells the user "this is up next".
          width: "100%", textAlign: "left",
          background: `linear-gradient(to right, ${accent}10, ${accent}03 60%, ${t.surfaceHigh})`,
          border: `1px solid ${accent}28`,
          borderLeft: `3px solid ${accent}`,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
          borderRadius: 12, padding: "12px 14px", marginBottom: 8,
          display: "flex", alignItems: "center", gap: 12, cursor: "pointer", touchAction: "manipulation",
          transition: "background 0.2s, border-color 0.2s",
        }}
      >
        <span style={{ width: 28, height: 28, borderRadius: "50%", background: `${accent}1a`, border: `1px solid ${accent}55`, display: "flex", alignItems: "center", justifyContent: "center", color: accent, fontSize: 13, fontWeight: 700, flexShrink: 0, fontFamily: "'Bebas Neue', cursive" }}>
          {queueIndex != null ? queueIndex + 1 : <Icon name="plus" size={12} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 17, letterSpacing: 0.5, color: t.text, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{exercise.name}</div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 3 }}>Up next · tap to start</div>
        </div>
        <span style={{ color: accent, display: "flex", flexShrink: 0 }}><Icon name="chevronRight" size={16} /></span>
      </button>
    );
  }

  // Add Set is intentionally smart so users with different logging styles all work:
  //   1. Preload mid-rest → user is filling next row while timer runs → don't reset
  //   2. Prep an empty row to walk away → silent reset (timer was idle/done)
  //   3. Wait → lift → Add Set → silent reset (timer expired or never started)
  //   4. ✓-using user → set.done already true → skip everything; ✓ already handled it
  // The prompt is the disambiguator for case 1 vs cases 2-3 when the timer is running
  // and ✓ wasn't used. Auto-dismisses to "No, still resting".
  const addSet = () => {
    const last = exercise.sets[exercise.sets.length - 1];
    const lastComplete = last && last.weight && last.reps;
    const lastMarkedDone = !!(last && last.done);
    if (lastComplete) {
      haptic([0, 30, 20, 30]);
      playDing();
      if (autoStartRest && !lastMarkedDone) {
        const timerActive = !!(typeof window !== "undefined" && window.__bl_timerActive);
        if (timerActive) {
          setShowAddSetPrompt(true);
        } else {
          window.dispatchEvent(new Event("gt-start-timer"));
        }
      }
    } else { haptic(10); }
    // Fix #218: every set gets a stable id at creation so React keys by identity.
    // Fix #97: inherit set.type from the previous set so warmup-then-warmup-then-working
    // doesn't require re-tagging each one. Defaults to "working" when there's no prior.
    const prevType = (last && isValidSetType(last.type)) ? last.type : "working";
    onChange({ ...exercise, sets: [...exercise.sets, { id: makeId(), type: prevType, weight: "", reps: "" }] });
  };
  // Focus-to-start trigger — fires when user taps a fresh empty set's input.
  // Uses if-idle so it never disrupts a running timer (preload mid-rest is safe).
  const handleFirstFocusOnEmpty = () => {
    if (!autoStartRest) return;
    window.dispatchEvent(new Event("gt-start-timer-if-idle"));
  };
  // Explicit per-set "I just finished this" signal. Uses if-idle so tapping ✓ during
  // an already-running rest cycle doesn't lose elapsed seconds — preserves accurate
  // 1:30-from-walk-back timing across every workflow. The Add Set prompt's "Yes, reset"
  // is the only auto path that force-resets a running timer.
  //
  // Fix #97: receives the set type from SetRow. Warmup sets ding the same as any
  // completed set (positive feedback is universal) but do NOT fire the rest-timer
  // auto-start — warmups conventionally have minimal rest, and auto-starting a 90s
  // timer between back-to-back warmup sets would be wrong. Drop sets DO fire the
  // timer because the rest period after a drop set is real working rest.
  const handleSetMarkedDone = (setType) => {
    playDing();
    if (!autoStartRest) return;
    if (setType === "warmup") return;
    window.dispatchEvent(new Event("gt-start-timer-if-idle"));
  };
  const updateSet = (i, s) => { const sets = [...exercise.sets]; sets[i] = s; onChange({ ...exercise, sets }); };
  // Fix #105: set delete is low-stakes (single set's data) but high-frequency, so just an
  // Undo toast — no modal friction. The undo restores the set at its original index using
  // the closure-captured exercise as the baseline. Trade-off: any concurrent set edits
  // during the 5s window will be reverted on undo. Acceptable for a single-row action.
  const removeSet = (i) => {
    const removed = exercise.sets[i];
    onChange({ ...exercise, sets: exercise.sets.filter((_, j) => j !== i) });
    if (triggerUndo) {
      triggerUndo("Set removed", () => {
        const next = [...exercise.sets];
        next.splice(i, 0, removed);
        onChange({ ...exercise, sets: next });
      });
    }
  };
  const markDone = () => {
    haptic([0, 30, 30, 80]);
    playDing();
    setIsFinishing(true);
    setTimeout(() => onChange({ ...exercise, done: true }), 380);
  };

  const coach = coachFor(exercise.name, workouts);

  // Apple polish: Coach cards now share the Steel Blue brand voice — the tone
  // label ("Welcome Back", "Push It", etc.) carries the semantic, the colors
  // stay cohesive. No more competing orange/red cards fighting the brand.
  // Single recipe: bg `${accent}12`, border `${accent}44`, icon `accent`.
  const coachColors = {
    intro:        { bg: `${accent}12`, border: `${accent}44`, icon: accent, label: "First Lift" },
    comeback:     { bg: `${accent}12`, border: `${accent}44`, icon: accent, label: "Welcome Back" },
    recover:      { bg: `${accent}12`, border: `${accent}44`, icon: accent, label: "Recover" },
    push:         { bg: `${accent}12`, border: `${accent}44`, icon: accent, label: "Push It" },
    breakthrough: { bg: `${accent}12`, border: `${accent}44`, icon: accent, label: "Break Through" },
    progress:     { bg: `${accent}12`, border: `${accent}44`, icon: accent, label: "Next Target" },
  };
  const cc = coach ? coachColors[coach.tone] || coachColors.progress : null;

  return (
    <div style={{
      ...S.card(),
      animation: isFinishing ? "bl-finishing 0.38s cubic-bezier(0.4,0,0.2,1) forwards" : undefined,
      pointerEvents: isFinishing ? "none" : "auto",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 20, letterSpacing: 1, color: accent }}>{exercise.name}</span>
        <button onClick={onRemove} style={S.iconBtn("#ff5b5b")}><Icon name="trash" size={15} /></button>
      </div>

      {/* Coach card — Apple polish: opacity recipe with inset top highlight for depth */}
      {coach && !coachDismissed && (
        <div style={{
          background: cc.bg, border: `1px solid ${cc.border}`, borderRadius: 14,
          padding: "13px 16px", marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 11,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
        }}>
          <div style={{ color: cc.icon, flexShrink: 0, marginTop: 1 }}><Icon name="zap" size={15} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: cc.icon, letterSpacing: 0.8, marginBottom: 3, textTransform: "uppercase" }}>
              Coach · {cc.label}
            </div>
            <div style={{ fontSize: 13, color: t.textSub, lineHeight: 1.5 }}>{coach.message}</div>
            {coach.target && (
              <div style={{ marginTop: 7, display: "flex", gap: 6 }}>
                <button
                  onClick={() => {
                    // Apply the Coach suggestion. Fix #218 + #97: stamp id + type on
                    // any set we create or fill so the new set joins the React tree
                    // with stable identity and explicit working-set semantics.
                    if (!exercise.sets.some(s => !s.weight && !s.reps)) {
                      onChange({ ...exercise, sets: [...exercise.sets, { id: makeId(), type: "working", weight: String(coach.target.weight), reps: String(coach.target.reps) }] });
                    } else {
                      const sets = exercise.sets.map(s => (!s.weight && !s.reps)
                        ? { ...s, id: s.id || makeId(), type: isValidSetType(s.type) ? s.type : "working", weight: String(coach.target.weight), reps: String(coach.target.reps) }
                        : s);
                      onChange({ ...exercise, sets });
                    }
                    setCoachDismissed(true);
                    haptic([10, 30, 10]);
                  }}
                  style={{
                    // Apple polish: Steel Blue gradient + soft glow, matches solidBtn / Add Exercise.
                    background: `linear-gradient(135deg, ${accent}, #4A8BC4)`,
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "11px 16px", fontSize: 13, fontWeight: 700,
                    cursor: "pointer", touchAction: "manipulation", minHeight: 44,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 2px 12px ${accentGlow}`,
                  }}
                >Apply {coach.target.weight} × {coach.target.reps}</button>
                <button onClick={() => setCoachDismissed(true)}
                  // Apple polish: ghost button — text-only with subtle press background.
                  style={{ background: "transparent", border: "none", borderRadius: 10, padding: "11px 14px", fontSize: 13, color: t.textMuted, cursor: "pointer", touchAction: "manipulation", minHeight: 44, fontWeight: 600 }}>
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        {exercise.sets.map((s, i) => <SetRow key={s.id || `legacy-${i}`} set={s} index={i} onChange={s => updateSet(i, s)} onRemove={() => removeSet(i)} effortMetric={effortMetric} onFirstFocus={handleFirstFocusOnEmpty} onMarkDone={handleSetMarkedDone} />)}
      </div>
      <button onClick={addSet} style={S.ghostBtn()}><Icon name="plus" size={14} /> Add Set</button>
      {/* "Just finished?" prompt — only the genuinely ambiguous case: timer running +
          last set complete + ✓ not used. Tapping ✓ in the future skips this entirely. */}
      {showAddSetPrompt && (
        <div style={{ marginTop: 10, background: t.surfaceHigh, border: `1px solid ${accent}55`, borderLeft: `3px solid ${accent}`, borderRadius: 12, padding: "12px 14px", animation: "bl-card-in 0.32s cubic-bezier(0.16,1,0.3,1) both" }}>
          <div style={{ fontSize: 12, color: t.textSub, fontWeight: 600, marginBottom: 2 }}>Did you just finish another set?</div>
          <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 10, lineHeight: 1.4 }}>The timer is already running. Tip: tap the ✓ next to a set to skip this prompt.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => { window.dispatchEvent(new Event("gt-start-timer")); setShowAddSetPrompt(false); }}
              style={{ flex: 1, background: accent, color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", touchAction: "manipulation", minHeight: 40 }}
            >Yes, reset</button>
            <button
              onClick={() => setShowAddSetPrompt(false)}
              style={{ flex: 1, background: "transparent", color: t.textSub, border: `1px solid ${t.border}`, borderRadius: 8, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", touchAction: "manipulation", minHeight: 40 }}
            >No, still resting</button>
          </div>
        </div>
      )}
      {/* Fix #106: Notes — collapsed pill when content exists and not focused; full textarea when expanded. */}
      {(() => {
        const noteText = exercise.note || "";
        const showCollapsed = !notesExpanded && noteText.trim().length > 0;
        if (showCollapsed) {
          const lineCount = noteText.split("\n").filter(l => l.trim().length > 0).length || 1;
          const summary = lineCount > 1
            ? `Notes (${lineCount} lines)`
            : (noteText.length > 36 ? noteText.substring(0, 33).trim() + "…" : noteText);
          return (
            <button
              onClick={() => { setNotesExpanded(true); setTimeout(() => noteRef.current?.focus(), 0); }}
              style={{ marginTop: 10, width: "100%", background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 12, color: t.textSub, padding: "10px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit", touchAction: "manipulation" }}
              aria-label="Expand notes"
            >
              <span style={{ flexShrink: 0 }}>📝</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</span>
              <span style={{ color: t.textMuted, fontSize: 12, flexShrink: 0 }}>▸</span>
            </button>
          );
        }
        return (
          <textarea
            ref={noteRef}
            value={noteText}
            onChange={e => onChange({ ...exercise, note: e.target.value })}
            onBlur={() => { if (noteText.trim().length > 0) setNotesExpanded(false); }}
            placeholder="Notes (how it felt, reminders…)"
            rows={1}
            style={{ marginTop: 10, width: "100%", background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 12, color: t.text, padding: "12px 14px", fontSize: 14, outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box", lineHeight: 1.6 }}
            onInput={e => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
          />
        );
      })()}
      {/* Mark Done — collapses card and lets user move to next exercise */}
      <button onClick={markDone} style={{ width: "100%", marginTop: 12, background: "linear-gradient(135deg, #5bb85b, #3a8a3a)", color: "#fff", border: "none", borderRadius: 12, padding: "13px 0", fontFamily: "'Bebas Neue', cursive", fontSize: 16, letterSpacing: 1, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, touchAction: "manipulation" }}>
        <Icon name="check" size={16} /> Done with this exercise
      </button>
    </div>
  );
}

// ── History Card ──────────────────────────────────────────────────────
// ── Fix #11: Group workouts into "This Week / Last Week / Month Year" ─
function groupWorkoutsByPeriod(workouts) {
  const now = new Date();
  const startOfThisWeek = new Date(now);
  startOfThisWeek.setDate(now.getDate() - now.getDay());
  startOfThisWeek.setHours(0, 0, 0, 0);
  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);

  const map = new Map();
  const order = [];
  workouts.forEach((w, i) => {
    const d = new Date(w.date);
    d.setHours(0, 0, 0, 0);
    let key;
    if (d >= startOfThisWeek) key = "This Week";
    else if (d >= startOfLastWeek) key = "Last Week";
    else key = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key).push({ workout: w, index: i });
  });
  return order.map(label => ({
    label,
    id: "hsec-" + label.replace(/\s+/g, "-").toLowerCase(),
    items: map.get(label),
  }));
}

function WorkoutHistoryCard({ workout, index, onLabelChange, onDelete, onSaveTemplate, onReopen, customTags }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const swipeTouchX = useRef(null);
  const startOffset = useRef(0);
  const isDragging = useRef(false);
  const DELETE_W = 76;
  const REOPEN_W = 92;

  // Re-open is only meaningful within the 2-hour grace window (#223). Outside it,
  // we don't show the green reveal at all — keeps the UI honest. The right-swipe
  // gesture won't engage past 0 if there's no reopen path.
  const canReopen = !!(onReopen && workout.finishedAt && (Date.now() - workout.finishedAt) < (2 * 60 * 60 * 1000));

  const mergedLabels = allLabels(customTags);
  const activeLabels = workout.labels ? workout.labels : workout.label ? [workout.label] : [];
  const activeCfgs = activeLabels.map(id => mergedLabels.find(l => l.id === id)).filter(Boolean).map(tagRenderCfg);
  const toggleLabel = (e, id) => {
    e.stopPropagation();
    haptic(8); // #228 Pass 7: tag toggle is a meaningful state change
    let next = activeLabels.includes(id) ? activeLabels.filter(l => l !== id) : activeLabels.length >= TAG_CAP ? [...activeLabels.slice(1), id] : [...activeLabels, id];
    onLabelChange(index, next);
  };

  // #228 Pass 6: bidirectional swipe — left reveals red Delete (existing), right
  // reveals green Re-open (only when canReopen is true). Symmetric thresholds,
  // rubber-band past the reveal width, snap-to-reveal on release past the
  // half-threshold. Same gesture vocabulary as SwipeableRow on set rows.
  const onCardTouchStart = (e) => {
    swipeTouchX.current = e.touches[0].clientX;
    startOffset.current = swipeOffset;
    isDragging.current = false;
  };
  const onCardTouchMove = (e) => {
    if (swipeTouchX.current === null) return;
    const dx = e.touches[0].clientX - swipeTouchX.current;
    if (Math.abs(dx) > 8) {
      isDragging.current = true;
      e.stopPropagation();
      let next = startOffset.current + dx;
      // Allow positive offset only if Re-open is available; otherwise cap at 0.
      if (canReopen) {
        if (next > REOPEN_W) next = REOPEN_W;
      } else {
        if (next > 0) next = 0;
      }
      if (next < -DELETE_W) next = -DELETE_W;
      setSwipeOffset(next);
    }
  };
  const onCardTouchEnd = (e) => {
    if (isDragging.current) {
      e.stopPropagation();
      if (swipeOffset < -DELETE_W / 2) { setSwipeOffset(-DELETE_W); haptic(10); }
      else if (canReopen && swipeOffset > REOPEN_W / 2) { setSwipeOffset(REOPEN_W); haptic(10); }
      else setSwipeOffset(0);
    } else if (swipeOffset !== 0) {
      e.stopPropagation();
      setSwipeOffset(0);
    }
    swipeTouchX.current = null;
  };

  return (
    <div data-hswipe-safe style={{ position: "relative", marginBottom: 10, borderRadius: 14, overflow: "hidden" }}>
      {/* Re-open reveal — sits on the LEFT edge, only renders within the 2h grace. */}
      {canReopen && (
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: REOPEN_W,
          background: "linear-gradient(135deg, #5bb85b, #3a8a3a)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
          cursor: "pointer", borderRadius: "14px 0 0 14px",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
        }}
          onClick={() => { haptic([0, 60, 30, 60]); setSwipeOffset(0); onReopen(workout); }}>
          <Icon name="history" size={18} />
          <span style={{ color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: 0.3 }}>Re-open</span>
        </div>
      )}
      {/* Delete reveal — sits on the RIGHT edge */}
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: DELETE_W, background: "#d55b5b", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", borderRadius: "0 14px 14px 0" }}
        onClick={() => { haptic([0, 60, 30, 60]); onDelete(index); }}>
        <Icon name="trash" size={18} />
        <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>Delete</span>
      </div>
      {/* Sliding card */}
      <div style={{ transform: `translateX(${swipeOffset}px)`, transition: isDragging.current ? "none" : "transform 0.25s ease" }}
        onTouchStart={onCardTouchStart} onTouchMove={onCardTouchMove} onTouchEnd={onCardTouchEnd}>
        <div style={{ background: t.surfaceHigh, border: `1px solid ${activeCfgs.length ? activeCfgs[0].border : t.border}`, borderRadius: 14, overflow: "hidden", transition: "border-color 0.2s" }}>
          <div onClick={() => { if (swipeOffset !== 0) { setSwipeOffset(0); return; } setOpen(o => !o); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "13px 16px", cursor: "pointer", background: activeCfgs.length ? activeCfgs[0].bg : "transparent", transition: "background 0.2s" }}>
            {activeCfgs.length ? (
              <div style={{ display: "flex", gap: 5, flexShrink: 0, flexWrap: "wrap", maxWidth: 180 }}>
                {activeCfgs.map(c => (
                  <span key={c.id} style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color, borderRadius: 6, padding: "2px 7px", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}>
                    {c.emoji} {c.label}
                  </span>
                ))}
              </div>
            ) : (
              <span style={{ color: t.textMuted, flexShrink: 0, display: "flex" }}><Icon name="tag" size={14} /></span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: t.text }}>{formatDate(workout.date)}</div>
              <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>
                {workout.exercises.length} exercise{workout.exercises.length !== 1 ? "s" : ""} · {workout.duration ? `${workout.duration}m` : "—"}
              </div>
            </div>
            <span style={{ color: t.textMuted, flexShrink: 0, display: "flex", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}><Icon name="chevronDown" size={16} /></span>
          </div>
          {open && (
            <div style={{ padding: "0 16px 14px" }}>
              {/* Fix #21: compact Tags line with [edit] to expand the picker */}
              <div style={{ marginBottom: 12, paddingTop: 12, borderTop: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>Tags</span>
                <span style={{ fontSize: 13, color: activeCfgs.length ? t.textSub : t.textMuted, flex: 1, minWidth: 0 }}>
                  {activeCfgs.length ? activeCfgs.map(c => c.label).join(", ") : "None — add some"}
                </span>
                <button onClick={(e) => { e.stopPropagation(); setEditingTags(v => !v); }} style={{ background: "transparent", border: "none", color: accent, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "4px 6px" }}>
                  {editingTags ? "Done" : "Edit"}
                </button>
              </div>
              {editingTags && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>Pick tags</div>
                    <div style={{ fontSize: 10, color: t.textMuted }}>{activeLabels.length}/{TAG_CAP}</div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {mergedLabels.map(l => {
                      const cfg = tagRenderCfg(l);
                      const isActive = activeLabels.includes(l.id);
                      return (
                        <button key={l.id} onClick={(e) => toggleLabel(e, l.id)} style={{ background: isActive ? cfg.bg : "transparent", border: `1px solid ${isActive ? cfg.border : t.border}`, color: isActive ? cfg.color : t.textMuted, borderRadius: 10, padding: "10px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s", opacity: (!isActive && activeLabels.length >= TAG_CAP) ? 0.4 : 1, minHeight: 40, touchAction: "manipulation" }}>
                          {l.emoji} {l.label}{isActive && <span style={{ fontSize: 10, marginLeft: 1, opacity: 0.7 }}>✕</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Sets */}
              {workout.exercises.map((ex, j) => (
                <div key={j} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: j < workout.exercises.length - 1 ? `1px solid ${t.border}` : "none" }}>
                  <div style={{ color: accent, fontSize: 13, fontWeight: 700, marginBottom: 5 }}>{ex.name}</div>
                  {/* Fix #97: history rows pick up the same W/D pill + row-wide
                      tint as the active log row, so a session's structure
                      (warmup → working → drop) reads at a glance after the fact.
                      Flat opacity, no gradient — matches the active log row. */}
                  {ex.sets.map((s, k) => {
                    const setType = isValidSetType(s.type) ? s.type : "working";
                    const tColor = setType === "warmup" ? "#E8B547" : setType === "dropset" ? "#FF7849" : t.textMuted;
                    const indexLabel = setType === "warmup" ? "W" : setType === "dropset" ? "D" : `${k + 1}.`;
                    const tint = setType === "warmup" ? `${tColor}1a` : setType === "dropset" ? `${tColor}24` : "transparent";
                    return (
                      <div key={s.id || k} style={{
                        display: "flex",
                        gap: 8,
                        fontSize: 13,
                        alignItems: "center",
                        padding: setType === "working" ? "1px 0" : "3px 8px",
                        margin: setType === "working" ? 0 : "1px 0",
                        background: tint,
                        borderRadius: setType === "working" ? 0 : 6,
                      }}>
                        <span style={{
                          color: tColor,
                          width: 22,
                          textAlign: "center",
                          fontWeight: setType === "working" ? 400 : 700,
                          fontSize: setType === "working" ? 13 : 11,
                          letterSpacing: setType === "working" ? 0 : 0.4,
                        }}>{indexLabel}</span>
                        <span style={{ color: t.textSub }}>{s.weight} lbs</span>
                        <span style={{ color: t.textMuted }}>×</span>
                        <span style={{ color: t.textSub }}>{s.reps} reps</span>
                      </div>
                    );
                  })}
                  {ex.note && <div style={{ marginTop: 5, fontSize: 12, color: t.textMuted, fontStyle: "italic" }}>📝 {ex.note}</div>}
                </div>
              ))}
              {/* Fix #223: Re-open is available for 2 hours after a workout is
                  finished. After that window the workout locks and edits go through
                  the History edit flow (#107). The button only renders when the
                  parent provides onReopen AND the workout still has a recent
                  finishedAt timestamp. */}
              {onReopen && workout.finishedAt && (Date.now() - workout.finishedAt) < (2 * 60 * 60 * 1000) && (
                <button onClick={() => onReopen(workout)} style={{ width: "100%", background: `linear-gradient(135deg, ${accent}, #4A8BC4)`, border: "none", borderRadius: 10, color: "#fff", padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", marginTop: 4, marginBottom: 6, touchAction: "manipulation", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Icon name="history" size={13} /> Re-open Workout
                </button>
              )}
              {onSaveTemplate && (
                <button onClick={() => onSaveTemplate(workout)} style={{
                  // Apple polish ghost: translucent fill, hairline border, no dashes.
                  width: "100%",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                  borderRadius: 10,
                  color: t.textMuted,
                  padding: "10px 0", fontSize: 12, fontWeight: 600, letterSpacing: 0.2,
                  cursor: "pointer", marginTop: 4, touchAction: "manipulation",
                  transition: "background 0.18s, border-color 0.18s",
                }}>
                  ＋ Save as Template
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Security Settings Component ───────────────────────────────────────
function SecuritySettings({ onDeleteAccount }) {
  const t = useT();
  const [showSecurity, setShowSecurity] = useState(false);
  const [secTab, setSecTab] = useState("email");
  const [newEmail, setNewEmail] = useState("");
  // Fix #52: email change now requires current password re-auth
  const [emailCurrentPw, setEmailCurrentPw] = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [secMsg, setSecMsg] = useState(null);
  const [secVerify, setSecVerify] = useState(false);
  // Fix #57: forgot-password link sends reset email
  const [resetSent, setResetSent] = useState(false);

  const pField = { background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 12, color: t.text, padding: "13px 14px", fontSize: 16, outline: "none", width: "100%", boxSizing: "border-box", marginBottom: 0, WebkitAppearance: "none" };
  const lbl = { fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, display: "block", fontWeight: 700 };

  const pwRules = [
    { label: "8+ characters", ok: newPw.length >= 8 },
    { label: "Uppercase",     ok: /[A-Z]/.test(newPw) },
    { label: "Lowercase",     ok: /[a-z]/.test(newPw) },
    { label: "Number",        ok: /[0-9]/.test(newPw) },
  ];
  const pwValid = pwRules.every(r => r.ok);

  // Fix #52: require current password, send verification link to NEW email
  // BEFORE the change takes effect (verifyBeforeUpdateEmail). This way a
  // stolen session can't silently reassign the account by swapping the email.
  const handleEmailChange = async () => {
    if (!emailCurrentPw) { setSecMsg({ type: "error", text: "Enter your current password to confirm." }); return; }
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      setSecMsg({ type: "error", text: "Please enter a valid email address." }); return;
    }
    if (newEmail === auth.currentUser?.email) {
      setSecMsg({ type: "error", text: "That's already your current email." }); return;
    }
    try {
      // Re-authenticate with current password first
      const credential = EmailAuthProvider.credential(auth.currentUser.email, emailCurrentPw);
      await reauthenticateWithCredential(auth.currentUser, credential);
      // Send verification to new email; Firebase holds the change until the link is clicked
      await verifyBeforeUpdateEmail(auth.currentUser, newEmail);
      setSecVerify(true);
      setSecMsg({ type: "success", text: `Verification sent to ${newEmail}` });
      setEmailCurrentPw("");
    } catch (err) {
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setSecMsg({ type: "error", text: "Current password is incorrect." });
      } else if (err.code === "auth/requires-recent-login") {
        setSecMsg({ type: "error", text: "Session too old — sign out and sign back in, then retry." });
      } else {
        setSecMsg({ type: "error", text: err.message });
      }
    }
  };

  // Fix #57: forgot-password link from within Change Password tab
  const handleForgotPassword = async () => {
    try {
      await sendPasswordResetEmail(auth, auth.currentUser.email);
      setResetSent(true);
    } catch (err) {
      setSecMsg({ type: "error", text: err.message || "Could not send reset email." });
    }
  };

  const handlePasswordChange = async () => {
    if (!pwValid) { setSecMsg({ type: "error", text: "New password doesn't meet all requirements." }); return; }
    if (newPw !== confirmPw) { setSecMsg({ type: "error", text: "Passwords do not match." }); return; }
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPw);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPw);
      setSecMsg({ type: "success", text: "Password updated successfully." });
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (err) {
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setSecMsg({ type: "error", text: "Current password is incorrect." });
      } else {
        setSecMsg({ type: "error", text: err.message });
      }
    }
  };

  const confirmVerified = () => {
    setSecVerify(false); setShowSecurity(false);
    setNewEmail(""); setCurrentPw(""); setNewPw(""); setConfirmPw("");
    setSecMsg({ type: "success", text: "Email updated. Please verify your inbox." });
  };

  if (secVerify) return (
    <div style={{ marginTop: 20, background: `${accent}10`, border: `1px solid ${accent}44`, borderRadius: 12, padding: "20px 16px", textAlign: "center" }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>📬</div>
      <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 18, color: t.text, marginBottom: 8 }}>Check Your Inbox</div>
      <div style={{ fontSize: 13, color: t.textSub, marginBottom: 16, lineHeight: 1.6 }}>
        A verification link has been sent to <strong>{newEmail}</strong>. Click it to confirm your new email address.
      </div>
      <button onClick={confirmVerified} style={{ background: `linear-gradient(135deg, ${accent}, #4A8BC4)`, color: "#ffffff", border: "none", borderRadius: 9, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 8, width: "100%" }}>
        Done
      </button>
      <button onClick={() => { setSecVerify(false); setSecMsg(null); }} style={{ background: "transparent", border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 9, padding: "8px 24px", fontSize: 13, cursor: "pointer", width: "100%" }}>
        Back
      </button>
    </div>
  );

  return (
    <div style={{ marginTop: 20 }}>
      <button onClick={() => { setShowSecurity(s => !s); setSecMsg(null); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: showSecurity ? "10px 10px 0 0" : 10, padding: "12px 14px", cursor: "pointer", color: t.text, fontWeight: 600, fontSize: 13, boxSizing: "border-box" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="shield" size={14} /> Security Settings
        </span>
        <span style={{ color: t.textMuted, fontSize: 11, transition: "transform 0.2s", display: "inline-block", transform: showSecurity ? "rotate(180deg)" : "none" }}>▼</span>
      </button>

      {showSecurity && (
        <div style={{ border: `1px solid ${t.border}`, borderTop: "none", borderRadius: "0 0 10px 10px", padding: "16px 14px", background: t.surfaceHigh }}>
          {/* Tab toggle */}
          <div style={{ display: "flex", background: t.inputBg, borderRadius: 8, padding: 3, marginBottom: 16, gap: 3 }}>
            {["email", "password"].map(tab => (
              <button key={tab} onClick={() => { setSecTab(tab); setSecMsg(null); }} style={{ flex: 1, background: secTab === tab ? accent : "transparent", color: secTab === tab ? "#ffffff" : t.textMuted, border: "none", borderRadius: 6, padding: "7px 0", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}>
                {tab === "email" ? "Change Email" : "Change Password"}
              </button>
            ))}
          </div>

          {secTab === "email" && (
            <div>
              <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
                Current: <span style={{ color: t.text, fontWeight: 600 }}>{auth.currentUser?.email || "—"}</span>
              </div>
              <label style={lbl}>Current Password</label>
              <input type="password" value={emailCurrentPw} onChange={e => { setEmailCurrentPw(e.target.value); setSecMsg(null); }} placeholder="Enter to confirm it's you" style={{ ...pField, marginBottom: 12 }} />
              <label style={lbl}>New Email Address</label>
              <input type="email" value={newEmail} onChange={e => { setNewEmail(e.target.value); setSecMsg(null); }} placeholder="new@email.com" style={{ ...pField, marginBottom: 6 }} />
              <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
                We'll email a verification link to the new address. The change only takes effect once you click it.
              </div>
              <button onClick={handleEmailChange} style={{ width: "100%", background: `linear-gradient(135deg, ${accent}, #4A8BC4)`, color: "#ffffff", border: "none", borderRadius: 12, padding: "13px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Bebas Neue', cursive", letterSpacing: 1 }}>
                Update Email
              </button>
            </div>
          )}

          {secTab === "password" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <label style={{ ...lbl, marginBottom: 0 }}>Current Password</label>
                <button onClick={handleForgotPassword} disabled={resetSent} style={{ background: "transparent", border: "none", color: resetSent ? "#5bb85b" : accent, fontSize: 11, fontWeight: 700, cursor: resetSent ? "default" : "pointer", padding: 0 }}>
                  {resetSent ? "✓ Reset email sent" : "Forgot password?"}
                </button>
              </div>
              <input type="password" value={currentPw} onChange={e => { setCurrentPw(e.target.value); setSecMsg(null); }} placeholder="Enter current password" style={{ ...pField, marginBottom: 12 }} />
              <label style={lbl}>New Password</label>
              <input type="password" value={newPw} onChange={e => { setNewPw(e.target.value); setSecMsg(null); }} placeholder="Enter new password" style={{ ...pField, marginBottom: 8 }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {pwRules.map(r => (
                  <span key={r.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: r.ok ? "#5bb85b" : t.textMuted }}>
                    <span style={{ width: 14, height: 14, borderRadius: "50%", background: r.ok ? "rgba(91,184,91,0.15)" : t.inputBg, border: `1px solid ${r.ok ? "#5bb85b" : t.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>{r.ok ? "✓" : ""}</span>
                    {r.label}
                  </span>
                ))}
              </div>
              <label style={lbl}>Confirm New Password</label>
              <input type="password" value={confirmPw} onChange={e => { setConfirmPw(e.target.value); setSecMsg(null); }} placeholder="Confirm new password" style={{ ...pField, marginBottom: 12 }} />
              <button onClick={handlePasswordChange} style={{ width: "100%", background: `linear-gradient(135deg, ${accent}, #4A8BC4)`, color: "#ffffff", border: "none", borderRadius: 12, padding: "13px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Bebas Neue', cursive", letterSpacing: 1 }}>
                Update Password
              </button>
            </div>
          )}

          {secMsg && (
            <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: secMsg.type === "error" ? "rgba(213,91,91,0.12)" : "rgba(91,184,91,0.12)", color: secMsg.type === "error" ? "#d55b5b" : "#5bb85b", border: `1px solid ${secMsg.type === "error" ? "rgba(213,91,91,0.3)" : "rgba(91,184,91,0.3)"}` }}>
              {secMsg.text}
            </div>
          )}

          {/* Fix #45: Delete Account entry point — lives inside Security Settings so it's discoverable but not foot-gunny */}
          {onDeleteAccount && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${t.border}` }}>
              <button onClick={onDeleteAccount} style={{ width: "100%", background: "transparent", border: "1px solid rgba(213,91,91,0.35)", color: "#d55b5b", borderRadius: 10, padding: "11px", fontSize: 13, fontWeight: 700, cursor: "pointer", touchAction: "manipulation" }}>
                Delete Account…
              </button>
              <div style={{ fontSize: 10, color: t.textMuted, marginTop: 6, textAlign: "center", lineHeight: 1.5 }}>
                Permanently removes your account and all workout data. You'll be asked to confirm.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Fix #45: Delete Account flow — confirm, re-auth, offer export, hard delete
function DeleteAccountModal({ onClose, onExport, onDeleted }) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const canDelete = !!password && confirmText.trim().toUpperCase() === "DELETE" && !busy;

  const doDelete = async () => {
    setBusy(true); setErr(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("No user session.");
      // Re-auth
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
      // Delete Firestore user doc first (best-effort), then delete auth record
      try { await deleteDoc(doc(db, "users", user.uid)); } catch {}
      await deleteUser(user);
      onDeleted?.();
    } catch (e) {
      if (e.code === "auth/wrong-password" || e.code === "auth/invalid-credential") {
        setErr("Current password is incorrect.");
      } else if (e.code === "auth/requires-recent-login") {
        setErr("Session too old — sign out and sign back in, then retry.");
      } else {
        setErr(e.message || "Could not delete account.");
      }
      setBusy(false);
    }
  };

  return (
    <div data-hswipe-safe style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }} />
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: "100%", maxWidth: 420, background: t.surface, borderRadius: "20px 20px 0 0", padding: "20px 20px 30px", margin: "0 auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.6)", maxHeight: "90dvh", overflowY: "auto", border: "1px solid rgba(213,91,91,0.3)", borderBottom: "none" }}>
        <div style={{ width: 36, height: 4, background: t.border, borderRadius: 4, margin: "0 auto 14px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 28 }}>⚠️</span>
          <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, letterSpacing: 1, color: "#d55b5b" }}>Delete Account</div>
        </div>
        <div style={{ fontSize: 13, color: t.textSub, lineHeight: 1.6, marginBottom: 14 }}>
          This permanently removes your account, profile, workouts, templates, tags, and all other data. <strong style={{ color: "#d55b5b" }}>This cannot be undone.</strong>
        </div>

        {onExport && (
          <button onClick={onExport} style={{ width: "100%", background: t.surfaceHigh, border: `1px solid ${t.border}`, color: t.text, borderRadius: 12, padding: "11px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14, touchAction: "manipulation" }}>
            <Icon name="download" size={14} /> Export my data first (CSV)
          </button>
        )}

        <label style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, display: "block", fontWeight: 700 }}>Current Password</label>
        <input type="password" value={password} onChange={e => { setPassword(e.target.value); setErr(null); }} placeholder="Confirm it's you" style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 12, color: t.text, padding: "13px 14px", fontSize: 16, outline: "none", width: "100%", boxSizing: "border-box", marginBottom: 12 }} />

        <label style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, display: "block", fontWeight: 700 }}>Type DELETE to confirm</label>
        <input type="text" value={confirmText} onChange={e => { setConfirmText(e.target.value); setErr(null); }} placeholder="DELETE" autoCapitalize="characters" style={{ background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 12, color: t.text, padding: "13px 14px", fontSize: 16, outline: "none", width: "100%", boxSizing: "border-box", marginBottom: 14 }} />

        {err && <div style={{ color: "#d55b5b", fontSize: 12, marginBottom: 10, background: "rgba(213,91,91,0.1)", border: "1px solid rgba(213,91,91,0.3)", borderRadius: 8, padding: "8px 12px" }}>{err}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} disabled={busy} style={{ flex: 1, background: "transparent", border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 12, padding: "13px 0", fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer" }}>Cancel</button>
          <button onClick={doDelete} disabled={!canDelete} style={{ flex: 2, background: canDelete ? "#d55b5b" : t.surfaceHigh, border: "none", color: canDelete ? "#fff" : t.textMuted, borderRadius: 12, padding: "13px 0", fontSize: 15, fontWeight: 700, fontFamily: "'Bebas Neue', cursive", letterSpacing: 1, cursor: canDelete ? "pointer" : "default" }}>
            {busy ? "DELETING…" : "DELETE FOREVER"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Settings Modal ────────────────────────────────────────────────────
function VerifyEmailRow() {
  const t = useT();
  const [sent, setSent] = useState(false);
  const [err, setErr]   = useState(null);
  const [busy, setBusy] = useState(false);
  const user = auth.currentUser;
  if (!user || user.emailVerified) return null;

  const resend = async () => {
    setBusy(true); setErr(null);
    try {
      await sendEmailVerification(user);
      setSent(true);
    } catch (e) {
      setErr(e.message || "Failed to send. Try again later.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, marginBottom: 10 }}>Email Verification</div>
      <div style={{ background: "rgba(255,149,0,0.08)", border: "1px solid rgba(255,149,0,0.3)", borderRadius: 12, padding: "13px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: sent ? 10 : 12 }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span style={{ fontSize: 13, color: "#ff9500", fontWeight: 600 }}>Email not verified</span>
        </div>
        <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
          {user.email} — check your inbox for a verification link.
        </div>
        {sent
          ? <div style={{ fontSize: 12, color: "#5bb85b", fontWeight: 600 }}>✓ Verification email sent — check your inbox</div>
          : <button
              onClick={resend}
              disabled={busy}
              style={{ background: "rgba(255,149,0,0.15)", border: "1px solid rgba(255,149,0,0.4)", color: "#ff9500", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, touchAction: "manipulation" }}
            >
              {busy ? "Sending…" : "Resend Verification Email"}
            </button>
        }
        {err && <div style={{ fontSize: 11, color: "#d55b5b", marginTop: 8 }}>{err}</div>}
      </div>
    </div>
  );
}

// Fix #217: Workout Preferences sub-panel — stacks above Settings (z 950 vs 900) so the
// user can flick back to Settings via the back arrow without losing context. Houses the
// new Auto-start Rest Timer toggle plus the existing prefs (1RM formula, effort metric,
// sound, units) that were previously inline in Settings. Future toggles (default rest
// duration, auto-progression, default RPE prompt, etc.) drop in here without rework.
function WorkoutPreferencesPanel({ workoutPrefs, onWorkoutPrefs, onClose }) {
  const t = useT();
  const accent = "#5B9BD5";
  const cardStyle = { background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8 };
  const labelStyle = { fontSize: 12, color: t.textSub, fontWeight: 600, marginBottom: 4 };
  const subStyle = { fontSize: 10, color: t.textMuted, marginBottom: 8 };
  return (
    <div data-hswipe-safe style={{ position: "fixed", inset: 0, zIndex: 950, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }}
      onClick={onClose}>
      {/* Backdrop */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} />
      {/* Sheet */}
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: "100%", maxWidth: 420, background: t.surface, borderRadius: "20px 20px 0 0", padding: "0 20px calc(env(safe-area-inset-bottom, 0px) + 24px)", maxHeight: "85vh", overflowY: "auto", WebkitOverflowScrolling: "touch", boxShadow: "0 -8px 40px rgba(0,0,0,0.4)" }}>
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: t.border }} />
        </div>
        {/* Header — back arrow returns to Settings */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 16, borderBottom: `1px solid ${t.border}`, marginBottom: 16 }}>
          <button onClick={onClose} aria-label="Back to Settings" style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: t.textMuted, transform: "rotate(180deg)" }}>
            <Icon name="chevronRight" size={14} />
          </button>
          <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, letterSpacing: 1 }}>
            <span style={{ color: accent }}>Workout Preferences</span>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: t.textMuted }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Intro */}
        <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
          Tweak how the app behaves during a workout. Changes save instantly and sync across your devices.
        </div>

        {/* Rest Timer section */}
        <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, marginBottom: 8 }}>Rest Timer</div>
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: t.text, fontWeight: 600 }}>Smart rest timer</div>
              <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2, lineHeight: 1.5 }}>When ON, the first thing you do after the timer is idle (tap a set's input, tap ✓, or hit Add Set) starts it — and once it's running, later actions don't reset it. Add Set with timer running asks "just finished?" so preloading mid-rest is safe. Off keeps it fully manual.</div>
            </div>
            <button
              onClick={() => { haptic(8); onWorkoutPrefs({ ...(workoutPrefs || {}), autoStartRest: !workoutPrefs?.autoStartRest }); }}
              style={{
                background: workoutPrefs?.autoStartRest ? `linear-gradient(135deg, ${accent}, #4A8BC4)` : "rgba(255,255,255,0.04)",
                border: `1px solid ${workoutPrefs?.autoStartRest ? `${accent}99` : "rgba(255,255,255,0.08)"}`,
                boxShadow: workoutPrefs?.autoStartRest ? `inset 0 1px 0 rgba(255,255,255,0.16), 0 2px 10px ${accentGlow}` : "inset 0 1px 0 rgba(255,255,255,0.04)",
                borderRadius: 14, padding: "6px 16px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                color: workoutPrefs?.autoStartRest ? "#fff" : t.textMuted,
                cursor: "pointer", touchAction: "manipulation", flexShrink: 0, minHeight: 32,
                transition: "background 0.18s, border-color 0.18s, box-shadow 0.18s, color 0.18s",
              }}
              aria-pressed={!!workoutPrefs?.autoStartRest}
            >
              {workoutPrefs?.autoStartRest ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        {/* Calculations section */}
        <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, margin: "16px 0 8px" }}>Calculations</div>
        <div style={cardStyle}>
          <div style={labelStyle}>1RM Formula</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {[
              { id: "avg",     label: "Both (avg)", sub: "Epley + Brzycki" },
              { id: "epley",   label: "Epley",      sub: "w × (1 + r/30)" },
              { id: "brzycki", label: "Brzycki",    sub: "w × 36/(37-r)" },
            ].map(opt => {
              const active = (workoutPrefs?.oneRMFormula || "avg") === opt.id;
              return (
                <button key={opt.id} onClick={() => { haptic(8); onWorkoutPrefs({ ...(workoutPrefs || {}), oneRMFormula: opt.id }); }} style={{
                  // Apple-tier segment: active = Steel-Blue gradient + inset highlight + soft glow.
                  background: active ? `linear-gradient(135deg, ${accent}, #4A8BC4)` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${active ? `${accent}99` : "rgba(255,255,255,0.08)"}`,
                  boxShadow: active ? `inset 0 1px 0 rgba(255,255,255,0.16), 0 2px 10px ${accentGlow}` : "inset 0 1px 0 rgba(255,255,255,0.04)",
                  borderRadius: 10, padding: "9px 6px", fontSize: 11, fontWeight: 700, letterSpacing: 0.2,
                  color: active ? "#fff" : t.textSub, cursor: "pointer",
                  display: "flex", flexDirection: "column", gap: 2, touchAction: "manipulation",
                  transition: "background 0.18s, border-color 0.18s, box-shadow 0.18s, color 0.18s",
                }}>
                  <span>{opt.label}</span>
                  <span style={{ fontSize: 9, fontWeight: 400, opacity: 0.8, fontFamily: "'Space Mono', monospace" }}>{opt.sub}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Effort Metric</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {[
              { id: "rpe", label: "RPE",  sub: "Rate of Perceived Exertion (6–10)" },
              { id: "rir", label: "RIR",  sub: "Reps in Reserve (0–5)" },
            ].map(opt => {
              const active = (workoutPrefs?.effortMetric || "rpe") === opt.id;
              return (
                <button key={opt.id} onClick={() => { haptic(8); onWorkoutPrefs({ ...(workoutPrefs || {}), effortMetric: opt.id }); }} style={{
                  background: active ? `linear-gradient(135deg, ${accent}, #4A8BC4)` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${active ? `${accent}99` : "rgba(255,255,255,0.08)"}`,
                  boxShadow: active ? `inset 0 1px 0 rgba(255,255,255,0.16), 0 2px 10px ${accentGlow}` : "inset 0 1px 0 rgba(255,255,255,0.04)",
                  borderRadius: 10, padding: "11px 8px", fontSize: 12, fontWeight: 700, letterSpacing: 0.2,
                  color: active ? "#fff" : t.textSub, cursor: "pointer",
                  display: "flex", flexDirection: "column", gap: 2, textAlign: "left", touchAction: "manipulation",
                  transition: "background 0.18s, border-color 0.18s, box-shadow 0.18s, color 0.18s",
                }}>
                  <span>{opt.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.85 }}>{opt.sub}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Audio + Units section */}
        <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, margin: "16px 0 8px" }}>Audio &amp; Units</div>
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, color: t.textSub, fontWeight: 600 }}>Sound effects</div>
              <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>Subtle tones on set complete, rest timer end, PR unlock.</div>
            </div>
            <button onClick={() => { haptic(8); onWorkoutPrefs({ ...(workoutPrefs || {}), sound: !workoutPrefs?.sound }); }} style={{
              // Apple-tier ON/OFF: ON = Steel-Blue gradient + glow; OFF = translucent ghost.
              background: workoutPrefs?.sound ? `linear-gradient(135deg, ${accent}, #4A8BC4)` : "rgba(255,255,255,0.04)",
              border: `1px solid ${workoutPrefs?.sound ? `${accent}99` : "rgba(255,255,255,0.08)"}`,
              boxShadow: workoutPrefs?.sound ? `inset 0 1px 0 rgba(255,255,255,0.16), 0 2px 10px ${accentGlow}` : "inset 0 1px 0 rgba(255,255,255,0.04)",
              borderRadius: 14, padding: "6px 16px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
              color: workoutPrefs?.sound ? "#fff" : t.textMuted,
              cursor: "pointer", touchAction: "manipulation", flexShrink: 0,
              transition: "background 0.18s, border-color 0.18s, box-shadow 0.18s, color 0.18s",
            }}>
              {workoutPrefs?.sound ? "ON" : "OFF"}
            </button>
          </div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Units</div>
          <div style={subStyle}>Affects how new entries are labeled. Existing data isn't auto-converted yet.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {[
              { id: "imperial", label: "Imperial", sub: "lbs / inches" },
              { id: "metric",   label: "Metric",   sub: "kg / cm" },
            ].map(opt => {
              const active = (workoutPrefs?.units || "imperial") === opt.id;
              return (
                <button key={opt.id} onClick={() => { haptic(8); onWorkoutPrefs({ ...(workoutPrefs || {}), units: opt.id }); }} style={{
                  background: active ? `linear-gradient(135deg, ${accent}, #4A8BC4)` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${active ? `${accent}99` : "rgba(255,255,255,0.08)"}`,
                  boxShadow: active ? `inset 0 1px 0 rgba(255,255,255,0.16), 0 2px 10px ${accentGlow}` : "inset 0 1px 0 rgba(255,255,255,0.04)",
                  borderRadius: 10, padding: "11px 8px", fontSize: 12, fontWeight: 700, letterSpacing: 0.2,
                  color: active ? "#fff" : t.textSub, cursor: "pointer",
                  display: "flex", flexDirection: "column", gap: 2, textAlign: "left", touchAction: "manipulation",
                  transition: "background 0.18s, border-color 0.18s, box-shadow 0.18s, color 0.18s",
                }}>
                  <span>{opt.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.85 }}>{opt.sub}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ authedUser, onClose, themePref, onThemeChoice, onEditProfile, onManageTags, onExport, workoutPrefs, onWorkoutPrefs, onOpenWorkoutPrefs, onDeleteAccount, onBackupJSON, onRestoreJSON, consentActive, onWithdrawConsent }) {
  const t = useT();
  const theme = useContext(ThemeCtx);
  const accent = "#5B9BD5";
  return (
    <div data-hswipe-safe style={{ position: "fixed", inset: 0, zIndex: 900, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }}
      onClick={onClose}>
      {/* Backdrop */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} />
      {/* Sheet */}
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: "100%", maxWidth: 420, background: t.surface, borderRadius: "20px 20px 0 0", padding: "0 20px calc(env(safe-area-inset-bottom, 0px) + 24px)", maxHeight: "85vh", overflowY: "auto", WebkitOverflowScrolling: "touch", boxShadow: "0 -8px 40px rgba(0,0,0,0.4)" }}>
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: t.border }} />
        </div>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 16, borderBottom: `1px solid ${t.border}`, marginBottom: 20 }}>
          <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, letterSpacing: 1 }}>
            <span style={{ color: accent }}>Settings</span>
          </div>
          <button onClick={onClose} style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: t.textMuted }}>
            <Icon name="x" size={16} />
          </button>
        </div>
        {/* Profile */}
        {onEditProfile && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, marginBottom: 10 }}>Profile</div>
            <button onClick={() => { haptic(8); onEditProfile(); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: t.surfaceHigh, border: "1px solid rgba(255,255,255,0.06)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)", borderRadius: 12, padding: "13px 16px", cursor: "pointer", color: t.text, boxSizing: "border-box" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 14 }}>
                <Icon name="edit2" size={16} />
                Edit Profile
              </span>
              <Icon name="chevronRight" size={14} color={t.textMuted} />
            </button>
          </div>
        )}
        {/* Tags */}
        {onManageTags && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, marginBottom: 10 }}>Tags</div>
            <button onClick={() => { haptic(8); onManageTags(); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: t.surfaceHigh, border: "1px solid rgba(255,255,255,0.06)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)", borderRadius: 12, padding: "13px 16px", cursor: "pointer", color: t.text, boxSizing: "border-box" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 14 }}>
                <Icon name="tag" size={16} />
                Manage Tags
              </span>
              <Icon name="chevronRight" size={14} color={t.textMuted} />
            </button>
          </div>
        )}
        {/* Fix #55: Theme preference — System / Light / Dark */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, marginBottom: 10 }}>Appearance</div>
          {/* Apple-tier segmented toggle: iOS-style "segmented control" — translucent
              track + active segment lifts with gradient + inner highlight + soft glow. */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
            borderRadius: 12, padding: 4,
          }}>
            {[
              { id: "system", label: "System", sub: "Matches OS" },
              { id: "light",  label: "Light",  icon: "sun" },
              { id: "dark",   label: "Dark",   icon: "moon" },
            ].map(opt => {
              const active = themePref === opt.id;
              return (
                <button key={opt.id} onClick={() => { haptic(8); onThemeChoice(opt.id); }} style={{
                  background: active ? `linear-gradient(135deg, ${accent}, #4A8BC4)` : "transparent",
                  border: "none",
                  boxShadow: active ? `inset 0 1px 0 rgba(255,255,255,0.16), 0 2px 10px ${accentGlow}` : "none",
                  color: active ? "#fff" : t.textSub,
                  borderRadius: 9, padding: "10px 6px", fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
                  cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  touchAction: "manipulation",
                  transition: "background 0.2s, box-shadow 0.2s, color 0.2s",
                }}>
                  {opt.icon ? <Icon name={opt.icon} size={14} /> : <span style={{ fontSize: 13 }}>⚙</span>}
                  {opt.label}
                </button>
              );
            })}
          </div>
          {themePref === "system" && (
            <div style={{ fontSize: 10, color: t.textMuted, marginTop: 6, textAlign: "center" }}>Following your device setting — currently {theme}.</div>
          )}
        </div>
        {/* Fix #217: Workout Preferences moved into a dedicated sub-panel.
            Was previously an inline section here (1RM, Effort, Sound, Units). Migrated
            so the new Auto-start Rest Timer toggle has a coherent home alongside the
            existing prefs, and so future toggles can be added without bloating this
            top-level Settings sheet. */}
        {onOpenWorkoutPrefs && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, marginBottom: 10 }}>Workout</div>
            <button onClick={onOpenWorkoutPrefs} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: t.surfaceHigh, border: "1px solid rgba(255,255,255,0.06)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)", borderRadius: 12, padding: "13px 16px", cursor: "pointer", color: t.text, boxSizing: "border-box" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 14 }}>
                <Icon name="dumbbell" size={16} />
                Workout Preferences
              </span>
              <Icon name="chevronRight" size={14} color={t.textMuted} />
            </button>
          </div>
        )}
        {/* Email verification */}
        <VerifyEmailRow />
        {/* Security */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, marginBottom: 10 }}>Account Security</div>
          <SecuritySettings onDeleteAccount={onDeleteAccount} />
        </div>
        {/* Data & Privacy */}
        {onExport && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, marginBottom: 10 }}>Data &amp; Privacy</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button onClick={onExport} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: t.surfaceHigh, border: "1px solid rgba(255,255,255,0.06)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)", borderRadius: 12, padding: "13px 16px", cursor: "pointer", color: t.text, boxSizing: "border-box" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 14 }}>
                  <Icon name="download" size={16} />
                  Export Workouts (CSV)
                </span>
                <Icon name="chevronRight" size={14} color={t.textMuted} />
              </button>
              {/* Fix #66: full JSON backup / restore */}
              {onBackupJSON && (
                <button onClick={onBackupJSON} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: t.surfaceHigh, border: "1px solid rgba(255,255,255,0.06)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)", borderRadius: 12, padding: "13px 16px", cursor: "pointer", color: t.text, boxSizing: "border-box" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 14 }}>
                    <Icon name="shield" size={16} />
                    Backup data (JSON)
                  </span>
                  <Icon name="chevronRight" size={14} color={t.textMuted} />
                </button>
              )}
              {onRestoreJSON && (
                <button onClick={onRestoreJSON} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: t.surfaceHigh, border: "1px solid rgba(255,255,255,0.06)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)", borderRadius: 12, padding: "13px 16px", cursor: "pointer", color: t.text, boxSizing: "border-box" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 14 }}>
                    <Icon name="history" size={16} />
                    Restore from backup
                  </span>
                  <Icon name="chevronRight" size={14} color={t.textMuted} />
                </button>
              )}
              {/* Fix #102: Manage Cookie Preferences — only shown when consent is currently active.
                  Tapping it withdraws consent (clears local + Firestore) and the banner re-shows. */}
              {consentActive && onWithdrawConsent && (
                <button onClick={onWithdrawConsent} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: t.surfaceHigh, border: "1px solid rgba(255,255,255,0.06)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)", borderRadius: 12, padding: "13px 16px", cursor: "pointer", color: t.text, boxSizing: "border-box" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 14 }}>
                    <Icon name="shield" size={16} />
                    Manage Cookie Preferences
                  </span>
                  <Icon name="chevronRight" size={14} color={t.textMuted} />
                </button>
              )}
            </div>
          </div>
        )}
        {/* Fix #60 + #63: About — Privacy / Terms links + support contact */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, marginBottom: 10 }}>About</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { icon: "shield", label: "Privacy Policy",   href: "/privacy.html" },
              { icon: "book",   label: "Terms of Service", href: "/terms.html" },
              { icon: "book",   label: "User Manual",      href: "/user-manual.html" },
              { icon: "zap",    label: "Contact Support",  href: "mailto:support@barbelllabs.ca?subject=Barbell%20Labs%20Support" },
            ].map(item => (
              <a key={item.label} href={item.href} target={item.href.startsWith("mailto:") ? undefined : "_blank"} rel={item.href.startsWith("mailto:") ? undefined : "noopener noreferrer"} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: t.surfaceHigh, border: "1px solid rgba(255,255,255,0.06)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)", borderRadius: 12, padding: "13px 16px", color: t.text, boxSizing: "border-box", textDecoration: "none" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 14 }}>
                  <Icon name={item.icon} size={16} />
                  {item.label}
                </span>
                <Icon name="chevronRight" size={14} color={t.textMuted} />
              </a>
            ))}
          </div>
          <div style={{ fontSize: 11, color: t.textMuted, textAlign: "center", marginTop: 10 }}>
            Barbell Labs v{APP_VERSION} · Built {BUILD_DATE}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Admin Panel ───────────────────────────────────────────────────────
function AdminPanel() {
  const t = useT();
  return (
    <div style={{ padding: "52px 20px 100px", textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>⚙️</div>
      <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 28, letterSpacing: 1, marginBottom: 8 }}>Admin <span style={{ color: accent }}>Panel</span></div>
      <div style={{ color: t.textMuted, fontSize: 14 }}>Coming soon — upgrading to cloud user management.</div>
    </div>
  );
}

// ── Google Sign In ─────────────────────────────────────────────────────
function GoogleSignInButton({ onError }) {
  const handleGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") onError?.(err.message);
    }
  };
  return (
    <div style={{ marginBottom: 10 }}>
      <button onClick={handleGoogle} style={{
        // Apple-tier Google sign-in: translucent layered surface + hairline + inset highlight.
        width: "100%",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
        borderRadius: 12, color: "#e6e6e8",
        padding: "13px 16px", fontSize: 14, fontWeight: 600, letterSpacing: 0.2,
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        boxSizing: "border-box",
        transition: "background 0.18s, border-color 0.18s",
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Continue with Google
      </button>
    </div>
  );
}

// ── Landing Page ──────────────────────────────────────────────────────
const ONBOARD_SLIDES = [
  {
    icon: "🏋️",
    title: "LOG EVERY LIFT",
    body: "Track sets, reps, and weight for every exercise. Gym, home, garage — wherever you train.",
  },
  {
    icon: "📈",
    title: "WATCH YOURSELF GROW",
    body: "Dual-line charts show your weight and reps climbing together. The more you log, the more you see.",
  },
  {
    icon: "🤖",
    title: "AI COACHING",
    body: "After every session Barbell Labs tells you exactly what to do next — push harder, deload, or break a plateau.",
  },
  {
    icon: "⚡",
    title: "BUILT FOR SERIOUS LIFTERS",
    body: "RPE, RIR, PR tracking, streak counter, rest timer. Everything you need, nothing you don't.",
  },
];

function OnboardingCarousel({ onDone }) {
  const [slide, setSlide] = useState(0);
  const [exiting, setExiting] = useState(false);
  const touchStartX = useRef(null);

  const next = () => {
    if (slide < ONBOARD_SLIDES.length - 1) {
      setExiting(true);
      setTimeout(() => { setSlide(s => s + 1); setExiting(false); }, 220);
    } else {
      onDone();
    }
  };

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const dx = touchStartX.current - e.changedTouches[0].clientX;
    if (dx > 40) next();
    touchStartX.current = null;
  };

  const s = ONBOARD_SLIDES[slide];
  const isLast = slide === ONBOARD_SLIDES.length - 1;

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ minHeight: "100dvh", background: THEMES.dark.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 32px", fontFamily: "'DM Sans', sans-serif", maxWidth: 420, margin: "0 auto", userSelect: "none" }}
    >
      {/* Logo */}
      <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 28, letterSpacing: 4, marginBottom: 48, opacity: 0.6 }}>
        <span style={{ color: "#fff" }}>BARBELL</span><span style={{ color: accent }}>LABS</span>
      </div>

      {/* Slide content */}
      <div style={{ textAlign: "center", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: exiting ? 0 : 1, transform: exiting ? "translateX(-24px)" : "translateX(0)", transition: "all 0.22s ease" }}>
        <div style={{ fontSize: 80, marginBottom: 28, lineHeight: 1 }}>{s.icon}</div>
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 36, letterSpacing: 2, color: "#fff", marginBottom: 16, lineHeight: 1.1 }}>{s.title}</div>
        <div style={{ color: "#8899aa", fontSize: 16, lineHeight: 1.7, maxWidth: 300 }}>{s.body}</div>
      </div>

      {/* Dots */}
      <div style={{ display: "flex", gap: 8, marginBottom: 36 }}>
        {ONBOARD_SLIDES.map((_, i) => (
          <div key={i} onClick={() => setSlide(i)} style={{ width: i === slide ? 24 : 8, height: 8, borderRadius: 4, background: i === slide ? accent : "#2a2a3a", transition: "all 0.3s ease", cursor: "pointer" }} />
        ))}
      </div>

      {/* Buttons */}
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
        <button onClick={next} style={{ width: "100%", background: `linear-gradient(135deg, ${accent}, #4A8BC4)`, color: "#fff", border: "none", borderRadius: 14, padding: 16, fontFamily: "'Bebas Neue', cursive", fontSize: 20, letterSpacing: 1.5, cursor: "pointer" }}>
          {isLast ? "GET STARTED" : "NEXT"}
        </button>
        {!isLast && (
          <button onClick={onDone} style={{ background: "transparent", border: "none", color: "#444", fontSize: 14, cursor: "pointer", padding: 8 }}>
            Skip
          </button>
        )}
      </div>
    </div>
  );
}

function LandingPage({ onNewUser }) {
  const [showOnboard, setShowOnboard] = useState(() => !localStorage.getItem("bl_onboarded"));
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dob, setDob] = useState(""); // Fix #62: DOB for age gate (COPPA/GDPR)
  const [agreedToTerms, setAgreedToTerms] = useState(false); // Fix #60
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [animIn, setAnimIn] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const bg = THEMES.dark.bg; const sh = THEMES.dark.surfaceHigh;

  const handleOnboardDone = () => {
    localStorage.setItem("bl_onboarded", "1");
    setShowOnboard(false);
  };

  useEffect(() => { if (!showOnboard) setTimeout(() => setAnimIn(true), 60); }, [showOnboard]);

  if (showOnboard) return <OnboardingCarousel onDone={handleOnboardDone} />;

  const switchMode = (m) => { setMode(m); setError(""); setUsername(""); setEmail(""); setPassword(""); setDob(""); setAgreedToTerms(false); };

  const handleSubmit = async () => {
    const u = username.trim(), em = email.trim();
    if (mode === "signup") {
      if (!u || !em || !password) { setError("Please fill in all fields."); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setError("Please enter a valid email address."); return; }
      if (password.length < 8)       { setError("Password must be at least 8 characters."); return; }
      if (!/[A-Z]/.test(password))   { setError("Password must include at least 1 uppercase letter."); return; }
      if (!/[a-z]/.test(password))   { setError("Password must include at least 1 lowercase letter."); return; }
      if (!/[0-9]/.test(password))   { setError("Password must include at least 1 digit."); return; }
      // Fix #62: age gate — block under 13 (COPPA). EU users should really be 16 per GDPR strict, but
      // the safer public-fitness-app floor is 13; under-16 EU users can still technically use it.
      if (!dob) { setError("Please enter your date of birth."); return; }
      const birth = new Date(dob);
      if (isNaN(birth.getTime())) { setError("Please enter a valid date of birth."); return; }
      const now = new Date();
      let age = now.getFullYear() - birth.getFullYear();
      const m = now.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
      if (age < 13) { setError("You must be at least 13 years old to create an account."); return; }
      if (age > 120) { setError("Please enter a valid date of birth."); return; }
      // Fix #60: must agree to Privacy + Terms
      if (!agreedToTerms) { setError("Please agree to the Privacy Policy and Terms of Service."); return; }
      try {
        const cred = await createUserWithEmailAndPassword(auth, em, password);
        await updateProfile(cred.user, { displayName: u });
        await sendEmailVerification(cred.user);
        // Fix #62 + #60: persist DOB and consent timestamp on initial user doc
        try {
          await setDoc(doc(db, "users", cred.user.uid), {
            workouts: [],
            bodyweight: [],
            profile: { dob, termsAcceptedAt: new Date().toISOString() },
          });
        } catch {}
        setVerifiedEmail(em);
        setMode("verify");
        onNewUser?.();
      } catch (err) {
        if (err.code === "auth/email-already-in-use") setError("An account with this email already exists.");
        else setError(err.message);
      }
    } else {
      if (!em || !password) { setError("Please fill in all fields."); return; }
      try {
        await signInWithEmailAndPassword(auth, em, password);
      } catch (err) {
        if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
          setError("Invalid email or password.");
        } else {
          setError(err.message);
        }
      }
    }
  };

  const fStyle = { background: "#111", border: "1px solid #2d2d2d", borderRadius: 11, color: "#fff", padding: "13px 16px", fontSize: 16, outline: "none", width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ background: bg, minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px 24px", fontFamily: "'DM Sans', sans-serif", maxWidth: 420, margin: "0 auto" }}>
      <style>{`
        @keyframes gt-line-grow { from { transform: scaleX(0); opacity: 0; } to { transform: scaleX(1); opacity: 1; } }
        @keyframes gt-gym-in { from { opacity: 0; letter-spacing: 12px; } to { opacity: 1; letter-spacing: 4px; } }
        @keyframes gt-track-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes gt-tag-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes gt-accent-pulse { 0%,100% { text-shadow: 0 0 0px rgba(91,155,213,0); } 50% { text-shadow: 0 0 18px rgba(91,155,213,0.45); } }
      `}</style>
      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, marginBottom: 10, transformOrigin: "center", animation: "gt-line-grow 1.4s cubic-bezier(0.16,1,0.3,1) 0.2s both" }} />
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 36, lineHeight: 1, display: "flex", alignItems: "baseline", justifyContent: "center" }}>
          <span style={{ color: "#ffffff", letterSpacing: 4, animation: "gt-gym-in 1.2s cubic-bezier(0.16,1,0.3,1) 0.6s both", display: "inline-block" }}>BARBELL</span>
          <span style={{ color: accent, letterSpacing: 4, animation: "gt-track-in 1.2s cubic-bezier(0.16,1,0.3,1) 1.3s both, gt-accent-pulse 3s ease-in-out 3s infinite", display: "inline-block" }}>LABS</span>
        </div>
        <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accent}55, transparent)`, marginTop: 10, transformOrigin: "center", animation: "gt-line-grow 1.4s cubic-bezier(0.16,1,0.3,1) 0.9s both" }} />
        <div style={{ color: "#444", fontSize: 11, marginTop: 8, letterSpacing: 2, textTransform: "uppercase", animation: "gt-tag-in 1s ease 2.2s both" }}>Train · Log · Improve</div>
      </div>
      {/* Card */}
      <div style={{ width: "100%", background: sh, borderRadius: 18, border: "1px solid #2a2a2a", padding: "22px 20px", opacity: animIn ? 1 : 0, transform: animIn ? "translateY(0)" : "translateY(20px)", transition: "all 0.5s ease 0.1s" }}>
        {mode === "verify" ? (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📬</div>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, letterSpacing: 1, color: "#fff", marginBottom: 10 }}>Check Your Inbox</div>
            <div style={{ color: "#666", fontSize: 14, lineHeight: 1.6, marginBottom: 6 }}>A verification email has been sent to</div>
            <div style={{ color: accent, fontSize: 14, fontWeight: 700, marginBottom: 20, wordBreak: "break-all" }}>{verifiedEmail}</div>
            <div style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 10, padding: "14px 16px", fontSize: 13, color: "#555", lineHeight: 1.7, marginBottom: 24, textAlign: "left" }}>
              <div style={{ color: "#888", marginBottom: 4, fontWeight: 600 }}>Next steps:</div>
              <div>1. Open the email from Firebase / Barbell Labs</div>
              <div>2. Click the <span style={{ color: accent }}>Verify Email</span> link</div>
              <div>3. Return here to sign in</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={() => switchMode("login")} style={{ width: "100%", background: `linear-gradient(135deg, ${accent}, #4A8BC4)`, color: "#ffffff", border: "none", borderRadius: 11, padding: 14, fontSize: 16, fontWeight: 700, fontFamily: "'Bebas Neue', cursive", letterSpacing: 1, cursor: "pointer" }}>Go to Sign In</button>
            </div>
            <div style={{ marginTop: 16, fontSize: 12, color: "#3a3a3a" }}>Didn't receive it? Check your spam folder</div>
          </div>
        ) : (
          <>
            {/* Tab toggle */}
            <div style={{ display: "flex", background: "#111", borderRadius: 10, padding: 4, marginBottom: 16, gap: 4 }}>
              {["login", "signup"].map(m => (
                <button key={m} onClick={() => switchMode(m)} style={{ flex: 1, background: mode === m ? accent : "transparent", color: mode === m ? "#ffffff" : "#555", border: "none", borderRadius: 7, padding: "9px 0", cursor: "pointer", fontFamily: "'Bebas Neue', cursive", letterSpacing: 1, fontSize: 15, transition: "all 0.2s" }}>
                  {m === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
                </button>
              ))}
            </div>
            {/* Fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 8 }}>
              {mode === "signup" && (
                <div>
                  <label style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 0.6, display: "block", marginBottom: 6 }}>Username</label>
                  <input value={username} onChange={e => { setUsername(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleSubmit()} placeholder="Choose a username" autoComplete="username" style={fStyle} />
                </div>
              )}
              <div>
                <label style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 0.6, display: "block", marginBottom: 6 }}>Email</label>
                <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleSubmit()} placeholder="Enter your email" autoComplete="email" style={fStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 0.6, display: "block", marginBottom: 6 }}>Password</label>
                <div style={{ position: "relative" }}>
                  <input type={showPass ? "text" : "password"} value={password} onChange={e => { setPassword(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleSubmit()} placeholder="Enter your password" autoComplete={mode === "signup" ? "new-password" : "current-password"} style={{ ...fStyle, paddingRight: 56 }} />
                  <button onClick={() => setShowPass(s => !s)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "#555", cursor: "pointer", fontSize: 11, fontWeight: 700, padding: 4 }}>{showPass ? "HIDE" : "SHOW"}</button>
                </div>
                {mode === "signup" && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
                    {[
                      { label: "At least 8 characters",   ok: password.length >= 8 },
                      { label: "1 uppercase letter (A–Z)", ok: /[A-Z]/.test(password) },
                      { label: "1 lowercase letter (a–z)", ok: /[a-z]/.test(password) },
                      { label: "1 digit (0–9)",            ok: /[0-9]/.test(password) },
                    ].map(r => (
                      <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
                        <span style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: r.ok ? "rgba(91,184,91,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${r.ok ? "#5bb85b" : "#333"}`, fontSize: 9, transition: "all 0.2s" }}>
                          {r.ok ? <span style={{ color: "#5bb85b" }}>✓</span> : ""}
                        </span>
                        <span style={{ color: r.ok ? "#5bb85b" : "#555", transition: "color 0.2s" }}>{r.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* Fix #62: DOB + age gate — signup only */}
            {mode === "signup" && (
              <div style={{ marginTop: 10 }}>
                <label style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 0.6, display: "block", marginBottom: 6 }}>Date of Birth</label>
                <input type="date" value={dob} onChange={e => { setDob(e.target.value); setError(""); }} max={new Date().toISOString().slice(0, 10)} style={{ ...fStyle, colorScheme: "dark" }} />
                <div style={{ fontSize: 10, color: "#555", marginTop: 4 }}>You must be 13 or older. We use this to personalize features; it's never shared.</div>
              </div>
            )}
            {/* Fix #60: Privacy + Terms consent — signup only */}
            {mode === "signup" && (
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12, cursor: "pointer" }}>
                <input type="checkbox" checked={agreedToTerms} onChange={e => { setAgreedToTerms(e.target.checked); setError(""); }} style={{ marginTop: 3, accentColor: accent, cursor: "pointer", flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "#888", lineHeight: 1.5 }}>
                  I agree to the <a href="/terms.html" target="_blank" rel="noopener noreferrer" style={{ color: accent, textDecoration: "none", fontWeight: 600 }}>Terms of Service</a> and <a href="/privacy.html" target="_blank" rel="noopener noreferrer" style={{ color: accent, textDecoration: "none", fontWeight: 600 }}>Privacy Policy</a>.
                </span>
              </label>
            )}
            {error && <div style={{ background: "rgba(213,91,91,0.12)", border: "1px solid rgba(213,91,91,0.3)", color: "#d55b5b", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginBottom: 16, marginTop: 12 }}>{error}</div>}
            <button onClick={handleSubmit} style={{ width: "100%", background: `linear-gradient(135deg, ${accent}, #4A8BC4)`, color: "#ffffff", border: "none", borderRadius: 11, padding: 14, marginTop: error ? 0 : 12, fontFamily: "'Bebas Neue', cursive", letterSpacing: 1.5, fontSize: 20, cursor: "pointer" }}>
              {mode === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
            </button>
            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0 12px" }}>
              <div style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
              <span style={{ color: "#444", fontSize: 12, letterSpacing: 0.5 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
            </div>
            {/* Google Sign In */}
            <GoogleSignInButton onError={setError} />
            {/* Apple — coming soon */}
            <div style={{ textAlign: "center", fontSize: 11, color: "#444", marginTop: 10, letterSpacing: 0.3 }}>
              Apple sign-in coming soon
            </div>
          </>
        )}
      </div>
      {mode === "signup" && (
        <div style={{ marginTop: 24, color: "#333", fontSize: 12, textAlign: "center", opacity: animIn ? 1 : 0, transition: "opacity 0.5s ease 0.3s" }}>Your data is securely stored in the cloud</div>
      )}
    </div>
  );
}

// ── Streak Calculator ─────────────────────────────────────────────────
const calcStreak = (workouts) => {
  if (!workouts.length) return 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const uniqueDates = [...new Set(workouts.map(w => w.date))].sort().reverse();
  let streak = 0, expected = new Date(today);
  for (const dateStr of uniqueDates) {
    const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
    const diff = Math.round((expected - d) / 86400000);
    if (diff === 0 || diff === 1) { streak++; expected = new Date(d); }
    else break;
  }
  return streak;
};

// ── Workout Complete Screen ───────────────────────────────────────────
function WorkoutCompleteScreen({ workout, prevWorkouts, onClose }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 30);
    const t2 = setTimeout(onClose, 8000);
    if (prs.length > 0) haptic([0, 80, 40, 80, 40, 200]);
    else haptic([0, 60, 30, 60]);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onClose]); // eslint-disable-line

  // Fix #97: post-workout summary counts working + drop sets (training stimulus).
  // Warmups are excluded so the celebration screen reflects what actually trained
  // the user.
  const totalSets = workout.exercises.reduce((n, ex) => n + ex.sets.filter(isNonWarmup).length, 0);
  const totalReps = workout.exercises.reduce((n, ex) => n + ex.sets.filter(isNonWarmup).reduce((s, set) => s + (parseInt(set.reps) || 0), 0), 0);
  const prs = [];
  workout.exercises.forEach(ex => {
    const best = Math.max(0, ...ex.sets.map(s => parseFloat(s.weight) || 0));
    if (best > 0) {
      const prevBest = Math.max(0, ...prevWorkouts.flatMap(w => w.exercises.filter(e => e.name === ex.name).flatMap(e => e.sets.map(s => parseFloat(s.weight) || 0))));
      if (best > prevBest) prs.push({ name: ex.name, weight: best });
    }
  });
  const COLORS = ["#5B9BD5","#A8C8E8","#5bb85b","#ff9500","#d55b5b","#b55bd5","#ffffff"];
  const pieces = Array.from({ length: 50 }, (_, i) => ({
    id: i, color: COLORS[i % COLORS.length],
    left: Math.random() * 100, delay: Math.random() * 2.5,
    dur: 2.5 + Math.random() * 2.5, size: 5 + Math.random() * 9,
    isCircle: i % 3 === 0,
  }));

  return (
    <div data-hswipe-safe style={{ position: "fixed", inset: 0, zIndex: 2000, background: "#0a0a0a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", overflow: "hidden", opacity: visible ? 1 : 0, transition: "opacity 0.4s ease" }}>
      <style>{`@keyframes cffall{0%{transform:translateY(-20px) rotate(0deg);opacity:1}100%{transform:translateY(115vh) rotate(720deg);opacity:0}}`}</style>
      {pieces.map(c => (
        <div key={c.id} style={{ position: "absolute", top: -12, left: `${c.left}%`, width: c.size, height: c.size, background: c.color, borderRadius: c.isCircle ? "50%" : 2, animation: `cffall ${c.dur}s ${c.delay}s ease-in forwards`, opacity: 0, pointerEvents: "none" }} />
      ))}
      <div style={{ textAlign: "center", position: "relative", zIndex: 1, width: "100%", maxWidth: 340 }}>
        <div style={{ fontSize: 72, marginBottom: 6, lineHeight: 1 }}>🏆</div>
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 44, letterSpacing: 2, color: accent, lineHeight: 1 }}>WORKOUT</div>
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 44, letterSpacing: 2, color: "#fff", lineHeight: 1, marginBottom: 28 }}>COMPLETE!</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: prs.length ? 16 : 28 }}>
          {[
            { label: "Duration", value: `${workout.duration || 0}m`, icon: "⏱" },
            { label: "Exercises", value: workout.exercises.length, icon: "📋" },
            { label: "Sets", value: totalSets, icon: "🔁" },
            { label: "Total Reps", value: totalReps, icon: "💪" },
          ].map(s => (
            <div key={s.label} style={{ background: "#161616", border: "1px solid #252525", borderRadius: 16, padding: "14px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 22, marginBottom: 5 }}>{s.icon}</div>
              <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 28, color: accent, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
        {prs.length > 0 && (
          <div style={{ background: "rgba(255,149,0,0.08)", border: "1px solid rgba(255,149,0,0.3)", borderRadius: 14, padding: "12px 16px", marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#ff9500", marginBottom: 8 }}>👑 New Personal Records!</div>
            {prs.map((pr, i) => (
              <div key={i} style={{ fontSize: 13, color: "#ccc", marginBottom: i < prs.length - 1 ? 4 : 0 }}>
                <span style={{ color: "#ff9500", fontWeight: 700 }}>{pr.name}</span> — {pr.weight} lbs
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} style={{ background: `linear-gradient(135deg, ${accent}, #4A8BC4)`, color: "#ffffff", border: "none", borderRadius: 16, padding: "16px 0", fontSize: 18, fontWeight: 700, cursor: "pointer", touchAction: "manipulation", width: "100%", fontFamily: "'Bebas Neue', cursive", letterSpacing: 1 }}>
          LET'S GO 💪
        </button>
      </div>
    </div>
  );
}

// ── Plate Calculator ─────────────────────────────────────────────────
const PLATES = [45, 35, 25, 10, 5, 2.5]; // legacy — use PLATES_LBS / PLATES_KG
const PLATE_COLORS_LBS = { 45: "#d55b5b", 35: "#5B9BD5", 25: "#A8C8E8", 10: "#5bb85b", 5: "#b55bd5", 2.5: "#d5a55b" };
const PLATE_COLORS_KG  = { 25: "#d55b5b", 20: "#5B9BD5", 15: "#A8C8E8", 10: "#5bb85b", 5: "#b55bd5", 2.5: "#d5a55b", 1.25: "#ff9500" };
const PLATES_LBS = [45, 35, 25, 10, 5, 2.5];
const PLATES_KG  = [25, 20, 15, 10, 5, 2.5, 1.25];
const BAR_OPTIONS = {
  lbs: [{ label: "45 lb (Olympic)", val: 45 }, { label: "35 lb (Women's)", val: 35 }],
  kg:  [{ label: "20 kg (Olympic)", val: 20 }, { label: "15 kg (Women's)", val: 15 }],
};

function calcPlates(target, barWeight, unit, customPlates) {
  const defaults = unit === "kg" ? PLATES_KG : PLATES_LBS;
  const available = (customPlates && customPlates.length) ? customPlates.slice().sort((a, b) => b - a) : defaults;
  let remaining = Math.round(((target - barWeight) / 2) * 1000) / 1000;
  if (remaining < 0) return null;
  const result = [];
  for (const plate of available) {
    const count = Math.floor(remaining / plate);
    if (count > 0) { result.push({ weight: plate, count }); remaining = Math.round((remaining - plate * count) * 1000) / 1000; }
  }
  return { plates: result, remainder: Math.round(remaining * 1000) / 1000 };
}

// ── Fix #61 + #102: Cookie / data consent banner ──────────────────────
// Persistence strategy:
//  - Versioned localStorage key (bl_privacy_consent_v1) — fast first-paint check.
//  - Mirrored to Firestore at users/{uid}.privacyConsent — survives localStorage clears
//    AND syncs across devices (user signs in on a new phone, banner stays hidden).
//  - Bumping the suffix (v2 / v3) on policy changes will auto-re-prompt every user.
//  - One-time migration: legacy `bl_cookie_consent` (Fix #61 v0) is auto-imported on read.
//  - Settings → Privacy exposes a "Manage Cookie Preferences" → withdraw button that clears
//    both stores so the banner re-shows.
const CONSENT_KEY = "bl_privacy_consent_v1";
const LEGACY_CONSENT_KEY = "bl_cookie_consent";

function readLocalConsent() {
  try {
    let v = localStorage.getItem(CONSENT_KEY);
    if (!v) {
      // One-time migration from the unversioned Fix #61 key. Existing users don't get re-prompted.
      const legacy = localStorage.getItem(LEGACY_CONSENT_KEY);
      if (legacy) {
        localStorage.setItem(CONSENT_KEY, legacy);
        try { localStorage.removeItem(LEGACY_CONSENT_KEY); } catch {}
        v = legacy;
      }
    }
    return v || null;
  } catch { return null; }
}

function CookieBanner({ data, save }) {
  const t = useT();
  // Hidden if EITHER local or Firestore consent record exists.
  const localConsent = readLocalConsent();
  const remoteConsent = data?.privacyConsent?.acceptedAt;
  const [dismissed, setDismissed] = useState(!!(localConsent || remoteConsent));

  // If a remote consent record arrives later (e.g. fresh login on a new device, Firestore
  // snapshot fires after first render), seed localStorage and hide the banner.
  useEffect(() => {
    if (remoteConsent && !localConsent) {
      try { localStorage.setItem(CONSENT_KEY, remoteConsent); } catch {}
      setDismissed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteConsent]);

  if (dismissed) return null;

  const accept = () => {
    const stamp = new Date().toISOString();
    try { localStorage.setItem(CONSENT_KEY, stamp); } catch {}
    if (save && data) {
      save({ ...data, privacyConsent: { acceptedAt: stamp, version: "v1" } });
    }
    setDismissed(true);
  };
  return (
    <div style={{
      // Apple-tier cookie banner: frosted glass with backdrop blur.
      position: "fixed",
      bottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)",
      left: "50%", transform: "translateX(-50%)",
      width: "calc(100% - 24px)", maxWidth: 400, zIndex: 2200,
      background: "rgba(28,28,30,0.86)",
      border: "1px solid rgba(255,255,255,0.08)",
      backdropFilter: "blur(20px) saturate(140%)",
      WebkitBackdropFilter: "blur(20px) saturate(140%)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 40px rgba(0,0,0,0.5)",
      borderRadius: 16, padding: "14px 16px",
    }}>
      <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.55, marginBottom: 10 }}>
        We store workout data and a session cookie to keep you signed in. We don't sell your data or use third-party ad tracking. See the <a href="/privacy.html" target="_blank" rel="noopener noreferrer" style={{ color: accent, textDecoration: "none", fontWeight: 600 }}>Privacy Policy</a> for details.
      </div>
      <button onClick={() => { haptic(8); accept(); }} style={{
        width: "100%",
        background: `linear-gradient(135deg, ${accent}, #4A8BC4)`,
        color: "#fff", border: "none", borderRadius: 12,
        padding: "11px 0", fontSize: 14, fontWeight: 700, letterSpacing: 1,
        fontFamily: "'Bebas Neue', cursive",
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.16), 0 2px 12px ${accentGlow}`,
        cursor: "pointer",
      }}>
        GOT IT
      </button>
    </div>
  );
}

// Withdraw helper used by the Settings → Privacy → Manage Cookie Preferences button.
// Clears local + Firestore consent records so the banner re-shows on next render.
function withdrawConsent({ data, save }) {
  try { localStorage.removeItem(CONSENT_KEY); } catch {}
  try { localStorage.removeItem(LEGACY_CONSENT_KEY); } catch {}
  if (save && data) {
    const next = { ...data };
    delete next.privacyConsent;
    save(next);
  }
}

// ── Fix #105: Reusable destructive-action UI ──────────────────────────
// Hybrid pattern:
//  - Empty card / low-stakes action → undo toast only (no friction).
//  - Card with logged data / high-stakes action → ConfirmDialog with concrete
//    consequence (e.g. "You'll lose 3 logged sets") + undo toast on confirm.
// Both components are pure rendering — state lives at App level via setConfirmDialog
// and triggerUndo so they can be invoked from anywhere via prop drilling.
function ConfirmDialog({ title, message, confirmLabel, cancelLabel = "Cancel", variant = "destructive", onConfirm, onCancel }) {
  const t = useT();
  const danger = variant === "destructive";
  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={{ position: "fixed", inset: 0, zIndex: 2300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }} onClick={onCancel} />
      <div style={{ position: "relative", maxWidth: 380, width: "100%", background: t.surfaceHigh, borderRadius: 18, padding: "20px 20px 18px", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 20px 60px rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.06)", animation: "bl-card-in 0.25s ease both" }}>
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, letterSpacing: 1, color: t.text, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 14, color: t.textSub, lineHeight: 1.5, marginBottom: 18 }}>{message}</div>
        <div style={{ display: "flex", gap: 10 }}>
          {/* Fix #223: empty cancelLabel turns this into an info / acknowledge modal
              (single-button center). Used for "blocked" / "expired window" cases
              where there's nothing for the user to cancel — they just need to ack. */}
          {cancelLabel && (
            <button onClick={onCancel} style={{ flex: 1, background: "transparent", border: `1px solid ${t.border}`, color: t.textSub, borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", minHeight: 44, touchAction: "manipulation" }}>{cancelLabel}</button>
          )}
          <button onClick={onConfirm} style={{ flex: 1, background: danger ? "linear-gradient(135deg, #D96B7A, #B0566A)" : `linear-gradient(135deg, ${accent}, #4A8BC4)`, border: "none", color: "#fff", borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", minHeight: 44, touchAction: "manipulation" }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function UndoToast({ message, onUndo, onDismiss, durationMs = 5000 }) {
  const t = useT();
  useEffect(() => {
    const id = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(id);
  }, [onDismiss, durationMs]);
  return (
    <div role="status" aria-live="polite" style={{
      // Apple-tier toast: backdrop blur + inset top highlight gives the floating
      // card a "lit glass" feel above the content underneath.
      position: "fixed", bottom: TOAST_BOTTOM, left: 12, right: 12, zIndex: 2150,
      maxWidth: 396, marginLeft: "auto", marginRight: "auto",
      background: "rgba(28,28,30,0.86)",
      border: "1px solid rgba(255,255,255,0.08)",
      backdropFilter: "blur(20px) saturate(140%)",
      WebkitBackdropFilter: "blur(20px) saturate(140%)",
      borderRadius: 14, padding: "11px 14px", color: t.text, fontSize: 13, fontWeight: 600,
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.45)",
      animation: "bl-card-in 0.25s ease both",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <span style={{ flex: 1, lineHeight: 1.35 }}>{message}</span>
      <button onClick={() => { onUndo(); onDismiss(); }} style={{
        background: `linear-gradient(135deg, ${accent}, #4A8BC4)`,
        border: "none", color: "#fff", borderRadius: 8,
        padding: "7px 14px", fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.14), 0 2px 10px ${accentGlow}`,
        cursor: "pointer", flexShrink: 0, minHeight: 32, touchAction: "manipulation",
      }}>Undo</button>
    </div>
  );
}

// ── Fix #84: Warmup Calculator ────────────────────────────────────────
// Given a working-set weight, generate a 4-set warmup ladder.
// Scheme: empty bar × 8 → ~50% × 5 → ~70% × 3 → ~85% × 1.
function computeWarmup(targetWeight, barWeight, unit, customPlates) {
  const minIncrement = unit === "kg" ? 2.5 : 5;
  const rounder = (w) => Math.round(w / minIncrement) * minIncrement;
  if (!targetWeight || targetWeight <= barWeight) return [];
  const steps = [
    { label: "Empty bar", weight: barWeight, reps: 8 },
    { label: "~50%",       weight: rounder(targetWeight * 0.5), reps: 5 },
    { label: "~70%",       weight: rounder(targetWeight * 0.7), reps: 3 },
    { label: "~85%",       weight: rounder(targetWeight * 0.85), reps: 1 },
  ];
  // Deduplicate near-identical weights (e.g., target is low and two steps collapse)
  const seen = new Set();
  const unique = steps.filter(s => {
    if (s.weight >= targetWeight) return false;
    if (seen.has(s.weight)) return false;
    seen.add(s.weight);
    return true;
  });
  return unique.map(s => ({
    ...s,
    plates: calcPlates(s.weight, barWeight, unit, customPlates?.[unit]),
  }));
}

function WarmupCalculator({ onClose, customPlates }) {
  const t = useT(); const S = useS();
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("lbs");
  const [barWeight, setBarWeight] = useState(45);
  const targetNum = parseFloat(target) || 0;
  const sets = computeWarmup(targetNum, barWeight, unit, customPlates);

  return (
    <div data-hswipe-safe style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ background: t.surface, borderRadius: "20px 20px 0 0", padding: "20px 20px 32px", maxWidth: 420, width: "100%", margin: "0 auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)", maxHeight: "88vh", overflowY: "auto", WebkitOverflowScrolling: "touch" }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: t.border, borderRadius: 4, margin: "0 auto 18px" }} />
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, letterSpacing: 1, marginBottom: 14 }}>
          Warm-Up <span style={{ color: accent }}>Generator</span>
        </div>
        <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5, marginBottom: 14 }}>
          Enter your working set weight. The ladder below scales a progression to get you ready without burning reps.
        </div>

        {/* Unit toggle */}
        <div style={{ display: "flex", background: t.surfaceHigh, borderRadius: 10, padding: 3, marginBottom: 14, gap: 3 }}>
          {["lbs", "kg"].map(u => (
            <button key={u} onClick={() => { setUnit(u); setTarget(""); setBarWeight(u === "kg" ? 20 : 45); }} style={{ flex: 1, background: unit === u ? accent : "transparent", color: unit === u ? "#fff" : t.textMuted, border: "none", borderRadius: 7, padding: "8px 0", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>{u.toUpperCase()}</button>
          ))}
        </div>
        {/* Bar weight */}
        <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Bar Weight</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {BAR_OPTIONS[unit].map(opt => (
            <button key={opt.val} onClick={() => setBarWeight(opt.val)} style={{ flex: 1, background: barWeight === opt.val ? `${accent}22` : t.surfaceHigh, border: `1px solid ${barWeight === opt.val ? accent : t.border}`, borderRadius: 10, padding: "9px 8px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: barWeight === opt.val ? accent : t.textSub }}>
              {opt.label}
            </button>
          ))}
        </div>
        {/* Target input */}
        <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Working Set ({unit})</div>
        <input
          type="number" value={target} onChange={e => setTarget(e.target.value)} onFocus={e => e.target.select()} placeholder={unit === "kg" ? "e.g. 140" : "e.g. 315"}
          autoFocus inputMode="decimal"
          style={{ ...S.inputStyle({ width: "100%", fontSize: 22, padding: "12px 14px", borderRadius: 12, marginBottom: 16 }) }}
        />

        {targetNum > 0 && sets.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>Warm-Up Ladder</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {sets.map((s, i) => (
                <div key={i} style={{
                  // Apple-tier warmup ladder row: hairline + inset top highlight.
                  display: "flex", alignItems: "center", gap: 12,
                  background: t.surfaceHigh,
                  border: "1px solid rgba(255,255,255,0.06)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
                  borderRadius: 12, padding: "12px 14px",
                }}>
                  <div style={{ width: 36, textAlign: "center", fontFamily: "'Bebas Neue', cursive", fontSize: 20, color: t.textMuted }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, color: accent, lineHeight: 1 }}>{s.weight} <span style={{ fontSize: 12, color: t.textMuted }}>{unit}</span> × {s.reps}</div>
                    <div style={{ fontSize: 11, color: t.textMuted, marginTop: 3 }}>
                      {s.label}
                      {s.plates && s.plates.plates.length > 0 && (
                        <span> · each side: {s.plates.plates.map(p => `${p.count}×${p.weight}`).join(" + ")}</span>
                      )}
                      {s.plates && s.plates.plates.length === 0 && <span> · just the bar</span>}
                    </div>
                  </div>
                </div>
              ))}
              <div style={{
                // Apple-tier "working set" highlight row: Steel-Blue tint + inset highlight.
                display: "flex", alignItems: "center", gap: 12,
                background: `${accent}14`,
                border: `1px solid ${accent}33`,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
                borderRadius: 12, padding: "12px 14px",
              }}>
                <div style={{ width: 36, textAlign: "center" }}><span style={{ fontSize: 18 }}>🏋️</span></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, color: accent, lineHeight: 1 }}>{targetNum} <span style={{ fontSize: 12, color: t.textMuted }}>{unit}</span> × working</div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 3 }}>Your working set</div>
                </div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: t.textMuted, textAlign: "center", lineHeight: 1.5 }}>
              Rest 60–90s between warm-up sets · full rest before working sets
            </div>
          </>
        )}
        {targetNum > 0 && targetNum <= barWeight && (
          <div style={{ fontSize: 12, color: t.textMuted, padding: "12px 0", textAlign: "center" }}>Working set is at or below the bar weight — no warm-up needed.</div>
        )}
      </div>
    </div>
  );
}

// ── Templates ─────────────────────────────────────────────────────────
// ── Fix #9: Smart template-name suggestion ────────────────────────────
function suggestTemplateName(exercises, existingTemplates = [], workoutDate = null) {
  const cats = exercises.map(ex => {
    const hit = GYM_BIBLE.find(g => g.name === ex.name);
    return hit?.cat || "custom";
  });
  const n = (c) => cats.filter(x => x === c).length;
  const upperN = n("chest") + n("back") + n("shoulders") + n("arms");
  const legsN = n("legs");
  const coreN = n("core");

  let base;
  if (upperN > 0 && legsN > 0) {
    base = "Full Body";
  } else if (legsN > 0) {
    base = "Leg Day";
  } else if (n("chest") + n("shoulders") > 0 && n("back") === 0) {
    base = "Push Day";
  } else if (n("back") > 0 && n("chest") + n("shoulders") === 0) {
    base = "Pull Day";
  } else if (upperN > 0) {
    base = "Upper Body";
  } else if (coreN > 0) {
    base = "Core Day";
  } else if (workoutDate) {
    base = new Date(workoutDate).toLocaleDateString("en-US", { weekday: "long" }) + " Workout";
  } else {
    base = "Workout";
  }

  const taken = new Set(existingTemplates.map(t => t.name));
  if (!taken.has(base)) return base;
  for (let i = 0; i < 26; i++) {
    const cand = `${base} ${String.fromCharCode(65 + i)}`;
    if (!taken.has(cand)) return cand;
  }
  let k = 2;
  while (taken.has(`${base} ${k}`)) k++;
  return `${base} ${k}`;
}

function SaveTemplateSheet({ exercises, existingTemplates, onSave, onClose }) {
  const t = useT(); const S = useS();
  const [name, setName] = useState(() => suggestTemplateName(exercises, existingTemplates || []));
  return (
    <div data-hswipe-safe style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ background: t.surface, borderRadius: "20px 20px 0 0", padding: "20px 20px 36px", maxWidth: 420, width: "100%", margin: "0 auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: t.border, borderRadius: 4, margin: "0 auto 18px" }} />
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, letterSpacing: 1, marginBottom: 6 }}>
          Save as <span style={{ color: accent }}>Template</span>
        </div>
        <div style={{ color: t.textMuted, fontSize: 13, marginBottom: 18 }}>
          {exercises.length} exercise{exercises.length !== 1 ? "s" : ""}: {exercises.map(e => e.name).join(", ")}
        </div>
        <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Template Name</div>
        <input
          value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Push Day, Leg Day A…"
          autoFocus maxLength={40}
          onFocus={e => e.target.select()}
          onKeyDown={e => e.key === "Enter" && name.trim() && onSave(name.trim())}
          style={{ ...S.inputStyle({ width: "100%", fontSize: 16, padding: "12px 14px", borderRadius: 12, marginBottom: 18 }) }}
        />
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 600, color: t.textSub, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => name.trim() && onSave(name.trim())} disabled={!name.trim()} style={{ flex: 2, background: name.trim() ? `linear-gradient(135deg, ${accent}, #4A8BC4)` : t.surfaceHigh, border: "none", borderRadius: 12, padding: 14, fontFamily: "'Bebas Neue', cursive", fontSize: 18, letterSpacing: 1, color: name.trim() ? "#fff" : t.textMuted, cursor: name.trim() ? "pointer" : "default", transition: "all 0.2s" }}>SAVE</button>
        </div>
      </div>
    </div>
  );
}

// ── Fix #10/#13/#228: bidirectional swipeable row
//
// Swipe LEFT reveals a red Delete panel on the right edge — tap to delete.
// Swipe RIGHT reveals a green Complete panel on the left edge — tap to mark
// done (only when onComplete is provided). The two gestures are symmetric and
// match Apple Mail's swipe pattern (right = "good" action, left = destructive).
function SwipeableRow({ children, onDelete, onComplete, bgColor, borderColor, flat }) {
  const REVEAL = 90;
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(null);
  const startY = useRef(null);
  const startOffset = useRef(0);
  const horizontalLocked = useRef(false);
  const allowRight = !!onComplete;

  const onTouchStart = (e) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    startOffset.current = offset;
    horizontalLocked.current = false;
    setDragging(true);
  };
  const onTouchMove = (e) => {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (!horizontalLocked.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) { startX.current = null; return; }
      horizontalLocked.current = true;
    }
    e.stopPropagation();
    let next = startOffset.current + dx;
    // Cap and rubber-band past the reveal threshold in either direction.
    if (allowRight) {
      if (next > REVEAL) next = REVEAL + (next - REVEAL) * 0.25;
    } else {
      if (next > 0) next = 0;
    }
    if (next < -REVEAL) next = -REVEAL + (next + REVEAL) * 0.25;
    setOffset(next);
  };
  const onTouchEnd = (e) => {
    // If we engaged a horizontal swipe, the outer view-swipe handler must NOT see this end
    // event (otherwise it'd compute a delta from its captured start and switch tabs).
    if (horizontalLocked.current) e.stopPropagation();
    if (offset < -40) setOffset(-REVEAL);
    else if (allowRight && offset > 40) setOffset(REVEAL);
    else setOffset(0);
    startX.current = null;
    startY.current = null;
    horizontalLocked.current = false;
    setDragging(false);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    haptic([0, 40, 30, 80]);
    onDelete();
  };
  const handleComplete = (e) => {
    e.stopPropagation();
    haptic([0, 60, 30, 90]);
    onComplete?.();
    setOffset(0); // snap back so the green panel doesn't linger
  };
  const handleRowClick = (e) => {
    // Auto-close any open swipe-reveal as soon as the user taps anywhere on the row,
    // including buttons. Previously the button check was meant to let users tap an
    // inner button (✓, type indicator, RPE chip) without losing the swipe state —
    // but in practice that just leaves the red trash reveal hanging next to a tapped
    // button which looks broken (Brian feedback on #97). Tapping any control should
    // dismiss the reveal.
    if (offset !== 0) {
      e.stopPropagation();
      setOffset(0);
    }
  };

  return (
    <div data-hswipe-safe style={{ position: "relative", overflow: "hidden", borderRadius: flat ? 10 : 14, marginBottom: flat ? 0 : 10, border: flat ? "none" : `1px solid ${borderColor}` }}>
      {/* Green ✓ Complete panel — sits on the LEFT edge, revealed by swiping right.
          Only rendered when onComplete is provided so we don't show a phantom green
          slab on rows that have no completion semantics (templates, History etc). */}
      {allowRight && (
        <button onClick={handleComplete} style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: REVEAL, background: "linear-gradient(135deg, #5bb85b, #3a8a3a)", border: "none", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, touchAction: "manipulation", letterSpacing: 0.3, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)" }}>
          <Icon name="check" size={flat ? 16 : 20} />
          {!flat && "Done"}
        </button>
      )}
      <button onClick={handleDelete} style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: REVEAL, background: "#d55b5b", border: "none", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, touchAction: "manipulation", letterSpacing: 0.3 }}>
        <Icon name="trash" size={flat ? 14 : 18} />
        {!flat && "Delete"}
      </button>
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={handleRowClick}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: "transform",
          background: bgColor,
          padding: flat ? 0 : "14px 16px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function TemplateManager({ templates, onLoad, onDelete, onRename, onClose }) {
  const t = useT(); const S = useS();
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  return (
    <div data-hswipe-safe style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ background: t.surface, borderRadius: "20px 20px 0 0", padding: "20px 20px 36px", maxWidth: 420, width: "100%", margin: "0 auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)", maxHeight: "80vh", overflowY: "auto", WebkitOverflowScrolling: "touch" }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: t.border, borderRadius: 4, margin: "0 auto 18px" }} />
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, letterSpacing: 1, marginBottom: 18 }}>
          My <span style={{ color: accent }}>Templates</span>
        </div>
        {templates.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 0", color: t.textMuted, fontSize: 14 }}>
            No templates yet.<br/>Save a workout as a template to load it here.
          </div>
        )}
        {templates.map(tmpl => (
          <SwipeableRow key={tmpl.id} onDelete={() => onDelete(tmpl.id)} bgColor={t.surfaceHigh} borderColor={t.border}>
            {renamingId === tmpl.id ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input value={renameVal} onChange={e => setRenameVal(e.target.value)} autoFocus maxLength={40}
                  onKeyDown={e => { if (e.key === "Enter" && renameVal.trim()) { onRename(tmpl.id, renameVal.trim()); setRenamingId(null); } if (e.key === "Escape") setRenamingId(null); }}
                  style={{ ...S.inputStyle({ flex: 1, fontSize: 14, padding: "8px 12px", borderRadius: 8 }) }} />
                <button onClick={() => { if (renameVal.trim()) { onRename(tmpl.id, renameVal.trim()); setRenamingId(null); } }} style={{ background: accent, border: "none", borderRadius: 8, padding: "8px 14px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Save</button>
                <button onClick={() => setRenamingId(null)} style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: "8px 12px", color: t.textMuted, fontSize: 13, cursor: "pointer" }}>✕</button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: t.text }}>{tmpl.name}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => { setRenamingId(tmpl.id); setRenameVal(tmpl.name); }} style={{ background: "transparent", border: `1px solid ${t.border}`, borderRadius: 8, padding: "9px 14px", fontSize: 13, color: t.textMuted, cursor: "pointer", minHeight: 44, touchAction: "manipulation" }}>Rename</button>
                    <button onClick={() => onDelete(tmpl.id)} style={{ background: "transparent", border: "1px solid rgba(213,91,91,0.3)", borderRadius: 8, padding: "9px 14px", fontSize: 13, color: "#d55b5b", cursor: "pointer", minHeight: 44, touchAction: "manipulation" }}>Delete</button>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 10 }}>{tmpl.exercises.length} exercise{tmpl.exercises.length !== 1 ? "s" : ""} · {tmpl.exercises.map(e => e.name).join(", ")}</div>
                <button onClick={() => { onLoad(tmpl); onClose(); }} style={{ width: "100%", background: `linear-gradient(135deg, ${accent}22, ${accent}11)`, border: `1px solid ${accent}44`, borderRadius: 10, padding: "10px 0", fontFamily: "'Bebas Neue', cursive", fontSize: 16, letterSpacing: 1, color: accent, cursor: "pointer" }}>
                  LOAD TEMPLATE
                </button>
              </>
            )}
          </SwipeableRow>
        ))}
        <button onClick={onClose} style={{ ...S.solidBtn({ marginTop: 8, width: "100%", padding: 14, fontSize: 16 }) }}>Done</button>
      </div>
    </div>
  );
}

function OneRMCalculator({ onClose, formula = "avg" }) {
  const t = useT(); const S = useS();
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [showFormulaInfo, setShowFormulaInfo] = useState(false);
  const w = parseFloat(weight) || 0;
  const r = parseInt(reps) || 0;
  const valid = w > 0 && r >= 1 && r <= 15;
  const epley   = valid ? Math.round(w * (1 + r / 30)) : null;
  const brzycki = valid && r < 37 ? Math.round(w * (36 / (37 - r))) : null;
  // Fix #81: respect user's preferred formula
  const best1RM = formula === "epley"   ? epley
               : formula === "brzycki" ? brzycki
               : (epley && brzycki ? Math.round((epley + brzycki) / 2) : (epley || brzycki || null));
  const formulaLabel = formula === "epley" ? "Epley" : formula === "brzycki" ? "Brzycki" : "Epley + Brzycki avg";
  const PCTS = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50];

  return (
    <div data-hswipe-safe style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ background: t.surface, borderRadius: "20px 20px 0 0", padding: "20px 20px 32px", maxWidth: 420, width: "100%", margin: "0 auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)", maxHeight: "88vh", overflowY: "auto", WebkitOverflowScrolling: "touch" }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: t.border, borderRadius: 4, margin: "0 auto 18px" }} />
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, letterSpacing: 1, marginBottom: 18 }}>
          1RM <span style={{ color: accent }}>Estimator</span>
        </div>

        {/* Inputs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Weight (lbs)</div>
            <input type="number" value={weight} onChange={e => setWeight(e.target.value)} onFocus={e => e.target.select()} placeholder="e.g. 185" inputMode="decimal" enterKeyHint="next" autoFocus
              style={{ ...S.inputStyle({ width: "100%", fontSize: 20, padding: "11px 14px", borderRadius: 12 }) }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Reps (1–15)</div>
            <input type="number" value={reps} onChange={e => setReps(e.target.value)} onFocus={e => e.target.select()} placeholder="e.g. 5" inputMode="numeric" enterKeyHint="done" min="1" max="15"
              style={{ ...S.inputStyle({ width: "100%", fontSize: 20, padding: "11px 14px", borderRadius: 12 }) }} />
          </div>
        </div>

        {!valid && weight !== "" && reps !== "" && (
          <div style={{ fontSize: 12, color: "#d55b5b", marginBottom: 14 }}>Enter a weight and reps between 1 and 15 for an accurate estimate.</div>
        )}

        {best1RM && (
          <>
            {/* Big 1RM display */}
            <div style={{
              // Apple-tier 1RM result card: Steel-Blue tint + inset top highlight + soft glow.
              background: `${accent}14`,
              border: `1px solid ${accent}33`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 24px ${accentGlow}`,
              borderRadius: 18, padding: "18px 20px", marginBottom: 18,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: t.textMuted }}>Estimated 1RM</span>
                  <button onClick={() => setShowFormulaInfo(v => !v)} aria-label="Formula info" style={{ background: "transparent", border: `1px solid ${t.border}`, borderRadius: "50%", width: 16, height: 16, padding: 0, color: t.textMuted, fontSize: 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>ⓘ</button>
                </div>
                <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 44, color: accent, lineHeight: 1 }}>{best1RM} <span style={{ fontSize: 16, color: t.textMuted }}>lbs</span></div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>Formula: {formulaLabel} · Epley {epley} · Brzycki {brzycki}</div>
              </div>
              <div style={{ fontSize: 48, lineHeight: 1 }}>🏆</div>
            </div>
            {/* Fix #81: formula explanation panel */}
            {showFormulaInfo && (
              <div style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 18, fontSize: 12, color: t.textSub, lineHeight: 1.6 }}>
                <div style={{ fontWeight: 700, color: t.text, marginBottom: 4 }}>About these estimates</div>
                <div style={{ marginBottom: 6 }}><span style={{ fontFamily: "'Space Mono', monospace", color: t.text }}>Epley: w × (1 + r/30)</span> — widely used, tends to slightly over-estimate at higher reps.</div>
                <div style={{ marginBottom: 6 }}><span style={{ fontFamily: "'Space Mono', monospace", color: t.text }}>Brzycki: w × 36/(37 − r)</span> — slightly conservative at higher reps. Breaks down past 36 reps.</div>
                <div>Pick your preferred formula in <span style={{ color: accent, fontWeight: 600 }}>Profile → Settings → Workout Preferences</span>.</div>
              </div>
            )}

            {/* Percentage table */}
            <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>Training Percentages</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {PCTS.map(pct => {
                const liftWeight = Math.round(best1RM * pct / 100 / 2.5) * 2.5;
                const isWorking = pct >= 75 && pct <= 90;
                return (
                  <div key={pct} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: isWorking ? `${accent}10` : t.surfaceHigh, border: `1px solid ${isWorking ? accent + "33" : t.border}`, borderRadius: 8, padding: "8px 12px" }}>
                    <span style={{ fontSize: 12, color: isWorking ? accent : t.textMuted, fontWeight: isWorking ? 700 : 400 }}>{pct}%</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{liftWeight} lbs</span>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 10, textAlign: "center" }}>Highlighted = typical working set range (75–90%)</div>
          </>
        )}

        <button onClick={onClose} style={{ ...S.solidBtn({ marginTop: 18, width: "100%", padding: 14, fontSize: 16 }) }}>Done</button>
      </div>
    </div>
  );
}

function PlateCalculator({ onClose, customPlates, onCustomPlatesChange }) {
  const t = useT(); const S = useS();
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("lbs");
  const [barWeight, setBarWeight] = useState(45);
  const [showCustomPlates, setShowCustomPlates] = useState(false);
  const COLORS = unit === "kg" ? PLATE_COLORS_KG : PLATE_COLORS_LBS;
  const allPlates = unit === "kg" ? PLATES_KG : PLATES_LBS;
  const customForUnit = customPlates?.[unit];
  const activePlates = (customForUnit && customForUnit.length) ? customForUnit : allPlates;
  const result = target ? calcPlates(parseFloat(target) || 0, barWeight, unit, activePlates) : null;
  const total = result ? barWeight + result.plates.reduce((s, p) => s + p.weight * p.count * 2, 0) : 0;
  const targetNum = parseFloat(target) || 0;

  // Visual bar diagram
  const BarDiagram = ({ plates }) => {
    const sideColors = plates.flatMap(p => Array(p.count).fill(COLORS[p.weight] || "#888"));
    const maxPlates = 6;
    const shown = sideColors.slice(0, maxPlates);
    const extra = sideColors.length - maxPlates;
    const plateW = 14;
    const plateH = (p) => {
      const w = p.weight;
      if (w >= 45 || w >= 25) return 52;
      if (w >= 35 || w >= 20) return 46;
      if (w >= 25 || w >= 15) return 40;
      if (w >= 10) return 34;
      if (w >= 5) return 28;
      return 22;
    };
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 16, height: 64, overflow: "hidden" }}>
        {/* Left sleeve */}
        <div style={{ width: 18, height: 10, background: "#555", borderRadius: "3px 0 0 3px" }} />
        {/* Left plates (reversed — closest to center first visually) */}
        {[...shown].reverse().map((color, i) => {
          const plate = plates[plates.length - 1 - Math.floor(i / (shown.length / plates.length))] || plates[0];
          const h = plateH(plate);
          return <div key={i} style={{ width: plateW, height: h, background: color + "CC", border: `1.5px solid ${color}`, borderRadius: 2, flexShrink: 0 }} />;
        })}
        {extra > 0 && <div style={{ width: 16, fontSize: 9, color: t.textMuted, textAlign: "center", lineHeight: 1 }}>+{extra}</div>}
        {/* Bar center */}
        <div style={{ width: 60, height: 10, background: "#888", flexShrink: 0 }} />
        {/* Right plates */}
        {shown.map((color, i) => {
          const plate = plates[Math.floor(i / (shown.length / plates.length))] || plates[0];
          const h = plateH(plate);
          return <div key={i} style={{ width: plateW, height: h, background: color + "CC", border: `1.5px solid ${color}`, borderRadius: 2, flexShrink: 0 }} />;
        })}
        {extra > 0 && <div style={{ width: 16, fontSize: 9, color: t.textMuted, textAlign: "center", lineHeight: 1 }}>+{extra}</div>}
        {/* Right sleeve */}
        <div style={{ width: 18, height: 10, background: "#555", borderRadius: "0 3px 3px 0" }} />
      </div>
    );
  };

  return (
    <div data-hswipe-safe style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ background: t.surface, borderRadius: "20px 20px 0 0", padding: "20px 20px 32px", maxWidth: 420, width: "100%", margin: "0 auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)", maxHeight: "88vh", overflowY: "auto", WebkitOverflowScrolling: "touch" }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: t.border, borderRadius: 4, margin: "0 auto 18px" }} />
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, letterSpacing: 1, marginBottom: 14 }}>
          Plate <span style={{ color: accent }}>Calculator</span>
        </div>

        {/* Unit toggle */}
        <div style={{ display: "flex", background: t.surfaceHigh, borderRadius: 10, padding: 3, marginBottom: 14, gap: 3 }}>
          {["lbs", "kg"].map(u => (
            <button key={u} onClick={() => { setUnit(u); setTarget(""); setBarWeight(u === "kg" ? 20 : 45); }} style={{ flex: 1, background: unit === u ? accent : "transparent", color: unit === u ? "#fff" : t.textMuted, border: "none", borderRadius: 7, padding: "8px 0", cursor: "pointer", fontWeight: 700, fontSize: 13, transition: "all 0.2s" }}>{u.toUpperCase()}</button>
          ))}
        </div>

        {/* Bar weight selector */}
        <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Bar Weight</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {BAR_OPTIONS[unit].map(opt => (
            <button key={opt.val} onClick={() => setBarWeight(opt.val)} style={{ flex: 1, background: barWeight === opt.val ? `${accent}22` : t.surfaceHigh, border: `1px solid ${barWeight === opt.val ? accent : t.border}`, borderRadius: 10, padding: "9px 8px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: barWeight === opt.val ? accent : t.textSub, transition: "all 0.2s" }}>
              {opt.label}
            </button>
          ))}
        </div>

        {/* Fix #79: Customize available plates per gym */}
        {onCustomPlatesChange && (
          <div style={{ marginBottom: 14 }}>
            <button onClick={() => setShowCustomPlates(v => !v)} style={{ background: "transparent", border: "none", color: accent, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0, letterSpacing: 0.3 }}>
              {showCustomPlates ? "Hide" : "Customize"} plates at my gym {showCustomPlates ? "▲" : "▼"}
            </button>
            {showCustomPlates && (
              <div style={{ marginTop: 8, padding: "10px 12px", background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 10 }}>
                <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 8, lineHeight: 1.5 }}>
                  Tap a plate to toggle it. Greyed-out plates won't be used in calculations.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {allPlates.map(p => {
                    const enabled = activePlates.includes(p);
                    return (
                      <button key={p} onClick={() => {
                        const current = (customForUnit && customForUnit.length) ? customForUnit.slice() : allPlates.slice();
                        const next = enabled ? current.filter(x => x !== p) : [...current, p];
                        onCustomPlatesChange({ ...(customPlates || {}), [unit]: next.sort((a, b) => b - a) });
                      }} style={{ background: enabled ? `${COLORS[p] || accent}22` : "transparent", border: `1px solid ${enabled ? (COLORS[p] || accent) : t.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, color: enabled ? (COLORS[p] || accent) : t.textMuted, cursor: "pointer", opacity: enabled ? 1 : 0.5, touchAction: "manipulation" }}>
                        {p} {unit}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Target input */}
        <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Target Weight ({unit})</div>
        <input
          type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder={unit === "kg" ? "e.g. 100" : "e.g. 225"}
          autoFocus inputMode="decimal"
          style={{ ...S.inputStyle({ width: "100%", fontSize: 22, padding: "12px 14px", borderRadius: 12, marginBottom: 16 }) }}
        />

        {result && (
          <>
            {result.plates.length > 0 && <BarDiagram plates={result.plates} />}
            <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>Each side of the bar</div>
            {result.plates.length === 0 && result.remainder === 0 && (
              <div style={{ color: t.textMuted, fontSize: 14, marginBottom: 8 }}>Just the bar ({barWeight} {unit})</div>
            )}
            {result.plates.map(p => (
              <div key={p.weight} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: (COLORS[p.weight] || "#888") + "22", border: `2px solid ${COLORS[p.weight] || "#888"}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Bebas Neue', cursive", fontSize: 16, color: COLORS[p.weight] || "#888", flexShrink: 0 }}>
                  {p.weight}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: t.text }}>× {p.count}</div>
                  <div style={{ fontSize: 11, color: t.textMuted }}>{p.weight * p.count} {unit} per side</div>
                </div>
              </div>
            ))}
            {result.remainder > 0 && (
              <div style={{ fontSize: 12, color: "#d55b5b", marginTop: 4 }}>⚠ {result.remainder} {unit} unaccounted — not achievable with standard plates</div>
            )}
            <div style={{ marginTop: 14, padding: "10px 14px", background: t.surfaceHigh, borderRadius: 10, border: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: t.textMuted }}>Actual weight loaded</span>
              <span style={{ fontWeight: 700, color: Math.abs(total - targetNum) < 0.01 ? "#5bb85b" : accent }}>{total} {unit}</span>
            </div>
          </>
        )}
        {result === null && target !== "" && (
          <div style={{ fontSize: 13, color: "#d55b5b", marginBottom: 8 }}>Weight must be greater than bar weight ({barWeight} {unit})</div>
        )}
        <button onClick={onClose} style={{ ...S.solidBtn({ marginTop: 18, width: "100%", padding: 14, fontSize: 16 }) }}>Done</button>
      </div>
    </div>
  );
}

// ── Count-Up Hook ─────────────────────────────────────────────────────
function useCountUp(target, duration = 700) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(eased * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return value;
}

function StatCard({ icon, color, label, value }) {
  const displayed = useCountUp(value);
  return (
    <div style={{
      // Apple-tier stat tile: hairline border + inset top highlight + soft color
      // accent on the top edge (3px bar in the stat's color). Reads as iOS Health
      // / Fitness tile language.
      background: "var(--bl-surface)",
      borderRadius: 18,
      padding: "20px 8px 16px",
      textAlign: "center",
      border: "1px solid rgba(255,255,255,0.06)",
      borderTop: `3px solid ${color}`,
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 24px rgba(0,0,0,0.22)",
    }}>
      <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 32, color, lineHeight: 1 }}>{displayed}</div>
      <div style={{ fontSize: 10, color: "var(--bl-muted)", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
    </div>
  );
}

// ── Verify-Email Gate (blocks app until email is verified) ────────────
// ── Fix #28: First-run onboarding tour ────────────────────────────────
const ONBOARDING_STEPS = [
  {
    emoji: "👋",
    title: "Welcome to Barbell Labs",
    body: "A quick 30-second tour of how to log, track, and improve your lifts. You can replay this anytime from any Help sheet.",
  },
  {
    emoji: "📝",
    title: "Log your workouts",
    body: "The Log tab is where every session lives. Start a workout, add exercises, enter weight × reps — the Coach card suggests your next target from your history.",
  },
  {
    emoji: "🕒",
    title: "Review + tag your history",
    body: "The History tab groups your past sessions and lets you tag them (Push, Pull, custom…). Search by exercise, filter by date range, and export your full history to CSV.",
  },
  {
    emoji: "📈",
    title: "Track progression + PRs",
    body: "Progress charts your lifts over time with a crown on every new PR. The bell on Home also notifies you when you unlock a new record or hit a streak milestone.",
  },
];

function OnboardingTour({ onDone }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const s = ONBOARDING_STEPS[step];
  const isLast = step === ONBOARDING_STEPS.length - 1;
  return (
    <div data-hswipe-safe style={{ position: "fixed", inset: 0, zIndex: 2500, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 20px" }}>
      <div style={{
        // Apple-tier onboarding card: hairline + inset top highlight + soft shadow.
        width: "100%", maxWidth: 360,
        background: t.surface,
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 20px 60px rgba(0,0,0,0.6)",
        borderRadius: 22, padding: "30px 24px", textAlign: "center",
      }}>
        <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 14 }}>{s.emoji}</div>
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 28, letterSpacing: 1.5, color: t.text, marginBottom: 10 }}>{s.title}</div>
        <div style={{ color: t.textSub, fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>{s.body}</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 20 }}>
          {ONBOARDING_STEPS.map((_, i) => (
            <span key={i} style={{
              // Apple-tier page indicators: longer pill for active, subtle dots for inactive.
              width: i === step ? 22 : 7, height: 7, borderRadius: 4,
              background: i === step ? accent : "rgba(255,255,255,0.18)",
              transition: "all 0.25s",
            }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => { haptic(8); onDone(); }} style={{
            // Ghost button — translucent + hairline border, no dashes.
            flex: 1,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
            color: t.textMuted, borderRadius: 12,
            padding: "12px 0", fontSize: 13, fontWeight: 600, letterSpacing: 0.3,
            cursor: "pointer", touchAction: "manipulation",
          }}>
            {isLast ? "Close" : "Skip"}
          </button>
          <button onClick={() => { haptic(8); isLast ? onDone() : setStep(step + 1); }} style={{
            // Steel-Blue primary with inset highlight + soft glow.
            flex: 2,
            background: `linear-gradient(135deg, ${accent}, #4A8BC4)`,
            border: "none", color: "#fff",
            borderRadius: 12, padding: "12px 0",
            fontSize: 15, fontWeight: 700, fontFamily: "'Bebas Neue', cursive", letterSpacing: 1,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 16px ${accentGlow}`,
            cursor: "pointer", touchAction: "manipulation",
          }}>
            {isLast ? "LET'S GO" : "NEXT"}
          </button>
        </div>
      </div>
    </div>
  );
}

function VerifyEmailScreen({ user, onSignOut }) {
  const [sent, setSent] = useState(false);
  const [err,  setErr]  = useState(null);
  const [busy, setBusy] = useState(false);

  const resend = async () => {
    setBusy(true); setErr(null);
    try { await sendEmailVerification(user); setSent(true); }
    catch (e) { setErr(e?.message || "Failed to send. Try again later."); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ background: "#0A0A0A", minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 28px", fontFamily: "'DM Sans', sans-serif", maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
      <div style={{ fontSize: 56, marginBottom: 14 }}>📬</div>
      <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 28, letterSpacing: 2, color: "#fff", marginBottom: 10 }}>Verify Your Email</div>
      <div style={{ color: "#999", fontSize: 14, lineHeight: 1.6, marginBottom: 4 }}>We sent a verification link to</div>
      <div style={{ color: "#5B9BD5", fontSize: 14, fontWeight: 700, marginBottom: 20, wordBreak: "break-all" }}>{user.email}</div>
      <div style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 12, padding: "14px 16px", fontSize: 13, color: "#888", lineHeight: 1.7, marginBottom: 20, textAlign: "left", width: "100%", maxWidth: 320 }}>
        <div style={{ color: "#ccc", marginBottom: 4, fontWeight: 600 }}>To access your account:</div>
        <div>1. Open the email from Firebase / Barbell Labs</div>
        <div>2. Click the <span style={{ color: "#5B9BD5" }}>Verify Email</span> link</div>
        <div>3. Reload this page</div>
      </div>
      {err && <div style={{ color: "#d55b5b", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {sent
        ? <div style={{ color: "#5bb85b", fontSize: 14, fontWeight: 600, marginBottom: 16 }}>✓ Verification email resent</div>
        : <button onClick={resend} disabled={busy} style={{ width: "100%", maxWidth: 320, background: "linear-gradient(135deg, #5B9BD5, #4A8BC4)", color: "#fff", border: "none", borderRadius: 11, padding: 14, fontFamily: "'Bebas Neue', cursive", letterSpacing: 1.5, fontSize: 18, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1, marginBottom: 12 }}>{busy ? "Sending…" : "Resend Email"}</button>
      }
      <button onClick={() => window.location.reload()} style={{ background: "transparent", border: "none", color: "#5B9BD5", fontSize: 13, cursor: "pointer", padding: 6 }}>I've verified — reload</button>
      <button onClick={onSignOut} style={{ background: "transparent", border: "none", color: "#666", fontSize: 12, cursor: "pointer", padding: 6 }}>Sign out</button>
    </div>
  );
}

// ── Fix #7: Notifications (client-side, computed from workout data) ───
const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 365];
const NUDGE_THRESHOLD_DAYS = 4;

const notifId = () => {
  try { return crypto.randomUUID(); }
  catch { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
};

function formatRelative(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(diff / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function computeWorkoutNotifications(data, newWorkout, prevWorkouts) {
  const out = [];
  const state = data.notificationState || { since: new Date().toISOString(), lastStreakMilestone: 0 };
  const now = new Date().toISOString();

  newWorkout.exercises.forEach(ex => {
    const best = Math.max(0, ...ex.sets.map(s => parseFloat(s.weight) || 0));
    if (best <= 0) return;
    const prevBest = Math.max(0, ...prevWorkouts.flatMap(w => w.exercises.filter(e => e.name === ex.name).flatMap(e => e.sets.map(s => parseFloat(s.weight) || 0))));
    if (prevBest > 0 && best > prevBest) {
      out.push({
        id: notifId(), type: "pr", emoji: "🏆", read: false, timestamp: now,
        title: `New PR — ${ex.name}`,
        body: `${best} lbs beats your previous best of ${prevBest} lbs.`,
      });
    } else if (prevBest === 0) {
      out.push({
        id: notifId(), type: "pr", emoji: "⭐", read: false, timestamp: now,
        title: `First log — ${ex.name}`,
        body: `Baseline set at ${best} lbs. Next session's the real test.`,
      });
    }
  });

  const streak = calcStreak([newWorkout, ...prevWorkouts]);
  const nextMs = STREAK_MILESTONES.find(m => streak >= m && (state.lastStreakMilestone || 0) < m);
  let lastMs = state.lastStreakMilestone || 0;
  if (nextMs) {
    out.push({
      id: notifId(), type: "streak", emoji: "🔥", read: false, timestamp: now,
      title: `${nextMs}-day streak!`,
      body: `You've logged a workout ${nextMs} days running. Keep it up.`,
    });
    lastMs = nextMs;
  }

  if (out.length === 0) return null;
  return {
    notifications: [...out, ...(data.notifications || [])].slice(0, 100),
    notificationState: { ...state, lastStreakMilestone: lastMs },
  };
}

function computeMissedWorkoutNudge(data) {
  const workouts = data.workouts || [];
  if (workouts.length === 0) return null;
  const lastDate = workouts.reduce((m, w) => w.date > m ? w.date : m, workouts[0].date);
  const daysSince = Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000);
  if (daysSince < NUDGE_THRESHOLD_DAYS) return null;
  const state = data.notificationState || {};
  const lastNudge = state.lastNudgeDate ? new Date(state.lastNudgeDate) : null;
  if (lastNudge && lastNudge > new Date(lastDate)) return null;
  const now = new Date().toISOString();
  return {
    notifications: [
      { id: notifId(), type: "nudge", emoji: "💭", read: false, timestamp: now,
        title: `${daysSince} days without a workout`,
        body: "Your streak is waiting — log a quick session to keep the momentum." },
      ...(data.notifications || []),
    ].slice(0, 100),
    notificationState: { ...state, lastNudgeDate: now },
  };
}

// ── Tools Menu (Log screen overflow: 1RM, Plates, etc.) ──────────────
// Fix #24: History overflow menu (Export workouts, future: Delete all, etc.)
function HistoryMenu({ onClose, onExportAll, onExportFiltered, filteredCount, totalCount, hasFilter }) {
  const t = useT();
  const items = [];
  if (hasFilter) {
    items.push({ icon: "download", label: `Export filtered (${filteredCount})`, sub: "Only the workouts matching your current search / date range", onClick: onExportFiltered });
  }
  items.push({ icon: "download", label: hasFilter ? `Export all (${totalCount})` : "Export Workouts (CSV)", sub: hasFilter ? "Your full workout history, ignoring current filters" : "Download your full workout history as a spreadsheet", onClick: onExportAll });
  return (
    <div data-hswipe-safe style={{ position: "fixed", inset: 0, zIndex: 900, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} />
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: "100%", maxWidth: 420, background: t.surface, borderRadius: "20px 20px 0 0", padding: "0 20px calc(env(safe-area-inset-bottom, 0px) + 24px)", maxHeight: "70dvh", overflowY: "auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.4)" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: t.border }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: `1px solid ${t.border}`, marginBottom: 12 }}>
          <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, letterSpacing: 1 }}>
            History <span style={{ color: accent }}>Menu</span>
          </div>
          <button onClick={onClose} style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: t.textMuted }}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map(item => (
            <button key={item.label} onClick={() => { item.onClick(); onClose(); }} style={{ display: "flex", gap: 14, alignItems: "center", textAlign: "left", background: t.surfaceHigh, border: "1px solid rgba(255,255,255,0.06)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)", borderRadius: 12, padding: "13px 16px", cursor: "pointer", color: t.text, width: "100%", boxSizing: "border-box" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${accent}18`, border: `1px solid ${accent}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: accent }}>
                <Icon name={item.icon} size={16} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{item.label}</div>
                <div style={{ color: t.textSub, fontSize: 12, lineHeight: 1.4 }}>{item.sub}</div>
              </div>
              <Icon name="chevronRight" size={14} color={t.textMuted} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ToolsMenu({ onClose, on1RM, onPlates, onWarmup }) {
  const t = useT();
  const items = [
    { icon: "zap",      label: "1RM Calculator",    sub: "Estimate your 1-rep max from any weight × reps",     onClick: on1RM },
    { icon: "dumbbell", label: "Plate Calculator",  sub: "Pick a target weight, see the plates you need",      onClick: onPlates },
    { icon: "timer",    label: "Warm-Up Generator", sub: "Ladder up to a working set — 4 warmup sets scaled",  onClick: onWarmup },
  ];
  return (
    <div data-hswipe-safe style={{ position: "fixed", inset: 0, zIndex: 900, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} />
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: "100%", maxWidth: 420, background: t.surface, borderRadius: "20px 20px 0 0", padding: "0 20px calc(env(safe-area-inset-bottom, 0px) + 24px)", maxHeight: "70dvh", overflowY: "auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.4)" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: t.border }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: `1px solid ${t.border}`, marginBottom: 12 }}>
          <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, letterSpacing: 1 }}>
            <span style={{ color: accent }}>Tools</span>
          </div>
          <button onClick={onClose} style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: t.textMuted }}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map(item => (
            <button key={item.label} onClick={() => { item.onClick(); onClose(); }} style={{ display: "flex", gap: 14, alignItems: "center", textAlign: "left", background: t.surfaceHigh, border: "1px solid rgba(255,255,255,0.06)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)", borderRadius: 12, padding: "13px 16px", cursor: "pointer", color: t.text, width: "100%", boxSizing: "border-box" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${accent}18`, border: `1px solid ${accent}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: accent }}>
                <Icon name={item.icon} size={16} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{item.label}</div>
                <div style={{ color: t.textSub, fontSize: 12, lineHeight: 1.4 }}>{item.sub}</div>
              </div>
              <Icon name="chevronRight" size={14} color={t.textMuted} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Notifications Modal ───────────────────────────────────────────────
// ── Fix #12: Program Browser (Browse Starter Programs) ───────────────
function ProgramBrowser({ onClose, onFork, onStart }) {
  const t = useT();
  const [selectedId, setSelectedId] = useState(null);
  const program = selectedId ? STARTER_PROGRAMS.find(p => p.id === selectedId) : null;
  const levelColor = (lvl) => lvl === "Beginner" ? "#5bb85b" : lvl === "Intermediate" ? "#ff9500" : "#d55b5b";

  return (
    <div data-hswipe-safe style={{ position: "fixed", inset: 0, zIndex: 900, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} />
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: "100%", maxWidth: 420, background: t.surface, borderRadius: "20px 20px 0 0", padding: "0 20px calc(env(safe-area-inset-bottom, 0px) + 24px)", maxHeight: "88dvh", overflowY: "auto", WebkitOverflowScrolling: "touch", boxShadow: "0 -8px 40px rgba(0,0,0,0.4)" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: t.border }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: `1px solid ${t.border}`, marginBottom: 16, gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            {program && (
              <button onClick={() => setSelectedId(null)} style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: t.textMuted, flexShrink: 0 }}>
                <Icon name="chevronRight" size={14} color={t.textMuted} />
              </button>
            )}
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, letterSpacing: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {program ? program.short : <>Browse <span style={{ color: accent }}>Programs</span></>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: t.textMuted, flexShrink: 0 }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        {!program && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {STARTER_PROGRAMS.map(p => (
              <button key={p.id} onClick={() => setSelectedId(p.id)} style={{ textAlign: "left", background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 14, padding: "14px 16px", cursor: "pointer", color: t.text, width: "100%", boxSizing: "border-box" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: t.text, flex: 1, minWidth: 0 }}>{p.name}</div>
                  <Icon name="chevronRight" size={14} color={t.textMuted} />
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  <span style={{ background: `${levelColor(p.level)}20`, color: levelColor(p.level), borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase" }}>{p.level}</span>
                  <span style={{ background: t.surface, border: `1px solid ${t.border}`, color: t.textSub, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>{p.goal}</span>
                  <span style={{ color: t.textMuted, fontSize: 11, fontWeight: 500, padding: "2px 4px" }}>{p.frequency}</span>
                </div>
                <div style={{ color: t.textSub, fontSize: 12, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{p.description}</div>
              </button>
            ))}
          </div>
        )}

        {program && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                <span style={{ background: `${levelColor(program.level)}20`, color: levelColor(program.level), borderRadius: 6, padding: "3px 10px", fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase" }}>{program.level}</span>
                <span style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, color: t.textSub, borderRadius: 6, padding: "3px 10px", fontSize: 10, fontWeight: 600 }}>{program.goal}</span>
                <span style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, color: t.textSub, borderRadius: 6, padding: "3px 10px", fontSize: 10, fontWeight: 600 }}>{program.frequency}</span>
                {program.author && <span style={{ background: "transparent", color: t.textMuted, fontSize: 10, padding: "3px 2px", fontStyle: "italic" }}>by {program.author}</span>}
              </div>
              <div style={{ color: t.textSub, fontSize: 13, lineHeight: 1.6 }}>{program.description}</div>
            </div>
            <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, marginBottom: 10 }}>Workouts ({program.workouts.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {program.workouts.map((w, wi) => (
                <div key={wi} style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 14, padding: "12px 14px" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: t.text, marginBottom: 4 }}>{w.name}</div>
                  <div style={{ color: t.textMuted, fontSize: 11, marginBottom: 10, lineHeight: 1.5 }}>{w.exercises.map(e => e.name).join(" · ")}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { onFork(program, w); }} style={{ flex: 1, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 0", fontSize: 12, fontWeight: 700, color: t.textSub, cursor: "pointer", letterSpacing: 0.3, minHeight: 44, touchAction: "manipulation" }}>
                      Save to Templates
                    </button>
                    <button onClick={() => { onStart(program, w); }} style={{ flex: 1, background: `linear-gradient(135deg, ${accent}, #4A8BC4)`, border: "none", borderRadius: 10, padding: "10px 0", fontFamily: "'Bebas Neue', cursive", fontSize: 14, letterSpacing: 1, color: "#fff", cursor: "pointer", minHeight: 44, touchAction: "manipulation" }}>
                      START NOW
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationsModal({ notifications, onClose, onMarkAllRead, onClearAll, onToggleRead }) {
  const t = useT();
  const list = notifications || [];
  const anyUnread = list.some(n => !n.read);
  return (
    <div data-hswipe-safe style={{ position: "fixed", inset: 0, zIndex: 900, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} />
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: "100%", maxWidth: 420, background: t.surface, borderRadius: "20px 20px 0 0", padding: "0 20px calc(env(safe-area-inset-bottom, 0px) + 24px)", maxHeight: "85dvh", overflowY: "auto", WebkitOverflowScrolling: "touch", boxShadow: "0 -8px 40px rgba(0,0,0,0.4)" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: t.border }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: `1px solid ${t.border}`, marginBottom: 12, gap: 8 }}>
          <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, letterSpacing: 1 }}>
            <span style={{ color: accent }}>Notifications</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {anyUnread && <button onClick={onMarkAllRead} style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 8, color: t.textSub, fontSize: 11, padding: "6px 10px", cursor: "pointer", fontWeight: 600 }}>Mark all read</button>}
            {list.length > 0 && <button onClick={onClearAll} style={{ background: "transparent", border: "none", color: t.textMuted, fontSize: 11, padding: "6px 4px", cursor: "pointer" }}>Clear</button>}
            <button onClick={onClose} style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: t.textMuted }}>
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>
        {list.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 16px 16px" }}>
            <div style={{ fontSize: 40, marginBottom: 10, opacity: 0.4 }}>🔕</div>
            <div style={{ color: t.textMuted, fontSize: 14, lineHeight: 1.5 }}>No notifications yet.<br/>You'll see PR unlocks, streak milestones,<br/>and nudges when you've been away.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {list.map(n => (
              <button key={n.id} onClick={() => { haptic(8); onToggleRead(n.id); }} style={{
                // Apple-tier notification card: unread = Steel-Blue tint + accent border;
                // read = neutral translucent ghost. Both get inset top highlight for depth.
                display: "flex", gap: 12, alignItems: "flex-start", textAlign: "left",
                background: n.read ? "rgba(255,255,255,0.03)" : `${accent}14`,
                border: `1px solid ${n.read ? "rgba(255,255,255,0.06)" : accent + "40"}`,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
                borderRadius: 14, padding: "13px 15px", cursor: "pointer",
                color: t.text, width: "100%", boxSizing: "border-box",
                transition: "background 0.18s, border-color 0.18s",
              }}>
                <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{n.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2, display: "flex", alignItems: "center", gap: 8 }}>
                    {n.title}
                    {!n.read && <span style={{ width: 7, height: 7, borderRadius: "50%", background: accent, flexShrink: 0 }} />}
                  </div>
                  <div style={{ color: t.textSub, fontSize: 12, lineHeight: 1.4, marginBottom: 4 }}>{n.body}</div>
                  <div style={{ color: t.textMuted, fontSize: 11 }}>{formatRelative(n.timestamp)}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Fix #18: Manage Tags (custom user-created tags) ──────────────────
// Helper — merge built-in labels with user-created custom tags, normalize shape.
function allLabels(customTags) {
  const built = WORKOUT_LABELS;
  const custom = (customTags || []).map(t => tagRenderCfg({ ...t, custom: true }));
  return [...built, ...custom];
}
function findLabel(id, customTags) {
  return allLabels(customTags).find(l => l.id === id) || null;
}

function ManageTagsModal({ customTags, onClose, onChange }) {
  const t = useT();
  const [draft, setDraft] = useState(null); // { id?, label, emoji, color }
  const list = customTags || [];

  const startAdd = () => setDraft({ label: "", emoji: "🏷️", color: CUSTOM_TAG_COLORS[0] });
  const startEdit = (tag) => setDraft({ id: tag.id, label: tag.label, emoji: tag.emoji || "🏷️", color: tag.color || CUSTOM_TAG_COLORS[0] });

  const saveDraft = () => {
    const trimmed = (draft.label || "").trim().slice(0, 20);
    if (!trimmed) return;
    let next;
    if (draft.id) {
      next = list.map(t => t.id === draft.id ? { ...t, label: trimmed, emoji: draft.emoji, color: draft.color } : t);
    } else {
      const id = `ct_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      next = [...list, { id, label: trimmed, emoji: draft.emoji, color: draft.color }];
    }
    onChange(next);
    setDraft(null);
  };
  const deleteTag = (id) => onChange(list.filter(t => t.id !== id));

  return (
    <div data-hswipe-safe style={{ position: "fixed", inset: 0, zIndex: 900, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} />
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: "100%", maxWidth: 420, background: t.surface, borderRadius: "20px 20px 0 0", padding: "0 20px calc(env(safe-area-inset-bottom, 0px) + 24px)", maxHeight: "85dvh", overflowY: "auto", WebkitOverflowScrolling: "touch", boxShadow: "0 -8px 40px rgba(0,0,0,0.4)" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: t.border }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: `1px solid ${t.border}`, marginBottom: 14 }}>
          <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, letterSpacing: 1 }}>
            Manage <span style={{ color: accent }}>Tags</span>
          </div>
          <button onClick={onClose} style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: t.textMuted }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        {draft && (
          <div style={{ marginBottom: 16, padding: "14px 14px", background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 14 }}>
            <div style={{ fontSize: 10, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, marginBottom: 10 }}>{draft.id ? "Edit Tag" : "New Tag"}</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input type="text" value={draft.emoji} onChange={e => setDraft({ ...draft, emoji: e.target.value.slice(0, 4) })} placeholder="🏷️" maxLength={4} style={{ width: 56, textAlign: "center", background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 10, color: t.text, padding: "10px 8px", fontSize: 20, outline: "none" }} />
              <input type="text" value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value.slice(0, 20) })} placeholder="Tag name" maxLength={20} style={{ flex: 1, background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 10, color: t.text, padding: "10px 12px", fontSize: 14, outline: "none" }} />
            </div>
            <div style={{ fontSize: 10, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Color</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {CUSTOM_TAG_COLORS.map(c => (
                <button key={c} onClick={() => setDraft({ ...draft, color: c })} style={{ width: 32, height: 32, borderRadius: "50%", background: c, border: draft.color === c ? `2px solid ${t.text}` : `2px solid transparent`, cursor: "pointer", padding: 0, touchAction: "manipulation" }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setDraft(null)} style={{ flex: 1, background: "transparent", border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 10, padding: "10px 0", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button onClick={saveDraft} disabled={!(draft.label || "").trim()} style={{ flex: 2, background: (draft.label || "").trim() ? `linear-gradient(135deg, ${accent}, #4A8BC4)` : t.surfaceHigh, border: "none", color: (draft.label || "").trim() ? "#fff" : t.textMuted, borderRadius: 10, padding: "10px 0", fontSize: 15, fontWeight: 700, fontFamily: "'Bebas Neue', cursive", letterSpacing: 1, cursor: (draft.label || "").trim() ? "pointer" : "default" }}>SAVE</button>
            </div>
          </div>
        )}

        {!draft && (
          <button onClick={startAdd} style={{ width: "100%", background: "transparent", border: `1px dashed ${t.border}`, color: accent, borderRadius: 12, padding: "12px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16, touchAction: "manipulation" }}>
            <Icon name="plus" size={14} /> New Tag
          </button>
        )}

        <div style={{ fontSize: 10, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, marginBottom: 8 }}>Your Tags ({list.length})</div>
        {list.length === 0 && <div style={{ textAlign: "center", padding: "20px 12px", color: t.textMuted, fontSize: 13 }}>None yet — tap "New Tag" to create one.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {list.map(tag => {
            const cfg = tagRenderCfg(tag);
            return (
              <div key={tag.id} style={{ display: "flex", alignItems: "center", gap: 10, background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 12, padding: "10px 12px" }}>
                <span style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
                  {tag.emoji} {tag.label}
                </span>
                <div style={{ flex: 1 }} />
                <button onClick={() => startEdit(tag)} style={{ background: "transparent", border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", touchAction: "manipulation" }}>Edit</button>
                <button onClick={() => deleteTag(tag.id)} style={{ background: "transparent", border: "1px solid rgba(213,91,91,0.3)", color: "#d55b5b", borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer", touchAction: "manipulation" }}>Delete</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Fix #17: Inline Tag Editor for the Log flow ───────────────────────
function LogTagEditor({ labels, onChange, customTags, onManage }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const active = labels || [];
  const merged = allLabels(customTags);
  const activeCfgs = active.map(id => merged.find(l => l.id === id)).filter(Boolean).map(tagRenderCfg);
  const toggle = (id) => {
    let next;
    if (active.includes(id)) next = active.filter(l => l !== id);
    else if (active.length >= TAG_CAP) next = [...active.slice(1), id];
    else next = [...active, id];
    onChange(next);
  };
  const clearTag = (id) => onChange(active.filter(l => l !== id));

  return (
    <div style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 14, padding: "10px 12px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, flexShrink: 0 }}>Tags</span>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
          {activeCfgs.length === 0 && (
            <span style={{ fontSize: 12, color: t.textMuted }}>auto-suggested once you add exercises</span>
          )}
          {activeCfgs.map(c => (
            <button key={c.id} onClick={() => clearTag(c.id)} style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color, borderRadius: 8, padding: "4px 9px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, cursor: "pointer", whiteSpace: "nowrap", touchAction: "manipulation" }}>
              {c.emoji} {c.label}
              <span style={{ opacity: 0.6, marginLeft: 1 }}>✕</span>
            </button>
          ))}
        </div>
        <button onClick={() => setExpanded(v => !v)} style={{ background: "transparent", border: `1px solid ${t.border}`, color: t.textSub, borderRadius: 8, width: 30, height: 30, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, touchAction: "manipulation" }}>
          <Icon name={expanded ? "x" : "plus"} size={14} />
        </button>
      </div>
      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>Pick tags</span>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {onManage && <button onClick={onManage} style={{ background: "transparent", border: "none", color: accent, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}>Manage</button>}
              <span style={{ fontSize: 10, color: t.textMuted }}>{active.length}/{TAG_CAP}</span>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {merged.map(l => {
              const cfg = tagRenderCfg(l);
              const isActive = active.includes(l.id);
              return (
                <button key={l.id} onClick={() => toggle(l.id)} style={{ background: isActive ? cfg.bg : "transparent", border: `1px solid ${isActive ? cfg.border : t.border}`, color: isActive ? cfg.color : t.textMuted, borderRadius: 10, padding: "8px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s", opacity: (!isActive && active.length >= TAG_CAP) ? 0.4 : 1, minHeight: 36, touchAction: "manipulation" }}>
                  {l.emoji} {l.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────
export default function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const authedUser = firebaseUser?.displayName || firebaseUser?.email?.split("@")[0] || "";
  const [data, save, saveError] = useStorage(firebaseUser?.uid);
  const isOnline = useOnlineStatus();
  const [view, setView] = useState("home");
  const [viewKey, setViewKey] = useState(0);
  const [viewDir, setViewDir] = useState(1);
  const prevViewRef = useRef("home");
  const [workout, setWorkout] = useState(null);
  // #226 — Active-workout persistence layer wiring.
  // recoveryPrompt holds a candidate workout the user needs to choose to
  // restore or discard (only used when the saved workout is older than the
  // auto-restore window). Auto-restore happens silently below in a useEffect.
  const [recoveryPrompt, setRecoveryPrompt] = useState(null);
  // Ref mirror so lifecycle handlers (which capture a stable closure) always
  // read the latest in-memory workout — not a stale snapshot from when the
  // listener was installed.
  const workoutRef = useRef(null);
  useEffect(() => { workoutRef.current = workout; }, [workout]);

  // #226 — Write-through to IndexedDB on every workout-state change.
  // Small record (single user's current session); writes are sub-frame.
  // When workout transitions to null (Finish, Logout) we clear the row so
  // a recovery prompt doesn't fire on next launch.
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) return;
    if (workout) {
      saveActiveWorkout(uid, workout);
    } else {
      clearActiveWorkout(uid);
    }
  }, [workout, firebaseUser?.uid]);

  // #226 — Lifecycle listeners (Capacitor appStateChange/pause + web
  // visibilitychange/pagehide + 10s heartbeat). Force-saves on background
  // so iOS process-kill mid-rest can't lose data. Reinstalled when uid
  // changes (sign-out → sign-in different account).
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) return undefined;
    return installLifecycleListeners({
      uid,
      getCurrentWorkout: () => workoutRef.current,
    });
  }, [firebaseUser?.uid]);

  // #226 — Recovery flow on auth resolve. Auto-restores recent unfinished
  // workouts silently; opens the recovery prompt for older ones. Also
  // housekeeps the soft-delete graveyard.
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) return;
    let cancelled = false;
    (async () => {
      purgeOldRecoveredWorkouts();
      // Don't try to recover if a workout is already in flight in memory
      // (e.g. user navigated back to Home and we re-mounted).
      if (workoutRef.current) return;
      const result = await checkForRecoverableWorkout(uid);
      if (cancelled) return;
      if (result.kind === "autoRestore") {
        // Fix #218: normalize on load so legacy workouts (saved to IDB before this
        // fix shipped) gain stable set ids before they hit the React tree.
        setWorkout(normalizeWorkoutIds(result.workout));
        setView("log");
      } else if (result.kind === "prompt") {
        setRecoveryPrompt({
          workout: normalizeWorkoutIds(result.workout),
          summary: summarizeRecoverableWorkout(result.workout, result.ageMs),
        });
      }
    })();
    return () => { cancelled = true; };
  }, [firebaseUser?.uid]);

  const [exSearch, setExSearch] = useState("");
  const [exCatFilter, setExCatFilter] = useState("all");
  const [exEquipFilter, setExEquipFilter] = useState("all");
  const [showExPicker, setShowExPicker] = useState(false);
  const [completedWorkout, setCompletedWorkout] = useState(null);
  // Fix #55: tri-option theme — "system" | "light" | "dark". Preserves existing
  // explicit dark/light setting from pre-#55 builds; defaults to "system" for new installs.
  const [themePref, setThemePref] = useState(() => {
    try {
      const newPref = localStorage.getItem("barbelllabs-theme-pref");
      if (newPref === "system" || newPref === "light" || newPref === "dark") return newPref;
      const oldPref = localStorage.getItem("barbelllabs-theme");
      if (oldPref === "light" || oldPref === "dark") return oldPref;
      return "system";
    } catch { return "system"; }
  });
  const [systemTheme, setSystemTheme] = useState(() => {
    try { return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch { return "dark"; }
  });
  useEffect(() => {
    try {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e) => setSystemTheme(e.matches ? "dark" : "light");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } catch {}
  }, []);
  const theme = themePref === "system" ? systemTheme : themePref;
  const setThemeChoice = (pref) => {
    setThemePref(pref);
    try { localStorage.setItem("barbelllabs-theme-pref", pref); localStorage.removeItem("barbelllabs-theme"); } catch {}
  };
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState({});
  const [profileErrors, setProfileErrors] = useState([]);
  const [profileSavedFlash, setProfileSavedFlash] = useState(false);
  const [helpPage, setHelpPage] = useState(null);
  const [showPlateCalc, setShowPlateCalc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Fix #217: Workout Preferences sub-panel — stacks above showSettings so back-arrow
  // returns to Settings naturally without re-opening it.
  const [showWorkoutPrefs, setShowWorkoutPrefs] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [show1RM, setShow1RM] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showProgramBrowser, setShowProgramBrowser] = useState(false);
  const [showManageTags, setShowManageTags] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyRange, setHistoryRange] = useState(null); // { from: "YYYY-MM-DD", to: "YYYY-MM-DD" }
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [showHistoryMenu, setShowHistoryMenu] = useState(false);
  const [showWarmup, setShowWarmup] = useState(false);
  const [currentExerciseIdx, setCurrentExerciseIdx] = useState(null);
  // Picker search input intentionally does NOT auto-focus — opening the picker shouldn't
  // pop the keyboard. Users tap the search field manually if they want to type. (Was
  // pickerAutoFocus state; removed because UX feedback was that auto-pop felt intrusive.)
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  // Fix #105: shared destructive-action state. confirmDialog renders ConfirmDialog modal;
  // undoState renders UndoToast. triggerUndo is the convenience helper any destructive
  // action calls to expose an Undo affordance for ~5s.
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [undoState, setUndoState] = useState(null);
  const triggerUndo = (message, onUndo, durationMs = 5000) => {
    setUndoState({ message, onUndo, durationMs, key: Date.now() });
  };
  // Fix #105: latest-data ref for undo callbacks. Closures capture `data` lexically — by the
  // time the undo fires (up to 5s later) the captured `data` is stale, so writing
  // `save({ ...data, ... })` would clobber any other changes that happened in the window.
  // Restore handlers read from dataRef.current to merge into the *current* state.
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  const [showTour, setShowTour] = useState(false);

  const t = THEMES[theme]; const S = makeStyles(t);
  const profile = data.profile || {};
  const SWIPE_VIEWS = ["home", "log", "history", "progress", "profile"];
  const touchX = useRef(null); const touchY = useRef(null);
  // Bail on view-swipe if the touch starts inside anything that manages its own
  // horizontal gesture — scroll containers, SwipeableRow, charts, modals.
  const isGestureOwnedByChild = (target) => {
    if (!target || !target.closest) return false;
    if (target.closest("[data-hswipe-safe]")) return true;
    if (target.closest("input, textarea, select, [contenteditable]")) return true;
    return false;
  };
  const onTouchStart = (e) => {
    if (isGestureOwnedByChild(e.target)) { touchX.current = null; return; }
    touchX.current = e.touches[0].clientX; touchY.current = e.touches[0].clientY;
    if (!e.target.closest("input, textarea, select")) document.activeElement?.blur();
  };
  const onTouchEnd = (e) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    const dy = e.changedTouches[0].clientY - touchY.current;
    // Tightened thresholds — require 80px+ travel with dy < 40px so accidental
    // row/slider gestures don't cross the line. Still allows a clear tab-swipe.
    if (Math.abs(dx) > 80 && Math.abs(dy) < 40 && Math.abs(dx) > Math.abs(dy) * 2) {
      const idx = SWIPE_VIEWS.indexOf(view);
      if (dx < 0 && idx < SWIPE_VIEWS.length - 1) setView(SWIPE_VIEWS[idx + 1]);
      if (dx > 0 && idx > 0) setView(SWIPE_VIEWS[idx - 1]);
    }
    touchX.current = null;
  };
  const saveProfile = (updates) => save({ ...data, profile: { ...profile, ...updates } });

  // Fix #7 — derived notification state
  const notifications = data.notifications || [];
  const unreadCount = notifications.filter(n => !n.read).length;
  const markAllNotifsRead = () => save({ ...data, notifications: notifications.map(n => ({ ...n, read: true })) });
  const clearAllNotifs = () => save({ ...data, notifications: [] });
  const toggleNotifRead = (id) => save({ ...data, notifications: notifications.map(n => n.id === id ? { ...n, read: !n.read } : n) });

  // Fix #7 — missed-workout nudge on mount / when workouts change
  useEffect(() => {
    if (!firebaseUser) return;
    const update = computeMissedWorkoutNudge(data);
    if (update) save({ ...data, ...update });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser?.uid, (data.workouts || []).length]);

  // Fix #77 — bridge sound pref to global flag for non-React audio callers
  useEffect(() => {
    try { window.__bl_sound = !!(data.workoutPrefs && data.workoutPrefs.sound); } catch {}
  }, [data?.workoutPrefs?.sound]);

  // Reset focused-exercise index when workout starts or ends so the active mode auto-falls-back
  useEffect(() => {
    if (!workout) setCurrentExerciseIdx(null);
  }, [workout?.startTime]);

  // Fix #28 — first-run onboarding tour when profile.onboarded is falsy
  useEffect(() => {
    if (!firebaseUser) return;
    if (!data || data.profile === undefined) return;
    if (data.profile?.onboarded) return;
    setShowTour(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser?.uid, data?.profile?.onboarded]);

  // Fix #17 — auto-suggest tags once on first exercise add; user controls after
  useEffect(() => {
    if (!workout) return;
    if (workout.labels !== undefined) return;
    if (!workout.exercises || workout.exercises.length === 0) return;
    const suggested = suggestTags(workout.exercises);
    if (suggested.length === 0) return;
    setWorkout(w => w && w.labels === undefined ? { ...w, labels: suggested } : w);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout?.exercises?.length]);

  useEffect(() => {
    const color = theme === "dark" ? "#0A0A0A" : "#FFFFFF";
    let meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", color);
  }, [theme]);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600&display=swap";
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.textContent = `
      * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
      html, body { overflow-x: hidden; -webkit-font-smoothing: antialiased; }
      ::-webkit-scrollbar { display: none; }
      input, textarea { -webkit-user-select: auto !important; user-select: auto !important; }
      button { -webkit-user-select: none; user-select: none; }
      button:active { transform: scale(0.96); }
      /* Apple-tier polish: inputs lift on focus with a Steel Blue accent ring
         instead of a hard color border. Inline styles can't express :focus,
         so the focus polish lives here as a global rule. The transparent box-
         shadow doubles as the "ring" — softer than a thick border. */
      input:focus, textarea:focus, select:focus {
        border-color: rgba(91, 155, 213, 0.55) !important;
        box-shadow: 0 0 0 3px rgba(91, 155, 213, 0.14);
      }
      @keyframes bl-slide-r { from { opacity:0; transform:translateX(22px); } to { opacity:1; transform:translateX(0); } }
      @keyframes bl-slide-l { from { opacity:0; transform:translateX(-22px); } to { opacity:1; transform:translateX(0); } }
      @keyframes bl-card-in { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
      @keyframes bl-done-in { 0% { opacity:0; transform:translateY(-18px) scale(0.96); } 70% { opacity:1; transform:translateY(2px) scale(1.005); } 100% { opacity:1; transform:translateY(0) scale(1); } }
      @keyframes bl-finishing { 0% { opacity:1; transform:translateY(0) scale(1); } 100% { opacity:0; transform:translateY(-8px) scale(0.97); } }
      @keyframes bl-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
    `;
    document.head.appendChild(style);
  }, []);

  // Track view direction for slide animation
  useEffect(() => {
    const VIEWS = ["home", "log", "history", "progress", "profile", "admin"];
    const oldIdx = VIEWS.indexOf(prevViewRef.current);
    const newIdx = VIEWS.indexOf(view);
    if (oldIdx !== newIdx) {
      setViewDir(newIdx >= oldIdx ? 1 : -1);
      setViewKey(k => k + 1);
    }
    prevViewRef.current = view;
  }, [view]);

  const handleLogout = async () => {
    await signOut(auth);
    setWorkout(null); setView("home"); setIsNewUser(false);
  };

  useEffect(() => {
    if (firebaseUser && isNewUser) { setView("profile"); setIsNewUser(false); }
  }, [firebaseUser, isNewUser]);

  if (authLoading) return (
    <div style={{ background: "#0A0A0A", minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#5B9BD5", fontFamily: "'Bebas Neue', cursive", fontSize: 24, letterSpacing: 3 }}>LOADING…</div>
    </div>
  );

  if (!firebaseUser) return <LandingPage onNewUser={() => setIsNewUser(true)} />;
  if (!firebaseUser.emailVerified) return <VerifyEmailScreen user={firebaseUser} onSignOut={() => signOut(auth)} />;

  const gymBibleNames = new Set(GYM_BIBLE.map(e => e.name));
  const customExNames = [...new Set(data.workouts.flatMap(w => w.exercises.map(e => e.name)).filter(n => !gymBibleNames.has(n)))];
  const allPickerExercises = [
    ...GYM_BIBLE,
    ...customExNames.map(name => ({ name, cat: "custom", equip: "other", level: "beginner", muscles: "" })),
  ];
  // Picker search (two-tier: name primary + primary-muscle secondary):
  //  - Tier 1: exercises whose NAME matches the query (ranked: exact > startsWith > word-startsWith > contains).
  //  - Tier 2 (below Tier 1, with a divider): exercises whose PRIMARY muscle matches the query.
  //    Primary muscle = first entry in the comma-separated muscles list.
  //    Examples (works generically for any muscle term, not just bicep):
  //      - "bicep"  → surfaces EZ-Bar Curl ("Biceps, Brachialis"), Concentration Curl ("Biceps Peak").
  //                   Excludes Chin-Up ("Lats, Biceps" — primary is Lats) and Hammer Curl ("Brachialis"
  //                   — primary is Brachialis).
  //      - "tricep" → surfaces Skullcrusher, Tricep Pushdown, etc. Excludes Bench Press (Tricep is secondary).
  //      - "glute"  → surfaces Hip Thrust, Glute Bridge. Excludes Back Squat (Quads are primary).
  //      - "lat"    → surfaces Lat Pulldown, Pullover variants where Lats is primary.
  //                   Whole-word matching prevents "lat" matching "Lateral Delts".
  //  - Whole-word + optional-trailing-s so "bicep"/"biceps", "lat"/"lats", "quad"/"quads" all work.
  //  - Pill filters always intersect with both tiers.
  //  - Dedupe by name within and across tiers.
  const trimmedSearch = exSearch.trim().toLowerCase();
  const filtered = (() => {
    const pool = allPickerExercises.filter(ex => {
      if (exCatFilter !== "all" && ex.cat !== exCatFilter) return false;
      if (exEquipFilter !== "all" && ex.equip !== exEquipFilter) return false;
      return true;
    });

    if (!trimmedSearch) {
      const seen = new Set();
      return pool.filter(ex => {
        if (seen.has(ex.name)) return false;
        seen.add(ex.name);
        return true;
      }).map(ex => ({ ...ex, _tier: 1 }));
    }

    // Tier 1: name matches + alias matches.
    //  - Score 0-3: name match (exact > startsWith > word-startsWith > contains).
    //  - Score 4-7: alias match (same sub-tiers, falls back if no name match). Aliases come
    //    from the taxonomy import (~1,499 of 1,640 entries have them) and capture common
    //    short / colloquial names — e.g. "rdl" → Barbell Romanian Deadlift, "db curl" →
    //    Dumbbell Curl. Critical for findability since most users won't type the formal
    //    title-case name from memory.
    const nameScored = pool.map(ex => {
      const name = (ex.name || "").toLowerCase();
      const aliases = (ex.aliases || []).map(a => a.toLowerCase());
      let score = -1;
      if (name === trimmedSearch) score = 0;
      else if (name.startsWith(trimmedSearch)) score = 1;
      else if (name.split(/\s+/).some(w => w.startsWith(trimmedSearch))) score = 2;
      else if (name.includes(trimmedSearch)) score = 3;
      if (score < 0 && aliases.length) {
        if (aliases.includes(trimmedSearch)) score = 4;
        else if (aliases.some(a => a.startsWith(trimmedSearch))) score = 5;
        else if (aliases.some(a => a.split(/\s+/).some(w => w.startsWith(trimmedSearch)))) score = 6;
        else if (aliases.some(a => a.includes(trimmedSearch))) score = 7;
      }
      return { ex, score };
    }).filter(s => s.score >= 0);
    nameScored.sort((a, b) => a.score - b.score || a.ex.name.localeCompare(b.ex.name));
    const tier1Names = new Set();
    const tier1 = [];
    for (const s of nameScored) {
      if (tier1Names.has(s.ex.name)) continue;
      tier1Names.add(s.ex.name);
      tier1.push({ ...s.ex, _tier: 1 });
    }

    // Tier 2: primary muscle matches.
    // First look up the search term in MUSCLE_FAMILIES — this captures common gym classification
    // (e.g. "bicep" → also matches Brachialis / Brachioradialis since lifters train Hammer Curl
    // and Reverse Curl on bicep day even though those muscles are anatomically separate).
    // Falls back to a whole-word + optional-trailing-s regex for terms not in the family map.
    const family = MUSCLE_FAMILIES[trimmedSearch];
    let muscleRegex = null;
    if (family) {
      const alts = family.map(m => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
      muscleRegex = new RegExp(`\\b(${alts})\\b`, "i");
    } else {
      const escapedSearch = trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const stem = escapedSearch.replace(/s$/, "");
      muscleRegex = stem ? new RegExp(`\\b${stem}s?\\b`, "i") : null;
    }
    const tier2Names = new Set();
    const tier2 = [];
    if (muscleRegex) {
      for (const ex of pool) {
        if (tier1Names.has(ex.name) || tier2Names.has(ex.name)) continue;
        const firstMuscle = (ex.muscles || "").split(",")[0].trim();
        if (!firstMuscle) continue;
        if (muscleRegex.test(firstMuscle)) {
          tier2Names.add(ex.name);
          tier2.push({ ...ex, _tier: 2 });
        }
      }
      tier2.sort((a, b) => a.name.localeCompare(b.name));
    }

    return [...tier1, ...tier2];
  })();
  const tier1Count = filtered.filter(ex => ex._tier === 1).length;
  const tier2Count = filtered.length - tier1Count;
  const hasActiveFilters = exCatFilter !== "all" || exEquipFilter !== "all";
  // Fix #15: sort filter pills by this user's usage frequency ("All" always first)
  const orderedCats = (() => {
    const freq = {};
    (data.workouts || []).forEach(w => w.exercises.forEach(ex => {
      const hit = GYM_BIBLE.find(g => g.name === ex.name);
      if (hit) freq[hit.cat] = (freq[hit.cat] || 0) + 1;
    }));
    const [allCat, ...rest] = EX_CATS;
    return [allCat, ...rest.slice().sort((a, b) => (freq[b.id] || 0) - (freq[a.id] || 0))];
  })();
  const orderedEquips = (() => {
    const freq = {};
    (data.workouts || []).forEach(w => w.exercises.forEach(ex => {
      const hit = GYM_BIBLE.find(g => g.name === ex.name);
      if (hit) freq[hit.equip] = (freq[hit.equip] || 0) + 1;
    }));
    const [allEq, ...rest] = EX_EQUIPS;
    return [allEq, ...rest.slice().sort((a, b) => (freq[b.id] || 0) - (freq[a.id] || 0))];
  })();

  const progressData = (exName) =>
    data.workouts.filter(w => w.exercises.some(e => e.name === exName))
      .map(w => {
        const ex = w.exercises.find(e => e.name === exName);
        const bestWeight = Math.max(...ex.sets.map(s => parseFloat(s.weight) || 0));
        // Best reps at the heaviest weight logged that session
        const heavySets = ex.sets.filter(s => parseFloat(s.weight) === bestWeight);
        const bestReps = Math.max(...heavySets.map(s => parseInt(s.reps) || 0));
        return { date: w.date, value: bestWeight, reps: bestReps };
      })
      .reverse();

  const startWorkout = () => { if (!workout) setWorkout({ date: todayISO(), startTime: Date.now(), exercises: [] }); setView("log"); };
  const addExercise = (name) => {
    // #228 Pass 7: haptic on every exercise add — primary "thing committed" moment.
    haptic([0, 30, 20, 30]);
    setWorkout(w => {
      const cur = w || { date: todayISO(), startTime: Date.now(), exercises: [] };
      // Fix #218: stamp the default first set with a stable id at creation.
      // Fix #97: default type is "working" (the explicit type field keeps legacy
      // analytics simple — no field means working too, but we set it explicitly so
      // serialization is unambiguous).
      return { ...cur, exercises: [...cur.exercises, { name, sets: [{ id: makeId(), type: "working", weight: "", reps: "" }] }] };
    });
    setShowExPicker(false); setExSearch(""); setExCatFilter("all"); setExEquipFilter("all");
  };
  // Fix #223: Re-open a workout finished within the last 2 hours. Pulls the
  // workout off the History list and reactivates it as the in-flight session.
  // If there's already an active workout, we block — the user has to finish or
  // discard their current session first (Q4=a, less destructive than auto-
  // replacing). The button in History only renders inside the 2h window so
  // we don't have to re-check time here, but we re-verify to defend against
  // race-y clock states or stale React state. The reactivated workout drops
  // its finishedAt and any session-finalization metadata (duration recomputes
  // on next finish). All other fields including labels and set ids carry over.
  const reopenWorkout = (src) => {
    if (!src) return;
    if (workout) {
      // Active workout in flight — block per Q4=a.
      setConfirmDialog({
        title: "Finish your current workout first",
        message: "You have an active workout in progress. Finish or discard it before re-opening another.",
        confirmLabel: "Got it",
        cancelLabel: "",
        variant: "primary",
        onConfirm: () => setConfirmDialog(null),
      });
      return;
    }
    const ageMs = Date.now() - (src.finishedAt || 0);
    if (!src.finishedAt || ageMs > (2 * 60 * 60 * 1000)) {
      setConfirmDialog({
        title: "Re-open window expired",
        message: "Workouts can only be re-opened within 2 hours of finishing. Use the History edit tools for older sessions.",
        confirmLabel: "OK",
        cancelLabel: "",
        variant: "primary",
        onConfirm: () => setConfirmDialog(null),
      });
      return;
    }
    // Remove from history list and lift back into active state. Use stable id
    // when available, fall back to startTime for legacy rows without an id.
    const matchKey = src.id || src.startTime;
    const remaining = data.workouts.filter(w => (w.id || w.startTime) !== matchKey);
    save({ ...data, workouts: remaining }, { errorContext: "Couldn't re-open workout" });
    // Strip finalization metadata; preserve everything else (sets, ids, labels, notes).
    const { finishedAt, duration, ...rest } = src;
    setWorkout(normalizeWorkoutIds(rest));
    setView("log");
    haptic([0, 30, 20, 30]);
  };

  // Fix #221: Finish workout is conceptually irreversible (#223 adds a 2-hour
  // Re-open grace window in History, but the workout still commits to the user's
  // history and ends the session). Wrap with a confirm. Message escalates when
  // there's risk: incomplete sets (weight filled but no reps, or vice versa) or
  // any set still marked done=false despite being filled. The clean case still
  // confirms but with a softer message.
  const requestFinishWorkout = () => {
    if (!workout) return;
    let incompleteCount = 0;
    let unmarkedComplete = 0;
    for (const ex of workout.exercises || []) {
      for (const s of ex.sets || []) {
        const hasWeight = s.weight !== "" && s.weight != null;
        const hasReps   = s.reps   !== "" && s.reps   != null;
        if (hasWeight !== hasReps) incompleteCount += 1;
        if (hasWeight && hasReps && !s.done) unmarkedComplete += 1;
      }
    }
    const risky = incompleteCount > 0;
    const message = risky
      ? `${incompleteCount} set${incompleteCount === 1 ? " is" : "s are"} half-filled and won't be saved. Finish anyway?`
      : unmarkedComplete > 0
        ? `${unmarkedComplete} set${unmarkedComplete === 1 ? "" : "s"} aren't marked done with ✓, but they have weight + reps and will be saved. Finish workout?`
        : "All sets saved to history. The session ends but you can Re-open it for 2 hours from the History tab.";
    setConfirmDialog({
      title: "Finish workout?",
      message,
      confirmLabel: "Finish",
      cancelLabel: "Keep going",
      variant: risky ? "destructive" : "primary",
      onConfirm: () => { setConfirmDialog(null); finishWorkout(); },
    });
  };

  const finishWorkout = () => {
    // Strip transient `done` flag — it's UI state for live workouts only.
    const cleanedExercises = workout.exercises.map(({ done, ...e }) => ({ ...e, sets: e.sets.filter(s => s.weight !== "" || s.reps !== "") })).filter(e => e.sets.length > 0);
    // Auto-apply suggested tags if none set (tag editor was removed from Log; users can still edit from History)
    const labels = (workout.labels && workout.labels.length) ? workout.labels : suggestTags(cleanedExercises);
    // Fix #218: ensure workout id is set (preserves the id from active state if present,
    //          otherwise makes one for legacy workouts that pre-date the fix).
    // Fix #223: finishedAt timestamp drives the 2-hour Re-open grace window in History.
    const cleaned = {
      ...workout,
      id: workout.id || makeId(),
      finishedAt: Date.now(),
      labels,
      label: labels[0] || null,
      duration: Math.round((Date.now() - workout.startTime) / 60000),
      exercises: cleanedExercises,
    };
    const prev = data.workouts;
    const notifUpdate = computeWorkoutNotifications(data, cleaned, prev);
    save({ ...data, workouts: [cleaned, ...data.workouts], ...(notifUpdate || {}) }, { errorContext: "Couldn't sync your workout" });
    haptic([0, 60, 30, 60, 30, 120]);
    playComplete();
    setWorkout(null); setView("home");
    setCompletedWorkout({ workout: cleaned, prevWorkouts: prev });
  };

  // Fix #105: hybrid destructive flow for removing an exercise from the active workout.
  //  - 0 logged sets → instant remove + Undo toast (low friction, easy recovery).
  //  - >=1 logged sets → ConfirmDialog with concrete loss callout, then remove + Undo
  //    on confirm (high friction matches high recovery cost).
  // The Undo callback re-inserts the exercise at its original index so order is preserved.
  const requestRemoveExercise = (idx) => {
    const ex = workout?.exercises?.[idx];
    if (!ex) return;
    const loggedSets = (ex.sets || []).filter(s => (s.weight !== "" && s.weight != null) || (s.reps !== "" && s.reps != null)).length;
    const performRemove = () => {
      setWorkout(w => {
        if (!w) return w;
        return { ...w, exercises: w.exercises.filter((_, j) => j !== idx) };
      });
      triggerUndo(`${ex.name} removed`, () => {
        setWorkout(w => {
          if (!w) return w;
          const next = [...w.exercises];
          next.splice(idx, 0, ex);
          return { ...w, exercises: next };
        });
      });
    };
    if (loggedSets > 0) {
      setConfirmDialog({
        title: "Delete exercise?",
        message: `Remove ${ex.name}? You'll lose ${loggedSets} logged set${loggedSets === 1 ? "" : "s"}.`,
        confirmLabel: "Delete",
        onConfirm: () => { setConfirmDialog(null); performRemove(); },
      });
    } else {
      performRemove();
    }
  };
  // Fix #105: history workout delete with ConfirmDialog (high-stakes — losing a session's
  // worth of data) + Undo. Stats and PRs naturally recompute from the workouts array, so
  // restore at original index keeps everything consistent.
  const requestDeleteWorkout = (idx) => {
    const w = data.workouts?.[idx];
    if (!w) return;
    const exCount = w.exercises?.length || 0;
    setConfirmDialog({
      title: "Delete workout?",
      message: `Remove this ${exCount}-exercise session from ${w.date}? Stats and PRs will recalculate.`,
      confirmLabel: "Delete",
      onConfirm: () => {
        setConfirmDialog(null);
        const cur = dataRef.current;
        save({ ...cur, workouts: cur.workouts.filter((_, j) => j !== idx) });
        triggerUndo("Workout deleted", () => {
          const c2 = dataRef.current;
          const next = [...c2.workouts];
          next.splice(Math.min(idx, next.length), 0, w);
          save({ ...c2, workouts: next });
        });
      },
    });
  };
  // Fix #22 helper: filter for History search + range (also used by export when scope="filtered")
  const getFilteredWorkouts = () => {
    const searchLower = historySearch.trim().toLowerCase();
    const rangeFrom = historyRange?.from ? new Date(historyRange.from) : null;
    const rangeTo = historyRange?.to ? new Date(historyRange.to + "T23:59:59") : null;
    return (data.workouts || []).filter(w => {
      if (searchLower && !w.exercises.some(e => e.name.toLowerCase().includes(searchLower))) return false;
      if (rangeFrom || rangeTo) {
        const d = new Date(w.date);
        if (rangeFrom && d < rangeFrom) return false;
        if (rangeTo && d > rangeTo) return false;
      }
      return true;
    });
  };
  const hasHistoryFilter = !!historySearch.trim() || !!historyRange;

  // Fix #25: proper CSV export — escaping, BOM, full column set, blank (not "undefined") for missing fields
  const exportCSV = (scope = "all") => {
    const workouts = scope === "filtered" ? getFilteredWorkouts() : (data.workouts || []);
    const csvCell = (v) => {
      const s = (v === undefined || v === null) ? "" : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const tagName = (id) => {
      const hit = findLabel(id, data.customTags);
      return hit ? hit.label : id;
    };
    // Fix #97: added "Set Type" column. Values: working / warmup / dropset.
    // Legacy sets without the field export as "working" so downstream analysis
    // tools don't have to handle blank-vs-working as a special case.
    const header = ["Date", "Workout Name", "Tags", "Exercise", "Set #", "Set Type", "Weight (lbs)", "Reps", "RPE", "Notes", "Duration (min)"];
    const rows = [header];
    workouts.forEach(w => {
      const labels = w.labels || (w.label ? [w.label] : []);
      const tagNames = labels.map(tagName);
      const workoutName = tagNames[0] || "";
      const tagsCell = tagNames.join(", ");
      const duration = (w.duration != null) ? w.duration : "";
      if (!w.exercises || w.exercises.length === 0) {
        rows.push([w.date, workoutName, tagsCell, "", "", "", "", "", "", "", duration]);
        return;
      }
      w.exercises.forEach(ex => {
        const note = ex.note || "";
        if (!ex.sets || ex.sets.length === 0) {
          rows.push([w.date, workoutName, tagsCell, ex.name, "", "", "", "", "", note, duration]);
          return;
        }
        ex.sets.forEach((s, i) => {
          rows.push([
            w.date,
            workoutName,
            tagsCell,
            ex.name,
            i + 1,
            isValidSetType(s.type) ? s.type : "working",
            s.weight,
            s.reps,
            (s.rpe != null) ? s.rpe : "",
            note,
            duration,
          ]);
        });
      });
    });
    const csv = "\uFEFF" + rows.map(r => r.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const suffix = scope === "filtered" ? "-filtered" : "";
    a.download = `barbell-labs-${authedUser}-${todayISO()}${suffix}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const templates = data.templates || [];
  const saveTemplate = (name) => {
    if (!workout) return;
    const tmpl = { id: Date.now().toString(), name, exercises: workout.exercises.map(ex => ({ name: ex.name, sets: ex.sets.map(s => ({ weight: s.weight, reps: s.reps })) })) };
    save({ ...data, templates: [...templates, tmpl] });
    setShowSaveTemplate(false);
  };
  // Fix #105: template delete now goes through ConfirmDialog (high-stakes — templates take
  // effort to build). Undo restores the template at its original index.
  const deleteTemplate = (id) => {
    const tmpls = data.templates || [];
    const tmpl = tmpls.find(t => t.id === id);
    if (!tmpl) return;
    const idx = tmpls.findIndex(t => t.id === id);
    setConfirmDialog({
      title: "Delete template?",
      message: `Remove "${tmpl.name}" from your saved templates? You can undo this within 5 seconds.`,
      confirmLabel: "Delete",
      onConfirm: () => {
        setConfirmDialog(null);
        const cur = dataRef.current;
        save({ ...cur, templates: (cur.templates || []).filter(t => t.id !== id) });
        triggerUndo(`"${tmpl.name}" deleted`, () => {
          const c2 = dataRef.current;
          const next = [...(c2.templates || [])];
          next.splice(Math.min(idx, next.length), 0, tmpl);
          save({ ...c2, templates: next });
        });
      },
    });
  };
  const renameTemplate = (id, name) => save({ ...data, templates: templates.map(t => t.id === id ? { ...t, name } : t) });
  const loadTemplate = (tmpl) => {
    // Fix #218: templates pre-date stable-id support — generate IDs as the sets land
    // in active workout state so the swipe / reconcile bug doesn't apply to
    // template-started sessions.
    setWorkout(prev => normalizeWorkoutIds({
      ...(prev || { date: todayISO(), startTime: Date.now(), exercises: [] }),
      exercises: tmpl.exercises.map(ex => ({
        name: ex.name,
        sets: ex.sets.map(s => ({ id: makeId(), weight: s.weight, reps: s.reps })),
      })),
    }));
    setView("log");
  };

  const sel = (extra = {}) => ({ ...S.select(), ...extra });

  const navItem = (v, icon, label) => {
    const active = view === v;
    return (
      <button onClick={() => { if (active) return; haptic(8); if (v === "log" && !workout) setWorkout({ date: todayISO(), startTime: Date.now(), exercises: [] }); setView(v); }}
        style={{ flex: 1, background: "transparent", border: "none", borderTop: active ? `2px solid ${accent}` : "2px solid transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: active ? accent : t.textMuted, padding: "12px 0 10px", transition: "color 0.15s", touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}>
        <div style={{ transition: "transform 0.15s", transform: active ? "scale(1.1)" : "scale(1)" }}>
          <Icon name={icon} size={21} />
        </div>
        <span style={{ fontSize: 10, fontWeight: active ? 700 : 600, letterSpacing: 0.3, textTransform: "uppercase" }}>{label}</span>
      </button>
    );
  };

  return (
    <ThemeCtx.Provider value={theme}>
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      style={{ "--bl-surface": t.surfaceHigh, "--bl-border": t.border, "--bl-muted": t.textMuted, background: t.bg, minHeight: "100dvh", color: t.text, fontFamily: "'DM Sans', sans-serif", maxWidth: 420, margin: "0 auto", position: "relative",
        // Fix #222: when the sticky Finish bar is visible (active workout in Log view,
        // picker closed, ≥1 exercise) we add ~70px to the scroll-bottom clearance so the
        // last visible row isn't obscured. Otherwise stick with the nav-only clearance.
        paddingBottom: (view === "log" && workout && workout.exercises.length > 0 && !showExPicker)
          ? "calc(150px + env(safe-area-inset-bottom, 0px))"
          : "calc(80px + env(safe-area-inset-bottom, 0px))",
        transition: "background 0.3s, color 0.3s, padding-bottom 0.2s" }}>
      {completedWorkout && <WorkoutCompleteScreen workout={completedWorkout.workout} prevWorkouts={completedWorkout.prevWorkouts} onClose={() => setCompletedWorkout(null)} />}

      {/* ── ANIMATED VIEW WRAPPER ────────── */}
      <div key={viewKey} style={{ animation: `${viewDir >= 0 ? "bl-slide-r" : "bl-slide-l"} 0.24s cubic-bezier(0.16,1,0.3,1) both` }}>

      {/* ── HOME ─────────────────────────── */}
      {view === "home" && (() => {
        const hour = new Date().getHours();
        const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
        const displayName = profile.firstName || authedUser;
        const streak = calcStreak(data.workouts);
        const statsRow = [
          { label: "Total", value: data.workouts.length, icon: "🏋️", color: "#5B9BD5" },
          { label: "This week", value: data.workouts.filter(w => (new Date() - new Date(w.date)) / 86400000 <= 7).length, icon: "🗓", color: "#ff9500" },
          { label: "Exercises", value: [...new Set(data.workouts.flatMap(w => w.exercises.map(e => e.name)))].length, icon: "📋", color: "#5bb85b" },
        ];
        return (
          <div style={{ padding: "52px 20px 24px" }}>
            {/* Top row: logo + actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 32, letterSpacing: 2, lineHeight: 1 }}>BARBELL<span style={{ color: accent }}>LABS</span></div>
              <TopActions>
                <IconBtn icon="bell" onClick={() => setShowNotifs(true)} label="Notifications" badge={unreadCount} />
                <HelpBtn page="home" onOpen={() => setHelpPage("home")} />
              </TopActions>
            </div>
            {/* Greeting */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: t.textMuted, fontSize: 13, marginBottom: 3 }}>{greeting},</div>
              <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 34, letterSpacing: 1.5, lineHeight: 1 }}>
                {displayName} <span style={{ color: accent }}>💪</span>
              </div>
              <div style={{ color: t.textMuted, fontSize: 12, marginTop: 5 }}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
              {streak > 0 && (
                <div style={{
                  // Apple-tier streak chip: warm flame tint with opacity recipe.
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: "rgba(255,149,0,0.14)",
                  border: "1px solid rgba(255,149,0,0.32)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
                  borderRadius: 20, padding: "5px 13px",
                  fontSize: 12, color: "#ff9500", fontWeight: 700, letterSpacing: 0.3,
                  marginTop: 10,
                }}>🔥 {streak} day streak</div>
              )}
            </div>
            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
              {statsRow.map(s => <StatCard key={s.label} {...s} />)}
            </div>
            {/* CTA */}
            <button onClick={startWorkout} style={{ ...S.solidBtn(), width: "100%", padding: "20px", fontSize: 19, borderRadius: 16, marginBottom: 28, boxShadow: `0 8px 32px ${accentGlow}`, letterSpacing: 1.2 }}>+ Start Workout</button>
            {/* Recent sessions */}
            {data.workouts.length > 0 && (
              <>
                <div style={{ color: t.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 14, fontWeight: 700, paddingLeft: 2 }}>Recent Sessions</div>
                {data.workouts.slice(0, 5).map((w, i) => {
                  const labels = w.labels || (w.label ? [w.label] : []);
                  const labelCfgs = labels.map(id => WORKOUT_LABELS.find(l => l.id === id)).filter(Boolean);
                  return (
                    <div key={i} style={{ ...S.card(), display: "flex", alignItems: "center", gap: 14, padding: "15px 18px", animation: "bl-card-in 0.3s ease both", animationDelay: `${i * 60}ms` }}>
                      <div style={{
                        // Apple-tier emoji tile: tinted bg + inset top highlight, slightly
                        // raised feel — like an iOS app icon.
                        width: 44, height: 44, borderRadius: 13,
                        background: labelCfgs[0] ? labelCfgs[0].bg : `${accent}18`,
                        border: `1px solid ${labelCfgs[0] ? labelCfgs[0].border : accent + "33"}`,
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10)",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0,
                      }}>
                        {labelCfgs[0] ? labelCfgs[0].emoji : "🏋️"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: t.text }}>{formatDate(w.date)}</div>
                        <div style={{ color: t.textMuted, fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.exercises.map(e => e.name).join(" · ")}</div>
                      </div>
                      <div style={{ color: t.textMuted, fontSize: 12, flexShrink: 0 }}>{w.duration ? `${w.duration}m` : "—"}</div>
                    </div>
                  );
                })}
              </>
            )}
            {data.workouts.length === 0 && (
              <div style={{ textAlign: "center", padding: "32px 8px 24px" }}>
                <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, letterSpacing: 1.5, color: t.textSub, marginBottom: 20 }}>YOUR JOURNEY STARTS NOW</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24, textAlign: "left" }}>
                  {[
                    { step: "1", icon: "➕", title: "Tap Start Workout", body: "Hit the button above and add your first exercise." },
                    { step: "2", icon: "📝", title: "Log Your Sets", body: "Enter weight and reps for each set. Add RPE or RIR if you want." },
                    { step: "3", icon: "🏁", title: "Finish & See Your Data", body: "Complete the session and watch your stats come to life." },
                  ].map(s => (
                    <div key={s.step} style={{ display: "flex", alignItems: "flex-start", gap: 14, background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 14, padding: "14px 16px" }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${accent}20`, border: `1px solid ${accent}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "'Bebas Neue', cursive", fontSize: 16, color: accent }}>{s.step}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 2 }}>{s.icon} {s.title}</div>
                        <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>{s.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.6, padding: "0 8px" }}>
                  💡 Tip: the more sessions you log, the smarter your AI coaching gets.
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── LOG ──────────────────────────── */}
      {view === "log" && (
        <div style={{ padding: "52px 20px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 28, letterSpacing: 1.5, lineHeight: 1 }}>TODAY'S <span style={{ color: accent }}>LIFT</span></div>
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</div>
            </div>
            <TopActions>
              {workout && <div style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 20, padding: "6px 12px", fontSize: 12, fontWeight: 600, color: t.textMuted, letterSpacing: 0.3, whiteSpace: "nowrap", flexShrink: 0 }}>{Math.round((Date.now() - workout.startTime) / 60000)}m</div>}
              <IconBtn icon="moreH" onClick={() => setShowTools(true)} label="Tools" />
              <HelpBtn page="log" onOpen={() => setHelpPage("log")} />
            </TopActions>
          </div>

          {/* Tag editor moved out of Log — auto-suggested on Finish, editable from History */}

          <RestTimer />

          {/* Finish Workout — top placement. Compact while logging, big green when all exercises done.
              Banner persists when picker opens so the "everything's done" celebration stays in view —
              only the redundant big Finish button hides (picker has its own at the top). */}
          {workout && workout.exercises.length > 0 && (() => {
            const allDone = workout.exercises.every(e => e.done);
            return (
              <>
                {allDone && (
                  <div style={{ background: "rgba(91,184,91,0.10)", border: "1px solid rgba(91,184,91,0.4)", borderRadius: 12, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 22, lineHeight: 1 }}>🎉</span>
                    <div style={{ fontSize: 12, color: "#5bb85b", fontWeight: 600, lineHeight: 1.4 }}>All exercises done — wrap up to save your session.</div>
                  </div>
                )}
                {/* Fix #222: top Finish button moved to sticky bottom bar (rendered
                    near the nav further below). The "All exercises done" celebration
                    banner stays here as a visual cue; the actual action lives on the
                    bottom bar where the user's thumb already is. */}
              </>
            );
          })()}

          {/* Quick-start section — only shown when workout is empty */}
          {workout && workout.exercises.length === 0 && !showExPicker && (
            <div style={{ marginBottom: 18 }}>
              {/* Repeat last session */}
              {data.workouts.length > 0 && (
                <button onClick={() => {
                  // Fix #218: stamp fresh ids on the copied sets (the source workout's ids
                  // belong to the prior session — re-using them would conflate identities
                  // across the React tree).
                  const last = data.workouts[0];
                  setWorkout(w => normalizeWorkoutIds({
                    ...w,
                    exercises: last.exercises.map(ex => ({
                      name: ex.name,
                      sets: ex.sets.map(s => ({ id: makeId(), weight: s.weight, reps: s.reps })),
                    })),
                  }));
                }} style={{ width: "100%", background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 14, color: t.textSub, padding: "13px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10, touchAction: "manipulation", letterSpacing: 0.3 }}>
                  <Icon name="history" size={14} /> Repeat Last Session
                </button>
              )}
              {/* Browse starter programs */}
              <button onClick={() => setShowProgramBrowser(true)} style={{ width: "100%", background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 14, color: t.textSub, padding: "13px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10, touchAction: "manipulation", letterSpacing: 0.3 }}>
                <Icon name="book" size={14} /> Browse Starter Programs
              </button>
              {/* Templates — newest 3 inline, rest behind "View all" */}
              {templates.length > 0 && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 }}>Templates</div>
                    <button onClick={() => setShowTemplateManager(true)} style={{ background: "transparent", border: "none", color: accent, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "2px 0" }}>Manage</button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[...templates].reverse().slice(0, 3).map(tmpl => (
                      <button key={tmpl.id} onClick={() => loadTemplate(tmpl)} style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 14, padding: "12px 16px", textAlign: "left", cursor: "pointer", width: "100%", touchAction: "manipulation" }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: t.text, marginBottom: 3 }}>{tmpl.name}</div>
                        <div style={{ fontSize: 12, color: t.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tmpl.exercises.map(e => e.name).join(" · ")}</div>
                      </button>
                    ))}
                    {templates.length > 3 && (
                      <button onClick={() => setShowTemplateManager(true)} style={{ background: "transparent", border: `1px dashed ${t.border}`, borderRadius: 12, color: t.textSub, padding: "10px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", touchAction: "manipulation" }}>
                        View all {templates.length} templates
                      </button>
                    )}
                  </div>
                </div>
              )}
              {templates.length === 0 && data.workouts.length === 0 && null}
            </div>
          )}

          {/* Save as Template — shown when workout has exercises and picker isn't focused */}
          {workout && workout.exercises.length > 0 && !showExPicker && (
            <button onClick={() => setShowSaveTemplate(true)} style={{
              // Apple polish: ghost translucent — no dashed border, very subtle bg.
              width: "100%",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
              borderRadius: 12,
              color: t.textMuted,
              padding: "11px 16px", fontSize: 12, fontWeight: 600, letterSpacing: 0.2,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              marginBottom: 14, touchAction: "manipulation",
              transition: "background 0.18s, border-color 0.18s",
            }}>
              ＋ Save as Template
            </button>
          )}

          {/* Fix #103: primary "+ Add Exercise" affordance — sits immediately after the Repeat /
              Browse / Templates row when empty (so users see it without scrolling), and at the
              top of the exercise list when a workout is in progress. The bottom slot is removed
              and the redundant empty-state hint goes with it. */}
          {!showExPicker && (
            <button onClick={() => { if (!workout) setWorkout({ date: todayISO(), startTime: Date.now(), exercises: [] }); setShowExPicker(true); }} style={{ ...S.solidBtn(), width: "100%", justifyContent: "center", padding: "13px", marginBottom: 16, borderRadius: 12, fontSize: 14, fontWeight: 700, gap: 8 }}>
              <Icon name="plus" size={15} /> Add Exercise
            </button>
          )}

          {/* Focus mode: only one exercise expanded (active); others queued (collapsed) or done.
              Sort: active → queued (in original order) → done (in original order).
              When picker is open, only the done pills remain visible — gives the user a
              persistent record of what they just finished while they pick the next one. */}
          {workout && (() => {
            const activeIdx = (currentExerciseIdx != null && workout.exercises[currentExerciseIdx] && !workout.exercises[currentExerciseIdx].done)
              ? currentExerciseIdx
              : workout.exercises.findIndex(e => !e.done);
            const visible = workout.exercises.map((ex, i) => ({ ex, i }))
              .filter(({ ex }) => !showExPicker || ex.done);
            const ordered = visible.sort((a, b) => {
              const ra = a.ex.done ? 2 : (a.i === activeIdx ? 0 : 1);
              const rb = b.ex.done ? 2 : (b.i === activeIdx ? 0 : 1);
              return ra - rb;
            });
            // Compute queued ordering for the badge number
            const queuedIndices = workout.exercises.map((ex, i) => (!ex.done && i !== activeIdx) ? i : -1).filter(i => i >= 0);
            return ordered.map(({ ex, i }) => {
              const mode = ex.done ? "done" : (i === activeIdx ? "active" : "queued");
              const queueIndex = mode === "queued" ? queuedIndices.indexOf(i) : null;
              return (
                <ExerciseBlock key={i} exercise={ex} workouts={data.workouts}
                  mode={mode}
                  queueIndex={queueIndex}
                  onFocus={() => setCurrentExerciseIdx(i)}
                  triggerUndo={triggerUndo}
                  effortMetric={(data.workoutPrefs && data.workoutPrefs.effortMetric) || "rpe"}
                  autoStartRest={!!(data.workoutPrefs && data.workoutPrefs.autoStartRest)}
                  onChange={updated => {
                    const exercises = [...workout.exercises];
                    exercises[i] = updated;
                    setWorkout({ ...workout, exercises });
                    if (updated.done && i === activeIdx) {
                      setCurrentExerciseIdx(null);
                      // If everything is now done and there's no queued exercise to flow into,
                      // auto-open the picker so the user can add another one. No keyboard pop.
                      // Delay so the user visually registers the exercise becoming Done before
                      // the picker takes over the screen — prevents the eye-jump.
                      const allDone = exercises.every(e => e.done);
                      if (allDone) { setTimeout(() => setShowExPicker(true), 1500); }
                    }
                  }}
                  onRemove={() => requestRemoveExercise(i)}
                />
              );
            });
          })()}

          {showExPicker && (
            <div style={{ ...S.card(), animation: "bl-card-in 0.4s cubic-bezier(0.16,1,0.3,1) both" }}>
              {/* Top-of-picker Finish button — lets the user wrap up without closing search first.
                  Always green to match 'Done with this exercise'. Only when workout has exercises. */}
              {workout && workout.exercises.length > 0 && (
                <button onClick={requestFinishWorkout} style={{
                  width: "100%",
                  background: "linear-gradient(135deg, #5bb85b, #3a8a3a)",
                  border: "none",
                  color: "#fff",
                  borderRadius: 12,
                  padding: "12px 0",
                  fontFamily: "'Bebas Neue', cursive",
                  fontSize: 16,
                  fontWeight: 700,
                  letterSpacing: 1,
                  marginBottom: 12,
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  touchAction: "manipulation",
                }}>
                  <Icon name="check" size={16} /> Finish Workout
                </button>
              )}
              {/* Search row */}
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input value={exSearch} onChange={e => setExSearch(e.target.value)} placeholder="Search exercises…" style={{ ...S.inputStyle(), flex: 1, width: "auto" }} />
                <button onClick={() => { setShowExPicker(false); setExSearch(""); setExCatFilter("all"); setExEquipFilter("all"); }} style={S.iconBtn()}><Icon name="x" size={16} /></button>
              </div>
              {/* Match counter — Tier 1 (name + alias match) and Tier 2 (primary-muscle match) shown separately when both have results.
                  Tier 1 covers both formal name matches and alias matches (e.g. "rdl" → Barbell Romanian Deadlift). Counter just says
                  "{N} matches" since the user sees the actual matches in the list and the label "by name" would mislead alias hits. */}
              {trimmedSearch && (
                <div style={{ fontSize: 11, color: filtered.length === 0 ? t.warning || "#E8B64C" : t.textMuted, marginBottom: 8, marginTop: -4, lineHeight: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span>
                    {tier2Count > 0
                      ? `${tier1Count} ${tier1Count === 1 ? "match" : "matches"} · ${tier2Count} by muscle`
                      : `${tier1Count} ${tier1Count === 1 ? "match" : "matches"}`}
                    {hasActiveFilters && filtered.length > 0 ? " in current filters" : ""}
                  </span>
                  {filtered.length === 0 && hasActiveFilters && (
                    <button onClick={() => { setExCatFilter("all"); setExEquipFilter("all"); }} style={{ background: "transparent", border: "none", color: accent, fontSize: 11, fontWeight: 600, cursor: "pointer", padding: "2px 0", textDecoration: "underline" }}>Clear filters</button>
                  )}
                </div>
              )}
              {/* Category filter chips (Fix #15: reordered by usage, snap-aligned, fade into surfaceHigh) */}
              <div style={{ fontSize: 10, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, marginBottom: 6, marginTop: 2 }}>Muscle Group</div>
              <div style={{ position: "relative", marginBottom: 8 }}>
                <div data-hswipe-safe style={{ display: "flex", gap: 8, overflowX: "auto", WebkitOverflowScrolling: "touch", touchAction: "pan-x", paddingBottom: 4, paddingRight: 28, scrollbarWidth: "none", msOverflowStyle: "none", scrollSnapType: "x proximity" }}>
                  {orderedCats.map(c => {
                    const active = exCatFilter === c.id;
                    const darkText = active && c.color && ["#D4A64E", "#E8B64C"].includes(c.color);
                    return (
                      <button key={c.id} onClick={() => { haptic(8); setExCatFilter(c.id); }} style={{
                        // Apple-tier filter chip: when inactive, translucent ghost
                        // (subtle white-on-dark layer + hairline border). When active,
                        // category color tint + matching border + inset top highlight.
                        flexShrink: 0,
                        padding: "10px 16px",
                        borderRadius: 22,
                        border: `1px solid ${active ? (c.color || accent) + "99" : "rgba(255,255,255,0.08)"}`,
                        background: active
                          ? `${c.color || accent}26`
                          : "rgba(255,255,255,0.04)",
                        boxShadow: active
                          ? "inset 0 1px 0 rgba(255,255,255,0.10)"
                          : "inset 0 1px 0 rgba(255,255,255,0.04)",
                        color: active ? (c.color || accent) : t.textSub,
                        fontSize: 14, fontWeight: 600, letterSpacing: 0.2,
                        cursor: "pointer", touchAction: "pan-y", whiteSpace: "nowrap",
                        minHeight: 44,
                        transition: "background 0.18s, border-color 0.18s, color 0.18s",
                        userSelect: "none", scrollSnapAlign: "start",
                      }}>{c.label}</button>
                    );
                  })}
                </div>
                <div style={{ position: "absolute", right: 0, top: 0, bottom: 4, width: 32, background: `linear-gradient(to right, ${t.surfaceHigh}00, ${t.surfaceHigh})`, pointerEvents: "none" }} />
              </div>
              {/* Equipment filter chips */}
              <div style={{ fontSize: 10, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, marginBottom: 6, marginTop: 4 }}>Equipment</div>
              <div style={{ position: "relative", marginBottom: 8 }}>
                <div data-hswipe-safe style={{ display: "flex", gap: 8, overflowX: "auto", WebkitOverflowScrolling: "touch", touchAction: "pan-x", paddingBottom: 4, paddingRight: 28, scrollbarWidth: "none", msOverflowStyle: "none", scrollSnapType: "x proximity" }}>
                  {orderedEquips.map(eq => {
                    const active = exEquipFilter === eq.id;
                    return (
                      <button key={eq.id} onClick={() => { haptic(8); setExEquipFilter(eq.id); }} style={{
                        // Apple-tier filter chip — same recipe as category chips, narrower.
                        flexShrink: 0,
                        padding: "9px 15px",
                        borderRadius: 22,
                        border: `1px solid ${active ? `${accent}99` : "rgba(255,255,255,0.08)"}`,
                        background: active ? `${accent}26` : "rgba(255,255,255,0.04)",
                        boxShadow: active
                          ? "inset 0 1px 0 rgba(255,255,255,0.10)"
                          : "inset 0 1px 0 rgba(255,255,255,0.04)",
                        color: active ? accent : t.textMuted,
                        fontSize: 13, fontWeight: 600, letterSpacing: 0.2,
                        cursor: "pointer", touchAction: "pan-y", whiteSpace: "nowrap",
                        minHeight: 44,
                        transition: "background 0.18s, border-color 0.18s, color 0.18s",
                        userSelect: "none", scrollSnapAlign: "start",
                      }}>{eq.label}</button>
                    );
                  })}
                </div>
                <div style={{ position: "absolute", right: 0, top: 0, bottom: 4, width: 32, background: `linear-gradient(to right, ${t.surfaceHigh}00, ${t.surfaceHigh})`, pointerEvents: "none" }} />
              </div>
              {/* Results list */}
              <div style={{ maxHeight: 240, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
                {(() => {
                  const rows = [];
                  let lastTier = null;
                  for (const ex of filtered) {
                    if (ex._tier === 2 && lastTier !== 2) {
                      rows.push(
                        <div key="__tier2-divider" style={{ fontSize: 10, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, marginTop: 8, marginBottom: 2, padding: "8px 8px 4px", borderTop: `1px solid ${t.border}` }}>
                          Targets {trimmedSearch}
                        </div>
                      );
                    }
                    rows.push(
                      <button key={ex.name} onClick={() => { if (!workout) setWorkout({ date: todayISO(), startTime: Date.now(), exercises: [] }); addExercise(ex.name); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "transparent", border: "none", color: t.text, textAlign: "left", padding: "10px 8px", cursor: "pointer", fontSize: 14, borderBottom: `1px solid ${t.border}`, minHeight: 44, touchAction: "manipulation" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: CAT_COLORS[ex.cat] || "#888", flexShrink: 0 }} />
                        <span style={{ flex: 1, lineHeight: 1.3 }}>{ex.name}</span>
                        {ex.cat !== "custom" && <span style={{ fontSize: 10, color: t.textMuted, background: t.cardBg || t.surface2 || "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 4, flexShrink: 0, textTransform: "capitalize" }}>{ex.equip}</span>}
                      </button>
                    );
                    lastTier = ex._tier;
                  }
                  return rows;
                })()}
                {filtered.length === 0 && !exSearch && <div style={{ padding: "20px 8px", color: t.textMuted, fontSize: 13, textAlign: "center" }}>No exercises match these filters.</div>}
                {exSearch && !filtered.find(ex => ex.name.toLowerCase() === exSearch.toLowerCase()) && (
                  <button onClick={() => { if (!workout) setWorkout({ date: todayISO(), startTime: Date.now(), exercises: [] }); addExercise(exSearch); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "transparent", border: "none", color: accent, textAlign: "left", padding: "12px 8px", cursor: "pointer", fontSize: 14, fontWeight: 600, minHeight: 44, touchAction: "manipulation" }}>
                    <Icon name="plus" size={14} /> Add "{exSearch}"
                  </button>
                )}
              </div>
            </div>
          )}
          {/* Bottom Add Exercise slot + redundant empty-state hint removed (Fix #103). The
              primary affordance now lives above the exercise list (see top-of-Log slot). */}
        </div>
      )}

      {/* ── HISTORY ──────────────────────── */}
      {view === "history" && (() => {
        // Fix #22/#25: use the App-level filtered-workouts helper so Export + History share one source
        const searchLower = historySearch.trim().toLowerCase();
        const filteredWorkouts = getFilteredWorkouts();
        const historyGroups = groupWorkoutsByPeriod(filteredWorkouts);
        const recencyOpts = [
          { value: "7",  label: "Last 7 days"  },
          { value: "14", label: "Last 14 days" },
          { value: "21", label: "Last 21 days" },
          { value: "30", label: "Last 30 days" },
          { value: "90", label: "Last 90 days" },
        ];
        const handleJump = (e) => {
          const v = e.target.value;
          e.target.value = "";
          if (!v) return;
          if (v === "custom") { setShowRangePicker(true); return; }
          if (v.startsWith("sec:")) {
            const el = document.getElementById(v.slice(4));
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
          }
          const days = parseInt(v);
          if (days) {
            const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
            const idx = filteredWorkouts.findIndex(w => new Date(w.date) >= cutoff);
            if (idx !== -1) { const el = document.getElementById(`hcard-${idx}`); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }
          }
        };
        const hasFilter = !!searchLower || !!historyRange;
        return (
        <div style={{ padding: "52px 20px 20px", paddingBottom: "24px" }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 32, letterSpacing: 2, lineHeight: 1 }}>WORKOUT <span style={{ color: accent }}>HISTORY</span></div>
              <TopActions>
                {data.workouts.length > 0 && <IconBtn icon="moreH" onClick={() => setShowHistoryMenu(true)} label="History menu" />}
                <HelpBtn page="history" onOpen={() => setHelpPage("history")} />
              </TopActions>
            </div>
            {data.workouts.length > 0 && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {/* Search by exercise */}
                <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
                  <input value={historySearch} onChange={e => setHistorySearch(e.target.value)} placeholder="Search by exercise…" style={{ width: "100%", background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 10, color: t.text, padding: "9px 32px 9px 30px", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: t.textMuted, pointerEvents: "none" }}>🔍</span>
                  {historySearch && (
                    <button onClick={() => setHistorySearch("")} style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: t.textMuted, cursor: "pointer", padding: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </div>
                {/* Jump-to picker */}
                <div style={{ position: "relative" }}>
                  <select defaultValue="" onChange={handleJump} style={sel({ fontSize: 11 })}>
                    <option value="" disabled>Jump to…</option>
                    <optgroup label="Sections">
                      {historyGroups.map(g => (
                        <option key={g.id} value={`sec:${g.id}`} style={{ background: t.surfaceHigh, color: t.text }}>{g.label} ({g.items.length})</option>
                      ))}
                    </optgroup>
                    <optgroup label="Recency">
                      {recencyOpts.map(o => (
                        <option key={o.value} value={o.value} style={{ background: t.surfaceHigh, color: t.text }}>{o.label}</option>
                      ))}
                      <option value="custom" style={{ background: t.surfaceHigh, color: t.text }}>Custom range…</option>
                    </optgroup>
                  </select>
                  <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: accent, display: "flex" }}><Icon name="chevronDown" size={12} /></span>
                </div>
              </div>
            )}
            {/* Custom range picker */}
            {showRangePicker && (
              <div style={{ marginTop: 10, padding: "12px 14px", background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 12 }}>
                <div style={{ fontSize: 10, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, marginBottom: 8 }}>Custom date range</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input type="date" value={historyRange?.from || ""} onChange={e => setHistoryRange(r => ({ ...(r || {}), from: e.target.value }))} style={{ flex: 1, minWidth: 130, background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 8, color: t.text, padding: "8px 10px", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  <span style={{ color: t.textMuted, fontSize: 12 }}>to</span>
                  <input type="date" value={historyRange?.to || ""} onChange={e => setHistoryRange(r => ({ ...(r || {}), to: e.target.value }))} style={{ flex: 1, minWidth: 130, background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 8, color: t.text, padding: "8px 10px", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={() => { setHistoryRange(null); setShowRangePicker(false); }} style={{ flex: 1, background: "transparent", border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 8, padding: "8px 0", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Clear</button>
                  <button onClick={() => setShowRangePicker(false)} style={{ flex: 1, background: accent, border: "none", color: "#fff", borderRadius: 8, padding: "8px 0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Apply</button>
                </div>
              </div>
            )}
            {/* Active-filter banner */}
            {hasFilter && (
              <div style={{
                // Apple-tier active-filter banner: tinted Steel-Blue with inset top highlight.
                marginTop: 10, padding: "9px 14px",
                background: `${accent}14`,
                border: `1px solid ${accent}33`,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
                borderRadius: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
              }}>
                <span style={{ fontSize: 11, color: accent, fontWeight: 700 }}>
                  {filteredWorkouts.length} match{filteredWorkouts.length !== 1 ? "es" : ""}
                </span>
                <span style={{ fontSize: 11, color: t.textSub, flex: 1, minWidth: 0 }}>
                  {searchLower && <>"{historySearch}"</>}
                  {searchLower && historyRange && " · "}
                  {historyRange && <>{historyRange.from || "…"} to {historyRange.to || "…"}</>}
                </span>
                <button onClick={() => { setHistorySearch(""); setHistoryRange(null); setShowRangePicker(false); }} style={{ background: "transparent", border: "none", color: accent, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: "2px 4px" }}>Clear all</button>
              </div>
            )}
          </div>
          {data.workouts.length === 0 && (
            <div style={{ textAlign: "center", padding: "56px 24px 40px" }}>
              <div style={{ fontSize: 64, marginBottom: 20, lineHeight: 1 }}>📋</div>
              <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 26, letterSpacing: 1.5, color: t.text, marginBottom: 10 }}>NO HISTORY YET</div>
              <div style={{ color: t.textMuted, fontSize: 14, lineHeight: 1.7, maxWidth: 260, margin: "0 auto 28px" }}>
                Every workout you finish gets saved here. Your first session is one tap away.
              </div>
              <button onClick={() => setView("log")} style={{ background: `linear-gradient(135deg, ${accent}, #4A8BC4)`, color: "#fff", border: "none", borderRadius: 12, padding: "13px 28px", fontFamily: "'Bebas Neue', cursive", fontSize: 18, letterSpacing: 1, cursor: "pointer" }}>
                START YOUR FIRST WORKOUT
              </button>
            </div>
          )}
          {data.workouts.length > 0 && filteredWorkouts.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 24px", color: t.textMuted }}>
              <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>🔍</div>
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>No workouts match your filters.</div>
              <button onClick={() => { setHistorySearch(""); setHistoryRange(null); setShowRangePicker(false); }} style={{ marginTop: 14, background: "transparent", border: `1px solid ${t.border}`, color: accent, borderRadius: 10, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Clear all</button>
            </div>
          )}
          {historyGroups.map(group => (
            <div key={group.id}>
              <div id={group.id} style={{ position: "sticky", top: 0, zIndex: 10, background: t.bg, padding: "10px 0 6px", marginBottom: 6, scrollMarginTop: 8 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700 }}>{group.label}</div>
                  <div style={{ flex: 1, height: 1, background: t.border, opacity: 0.6 }} />
                  <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 600 }}>{group.items.length}</div>
                </div>
              </div>
              {group.items.map(({ workout: w, index: i }) => (
                /* Fix #218: stable key by workout identity so React reconciles the
                   right WorkoutHistoryCard instance after a delete / filter / sort. */
                <div key={w.id || w.startTime || `legacy-${i}`} id={`hcard-${i}`} style={{ scrollMarginTop: 48, animation: "bl-card-in 0.3s ease both", animationDelay: `${Math.min(i, 8) * 50}ms` }}>
                  <WorkoutHistoryCard workout={w} index={i}
                    customTags={data.customTags}
                    onLabelChange={(idx, arr) => { const wks = [...data.workouts]; wks[idx] = { ...wks[idx], labels: arr, label: arr[0] || null }; save({ ...data, workouts: wks }); }}
                    onDelete={(idx) => requestDeleteWorkout(idx)}
                    onSaveTemplate={(src) => {
                      const name = suggestTemplateName(src.exercises, templates, src.date);
                      const tmpl = { id: Date.now().toString(), name, exercises: src.exercises.map(ex => ({ name: ex.name, sets: ex.sets.map(s => ({ weight: s.weight, reps: s.reps })) })) };
                      save({ ...data, templates: [...templates, tmpl] });
                    }}
                    onReopen={reopenWorkout}
                  />
                </div>
              ))}
            </div>
          ))}

        </div>
        );
      })()}

      {/* ── PROGRESS ─────────────────────── */}
      {view === "progress" && (
        <div style={{ padding: "52px 20px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 32, letterSpacing: 2, lineHeight: 1 }}>YOUR <span style={{ color: accent }}>PROGRESS</span></div>
            <HelpBtn page="progress" onOpen={() => setHelpPage("progress")} />
          </div>
          <Big3PRs
            workouts={data.workouts}
            profile={profile}
            onSave={(big3) => saveProfile({ big3 })}
            onLogExercise={(name) => {
              if (!workout) setWorkout({ date: todayISO(), startTime: Date.now(), exercises: [] });
              addExercise(name);
              setView("log");
            }}
          />
          {data.workouts.length > 0 && <MuscleBreakdown workouts={data.workouts} />}
          <div style={{ borderTop: `1px solid ${t.border}`, margin: "22px 0 18px" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 20, letterSpacing: 1, color: t.textSub }}>EXERCISE PROGRESSION</div>
            {data.workouts.length > 0 && (() => {
              const names = [...new Set(data.workouts.flatMap(w => w.exercises.map(e => e.name)))].sort();
              return names.length ? (
                <div style={{ position: "relative" }}>
                  <select defaultValue="" onChange={e => { const el = document.getElementById(`exc-${e.target.value.replace(/\s+/g, "-")}`); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); e.target.value = ""; }} style={sel()}>
                    <option value="" disabled>Jump to…</option>
                    {names.map(n => <option key={n} value={n} style={{ background: t.surfaceHigh, color: t.text }}>{n}</option>)}
                  </select>
                  <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: accent, display: "flex" }}><Icon name="chevronDown" size={13} /></span>
                </div>
              ) : null;
            })()}
          </div>
          {data.workouts.length === 0
            ? (
              <div style={{ textAlign: "center", padding: "48px 24px 40px" }}>
                <div style={{ fontSize: 64, marginBottom: 20, lineHeight: 1 }}>📈</div>
                <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 26, letterSpacing: 1.5, color: t.text, marginBottom: 10 }}>YOUR STORY STARTS HERE</div>
                <div style={{ color: t.textMuted, fontSize: 14, lineHeight: 1.7, maxWidth: 270, margin: "0 auto 20px" }}>
                  Log your first workout and Barbell Labs will start building your progression charts — weight, reps, PRs, all of it.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 280, margin: "0 auto 28px" }}>
                  {[
                    { icon: "📊", text: "Dual-line weight & rep charts" },
                    { icon: "👑", text: "Automatic PR detection" },
                    { icon: "🤖", text: "AI coaching after every session" },
                  ].map(f => (
                    <div key={f.text} style={{
                      // Apple-tier feature row: hairline border + inset top highlight, lifted feel.
                      display: "flex", alignItems: "center", gap: 12,
                      background: t.surfaceHigh,
                      border: "1px solid rgba(255,255,255,0.06)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
                      borderRadius: 12, padding: "12px 16px",
                    }}>
                      <span style={{ fontSize: 20 }}>{f.icon}</span>
                      <span style={{ fontSize: 13, color: t.textSub }}>{f.text}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setView("log")} style={{ background: `linear-gradient(135deg, ${accent}, #4A8BC4)`, color: "#fff", border: "none", borderRadius: 12, padding: "13px 28px", fontFamily: "'Bebas Neue', cursive", fontSize: 18, letterSpacing: 1, cursor: "pointer" }}>
                  LOG YOUR FIRST LIFT
                </button>
              </div>
            )
            : (() => {
                const names = [...new Set(data.workouts.flatMap(w => w.exercises.map(e => e.name)))].sort();
                const palette = ["#5B9BD5", "#A8C8E8", "#5bb85b", "#d55b5b", "#b55bd5", "#d5a55b", "#5bd5d5", "#d55ba0"];
                return names.map((name, idx) => {
                  const pts = progressData(name); if (!pts.length) return null;
                  // PR = best (weight, reps) combo: weight is primary, reps breaks ties
                  const prPoint = pts.reduce((best, p) => {
                    if (p.value > best.value) return p;
                    if (p.value === best.value && (p.reps || 0) > (best.reps || 0)) return p;
                    return best;
                  }, pts[0]);
                  const gain = pts[pts.length - 1].value - pts[0].value;
                  const repsGain = (pts[pts.length - 1].reps || 0) - (pts[0].reps || 0);
                  const lc = palette[idx % palette.length];
                  const best1RM = data.workouts
                    .flatMap(w => w.exercises.filter(e => e.name === name).flatMap(e => e.sets))
                    .reduce((best, s) => { const v = epley1RM(parseFloat(s.weight) || 0, parseInt(s.reps) || 0); return (v && v > best) ? v : best; }, 0);
                  return (
                    <div key={name} id={`exc-${name.replace(/\s+/g, "-")}`} style={{ scrollMarginTop: 16, ...S.card(), border: `1px solid ${(profile.big3 || DEFAULT_BIG3).includes(name) ? lc + "44" : t.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                        <div><div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 18, letterSpacing: 1, color: lc, lineHeight: 1 }}>{name}</div><div style={{ fontSize: 11, color: t.textMuted, marginTop: 3 }}>{pts.length} session{pts.length !== 1 ? "s" : ""}</div></div>
                        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                          {best1RM > 0 && (
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, color: "#5b9bd5", lineHeight: 1 }}>{best1RM} <span style={{ fontSize: 13, color: t.textMuted }}>lbs</span></div>
                              <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>EST. 1RM</div>
                            </div>
                          )}
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, color: "#ff9500", lineHeight: 1 }}>
                              {prPoint.value} <span style={{ fontSize: 13, color: t.textMuted }}>lbs</span>
                              {prPoint.reps > 0 && <span style={{ fontSize: 15 }}> × {prPoint.reps}</span>}
                            </div>
                            <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>PR 👑</div>
                          </div>
                        </div>
                      </div>
                      <LineChart points={pts} lineColor={lc} />
                      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, marginTop: 2, fontSize: 10, color: t.textMuted }}>
                        <span style={{ letterSpacing: 0.5 }}>← Sessions →</span>
                        <span style={{ color: gain > 0 ? "#5bb85b" : gain < 0 ? "#d55b5b" : t.textMuted, fontWeight: 700 }}>
                          {gain > 0 ? "▲" : gain < 0 ? "▼" : "—"} {Math.abs(gain)} lbs
                          {repsGain !== 0 && (
                            <span style={{ color: repsGain > 0 ? "#5bb85b" : "#d55b5b", marginLeft: 4 }}>
                              · {repsGain > 0 ? "+" : ""}{repsGain} reps
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                });
              })()
          }
        </div>
      )}

      {/* ── PROFILE ──────────────────────── */}
      {view === "profile" && (() => {
        const p = profile;
        const isEditing = editingProfile;
        const draft = profileDraft;
        const startEdit = () => { setProfileDraft({ ...p }); setEditingProfile(true); };
        const setDraft = (k, v) => setProfileDraft(d => ({ ...d, [k]: v }));
        const pField = { background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 12, color: t.text, padding: "13px 14px", fontSize: 16, outline: "none", width: "100%", boxSizing: "border-box", WebkitAppearance: "none" };
        const lbl = { fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, display: "block", fontWeight: 700 };
        const dv = (v, u = "") => v ? `${v}${u}` : <span style={{ color: t.textMuted }}>—</span>;
        return (
          <div style={{ padding: "52px 20px 110px" }}>
            {!p.firstName && !isEditing && (
              <div style={{ background: `${accent}12`, border: `1px solid ${accent}44`, borderRadius: 12, padding: "14px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 22 }}>👋</span>
                <div style={{ flex: 1 }}><div style={{ color: accent, fontWeight: 700, fontSize: 14 }}>Welcome, @{authedUser}!</div><div style={{ color: t.textSub, fontSize: 12, marginTop: 2 }}>Complete your profile to get started</div></div>
                <button onClick={startEdit} style={{ background: `linear-gradient(135deg, ${accent}, #4A8BC4)`, color: "#ffffff", border: "none", borderRadius: 8, padding: "7px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Set Up →</button>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 34, letterSpacing: 1, lineHeight: 1 }}>My <span style={{ color: accent }}>Profile</span></div>
                {p.firstName && <div style={{ color: t.textSub, fontSize: 14, marginTop: 5 }}>Hey, <span style={{ color: t.text, fontWeight: 600 }}>{p.firstName}</span> 👋</div>}
                {isAdminUser(authedUser) && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: `linear-gradient(135deg, ${accent}, #4A8BC4)`, color: "#ffffff", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700, marginTop: 6, letterSpacing: 0.5 }}>
                    ⚙ ADMIN
                  </div>
                )}
              </div>
              <TopActions>
                {!isEditing && <IconBtn icon="gear" onClick={() => setShowSettings(true)} label="Settings" />}
                <HelpBtn page="profile" onOpen={() => setHelpPage("profile")} />
              </TopActions>
            </div>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              {/* Fix #41: pull Google photoURL when available; fall back to initial / icon */}
              <div style={{ width: 80, height: 80, borderRadius: "50%", background: `linear-gradient(135deg, ${t.surfaceHigh}, ${t.surface})`, border: `2px solid ${p.goal ? (GOALS.find(g => g.id === p.goal)?.color || t.border) : t.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto", boxShadow: "0 0 24px rgba(0,0,0,0.2)", overflow: "hidden" }}>
                {firebaseUser?.photoURL
                  ? <img src={firebaseUser.photoURL} alt="" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  : (p.firstName ? p.firstName[0].toUpperCase() : <Icon name="user" size={32} />)}
              </div>
            </div>
            {isEditing ? (
              <div>
                <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 16, letterSpacing: 1, color: t.textMuted, marginBottom: 12 }}>PERSONAL INFO</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div><label style={lbl}>First Name</label><input value={draft.firstName || ""} onChange={e => setDraft("firstName", e.target.value)} placeholder="First" style={pField} /></div>
                  <div><label style={lbl}>Last Name</label><input value={draft.lastName || ""} onChange={e => setDraft("lastName", e.target.value)} placeholder="Last" style={pField} /></div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Email</label>
                  <div style={{ position: "relative" }}>
                    <input type="email" value={draft.email || firebaseUser?.email || ""} onChange={e => setDraft("email", e.target.value)} placeholder="your@email.com" style={pField} />
                    {firebaseUser?.emailVerified && <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#5bb85b", fontWeight: 700 }}>✓</span>}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div><label style={lbl}>Age</label><input type="number" value={draft.age || ""} onChange={e => setDraft("age", e.target.value)} placeholder="yrs" style={pField} /></div>
                  <div><label style={lbl}>Weight</label><input type="number" value={draft.weight || ""} onChange={e => setDraft("weight", e.target.value)} placeholder="lbs" style={pField} /></div>
                  <div>
                    <label style={lbl}>Height (ft)</label>
                    <div style={{ position: "relative" }}>
                      <input type="number" min="0" max="9" value={draft.heightFt || ""} onChange={e => setDraft("heightFt", e.target.value)} placeholder="5" style={{ ...pField, paddingRight: "28px" }} />
                      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: t.textMuted, pointerEvents: "none" }}>'</span>
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Height (in)</label>
                    <div style={{ position: "relative" }}>
                      <input type="number" min="0" max="11.5" step="0.5" value={draft.heightIn || ""} onChange={e => setDraft("heightIn", e.target.value)} placeholder="11" style={{ ...pField, paddingRight: "28px" }} />
                      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: t.textMuted, pointerEvents: "none" }}>"</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div><label style={lbl}>Country</label><input value={draft.country || ""} onChange={e => setDraft("country", e.target.value)} placeholder="e.g. Canada" style={pField} /></div>
                  <div><label style={lbl}>Region / State</label><input value={draft.region || ""} onChange={e => setDraft("region", e.target.value)} placeholder="e.g. ON" style={pField} /></div>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={lbl}>City</label><input value={draft.city || ""} onChange={e => setDraft("city", e.target.value)} placeholder="e.g. Toronto" style={pField} />
                </div>
                {/* Fix #46: Lifestyle / training context */}
                <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 16, letterSpacing: 1, color: t.textMuted, marginBottom: 12 }}>LIFESTYLE</div>
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Sex / Gender</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                    {SEX_OPTIONS.map(opt => {
                      const active = draft.sex === opt.id;
                      return (
                        <button key={opt.id} onClick={() => setDraft("sex", active ? null : opt.id)} style={{ background: active ? `${accent}22` : t.inputBg, border: `1px solid ${active ? accent : t.border}`, borderRadius: 10, padding: "10px 6px", fontSize: 12, fontWeight: 700, color: active ? accent : t.textSub, cursor: "pointer", touchAction: "manipulation" }}>{opt.label}</button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 10, color: t.textMuted, marginTop: 4 }}>Used for strength-standards comparison.</div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Training Experience</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {EXPERIENCE_LEVELS.map(opt => {
                      const active = draft.experience === opt.id;
                      return (
                        <button key={opt.id} onClick={() => setDraft("experience", active ? null : opt.id)} style={{ background: active ? `${accent}18` : t.inputBg, border: `1px solid ${active ? accent : t.border}`, borderRadius: 12, padding: "11px 14px", textAlign: "left", cursor: "pointer", touchAction: "manipulation" }}>
                          <div style={{ color: active ? accent : t.text, fontWeight: 700, fontSize: 13 }}>{opt.label}</div>
                          <div style={{ color: t.textMuted, fontSize: 11, marginTop: 1 }}>{opt.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={lbl}>Primary Training Location</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                    {TRAINING_LOCATIONS.map(opt => {
                      const active = draft.trainingLocation === opt.id;
                      return (
                        <button key={opt.id} onClick={() => setDraft("trainingLocation", active ? null : opt.id)} style={{ background: active ? `${accent}22` : t.inputBg, border: `1px solid ${active ? accent : t.border}`, borderRadius: 10, padding: "11px 6px", fontSize: 12, fontWeight: 700, color: active ? accent : t.textSub, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, touchAction: "manipulation" }}>
                          <span style={{ fontSize: 16 }}>{opt.emoji}</span>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 16, letterSpacing: 1, color: t.textMuted, marginBottom: 12 }}>CURRENT GOAL</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                  {GOALS.map(g => {
                    const sel2 = draft.goal === g.id;
                    return <button key={g.id} onClick={() => setDraft("goal", sel2 ? null : g.id)} style={{ display: "flex", alignItems: "center", gap: 13, background: sel2 ? `${g.color}18` : t.inputBg, border: `1px solid ${sel2 ? g.color + "88" : t.border}`, borderRadius: 14, padding: "14px 16px", cursor: "pointer", textAlign: "left", minHeight: 60 }}>
                      <span style={{ fontSize: 22 }}>{g.emoji}</span>
                      <div style={{ flex: 1 }}><div style={{ color: sel2 ? g.color : t.text, fontWeight: 700, fontSize: 14 }}>{g.label}</div><div style={{ color: t.textMuted, fontSize: 12, marginTop: 1 }}>{g.desc}</div></div>
                      {sel2 && <span style={{ color: g.color }}><Icon name="check" size={18} /></span>}
                    </button>;
                  })}
                </div>
                {/* Fix #53: validation errors banner */}
                {profileErrors.length > 0 && (
                  <div style={{ background: "rgba(213,91,91,0.1)", border: "1px solid rgba(213,91,91,0.35)", borderRadius: 12, padding: "10px 14px", marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: "#d55b5b", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Fix before saving</div>
                    <ul style={{ margin: 0, paddingLeft: 18, color: "#d55b5b", fontSize: 12, lineHeight: 1.5 }}>
                      {profileErrors.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                  </div>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => { setEditingProfile(false); setProfileErrors([]); }} style={{ flex: 1, background: "transparent", border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 14, padding: "15px 0", fontSize: 15, cursor: "pointer", fontWeight: 600, minHeight: 52 }}>Cancel</button>
                  <button onClick={() => {
                    // Fix #53: validate before save
                    const errs = [];
                    const s = (v) => typeof v === "string" ? v.trim() : v;
                    if (s(draft.firstName) && draft.firstName.length > 50) errs.push("First name is too long (max 50 characters).");
                    if (s(draft.lastName)  && draft.lastName.length > 50)  errs.push("Last name is too long (max 50 characters).");
                    const age = draft.age !== "" && draft.age != null ? Number(draft.age) : null;
                    if (age != null && (isNaN(age) || age < 13 || age > 120)) errs.push("Age must be between 13 and 120.");
                    const weight = draft.weight !== "" && draft.weight != null ? Number(draft.weight) : null;
                    if (weight != null && (isNaN(weight) || weight < 50 || weight > 800)) errs.push("Weight must be between 50 and 800 lbs.");
                    const hFt = draft.heightFt !== "" && draft.heightFt != null ? Number(draft.heightFt) : null;
                    const hIn = draft.heightIn !== "" && draft.heightIn != null ? Number(draft.heightIn) : null;
                    if (hFt != null && (isNaN(hFt) || hFt < 3 || hFt > 8)) errs.push("Height (feet) must be between 3 and 8.");
                    if (hIn != null && (isNaN(hIn) || hIn < 0 || hIn > 11)) errs.push("Height (inches) must be between 0 and 11.");
                    if (s(draft.city)    && draft.city.length > 60)    errs.push("City name is too long.");
                    if (s(draft.country) && draft.country.length > 60) errs.push("Country is too long.");
                    if (errs.length) { setProfileErrors(errs); return; }
                    setProfileErrors([]);
                    saveProfile(draft);
                    setEditingProfile(false);
                    // Fix #54: save confirmation toast
                    setProfileSavedFlash(true);
                    setTimeout(() => setProfileSavedFlash(false), 2200);
                  }} style={{ flex: 2, background: `linear-gradient(135deg, ${accent}, #4A8BC4)`, color: "#ffffff", border: "none", borderRadius: 14, padding: "15px 0", fontSize: 17, cursor: "pointer", fontFamily: "'Bebas Neue', cursive", letterSpacing: 1.2, minHeight: 52 }}>Save Profile</button>
                </div>

              </div>
            ) : (
              <div>
                <div style={S.card()}>
                  <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 15, letterSpacing: 1, color: t.textMuted, marginBottom: 14 }}>PERSONAL INFO</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    {[
                      { label: "First Name", val: dv(p.firstName) },
                      { label: "Last Name",  val: dv(p.lastName) },
                      { label: "Age",        val: dv(p.age, " yrs") },
                      { label: "Sex",        val: p.sex ? (SEX_OPTIONS.find(s => s.id === p.sex)?.label || dv(p.sex)) : dv(null) },
                      { label: "Weight",     val: dv(p.weight, " lbs") },
                      { label: "Height",     val: (p.heightFt || p.heightIn) ? `${p.heightFt || 0}' ${p.heightIn || 0}"` : <span style={{ color: t.textMuted }}>—</span> },
                      { label: "Experience", val: p.experience ? (EXPERIENCE_LEVELS.find(x => x.id === p.experience)?.label || dv(p.experience)) : dv(null) },
                      { label: "Trains At",  val: p.trainingLocation ? (TRAINING_LOCATIONS.find(x => x.id === p.trainingLocation)?.label || dv(p.trainingLocation)) : dv(null) },
                      { label: "Country",    val: dv(p.country) },
                      { label: "Location",   val: [p.city, p.region].filter(Boolean).join(", ") || <span style={{ color: t.textMuted }}>—</span> },
                    ].map(f => (
                      <div key={f.label}><div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>{f.label}</div><div style={{ fontSize: 16, fontWeight: 600, color: t.text }}>{f.val}</div></div>
                    ))}
                  </div>
                  {(() => {
                    const em = p.email || firebaseUser?.email;
                    const ver = firebaseUser?.emailVerified;
                    return em ? (
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${t.border}` }}>
                        <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Email</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14, color: t.text, fontWeight: 600 }}>{em}</span>
                          {ver ? <span style={{ fontSize: 11, color: "#5bb85b", fontWeight: 700, background: "rgba(91,184,91,0.12)", border: "1px solid rgba(91,184,91,0.3)", borderRadius: 5, padding: "2px 7px" }}>✓ Verified</span>
                               : <span style={{ fontSize: 11, color: "#ff9500", fontWeight: 700, background: "rgba(255,149,0,0.12)", border: "1px solid rgba(255,149,0,0.3)", borderRadius: 5, padding: "2px 7px" }}>⚠ Pending</span>}
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
                <div style={S.card()}>
                  <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 15, letterSpacing: 1, color: t.textMuted, marginBottom: 14 }}>CURRENT GOAL</div>
                  {p.goal ? (() => { const g = GOALS.find(g => g.id === p.goal); return <div style={{ display: "flex", alignItems: "center", gap: 14, background: `${g.color}14`, border: `1px solid ${g.color}55`, borderRadius: 11, padding: "14px 16px" }}><span style={{ fontSize: 28 }}>{g.emoji}</span><div><div style={{ color: g.color, fontWeight: 700, fontSize: 17 }}>{g.label}</div><div style={{ color: t.textMuted, fontSize: 13, marginTop: 2 }}>{g.desc}</div></div></div>; })()
                    : <div style={{ color: t.textMuted, fontSize: 14, textAlign: "center", padding: "12px 0" }}>No goal set — tap Edit to add one</div>}
                </div>
                {/* Fix #48: Expanded Lifetime Stats */}
                {(() => {
                  const ws = data.workouts;
                  const totalWorkouts = ws.length;
                  // Fix #97: lifetime totals reflect training stimulus — working +
                  // drop sets only. Warmups are excluded so cumulative volume and set
                  // counts don't get inflated by prep work.
                  const totalSets = ws.reduce((a, w) => a + w.exercises.reduce((b, e) => b + e.sets.filter(isNonWarmup).length, 0), 0);
                  const totalVolume = ws.reduce((a, w) => a + w.exercises.reduce((b, e) => b + e.sets.filter(isNonWarmup).reduce((c, s) => c + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0), 0), 0);
                  const totalMinutes = ws.reduce((a, w) => a + (w.duration || 0), 0);
                  const currentStreak = calcStreak(ws);
                  // Longest streak across entire history
                  const uniqueDates = [...new Set(ws.map(w => w.date))].sort();
                  let longestStreak = 0, run = 0, prev = null;
                  uniqueDates.forEach(d => {
                    const cur = new Date(d);
                    if (prev) {
                      const diff = Math.round((cur - prev) / 86400000);
                      run = diff === 1 ? run + 1 : 1;
                    } else run = 1;
                    if (run > longestStreak) longestStreak = run;
                    prev = cur;
                  });
                  // Most-logged exercise
                  const exFreq = {};
                  ws.forEach(w => w.exercises.forEach(e => { exFreq[e.name] = (exFreq[e.name] || 0) + 1; }));
                  const mostLogged = Object.entries(exFreq).sort((a, b) => b[1] - a[1])[0];
                  // Member since: earliest workout date OR firebaseUser creation
                  const firstDate = uniqueDates[0] || (firebaseUser?.metadata?.creationTime ? new Date(firebaseUser.metadata.creationTime).toISOString().slice(0, 10) : null);
                  const humanHours = Math.floor(totalMinutes / 60);
                  const humanMins = totalMinutes % 60;
                  const fmtVolume = (v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 100) / 10}k` : `${Math.round(v)}`;
                  return (
                    <div style={S.card()}>
                      <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 15, letterSpacing: 1, color: t.textMuted, marginBottom: 14 }}>LIFETIME STATS</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                        {[
                          { label: "Total Workouts",  val: totalWorkouts },
                          { label: "Total Sets",      val: totalSets },
                          { label: "Total Volume",    val: `${fmtVolume(totalVolume)} lbs` },
                          { label: "Time Training",   val: totalMinutes > 0 ? `${humanHours}h ${humanMins}m` : "—" },
                          { label: "Current Streak",  val: currentStreak > 0 ? `${currentStreak}d` : "—" },
                          { label: "Longest Streak",  val: longestStreak > 0 ? `${longestStreak}d` : "—" },
                        ].map(s => <div key={s.label}><div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>{s.label}</div><div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, color: accent, lineHeight: 1 }}>{s.val}</div></div>)}
                      </div>
                      {(mostLogged || firstDate) && (
                        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${t.border}`, fontSize: 12, color: t.textMuted, lineHeight: 1.6 }}>
                          {mostLogged && <div>Most logged: <span style={{ color: t.textSub, fontWeight: 600 }}>{mostLogged[0]}</span> ({mostLogged[1]} sessions)</div>}
                          {firstDate && <div>Member since: <span style={{ color: t.textSub, fontWeight: 600 }}>{formatDate(firstDate)}</span></div>}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {/* Bodyweight — Fix #49 */}
                <BodyweightWidget
                  bodyweight={data.bodyweight || []}
                  goalWeight={p.goalWeight || null}
                  onAdd={(w, date) => {
                    const d = date || todayISO();
                    const entry = { date: d, weight: w };
                    const existing = (data.bodyweight || []).filter(e => e.date !== d);
                    save({ ...data, bodyweight: [...existing, entry] });
                  }}
                  onSaveGoal={(g) => saveProfile({ goalWeight: g })}
                />
                {/* Version + Manual PDF Download */}
                <div style={{ ...S.card(), textAlign: "center" }}>
                  <a
                    href="/user-manual.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      background: `linear-gradient(135deg, ${accent}, #4A8BC4)`, color: "#ffffff", border: "none",
                      borderRadius: 10, padding: "11px 20px",
                      fontFamily: "'Bebas Neue', cursive", letterSpacing: 1,
                      fontSize: 16, fontWeight: 700, cursor: "pointer",
                      textDecoration: "none", margin: "0 auto 16px",
                    }}
                  >
                    <Icon name="download" size={16} /> View User Manual
                  </a>
                  <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.9 }}>
                    <div>Version <span style={{ color: accent, fontWeight: 700 }}>{APP_VERSION}</span></div>
                    <div>Build Date: {BUILD_DATE}</div>
                    <div style={{ marginTop: 4, opacity: 0.4 }}>Barbell Labs © 2026</div>
                  </div>
                </div>
              </div>
            )}
          </div>

        );
      })()}

      {/* ── ADMIN PANEL ──────────────────── */}
      {view === "admin" && isAdminUser(authedUser) && <AdminPanel currentUser={authedUser} />}

      </div>{/* end animated view wrapper */}

      {/* ── HELP MODAL ───────────────────── */}
      {helpPage && <HelpModal page={helpPage} onClose={() => setHelpPage(null)} onReplayTour={() => { setHelpPage(null); setShowTour(true); }} />}
      {showPlateCalc && <PlateCalculator onClose={() => setShowPlateCalc(false)} customPlates={(data.workoutPrefs && data.workoutPrefs.customPlates) || null} onCustomPlatesChange={(next) => save({ ...data, workoutPrefs: { ...(data.workoutPrefs || {}), customPlates: next } })} />}
      {showWarmup && <WarmupCalculator onClose={() => setShowWarmup(false)} customPlates={(data.workoutPrefs && data.workoutPrefs.customPlates) || null} />}
      {show1RM && <OneRMCalculator onClose={() => setShow1RM(false)} formula={(data.workoutPrefs && data.workoutPrefs.oneRMFormula) || "avg"} />}
      {showSaveTemplate && workout && <SaveTemplateSheet exercises={workout.exercises} existingTemplates={templates} onSave={saveTemplate} onClose={() => setShowSaveTemplate(false)} />}
      {showTemplateManager && <TemplateManager templates={templates} onLoad={loadTemplate} onDelete={deleteTemplate} onRename={renameTemplate} onClose={() => setShowTemplateManager(false)} />}
      {showWorkoutPrefs && <WorkoutPreferencesPanel
        workoutPrefs={data.workoutPrefs || {}}
        onWorkoutPrefs={(next) => save({ ...data, workoutPrefs: next })}
        onClose={() => setShowWorkoutPrefs(false)}
      />}
      {showSettings && <SettingsModal
        onClose={() => setShowSettings(false)}
        themePref={themePref}
        onThemeChoice={setThemeChoice}
        onEditProfile={() => { setShowSettings(false); setProfileDraft({ ...(data.profile || {}) }); setEditingProfile(true); setView("profile"); }}
        onManageTags={() => { setShowSettings(false); setShowManageTags(true); }}
        onExport={() => { setShowSettings(false); exportCSV(); }}
        workoutPrefs={data.workoutPrefs || {}}
        onWorkoutPrefs={(next) => save({ ...data, workoutPrefs: next })}
        onOpenWorkoutPrefs={() => { haptic(8); setShowWorkoutPrefs(true); }}
        onDeleteAccount={() => { setShowSettings(false); setShowDeleteAccount(true); }}
        consentActive={!!(readLocalConsent() || data?.privacyConsent?.acceptedAt)}
        onWithdrawConsent={() => { withdrawConsent({ data, save }); setShowSettings(false); }}
        onBackupJSON={() => {
          // Fix #66: full local backup including profile, workouts, templates, tags, prefs.
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `barbell-labs-backup-${authedUser}-${todayISO()}.json`;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          haptic([0, 30]);
        }}
        onRestoreJSON={() => {
          // Fix #66: file picker → parse → confirm → save merged
          const input = document.createElement("input");
          input.type = "file"; input.accept = "application/json,.json";
          input.onchange = (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
              try {
                const parsed = JSON.parse(ev.target.result);
                if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
                const ok = window.confirm(`Restore from backup? This replaces your current cloud data with the backup contents (${(parsed.workouts || []).length} workouts, ${(parsed.templates || []).length} templates). This cannot be undone.`);
                if (!ok) return;
                save({ ...parsed, customTags: parsed.customTags || [], templates: parsed.templates || [], workouts: parsed.workouts || [], bodyweight: parsed.bodyweight || [] });
                haptic([0, 60, 30, 80]);
                window.alert("Restore complete. Your data is now from the backup.");
              } catch (err) {
                window.alert("That file doesn't look like a valid Barbell Labs backup. (" + (err.message || "parse error") + ")");
              }
            };
            reader.readAsText(file);
          };
          input.click();
        }}
      />}
      {showDeleteAccount && <DeleteAccountModal
        onClose={() => setShowDeleteAccount(false)}
        onExport={() => exportCSV("all")}
        onDeleted={() => { setShowDeleteAccount(false); /* Firestore + auth record are gone; onAuthStateChanged will unmount the app */ }}
      />}
      {showNotifs && <NotificationsModal notifications={notifications} onClose={() => setShowNotifs(false)} onMarkAllRead={markAllNotifsRead} onClearAll={clearAllNotifs} onToggleRead={toggleNotifRead} />}
      {showTools && <ToolsMenu onClose={() => setShowTools(false)} on1RM={() => setShow1RM(true)} onPlates={() => setShowPlateCalc(true)} onWarmup={() => setShowWarmup(true)} />}
      {showManageTags && <ManageTagsModal customTags={data.customTags} onClose={() => setShowManageTags(false)} onChange={(next) => save({ ...data, customTags: next })} />}
      {showTour && <OnboardingTour onDone={() => { setShowTour(false); save({ ...data, profile: { ...(data.profile || {}), onboarded: true } }); }} />}
      {/* Fix #61 + #102: Cookie / data consent banner with versioned + Firestore-mirrored persistence */}
      <CookieBanner data={data} save={save} />
      {/* Fix #105: shared destructive-action UI */}
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          cancelLabel={confirmDialog.cancelLabel}
          variant={confirmDialog.variant}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
      {/* #226 — Recovery prompt for unfinished workouts older than the
          auto-restore window. Restore is the primary action (Steel Blue);
          Discard is a soft archive — workouts go to a 7-day soft-delete
          store, not hard-deleted, in case the user changes their mind. */}
      {recoveryPrompt && (
        <ConfirmDialog
          title="We found a workout from earlier"
          message={recoveryPrompt.summary}
          confirmLabel="Restore"
          cancelLabel="Discard"
          variant="primary"
          onConfirm={() => {
            setWorkout(recoveryPrompt.workout);
            setView("log");
            setRecoveryPrompt(null);
          }}
          onCancel={() => {
            const uid = firebaseUser?.uid;
            if (uid) discardRecoverableWorkout(uid, recoveryPrompt.workout);
            setRecoveryPrompt(null);
          }}
        />
      )}
      {undoState && (
        <UndoToast
          key={undoState.key}
          message={undoState.message}
          onUndo={undoState.onUndo}
          onDismiss={() => setUndoState(null)}
          durationMs={undoState.durationMs}
        />
      )}
      {/* Fix #54: Profile saved toast */}
      {profileSavedFlash && (
        <div style={{ position: "fixed", bottom: TOAST_BOTTOM, left: "50%", transform: "translateX(-50%)", zIndex: 2100, background: "rgba(91,184,91,0.18)", border: "1px solid rgba(91,184,91,0.45)", borderRadius: 12, padding: "10px 18px", color: "#5bb85b", fontSize: 13, fontWeight: 700, boxShadow: "0 8px 32px rgba(0,0,0,0.35)", pointerEvents: "none", animation: "bl-card-in 0.25s ease both" }}>
          ✓ Profile saved
        </div>
      )}
      {/* Offline indicator — purely informational. Firestore's offline persistence already
          queues writes locally and syncs them when the connection returns; this banner just
          tells the user that's what's happening so silence isn't read as failure. */}
      {!isOnline && (
        <div role="status" aria-live="polite" style={{ position: "fixed", top: "calc(env(safe-area-inset-top, 0px))", left: 0, right: 0, zIndex: 2200, background: "rgba(232,182,76,0.18)", borderBottom: "1px solid rgba(232,182,76,0.45)", color: "#E8B64C", fontSize: 12, fontWeight: 600, padding: "7px 16px", textAlign: "center", letterSpacing: 0.3, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", animation: "bl-card-in 0.25s ease both" }}>
          <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#E8B64C", marginRight: 8, verticalAlign: "middle", animation: "bl-pulse 2s ease-in-out infinite" }} />
          You're offline · changes will sync when reconnected
        </div>
      )}
      {/* Fix #69: Sync error banner — appears when a Firestore write fails so the user
          can retry instead of losing the change silently. Auto-clears on next successful save. */}
      {saveError && (
        <div role="alert" aria-live="polite" style={{ position: "fixed", bottom: TOAST_BOTTOM, left: 12, right: 12, zIndex: 2150, maxWidth: 396, marginLeft: "auto", marginRight: "auto", background: "rgba(217,107,122,0.18)", border: "1px solid rgba(217,107,122,0.55)", borderRadius: 12, padding: "12px 14px", color: "#F5C7CD", fontSize: 13, fontWeight: 600, boxShadow: "0 8px 32px rgba(0,0,0,0.45)", animation: "bl-card-in 0.25s ease both", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>⚠</span>
          <span style={{ flex: 1, lineHeight: 1.35 }}>{saveError.message} — check connection and try again.</span>
          <button onClick={saveError.retry} style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0, minHeight: 32 }}>Retry</button>
          <button onClick={saveError.dismiss} aria-label="Dismiss" style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 18, cursor: "pointer", padding: "0 4px", flexShrink: 0, lineHeight: 1 }}>×</button>
        </div>
      )}
      {showHistoryMenu && <HistoryMenu
        onClose={() => setShowHistoryMenu(false)}
        onExportAll={() => exportCSV("all")}
        onExportFiltered={() => exportCSV("filtered")}
        hasFilter={hasHistoryFilter}
        filteredCount={hasHistoryFilter ? getFilteredWorkouts().length : 0}
        totalCount={(data.workouts || []).length}
      />}
      {showProgramBrowser && <ProgramBrowser
        onClose={() => setShowProgramBrowser(false)}
        onFork={(program, w) => {
          const baseName = `${program.short} — ${w.name}`;
          const taken = new Set(templates.map(t => t.name));
          let finalName = baseName;
          if (taken.has(finalName)) {
            for (let i = 0; i < 26; i++) { const c = `${baseName} ${String.fromCharCode(65 + i)}`; if (!taken.has(c)) { finalName = c; break; } }
          }
          const tmpl = { id: Date.now().toString(), name: finalName, exercises: w.exercises.map(ex => ({ name: ex.name, sets: ex.sets.map(s => ({ weight: s.weight, reps: s.reps })) })) };
          save({ ...data, templates: [...templates, tmpl] });
          haptic([0, 50, 30, 80]);
          setShowProgramBrowser(false);
        }}
        onStart={(program, w) => {
          setWorkout({ date: todayISO(), startTime: Date.now(), exercises: w.exercises.map(ex => ({ name: ex.name, sets: ex.sets.map(s => ({ weight: s.weight, reps: s.reps })) })) });
          setShowProgramBrowser(false);
          setView("log");
          haptic([0, 40]);
        }}
      />}

      {/* ── SIGN OUT — fixed above nav on profile tab ── */}
      {view === "profile" && (
        <div style={{
          position: "fixed", bottom: "calc(62px + env(safe-area-inset-bottom, 0px))", left: "50%", transform: "translateX(-50%)",
          width: "100%", maxWidth: 420, display: "flex", justifyContent: "center",
          padding: "12px 20px", boxSizing: "border-box",
          background: `linear-gradient(to top, ${t.bg} 55%, transparent)`,
          pointerEvents: "none",
        }}>
          <button onClick={handleLogout} style={{
            pointerEvents: "all",
            background: t.surfaceHigh,
            border: `1px solid ${t.border}`,
            color: t.textMuted,
            borderRadius: 12,
            padding: "13px 48px",
            fontSize: 14, fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 2px 16px rgba(0,0,0,0.25)",
            letterSpacing: 0.3,
          }}>Sign Out</button>
        </div>
      )}

      {/* Fix #222: sticky Finish Workout bar — sits above the nav, only visible
          while logging an active workout with at least one exercise. Picker open
          hides it (picker has its own contextual Finish button inside). Reachable
          thumb position; replaces the previous top-of-Log Finish button so the
          critical action is always one tap away regardless of scroll. */}
      {view === "log" && workout && workout.exercises.length > 0 && !showExPicker && (() => {
        const allDone = workout.exercises.every(e => e.done);
        return (
          <div style={{
            position: "fixed",
            bottom: "calc(58px + env(safe-area-inset-bottom, 0px))",
            left: "50%",
            transform: "translateX(-50%)",
            width: "100%",
            maxWidth: 420,
            padding: "8px 12px",
            background: theme === "dark" ? "linear-gradient(to top, rgba(10,10,10,0.96), rgba(10,10,10,0.86))" : "linear-gradient(to top, rgba(255,255,255,0.96), rgba(255,255,255,0.86))",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            zIndex: 90,
            pointerEvents: "auto",
          }}>
            <button onClick={requestFinishWorkout} style={{
              width: "100%",
              background: "linear-gradient(135deg, #5bb85b, #3a8a3a)",
              border: "none",
              color: "#fff",
              borderRadius: 12,
              padding: allDone ? "16px 0" : "14px 0",
              fontFamily: "'Bebas Neue', cursive",
              fontSize: allDone ? 20 : 17,
              fontWeight: 700,
              letterSpacing: 1,
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              // Apple polish: "lit from above" inner highlight catches light off the
              // gradient. Outer glow scales with allDone state.
              boxShadow: allDone
                ? "inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 32px rgba(91,184,91,0.35)"
                : "inset 0 1px 0 rgba(255,255,255,0.14), 0 4px 18px rgba(91,184,91,0.2)",
              transition: "padding 0.2s, font-size 0.2s, box-shadow 0.3s",
              touchAction: "manipulation",
            }}>
              <Icon name="check" size={allDone ? 18 : 16} /> Finish Workout
            </button>
          </div>
        );
      })()}

      {/* ── NAV ──────────────────────────── */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 420, background: theme === "dark" ? "rgba(10,10,10,0.95)" : "rgba(255,255,255,0.95)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderTop: `1px solid ${t.navBorder}`, display: "flex", paddingBottom: "env(safe-area-inset-bottom, 0px)", zIndex: 100 }}>
        {navItem("home", "home", "Home")}
        {navItem("log", "plus", "Log")}
        {navItem("history", "history", "History")}
        {navItem("progress", "chart", "Progress")}
        {navItem("profile", "user", "Profile")}
        {isAdminUser(authedUser) && navItem("admin", "shield", "Admin")}
      </div>
    </div>
    </ThemeCtx.Provider>
  );
}


