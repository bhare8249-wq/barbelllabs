import { useState, useEffect, useRef, createContext, useContext } from "react";
import { auth, googleProvider, db } from "./firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
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
} from "firebase/auth";

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
    inputBg:     "#141416",
    inputBorder: "#2C2C30",
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
    inputBg:     "#FFFFFF",
    inputBorder: "#A8C8E8",
    navBg:       "#FFFFFF",
    navBorder:   "#A8C8E8",
  },
};
const accent     = "#5B9BD5";   // Steel Blue
const accentGlow = "rgba(91,155,213,0.20)";
const haptic = (pattern = 10) => { try { navigator.vibrate(pattern); } catch (_) {} };

const makeStyles = (t) => ({
  card: (extra = {}) => ({
    background: t.surfaceHigh, borderRadius: 18, padding: "18px 20px", marginBottom: 14,
    border: `1px solid ${t.border}`, boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
    ...extra
  }),
  inputStyle: (extra = {}) => ({
    background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 12,
    color: t.text, padding: "13px 14px", fontSize: 16, outline: "none", width: 120,
    transition: "border-color 0.2s", WebkitAppearance: "none",
    ...extra
  }),
  iconBtn: (color) => ({
    background: "transparent", border: "none", cursor: "pointer",
    color: color || t.textMuted, padding: 10, display: "flex", alignItems: "center",
    justifyContent: "center", borderRadius: 10, transition: "opacity 0.15s",
    minWidth: 40, minHeight: 40, touchAction: "manipulation",
  }),
  ghostBtn: (extra = {}) => ({
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "transparent",
    border: `1.5px dashed ${t.border}`, borderRadius: 14, color: t.textMuted,
    padding: "13px 16px", fontSize: 14, cursor: "pointer", minHeight: 48,
    transition: "border-color 0.2s, color 0.2s",
    ...extra
  }),
  solidBtn: (extra = {}) => ({
    background: `linear-gradient(135deg, ${accent}, #4A8BC4)`,
    color: "#ffffff", border: "none", borderRadius: 14, padding: "15px 24px",
    fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
    letterSpacing: 0.3, fontSize: 16, boxShadow: `0 4px 20px ${accentGlow}`,
    transition: "opacity 0.2s, transform 0.15s", touchAction: "manipulation",
    minHeight: 48,
    ...extra
  }),
  select: (extra = {}) => ({
    background: t.surfaceHigh, color: accent, border: `1px solid ${accent}55`,
    borderRadius: 12, padding: "10px 32px 10px 14px", fontSize: 13, fontWeight: 700,
    cursor: "pointer", outline: "none", appearance: "none", WebkitAppearance: "none",
    letterSpacing: 0.3, minHeight: 44,
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
const APP_VERSION = "0.3.10";
const BUILD_DATE  = "2026-04-16";

function useStorage(uid) {
  const [data, setData] = useState({ workouts: [], bodyweight: [] });

  useEffect(() => {
    if (!uid) { setData({ workouts: [], bodyweight: [] }); return; }
    const ref = doc(db, "users", uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) setData(snap.data());
      else setData({ workouts: [], bodyweight: [] });
    });
    return unsub;
  }, [uid]);

  const save = (next) => {
    setData(next);
    if (uid) setDoc(doc(db, "users", uid), next).catch(console.error);
  };

  return [data, save];
}

// ── Admin ─────────────────────────────────────────────────────────────
const isAdminUser = () => false;

(() => {
  try {
  } catch {}
})();


const BIG3 = ["Bench Press", "Squat", "Deadlift"];
const DEFAULT_EXERCISES = [
  "Bench Press", "Squat", "Deadlift", "Overhead Press", "Pull-Up",
  "Barbell Row", "Dumbbell Curl", "Tricep Pushdown", "Leg Press",
  "Lat Pulldown", "Cable Row", "Incline Press",
];
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
];

const GOALS = [
  { id: "muscle",   label: "Build Muscle",  emoji: "💪", desc: "Hypertrophy & size",    color: "#5b9bd5" },
  { id: "strength", label: "Strength",      emoji: "🏋️", desc: "Max power & 1RM",      color: "#d55b5b" },
  { id: "cardio",   label: "Cardio",        emoji: "🏃", desc: "Endurance & fitness",   color: "#5bb85b" },
  { id: "cut",      label: "Cut / Lean Out",emoji: "🔥", desc: "Fat loss & definition", color: "#ff9500" },
  { id: "maintain", label: "Maintain",      emoji: "⚖️", desc: "Stay consistent",       color: "#b55bd5" },
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
      const topSet = ex.sets.reduce((best, s) => {
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
const Icon = ({ name, size = 18 }) => {
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
    gear:     <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{p[name]}</svg>;
};

// ── Help Content ──────────────────────────────────────────────────────
const HELP_CONTENT = {
  home: {
    title: "Home",
    emoji: "🏠",
    sections: [
      { heading: "Quick Stats", body: "See your total workouts, this-week count, and unique exercises at a glance." },
      { heading: "Start a Session", body: "Tap '+ Start Workout' to jump into the Log tab. The timer starts on your first set." },
      { heading: "Settings", body: "Tap the gear ⚙ in the top right to toggle dark/light mode and manage your account." },
    ],
  },
  log: {
    title: "Log",
    emoji: "📋",
    sections: [
      { heading: "Add an Exercise", body: "Tap 'Add Exercise', then search or type a custom name. Custom exercises stick around for next time." },
      { heading: "Log Your Sets", body: "Enter weight and reps, tap '+ Add Set' for more. Tap the RPE chip on each set to rate effort (6–10) and set Reps in Reserve." },
      { heading: "AI Coach", body: "Each exercise shows a Coach card with a target based on your history. Tap 'Apply' to pre-fill the suggestion, or dismiss it." },
      { heading: "Rest Timer", body: "Pick a preset (30s–3m) and tap Start between sets. The ring turns green when rest is done." },
      { heading: "Reuse Past Workouts", body: "If you've tagged sessions in History, load them here as a template." },
    ],
  },
  history: {
    title: "History",
    emoji: "📅",
    sections: [
      { heading: "Tap to Expand", body: "Tap any workout card to see every set, rep, and weight from that session." },
      { heading: "Tag Your Sessions", body: "Add up to 3 tags (Push, Legs, Pull…) so you can reload them as templates in Log." },
      { heading: "Export CSV", body: "Tap 'Export' to download all your data as a spreadsheet." },
    ],
  },
  progress: {
    title: "Progress",
    emoji: "📈",
    sections: [
      { heading: "Your Big 3 PRs", body: "Bench, Squat, and Deadlift records sit up top. The heaviest gets a 'TOP PR' badge." },
      { heading: "Scrub the Chart", body: "Touch and drag across any graph to scrub through sessions and see exact weight, reps, and date." },
      { heading: "The Crown 👑", body: "The orange crown marks your current PR — based on weight AND reps at that weight." },
      { heading: "Jump To", body: "Use the dropdown at the top to jump to any exercise chart." },
    ],
  },
  profile: {
    title: "Profile",
    emoji: "👤",
    sections: [
      { heading: "Personal Info", body: "Tap 'Edit' to update your name, age, weight, height, and goal. Save when you're done." },
      { heading: "Goals", body: "Pick a training goal (Muscle, Strength, Cardio, Cut, Maintain) — it's shown on your profile." },
      { heading: "Lifetime Stats", body: "See your total workouts, sets, exercises, and weekly activity, calculated live." },
    ],
  },
  manual: {
    title: "User Manual",
    emoji: "📖",
    sections: [
      { heading: "Getting Started", body: "Create an account on the landing page with a username, email, and a strong password (8+ characters, uppercase, lowercase, and a digit). After signup you'll be directed to set up your Profile." },
      { heading: "Your First Workout", body: "Tap the Log tab or '+ Start Workout' on Home. Add exercises using the search picker, enter your sets with weight and reps, use the rest timer between sets, then tap 'Finish Workout' to save." },
      { heading: "Tracking Progress", body: "The Progress tab automatically builds charts from your logged data. The more sessions you log, the more detailed your progression graphs become." },
      { heading: "Tagging & Templates", body: "Tag sessions in History (e.g. Push, Legs) and they'll appear in the Log tab's dropdown — tap a tag to reload that workout as a template for your next session." },
      { heading: "Data & Privacy", body: "All data is stored locally on your device in your browser's localStorage. No data is sent to any server. Each account is completely isolated — different users on the same device have separate data." },
      { heading: "Exporting Your Data", body: "Go to History and tap 'Export' to download a CSV of all your workout data. This can be opened in Excel, Google Sheets, or any spreadsheet app." },
      { heading: "Multiple Accounts", body: "You can create multiple accounts on the same device. Each account has its own separate workout history, profile, and progress data." },
    ],
  },
};

// ── Help Modal ────────────────────────────────────────────────────────
function HelpModal({ page, onClose }) {
  const t = useT();
  const content = HELP_CONTENT[page];
  if (!content) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
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
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: t.textMuted, cursor: "pointer", display: "flex", padding: 4 }}>
            <Icon name="x" size={20} />
          </button>
        </div>
        {/* Scrollable content */}
        <div style={{ overflowY: "auto", padding: "0 20px", flex: 1 }}>
          {content.sections.map((s, i) => (
            <div key={i} style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 3, height: 16, background: accent, borderRadius: 2, flexShrink: 0 }} />
                <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>{s.heading}</div>
              </div>
              <div style={{ fontSize: 13, color: t.textSub, lineHeight: 1.65, paddingLeft: 11 }}>{s.body}</div>
            </div>
          ))}
          <div style={{ textAlign: "center", paddingTop: 8, paddingBottom: 4 }}>
            <div style={{ fontSize: 11, color: t.textMuted }}>
              Rep Set v{APP_VERSION} · Built {BUILD_DATE}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Help Button ───────────────────────────────────────────────────────
function HelpBtn({ page, onOpen }) {
  const t = useT();
  return (
    <button onClick={onOpen} style={{
      background: t.surfaceHigh,
      border: `1px solid ${t.border}`,
      borderRadius: 20,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "5px 12px 5px 10px",
      fontSize: 12,
      fontWeight: 600,
      color: t.textSub,
      flexShrink: 0,
    }}>
      <span style={{
        background: `linear-gradient(135deg, ${accent}, #4A8BC4)`, color: "#ffffff",
        borderRadius: "50%", width: 16, height: 16,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 800, lineHeight: 1, flexShrink: 0,
      }}>?</span>
      Help
    </button>
  );
}

// ── Rest Timer ────────────────────────────────────────────────────────
function RestTimer() {
  const t = useT(); const S = useS();
  const PRESETS = [30, 60, 90, 120, 180];
  const [seconds, setSeconds] = useState(90);
  const [remaining, setRemaining] = useState(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [customMin, setCustomMin] = useState("");
  const [customSec, setCustomSec] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const notifTimeout = useRef(null);

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

  useEffect(() => {
    if (!running) return;
    if (remaining <= 0) { setRunning(false); setDone(true); haptic([0, 80, 40, 80]); cancelNotif(); return; }
    const id = setInterval(() => setRemaining(r => r - 1), 1000);
    return () => clearInterval(id);
  }, [running, remaining]); // eslint-disable-line

  useEffect(() => {
    const handler = () => {
      setRemaining(seconds); setRunning(true); setDone(false);
      haptic(10); scheduleNotif(seconds);
    };
    window.addEventListener("gt-start-timer", handler);
    return () => window.removeEventListener("gt-start-timer", handler);
  }, [seconds]); // eslint-disable-line

  const applyCustom = () => {
    const m = parseInt(customMin) || 0;
    const s = parseInt(customSec) || 0;
    const total = m * 60 + s;
    if (total > 0 && total <= 3600) {
      setSeconds(total); setRemaining(null); setRunning(false); setDone(false);
      setShowCustom(false);
    }
  };

  const setPreset = (p) => { setSeconds(p); setRemaining(null); setRunning(false); setDone(false); setShowCustom(false); };
  const start = () => { setRemaining(seconds); setRunning(true); setDone(false); haptic(10); scheduleNotif(seconds); };
  const stop  = () => { setRunning(false); setRemaining(null); setDone(false); cancelNotif(); };
  const fmt   = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const progress = remaining != null ? remaining / seconds : 1;
  const R = 34, circ = 2 * Math.PI * R;

  const isCustomActive = !PRESETS.includes(seconds);

  return (
    <div style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Icon name="timer" size={14} />
        <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 15, letterSpacing: 1, color: t.text }}>REST TIMER</span>
        {done && <span style={{ fontSize: 12, color: "#5bb85b", fontWeight: 700, marginLeft: "auto" }}>✓ Rest complete!</span>}
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
              {remaining != null ? fmt(remaining) : fmt(seconds)}
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
                borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", minHeight: 36, touchAction: "manipulation",
              }}>{p >= 60 ? `${p/60}m` : `${p}s`}</button>
            ))}
            <button onClick={() => setShowCustom(v => !v)} style={{
              background: isCustomActive ? accent : t.inputBg,
              color: isCustomActive ? "#ffffff" : t.textSub,
              border: `1px solid ${isCustomActive ? accent : t.border}`,
              borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", minHeight: 36, touchAction: "manipulation",
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
              <button onClick={applyCustom} style={{ marginLeft: 4, background: `linear-gradient(135deg, ${accent}, #4A8BC4)`, color: "#ffffff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Set</button>
            </div>
          )}

          {/* Controls */}
          <div style={{ display: "flex", gap: 8 }}>
            {!running
              ? <button onClick={start} style={{ ...S.solidBtn(), flex: 1, padding: "11px 0", fontSize: 14, borderRadius: 10, minHeight: 42 }}>{remaining != null ? "Resume" : "Start"}</button>
              : <button onClick={() => setRunning(false)} style={{ flex: 1, background: t.inputBg, border: `1px solid ${t.border}`, color: t.text, borderRadius: 10, padding: "11px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", minHeight: 42, touchAction: "manipulation" }}>Pause</button>
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

  const yTickVals = Array.from({ length: 4 }, (_, i) => wMin + (wRange / 3) * i);
  const rTickVals = hasReps ? Array.from({ length: 4 }, (_, i) => Math.round(rMin + (rRange / 3) * i)) : [];
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
    <div>
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

      {/* Legend */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 20, marginTop: 8, fontSize: 11, color: t.textMuted }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke={WEIGHT_COLOR} strokeWidth="2.5" /></svg>
          <span style={{ color: WEIGHT_COLOR, fontWeight: 600 }}>Weight (lbs)</span>
        </span>
        {hasReps && (
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke={REPS_COLOR} strokeWidth="2" strokeDasharray="5,3" /></svg>
            <span style={{ color: REPS_COLOR, fontWeight: 600 }}>Reps</span>
          </span>
        )}
      </div>
    </div>
  );
}

// ── Big 3 PRs ─────────────────────────────────────────────────────────
function Big3PRs({ workouts }) {
  const t = useT();
  const cfg = {
    "Bench Press": { label: "BP",  color: "#5B9BD5", borderColor: "#1e3a52", bgColor: "rgba(91,155,213,0.08)" },
    "Squat":       { label: "SQ",  color: "#A8C8E8", borderColor: "#1e2e3a", bgColor: "rgba(168,200,232,0.07)" },
    "Deadlift":    { label: "DL",  color: "#7aafd4", borderColor: "#1a2e40", bgColor: "rgba(122,175,212,0.07)" },
  };
  const getPR = (name) => {
    const ws = workouts.flatMap(w => w.exercises.filter(e => e.name === name).flatMap(e => e.sets)).map(s => parseFloat(s.weight)).filter(v => !isNaN(v) && v > 0);
    return ws.length ? Math.max(...ws) : null;
  };
  const getDate = (name) => { const w = workouts.find(w => w.exercises.some(e => e.name === name)); return w ? formatDate(w.date) : null; };
  const prs = BIG3.map(name => ({ name, pr: getPR(name), date: getDate(name) }));
  const maxPR = Math.max(...prs.map(p => p.pr || 0));
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Icon name="trophy" size={17} />
        <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 20, letterSpacing: 1.5 }}>BIG 3 PERSONAL RECORDS</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {prs.map(({ name, pr, date }) => {
          const c = cfg[name]; const isTop = pr && pr === maxPR;
          return (
            <div key={name} style={{ background: c.bgColor, border: `1px solid ${pr ? c.borderColor : t.border}`, borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, position: "relative", overflow: "hidden" }}>
              {pr && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: c.color, borderRadius: "14px 0 0 14px" }} />}
              <div style={{ width: 46, height: 46, borderRadius: 12, background: `${c.color}18`, border: `1px solid ${c.color}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "'Bebas Neue', cursive", fontSize: 15, letterSpacing: 1, color: c.color }}>{c.label}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>{name}</div>
                {pr
                  ? <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}><span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 32, letterSpacing: 1, color: c.color, lineHeight: 1 }}>{pr}</span><span style={{ color: t.textMuted, fontSize: 14 }}>lbs</span></div>
                  : <div style={{ color: t.textMuted, fontSize: 14, marginTop: 2 }}>Not logged yet</div>
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
    </div>
  );
}

// ── Set Row ───────────────────────────────────────────────────────────
function SetRow({ set, index, onChange, onRemove }) {
  const t = useT(); const S = useS();
  const [showRpe, setShowRpe] = useState(false);
  const rpe = set.rpe != null ? parseFloat(set.rpe) : null;
  const rir = set.rir != null ? parseFloat(set.rir) : (rpe != null ? Math.round(10 - rpe) : null);
  const hasRpe = rpe != null;

  const toneColor = rpe == null ? t.textMuted
    : rpe >= 9.5 ? "#d55b5b"
    : rpe >= 8.5 ? "#ff9500"
    : "#5bb85b";

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ width: 22, color: t.textMuted, fontSize: 13, textAlign: "center", flexShrink: 0 }}>{index + 1}</span>
        <input type="number" inputMode="decimal" placeholder="lbs" value={set.weight} onChange={e => onChange({ ...set, weight: e.target.value })} style={S.inputStyle({ width: 88 })} />
        <span style={{ color: t.textMuted, fontSize: 13 }}>×</span>
        <input type="number" inputMode="numeric" placeholder="reps" value={set.reps} onChange={e => onChange({ ...set, reps: e.target.value })} style={S.inputStyle({ width: 80 })} />
        {/* RPE chip */}
        <button
          onClick={() => { setShowRpe(v => !v); haptic(8); }}
          style={{
            background: hasRpe ? `${toneColor}18` : "transparent",
            border: `1px solid ${hasRpe ? toneColor + "66" : t.border}`,
            borderRadius: 8, padding: "6px 9px", fontSize: 11, fontWeight: 700,
            color: hasRpe ? toneColor : t.textMuted, cursor: "pointer",
            whiteSpace: "nowrap", flexShrink: 0, minHeight: 36, touchAction: "manipulation",
            transition: "all 0.15s",
          }}
        >
          {hasRpe ? `@${rpe % 1 === 0 ? rpe : rpe.toFixed(1)}` : "RPE"}
        </button>
        <button onClick={onRemove} style={S.iconBtn("#ff5b5b")}><Icon name="x" size={14} /></button>
      </div>

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
function ExerciseBlock({ exercise, onChange, onRemove, workouts }) {
  const S = useS();
  const t = useT();
  const [coachDismissed, setCoachDismissed] = useState(false);

  const addSet = () => {
    const last = exercise.sets[exercise.sets.length - 1];
    if (last && (last.weight || last.reps)) { window.dispatchEvent(new Event("gt-start-timer")); }
    else { haptic(10); }
    onChange({ ...exercise, sets: [...exercise.sets, { weight: "", reps: "" }] });
  };
  const updateSet = (i, s) => { const sets = [...exercise.sets]; sets[i] = s; onChange({ ...exercise, sets }); };
  const removeSet = (i) => onChange({ ...exercise, sets: exercise.sets.filter((_, j) => j !== i) });

  const coach = coachFor(exercise.name, workouts);

  const coachColors = {
    intro:        { bg: `${accent}12`,       border: `${accent}44`,       icon: accent,     label: "First Lift" },
    comeback:     { bg: "rgba(255,149,0,.1)", border: "rgba(255,149,0,.4)", icon: "#ff9500", label: "Welcome Back" },
    recover:      { bg: "rgba(213,91,91,.1)", border: "rgba(213,91,91,.4)", icon: "#d55b5b", label: "Recover" },
    push:         { bg: "rgba(91,184,91,.1)", border: "rgba(91,184,91,.4)", icon: "#5bb85b", label: "Push It" },
    breakthrough: { bg: "rgba(255,149,0,.1)", border: "rgba(255,149,0,.4)", icon: "#ff9500", label: "Break Through" },
    progress:     { bg: `${accent}12`,       border: `${accent}44`,       icon: accent,     label: "Next Target" },
  };
  const cc = coach ? coachColors[coach.tone] || coachColors.progress : null;

  return (
    <div style={S.card()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 20, letterSpacing: 1, color: accent }}>{exercise.name}</span>
        <button onClick={onRemove} style={S.iconBtn("#ff5b5b")}><Icon name="trash" size={15} /></button>
      </div>

      {/* Coach card */}
      {coach && !coachDismissed && (
        <div style={{
          background: cc.bg, border: `1px solid ${cc.border}`, borderRadius: 12,
          padding: "11px 14px", marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 10,
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
                    if (!exercise.sets.some(s => !s.weight && !s.reps)) {
                      onChange({ ...exercise, sets: [...exercise.sets, { weight: String(coach.target.weight), reps: String(coach.target.reps) }] });
                    } else {
                      const sets = exercise.sets.map(s => (!s.weight && !s.reps) ? { ...s, weight: String(coach.target.weight), reps: String(coach.target.reps) } : s);
                      onChange({ ...exercise, sets });
                    }
                    setCoachDismissed(true);
                    haptic([10, 30, 10]);
                  }}
                  style={{
                    background: cc.icon, color: "#fff", border: "none", borderRadius: 8,
                    padding: "7px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer", touchAction: "manipulation",
                  }}
                >Apply {coach.target.weight} × {coach.target.reps}</button>
                <button onClick={() => setCoachDismissed(true)}
                  style={{ background: "transparent", border: `1px solid ${t.border}`, borderRadius: 8, padding: "7px 11px", fontSize: 12, color: t.textMuted, cursor: "pointer", touchAction: "manipulation" }}>
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        {exercise.sets.map((s, i) => <SetRow key={i} set={s} index={i} onChange={s => updateSet(i, s)} onRemove={() => removeSet(i)} />)}
      </div>
      <button onClick={addSet} style={S.ghostBtn()}><Icon name="plus" size={14} /> Add Set</button>
      <textarea
        value={exercise.note || ""}
        onChange={e => onChange({ ...exercise, note: e.target.value })}
        placeholder="Notes (e.g. felt tight, increase next time…)"
        rows={1}
        style={{ marginTop: 10, width: "100%", background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 12, color: t.text, padding: "12px 14px", fontSize: 14, outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box", lineHeight: 1.6 }}
        onInput={e => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
      />
    </div>
  );
}

// ── History Card ──────────────────────────────────────────────────────
function WorkoutHistoryCard({ workout, index, onLabelChange, onDelete }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const swipeTouchX = useRef(null);
  const startOffset = useRef(0);
  const isDragging = useRef(false);
  const DELETE_W = 76;

  const activeLabels = workout.labels ? workout.labels : workout.label ? [workout.label] : [];
  const activeCfgs = activeLabels.map(id => WORKOUT_LABELS.find(l => l.id === id)).filter(Boolean);
  const toggleLabel = (e, id) => {
    e.stopPropagation();
    let next = activeLabels.includes(id) ? activeLabels.filter(l => l !== id) : activeLabels.length >= 3 ? [...activeLabels.slice(1), id] : [...activeLabels, id];
    onLabelChange(index, next);
  };

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
      setSwipeOffset(Math.max(Math.min(startOffset.current + dx, 0), -DELETE_W));
    }
  };
  const onCardTouchEnd = (e) => {
    if (isDragging.current) {
      e.stopPropagation();
      if (swipeOffset < -DELETE_W / 2) { setSwipeOffset(-DELETE_W); haptic(10); }
      else setSwipeOffset(0);
    } else if (swipeOffset !== 0) {
      e.stopPropagation();
      setSwipeOffset(0);
    }
    swipeTouchX.current = null;
  };

  return (
    <div style={{ position: "relative", marginBottom: 10, borderRadius: 14, overflow: "hidden" }}>
      {/* Delete button revealed on swipe left */}
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
                {workout.exercises.length} exercise{workout.exercises.length !== 1 ? "s" : ""}{workout.duration ? ` · ${workout.duration}min` : ""}
              </div>
            </div>
            <span style={{ color: t.textMuted, flexShrink: 0, display: "flex", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}><Icon name="chevronDown" size={16} /></span>
          </div>
          {open && (
            <div style={{ padding: "0 16px 14px" }}>
              {/* Tag picker */}
              <div style={{ marginBottom: 12, paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>Tag this workout</div>
                  <div style={{ fontSize: 10, color: t.textMuted }}>{activeLabels.length}/3 selected</div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {WORKOUT_LABELS.map(l => {
                    const isActive = activeLabels.includes(l.id);
                    return (
                      <button key={l.id} onClick={(e) => toggleLabel(e, l.id)} style={{ background: isActive ? l.bg : "transparent", border: `1px solid ${isActive ? l.border : t.border}`, color: isActive ? l.color : t.textMuted, borderRadius: 10, padding: "9px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s", opacity: (!isActive && activeLabels.length >= 3) ? 0.4 : 1, minHeight: 38, touchAction: "manipulation" }}>
                        {l.emoji} {l.label}{isActive && <span style={{ fontSize: 10, marginLeft: 1, opacity: 0.7 }}>✕</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Sets */}
              {workout.exercises.map((ex, j) => (
                <div key={j} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: j < workout.exercises.length - 1 ? `1px solid ${t.border}` : "none" }}>
                  <div style={{ color: accent, fontSize: 13, fontWeight: 700, marginBottom: 5 }}>{ex.name}</div>
                  {ex.sets.map((s, k) => (
                    <div key={k} style={{ display: "flex", gap: 8, fontSize: 13 }}>
                      <span style={{ color: t.textMuted, width: 18 }}>{k + 1}.</span>
                      <span style={{ color: t.textSub }}>{s.weight} lbs</span>
                      <span style={{ color: t.textMuted }}>×</span>
                      <span style={{ color: t.textSub }}>{s.reps} reps</span>
                    </div>
                  ))}
                  {ex.note && <div style={{ marginTop: 5, fontSize: 12, color: t.textMuted, fontStyle: "italic" }}>📝 {ex.note}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Security Settings Component ───────────────────────────────────────
function SecuritySettings() {
  const t = useT();
  const [showSecurity, setShowSecurity] = useState(false);
  const [secTab, setSecTab] = useState("email");
  const [newEmail, setNewEmail] = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [secMsg, setSecMsg] = useState(null);
  const [secVerify, setSecVerify] = useState(false);

  const pField = { background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: 12, color: t.text, padding: "13px 14px", fontSize: 16, outline: "none", width: "100%", boxSizing: "border-box", marginBottom: 0, WebkitAppearance: "none" };
  const lbl = { fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, display: "block", fontWeight: 700 };

  const pwRules = [
    { label: "8+ characters", ok: newPw.length >= 8 },
    { label: "Uppercase",     ok: /[A-Z]/.test(newPw) },
    { label: "Lowercase",     ok: /[a-z]/.test(newPw) },
    { label: "Number",        ok: /[0-9]/.test(newPw) },
  ];
  const pwValid = pwRules.every(r => r.ok);

  const handleEmailChange = async () => {
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      setSecMsg({ type: "error", text: "Please enter a valid email address." }); return;
    }
    if (newEmail === auth.currentUser?.email) {
      setSecMsg({ type: "error", text: "That's already your current email." }); return;
    }
    try {
      await updateEmail(auth.currentUser, newEmail);
      await sendEmailVerification(auth.currentUser);
      setSecVerify(true);
      setSecMsg({ type: "success", text: `Verification sent to ${newEmail}` });
    } catch (err) {
      if (err.code === "auth/requires-recent-login") {
        setSecMsg({ type: "error", text: "Please sign out and sign back in before changing your email." });
      } else {
        setSecMsg({ type: "error", text: err.message });
      }
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
              <label style={lbl}>New Email Address</label>
              <input type="email" value={newEmail} onChange={e => { setNewEmail(e.target.value); setSecMsg(null); }} placeholder="new@email.com" style={{ ...pField, marginBottom: 12 }} />
              <button onClick={handleEmailChange} style={{ width: "100%", background: `linear-gradient(135deg, ${accent}, #4A8BC4)`, color: "#ffffff", border: "none", borderRadius: 12, padding: "13px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Bebas Neue', cursive", letterSpacing: 1 }}>
                Update Email
              </button>
            </div>
          )}

          {secTab === "password" && (
            <div>
              <label style={lbl}>Current Password</label>
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
        </div>
      )}
    </div>
  );
}

// ── Settings Modal ────────────────────────────────────────────────────
function SettingsModal({ authedUser, onClose, toggleTheme }) {
  const t = useT();
  const theme = useContext(ThemeCtx);
  const accent = "#5B9BD5";
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 900, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }}
      onClick={onClose}>
      {/* Backdrop */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} />
      {/* Sheet */}
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: "100%", maxWidth: 420, background: t.surface, borderRadius: "20px 20px 0 0", padding: "0 20px calc(env(safe-area-inset-bottom, 0px) + 24px)", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.4)" }}>
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
        {/* Theme toggle */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, marginBottom: 10 }}>Appearance</div>
          <button onClick={toggleTheme} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 12, padding: "13px 16px", cursor: "pointer", color: t.text, boxSizing: "border-box" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 14 }}>
              <Icon name={theme === "dark" ? "moon" : "sun"} size={16} />
              {theme === "dark" ? "Dark Mode" : "Light Mode"}
            </span>
            <span style={{ fontSize: 11, color: t.textMuted, fontWeight: 600 }}>Tap to switch</span>
          </button>
        </div>
        {/* Security */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, marginBottom: 10 }}>Account Security</div>
          <SecuritySettings />
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
      <button onClick={handleGoogle} style={{ width: "100%", background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: 11, color: "#ccc", padding: "13px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxSizing: "border-box" }}>
        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Continue with Google
      </button>
    </div>
  );
}

// ── Landing Page ──────────────────────────────────────────────────────
function LandingPage({ onNewUser }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [animIn, setAnimIn] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const bg = THEMES.dark.bg; const sh = THEMES.dark.surfaceHigh;

  useEffect(() => { setTimeout(() => setAnimIn(true), 60); }, []);

  const switchMode = (m) => { setMode(m); setError(""); setUsername(""); setEmail(""); setPassword(""); };

  const handleSubmit = async () => {
    const u = username.trim(), em = email.trim();
    if (mode === "signup") {
      if (!u || !em || !password) { setError("Please fill in all fields."); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setError("Please enter a valid email address."); return; }
      if (password.length < 8)       { setError("Password must be at least 8 characters."); return; }
      if (!/[A-Z]/.test(password))   { setError("Password must include at least 1 uppercase letter."); return; }
      if (!/[a-z]/.test(password))   { setError("Password must include at least 1 lowercase letter."); return; }
      if (!/[0-9]/.test(password))   { setError("Password must include at least 1 digit."); return; }
      try {
        const cred = await createUserWithEmailAndPassword(auth, em, password);
        await updateProfile(cred.user, { displayName: u });
        await sendEmailVerification(cred.user);
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
    <div style={{ background: bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 28px", fontFamily: "'DM Sans', sans-serif", maxWidth: 420, margin: "0 auto" }}>
      <style>{`
        @keyframes gt-line-grow { from { transform: scaleX(0); opacity: 0; } to { transform: scaleX(1); opacity: 1; } }
        @keyframes gt-gym-in { from { opacity: 0; letter-spacing: 12px; } to { opacity: 1; letter-spacing: 4px; } }
        @keyframes gt-track-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes gt-tag-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes gt-accent-pulse { 0%,100% { text-shadow: 0 0 0px rgba(91,155,213,0); } 50% { text-shadow: 0 0 18px rgba(91,155,213,0.45); } }
      `}</style>
      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, marginBottom: 14, transformOrigin: "center", animation: "gt-line-grow 1.4s cubic-bezier(0.16,1,0.3,1) 0.2s both" }} />
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 52, lineHeight: 1, display: "flex", alignItems: "baseline", justifyContent: "center" }}>
          <span style={{ color: "#ffffff", letterSpacing: 4, animation: "gt-gym-in 1.2s cubic-bezier(0.16,1,0.3,1) 0.6s both", display: "inline-block" }}>REP</span>
          <span style={{ color: accent, letterSpacing: 4, animation: "gt-track-in 1.2s cubic-bezier(0.16,1,0.3,1) 1.3s both, gt-accent-pulse 3s ease-in-out 3s infinite", display: "inline-block" }}>SET</span>
        </div>
        <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accent}55, transparent)`, marginTop: 14, transformOrigin: "center", animation: "gt-line-grow 1.4s cubic-bezier(0.16,1,0.3,1) 0.9s both" }} />
        <div style={{ color: "#444", fontSize: 13, marginTop: 12, letterSpacing: 2, textTransform: "uppercase", animation: "gt-tag-in 1s ease 2.2s both" }}>Train · Log · Improve</div>
      </div>
      {/* Card */}
      <div style={{ width: "100%", background: sh, borderRadius: 18, border: "1px solid #2a2a2a", padding: "28px 24px", opacity: animIn ? 1 : 0, transform: animIn ? "translateY(0)" : "translateY(20px)", transition: "all 0.5s ease 0.1s" }}>
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
            <div style={{ display: "flex", background: "#111", borderRadius: 10, padding: 4, marginBottom: 24, gap: 4 }}>
              {["login", "signup"].map(m => (
                <button key={m} onClick={() => switchMode(m)} style={{ flex: 1, background: mode === m ? accent : "transparent", color: mode === m ? "#ffffff" : "#555", border: "none", borderRadius: 7, padding: "9px 0", cursor: "pointer", fontFamily: "'Bebas Neue', cursive", letterSpacing: 1, fontSize: 15, transition: "all 0.2s" }}>
                  {m === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
                </button>
              ))}
            </div>
            {/* Fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 8 }}>
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
            {error && <div style={{ background: "rgba(213,91,91,0.12)", border: "1px solid rgba(213,91,91,0.3)", color: "#d55b5b", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginBottom: 16, marginTop: 8 }}>{error}</div>}
            <button onClick={handleSubmit} style={{ width: "100%", background: `linear-gradient(135deg, ${accent}, #4A8BC4)`, color: "#ffffff", border: "none", borderRadius: 11, padding: 15, marginTop: error ? 0 : 16, fontFamily: "'Bebas Neue', cursive", letterSpacing: 1.5, fontSize: 20, cursor: "pointer" }}>
              {mode === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
            </button>
            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0 16px" }}>
              <div style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
              <span style={{ color: "#444", fontSize: 12, letterSpacing: 0.5 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
            </div>
            {/* Google Sign In */}
            <GoogleSignInButton onError={setError} />
            {/* Apple — coming soon */}
            <div style={{ marginBottom: 10 }}>
              <button disabled style={{ width: "100%", background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: 11, color: "#ccc", padding: "13px 16px", fontSize: 14, fontWeight: 600, cursor: "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: 0.45, boxSizing: "border-box" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                Continue with Apple
              </button>
              <div style={{ textAlign: "center", fontSize: 10, color: "#444", marginTop: 4 }}>Coming soon</div>
            </div>
          </>
        )}
      </div>
      <div style={{ marginTop: 24, color: "#333", fontSize: 12, textAlign: "center", opacity: animIn ? 1 : 0, transition: "opacity 0.5s ease 0.3s" }}>Your data is securely stored in the cloud</div>
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

  const totalSets = workout.exercises.reduce((n, ex) => n + ex.sets.length, 0);
  const totalReps = workout.exercises.reduce((n, ex) => n + ex.sets.reduce((s, set) => s + (parseInt(set.reps) || 0), 0), 0);
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
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "#0a0a0a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", overflow: "hidden", opacity: visible ? 1 : 0, transition: "opacity 0.4s ease" }}>
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
const PLATES = [45, 35, 25, 10, 5, 2.5];
const PLATE_COLORS = { 45: "#d55b5b", 35: "#5B9BD5", 25: "#A8C8E8", 10: "#5bb85b", 5: "#b55bd5", 2.5: "#d5a55b" };
const BAR_WEIGHT = 45;

function calcPlates(target) {
  let remaining = (target - BAR_WEIGHT) / 2;
  if (remaining < 0) return null;
  const result = [];
  for (const plate of PLATES) {
    const count = Math.floor(remaining / plate);
    if (count > 0) { result.push({ weight: plate, count }); remaining = Math.round((remaining - plate * count) * 100) / 100; }
  }
  return { plates: result, remainder: remaining };
}

function PlateCalculator({ onClose }) {
  const t = useT(); const S = useS();
  const [target, setTarget] = useState("");
  const result = target ? calcPlates(parseFloat(target) || 0) : null;
  const total = result ? BAR_WEIGHT + result.plates.reduce((s, p) => s + p.weight * p.count * 2, 0) : 0;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ background: t.surface, borderRadius: "20px 20px 0 0", padding: "20px 20px 32px", maxWidth: 420, width: "100%", margin: "0 auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)" }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: t.border, borderRadius: 4, margin: "0 auto 18px" }} />
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, letterSpacing: 1, marginBottom: 16 }}>
          Plate <span style={{ color: accent }}>Calculator</span>
        </div>
        <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Target Weight (lbs)</div>
        <input
          type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. 225"
          autoFocus inputMode="decimal"
          style={{ ...S.inputStyle({ width: "100%", fontSize: 22, padding: "12px 14px", borderRadius: 12, marginBottom: 16 }) }}
        />
        {result && (
          <>
            <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>Each side of the bar</div>
            {result.plates.length === 0 && result.remainder === 0 && (
              <div style={{ color: t.textMuted, fontSize: 14 }}>Just the bar ({BAR_WEIGHT} lbs)</div>
            )}
            {result.plates.map(p => (
              <div key={p.weight} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: PLATE_COLORS[p.weight] + "22", border: `2px solid ${PLATE_COLORS[p.weight]}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Bebas Neue', cursive", fontSize: 16, color: PLATE_COLORS[p.weight], flexShrink: 0 }}>
                  {p.weight}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: t.text }}>× {p.count}</div>
                  <div style={{ fontSize: 11, color: t.textMuted }}>{p.weight * p.count} lbs per side</div>
                </div>
              </div>
            ))}
            {result.remainder > 0 && (
              <div style={{ fontSize: 12, color: "#d55b5b", marginTop: 4 }}>⚠ {result.remainder} lbs unaccounted — not achievable with standard plates</div>
            )}
            <div style={{ marginTop: 14, padding: "10px 14px", background: t.surfaceHigh, borderRadius: 10, border: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: t.textMuted }}>Actual weight loaded</span>
              <span style={{ fontWeight: 700, color: total === parseFloat(target) ? "#5bb85b" : accent }}>{total} lbs</span>
            </div>
          </>
        )}
        {result === null && target !== "" && (
          <div style={{ fontSize: 13, color: "#d55b5b" }}>Weight must be greater than {BAR_WEIGHT} lbs (bar weight)</div>
        )}
        <button onClick={onClose} style={{ ...S.solidBtn({ marginTop: 18, width: "100%", padding: 14, fontSize: 16 }) }}>Done</button>
      </div>
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
  const [data, save] = useStorage(firebaseUser?.uid);
  const [view, setView] = useState("home");
  const [workout, setWorkout] = useState(null);
  const [exSearch, setExSearch] = useState("");
  const [showExPicker, setShowExPicker] = useState(false);
  const [completedWorkout, setCompletedWorkout] = useState(null);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("gymtrack-theme") || "dark"; } catch { return "dark"; } });
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState({});
  const [helpPage, setHelpPage] = useState(null);
  const [showPlateCalc, setShowPlateCalc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const t = THEMES[theme]; const S = makeStyles(t);
  const profile = data.profile || {};
  const SWIPE_VIEWS = ["home", "log", "history", "progress", "profile"];
  const touchX = useRef(null); const touchY = useRef(null);
  const onTouchStart = (e) => {
    touchX.current = e.touches[0].clientX; touchY.current = e.touches[0].clientY;
    if (!e.target.closest("input, textarea, select")) document.activeElement?.blur();
  };
  const onTouchEnd = (e) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    const dy = e.changedTouches[0].clientY - touchY.current;
    if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 55) {
      const idx = SWIPE_VIEWS.indexOf(view);
      if (dx < 0 && idx < SWIPE_VIEWS.length - 1) setView(SWIPE_VIEWS[idx + 1]);
      if (dx > 0 && idx > 0) setView(SWIPE_VIEWS[idx - 1]);
    }
    touchX.current = null;
  };
  const saveProfile = (updates) => save({ ...data, profile: { ...profile, ...updates } });
  const toggleTheme = () => { const n = theme === "dark" ? "light" : "dark"; setTheme(n); try { localStorage.setItem("gymtrack-theme", n); } catch {} };

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
    `;
    document.head.appendChild(style);
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    setWorkout(null); setView("home"); setIsNewUser(false);
  };

  useEffect(() => {
    if (firebaseUser && isNewUser) { setView("profile"); setIsNewUser(false); }
  }, [firebaseUser, isNewUser]);

  if (authLoading) return (
    <div style={{ background: "#0A0A0A", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#5B9BD5", fontFamily: "'Bebas Neue', cursive", fontSize: 24, letterSpacing: 3 }}>LOADING…</div>
    </div>
  );

  if (!firebaseUser) return <LandingPage onNewUser={() => setIsNewUser(true)} />;

  const allExercises = [...new Set([...DEFAULT_EXERCISES, ...data.workouts.flatMap(w => w.exercises.map(e => e.name))])].sort();
  const filtered = allExercises.filter(e => e.toLowerCase().includes(exSearch.toLowerCase()));

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
    setWorkout(w => {
      const cur = w || { date: todayISO(), startTime: Date.now(), exercises: [] };
      return { ...cur, exercises: [...cur.exercises, { name, sets: [{ weight: "", reps: "" }] }] };
    });
    setShowExPicker(false); setExSearch("");
  };
  const finishWorkout = () => {
    const cleaned = { ...workout, duration: Math.round((Date.now() - workout.startTime) / 60000), exercises: workout.exercises.map(e => ({ ...e, sets: e.sets.filter(s => s.weight !== "" || s.reps !== "") })).filter(e => e.sets.length > 0) };
    const prev = data.workouts;
    save({ ...data, workouts: [cleaned, ...data.workouts] });
    haptic([0, 60, 30, 60, 30, 120]);
    setWorkout(null); setView("home");
    setCompletedWorkout({ workout: cleaned, prevWorkouts: prev });
  };
  const exportCSV = () => {
    const rows = [["Date", "Exercise", "Set", "Weight (lbs)", "Reps", "Tags"]];
    data.workouts.forEach(w => {
      const tags = (w.labels || (w.label ? [w.label] : [])).join("+");
      w.exercises.forEach(ex => ex.sets.forEach((s, i) => rows.push([w.date, ex.name, i + 1, s.weight, s.reps, tags])));
    });
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const dataUri = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    const a = document.createElement("a");
    a.href = dataUri;
    a.download = `repset-${authedUser}-${todayISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const sel = (extra = {}) => ({ ...S.select(), ...extra });

  const navItem = (v, icon, label) => {
    const active = view === v;
    return (
      <button onClick={() => { if (v === "log" && !workout) setWorkout({ date: todayISO(), startTime: Date.now(), exercises: [] }); setView(v); }}
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
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ background: t.bg, minHeight: "100vh", color: t.text, fontFamily: "'DM Sans', sans-serif", maxWidth: 420, margin: "0 auto", position: "relative", paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))", transition: "background 0.3s, color 0.3s" }}>
      {completedWorkout && <WorkoutCompleteScreen workout={completedWorkout.workout} prevWorkouts={completedWorkout.prevWorkouts} onClose={() => setCompletedWorkout(null)} />}

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
            {/* Logo */}
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 32, letterSpacing: 2, lineHeight: 1, marginBottom: 8 }}>REP<span style={{ color: accent }}>SET</span></div>
            {/* Header */}
            <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ color: t.textMuted, fontSize: 13, marginBottom: 3 }}>{greeting},</div>
                <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 34, letterSpacing: 1.5, lineHeight: 1 }}>
                  {displayName} <span style={{ color: accent }}>💪</span>
                </div>
                <div style={{ color: t.textMuted, fontSize: 12, marginTop: 5 }}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
                {streak > 0 && <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,149,0,0.12)", border: "1px solid rgba(255,149,0,0.3)", borderRadius: 20, padding: "4px 12px", fontSize: 12, color: "#ff9500", fontWeight: 700, marginTop: 8 }}>🔥 {streak} day streak</div>}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={() => setShowSettings(true)} style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: t.textMuted }}>
                  <Icon name="gear" size={16} />
                </button>
                <HelpBtn page="home" onOpen={() => setHelpPage("home")} />
              </div>
            </div>
            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
              {statsRow.map(s => (
                <div key={s.label} style={{ background: t.surfaceHigh, borderRadius: 18, padding: "20px 8px 16px", textAlign: "center", border: `1px solid ${t.border}`, borderTop: `3px solid ${s.color}`, boxShadow: `0 4px 24px rgba(0,0,0,0.20)` }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
                  <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 32, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: t.textMuted, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>{s.label}</div>
                </div>
              ))}
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
                    <div key={i} style={{ ...S.card(), display: "flex", alignItems: "center", gap: 14, padding: "15px 18px" }}>
                      <div style={{ width: 42, height: 42, borderRadius: 12, background: labelCfgs[0] ? labelCfgs[0].bg : `${accent}15`, border: `1px solid ${labelCfgs[0] ? labelCfgs[0].border : accent + "30"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                        {labelCfgs[0] ? labelCfgs[0].emoji : "🏋️"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: t.text }}>{formatDate(w.date)}</div>
                        <div style={{ color: t.textMuted, fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.exercises.map(e => e.name).join(" · ")}</div>
                      </div>
                      <div style={{ color: t.textMuted, fontSize: 12, flexShrink: 0 }}>{w.duration ? `${w.duration}m` : ""}</div>
                    </div>
                  );
                })}
              </>
            )}
            {data.workouts.length === 0 && (
              <div style={{ textAlign: "center", padding: "48px 0 24px", color: t.textMuted }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🏋️</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: t.textSub, marginBottom: 6 }}>No workouts yet</div>
                <div style={{ fontSize: 13 }}>Tap the button above to log your first session</div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── LOG ──────────────────────────── */}
      {view === "log" && (
        <div style={{ padding: "52px 20px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div>
              <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 28, letterSpacing: 1.5, lineHeight: 1 }}>TODAY'S <span style={{ color: accent }}>LIFT</span></div>
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {workout && <div style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 600, color: t.textMuted, letterSpacing: 0.3 }}>{Math.round((Date.now() - workout.startTime) / 60000)} min</div>}
              <button onClick={() => setShowPlateCalc(true)} style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 20, padding: "8px 16px", fontSize: 12, fontWeight: 600, color: t.textSub, cursor: "pointer", letterSpacing: 0.3, minHeight: 36, touchAction: "manipulation" }}>Plates</button>
              <HelpBtn page="log" onOpen={() => setHelpPage("log")} />
            </div>
          </div>

          <RestTimer />

          {/* Quick-log last session */}
          {data.workouts.length > 0 && workout && workout.exercises.length === 0 && (
            <button onClick={() => {
              const last = data.workouts[0];
              setWorkout(w => ({ ...w, exercises: last.exercises.map(ex => ({ name: ex.name, sets: ex.sets.map(s => ({ weight: s.weight, reps: s.reps })) })) }));
            }} style={{ width: "100%", background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 14, color: t.textSub, padding: "13px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14, touchAction: "manipulation", letterSpacing: 0.3 }}>
              <Icon name="history" size={14} /> Repeat Last Session
            </button>
          )}

          {/* Load previous */}
          {(() => {
            const tagged = data.workouts.filter(w => (w.labels && w.labels.length) || w.label);
            if (!tagged.length) return null;
            const byLabel = {};
            tagged.forEach(w => { const pl = (w.labels && w.labels[0]) || w.label; if (pl && !byLabel[pl]) byLabel[pl] = { ...w, _pl: pl }; });
            const opts = Object.values(byLabel);
            return (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 7 }}>Load previous workout</div>
                <div style={{ position: "relative" }}>
                  <select value="" onChange={e => {
                    const id = e.target.value; if (!id) return;
                    const src = data.workouts.find(w => (w.labels && w.labels[0]) === id || w.label === id);
                    if (!src) return;
                    setWorkout(prev => ({ ...(prev || { date: todayISO(), startTime: Date.now(), exercises: [] }), exercises: src.exercises.map(ex => ({ name: ex.name, sets: ex.sets.map(s => ({ weight: s.weight, reps: s.reps })) })) }));
                    e.target.value = "";
                  }} style={{ ...sel(), width: "100%", padding: "10px 36px 10px 14px", fontSize: 14, color: t.text, borderRadius: 10, boxSizing: "border-box" }}>
                    <option value="">Select a tagged workout…</option>
                    {opts.map(w => {
                      const cfgs = (w.labels || [w.label]).filter(Boolean).map(id => WORKOUT_LABELS.find(l => l.id === id)).filter(Boolean);
                      return <option key={w._pl} value={w._pl} style={{ background: t.surfaceHigh, color: t.text }}>{cfgs.map(c => `${c.emoji} ${c.label}`).join(" + ") || w._pl} — {w.exercises.map(e => e.name).join(", ")}</option>;
                    })}
                  </select>
                  <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: t.textMuted, display: "flex" }}><Icon name="chevronDown" size={14} /></span>
                </div>
              </div>
            );
          })()}

          {workout && workout.exercises.map((ex, i) => (
            <ExerciseBlock key={i} exercise={ex} workouts={data.workouts}
              onChange={updated => { const exercises = [...workout.exercises]; exercises[i] = updated; setWorkout({ ...workout, exercises }); }}
              onRemove={() => setWorkout({ ...workout, exercises: workout.exercises.filter((_, j) => j !== i) })}
            />
          ))}

          {showExPicker ? (
            <div style={S.card()}>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input value={exSearch} onChange={e => setExSearch(e.target.value)} placeholder="Search or add exercise…" autoFocus style={{ ...S.inputStyle(), flex: 1, width: "auto" }} />
                <button onClick={() => setShowExPicker(false)} style={S.iconBtn()}><Icon name="x" size={16} /></button>
              </div>
              <div style={{ maxHeight: 220, overflowY: "auto" }}>
                {filtered.map(name => <button key={name} onClick={() => { if (!workout) setWorkout({ date: todayISO(), startTime: Date.now(), exercises: [] }); addExercise(name); }} style={{ display: "block", width: "100%", background: "transparent", border: "none", color: t.textSub, textAlign: "left", padding: "14px 10px", cursor: "pointer", fontSize: 15, borderBottom: `1px solid ${t.border}`, minHeight: 48, touchAction: "manipulation" }}>{name}</button>)}
                {exSearch && !filtered.find(e => e.toLowerCase() === exSearch.toLowerCase()) && <button onClick={() => { if (!workout) setWorkout({ date: todayISO(), startTime: Date.now(), exercises: [] }); addExercise(exSearch); }} style={{ display: "block", width: "100%", background: "transparent", border: "none", color: accent, textAlign: "left", padding: "14px 10px", cursor: "pointer", fontSize: 15, minHeight: 48, fontWeight: 600, touchAction: "manipulation" }}>+ Add "{exSearch}"</button>}
              </div>
            </div>
          ) : (
            <button onClick={() => { if (!workout) setWorkout({ date: todayISO(), startTime: Date.now(), exercises: [] }); setShowExPicker(true); }} style={{ ...S.ghostBtn(), width: "100%", justifyContent: "center", padding: "13px", marginBottom: 16, borderRadius: 10 }}>
              <Icon name="plus" size={15} /> Add Exercise
            </button>
          )}
          {workout && workout.exercises.length > 0 && <button onClick={finishWorkout} style={{ ...S.solidBtn(), width: "100%", padding: 14, borderRadius: 12, fontSize: 18, marginTop: 4 }}>Finish Workout</button>}
          {(!workout || workout.exercises.length === 0) && !showExPicker && (
            <div style={{ textAlign: "center", color: t.textMuted, padding: "28px 0 0", fontSize: 14 }}>
              <div>Add exercises or load a previous workout</div>
            </div>
          )}
        </div>
      )}

      {/* ── HISTORY ──────────────────────── */}
      {view === "history" && (
        <div style={{ padding: "52px 20px 20px", paddingBottom: data.workouts.length > 0 ? "100px" : "24px" }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 32, letterSpacing: 2, lineHeight: 1 }}>WORKOUT <span style={{ color: accent }}>HISTORY</span></div>
              <HelpBtn page="history" onOpen={() => setHelpPage("history")} />
            </div>
            {data.workouts.length > 0 && (
              <div style={{ position: "relative", display: "inline-block" }}>
                <select defaultValue="" onChange={e => {
                  const days = parseInt(e.target.value); if (!days) return;
                  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
                  const idx = data.workouts.findIndex(w => new Date(w.date) >= cutoff);
                  if (idx !== -1) { const el = document.getElementById(`hcard-${idx}`); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }
                  e.target.value = "";
                }} style={sel({ fontSize: 11 })}>
                  <option value="" disabled>Jump to…</option>
                  <option value="7"  style={{ background: t.surfaceHigh, color: t.text }}>Last 7 days</option>
                  <option value="14" style={{ background: t.surfaceHigh, color: t.text }}>Last 14 days</option>
                  <option value="21" style={{ background: t.surfaceHigh, color: t.text }}>Last 21 days</option>
                </select>
                <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: accent, display: "flex" }}><Icon name="chevronDown" size={12} /></span>
              </div>
            )}
          </div>
          {data.workouts.length === 0 && <div style={{ textAlign: "center", color: t.textMuted, padding: 40 }}>No history yet</div>}
          {data.workouts.map((w, i) => (
            <div key={i} id={`hcard-${i}`} style={{ scrollMarginTop: 16 }}>
              <WorkoutHistoryCard workout={w} index={i}
                onLabelChange={(idx, arr) => { const wks = [...data.workouts]; wks[idx] = { ...wks[idx], labels: arr, label: arr[0] || null }; save({ ...data, workouts: wks }); }}
                onDelete={(idx) => save({ ...data, workouts: data.workouts.filter((_, j) => j !== idx) })}
              />
            </div>
          ))}

          {/* Export — fixed above nav bar */}
          {data.workouts.length > 0 && (
            <div style={{
              position: "fixed", bottom: "calc(62px + env(safe-area-inset-bottom, 0px))", left: "50%", transform: "translateX(-50%)",
              width: "100%", maxWidth: 420, display: "flex", justifyContent: "center",
              padding: "10px 20px", boxSizing: "border-box",
              background: `linear-gradient(to top, ${t.bg} 60%, transparent)`,
              pointerEvents: "none",
            }}>
              <button
                onClick={exportCSV}
                style={{
                  pointerEvents: "all",
                  background: t.surfaceHigh,
                  border: `1px solid ${t.border}`,
                  color: t.textSub,
                  borderRadius: 20,
                  padding: "11px 28px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  letterSpacing: 0.3,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                }}
              >
                <Icon name="download" size={15} /> Export Workouts
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── PROGRESS ─────────────────────── */}
      {view === "progress" && (
        <div style={{ padding: "52px 20px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 32, letterSpacing: 2, lineHeight: 1 }}>YOUR <span style={{ color: accent }}>PROGRESS</span></div>
            <HelpBtn page="progress" onOpen={() => setHelpPage("progress")} />
          </div>
          <Big3PRs workouts={data.workouts} />
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
            ? <div style={{ color: t.textMuted, fontSize: 14, textAlign: "center", padding: "32px 0" }}><Icon name="chart" size={32} /><div style={{ marginTop: 12 }}>Log workouts to see progression charts</div></div>
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
                  const lc = palette[idx % palette.length];
                  const best1RM = data.workouts
                    .flatMap(w => w.exercises.filter(e => e.name === name).flatMap(e => e.sets))
                    .reduce((best, s) => { const v = epley1RM(parseFloat(s.weight) || 0, parseInt(s.reps) || 0); return (v && v > best) ? v : best; }, 0);
                  return (
                    <div key={name} id={`exc-${name.replace(/\s+/g, "-")}`} style={{ scrollMarginTop: 16, ...S.card(), border: `1px solid ${BIG3.includes(name) ? lc + "44" : t.border}` }}>
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
                        <span style={{ color: gain > 0 ? "#5bb85b" : gain < 0 ? "#d55b5b" : t.textMuted, fontWeight: 700 }}>{gain > 0 ? "▲" : gain < 0 ? "▼" : "—"} {Math.abs(gain)} lbs</span>
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
              <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                {!isEditing && <button onClick={startEdit} style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 12, color: t.textSub, padding: "10px 16px", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontWeight: 600, minHeight: 44 }}><Icon name="edit2" size={14} /> Edit</button>}
                <HelpBtn page="profile" onOpen={() => setHelpPage("profile")} />
              </div>
            </div>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ width: 80, height: 80, borderRadius: "50%", background: `linear-gradient(135deg, ${t.surfaceHigh}, ${t.surface})`, border: `2px solid ${p.goal ? (GOALS.find(g => g.id === p.goal)?.color || t.border) : t.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto", boxShadow: "0 0 24px rgba(0,0,0,0.2)" }}>
                {p.firstName ? p.firstName[0].toUpperCase() : <Icon name="user" size={32} />}
              </div>
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 8 }}>Signed in as <span style={{ fontWeight: 700, color: t.textSub }}>@{authedUser}</span></div>
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                  <div><label style={lbl}>Country</label><input value={draft.country || ""} onChange={e => setDraft("country", e.target.value)} placeholder="e.g. Canada" style={pField} /></div>
                  <div><label style={lbl}>City</label><input value={draft.city || ""} onChange={e => setDraft("city", e.target.value)} placeholder="e.g. Toronto" style={pField} /></div>
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
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setEditingProfile(false)} style={{ flex: 1, background: "transparent", border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 14, padding: "15px 0", fontSize: 15, cursor: "pointer", fontWeight: 600, minHeight: 52 }}>Cancel</button>
                  <button onClick={() => { saveProfile(draft); setEditingProfile(false); }} style={{ flex: 2, background: `linear-gradient(135deg, ${accent}, #4A8BC4)`, color: "#ffffff", border: "none", borderRadius: 14, padding: "15px 0", fontSize: 17, cursor: "pointer", fontFamily: "'Bebas Neue', cursive", letterSpacing: 1.2, minHeight: 52 }}>Save Profile</button>
                </div>

              </div>
            ) : (
              <div>
                <div style={S.card()}>
                  <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 15, letterSpacing: 1, color: t.textMuted, marginBottom: 14 }}>PERSONAL INFO</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    {[{ label: "First Name", val: dv(p.firstName) }, { label: "Last Name", val: dv(p.lastName) }, { label: "Age", val: dv(p.age, " yrs") }, { label: "Weight", val: dv(p.weight, " lbs") }, { label: "Height", val: (p.heightFt || p.heightIn) ? `${p.heightFt || 0}' ${p.heightIn || 0}"` : <span style={{ color: t.textMuted }}>—</span> }, { label: "Country", val: dv(p.country) }, { label: "City", val: dv(p.city) }].map(f => (
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
                <div style={S.card()}>
                  <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 15, letterSpacing: 1, color: t.textMuted, marginBottom: 14 }}>LIFETIME STATS</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    {[
                      { label: "Total Workouts",   val: data.workouts.length },
                      { label: "Exercises Logged", val: [...new Set(data.workouts.flatMap(w => w.exercises.map(e => e.name)))].length },
                      { label: "Total Sets",       val: data.workouts.reduce((a, w) => a + w.exercises.reduce((b, e) => b + e.sets.length, 0), 0) },
                      { label: "This Week",        val: data.workouts.filter(w => (new Date() - new Date(w.date)) / 86400000 <= 7).length },
                    ].map(s => <div key={s.label}><div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>{s.label}</div><div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 26, color: accent, lineHeight: 1 }}>{s.val}</div></div>)}
                  </div>
                </div>
                {/* Version + Manual PDF Download */}
                <div style={{ ...S.card(), textAlign: "center" }}>
                  <a
                    href="/repset-user-manual.pdf"
                    download={`repset-user-manual-v${APP_VERSION}-build-${BUILD_DATE}.pdf`}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      background: `linear-gradient(135deg, ${accent}, #4A8BC4)`, color: "#ffffff", border: "none",
                      borderRadius: 10, padding: "11px 20px",
                      fontFamily: "'Bebas Neue', cursive", letterSpacing: 1,
                      fontSize: 16, fontWeight: 700, cursor: "pointer",
                      textDecoration: "none", margin: "0 auto 16px",
                    }}
                  >
                    <Icon name="download" size={16} /> Download User Manual PDF
                  </a>
                  <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.9 }}>
                    <div>Version <span style={{ color: accent, fontWeight: 700 }}>{APP_VERSION}</span></div>
                    <div>Build Date: {BUILD_DATE}</div>
                    <div style={{ marginTop: 4, opacity: 0.4 }}>Rep Set © 2026</div>
                  </div>
                </div>
              </div>
            )}
          </div>

        );
      })()}

      {/* ── ADMIN PANEL ──────────────────── */}
      {view === "admin" && isAdminUser(authedUser) && <AdminPanel currentUser={authedUser} />}

      {/* ── HELP MODAL ───────────────────── */}
      {helpPage && <HelpModal page={helpPage} onClose={() => setHelpPage(null)} />}
      {showPlateCalc && <PlateCalculator onClose={() => setShowPlateCalc(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} toggleTheme={toggleTheme} />}

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
            background: "rgba(213,91,91,0.1)",
            border: "1px solid rgba(213,91,91,0.35)",
            color: "#d55b5b",
            borderRadius: 12,
            padding: "13px 48px",
            fontSize: 14, fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 2px 16px rgba(0,0,0,0.25)",
            letterSpacing: 0.3,
          }}>Sign Out</button>
        </div>
      )}

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


