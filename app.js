const $ = s => document.querySelector(s);

const NOTES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const KEYS = ["C", "G", "D", "A", "E", "F", "B♭", "E♭", "A♭", "B", "F♯", "C♯"];
const TUNING = [64, 59, 55, 50, 45, 40];
const PC = {
  C: 0, "C♯": 1, "C#": 1, Db: 1, "D♭": 1,
  D: 2, "D♯": 3, "D#": 3, Eb: 3, "E♭": 3,
  E: 4, F: 5, "F♯": 6, "F#": 6, Gb: 6, "G♭": 6,
  G: 7, "G♯": 8, "G#": 8, Ab: 8, "A♭": 8,
  A: 9, "A♯": 10, "A#": 10, Bb: 10, "B♭": 10,
  B: 11
};

const INTERVALS = {
  maj: [0, 4, 7],
  m: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  7: [0, 4, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  mMaj7: [0, 3, 7, 11],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  9: [0, 4, 7, 10, 14],
  13: [0, 4, 7, 10, 14, 21],
  m11: [0, 3, 7, 10, 14, 17],
  "7b9": [0, 4, 7, 10, 13],
  "7s9": [0, 4, 7, 10, 15],
  maj7s11: [0, 4, 7, 11, 18]
};

const TOOLS = {
  note: [
    ["Find All", "6개 현 전체에서 같은 음의 모든 위치 찾기", "findAll"],
    ["Find on String", "지정한 현에서 해당 음의 위치 찾기", "findStrings"]
  ],
  triad: [
    ["Triad Finder", "랜덤 트라이어드 제시 · 직접 운지 · 정답 확인", "finder"],
    ["Triad Flow", "BPM에 맞춰 코드가 바뀌는 실시간 전환 연습", "flow"],
    ["Triad Dictionary", "코드와 전위별 운지 형태 검색", "dictionary"]
  ],
  shell: [
    ["Shell Finder", "7th 코드와 텐션 보이싱 찾기 · 정답 확인", "finder"],
    ["Shell Flow", "박자에 맞춰 쉘 보이싱 전환 연습", "flow"],
    ["Shell Dictionary", "쉘 보이싱과 텐션 형태 검색", "dictionary"]
  ],
  progression: [
    ["Progression Session", "장르별 진행을 실시간 연주하고 코드표 저장", "session"]
  ]
};

let moduleKey = "note";
let toolKey = "findAll";
let settings = {};
let timer = null;
let remaining = 5;
let total = 5;
let paused = false;
let promptNo = 0;
let metro = false;
let beatTimer = null;
let audioCtx = null;
let beatCount = 0;
let bpm = 90;
let progression = [];
let progressIndex = 0;
let sessionLast = null;
let shownAnswer = false;
let flowStepTimer = null;
let flowBeatProgress = 0;

const pick = a => a[Math.floor(Math.random() * a.length)];

function updateNetworkBadge() {
  const badge = $("#netStatus");
  if (!badge) return;
  const online = navigator.onLine;
  badge.classList.toggle("offline", !online);
  badge.innerHTML = online ? "<i></i> ONLINE" : "<i></i> OFFLINE";
}
window.addEventListener("online", updateNetworkBadge);
window.addEventListener("offline", updateNetworkBadge);
updateNetworkBadge();

function show(id) {
  document.querySelectorAll(".screen").forEach(x => x.classList.remove("active"));
  $("#" + id).classList.add("active");
  window.scrollTo(0, 0);
  if (id !== "session") {
    stopAllSessionLoops();
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function normalizeRoot(n) {
  return String(n || "C").replace(/b/g, "♭").replace(/#/g, "♯");
}

function rootPc(n) {
  return PC[n] ?? PC[normalizeRoot(n)] ?? 0;
}

function pcName(pc) {
  return NOTES[((pc % 12) + 12) % 12];
}

function midiForString(s, fret) {
  return TUNING[s - 1] + fret;
}

function positionsForNote(note, strings = [1, 2, 3, 4, 5, 6], maxFret = 15) {
  const target = rootPc(note);
  const out = [];
  for (const s of strings) {
    for (let f = 0; f <= maxFret; f++) {
      if (midiForString(s, f) % 12 === target) {
        out.push({ s, f, note: normalizeRoot(note) });
      }
    }
  }
  return out;
}

function chordIntervals(type) {
  return INTERVALS[type] || INTERVALS.maj;
}

function chordSuffix(type) {
  const suffix = {
    maj: "",
    m: "m",
    dim: "dim",
    aug: "+",
    sus2: "sus2",
    sus4: "sus4",
    maj7: "maj7",
    m7: "m7",
    7: "7",
    m7b5: "m7♭5",
    dim7: "dim7",
    mMaj7: "m(maj7)",
    maj9: "maj9",
    m9: "m9",
    9: "9",
    13: "13",
    m11: "m11",
    "7b9": "7♭9",
    "7s9": "7♯9",
    maj7s11: "maj7♯11"
  };
  return suffix[type] ?? "";
}

function chordName(root, type) {
  return normalizeRoot(root) + chordSuffix(type);
}

function chordToneNames(root, type) {
  return chordIntervals(type).map(i => pcName(rootPc(root) + i));
}

function chordRootAt(key, degree) {
  const major = [0, 2, 4, 5, 7, 9, 11];
  return pcName(rootPc(key) + major[(degree - 1) % 7]);
}

function triadChord(root, quality) {
  const r = normalizeRoot(root);
  return {
    root: r,
    type: quality,
    name: chordName(r, quality),
    intervals: chordIntervals(quality)
  };
}

function enumerateShapes(chord, opts = {}) {
  const maxFret = opts.maxFret || 12;
  const allowOmit = opts.allowOmit ?? false;
  const isTriad = opts.isTriad ?? (chord.intervals.length <= 3);
  const allowedStringSets = opts.allowedStringSets || (
    isTriad
      ? [[1, 2, 3], [2, 3, 4]]
      : null
  );
  const strings = opts.strings || [1, 2, 3, 4];
  const count = Math.min(opts.count || 3, strings.length);
  const tones = chord.intervals.map((x, i) => ({
    pc: (rootPc(chord.root) + x) % 12,
    role: i === 0 ? "R" : i === 1 ? "3" : i === 2 ? "5" : i === 3 ? "7" : String(x % 12)
  }));

  const stringSets = allowedStringSets
    ? allowedStringSets.filter(set => !opts.count || set.length === Number(opts.count) || isTriad)
    : (() => {
        const sets = [];
        for (let start = 0; start <= strings.length - count; start++) {
          sets.push(strings.slice(start, start + count));
        }
        return sets;
      })();

  const candidates = [];
  for (const ss of stringSets) {
    const lists = ss.map(s => {
      const a = [];
      for (let f = 0; f <= maxFret; f++) {
        const pc = midiForString(s, f) % 12;
        const t = tones.find(x => x.pc === pc);
        if (t) {
          a.push({ s, f, pc, role: t.role, note: pcName(pc) });
        }
      }
      return a;
    });
    if (lists.some(a => !a.length)) continue;

    function rec(idx, arr) {
      if (idx === lists.length) {
        const fs = arr.map(x => x.f);
        const span = Math.max(...fs) - Math.min(...fs);
        if (span > 4) return;
        const roles = new Set(arr.map(x => x.role));
        if (!allowOmit && chord.intervals.length <= 3 && roles.size < Math.min(3, chord.intervals.length)) {
          return;
        }
        candidates.push({
          positions: arr.slice(),
          span,
          base: Math.min(...fs),
          strings: ss
        });
        return;
      }
      for (const p of lists[idx]) {
        if (arr.length && Math.abs(p.f - arr[arr.length - 1].f) > 5) continue;
        arr.push(p);
        rec(idx + 1, arr);
        arr.pop();
      }
    }
    rec(0, []);
  }

  candidates.sort((a, b) => a.span - b.span || a.base - b.base);
  return candidates;
}

function bestShape(chord, opts = {}) {
  const isTriad = opts.isTriad ?? (chord.intervals.length <= 3);
  const baseOpts = isTriad
    ? { ...opts, isTriad: true, count: 3, allowedStringSets: [[1, 2, 3], [2, 3, 4]] }
    : opts;
  let all = enumerateShapes(chord, baseOpts);
  if (!all.length) {
    all = enumerateShapes(chord, { ...baseOpts, allowOmit: true, maxFret: 15 });
  }
  if (!all.length) return null;

  const target = opts.inversion;
  if (target && target !== "Random") {
    const role = target === "Root" ? "R" : target === "1st" ? "3" : "5";
    const match = all.filter(x => x.positions.some(p => p.role === role) && x.positions[0].role === role);
    if (match.length) all = match;
  }
  return pick(all.slice(0, Math.min(8, all.length)));
}

function boardSvg(positions = [], opts = {}) {
  const maxFret = opts.maxFret || 12;
  const w = 620;
  const h = 174;
  const left = 42;
  const right = 12;
  const top = 22;
  const bottom = 20;
  const fw = (w - left - right) / maxFret;
  const sh = (h - top - bottom) / 5;

  let svg = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="기타 지판 운지 다이어그램">`;
  for (let f = 0; f <= maxFret; f++) {
    const x = left + f * fw;
    svg += `<line x1="${x}" y1="${top}" x2="${x}" y2="${h - bottom}" stroke="${f === 0 ? "#7a8797" : "#c5ccd4"}" stroke-width="${f === 0 ? 4 : 1.2}"/>`;
    if (f > 0 && f % 2 === 1) {
      const fretCenterX = left + (f - 0.5) * fw;
      svg += `<text x="${fretCenterX}" y="${h - 5}" font-size="9" text-anchor="middle" fill="#647184">${f}</text>`;
    }
  }
  for (let s = 1; s <= 6; s++) {
    const y = top + (s - 1) * sh;
    svg += `<line x1="${left}" y1="${y}" x2="${w - right}" y2="${y}" stroke="#8c98a7" stroke-width="${1 + (6 - s) * 0.25}"/>`;
    svg += `<text x="22" y="${y + 3}" font-size="10" text-anchor="middle" fill="#647184">${s}</text>`;
  }
  for (const p of positions) {
    const x = left + (p.f === 0 ? 0 : (p.f - 0.5) * fw);
    const y = top + (p.s - 1) * sh;
    svg += `<circle cx="${x}" cy="${y}" r="10" fill="#a6f36b" stroke="#263b20" stroke-width="1"/>`;
    svg += `<text x="${x}" y="${y + 3.2}" font-size="8" font-weight="700" text-anchor="middle" fill="#172414">${esc(p.role || p.note || "●")}</text>`;
  }
  svg += "</svg>";
  return svg;
}

function renderShape(shape, title, sub = "") {
  if (!shape) {
    return `<div class="answer-note">현재 설정 범위에서 운지 형태를 찾지 못했습니다. 현 범위나 프렛 범위를 넓혀 다시 검색해 주세요.</div>`;
  }
  return `
    <div class="answer-title">${esc(title)}</div>
    <div class="fretboard">${boardSvg(shape.positions)}</div>
    <div class="answer-note">${esc(sub || shape.positions.map(p => `${p.s}번 현 ${p.f}프렛 ${p.note}(${p.role})`).join(" · "))}</div>
  `;
}

function buildProgression(kind, opts) {
  const key = normalizeRoot(opts.key || "C");
  const genre = opts.genre || "Neo Soul / R&B";
  const bars = Number(opts.bars || 16);
  const arr = [];

  const triadPatterns = {
    Major: [[1, "maj"], [6, "m"], [2, "m"], [5, "maj"], [1, "maj"], [4, "maj"], [2, "m"], [5, "maj"]],
    Minor: [[1, "m"], [6, "maj"], [3, "maj"], [7, "maj"], [4, "m"], [5, "m"], [1, "m"], [5, "maj"]]
  };

  const shellPatterns = {
    Jazz: [[2, "m7"], [5, "7"], [1, "maj7"], [1, "maj7"], [6, "m7"], [2, "7"], [2, "m7"], [5, "7"], [3, "m7"], [6, "7"], [2, "m7"], [5, "7"], [1, "maj7"], [6, "7"], [2, "m7"], [5, "7"]],
    "City Pop": [[1, "maj7"], [3, "m7"], [6, "m7"], [2, "7"], [2, "m7"], [5, "7"], [1, "maj7"], [6, "7"], [2, "m7"], [5, "7"], [3, "m7"], [6, "7"], [4, "maj7"], [4, "m7"], [1, "maj7"], [5, "7"]],
    "Bossa Nova": [[1, "maj7"], [6, "7"], [2, "m7"], [5, "7"], [1, "maj7"], [3, "m7"], [6, "7"], [2, "m7"], [5, "7"], [1, "maj7"], [4, "maj7"], [4, "m7"], [3, "m7"], [6, "7"], [2, "m7"], [5, "7"]],
    "Neo Soul / R&B": [[1, "maj9"], [6, "m7"], [2, "m9"], [5, "13"], [3, "m7"], [6, "7"], [2, "m9"], [5, "13"], [1, "maj9"], [3, "m7"], [4, "maj7"], [4, "m7"], [1, "maj9"], [6, "m7"], [2, "m9"], [5, "13"]],
    "Blues / Rock": [[1, "7"], [1, "7"], [1, "7"], [1, "7"], [4, "7"], [4, "7"], [1, "7"], [1, "7"], [5, "7"], [4, "7"], [1, "7"], [5, "7"], [1, "7"], [4, "7"], [1, "7"], [5, "7"]]
  };

  const pattern = kind === "triad"
    ? (triadPatterns[opts.scale || "Major"] || triadPatterns.Major)
    : (shellPatterns[genre] || shellPatterns["Neo Soul / R&B"]);

  for (let i = 0; i < bars; i++) {
    let [deg, type] = pattern[i % pattern.length];
    const root = chordRootAt(key, deg);
    if (kind === "triad" && opts.scale === "Major") {
      type = ({ 1: "maj", 2: "m", 3: "m", 4: "maj", 5: "maj", 6: "m", 7: "dim" })[deg] || type;
    }
    const ch = triadChord(root, type);
    let voicing = kind === "triad"
      ? (opts.voicing || `${opts.stringCount || 3} strings`)
      : (opts.level || "Basic Shell");

    if (kind === "progression") {
      const f = opts.focus || "Random (All)";
      voicing = f === "Random (All)"
        ? pick(["Triad", "Shell", "Tension", "Drop 2", "Drop 3", "Slash Chord"])
        : f;
    }

    const chordDur = opts.duration === "random"
      ? (Math.random() < 0.5 ? 2 : 4)
      : Number(opts.duration || 4);

    arr.push({
      bar: i + 1,
      name: ch.name,
      chord: ch,
      voicing,
      duration: chordDur,
      genre,
      key
    });
  }
  return arr;
}

function renderFretboardPositions(note, strings) {
  const ps = positionsForNote(note, strings);
  return `
    <div class="answer-title">정답 위치 · ${esc(note)}</div>
    <div class="fretboard">${boardSvg(ps.map(p => ({ ...p, role: "●" })))}</div>
    <div class="answer-note">${ps.map(p => `${p.s}번 현 ${p.f}프렛`).join(" · ")}</div>
    <div class="answer-legend">
      <span><i class="legend-dot" style="background:#a6f36b"></i>정답 음 위치</span>
      <span>표준 튜닝 · 0~15프렛 기준</span>
    </div>
  `;
}

function makeSettings(k, t) {
  if (k === "note") {
    return `
      <div class="field">
        <label>훈련 방식</label>
        <div class="segmented">
          <button type="button" class="${t === "findAll" ? "selected" : ""}" data-mode="findAll">Find All</button>
          <button type="button" class="${t === "findStrings" ? "selected" : ""}" data-mode="findStrings">Find on String</button>
        </div>
      </div>
      <div class="field">
        <label>제한시간 <b id="timeOut">5초</b></label>
        <input id="timeLimit" type="range" min="1" max="15" value="5">
      </div>
      <div class="answer-note">제한시간은 연습 시작 전과 연습 도중 모두 조절할 수 있습니다.</div>
    `;
  }

  if (t === "finder" || t === "flow") {
    const isTriad = k === "triad";
    return `
      <div class="field-row">
        <div class="field">
          <label>Key</label>
          <select id="key">${KEYS.map(x => `<option>${x}</option>`).join("")}</select>
        </div>
        <div class="field">
          <label>Scale</label>
          <select id="scale"><option>Major</option><option>Minor</option></select>
        </div>
      </div>
      <div class="field">
        <label>Genre / 진행 유형</label>
        <select id="genre">${(isTriad ? ["Diatonic", "Blues / Rock", "Ballad / R&B"] : ["Jazz", "Neo Soul / R&B", "City Pop", "Bossa Nova"]).map(x => `<option>${x}</option>`).join("")}</select>
      </div>
      ${isTriad
        ? `<div class="field-row">
            <div class="field">
              <label>현군 (1-2-3 / 2-3-4)</label>
              <select id="stringCount"><option value="3">1-2-3 · 2-3-4 (3현군)</option><option value="random">1-2-3 · 2-3-4 랜덤</option></select>
            </div>
            <div class="field">
              <label>전위</label>
              <select id="inversion"><option>Random</option><option>Root</option><option>1st</option><option>2nd</option></select>
            </div>
          </div>`
        : `<div class="field">
            <label>보이싱 난이도</label>
            <select id="level"><option>Basic Shell</option><option>Extended Tension</option><option>Advanced Tension</option></select>
          </div>`}
      <div class="field-row">
        <div class="field">
          <label>BPM</label>
          <input id="bpm" type="number" min="40" max="220" value="${isTriad ? 100 : 90}">
        </div>
        <div class="field">
          <label>코드 변경</label>
          <select id="duration"><option value="2">2박</option><option value="4" selected>4박</option><option value="random">2박 / 4박 랜덤</option></select>
        </div>
      </div>
      <div class="field">
        <label>진행 길이</label>
        <select id="bars"><option>4</option><option>8</option><option>12</option><option selected>16</option></select>
      </div>
      <div class="answer-note">${t === "finder" ? "문제마다 코드가 하나씩 제시됩니다. 정답 확인을 누르면 지판 운지 형태를 표시합니다." : "코드가 설정한 박자에 맞춰 자동으로 바뀝니다. 이 모드에서는 정답 운지를 표시하지 않습니다."}</div>
    `;
  }

  if (t === "session") {
    return `
      <div class="field-row">
        <div class="field">
          <label>Key</label>
          <select id="key">${KEYS.map(x => `<option>${x}</option>`).join("")}</select>
        </div>
        <div class="field">
          <label>Genre</label>
          <select id="genre"><option>Jazz</option><option selected>Neo Soul / R&B</option><option>City Pop</option><option>Bossa Nova</option><option>Blues / Rock</option></select>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>난이도</label>
          <select id="difficulty"><option>Intermediate</option><option>Advanced</option></select>
        </div>
        <div class="field">
          <label>보이싱 Focus</label>
          <select id="focus"><option>Random (All)</option><option>Triad</option><option>Shell</option><option>Tension</option><option>Inversion</option><option>Drop 2</option><option>Drop 3</option><option>Slash Chord</option></select>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>BPM</label>
          <input id="bpm" type="number" min="40" max="220" value="90">
        </div>
        <div class="field">
          <label>코드 변경 간격</label>
          <select id="duration"><option value="2">2박</option><option value="4" selected>4박</option><option value="random">2박 / 4박 랜덤</option></select>
        </div>
      </div>
      <div class="field">
        <label>세션 길이</label>
        <select id="bars"><option>8</option><option>12</option><option selected>16</option><option>24</option><option>32</option></select>
      </div>
      <div class="answer-note">세션이 끝나면 코드 순서, 보이싱 유형, 실제 지판 운지 형태를 정리한 코드표를 생성합니다. PNG 저장 또는 인쇄/PDF 저장이 가능합니다.</div>
    `;
  }
  return "";
}

function openModule(k) {
  moduleKey = k;
  const titles = {
    note: "Note Finder",
    triad: "Triad Trainer",
    shell: "Shell Voicing Trainer",
    progression: "Progression Lab"
  };
  const desc = {
    note: "앱이 음을 제시하면 기타 지판에서 해당 음의 모든 위치를 찾습니다.",
    triad: "트라이어드의 개별 운지 학습, 실시간 전환, 코드 사전을 제공합니다.",
    shell: "7th 코드의 가이드톤과 텐션 보이싱을 학습합니다.",
    progression: "장르별 코드 진행을 실시간으로 연주하고 세션 결과를 코드표로 저장합니다."
  };
  $("#moduleEyebrow").textContent = "MODULE 0" + (Object.keys(titles).indexOf(k) + 1);
  $("#moduleTitle").textContent = titles[k];
  $("#moduleDesc").textContent = desc[k];
  $("#toolChoices").innerHTML = TOOLS[k].map((x, i) => `
    <button class="tool-card" type="button" data-tool="${x[2]}">
      <span class="tool-index">0${i + 1} / ${k.toUpperCase()}</span>
      <strong>${x[0]}</strong>
      <small>${x[1]}</small>
    </button>
  `).join("");

  document.querySelectorAll("[data-tool]").forEach(b => {
    b.onclick = () => openTool(b.dataset.tool);
  });
  show("module");
}

function openTool(t) {
  toolKey = t;
  if (t === "dictionary") {
    openDictionary();
    return;
  }
  const labels = {
    findAll: "Find All",
    findStrings: "Find on String",
    finder: moduleKey === "triad" ? "Triad Finder" : "Shell Finder",
    flow: moduleKey === "triad" ? "Triad Flow" : "Shell Flow",
    session: "Progression Session"
  };
  $("#toolEyebrow").textContent = moduleKey.toUpperCase() + " / " + t.toUpperCase();
  $("#toolTitle").textContent = labels[t] || "설정";
  $("#toolDesc").textContent = "연습 조건을 설정한 뒤 시작하세요.";
  $("#settingsFields").innerHTML = makeSettings(moduleKey, t);

  if (moduleKey === "note") {
    document.querySelectorAll("[data-mode]").forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll("[data-mode]").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        toolKey = btn.dataset.mode;
      };
    });
  }

  const r = $("#timeLimit");
  if (r) r.oninput = () => { $("#timeOut").textContent = r.value + "초"; };
  $("#startBtn").onclick = () => {
    unlockAudio();
    startSession();
  };
  $("#backModule").onclick = () => show("module");
  show("settings");
}

function getSettings() {
  const o = {};
  $("#settingsFields").querySelectorAll("select, input").forEach(e => {
    o[e.id] = e.value;
  });
  o.time = Number(o.timeLimit || 5);
  return o;
}

function notePrompt() {
  const note = pick(NOTES);
  const strings = [];
  if (toolKey === "findStrings") {
    const count = 2 + Math.floor(Math.random() * 3);
    const pool = [1, 2, 3, 4, 5, 6];
    while (strings.length < count) {
      const s = pick(pool);
      if (!strings.includes(s)) strings.push(s);
    }
    strings.sort((a, b) => a - b);
  }
  return { note, strings };
}

function setAnswerButton(showAnswerBtn) {
  $("#answerBtn").classList.toggle("hidden", !showAnswerBtn);
  $("#nextBtn").classList.toggle("hidden", showAnswerBtn);
}

async function unlockAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (!audioCtx) return null;
  if (audioCtx.state === "suspended") {
    try {
      await audioCtx.resume();
    } catch (_) {}
  }
  // 무음 버퍼 재생으로 iOS 무음/오디오 출력 잠금 해제
  try {
    const buf = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    src.start(0);
  } catch (_) {}
  return audioCtx;
}

function playClickNow(accent = false) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(accent ? 1200 : 880, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.28, now + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.07);
}

function clickSound(accent = false) {
  if (!audioCtx) {
    unlockAudio().then(() => playClickNow(accent));
    return;
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().then(() => playClickNow(accent)).catch(() => {});
    return;
  }
  playClickNow(accent);
}

function stopMetro() {
  clearInterval(beatTimer);
  beatTimer = null;
  beatCount = 0;
}

function startMetro() {
  stopMetro();
  const intervalMs = (60 / bpm) * 1000;
  clickSound(true);
  beatCount = 1;
  beatTimer = setInterval(() => {
    if (paused) return;
    clickSound(beatCount % 4 === 0);
    beatCount++;
  }, intervalMs);
}

function stopFlowLoop() {
  clearInterval(flowStepTimer);
  flowStepTimer = null;
}

function stopAllSessionLoops() {
  clearInterval(timer);
  timer = null;
  stopMetro();
  stopFlowLoop();
}

function runTimer() {
  clearInterval(timer);
  const stepMs = 80;
  timer = setInterval(() => {
    if (paused) return;
    remaining = Math.max(0, remaining - stepMs / 1000);
    $("#timerText").textContent = remaining.toFixed(1);
    $("#timerBar").style.width = ((remaining / Math.max(0.1, total)) * 100) + "%";
    if (remaining <= 0) {
      clearInterval(timer);
      revealAnswer();
    }
  }, stepMs);
}

function startSession() {
  stopAllSessionLoops();
  settings = getSettings();
  bpm = Math.max(40, Math.min(220, Number(settings.bpm || 90)));
  promptNo = 0;
  progressIndex = 0;
  paused = false;
  shownAnswer = false;
  $("#pauseBtn").textContent = "Ⅱ 일시정지";
  $("#metroToggle").textContent = "OFF";
  $("#metroToggle").classList.remove("on");
  metro = false;
  $("#tempoValue").textContent = bpm;
  $("#sessionModule").textContent = (moduleKey + " / " + toolKey).toUpperCase();
  $("#tempoDown").disabled = false;
  $("#tempoUp").disabled = false;

  const isNote = moduleKey === "note";
  $("#timerWrap").classList.toggle("hidden", !isNote);
  $("#inlineTime").classList.toggle("hidden", !isNote);
  $("#timeAdjust").value = settings.time;
  $("#timeAdjustOut").textContent = settings.time + "초";
  $("#timeAdjust").oninput = () => {
    settings.time = Number($("#timeAdjust").value);
    $("#timeAdjustOut").textContent = settings.time + "초";
    if (isNote && !paused) {
      total = settings.time;
      remaining = total;
      runTimer();
    }
  };
  $("#metronomeRow").classList.toggle("hidden", isNote);
  $("#liveSettings").textContent = isNote
    ? "정답 확인 전에는 정답 위치가 표시되지 않습니다."
    : "BPM은 연습 중 ±5씩 조절할 수 있습니다.";

  progression = (toolKey === "flow" || toolKey === "session")
    ? buildProgression(moduleKey === "triad" ? "triad" : moduleKey === "shell" ? "shell" : "progression", settings)
    : [];

  show("session");

  if (toolKey === "flow" || toolKey === "session") {
    $("#answerBtn").classList.add("hidden");
    $("#nextBtn").classList.add("hidden");
    $("#pauseBtn").classList.remove("hidden");
    $("#flowArea").classList.remove("hidden");
    $("#answerArea").classList.add("hidden");
    startFlow();
  } else {
    $("#flowArea").classList.add("hidden");
    setAnswerButton(true);
    nextFinderPrompt();
  }
}

function nextFinderPrompt() {
  clearInterval(timer);
  paused = false;
  shownAnswer = false;
  promptNo++;
  $("#pauseBtn").textContent = "Ⅱ 일시정지";
  setAnswerButton(true);
  $("#answerArea").classList.add("hidden");
  $("#progressLabel").textContent = "PROMPT " + promptNo;

  if (moduleKey === "note") {
    const p = notePrompt();
    sessionLast = p;
    $("#promptCaption").textContent = p.strings.length ? "FIND ON THESE STRINGS" : "FIND THIS NOTE";
    $("#promptMain").textContent = p.note;
    $("#promptSub").textContent = p.strings.length ? p.strings.map(s => `${s}번 현`).join(" · ") : "ALL STRINGS (0~15F)";
    $("#chordInfo").textContent = "제시된 음을 지판에서 찾은 뒤 정답 확인을 누르세요.";
    $("#tempoLabel").textContent = settings.time + " SEC";
    total = settings.time;
    remaining = total;
    $("#timerText").textContent = remaining.toFixed(1);
    $("#timerBar").style.width = "100%";
    runTimer();
    return;
  }

  const key = normalizeRoot(settings.key || "C");
  const scale = settings.scale || "Major";
  const deg = 1 + Math.floor(Math.random() * 7);
  const root = chordRootAt(key, deg);
  const type = moduleKey === "triad"
    ? (scale === "Major"
      ? ({ 1: "maj", 2: "m", 3: "m", 4: "maj", 5: "maj", 6: "m", 7: "dim" })[deg]
      : pick(["m", "dim", "maj", "aug"]))
    : pick(["maj7", "m7", "7", "m7b5", "maj9", "m9"]);

  const ch = triadChord(root, type);
  const strCount = settings.stringCount === "random" ? pick([3, 4]) : Number(settings.stringCount || 3);
  const inv = settings.inversion || "Random";
  sessionLast = { chord: ch, strCount, inv };

  $("#promptCaption").textContent = moduleKey === "triad" ? "FIND THIS TRIAD" : "FIND THIS VOICING";
  $("#promptMain").textContent = ch.name;
  $("#promptSub").textContent = moduleKey === "triad"
    ? `${strCount} STRINGS · INV: ${inv.toUpperCase()}`
    : `${settings.level || "BASIC SHELL"} · ${key} ${scale}`;
  $("#chordInfo").textContent = `구성음: ${chordToneNames(ch.root, ch.type).join(" - ")}`;
  $("#tempoLabel").textContent = bpm + " BPM";
}

function revealAnswer() {
  if (shownAnswer || !sessionLast) return;
  shownAnswer = true;
  clearInterval(timer);
  setAnswerButton(false);

  if (moduleKey === "note") {
    const strings = sessionLast.strings.length ? sessionLast.strings : [1, 2, 3, 4, 5, 6];
    $("#answerArea").innerHTML = renderFretboardPositions(sessionLast.note, strings);
  } else {
    const isTriad = moduleKey === "triad";
    const shape = bestShape(sessionLast.chord, {
      strings: isTriad ? [1, 2, 3, 4] : [1, 2, 3, 4, 5, 6],
      count: isTriad ? 3 : sessionLast.strCount,
      inversion: sessionLast.inv,
      isTriad,
      allowedStringSets: isTriad ? [[1, 2, 3], [2, 3, 4]] : null
    });
    $("#answerArea").innerHTML = renderShape(
      shape,
      `${sessionLast.chord.name} 운지 예시`,
      `구성음: ${chordToneNames(sessionLast.chord.root, sessionLast.chord.type).join(" · ")}`
    );
  }
  $("#answerArea").classList.remove("hidden");
}

function renderFlowStep() {
  const item = progression[progressIndex];
  if (!item) return;

  $("#progressLabel").textContent = `BAR ${item.bar} / ${progression.length}`;
  $("#tempoLabel").textContent = `${bpm} BPM · ${item.duration}박`;
  $("#promptCaption").textContent = `${item.genre.toUpperCase()} · ${item.voicing.toUpperCase()}`;
  $("#promptMain").textContent = item.name;
  $("#promptSub").textContent = `KEY ${item.key}`;
  $("#chordInfo").textContent = `구성음: ${chordToneNames(item.chord.root, item.chord.type).join(" - ")}`;

  if (toolKey === "flow") {
    $("#flowArea").innerHTML = `<div class="flow-current">실시간 전환 모드에서는 정답 지판이 숨겨집니다. 다음 코드 흐름을 보고 연주하세요.</div>`;
  } else {
    const upcoming = progression.slice(progressIndex, progressIndex + 4);
    $("#flowArea").innerHTML = `
      <div class="flow-current">현재 코드: <strong>${esc(item.name)}</strong> (${item.duration}박)</div>
      <div class="flow-next">
        ${upcoming.map((u, idx) => `<span class="flow-chip ${idx === 0 ? "current" : ""}">${u.bar}마디 ${esc(u.name)}</span>`).join("")}
      </div>
      <div class="flow-bar"><div id="flowBarFill"></div></div>
    `;
  }
}

function startFlow() {
  stopFlowLoop();
  progressIndex = 0;
  flowBeatProgress = 0;
  renderFlowStep();

  const tickMs = 60;
  flowStepTimer = setInterval(() => {
    if (paused || !progression.length) return;
    const current = progression[progressIndex];
    const barDurationMs = (60 / bpm) * 1000 * current.duration;
    flowBeatProgress += tickMs;
    const pct = Math.min(100, (flowBeatProgress / barDurationMs) * 100);
    const fill = $("#flowBarFill");
    if (fill) fill.style.width = pct + "%";

    if (flowBeatProgress >= barDurationMs) {
      flowBeatProgress = 0;
      progressIndex++;
      if (progressIndex >= progression.length) {
        stopAllSessionLoops();
        if (toolKey === "session") {
          openResultSheet();
        } else {
          startSession();
        }
        return;
      }
      renderFlowStep();
    }
  }, tickMs);
}

function openResultSheet() {
  $("#resultMeta").textContent = `Key: ${settings.key || "C"} · Genre: ${settings.genre || "Neo Soul / R&B"} · Tempo: ${bpm} BPM · Bars: ${progression.length}`;
  $("#resultSheet").innerHTML = progression.map(item => {
    const treatAsTriad = item.voicing === "Triad" || item.chord.intervals.length <= 3;
    const shape = bestShape(item.chord, {
      strings: [1, 2, 3, 4],
      count: item.voicing === "Shell" ? 2 : 3,
      isTriad: treatAsTriad,
      allowedStringSets: treatAsTriad ? [[1, 2, 3], [2, 3, 4]] : null
    });
    return `
      <div class="result-card">
        <h3>${item.bar}마디 · ${esc(item.name)}</h3>
        <small>${esc(item.voicing)} · ${item.duration}박</small>
        <div class="fretboard">${shape ? boardSvg(shape.positions) : ""}</div>
        <div class="answer-note">${shape ? esc(shape.positions.map(p => `${p.s}번현 ${p.f}F(${p.role})`).join(" · ")) : ""}</div>
      </div>
    `;
  }).join("");
  show("result");
}

function exportSheetAsPng() {
  const sheet = $("#resultSheet");
  const firstSvg = sheet.querySelector("svg");
  if (!firstSvg) {
    alert("저장할 코드표 다이어그램이 없습니다.");
    return;
  }
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(firstSvg);
  const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1240;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);

    canvas.toBlob(blob => {
      if (!blob) return;
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = `fret-lab-progression-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(dlUrl), 1500);
    }, "image/png");
  };
  img.src = url;
}

function openDictionary() {
  const isTriad = moduleKey === "triad";
  $("#dictEyebrow").textContent = moduleKey.toUpperCase() + " / DICTIONARY";
  $("#dictTitle").textContent = isTriad ? "Triad Dictionary" : "Voicing Dictionary";
  $("#dictFields").innerHTML = `
    <div class="field-row">
      <div class="field">
        <label>Root</label>
        <select id="dictRoot">${NOTES.map(n => `<option>${n}</option>`).join("")}</select>
      </div>
      <div class="field">
        <label>코드 타입</label>
        <select id="dictType">
          ${(isTriad
            ? ["maj", "m", "dim", "aug", "sus2", "sus4"]
            : ["maj7", "m7", "7", "m7b5", "maj9", "m9", "9", "13", "7b9", "7s9"]
          ).map(t => `<option value="${t}">${chordName("C", t).replace(/^C/, "") || "Major"}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>현 수</label>
        <select id="dictCount"><option value="2">2 Strings</option><option value="3" selected>3 Strings</option><option value="4">4 Strings</option></select>
      </div>
      <div class="field">
        <label>최대 프렛</label>
        <select id="dictMaxFret"><option value="7">7 Fret</option><option value="12" selected>12 Fret</option><option value="15">15 Fret</option></select>
      </div>
    </div>
  `;
  $("#dictResults").innerHTML = "";
  $("#searchDict").onclick = () => {
    const root = $("#dictRoot").value;
    const type = $("#dictType").value;
    const count = Number($("#dictCount").value);
    const maxFret = Number($("#dictMaxFret").value);
    const chord = triadChord(root, type);
    const shapes = enumerateShapes(chord, {
      strings: isTriad ? [1, 2, 3, 4] : [1, 2, 3, 4, 5, 6],
      count: isTriad ? 3 : count,
      maxFret,
      allowOmit: isTriad ? false : count < chord.intervals.length,
      isTriad,
      allowedStringSets: isTriad ? [[1, 2, 3], [2, 3, 4]] : null
    }).slice(0, 6);

    if (!shapes.length) {
      $("#dictResults").innerHTML = `<div class="dict-result"><p>조건에 맞는 운지를 찾지 못했습니다. 현 수나 최대 프렛을 변경해 보세요.</p></div>`;
      return;
    }

    $("#dictResults").innerHTML = shapes.map((sh, i) => `
      <div class="dict-result">
        <h3>${esc(chord.name)} · 형태 #${i + 1} (${sh.strings.join("-")}번 현군, ${sh.base}F~)</h3>
        <div class="fretboard">${boardSvg(sh.positions, { maxFret })}</div>
        <p>${esc(sh.positions.map(p => `${p.s}번 현 ${p.f}프렛 ${p.note}(${p.role})`).join(" · "))}</p>
      </div>
    `).join("");
  };
  $("#exitDictionary").onclick = () => show("module");
  show("dictionary");
}

function updateBpm(delta) {
  bpm = Math.max(40, Math.min(220, bpm + delta));
  $("#tempoValue").textContent = bpm;
  if (metro) startMetro();
}

$("#homeBrand").onclick = () => show("home");
$("#backHome").onclick = () => show("home");
$("#resultHome").onclick = () => show("home");
$("#exitSession").onclick = () => show("settings");
$("#restartSession").onclick = () => {
  unlockAudio();
  startSession();
};
$("#repeatSession").onclick = () => {
  unlockAudio();
  startSession();
};
$("#answerBtn").onclick = revealAnswer;
$("#nextBtn").onclick = nextFinderPrompt;
$("#pauseBtn").onclick = () => {
  paused = !paused;
  $("#pauseBtn").textContent = paused ? "▶ 재개" : "Ⅱ 일시정지";
};
$("#metroToggle").onclick = async () => {
  metro = !metro;
  $("#metroToggle").textContent = metro ? "ON" : "OFF";
  $("#metroToggle").classList.toggle("on", metro);
  if (metro) {
    await unlockAudio();
    startMetro();
  } else {
    stopMetro();
  }
};
$("#tempoDown").onclick = () => updateBpm(-5);
$("#tempoUp").onclick = () => updateBpm(5);
$("#savePng").onclick = exportSheetAsPng;
$("#printSheet").onclick = () => window.print();

document.querySelectorAll("[data-open]").forEach(btn => {
  btn.onclick = () => openModule(btn.dataset.open);
});