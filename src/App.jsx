import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Plus, Upload, Activity, Pill, Wind, Repeat, FlaskConical, Utensils, Droplet, Smile,
  Flame, Award, Zap, Trash2, AlertCircle, Sparkles, MapPin, RefreshCw, Settings2, X,
} from "lucide-react";

const FONT_LINK = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap";

// ---------- palette ----------
const INK = "#1F2A24", PAPER = "#EEF0E9", CARD = "#FBFAF6", LINE = "#D8DBCF", MUTE = "#6B7268";

const TYPES = {
  symptom: { label: "Symptom", icon: Activity, color: "#B8615B" },
  food: { label: "Food", icon: Utensils, color: "#9C6B4E" },
  trigger: { label: "Trigger tag", icon: Sparkles, color: "#C9763E" },
  medication: { label: "Medication", icon: Pill, color: "#5B7A63" },
  breathwork: { label: "Breathwork", icon: Wind, color: "#7A8FA6" },
  habit: { label: "Habit", icon: Repeat, color: "#C98A3B" },
  reproductive: { label: "Cycle event", icon: Droplet, color: "#8A5A7A" },
  mood: { label: "Mood & stress", icon: Smile, color: "#4A8A82" },
  metric: { label: "Auto metric", icon: FlaskConical, color: "#8A7CA8" },
};
const LOG_TYPES = ["symptom", "food", "medication", "breathwork", "habit", "reproductive", "mood"];
const CORE_LOG_TYPES = new Set(LOG_TYPES); // used for streak/heatmap/momentum (excludes trigger & metric)

const SYMPTOM_PRESETS = ["Headache", "Bloating", "Fatigue", "Nausea", "Brain fog", "Joint pain"];
const ILLNESS_TAGS = ["Fever", "Sore throat", "Congestion", "Chills"];
const FOOD_TAGS = ["Dairy", "Gluten", "Alcohol", "Caffeine", "High-FODMAP", "Histamine", "Sugar", "Fried/greasy"];
const HABIT_PRESETS = ["Caffeine", "Alcohol", "Water", "Screen time", "Exercise", "Nap", "Cold exposure"];
const BREATH_PRESETS = ["Box breathing", "Meditation", "Deep breathing", "Yoga nidra", "Walk outside"];
const REPRO_TYPES = ["Spotting", "Cramps"];
const FLOW_LEVELS = [{ label: "Light", v: 1 }, { label: "Medium", v: 2 }, { label: "Heavy", v: 3 }];

const QUICK_MOOD = [{ label: "Good", emoji: "😊", v: 8 }, { label: "Okay", emoji: "😐", v: 5 }, { label: "Rough", emoji: "😣", v: 2 }];
const ENCOURAGEMENTS = [
  "That's data future-you will thank you for.",
  "Nice catch — the pattern-finder just got another data point.",
  "Logged. That's the whole job, honestly.",
  "Small entry, real signal.",
  "That one might matter more than it seems right now.",
];

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function nowTime() { return new Date().toISOString().slice(11, 16); }
function dateShift(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------- storage ----------
async function loadKey(key, fallback) {
  try {
    const res = await window.storage.get(key, false);
    return res ? JSON.parse(res.value) : fallback;
  } catch { return fallback; }
}
async function saveKey(key, val) {
  try { await window.storage.set(key, JSON.stringify(val), false); } catch (e) { console.error(e); }
}

// ---------- stats ----------
function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; num += dx * dy; dx2 += dx * dx; dy2 += dy * dy; }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? null : num / denom;
}
function buildDailySeries(entries, type, name) {
  const map = {};
  entries.filter((e) => e.type === type && e.name === name).forEach((e) => {
    const v = parseFloat(e.value);
    if (isNaN(v)) return;
    (map[e.date] = map[e.date] || []).push(v);
  });
  const daily = {};
  Object.keys(map).forEach((d) => { daily[d] = map[d].reduce((a, b) => a + b, 0) / map[d].length; });
  return daily;
}
function correlateAll(entries, targetType, targetName) {
  const targetDaily = buildDailySeries(entries, targetType, targetName);
  const targetDates = Object.keys(targetDaily);
  if (targetDates.length < 3) return [];
  const combos = new Map();
  entries.forEach((e) => {
    if (e.type === targetType && e.name === targetName) return;
    const key = e.type + "::" + e.name;
    if (!combos.has(key)) combos.set(key, { type: e.type, name: e.name });
  });
  const results = [];
  combos.forEach(({ type, name }) => {
    const daily = buildDailySeries(entries, type, name);
    [0, 1, 2].forEach((lag) => {
      const xs = [], ys = [];
      targetDates.forEach((d) => {
        const sd = dateShift(d, -lag);
        if (daily[sd] !== undefined) { xs.push(daily[sd]); ys.push(targetDaily[d]); }
      });
      if (xs.length >= 3) {
        const r = pearson(xs, ys);
        if (r !== null && !isNaN(r)) results.push({ type, name, lag, r, n: xs.length });
      }
    });
  });
  const byCombo = new Map();
  results.forEach((res) => {
    const key = res.type + "::" + res.name;
    const ex = byCombo.get(key);
    if (!ex || Math.abs(res.r) > Math.abs(ex.r)) byCombo.set(key, res);
  });
  return Array.from(byCombo.values()).sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

// ---------- import parsing ----------
function parseImport(text) {
  const trimmed = text.trim();
  const out = [];
  if (!trimmed) return out;
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      (Array.isArray(parsed) ? parsed : [parsed]).forEach((row) => {
        if (row.date && row.metric !== undefined && row.value !== undefined) {
          out.push({ id: uid(), type: "metric", name: String(row.metric), value: row.value, date: String(row.date).slice(0, 10), time: row.time || "", notes: row.source ? `source: ${row.source}` : "" });
        }
      });
      return out;
    } catch {}
  }
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return out;
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const dateIdx = header.indexOf("date"), metricIdx = header.indexOf("metric"), valueIdx = header.indexOf("value"), sourceIdx = header.indexOf("source");
  if (dateIdx === -1 || metricIdx === -1 || valueIdx === -1) return out;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (cols.length < 3) continue;
    out.push({ id: uid(), type: "metric", name: cols[metricIdx], value: cols[valueIdx], date: cols[dateIdx].slice(0, 10), time: "", notes: sourceIdx !== -1 ? `source: ${cols[sourceIdx]}` : "" });
  }
  return out;
}

// ---------- engagement math ----------
function computeDayCounts(entries) {
  const map = {};
  entries.filter((e) => CORE_LOG_TYPES.has(e.type)).forEach((e) => { map[e.date] = (map[e.date] || 0) + 1; });
  return map;
}
function computeStreak(dayCounts) {
  let streak = 0, d = todayStr();
  if (!dayCounts[d]) { d = dateShift(d, -1); if (!dayCounts[d]) return 0; }
  while (dayCounts[d]) { streak++; d = dateShift(d, -1); }
  return streak;
}
function computeMomentum(entries) {
  const today = todayStr();
  const todays = entries.filter((e) => e.date === today);
  const has = (types) => todays.some((e) => types.includes(e.type));
  const slots = [
    { key: "body", label: "Body check-in", done: has(["symptom", "food", "reproductive"]) },
    { key: "meds", label: "Meds & supplements", done: has(["medication"]) },
    { key: "care", label: "Self-care", done: has(["habit", "breathwork"]) },
    { key: "mood", label: "Mood check-in", done: has(["mood"]) },
  ];
  const filled = slots.filter((s) => s.done).length;
  return { slots, pct: Math.round((filled / slots.length) * 100), filled };
}
function computeBadges(entries, streak) {
  const badges = [];
  [3, 7, 14, 30, 60, 100].forEach((n) => { if (streak >= n) badges.push(`streak${n}`); });
  const total = entries.filter((e) => CORE_LOG_TYPES.has(e.type)).length;
  [10, 50, 100, 250].forEach((n) => { if (total >= n) badges.push(`total${n}`); });
  LOG_TYPES.forEach((t) => { if (entries.some((e) => e.type === t)) badges.push(`first_${t}`); });
  const days = computeDayCounts(entries);
  const anyFull = Object.keys(days).some((d) => computeMomentum(entries.filter((e) => e.date === d).concat(entries.filter((e)=>e.date!==d))).pct === 100);
  return badges;
}
const BADGE_META = {
  streak3: { label: "3-day streak", icon: "🔥" }, streak7: { label: "1-week streak", icon: "🔥" },
  streak14: { label: "2-week streak", icon: "🔥" }, streak30: { label: "30-day streak", icon: "🏆" },
  streak60: { label: "60-day streak", icon: "🏆" }, streak100: { label: "100-day streak", icon: "👑" },
  total10: { label: "10 entries logged", icon: "✨" }, total50: { label: "50 entries logged", icon: "✨" },
  total100: { label: "100 entries logged", icon: "⭐" }, total250: { label: "250 entries logged", icon: "🌟" },
  first_symptom: { label: "First symptom logged", icon: "📍" }, first_food: { label: "First food logged", icon: "🍽️" },
  first_medication: { label: "First med logged", icon: "💊" }, first_breathwork: { label: "First breathwork logged", icon: "🌬️" },
  first_habit: { label: "First habit logged", icon: "🔁" }, first_reproductive: { label: "First cycle event logged", icon: "🩸" },
  first_mood: { label: "First mood check-in", icon: "🙂" },
};

// ---------- small UI atoms ----------
const inputStyle = { border: `1px solid ${LINE}`, borderRadius: 3, padding: "9px 11px", fontSize: 13, fontFamily: "Inter, sans-serif", background: "#fff", color: INK, outline: "none", width: "100%" };
const chipStyle = (active, color) => ({
  padding: "7px 12px", borderRadius: 20, border: `1px solid ${active ? color : LINE}`, background: active ? `${color}1E` : "#fff",
  color: active ? color : MUTE, fontSize: 12.5, fontFamily: "Inter, sans-serif", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
});

function Confetti({ show }) {
  if (!show) return null;
  const dots = Array.from({ length: 16 });
  const colors = ["#B8615B", "#5B7A63", "#C98A3B", "#7A8FA6", "#8A5A7A", "#4A8A82"];
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 200, overflow: "hidden" }}>
      {dots.map((_, i) => {
        const left = 10 + Math.random() * 80;
        const delay = Math.random() * 0.15;
        const color = colors[i % colors.length];
        return (
          <span key={i} style={{
            position: "absolute", top: "-5%", left: `${left}%`, width: 7, height: 7, borderRadius: i % 2 ? "50%" : 2,
            background: color, animation: `confetti-fall 1.1s ease-in ${delay}s forwards`,
          }} />
        );
      })}
      <style>{`@keyframes confetti-fall { to { transform: translateY(80vh) rotate(200deg); opacity: 0; } }`}</style>
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{
      position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 210,
      background: INK, color: PAPER, padding: "11px 18px", borderRadius: 6, fontSize: 13, fontFamily: "Inter, sans-serif",
      display: "flex", alignItems: "center", gap: 8, boxShadow: "0 6px 20px rgba(0,0,0,0.18)", maxWidth: "88vw",
      animation: "toast-in 0.25s ease-out",
    }}>
      <span style={{ fontSize: 16 }}>{toast.icon || "✓"}</span>
      <div>
        {toast.title && <div style={{ fontWeight: 600, fontFamily: "Fraunces, serif", fontSize: 14 }}>{toast.title}</div>}
        <div style={{ opacity: 0.85 }}>{toast.message}</div>
      </div>
      <style>{`@keyframes toast-in { from { opacity:0; transform: translate(-50%, 8px);} to {opacity:1; transform: translate(-50%,0);} }`}</style>
    </div>
  );
}

function MomentumMeter({ momentum }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 4, background: CARD, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "Fraunces, serif", fontSize: 15, color: INK }}>
          <Zap size={15} color="#C98A3B" /> Today's momentum
        </div>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: MUTE }}>{momentum.pct}%</span>
      </div>
      <div style={{ height: 10, background: "#E4E6DB", borderRadius: 20, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ height: "100%", width: `${momentum.pct}%`, background: "linear-gradient(90deg,#C98A3B,#B8615B)", borderRadius: 20, transition: "width 0.5s ease" }} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {momentum.slots.map((s) => (
          <span key={s.key} style={{
            fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", padding: "4px 9px", borderRadius: 20,
            background: s.done ? "#5B7A6320" : "#00000008", color: s.done ? "#3F5C48" : "#9AA093",
            textDecoration: s.done ? "none" : "none", border: `1px solid ${s.done ? "#5B7A6355" : LINE}`,
          }}>{s.done ? "✓ " : "· "}{s.label}</span>
        ))}
      </div>
    </div>
  );
}

function Heatmap({ dayCounts }) {
  const days = [];
  for (let i = 69; i >= 0; i--) days.push(dateShift(todayStr(), -i));
  const max = Math.max(1, ...Object.values(dayCounts));
  const tone = (c) => {
    if (!c) return "#E4E6DB";
    const t = c / max;
    if (t > 0.75) return "#5B7A63";
    if (t > 0.5) return "#7C9D82";
    if (t > 0.25) return "#A9C2AC";
    return "#D3E0D5";
  };
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 4, background: CARD, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "Fraunces, serif", fontSize: 15, color: INK, marginBottom: 10 }}>
        Last 10 weeks
      </div>
      <div style={{ display: "grid", gridTemplateRows: "repeat(7, 11px)", gridAutoFlow: "column", gap: 3 }}>
        {days.map((d) => (
          <div key={d} title={`${d}: ${dayCounts[d] || 0} entries`} style={{ width: 11, height: 11, borderRadius: 2, background: tone(dayCounts[d]) }} />
        ))}
      </div>
    </div>
  );
}

function StreakBadge({ streak }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, border: `1px solid ${LINE}`, borderRadius: 4, background: CARD,
      padding: "12px 16px",
    }}>
      <Flame size={20} color={streak > 0 ? "#C98A3B" : "#9AA093"} fill={streak > 0 ? "#C98A3B" : "none"} />
      <div>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 20, color: INK, lineHeight: 1 }}>{streak}</div>
        <div style={{ fontSize: 11, color: MUTE, fontFamily: "'IBM Plex Mono', monospace" }}>day streak</div>
      </div>
    </div>
  );
}

// ---------- Quick log chips (Today tab) ----------
function QuickLog({ onQuickAdd, medList }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 4, background: CARD, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontFamily: "Fraunces, serif", fontSize: 15, color: INK }}>Quick log</div>

      {medList.length > 0 && (
        <div>
          <div style={sectionLabel}>Meds & supplements</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {medList.map((m) => (
              <button key={m.id} style={chipStyle(false, TYPES.medication.color)}
                onClick={() => onQuickAdd({ type: "medication", name: m.name + (m.isSupplement ? " (supplement)" : ""), value: m.dose || "1" })}>
                {m.name}{m.dose ? ` · ${m.dose}` : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div style={sectionLabel}>Symptom (mid severity — refine in Log tab if needed)</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SYMPTOM_PRESETS.map((s) => (
            <button key={s} style={chipStyle(false, TYPES.symptom.color)} onClick={() => onQuickAdd({ type: "symptom", name: s, value: "5" })}>{s}</button>
          ))}
        </div>
      </div>

      <div>
        <div style={sectionLabel}>Mood</div>
        <div style={{ display: "flex", gap: 6 }}>
          {QUICK_MOOD.map((m) => (
            <button key={m.label} style={chipStyle(false, TYPES.mood.color)} onClick={() => onQuickAdd({ type: "mood", name: "Mood", value: String(m.v) })}>{m.emoji} {m.label}</button>
          ))}
        </div>
      </div>

      <div>
        <div style={sectionLabel}>Habit</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {HABIT_PRESETS.map((h) => (
            <button key={h} style={chipStyle(false, TYPES.habit.color)} onClick={() => onQuickAdd({ type: "habit", name: h, value: "1" })}>{h}</button>
          ))}
        </div>
      </div>

      <div>
        <div style={sectionLabel}>Cycle event</div>
        <div style={{ display: "flex", gap: 6 }}>
          {REPRO_TYPES.map((r) => (
            <button key={r} style={chipStyle(false, TYPES.reproductive.color)} onClick={() => onQuickAdd({ type: "reproductive", name: r, value: "5" })}>{r}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
const sectionLabel = { fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: MUTE, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 };

// ---------- Weather sync ----------
function WeatherSync({ onImport }) {
  const [status, setStatus] = useState("idle");
  const [msg, setMsg] = useState("");
  const [manual, setManual] = useState({ lat: "", lon: "" });
  const [needsManual, setNeedsManual] = useState(false);

  const fetchWeather = (lat, lon) => {
    setStatus("loading");
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,surface_pressure&timezone=auto`)
      .then((r) => r.json())
      .then((data) => {
        const c = data.current;
        if (!c) throw new Error("no current data");
        const today = todayStr();
        onImport([
          { id: uid(), type: "metric", name: "temp_c", value: c.temperature_2m, date: today, time: "", notes: "source: open-meteo" },
          { id: uid(), type: "metric", name: "humidity_pct", value: c.relative_humidity_2m, date: today, time: "", notes: "source: open-meteo" },
          { id: uid(), type: "metric", name: "pressure_hpa", value: c.surface_pressure, date: today, time: "", notes: "source: open-meteo" },
        ]);
        setStatus("done");
        setMsg(`Synced: ${c.temperature_2m}°C, ${c.relative_humidity_2m}% humidity, ${c.surface_pressure} hPa`);
      })
      .catch(() => { setStatus("error"); setMsg("Couldn't reach the weather API — try again, or enter coordinates manually."); });
  };

  const sync = () => {
    if (!navigator.geolocation) { setNeedsManual(true); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
      () => setNeedsManual(true),
      { timeout: 6000 }
    );
  };

  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 4, background: CARD, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 15, color: INK, display: "flex", alignItems: "center", gap: 6 }}>
          <MapPin size={14} color="#8A7CA8" /> Weather & pressure
        </div>
        <button onClick={sync} disabled={status === "loading"} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: `1px solid ${LINE}`, borderRadius: 4, padding: "6px 11px", fontSize: 12, cursor: "pointer", color: INK }}>
          <RefreshCw size={12} className={status === "loading" ? "spin" : ""} /> Sync today
        </button>
      </div>
      {msg && <div style={{ fontSize: 12, color: status === "error" ? "#B8615B" : "#5B7A63", marginTop: 8 }}>{msg}</div>}
      {needsManual && status !== "done" && (
        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <input placeholder="latitude" value={manual.lat} onChange={(e) => setManual({ ...manual, lat: e.target.value })} style={{ ...inputStyle }} />
          <input placeholder="longitude" value={manual.lon} onChange={(e) => setManual({ ...manual, lon: e.target.value })} style={{ ...inputStyle }} />
          <button onClick={() => manual.lat && manual.lon && fetchWeather(manual.lat, manual.lon)} style={{ background: INK, color: PAPER, border: "none", borderRadius: 4, padding: "0 14px", fontSize: 12, cursor: "pointer" }}>Go</button>
        </div>
      )}
      <div style={{ fontSize: 11, color: MUTE, marginTop: 8 }}>Free, no account — pulls current temperature, humidity and barometric pressure for your location.</div>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg);} }`}</style>
    </div>
  );
}

// ---------- Medication list manager ----------
function MedManager({ medList, onAdd, onDelete, open, onToggle }) {
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [isSupplement, setIsSupplement] = useState(false);

  const submit = () => {
    if (!name.trim()) return;
    onAdd({ id: uid(), name: name.trim(), dose: dose.trim(), isSupplement });
    setName(""); setDose(""); setIsSupplement(false);
  };

  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 4, background: "#F4F5EE" }}>
      <button onClick={onToggle} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "none", border: "none", padding: "10px 14px", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: 12.5, color: INK, fontWeight: 500,
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Settings2 size={13} /> My medications & supplements ({medList.length})</span>
        <span>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 14px 14px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {medList.length === 0 && <div style={{ fontSize: 12, color: MUTE, fontStyle: "italic" }}>Nothing saved yet — add your regulars below so they're one tap forever.</div>}
            {medList.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 3, padding: "7px 10px" }}>
                <Pill size={13} color={TYPES.medication.color} />
                <span style={{ fontFamily: "Fraunces, serif", fontSize: 13, color: INK, flex: 1 }}>{m.name}</span>
                {m.dose && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: MUTE }}>{m.dose}</span>}
                {m.isSupplement && <span style={{ fontSize: 10, color: "#5B7A63" }}>supplement</span>}
                <button onClick={() => onDelete(m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#B8615B", opacity: 0.6 }}><X size={13} /></button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input placeholder="name" value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, flex: "2 1 120px" }} />
            <input placeholder="dose (e.g. 200mg)" value={dose} onChange={(e) => setDose(e.target.value)} style={{ ...inputStyle, flex: "1 1 90px" }} />
            <button onClick={() => setIsSupplement(!isSupplement)} style={chipStyle(isSupplement, "#5B7A63")}>{isSupplement ? "✓ " : ""}Supplement</button>
            <button onClick={submit} style={{ background: INK, color: PAPER, border: "none", borderRadius: 3, padding: "0 14px", fontSize: 12, cursor: "pointer" }}>Add</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Full log form ----------
function LogForm({ onAdd, medList, onAddMed, onDeleteMed }) {
  const [type, setType] = useState("symptom");
  const [name, setName] = useState("");
  const [value, setValue] = useState("5");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(todayStr());
  const [startTime, setStartTime] = useState(nowTime());
  const [endTime, setEndTime] = useState("");
  const [whatHelped, setWhatHelped] = useState("");
  const [tags, setTags] = useState([]);
  const [isSupplement, setIsSupplement] = useState(false);
  const [flow, setFlow] = useState(null);
  const [reproSub, setReproSub] = useState("Cramps");
  const [stress, setStress] = useState("5");
  const [energy, setEnergy] = useState("5");
  const [managerOpen, setManagerOpen] = useState(false);

  const toggleTag = (t) => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const reset = () => { setName(""); setValue("5"); setNotes(""); setEndTime(""); setWhatHelped(""); setTags([]); setIsSupplement(false); setFlow(null); };

  const submit = () => {
    const base = { id: uid(), date, time: startTime || nowTime(), notes };
    if (type === "symptom") {
      if (!name.trim()) return;
      onAdd([{ ...base, type: "symptom", name: name.trim(), value, startTime, endTime, whatHelped }]);
      tags.forEach((t) => onAdd([{ id: uid(), type: "symptom", name: t, value: "1", date, time: startTime, notes: "context tag" }]));
    } else if (type === "food") {
      if (!name.trim()) return;
      const extra = tags.map((t) => ({ id: uid(), type: "trigger", name: t, value: "1", date, time: startTime, notes: `from ${name.trim()}` }));
      onAdd([{ ...base, type: "food", name: name.trim(), value: "1", tags }, ...extra]);
    } else if (type === "medication") {
      if (!name.trim()) return;
      onAdd([{ ...base, type: "medication", name: name.trim() + (isSupplement ? " (supplement)" : ""), value: value || "1" }]);
    } else if (type === "breathwork") {
      if (!name.trim()) return;
      onAdd([{ ...base, type: "breathwork", name: name.trim(), value: value || "10" }]);
    } else if (type === "habit") {
      if (!name.trim()) return;
      onAdd([{ ...base, type: "habit", name: name.trim(), value: value || "1" }]);
    } else if (type === "reproductive") {
      const v = reproSub === "Spotting" ? String(flow || 1) : value;
      onAdd([{ ...base, type: "reproductive", name: reproSub, value: v }]);
    } else if (type === "mood") {
      onAdd([
        { ...base, type: "mood", name: "Mood", value },
        { id: uid(), type: "mood", name: "Stress", value: stress, date, time: startTime, notes: "" },
        { id: uid(), type: "mood", name: "Energy", value: energy, date, time: startTime, notes: "" },
      ]);
    }
    reset();
  };

  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 4, background: CARD, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {LOG_TYPES.map((key) => {
          const t = TYPES[key]; const Icon = t.icon; const active = type === key;
          return (
            <button key={key} onClick={() => setType(key)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 3,
              border: `1px solid ${active ? t.color : LINE}`, background: active ? `${t.color}1A` : "transparent",
              color: active ? t.color : MUTE, fontSize: 12, fontFamily: "Inter, sans-serif", fontWeight: 500, cursor: "pointer",
            }}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {type === "symptom" && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SYMPTOM_PRESETS.map((s) => <button key={s} style={chipStyle(name === s, TYPES.symptom.color)} onClick={() => setName(s)}>{s}</button>)}
          </div>
          <input placeholder="or type a symptom" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          <div>
            <div style={sectionLabel}>Severity: {value}</div>
            <input type="range" min="0" max="10" value={value} onChange={(e) => setValue(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><div style={sectionLabel}>Started</div><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inputStyle} /></div>
            <div style={{ flex: 1 }}><div style={sectionLabel}>Ended (optional)</div><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={inputStyle} /></div>
          </div>
          <input placeholder="What helped? (optional)" value={whatHelped} onChange={(e) => setWhatHelped(e.target.value)} style={inputStyle} />
          <div>
            <div style={sectionLabel}>Also happening (optional)</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ILLNESS_TAGS.map((t) => <button key={t} style={chipStyle(tags.includes(t), "#B8615B")} onClick={() => toggleTag(t)}>{t}</button>)}
            </div>
          </div>
        </>
      )}

      {type === "food" && (
        <>
          <input placeholder="What did you eat/drink?" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          <div>
            <div style={sectionLabel}>Contains (tap all that apply)</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {FOOD_TAGS.map((t) => <button key={t} style={chipStyle(tags.includes(t), TYPES.food.color)} onClick={() => toggleTag(t)}>{t}</button>)}
            </div>
          </div>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inputStyle} />
        </>
      )}

      {type === "medication" && (
        <>
          {medList.length > 0 && (
            <div>
              <div style={sectionLabel}>Tap to log a saved one</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {medList.map((m) => (
                  <button key={m.id} style={chipStyle(name === m.name, TYPES.medication.color)}
                    onClick={() => { setName(m.name); setValue(m.dose || "1"); setIsSupplement(m.isSupplement); }}>
                    {m.name}{m.dose ? ` · ${m.dose}` : ""}
                  </button>
                ))}
              </div>
            </div>
          )}
          <input placeholder="Medication or supplement name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          <input placeholder="Dose (e.g. 200mg)" value={value} onChange={(e) => setValue(e.target.value)} style={inputStyle} />
          <button onClick={() => setIsSupplement(!isSupplement)} style={chipStyle(isSupplement, TYPES.medication.color)}>{isSupplement ? "✓ " : ""}Mark as supplement</button>
          <MedManager medList={medList} onAdd={onAddMed} onDelete={onDeleteMed} open={managerOpen} onToggle={() => setManagerOpen(!managerOpen)} />
        </>
      )}

      {type === "breathwork" && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {BREATH_PRESETS.map((s) => <button key={s} style={chipStyle(name === s, TYPES.breathwork.color)} onClick={() => setName(s)}>{s}</button>)}
          </div>
          <input placeholder="minutes" value={value} onChange={(e) => setValue(e.target.value)} style={inputStyle} />
        </>
      )}

      {type === "habit" && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {HABIT_PRESETS.map((s) => <button key={s} style={chipStyle(name === s, TYPES.habit.color)} onClick={() => setName(s)}>{s}</button>)}
          </div>
          <input placeholder="or type a habit" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          <input placeholder="amount / minutes (optional)" value={value} onChange={(e) => setValue(e.target.value)} style={inputStyle} />
        </>
      )}

      {type === "reproductive" && (
        <>
          <div style={{ display: "flex", gap: 6 }}>
            {REPRO_TYPES.map((r) => <button key={r} style={chipStyle(reproSub === r, TYPES.reproductive.color)} onClick={() => setReproSub(r)}>{r}</button>)}
          </div>
          {reproSub === "Cramps" ? (
            <div><div style={sectionLabel}>Severity: {value}</div><input type="range" min="0" max="10" value={value} onChange={(e) => setValue(e.target.value)} style={{ width: "100%" }} /></div>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>{FLOW_LEVELS.map((f) => <button key={f.v} style={chipStyle(flow === f.v, TYPES.reproductive.color)} onClick={() => setFlow(f.v)}>{f.label}</button>)}</div>
          )}
        </>
      )}

      {type === "mood" && (
        <>
          <div><div style={sectionLabel}>Mood: {value}/10</div><input type="range" min="0" max="10" value={value} onChange={(e) => setValue(e.target.value)} style={{ width: "100%" }} /></div>
          <div><div style={sectionLabel}>Stress: {stress}/10</div><input type="range" min="0" max="10" value={stress} onChange={(e) => setStress(e.target.value)} style={{ width: "100%" }} /></div>
          <div><div style={sectionLabel}>Energy: {energy}/10</div><input type="range" min="0" max="10" value={energy} onChange={(e) => setEnergy(e.target.value)} style={{ width: "100%" }} /></div>
        </>
      )}

      <input placeholder="notes / context (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} style={inputStyle} />

      <button onClick={submit} style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, background: INK, color: PAPER, border: "none", borderRadius: 3, padding: "9px 16px", fontSize: 13, fontFamily: "Inter, sans-serif", fontWeight: 500, cursor: "pointer" }}>
        <Plus size={14} /> Log entry
      </button>
    </div>
  );
}

function EntryRow({ e, onDelete }) {
  const t = TYPES[e.type];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 4px", borderBottom: `1px solid #E4E6DB`, fontSize: 13 }}>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: MUTE, width: 76, flexShrink: 0 }}>{e.date}</span>
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
      <span style={{ fontFamily: "Fraunces, serif", color: INK, flex: 1 }}>{e.name}</span>
      {e.value !== undefined && e.value !== "" && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: MUTE }}>{e.value}</span>}
      <button onClick={() => onDelete(e.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#B8615B", opacity: 0.6 }}><Trash2 size={13} /></button>
    </div>
  );
}

function CorrelationCard({ result }) {
  const t = TYPES[result.type];
  const pct = Math.min(Math.abs(result.r), 1) * 100;
  const positive = result.r >= 0;
  const strength = Math.abs(result.r) >= 0.6 ? "strong" : Math.abs(result.r) >= 0.35 ? "moderate" : "weak";
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 3, background: CARD, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 3, background: t.color }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 17, color: INK, fontWeight: 500 }}>{result.name}</div>
          <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: t.color }}>{t.label}</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 20, color: positive ? "#8B4A46" : "#3F5C48", fontWeight: 500 }}>{result.r > 0 ? "+" : ""}{result.r.toFixed(2)}</div>
          <div style={{ fontSize: 10, color: MUTE, fontFamily: "'IBM Plex Mono', monospace" }}>n={result.n} · lag {result.lag}d</div>
        </div>
      </div>
      <div style={{ height: 5, background: "#E4E6DB", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: positive ? "#B8615B" : "#5B7A63", borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 12, color: MUTE, lineHeight: 1.5 }}>
        {strength} {positive ? "positive" : "inverse"} relationship{result.lag > 0 ? ` — ${result.name} one day, symptom ${result.lag} day${result.lag > 1 ? "s" : ""} later` : " — same day"}.
      </div>
    </div>
  );
}

// ---------- main app ----------
export default function HealthLedger() {
  const [entries, setEntries] = useState([]);
  const [seenBadges, setSeenBadges] = useState([]);
  const [medList, setMedList] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("today");
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [selectedSymptom, setSelectedSymptom] = useState(null);
  const [toast, setToast] = useState(null);
  const [confetti, setConfetti] = useState(false);
  const toastTimer = useRef(null);

  useEffect(() => {
    Promise.all([loadKey("entries", []), loadKey("seenBadges", []), loadKey("medList", [])]).then(([e, b, m]) => {
      setEntries(e); setSeenBadges(b); setMedList(m); setLoaded(true);
    });
  }, []);
  useEffect(() => { if (loaded) saveKey("entries", entries); }, [entries, loaded]);
  useEffect(() => { if (loaded) saveKey("seenBadges", seenBadges); }, [seenBadges, loaded]);
  useEffect(() => { if (loaded) saveKey("medList", medList); }, [medList, loaded]);

  const addMed = useCallback((m) => setMedList((prev) => [...prev, m]), []);
  const deleteMed = useCallback((id) => setMedList((prev) => prev.filter((m) => m.id !== id)), []);

  const fireToast = (t, withConfetti) => {
    setToast(t);
    if (withConfetti) { setConfetti(true); setTimeout(() => setConfetti(false), 1200); }
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  };

  const addEntries = useCallback((newOnes) => {
    setEntries((prev) => {
      const next = [...prev, ...newOnes];
      // variable reward: every 5th core log entry
      const coreCountBefore = prev.filter((e) => CORE_LOG_TYPES.has(e.type)).length;
      const coreCountAfter = next.filter((e) => CORE_LOG_TYPES.has(e.type)).length;
      const crossedFive = Math.floor(coreCountAfter / 5) > Math.floor(coreCountBefore / 5);

      const streak = computeStreak(computeDayCounts(next));
      const badges = computeBadges(next, streak);
      const newBadges = badges.filter((b) => !seenBadges.includes(b));

      if (newBadges.length > 0) {
        const meta = BADGE_META[newBadges[0]];
        fireToast({ icon: meta.icon, title: "Badge unlocked", message: meta.label }, true);
        setSeenBadges((sb) => Array.from(new Set([...sb, ...newBadges])));
      } else {
        const momentum = computeMomentum(next);
        if (momentum.pct === 100 && computeMomentum(prev).pct !== 100) {
          fireToast({ icon: "🎯", title: "Full momentum today", message: "All four check-ins done — see today's insight." }, true);
        } else if (crossedFive) {
          fireToast({ icon: "✨", message: ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)] }, false);
        } else {
          fireToast({ icon: "✓", message: "Logged." }, false);
        }
      }
      return next;
    });
  }, [seenBadges]);

  const deleteEntry = useCallback((id) => setEntries((prev) => prev.filter((e) => e.id !== id)), []);

  const dayCounts = useMemo(() => computeDayCounts(entries), [entries]);
  const streak = useMemo(() => computeStreak(dayCounts), [dayCounts]);
  const momentum = useMemo(() => computeMomentum(entries), [entries]);

  const symptomNames = useMemo(() => Array.from(new Set(entries.filter((e) => e.type === "symptom").map((e) => e.name))), [entries]);
  useEffect(() => { if (!selectedSymptom && symptomNames.length) setSelectedSymptom(symptomNames[0]); }, [symptomNames, selectedSymptom]);
  const correlations = useMemo(() => (selectedSymptom ? correlateAll(entries, "symptom", selectedSymptom) : []), [entries, selectedSymptom]);
  const topInsight = correlations[0];

  const sortedEntries = useMemo(() => [...entries].sort((a, b) => (a.date < b.date ? 1 : -1)), [entries]);

  const runImport = () => {
    const rows = parseImport(importText);
    if (!rows.length) { setImportMsg("Couldn't find rows. Expected CSV headers date,metric,value[,source] or a JSON array of {date, metric, value, source?}."); return; }
    addEntries(rows);
    setImportMsg(`Imported ${rows.length} data point${rows.length > 1 ? "s" : ""}.`);
    setImportText("");
  };

  return (
    <div style={{ minHeight: "100vh", background: PAPER, fontFamily: "Inter, sans-serif" }}>
      <style>{`
        @import url('${FONT_LINK}');
        * { box-sizing: border-box; }
        ::placeholder { color: #9AA093; }
        input:focus { border-color: #5B7A63 !important; }
        button { transition: transform 0.08s ease; }
        button:active { transform: scale(0.97); }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
      `}</style>
      <Confetti show={confetti} />
      <Toast toast={toast} />

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 18px 60px" }}>
        <header style={{ marginBottom: 22 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: MUTE, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Personal health ledger</div>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 30, color: INK, margin: 0, fontWeight: 600 }}>Log &amp; correlate</h1>
        </header>

        <nav style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${LINE}`, overflowX: "auto" }}>
          {[["today", "Today"], ["log", "Log"], ["import", "Import"], ["insights", "Insights"]].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              padding: "9px 4px", marginRight: 18, background: "none", border: "none",
              borderBottom: tab === key ? `2px solid ${INK}` : "2px solid transparent",
              color: tab === key ? INK : MUTE, fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}>{label}</button>
          ))}
        </nav>

        {tab === "today" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}><MomentumMeter momentum={momentum} /></div>
              <div style={{ width: 100 }}><StreakBadge streak={streak} /></div>
            </div>
            {topInsight && momentum.pct === 100 && (
              <div style={{ border: "1px solid #C98A3B55", borderRadius: 4, background: "#C98A3B14", padding: 16 }}>
                <div style={{ fontFamily: "Fraunces, serif", fontSize: 15, color: INK, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <Award size={15} color="#C98A3B" /> Insight of the day
                </div>
                <div style={{ fontSize: 13, color: "#4A524A", lineHeight: 1.5 }}>
                  Your strongest link so far for <strong>{selectedSymptom}</strong> is with <strong>{topInsight.name}</strong> ({topInsight.r > 0 ? "+" : ""}{topInsight.r.toFixed(2)}). Check the Insights tab for the full picture.
                </div>
              </div>
            )}
            <Heatmap dayCounts={dayCounts} />
            <QuickLog medList={medList} onQuickAdd={(e) => addEntries([{ id: uid(), date: todayStr(), time: nowTime(), notes: "", ...e }])} />
            <WeatherSync onImport={addEntries} />
          </div>
        )}

        {tab === "log" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <LogForm onAdd={addEntries} medList={medList} onAddMed={addMed} onDeleteMed={deleteMed} />
            <div>
              <div style={{ ...sectionLabel, marginBottom: 8 }}>Recent entries ({entries.length})</div>
              {sortedEntries.length === 0 ? (
                <div style={{ color: "#9AA093", fontSize: 13, fontStyle: "italic", padding: "20px 0" }}>Nothing logged yet.</div>
              ) : (
                <div>{sortedEntries.slice(0, 80).map((e) => <EntryRow key={e.id} e={e} onDelete={deleteEntry} />)}</div>
              )}
            </div>
          </div>
        )}

        {tab === "import" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ border: `1px solid ${LINE}`, borderRadius: 3, background: CARD, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Upload size={15} color="#5B7A63" />
                <span style={{ fontFamily: "Fraunces, serif", fontSize: 16, color: INK }}>Paste an export</span>
              </div>
              <p style={{ fontSize: 12, color: MUTE, lineHeight: 1.6, marginBottom: 10 }}>
                CSV headers <code style={codeStyle}>date,metric,value,source</code> — or JSON array of <code style={codeStyle}>{`{date, metric, value, source}`}</code>.
              </p>
              <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={8} placeholder={"date,metric,value,source\n2026-07-08,recovery_score,84,ultrahuman\n2026-07-08,glucose_avg,112,libre"} style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, resize: "vertical" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                <button onClick={runImport} style={{ background: INK, color: PAPER, border: "none", borderRadius: 3, padding: "9px 16px", fontSize: 13, fontFamily: "Inter, sans-serif", fontWeight: 500, cursor: "pointer" }}>Import rows</button>
                {importMsg && <span style={{ fontSize: 12, color: "#5B7A63" }}>{importMsg}</span>}
              </div>
            </div>
            <div style={{ border: `1px solid ${LINE}`, borderRadius: 3, padding: 16, background: "#F4F5EE", fontSize: 12, color: "#4A524A", lineHeight: 1.7 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} color="#C98A3B" />
                <div>Ultrahuman, Libre, and MyFitnessPal need a small script or export step on your end — ask any time and I'll write it.</div>
              </div>
            </div>
          </div>
        )}

        {tab === "insights" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {symptomNames.length === 0 ? (
              <div style={{ color: "#9AA093", fontSize: 13, fontStyle: "italic", padding: "20px 0" }}>Log at least one symptom across a few days to see correlations.</div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {symptomNames.map((n) => (
                    <button key={n} onClick={() => setSelectedSymptom(n)} style={chipStyle(selectedSymptom === n, "#B8615B")}>{n}</button>
                  ))}
                </div>
                {correlations.length === 0 ? (
                  <div style={{ color: "#9AA093", fontSize: 13, fontStyle: "italic" }}>Not enough overlapping days yet for "{selectedSymptom}". Keep logging — need 3+ overlapping days per comparison.</div>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: MUTE, lineHeight: 1.6 }}>
                      Ranked by strength of same-or-lagged relationship with <strong>{selectedSymptom}</strong>. Correlation on a small personal dataset — treat strong results as hypotheses, not conclusions.
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {correlations.map((r) => <CorrelationCard key={r.type + r.name} result={r} />)}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const codeStyle = { fontFamily: "'IBM Plex Mono', monospace", background: "#E4E6DB", padding: "1px 5px", borderRadius: 2, fontSize: 11 };
