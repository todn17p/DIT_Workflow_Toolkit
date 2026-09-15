"use client";

import { useMemo, useRef, useState } from "react";
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from "docx";
import type { Camera as DbCamera, Equipment, Format } from "../lib/dit-data";
import { cameras, equipment, scoringWeights, sourceNotes } from "../lib/dit-data";

const steps = ["Project Setup", "Shooting Profile", "Storage & Workflow", "Recommendation & Report"];

type ShotCamera = { id: number; cameraId: string; formatId: string; quantity: number; hours: number };
type NumberFieldProps = { value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void; label?: string; suffix?: string };

function gb(valueGB: number) {
  if (!Number.isFinite(valueGB)) return "0 GB";
  return valueGB >= 1000 ? `${(valueGB / 1000).toFixed(2)} TB` : `${valueGB.toFixed(0)} GB`;
}
function krw(value: number) { return `${Math.round(value).toLocaleString("ko-KR")}원`; }
function ceilTB(GB: number) { return Math.max(1, Math.ceil(GB / 1000)); }
function monthsSince(date: string) {
  const [y, m] = date.split("-").map(Number);
  return (2026 - y) * 12 + (9 - m);
}

function NumberField({ value, min = 0, max, step = 1, onChange, label, suffix }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const normalized = Math.max(min, max === undefined ? value : Math.min(max, value));
  const commit = (raw: string) => {
    if (raw === "") { onChange(min); setDraft(String(min)); return; }
    const n = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(n)) { setDraft(String(normalized)); return; }
    const bounded = Math.max(min, max === undefined ? n : Math.min(max, n));
    onChange(bounded);
    setDraft(String(bounded));
  };
  const display = focused ? draft : String(normalized);
  return <div className="number-field">
    {label && <label>{label}</label>}
    <div className="counter">
      <button type="button" aria-label="decrease" onClick={() => { const n = Math.max(min, normalized - step); onChange(n); setDraft(String(n)); }}>−</button>
      <input
        inputMode="decimal"
        value={display}
        onFocus={(e) => { setFocused(true); setDraft(String(normalized)); e.currentTarget.select(); }}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.]/g, "");
          if (raw === "") { setDraft(""); return; }
          if (normalized === 0 && raw.length === 2 && raw.startsWith("0")) { const trimmed = raw.slice(1); setDraft(trimmed); commit(trimmed); return; }
          setDraft(raw);
          commit(raw);
        }}
        onBlur={() => { setFocused(false); commit(draft); }}
        onKeyDown={(e) => { if (e.key === "ArrowUp") { e.preventDefault(); const n = normalized + step; onChange(n); setDraft(String(n)); } if (e.key === "ArrowDown") { e.preventDefault(); const n = Math.max(min, normalized - step); onChange(n); setDraft(String(n)); } }}
        aria-label={label}
      />
      <button type="button" aria-label="increase" onClick={() => { const n = max === undefined ? normalized + step : Math.min(max, normalized + step); onChange(n); setDraft(String(n)); }}>+</button>
      {suffix && <span>{suffix}</span>}
    </div>
  </div>;
}

function scoreEquipment(item: Equipment, requiredMBps: number, requiredTB: number, budgetKRW: number, workloadIntensity: number) {
  const capacityFit = Math.min(100, (item.capacityTB / Math.max(1, requiredTB)) * 100);
  const speedFit = Math.min(100, (item.sustainedWriteMBps / Math.max(1, requiredMBps)) * 100);
  const workflowFit = Math.round((Math.min(100, speedFit) * 0.55) + (capacityFit * 0.45));
  const performance = Math.min(100, Math.round((item.sustainedWriteMBps / 2500) * 100));
  const priceEfficiency = Math.max(35, Math.min(100, 112 - (item.priceKRW / Math.max(1, budgetKRW / Math.max(1, requiredTB))) * 20));
  const lifecycle = Math.max(50, Math.min(100, 100 - Math.max(0, monthsSince(item.launch) - 12) * 1.2));
  const overSpecPenalty = Math.max(0, ((item.sustainedWriteMBps / Math.max(1, requiredMBps)) - 2.5) * 6) * workloadIntensity;
  const raw =
    workflowFit * (scoringWeights.workflowFit / 100) +
    item.reliability * (scoringWeights.reliability / 100) +
    performance * (scoringWeights.performance / 100) +
    item.compatibility * (scoringWeights.compatibility / 100) +
    priceEfficiency * (scoringWeights.priceEfficiency / 100) +
    lifecycle * (scoringWeights.lifecycle / 100) +
    item.portability * (scoringWeights.portability / 100) - overSpecPenalty;
  return {
    ...item,
    score: Math.max(0, Math.min(100, Math.round(raw))),
    breakdown: { workflowFit, reliability: item.reliability, performance, compatibility: item.compatibility, priceEfficiency: Math.round(priceEfficiency), lifecycle: Math.round(lifecycle), portability: item.portability },
  };
}

function getCamera(id: string): DbCamera { return cameras.find((c) => c.id === id) ?? cameras[0]; }
function getFormat(cameraId: string, formatId: string): Format {
  const cam = getCamera(cameraId);
  return cam.formats.find((f) => f.id === formatId) ?? cam.formats[0];
}

export default function App() {
  const [step, setStep] = useState(0);
  const [projectName, setProjectName] = useState("Untitled DIT Project");
  const [days, setDays] = useState(5);
  const [budget, setBudget] = useState(5000000);
  const [backupSets, setBackupSets] = useState(2);
  const [shuttleTB, setShuttleTB] = useState(4);
  const [workstationSpeed, setWorkstationSpeed] = useState(1000);
  const [camerasInput, setCamerasInput] = useState<ShotCamera[]>([
    { id: 1, cameraId: "sony-fx6", formatId: "fx6-xavci-4k60", quantity: 1, hours: 3 },
    { id: 2, cameraId: "sony-fx3", formatId: "fx3-xavcs-4k60", quantity: 1, hours: 2 },
  ]);
  const reportRef = useRef<HTMLDivElement>(null);

  const dailyDataGB = useMemo(() => camerasInput.reduce((sum, shot) => {
    const f = getFormat(shot.cameraId, shot.formatId);
    return sum + (f.rateMBps * 3600 * shot.hours * shot.quantity) / 1000;
  }, 0), [camerasInput]);
  const projectDataGB = dailyDataGB * Math.max(1, days);
  const projectTB = projectDataGB / 1000;
  const peakRate = useMemo(() => camerasInput.reduce((m, shot) => Math.max(m, getFormat(shot.cameraId, shot.formatId).rateMBps), 0), [camerasInput]);
  const requiredWorkingTB = Math.max(1, Math.ceil(projectTB * 1.2));
  const requiredBackupTB = Math.max(1, Math.ceil(projectTB * Math.max(1, backupSets)));

  const driveCandidates = useMemo(() => equipment.filter((e) => e.role === "drive"), []);
  const readerCandidates = useMemo(() => equipment.filter((e) => e.role === "reader"), []);
  const recommendations = useMemo(() => driveCandidates
    .map((d) => scoreEquipment(d, Math.max(peakRate, workstationSpeed), requiredWorkingTB, budget, Math.min(2, peakRate / 1000)))
    .map((d) => ({ ...d, units: Math.max(1, Math.ceil(requiredWorkingTB / d.capacityTB)), totalCost: Math.max(1, Math.ceil(requiredWorkingTB / d.capacityTB)) * d.priceKRW }))
    .sort((a, b) => b.score - a.score), [driveCandidates, peakRate, workstationSpeed, requiredWorkingTB, budget]);
  const chosen = recommendations[0];
  const performance = recommendations.find((r) => r.interface.includes("Thunderbolt")) ?? recommendations[1] ?? chosen;
  const safety = recommendations.find((r) => r.reliability >= 94) ?? recommendations[2] ?? chosen;
  const reader = useMemo(() => {
    const media = new Set(camerasInput.map((c) => getCamera(c.cameraId).media));
    if ([...media].some((x) => x.includes("Type B"))) return readerCandidates.find((r) => r.id === "lexar-cfb-4") ?? readerCandidates[0];
    return readerCandidates.find((r) => r.id === "lexar-cfa-4") ?? readerCandidates[0];
  }, [camerasInput, readerCandidates]);

  const bom = useMemo(() => {
    const items = [
      { name: reader.name, qty: 1, cost: reader.priceKRW, reason: "카메라 기록매체와 호환되는 카드 리더" },
      { name: `${chosen.name} · Working`, qty: chosen.units, cost: chosen.units * chosen.priceKRW, reason: `${requiredWorkingTB}TB 이상 Working capacity` },
      { name: `${chosen.name} · Backup`, qty: Math.max(1, Math.ceil(requiredBackupTB / chosen.capacityTB)), cost: Math.max(1, Math.ceil(requiredBackupTB / chosen.capacityTB)) * chosen.priceKRW, reason: `${requiredBackupTB}TB Backup target` },
      { name: "Thunderbolt 4 40Gbps Certified Cable 1m", qty: chosen.interface.includes("Thunderbolt") ? 2 : 0, cost: 60000, reason: "고속 Working / Backup 링크" },
      { name: "USB-C 10Gbps Cable 1m", qty: chosen.interface.includes("USB 3.2") ? 2 : 1, cost: 18000, reason: "리더 / SSD 예비 케이블" },
    ];
    return items.filter((x) => x.qty > 0);
  }, [chosen, reader, requiredWorkingTB, requiredBackupTB]);
  const bomTotal = bom.reduce((s, x) => s + x.qty * x.cost, 0);
  const selectedSets = [chosen, performance, safety].filter((x, i, a) => x && a.findIndex((y) => y.id === x.id) === i).slice(0, 3);

  const canNext = step !== 1 || camerasInput.some((c) => c.quantity > 0 && c.hours > 0);
  const addCamera = () => {
    const base = cameras.find((c) => c.id === "sony-fx3") ?? cameras[0];
    setCamerasInput((prev) => [...prev, { id: Date.now(), cameraId: base.id, formatId: base.formats[0].id, quantity: 1, hours: 1 }]);
  };
  const updateCamera = (id: number, patch: Partial<ShotCamera>) => setCamerasInput((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));
  const removeCamera = (id: number) => setCamerasInput((prev) => prev.length === 1 ? prev.map((c) => c.id === id ? { ...c, quantity: 0, hours: 0 } : c) : prev.filter((c) => c.id !== id));

  const makeReportText = () => [
    `${projectName} · DIT Workflow Report`,
    `Project: ${days} shooting days / Budget ${krw(budget)}`,
    `Daily data: ${gb(dailyDataGB)} / Project data: ${gb(projectDataGB)}`,
    `Peak camera data rate: ${peakRate.toFixed(1)} MB/s`,
    `Recommended working capacity: ${requiredWorkingTB}TB / Backup target: ${requiredBackupTB}TB`,
    "",
    "Camera Profile",
    ...camerasInput.filter((c) => c.quantity > 0).map((c) => {
      const cam = getCamera(c.cameraId); const f = getFormat(c.cameraId, c.formatId);
      return `${c.quantity}× ${cam.name} · ${f.label} · ${c.hours}h/day · ${f.rateMBps.toFixed(1)} MB/s`;
    }),
    "",
    "Recommended System",
    ...selectedSets.map((s, i) => `${i + 1}. ${s.name} · ${s.score}/100 · ${s.interface} · ${s.units} unit(s) · ${krw(s.totalCost)}`),
    "",
    "Cable & Accessory BOM",
    ...bom.map((x) => `${x.qty}× ${x.name} · ${x.reason}`),
    `BOM subtotal: ${krw(bomTotal)}`,
    "",
    "Scoring weights",
    Object.entries(scoringWeights).map(([k, v]) => `${k}: ${v}`).join(" / "),
    "",
    ...sourceNotes,
  ].join("\n");

  const exportPdf = async () => {
    if (!reportRef.current) return;
    const html2pdf = (await import("html2pdf.js")).default;
    await html2pdf(reportRef.current).set({ margin: 10, filename: `${projectName.replace(/\s+/g, "-") || "dit-plan"}.pdf`, image: { type: "jpeg", quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: "mm", format: "a4", orientation: "portrait" } }).save();
  };

  const exportDocx = async () => {
    const rows = bom.map((x) => new TableRow({ children: [new TableCell({ children: [new Paragraph(x.name)] }), new TableCell({ children: [new Paragraph(String(x.qty))] }), new TableCell({ children: [new Paragraph(krw(x.qty * x.cost))] })] }));
    const doc = new Document({ sections: [{ children: [
      new Paragraph({ text: projectName, heading: HeadingLevel.TITLE }),
      new Paragraph({ children: [new TextRun(`촬영 ${days}일 · 예상 데이터 ${gb(projectDataGB)} · 예산 ${krw(budget)}`)] }),
      new Paragraph({ text: "카메라 프로파일", heading: HeadingLevel.HEADING_1 }),
      ...camerasInput.filter((c) => c.quantity > 0).map((c) => { const cam = getCamera(c.cameraId); const f = getFormat(c.cameraId, c.formatId); return new Paragraph(`${c.quantity}× ${cam.name} · ${f.label} · ${c.hours}h/day · ${f.rateMBps.toFixed(1)} MB/s`); }),
      new Paragraph({ text: "추천 시스템", heading: HeadingLevel.HEADING_1 }),
      ...selectedSets.map((s, i) => new Paragraph(`${i + 1}. ${s.name} · ${s.score}/100 · ${s.interface} · ${s.units}대 · ${krw(s.totalCost)}`)),
      new Paragraph({ text: "Cable & Accessory BOM", heading: HeadingLevel.HEADING_1 }),
      new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph("Item")] }), new TableCell({ children: [new Paragraph("Qty")] }), new TableCell({ children: [new Paragraph("Cost")] })] }), ...rows] }),
      new Paragraph({ text: `BOM Subtotal: ${krw(bomTotal)}` }),
      new Paragraph({ text: "Scoring weights", heading: HeadingLevel.HEADING_1 }),
      new Paragraph(Object.entries(scoringWeights).map(([k, v]) => `${k} ${v}`).join(" · ")),
      new Paragraph({ text: "Data / specification notes", heading: HeadingLevel.HEADING_1 }),
      ...sourceNotes.map((x) => new Paragraph(x)),
    ] }] });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${projectName.replace(/\s+/g, "-") || "dit-plan"}.docx`; a.click(); URL.revokeObjectURL(url);
  };

  const next = () => { if (canNext) setStep((s) => Math.min(steps.length - 1, s + 1)); };
  const previous = () => setStep((s) => Math.max(0, s - 1));

  return <div className="app">
    <header className="top"><div><div className="brand">DIT <span>WORKFLOW TOOLKIT</span></div><div className="topline">Workflow-first system planner · seeded technical database · deterministic scoring</div></div><div className="header-status"><span className="status-dot" /> Local Database Ready</div></header>
    <main className="wrap">
      <div className="steps">{steps.map((name, i) => <button key={name} className={`step ${i === step ? "active" : i < step ? "done" : ""}`} onClick={() => i <= step ? setStep(i) : undefined}><span>{String(i + 1).padStart(2, "0")}</span>{name}</button>)}</div>
      <div className="layout">
        <aside className="sidebar">
          <div className="panel sticky">
            <div className="eyebrow">PROJECT</div><h2>{projectName || "Untitled DIT Project"}</h2>
            <div className="field"><label>PROJECT NAME</label><input className="input" value={projectName} onChange={(e) => setProjectName(e.target.value)} /></div>
            <div className="field"><label>SHOOTING DAYS</label><NumberField value={days} min={1} step={1} suffix="days" onChange={setDays} /></div>
            <div className="field"><label>PLANNING BUDGET</label><NumberField value={budget} min={0} step={100000} suffix="KRW" onChange={setBudget} /></div>
            <div className="mini-grid"><div><span>DAILY</span><b>{gb(dailyDataGB)}</b></div><div><span>PROJECT</span><b>{gb(projectDataGB)}</b></div></div>
            <div className="nav-actions">{step > 0 && <button className="btn" onClick={previous}>← Previous</button>}{step < steps.length - 1 && <button className="btn primary" onClick={next} disabled={!canNext}>Next Step →</button>}</div>
          </div>
        </aside>
        <section className="content">
          {step === 0 && <div className="panel hero-panel"><div className="hero-copy"><div className="eyebrow">01 · PROJECT SETUP</div><h1>촬영 조건을 넣으면<br /><span>데이터 요구량부터 계산</span>합니다.</h1><p>카메라 수·녹화 포맷·하루 실제 REC 시간·촬영일을 기준으로 Daily / Project Data를 계산하고, 다음 단계에서 장비 시스템을 연결합니다.</p><div className="hero-actions"><button className="btn primary large" onClick={next}>Shooting Profile 시작 →</button><span className="muted">모든 값은 이 화면에서 다시 수정할 수 있습니다.</span></div></div><div className="hero-metrics"><div><span>현재 DAILY</span><strong>{gb(dailyDataGB)}</strong></div><div><span>현재 PROJECT</span><strong>{gb(projectDataGB)}</strong></div><div><span>PEAK RATE</span><strong>{peakRate.toFixed(0)}<small> MB/s</small></strong></div></div></div>}

          {step === 1 && <div className="panel"><div className="sectionhead"><div><div className="eyebrow">02 · SHOOTING PROFILE</div><h2>Camera / Recording Format</h2><p className="muted">카메라 모델이 선택되면 실제 녹화 포맷과 데이터율이 자동으로 연결됩니다.</p></div><button className="btn" onClick={addCamera}>+ Camera</button></div>
            <div className="camera-list">{camerasInput.map((shot, idx) => { const cam = getCamera(shot.cameraId); const fmt = getFormat(shot.cameraId, shot.formatId); return <div className={`camera-row ${shot.quantity === 0 ? "muted-row" : ""}`} key={shot.id}><div className="camera-label"><span>{String(idx + 1).padStart(2, "0")}</span><b>CAMERA {idx + 1}</b></div><div className="field"><label>CAMERA</label><select className="select" value={shot.cameraId} onChange={(e) => { const nextCam = getCamera(e.target.value); updateCamera(shot.id, { cameraId: nextCam.id, formatId: nextCam.formats[0].id }); }}><option value="">Select camera</option>{cameras.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.launch}</option>)}</select></div><div className="field"><label>RECORDING FORMAT</label><select className="select" value={shot.formatId} onChange={(e) => updateCamera(shot.id, { formatId: e.target.value })}>{cam.formats.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div><div><NumberField label="QTY" value={shot.quantity} min={0} max={16} step={1} onChange={(v) => updateCamera(shot.id, { quantity: v })} /></div><div><NumberField label="REC / DAY" value={shot.hours} min={0} max={24} step={0.5} suffix="h" onChange={(v) => updateCamera(shot.id, { hours: v })} /></div><button className="icon-btn" onClick={() => removeCamera(shot.id)} aria-label="remove camera">×</button><div className="spec-strip"><span>{cam.manufacturer}</span><span>{fmt.codec}</span><span>{fmt.resolution}</span><span>{fmt.fps}fps</span><span>{fmt.bitDepth}</span><span>{fmt.chroma}</span><b>{fmt.rateMBps.toFixed(1)} MB/s</b></div></div>; })}</div>
            <div className="data-callout"><div><span>CALCULATED DAILY DATA</span><strong>{gb(dailyDataGB)}</strong></div><div><span>PROJECT DATA</span><strong>{gb(projectDataGB)}</strong></div><div><span>PEAK RECORD RATE</span><strong>{peakRate.toFixed(1)} MB/s</strong></div></div>
          </div>}

          {step === 2 && <div className="stack"><div className="panel"><div className="eyebrow">03 · STORAGE & WORKFLOW</div><h2>Workflow Requirements</h2><div className="stats-grid"><div className="stat"><span>Working target</span><b>{requiredWorkingTB} TB</b><small>Project × 1.2 safety headroom</small></div><div className="stat"><span>Backup target</span><b>{requiredBackupTB} TB</b><small>{backupSets} backup set(s)</small></div><div className="stat"><span>Shuttle target</span><b>{shuttleTB} TB</b><small>Client / Post handoff</small></div><div className="stat"><span>Workstation path</span><b>{workstationSpeed.toLocaleString()} MB/s</b><small>Minimum planning throughput</small></div></div><div className="control-grid"><NumberField label="BACKUP SETS" value={backupSets} min={1} max={3} step={1} onChange={setBackupSets} /><NumberField label="SHUTTLE DRIVE" value={shuttleTB} min={1} step={1} suffix="TB" onChange={setShuttleTB} /><NumberField label="WORKSTATION THROUGHPUT" value={workstationSpeed} min={250} step={250} suffix="MB/s" onChange={setWorkstationSpeed} /></div></div><div className="panel"><div className="sectionhead"><h2>Workflow Graph</h2><span className="badge">HARD CONSTRAINTS FIRST</span></div><div className="workflow"><div><span>01</span><b>MEDIA</b><small>Camera Card</small></div><i>→</i><div><span>02</span><b>INGEST</b><small>{reader?.name ?? "Card Reader"}</small></div><i>→</i><div><span>03</span><b>WORK</b><small>{chosen.name}</small></div><i>→</i><div><span>04</span><b>BACKUP</b><small>{backupSets} copies</small></div><i>→</i><div><span>05</span><b>VERIFY</b><small>Checksum</small></div><i>→</i><div><span>06</span><b>SHUTTLE</b><small>{shuttleTB}TB target</small></div></div></div></div>}

          {step === 3 && <div className="stack"><div className="panel"><div className="sectionhead"><div><div className="eyebrow">04 · RECOMMENDATION ENGINE</div><h2>System Recommendations</h2><p className="muted">개별 제품 점수가 아니라 현재 프로젝트에 맞는 시스템 적합도를 계산합니다.</p></div><span className="badge">WEIGHTED SCORE</span></div><div className="score-legend">{Object.entries(scoringWeights).map(([k, v]) => <span key={k}>{k} <b>{v}</b></span>)}</div><div className="recommend-grid">{selectedSets.map((s, i) => <div className={`recommend ${i === 0 ? "best" : ""}`} key={s.id}><div className="option">OPTION {i + 1}</div><div className="recommend-head"><div><h3>{i === 0 ? "Balanced / Best Value" : i === 1 ? "Performance" : "Safety First"}</h3><p>{s.name}</p></div><div className="score-big">{s.score}<small>/100</small></div></div><div className="meter"><i style={{ width: `${s.score}%` }} /></div><div className="breakdown">{Object.entries(s.breakdown).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div><p className="why">{s.score >= 90 ? "현재 데이터량과 성능 요구에 대한 균형이 가장 좋습니다." : s.sustainedWriteMBps >= peakRate ? "고속 미디어와 멀티카드 ingest에서 여유가 큰 시스템입니다." : "비용을 낮추면서 기본적인 DIT 안전요건을 유지하는 선택입니다."}</p><div className="recommend-spec"><span>{s.units} × {s.capacityTB}TB</span><span>{s.interface}</span><span>{krw(s.totalCost)} 기준</span></div><p className="micro">출시 {s.launch} · 내구/신뢰도 {s.reliability} · 제조사 사양 기반</p></div>)}</div></div>

            <div className="panel"><div className="sectionhead"><div><div className="eyebrow">DATABASE MATCH</div><h2>Camera Database</h2></div><span className="badge">SOURCE-AWARE</span></div><div className="camera-db">{cameras.map((c) => <div key={c.id} className="db-card"><div className="db-top"><b>{c.name}</b><span>{c.launch}</span></div><p>{c.media}</p><div className="db-metrics"><span>Reliability <b>{c.reliability}</b></span><span>Color <b>{c.color}</b></span><span>{c.formats.length} formats</span></div><div className="db-formats">{c.formats.map((f) => <span key={f.id}>{f.label}<b>{f.rateMBps.toFixed(1)} MB/s</b></span>)}</div></div>)}</div></div>

            <div className="panel" id="report" ref={reportRef}><div className="sectionhead"><div><div className="eyebrow">REPORT</div><h2>{projectName} · DIT Plan</h2></div><div className="report-actions"><button className="btn" onClick={exportDocx}>Google Docs용 DOCX</button><button className="btn primary" onClick={exportPdf}>PDF Export</button></div></div><div className="report-grid"><div><span>Daily</span><b>{gb(dailyDataGB)}</b></div><div><span>Project</span><b>{gb(projectDataGB)}</b></div><div><span>Working</span><b>{requiredWorkingTB} TB</b></div><div><span>Backup</span><b>{requiredBackupTB} TB</b></div></div><div className="report-block"><h3>Selected System</h3>{selectedSets.map((s, i) => <div className="report-line" key={s.id}><b>{i + 1}. {s.name}</b><span>{s.score}/100 · {s.units} × {s.capacityTB}TB · {krw(s.totalCost)}</span></div>)}</div><div className="report-block"><h3>Cable & Accessory BOM</h3>{bom.map((x) => <div className="report-line" key={x.name}><b>{x.qty}× {x.name}</b><span>{x.reason} · {krw(x.qty * x.cost)}</span></div>)}<div className="report-total">BOM subtotal · {krw(bomTotal)}</div></div><div className="report-note">DOCX는 Google Docs에 업로드해 바로 편집할 수 있는 형식입니다. PDF는 브라우저에서 현재 리포트 화면을 기준으로 생성합니다. 가격은 실시간 구매가가 아닌 초기 기준가이며, 실제 발주 전 갱신해야 합니다.</div></div>
          </div>}

          <div className="footer">Seed database: Sony / ARRI / Blackmagic camera specifications · Samsung / SanDisk / OWC / Lexar / ProGrade device specifications · scoring model is project-weighted and uses price + performance + reliability + compatibility + lifecycle + portability, with an over-spec penalty.</div>
        </section>
      </div>
    </main>
  </div>;
}
