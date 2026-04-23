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
    minWidth: 44, minHeight: 44, touchAction: "manipulation",
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
const APP_VERSION = "2.4.6";
const BUILD_DATE  = "2026-04-22";

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


const GYM_BIBLE = [
  // CHEST
  { name: "Barbell Bench Press", cat: "chest", equip: "barbell", level: "intermediate", muscles: "Pectorals, Triceps, Front Delts" },
  { name: "Incline Barbell Bench Press", cat: "chest", equip: "barbell", level: "intermediate", muscles: "Upper Pecs, Triceps, Front Delts" },
  { name: "Decline Barbell Bench Press", cat: "chest", equip: "barbell", level: "intermediate", muscles: "Lower Pecs, Triceps" },
  { name: "Close-Grip Bench Press", cat: "chest", equip: "barbell", level: "intermediate", muscles: "Triceps, Inner Pecs" },
  { name: "Dumbbell Bench Press", cat: "chest", equip: "dumbbell", level: "beginner", muscles: "Pectorals, Triceps, Front Delts" },
  { name: "Incline Dumbbell Press", cat: "chest", equip: "dumbbell", level: "beginner", muscles: "Upper Pecs, Triceps" },
  { name: "Decline Dumbbell Press", cat: "chest", equip: "dumbbell", level: "beginner", muscles: "Lower Pecs, Triceps" },
  { name: "Dumbbell Flye", cat: "chest", equip: "dumbbell", level: "beginner", muscles: "Pectorals (stretch emphasis)" },
  { name: "Incline Dumbbell Flye", cat: "chest", equip: "dumbbell", level: "beginner", muscles: "Upper Pecs" },
  { name: "Dumbbell Pullover", cat: "chest", equip: "dumbbell", level: "intermediate", muscles: "Pecs, Lats, Serratus" },
  { name: "Cable Crossover", cat: "chest", equip: "cable", level: "beginner", muscles: "Pectorals (contraction emphasis)" },
  { name: "High-to-Low Cable Flye", cat: "chest", equip: "cable", level: "beginner", muscles: "Lower Pecs" },
  { name: "Low-to-High Cable Flye", cat: "chest", equip: "cable", level: "beginner", muscles: "Upper Pecs" },
  { name: "Single-Arm Cable Press", cat: "chest", equip: "cable", level: "intermediate", muscles: "Pecs, Core Stability" },
  { name: "Chest Press Machine", cat: "chest", equip: "machine", level: "beginner", muscles: "Pectorals, Triceps" },
  { name: "Incline Chest Press Machine", cat: "chest", equip: "machine", level: "beginner", muscles: "Upper Pecs, Triceps" },
  { name: "Pec Deck / Butterfly Machine", cat: "chest", equip: "machine", level: "beginner", muscles: "Pectorals" },
  { name: "Smith Machine Bench Press", cat: "chest", equip: "machine", level: "beginner", muscles: "Pectorals, Triceps" },
  { name: "Smith Machine Incline Press", cat: "chest", equip: "machine", level: "beginner", muscles: "Upper Pecs, Triceps" },
  { name: "Push-Up", cat: "chest", equip: "bodyweight", level: "beginner", muscles: "Pecs, Triceps, Core" },
  { name: "Wide-Grip Push-Up", cat: "chest", equip: "bodyweight", level: "beginner", muscles: "Outer Pecs" },
  { name: "Diamond Push-Up", cat: "chest", equip: "bodyweight", level: "intermediate", muscles: "Triceps, Inner Pecs" },
  { name: "Decline Push-Up", cat: "chest", equip: "bodyweight", level: "intermediate", muscles: "Upper Pecs" },
  { name: "Incline Push-Up", cat: "chest", equip: "bodyweight", level: "beginner", muscles: "Lower Pecs" },
  { name: "Plyometric (Clap) Push-Up", cat: "chest", equip: "bodyweight", level: "advanced", muscles: "Explosive Pecs, Triceps" },
  { name: "Chest Dips", cat: "chest", equip: "bodyweight", level: "intermediate", muscles: "Lower Pecs, Triceps" },
  { name: "Ring Push-Up", cat: "chest", equip: "other", level: "advanced", muscles: "Pecs, Stability Muscles" },
  // BACK
  { name: "Conventional Deadlift", cat: "back", equip: "barbell", level: "advanced", muscles: "Erectors, Glutes, Hamstrings, Traps" },
  { name: "Sumo Deadlift", cat: "back", equip: "barbell", level: "advanced", muscles: "Glutes, Inner Thighs, Lower Back" },
  { name: "Romanian Deadlift", cat: "back", equip: "barbell", level: "intermediate", muscles: "Hamstrings, Glutes, Lower Back" },
  { name: "Barbell Row (Bent-Over)", cat: "back", equip: "barbell", level: "intermediate", muscles: "Lats, Rhomboids, Traps, Biceps" },
  { name: "Pendlay Row", cat: "back", equip: "barbell", level: "advanced", muscles: "Mid-Back, Lats, Traps" },
  { name: "T-Bar Row", cat: "back", equip: "barbell", level: "intermediate", muscles: "Lats, Rhomboids, Traps" },
  { name: "Good Morning", cat: "back", equip: "barbell", level: "intermediate", muscles: "Hamstrings, Erectors, Glutes" },
  { name: "Barbell Shrug", cat: "back", equip: "barbell", level: "beginner", muscles: "Upper Traps" },
  { name: "Dumbbell Row (One-Arm)", cat: "back", equip: "dumbbell", level: "beginner", muscles: "Lats, Rhomboids, Rear Delts" },
  { name: "Dumbbell Romanian Deadlift", cat: "back", equip: "dumbbell", level: "beginner", muscles: "Hamstrings, Glutes, Lower Back" },
  { name: "Renegade Row", cat: "back", equip: "dumbbell", level: "intermediate", muscles: "Lats, Core, Triceps" },
  { name: "Dumbbell Shrug", cat: "back", equip: "dumbbell", level: "beginner", muscles: "Upper Traps" },
  { name: "Dumbbell Pullover", cat: "back", equip: "dumbbell", level: "intermediate", muscles: "Lats, Chest, Serratus" },
  { name: "Lat Pulldown (Wide Grip)", cat: "back", equip: "machine", level: "beginner", muscles: "Lats, Biceps, Rhomboids" },
  { name: "Lat Pulldown (Close Grip)", cat: "back", equip: "machine", level: "beginner", muscles: "Lats (thickness), Biceps" },
  { name: "Lat Pulldown (Underhand)", cat: "back", equip: "machine", level: "beginner", muscles: "Lats, Biceps" },
  { name: "Seated Cable Row (Close Grip)", cat: "back", equip: "cable", level: "beginner", muscles: "Mid-Back, Lats, Biceps" },
  { name: "Seated Cable Row (Wide Grip)", cat: "back", equip: "cable", level: "beginner", muscles: "Upper Back, Rear Delts" },
  { name: "Single-Arm Cable Row", cat: "back", equip: "cable", level: "beginner", muscles: "Unilateral Lats, Rhomboids" },
  { name: "Straight-Arm Cable Pulldown", cat: "back", equip: "cable", level: "intermediate", muscles: "Lats, Teres Major" },
  { name: "Cable Pull-Through", cat: "back", equip: "cable", level: "beginner", muscles: "Hamstrings, Glutes, Lower Back" },
  { name: "Seated Row Machine", cat: "back", equip: "machine", level: "beginner", muscles: "Mid-Back, Rhomboids" },
  { name: "Chest-Supported Row Machine", cat: "back", equip: "machine", level: "beginner", muscles: "Rhomboids, Mid-Traps" },
  { name: "Back Extension Machine", cat: "back", equip: "machine", level: "beginner", muscles: "Erectors, Glutes" },
  { name: "Pull-Up (Overhand)", cat: "back", equip: "bodyweight", level: "advanced", muscles: "Lats, Biceps, Rear Delts" },
  { name: "Chin-Up (Underhand)", cat: "back", equip: "bodyweight", level: "intermediate", muscles: "Lats, Biceps" },
  { name: "Neutral-Grip Pull-Up", cat: "back", equip: "bodyweight", level: "intermediate", muscles: "Lats, Brachialis" },
  { name: "Assisted Pull-Up Machine", cat: "back", equip: "machine", level: "beginner", muscles: "Lats, Biceps" },
  { name: "Inverted Row", cat: "back", equip: "bodyweight", level: "beginner", muscles: "Mid-Back, Rhomboids, Biceps" },
  { name: "Back Extension (Roman Chair)", cat: "back", equip: "bodyweight", level: "beginner", muscles: "Erectors, Glutes" },
  // SHOULDERS
  { name: "Barbell Overhead Press (Standing)", cat: "shoulders", equip: "barbell", level: "intermediate", muscles: "All Deltoids, Traps, Triceps, Core" },
  { name: "Barbell Overhead Press (Seated)", cat: "shoulders", equip: "barbell", level: "beginner", muscles: "All Deltoids, Traps, Triceps" },
  { name: "Push Press", cat: "shoulders", equip: "barbell", level: "advanced", muscles: "Deltoids, Legs, Triceps" },
  { name: "Barbell Upright Row", cat: "shoulders", equip: "barbell", level: "intermediate", muscles: "Lateral Delts, Traps" },
  { name: "Dumbbell Overhead Press", cat: "shoulders", equip: "dumbbell", level: "beginner", muscles: "All Deltoids, Traps" },
  { name: "Arnold Press", cat: "shoulders", equip: "dumbbell", level: "intermediate", muscles: "All Deltoids (full rotation)" },
  { name: "Lateral Raise", cat: "shoulders", equip: "dumbbell", level: "beginner", muscles: "Lateral Deltoid" },
  { name: "Front Raise", cat: "shoulders", equip: "dumbbell", level: "beginner", muscles: "Anterior Deltoid" },
  { name: "Bent-Over Rear Delt Raise", cat: "shoulders", equip: "dumbbell", level: "beginner", muscles: "Rear Deltoid, Rhomboids" },
  { name: "Dumbbell Upright Row", cat: "shoulders", equip: "dumbbell", level: "beginner", muscles: "Lateral Delts, Traps" },
  { name: "Cable Lateral Raise", cat: "shoulders", equip: "cable", level: "beginner", muscles: "Lateral Deltoid (constant tension)" },
  { name: "Face Pull", cat: "shoulders", equip: "cable", level: "beginner", muscles: "Rear Delts, Rotator Cuff, Traps" },
  { name: "Cable Front Raise", cat: "shoulders", equip: "cable", level: "beginner", muscles: "Anterior Deltoid" },
  { name: "Cable Upright Row", cat: "shoulders", equip: "cable", level: "intermediate", muscles: "Lateral Delts, Traps" },
  { name: "Shoulder Press Machine", cat: "shoulders", equip: "machine", level: "beginner", muscles: "Deltoids, Triceps" },
  { name: "Lateral Raise Machine", cat: "shoulders", equip: "machine", level: "beginner", muscles: "Lateral Deltoid" },
  { name: "Rear Delt Flye Machine", cat: "shoulders", equip: "machine", level: "beginner", muscles: "Rear Deltoid" },
  { name: "Smith Machine OHP", cat: "shoulders", equip: "machine", level: "beginner", muscles: "Deltoids, Triceps" },
  { name: "Pike Push-Up", cat: "shoulders", equip: "bodyweight", level: "intermediate", muscles: "Anterior Delts, Triceps" },
  { name: "Handstand Push-Up", cat: "shoulders", equip: "bodyweight", level: "advanced", muscles: "All Deltoids, Triceps, Traps" },
  { name: "Resistance Band Lateral Raise", cat: "shoulders", equip: "other", level: "beginner", muscles: "Lateral Deltoid" },
  // ARMS
  { name: "Barbell Curl", cat: "arms", equip: "barbell", level: "beginner", muscles: "Biceps, Brachialis" },
  { name: "EZ-Bar Curl", cat: "arms", equip: "barbell", level: "beginner", muscles: "Biceps, Brachialis (wrist-friendly)" },
  { name: "Preacher Curl (EZ-Bar)", cat: "arms", equip: "barbell", level: "beginner", muscles: "Biceps Lower Head" },
  { name: "Skull Crusher (EZ-Bar)", cat: "arms", equip: "barbell", level: "intermediate", muscles: "Triceps Long Head" },
  { name: "Barbell Reverse Curl", cat: "arms", equip: "barbell", level: "beginner", muscles: "Brachioradialis, Biceps" },
  { name: "Barbell Wrist Curl", cat: "arms", equip: "barbell", level: "beginner", muscles: "Forearm Flexors" },
  { name: "Dumbbell Curl (Alternating)", cat: "arms", equip: "dumbbell", level: "beginner", muscles: "Biceps, Brachialis" },
  { name: "Hammer Curl", cat: "arms", equip: "dumbbell", level: "beginner", muscles: "Brachialis, Brachioradialis" },
  { name: "Incline Dumbbell Curl", cat: "arms", equip: "dumbbell", level: "beginner", muscles: "Biceps Long Head" },
  { name: "Concentration Curl", cat: "arms", equip: "dumbbell", level: "beginner", muscles: "Biceps Peak" },
  { name: "Zottman Curl", cat: "arms", equip: "dumbbell", level: "intermediate", muscles: "Full Bicep + Brachioradialis" },
  { name: "Dumbbell Overhead Tricep Extension", cat: "arms", equip: "dumbbell", level: "beginner", muscles: "Triceps Long Head" },
  { name: "Dumbbell Kickback", cat: "arms", equip: "dumbbell", level: "beginner", muscles: "Triceps Lateral Head" },
  { name: "Dumbbell Skull Crusher", cat: "arms", equip: "dumbbell", level: "intermediate", muscles: "Triceps" },
  { name: "Reverse Wrist Curl (Dumbbell)", cat: "arms", equip: "dumbbell", level: "beginner", muscles: "Forearm Extensors" },
  { name: "Cable Curl (Bar)", cat: "arms", equip: "cable", level: "beginner", muscles: "Biceps (constant tension)" },
  { name: "Cable Curl (Rope)", cat: "arms", equip: "cable", level: "beginner", muscles: "Biceps, Brachialis" },
  { name: "Overhead Cable Curl", cat: "arms", equip: "cable", level: "intermediate", muscles: "Biceps Long Head (peak)" },
  { name: "Cable Pushdown (Rope)", cat: "arms", equip: "cable", level: "beginner", muscles: "Triceps Lateral Head" },
  { name: "Cable Pushdown (Straight Bar)", cat: "arms", equip: "cable", level: "beginner", muscles: "Triceps" },
  { name: "Overhead Cable Tricep Extension", cat: "arms", equip: "cable", level: "beginner", muscles: "Triceps Long Head" },
  { name: "Single-Arm Cable Pushdown", cat: "arms", equip: "cable", level: "beginner", muscles: "Triceps (unilateral)" },
  { name: "Bicep Curl Machine", cat: "arms", equip: "machine", level: "beginner", muscles: "Biceps" },
  { name: "Preacher Curl Machine", cat: "arms", equip: "machine", level: "beginner", muscles: "Biceps Lower Head" },
  { name: "Tricep Pushdown Machine", cat: "arms", equip: "machine", level: "beginner", muscles: "Triceps" },
  { name: "Tricep Dips (Bench)", cat: "arms", equip: "bodyweight", level: "beginner", muscles: "Triceps, Chest" },
  { name: "Parallel Bar Dips (Tricep Focus)", cat: "arms", equip: "bodyweight", level: "intermediate", muscles: "Triceps" },
  // LEGS
  { name: "Barbell Back Squat", cat: "legs", equip: "barbell", level: "intermediate", muscles: "Quads, Glutes, Hamstrings, Core" },
  { name: "Barbell Front Squat", cat: "legs", equip: "barbell", level: "advanced", muscles: "Quads, Glutes, Core (upright torso)" },
  { name: "Barbell Lunge", cat: "legs", equip: "barbell", level: "intermediate", muscles: "Quads, Glutes, Hamstrings" },
  { name: "Barbell Hip Thrust", cat: "legs", equip: "barbell", level: "intermediate", muscles: "Glutes (max contraction)" },
  { name: "Barbell Step-Up", cat: "legs", equip: "barbell", level: "intermediate", muscles: "Quads, Glutes" },
  { name: "Barbell Romanian Deadlift", cat: "legs", equip: "barbell", level: "intermediate", muscles: "Hamstrings, Glutes, Lower Back" },
  { name: "Barbell Sumo Squat", cat: "legs", equip: "barbell", level: "intermediate", muscles: "Inner Thighs, Glutes, Quads" },
  { name: "Barbell Calf Raise (Standing)", cat: "legs", equip: "barbell", level: "beginner", muscles: "Gastrocnemius, Soleus" },
  { name: "Barbell Bulgarian Split Squat", cat: "legs", equip: "barbell", level: "advanced", muscles: "Quads, Glutes, Hip Flexors" },
  { name: "Goblet Squat", cat: "legs", equip: "dumbbell", level: "beginner", muscles: "Quads, Glutes, Core" },
  { name: "Dumbbell Lunge (Alternating)", cat: "legs", equip: "dumbbell", level: "beginner", muscles: "Quads, Glutes" },
  { name: "Dumbbell Step-Up", cat: "legs", equip: "dumbbell", level: "beginner", muscles: "Quads, Glutes" },
  { name: "Dumbbell Hip Thrust", cat: "legs", equip: "dumbbell", level: "beginner", muscles: "Glutes" },
  { name: "Dumbbell Romanian Deadlift", cat: "legs", equip: "dumbbell", level: "beginner", muscles: "Hamstrings, Glutes" },
  { name: "Dumbbell Bulgarian Split Squat", cat: "legs", equip: "dumbbell", level: "intermediate", muscles: "Quads, Glutes, Balance" },
  { name: "Dumbbell Sumo Squat", cat: "legs", equip: "dumbbell", level: "beginner", muscles: "Inner Thighs, Glutes" },
  { name: "Dumbbell Calf Raise (Standing)", cat: "legs", equip: "dumbbell", level: "beginner", muscles: "Calves" },
  { name: "Leg Press", cat: "legs", equip: "machine", level: "beginner", muscles: "Quads, Glutes, Hamstrings" },
  { name: "Hack Squat Machine", cat: "legs", equip: "machine", level: "intermediate", muscles: "Quads, Glutes" },
  { name: "Leg Extension", cat: "legs", equip: "machine", level: "beginner", muscles: "Quadriceps (isolation)" },
  { name: "Lying Leg Curl", cat: "legs", equip: "machine", level: "beginner", muscles: "Hamstrings" },
  { name: "Seated Leg Curl", cat: "legs", equip: "machine", level: "beginner", muscles: "Hamstrings" },
  { name: "Seated Calf Raise Machine", cat: "legs", equip: "machine", level: "beginner", muscles: "Soleus" },
  { name: "Standing Calf Raise Machine", cat: "legs", equip: "machine", level: "beginner", muscles: "Gastrocnemius" },
  { name: "Hip Abductor Machine", cat: "legs", equip: "machine", level: "beginner", muscles: "Gluteus Medius, TFL" },
  { name: "Hip Adductor Machine", cat: "legs", equip: "machine", level: "beginner", muscles: "Inner Thighs (Adductors)" },
  { name: "Glute Kickback Machine", cat: "legs", equip: "machine", level: "beginner", muscles: "Glutes" },
  { name: "Smith Machine Squat", cat: "legs", equip: "machine", level: "beginner", muscles: "Quads, Glutes" },
  { name: "Cable Hip Kickback", cat: "legs", equip: "cable", level: "beginner", muscles: "Glutes" },
  { name: "Cable Hip Abduction", cat: "legs", equip: "cable", level: "beginner", muscles: "Gluteus Medius" },
  { name: "Cable Romanian Deadlift", cat: "legs", equip: "cable", level: "intermediate", muscles: "Hamstrings, Glutes" },
  { name: "Bodyweight Squat", cat: "legs", equip: "bodyweight", level: "beginner", muscles: "Quads, Glutes, Hamstrings" },
  { name: "Pistol Squat", cat: "legs", equip: "bodyweight", level: "advanced", muscles: "Quads, Glutes, Balance" },
  { name: "Jump Squat", cat: "legs", equip: "bodyweight", level: "intermediate", muscles: "Explosive Legs, Calves" },
  { name: "Glute Bridge", cat: "legs", equip: "bodyweight", level: "beginner", muscles: "Glutes, Hamstrings" },
  { name: "Single-Leg Glute Bridge", cat: "legs", equip: "bodyweight", level: "intermediate", muscles: "Glutes, Hamstrings (unilateral)" },
  { name: "Walking Lunge", cat: "legs", equip: "bodyweight", level: "beginner", muscles: "Quads, Glutes" },
  { name: "Reverse Lunge", cat: "legs", equip: "bodyweight", level: "beginner", muscles: "Quads, Glutes" },
  { name: "Lateral Lunge", cat: "legs", equip: "bodyweight", level: "beginner", muscles: "Inner Thighs, Glutes" },
  { name: "Donkey Kick", cat: "legs", equip: "bodyweight", level: "beginner", muscles: "Glutes" },
  { name: "Fire Hydrant", cat: "legs", equip: "bodyweight", level: "beginner", muscles: "Gluteus Medius" },
  { name: "Bodyweight Calf Raise (Standing)", cat: "legs", equip: "bodyweight", level: "beginner", muscles: "Gastrocnemius" },
  { name: "Wall Sit", cat: "legs", equip: "bodyweight", level: "beginner", muscles: "Quadriceps (isometric)" },
  // CORE
  { name: "Plank", cat: "core", equip: "bodyweight", level: "beginner", muscles: "Transverse Abs, All Core" },
  { name: "Side Plank", cat: "core", equip: "bodyweight", level: "beginner", muscles: "Obliques, Hip Abductors" },
  { name: "Crunch", cat: "core", equip: "bodyweight", level: "beginner", muscles: "Rectus Abdominis" },
  { name: "Bicycle Crunch", cat: "core", equip: "bodyweight", level: "beginner", muscles: "Obliques, Abs" },
  { name: "Reverse Crunch", cat: "core", equip: "bodyweight", level: "beginner", muscles: "Lower Abs" },
  { name: "Lying Leg Raise", cat: "core", equip: "bodyweight", level: "intermediate", muscles: "Lower Abs, Hip Flexors" },
  { name: "Hanging Leg Raise", cat: "core", equip: "bodyweight", level: "advanced", muscles: "Lower Abs, Obliques" },
  { name: "Hanging Knee Raise", cat: "core", equip: "bodyweight", level: "intermediate", muscles: "Lower Abs" },
  { name: "Dragon Flag", cat: "core", equip: "bodyweight", level: "advanced", muscles: "Full Core, Hip Flexors" },
  { name: "V-Up", cat: "core", equip: "bodyweight", level: "intermediate", muscles: "Full Abs" },
  { name: "Flutter Kick", cat: "core", equip: "bodyweight", level: "beginner", muscles: "Lower Abs" },
  { name: "Mountain Climber", cat: "core", equip: "bodyweight", level: "beginner", muscles: "Core, Hip Flexors, Cardio" },
  { name: "Russian Twist (Bodyweight)", cat: "core", equip: "bodyweight", level: "beginner", muscles: "Obliques" },
  { name: "Windshield Wiper", cat: "core", equip: "bodyweight", level: "advanced", muscles: "Obliques, Lower Abs" },
  { name: "Dead Bug", cat: "core", equip: "bodyweight", level: "beginner", muscles: "Deep Core, Stability" },
  { name: "Bird Dog", cat: "core", equip: "bodyweight", level: "beginner", muscles: "Core, Glutes, Balance" },
  { name: "Hollow Body Hold", cat: "core", equip: "bodyweight", level: "intermediate", muscles: "Full Core" },
  { name: "Ab Wheel Rollout", cat: "core", equip: "other", level: "advanced", muscles: "Full Core, Lats, Shoulders" },
  { name: "Cable Crunch", cat: "core", equip: "cable", level: "beginner", muscles: "Rectus Abdominis" },
  { name: "Pallof Press", cat: "core", equip: "cable", level: "intermediate", muscles: "Anti-Rotation Core" },
  { name: "Cable Woodchop", cat: "core", equip: "cable", level: "intermediate", muscles: "Obliques, Core" },
  { name: "Cable Side Bend", cat: "core", equip: "cable", level: "beginner", muscles: "Obliques" },
  { name: "Ab Machine Crunch", cat: "core", equip: "machine", level: "beginner", muscles: "Rectus Abdominis" },
  { name: "Roman Chair Sit-Up", cat: "core", equip: "machine", level: "beginner", muscles: "Abs, Hip Flexors" },
  { name: "Dumbbell Side Bend", cat: "core", equip: "dumbbell", level: "beginner", muscles: "Obliques" },
  { name: "Dumbbell Russian Twist", cat: "core", equip: "dumbbell", level: "beginner", muscles: "Obliques" },
  { name: "Barbell Rollout", cat: "core", equip: "barbell", level: "advanced", muscles: "Full Core, Lats" },
  { name: "Landmine Rotation", cat: "core", equip: "barbell", level: "intermediate", muscles: "Obliques, Core" },
  // CARDIO
  { name: "Treadmill Running", cat: "cardio", equip: "machine", level: "beginner", muscles: "Full Body Cardiovascular" },
  { name: "Incline Treadmill Walk", cat: "cardio", equip: "machine", level: "beginner", muscles: "Calves, Glutes, Cardio" },
  { name: "Elliptical Trainer", cat: "cardio", equip: "machine", level: "beginner", muscles: "Low-Impact Full Body Cardio" },
  { name: "Stationary Bike", cat: "cardio", equip: "machine", level: "beginner", muscles: "Quads, Calves, Cardio" },
  { name: "Rowing Machine (Erg)", cat: "cardio", equip: "machine", level: "intermediate", muscles: "Back, Legs, Arms — Full Body" },
  { name: "Stair Climber", cat: "cardio", equip: "machine", level: "beginner", muscles: "Glutes, Quads, Calves" },
  { name: "Ski Erg", cat: "cardio", equip: "machine", level: "intermediate", muscles: "Lats, Core, Arms, Cardio" },
  { name: "Assault Bike", cat: "cardio", equip: "machine", level: "advanced", muscles: "Full Body, Max Cardio Output" },
  { name: "Battle Ropes", cat: "cardio", equip: "other", level: "intermediate", muscles: "Shoulders, Arms, Core, Cardio" },
  { name: "Jump Rope", cat: "cardio", equip: "other", level: "beginner", muscles: "Calves, Coordination, Cardio" },
  { name: "Box Jump", cat: "cardio", equip: "other", level: "intermediate", muscles: "Legs, Glutes, Explosive Power" },
  { name: "Burpee", cat: "cardio", equip: "bodyweight", level: "intermediate", muscles: "Full Body, Explosive" },
  { name: "High Knees", cat: "cardio", equip: "bodyweight", level: "beginner", muscles: "Core, Hip Flexors, Cardio" },
  { name: "Jumping Jacks", cat: "cardio", equip: "bodyweight", level: "beginner", muscles: "Full Body Warmup / Cardio" },
  { name: "Sprint Intervals", cat: "cardio", equip: "bodyweight", level: "advanced", muscles: "Legs, Full Body Cardio" },
  { name: "Bear Crawl", cat: "cardio", equip: "bodyweight", level: "intermediate", muscles: "Full Body, Core Stability" },
  { name: "Sled Push", cat: "cardio", equip: "other", level: "intermediate", muscles: "Legs, Glutes, Cardio" },
  { name: "Sled Pull", cat: "cardio", equip: "other", level: "intermediate", muscles: "Back, Arms, Cardio" },
  { name: "Farmer's Carry", cat: "cardio", equip: "dumbbell", level: "intermediate", muscles: "Grip, Core, Traps, Cardio" },
  { name: "Kettlebell Swing", cat: "cardio", equip: "other", level: "intermediate", muscles: "Glutes, Hamstrings, Core" },
  // FULL BODY
  { name: "Barbell Clean", cat: "full", equip: "barbell", level: "advanced", muscles: "Full Posterior Chain, Traps" },
  { name: "Power Clean", cat: "full", equip: "barbell", level: "advanced", muscles: "Full Body Explosive" },
  { name: "Hang Clean", cat: "full", equip: "barbell", level: "advanced", muscles: "Hamstrings, Traps, Core" },
  { name: "Barbell Snatch", cat: "full", equip: "barbell", level: "advanced", muscles: "Full Body Olympic Lift" },
  { name: "Hang Snatch", cat: "full", equip: "barbell", level: "advanced", muscles: "Full Body, Explosiveness" },
  { name: "Barbell Thruster", cat: "full", equip: "barbell", level: "advanced", muscles: "Legs, Shoulders, Core" },
  { name: "Dumbbell Thruster", cat: "full", equip: "dumbbell", level: "intermediate", muscles: "Legs, Shoulders, Core" },
  { name: "Clean and Press", cat: "full", equip: "barbell", level: "advanced", muscles: "Full Body" },
  { name: "Turkish Get-Up (Dumbbell)", cat: "full", equip: "dumbbell", level: "advanced", muscles: "Full Body, Stability" },
  { name: "Kettlebell Turkish Get-Up", cat: "full", equip: "other", level: "advanced", muscles: "Full Body, Stability" },
  { name: "Kettlebell Clean and Press", cat: "full", equip: "other", level: "intermediate", muscles: "Full Body" },
  { name: "Man Maker", cat: "full", equip: "dumbbell", level: "advanced", muscles: "Full Body, Metabolic Conditioning" },
  { name: "Burpee Pull-Up", cat: "full", equip: "bodyweight", level: "advanced", muscles: "Full Body" },
  { name: "Muscle-Up", cat: "full", equip: "bodyweight", level: "advanced", muscles: "Back, Chest, Triceps" },
  { name: "Bear Complex", cat: "full", equip: "barbell", level: "advanced", muscles: "Full Body Olympic Compound" },
  { name: "Wall Ball", cat: "full", equip: "other", level: "intermediate", muscles: "Legs, Shoulders, Core" },
  { name: "Sandbag Carry", cat: "full", equip: "other", level: "intermediate", muscles: "Full Body, Grip, Core" },
  { name: "Tire Flip", cat: "full", equip: "other", level: "advanced", muscles: "Full Posterior Chain, Legs" },
  { name: "Dumbbell Complex", cat: "full", equip: "dumbbell", level: "intermediate", muscles: "Full Body Circuit" },
];

// Exercise picker filter constants
const EX_CATS = [
  { id: "all",       label: "All" },
  { id: "chest",     label: "Chest",     color: "#ff6b6b" },
  { id: "back",      label: "Back",      color: "#4ecdc4" },
  { id: "shoulders", label: "Shoulders", color: "#ffe66d" },
  { id: "arms",      label: "Arms",      color: "#a8e6cf" },
  { id: "legs",      label: "Legs",      color: "#c3a6ff" },
  { id: "core",      label: "Core",      color: "#ff8b94" },
  { id: "cardio",    label: "Cardio",    color: "#ffd93d" },
  { id: "full",      label: "Full Body", color: "#6bcb77" },
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
const CAT_COLORS = { chest:"#ff6b6b", back:"#4ecdc4", shoulders:"#ffe66d", arms:"#a8e6cf", legs:"#c3a6ff", core:"#ff8b94", cardio:"#ffd93d", full:"#6bcb77", custom:"#888" };
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
          <div style={{ textAlign: "center", paddingTop: 8, paddingBottom: 4 }}>
            <div style={{ fontSize: 11, color: t.textMuted }}>
              Barbell Labs v{APP_VERSION} · Built {BUILD_DATE}
            </div>
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
      const vol = w.exercises.reduce((sum, ex) =>
        sum + ex.sets.reduce((s2, s) =>
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
function BodyweightWidget({ bodyweight, onAdd }) {
  const t = useT(); const S = useS();
  const [input, setInput] = useState("");
  const latest = bodyweight.length ? bodyweight[bodyweight.length - 1] : null;
  const today  = todayISO();
  const alreadyToday = latest?.date === today;
  const chartPoints = bodyweight.map(e => ({ date: e.date, value: e.weight }));

  const submit = () => {
    const w = parseFloat(input);
    if (!w || w < 50 || w > 700) return;
    onAdd(w);
    setInput("");
  };

  return (
    <div style={S.card()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 18, letterSpacing: 1, color: t.textSub }}>
            BODY<span style={{ color: accent }}>WEIGHT</span>
          </div>
          {latest
            ? <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>Last: {latest.weight} lbs · {formatDate(latest.date)}</div>
            : <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>Not logged yet — add your first entry below</div>
          }
        </div>
        {alreadyToday && <div style={{ fontSize: 12, color: "#5bb85b", fontWeight: 700 }}>✓ Logged today</div>}
      </div>
      {!alreadyToday && (
        <div style={{ display: "flex", gap: 8, marginBottom: chartPoints.length ? 16 : 0 }}>
          <input
            type="number" inputMode="decimal" placeholder="Enter weight (lbs)"
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()}
            style={{ ...S.inputStyle({ flex: 1, width: "auto" }) }}
          />
          <button onClick={submit} style={{ ...S.solidBtn(), padding: "12px 18px", fontSize: 13, borderRadius: 12, minHeight: 44, touchAction: "manipulation" }}>Save</button>
        </div>
      )}
      {chartPoints.length > 0 && (
        <DualLineChart points={chartPoints} lineColor="#5bb85b" />
      )}
      {chartPoints.length === 0 && (
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

function Big3PRs({ workouts, profile, onSave }) {
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
            return (
              <div key={name} style={{ background: c.bgColor, border: `1px solid ${pr ? c.borderColor : t.border}`, borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, position: "relative", overflow: "hidden" }}>
                {pr && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: c.color, borderRadius: "14px 0 0 14px" }} />}
                <div style={{ width: 46, height: 46, borderRadius: 12, background: `${c.color}18`, border: `1px solid ${c.color}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "'Bebas Neue', cursive", fontSize: 15, letterSpacing: 1, color: c.color }}>{c.label}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
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
      )}
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
            borderRadius: 8, padding: "10px 12px", fontSize: 12, fontWeight: 700,
            color: hasRpe ? toneColor : t.textMuted, cursor: "pointer",
            whiteSpace: "nowrap", flexShrink: 0, minHeight: 44, touchAction: "manipulation",
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
                    padding: "11px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", touchAction: "manipulation", minHeight: 44,
                  }}
                >Apply {coach.target.weight} × {coach.target.reps}</button>
                <button onClick={() => setCoachDismissed(true)}
                  style={{ background: "transparent", border: `1px solid ${t.border}`, borderRadius: 8, padding: "11px 14px", fontSize: 13, color: t.textMuted, cursor: "pointer", touchAction: "manipulation", minHeight: 44 }}>
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
function WorkoutHistoryCard({ workout, index, onLabelChange, onDelete, onSaveTemplate }) {
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
                      <button key={l.id} onClick={(e) => toggleLabel(e, l.id)} style={{ background: isActive ? l.bg : "transparent", border: `1px solid ${isActive ? l.border : t.border}`, color: isActive ? l.color : t.textMuted, borderRadius: 10, padding: "11px 16px", fontSize: 14, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s", opacity: (!isActive && activeLabels.length >= 3) ? 0.4 : 1, minHeight: 44, touchAction: "manipulation" }}>
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
              {onSaveTemplate && (
                <button onClick={() => onSaveTemplate(workout)} style={{ width: "100%", background: "transparent", border: `1px dashed ${t.border}`, borderRadius: 10, color: t.textMuted, padding: "9px 0", fontSize: 12, fontWeight: 600, cursor: "pointer", marginTop: 4, touchAction: "manipulation" }}>
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

function SettingsModal({ authedUser, onClose, toggleTheme, onEditProfile }) {
  const t = useT();
  const theme = useContext(ThemeCtx);
  const accent = "#5B9BD5";
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 900, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }}
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
            <button onClick={onEditProfile} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 12, padding: "13px 16px", cursor: "pointer", color: t.text, boxSizing: "border-box" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 14 }}>
                <Icon name="edit2" size={16} />
                Edit Profile
              </span>
              <Icon name="chevronRight" size={14} color={t.textMuted} />
            </button>
          </div>
        )}
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
        {/* Email verification */}
        <VerifyEmailRow />
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
            {error && <div style={{ background: "rgba(213,91,91,0.12)", border: "1px solid rgba(213,91,91,0.3)", color: "#d55b5b", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginBottom: 16, marginTop: 8 }}>{error}</div>}
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
const PLATES = [45, 35, 25, 10, 5, 2.5]; // legacy — use PLATES_LBS / PLATES_KG
const PLATE_COLORS_LBS = { 45: "#d55b5b", 35: "#5B9BD5", 25: "#A8C8E8", 10: "#5bb85b", 5: "#b55bd5", 2.5: "#d5a55b" };
const PLATE_COLORS_KG  = { 25: "#d55b5b", 20: "#5B9BD5", 15: "#A8C8E8", 10: "#5bb85b", 5: "#b55bd5", 2.5: "#d5a55b", 1.25: "#ff9500" };
const PLATES_LBS = [45, 35, 25, 10, 5, 2.5];
const PLATES_KG  = [25, 20, 15, 10, 5, 2.5, 1.25];
const BAR_OPTIONS = {
  lbs: [{ label: "45 lb (Olympic)", val: 45 }, { label: "35 lb (Women's)", val: 35 }],
  kg:  [{ label: "20 kg (Olympic)", val: 20 }, { label: "15 kg (Women's)", val: 15 }],
};

function calcPlates(target, barWeight, unit) {
  const plates = unit === "kg" ? PLATES_KG : PLATES_LBS;
  let remaining = Math.round(((target - barWeight) / 2) * 1000) / 1000;
  if (remaining < 0) return null;
  const result = [];
  for (const plate of plates) {
    const count = Math.floor(remaining / plate);
    if (count > 0) { result.push({ weight: plate, count }); remaining = Math.round((remaining - plate * count) * 1000) / 1000; }
  }
  return { plates: result, remainder: Math.round(remaining * 1000) / 1000 };
}

// ── Templates ─────────────────────────────────────────────────────────
function SaveTemplateSheet({ exercises, onSave, onClose }) {
  const t = useT(); const S = useS();
  const [name, setName] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={onClose}>
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

function TemplateManager({ templates, onLoad, onDelete, onRename, onClose }) {
  const t = useT(); const S = useS();
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={onClose}>
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
          <div key={tmpl.id} style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 10 }}>
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
          </div>
        ))}
        <button onClick={onClose} style={{ ...S.solidBtn({ marginTop: 8, width: "100%", padding: 14, fontSize: 16 }) }}>Done</button>
      </div>
    </div>
  );
}

function OneRMCalculator({ onClose }) {
  const t = useT(); const S = useS();
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const w = parseFloat(weight) || 0;
  const r = parseInt(reps) || 0;
  const valid = w > 0 && r >= 1 && r <= 15;
  const epley   = valid ? Math.round(w * (1 + r / 30)) : null;
  const brzycki = valid && r < 37 ? Math.round(w * (36 / (37 - r))) : null;
  const best1RM = epley && brzycki ? Math.round((epley + brzycki) / 2) : (epley || brzycki || null);
  const PCTS = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ background: t.surface, borderRadius: "20px 20px 0 0", padding: "20px 20px 32px", maxWidth: 420, width: "100%", margin: "0 auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)", maxHeight: "88vh", overflowY: "auto", WebkitOverflowScrolling: "touch" }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: t.border, borderRadius: 4, margin: "0 auto 18px" }} />
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, letterSpacing: 1, marginBottom: 18 }}>
          1RM <span style={{ color: accent }}>Estimator</span>
        </div>

        {/* Inputs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Weight (lbs)</div>
            <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="e.g. 185" inputMode="decimal" autoFocus
              style={{ ...S.inputStyle({ width: "100%", fontSize: 20, padding: "11px 14px", borderRadius: 12 }) }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Reps (1–15)</div>
            <input type="number" value={reps} onChange={e => setReps(e.target.value)} placeholder="e.g. 5" inputMode="numeric" min="1" max="15"
              style={{ ...S.inputStyle({ width: "100%", fontSize: 20, padding: "11px 14px", borderRadius: 12 }) }} />
          </div>
        </div>

        {!valid && weight !== "" && reps !== "" && (
          <div style={{ fontSize: 12, color: "#d55b5b", marginBottom: 14 }}>Enter a weight and reps between 1 and 15 for an accurate estimate.</div>
        )}

        {best1RM && (
          <>
            {/* Big 1RM display */}
            <div style={{ background: `${accent}12`, border: `1px solid ${accent}33`, borderRadius: 16, padding: "18px 20px", marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 4 }}>Estimated 1RM</div>
                <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 44, color: accent, lineHeight: 1 }}>{best1RM} <span style={{ fontSize: 16, color: t.textMuted }}>lbs</span></div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>Average of Epley ({epley}) & Brzycki ({brzycki})</div>
              </div>
              <div style={{ fontSize: 48, lineHeight: 1 }}>🏆</div>
            </div>

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

function PlateCalculator({ onClose }) {
  const t = useT(); const S = useS();
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("lbs");
  const [barWeight, setBarWeight] = useState(45);
  const COLORS = unit === "kg" ? PLATE_COLORS_KG : PLATE_COLORS_LBS;
  const result = target ? calcPlates(parseFloat(target) || 0, barWeight, unit) : null;
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
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={onClose}>
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
    <div style={{ background: "var(--bl-surface)", borderRadius: 18, padding: "20px 8px 16px", textAlign: "center", border: "1px solid var(--bl-border)", borderTop: `3px solid ${color}`, boxShadow: "0 4px 24px rgba(0,0,0,0.20)" }}>
      <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 32, color, lineHeight: 1 }}>{displayed}</div>
      <div style={{ fontSize: 10, color: "var(--bl-muted)", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
    </div>
  );
}

// ── Verify-Email Gate (blocks app until email is verified) ────────────
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
function ToolsMenu({ onClose, on1RM, onPlates }) {
  const t = useT();
  const items = [
    { icon: "zap",      label: "1RM Calculator",   sub: "Estimate your 1-rep max from any weight × reps",      onClick: on1RM },
    { icon: "dumbbell", label: "Plate Calculator", sub: "Pick a target weight, see the plates you need", onClick: onPlates },
  ];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 900, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }} onClick={onClose}>
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
            <button key={item.label} onClick={() => { item.onClick(); onClose(); }} style={{ display: "flex", gap: 14, alignItems: "center", textAlign: "left", background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 12, padding: "13px 16px", cursor: "pointer", color: t.text, width: "100%", boxSizing: "border-box" }}>
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
function NotificationsModal({ notifications, onClose, onMarkAllRead, onClearAll, onToggleRead }) {
  const t = useT();
  const list = notifications || [];
  const anyUnread = list.some(n => !n.read);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 900, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }} onClick={onClose}>
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
              <button key={n.id} onClick={() => onToggleRead(n.id)} style={{ display: "flex", gap: 12, alignItems: "flex-start", textAlign: "left", background: n.read ? t.surface : `${accent}10`, border: `1px solid ${n.read ? t.border : accent + "40"}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer", color: t.text, width: "100%", boxSizing: "border-box" }}>
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
  const [viewKey, setViewKey] = useState(0);
  const [viewDir, setViewDir] = useState(1);
  const prevViewRef = useRef("home");
  const [workout, setWorkout] = useState(null);
  const [exSearch, setExSearch] = useState("");
  const [exCatFilter, setExCatFilter] = useState("all");
  const [exEquipFilter, setExEquipFilter] = useState("all");
  const [showExPicker, setShowExPicker] = useState(false);
  const [completedWorkout, setCompletedWorkout] = useState(null);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("barbelllabs-theme") || "dark"; } catch { return "dark"; } });
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState({});
  const [helpPage, setHelpPage] = useState(null);
  const [showPlateCalc, setShowPlateCalc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [show1RM, setShow1RM] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showTools, setShowTools] = useState(false);

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
  const toggleTheme = () => { const n = theme === "dark" ? "light" : "dark"; setTheme(n); try { localStorage.setItem("barbelllabs-theme", n); } catch {} };

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
      @keyframes bl-slide-r { from { opacity:0; transform:translateX(22px); } to { opacity:1; transform:translateX(0); } }
      @keyframes bl-slide-l { from { opacity:0; transform:translateX(-22px); } to { opacity:1; transform:translateX(0); } }
      @keyframes bl-card-in { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
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
  const filtered = allPickerExercises.filter(ex => {
    if (exCatFilter !== "all" && ex.cat !== exCatFilter) return false;
    if (exEquipFilter !== "all" && ex.equip !== exEquipFilter) return false;
    if (exSearch && !ex.name.toLowerCase().includes(exSearch.toLowerCase())) return false;
    return true;
  });

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
    setShowExPicker(false); setExSearch(""); setExCatFilter("all"); setExEquipFilter("all");
  };
  const finishWorkout = () => {
    const cleaned = { ...workout, duration: Math.round((Date.now() - workout.startTime) / 60000), exercises: workout.exercises.map(e => ({ ...e, sets: e.sets.filter(s => s.weight !== "" || s.reps !== "") })).filter(e => e.sets.length > 0) };
    const prev = data.workouts;
    const notifUpdate = computeWorkoutNotifications(data, cleaned, prev);
    save({ ...data, workouts: [cleaned, ...data.workouts], ...(notifUpdate || {}) });
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
    a.download = `barbellabs-${authedUser}-${todayISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const templates = data.templates || [];
  const saveTemplate = (name) => {
    if (!workout) return;
    const tmpl = { id: Date.now().toString(), name, exercises: workout.exercises.map(ex => ({ name: ex.name, sets: ex.sets.map(s => ({ weight: s.weight, reps: s.reps })) })) };
    save({ ...data, templates: [...templates, tmpl] });
    setShowSaveTemplate(false);
  };
  const deleteTemplate = (id) => save({ ...data, templates: templates.filter(t => t.id !== id) });
  const renameTemplate = (id, name) => save({ ...data, templates: templates.map(t => t.id === id ? { ...t, name } : t) });
  const loadTemplate = (tmpl) => {
    setWorkout(prev => ({ ...(prev || { date: todayISO(), startTime: Date.now(), exercises: [] }), exercises: tmpl.exercises.map(ex => ({ name: ex.name, sets: ex.sets.map(s => ({ weight: s.weight, reps: s.reps })) })) }));
    setView("log");
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
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      style={{ "--bl-surface": t.surfaceHigh, "--bl-border": t.border, "--bl-muted": t.textMuted, background: t.bg, minHeight: "100dvh", color: t.text, fontFamily: "'DM Sans', sans-serif", maxWidth: 420, margin: "0 auto", position: "relative", paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))", transition: "background 0.3s, color 0.3s" }}>
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
              {streak > 0 && <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,149,0,0.12)", border: "1px solid rgba(255,149,0,0.3)", borderRadius: 20, padding: "4px 12px", fontSize: 12, color: "#ff9500", fontWeight: 700, marginTop: 8 }}>🔥 {streak} day streak</div>}
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

          <RestTimer />

          {/* Quick-start section — only shown when workout is empty */}
          {workout && workout.exercises.length === 0 && (
            <div style={{ marginBottom: 18 }}>
              {/* Repeat last session */}
              {data.workouts.length > 0 && (
                <button onClick={() => {
                  const last = data.workouts[0];
                  setWorkout(w => ({ ...w, exercises: last.exercises.map(ex => ({ name: ex.name, sets: ex.sets.map(s => ({ weight: s.weight, reps: s.reps })) })) }));
                }} style={{ width: "100%", background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 14, color: t.textSub, padding: "13px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10, touchAction: "manipulation", letterSpacing: 0.3 }}>
                  <Icon name="history" size={14} /> Repeat Last Session
                </button>
              )}
              {/* Templates */}
              {templates.length > 0 && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 }}>Templates</div>
                    <button onClick={() => setShowTemplateManager(true)} style={{ background: "transparent", border: "none", color: accent, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "2px 0" }}>Manage</button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {templates.map(tmpl => (
                      <button key={tmpl.id} onClick={() => loadTemplate(tmpl)} style={{ background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 14, padding: "12px 16px", textAlign: "left", cursor: "pointer", width: "100%", touchAction: "manipulation" }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: t.text, marginBottom: 3 }}>{tmpl.name}</div>
                        <div style={{ fontSize: 12, color: t.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tmpl.exercises.map(e => e.name).join(" · ")}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {templates.length === 0 && data.workouts.length === 0 && null}
            </div>
          )}

          {/* Save as Template — shown when workout has exercises */}
          {workout && workout.exercises.length > 0 && (
            <button onClick={() => setShowSaveTemplate(true)} style={{ width: "100%", background: "transparent", border: `1px dashed ${t.border}`, borderRadius: 12, color: t.textMuted, padding: "10px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 14, touchAction: "manipulation" }}>
              ＋ Save as Template
            </button>
          )}

          {workout && workout.exercises.map((ex, i) => (
            <ExerciseBlock key={i} exercise={ex} workouts={data.workouts}
              onChange={updated => { const exercises = [...workout.exercises]; exercises[i] = updated; setWorkout({ ...workout, exercises }); }}
              onRemove={() => setWorkout({ ...workout, exercises: workout.exercises.filter((_, j) => j !== i) })}
            />
          ))}

          {showExPicker ? (
            <div style={S.card()}>
              {/* Search row */}
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input value={exSearch} onChange={e => setExSearch(e.target.value)} placeholder="Search exercises…" autoFocus style={{ ...S.inputStyle(), flex: 1, width: "auto" }} />
                <button onClick={() => { setShowExPicker(false); setExSearch(""); setExCatFilter("all"); setExEquipFilter("all"); }} style={S.iconBtn()}><Icon name="x" size={16} /></button>
              </div>
              {/* Category filter chips */}
              <div style={{ position: "relative", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", WebkitOverflowScrolling: "touch", touchAction: "pan-x", paddingBottom: 4, paddingRight: 28, scrollbarWidth: "none", msOverflowStyle: "none" }}>
                  {EX_CATS.map(c => {
                    const active = exCatFilter === c.id;
                    const darkText = active && c.color && ["#ffe66d","#a8e6cf","#c3a6ff","#ffd93d"].includes(c.color);
                    return (
                      <button key={c.id} onClick={() => setExCatFilter(c.id)} style={{ flexShrink: 0, padding: "10px 16px", borderRadius: 22, border: `1.5px solid ${active ? (c.color || accent) : t.border}`, background: active ? (c.color || accent) : t.surface, color: active ? (darkText ? "#111" : "#fff") : t.textSub, fontSize: 14, fontWeight: 600, cursor: "pointer", touchAction: "pan-y", whiteSpace: "nowrap", minHeight: 44, transition: "all 0.15s", userSelect: "none" }}>{c.label}</button>
                    );
                  })}
                </div>
                <div style={{ position: "absolute", right: 0, top: 0, bottom: 4, width: 32, background: `linear-gradient(to right, transparent, ${t.cardBg || t.surface})`, pointerEvents: "none" }} />
              </div>
              {/* Equipment filter chips */}
              <div style={{ position: "relative", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", WebkitOverflowScrolling: "touch", touchAction: "pan-x", paddingBottom: 4, paddingRight: 28, scrollbarWidth: "none", msOverflowStyle: "none" }}>
                  {EX_EQUIPS.map(eq => {
                    const active = exEquipFilter === eq.id;
                    return (
                      <button key={eq.id} onClick={() => setExEquipFilter(eq.id)} style={{ flexShrink: 0, padding: "9px 15px", borderRadius: 22, border: `1.5px solid ${active ? accent : t.border}`, background: active ? `${accent}20` : t.surface, color: active ? accent : t.textMuted, fontSize: 13, fontWeight: 600, cursor: "pointer", touchAction: "pan-y", whiteSpace: "nowrap", minHeight: 44, transition: "all 0.15s", userSelect: "none" }}>{eq.label}</button>
                    );
                  })}
                </div>
                <div style={{ position: "absolute", right: 0, top: 0, bottom: 4, width: 32, background: `linear-gradient(to right, transparent, ${t.cardBg || t.surface})`, pointerEvents: "none" }} />
              </div>
              {/* Results list */}
              <div style={{ maxHeight: 240, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
                {filtered.map(ex => (
                  <button key={ex.name} onClick={() => { if (!workout) setWorkout({ date: todayISO(), startTime: Date.now(), exercises: [] }); addExercise(ex.name); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "transparent", border: "none", color: t.text, textAlign: "left", padding: "10px 8px", cursor: "pointer", fontSize: 14, borderBottom: `1px solid ${t.border}`, minHeight: 44, touchAction: "manipulation" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: CAT_COLORS[ex.cat] || "#888", flexShrink: 0 }} />
                    <span style={{ flex: 1, lineHeight: 1.3 }}>{ex.name}</span>
                    {ex.cat !== "custom" && <span style={{ fontSize: 10, color: t.textMuted, background: t.cardBg || t.surface2 || "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 4, flexShrink: 0, textTransform: "capitalize" }}>{ex.equip}</span>}
                  </button>
                ))}
                {filtered.length === 0 && !exSearch && <div style={{ padding: "20px 8px", color: t.textMuted, fontSize: 13, textAlign: "center" }}>No exercises match these filters.</div>}
                {exSearch && !filtered.find(ex => ex.name.toLowerCase() === exSearch.toLowerCase()) && (
                  <button onClick={() => { if (!workout) setWorkout({ date: todayISO(), startTime: Date.now(), exercises: [] }); addExercise(exSearch); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "transparent", border: "none", color: accent, textAlign: "left", padding: "12px 8px", cursor: "pointer", fontSize: 14, fontWeight: 600, minHeight: 44, touchAction: "manipulation" }}>
                    <Icon name="plus" size={14} /> Add "{exSearch}"
                  </button>
                )}
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
          {data.workouts.map((w, i) => (
            <div key={i} id={`hcard-${i}`} style={{ scrollMarginTop: 16, animation: "bl-card-in 0.3s ease both", animationDelay: `${Math.min(i, 8) * 50}ms` }}>
              <WorkoutHistoryCard workout={w} index={i}
                onLabelChange={(idx, arr) => { const wks = [...data.workouts]; wks[idx] = { ...wks[idx], labels: arr, label: arr[0] || null }; save({ ...data, workouts: wks }); }}
                onDelete={(idx) => save({ ...data, workouts: data.workouts.filter((_, j) => j !== idx) })}
                onSaveTemplate={(src) => {
                  const name = src.exercises.map(e => e.name).join(", ").slice(0, 30);
                  const tmpl = { id: Date.now().toString(), name, exercises: src.exercises.map(ex => ({ name: ex.name, sets: ex.sets.map(s => ({ weight: s.weight, reps: s.reps })) })) };
                  save({ ...data, templates: [...templates, tmpl] });
                }}
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
          <Big3PRs workouts={data.workouts} profile={profile} onSave={(big3) => saveProfile({ big3 })} />
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
                    <div key={f.text} style={{ display: "flex", alignItems: "center", gap: 12, background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 12, padding: "12px 16px" }}>
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
              <TopActions>
                {!isEditing && <IconBtn icon="gear" onClick={() => setShowSettings(true)} label="Settings" />}
                <HelpBtn page="profile" onOpen={() => setHelpPage("profile")} />
              </TopActions>
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
                {/* Bodyweight */}
                <BodyweightWidget
                  bodyweight={data.bodyweight || []}
                  onAdd={w => {
                    const entry = { date: todayISO(), weight: w };
                    const existing = (data.bodyweight || []).filter(e => e.date !== todayISO());
                    save({ ...data, bodyweight: [...existing, entry] });
                  }}
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
      {helpPage && <HelpModal page={helpPage} onClose={() => setHelpPage(null)} />}
      {showPlateCalc && <PlateCalculator onClose={() => setShowPlateCalc(false)} />}
      {show1RM && <OneRMCalculator onClose={() => setShow1RM(false)} />}
      {showSaveTemplate && workout && <SaveTemplateSheet exercises={workout.exercises} onSave={saveTemplate} onClose={() => setShowSaveTemplate(false)} />}
      {showTemplateManager && <TemplateManager templates={templates} onLoad={loadTemplate} onDelete={deleteTemplate} onRename={renameTemplate} onClose={() => setShowTemplateManager(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} toggleTheme={toggleTheme} onEditProfile={() => { setShowSettings(false); setProfileDraft({ ...(data.profile || {}) }); setEditingProfile(true); setView("profile"); }} />}
      {showNotifs && <NotificationsModal notifications={notifications} onClose={() => setShowNotifs(false)} onMarkAllRead={markAllNotifsRead} onClearAll={clearAllNotifs} onToggleRead={toggleNotifRead} />}
      {showTools && <ToolsMenu onClose={() => setShowTools(false)} on1RM={() => setShow1RM(true)} onPlates={() => setShowPlateCalc(true)} />}

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


