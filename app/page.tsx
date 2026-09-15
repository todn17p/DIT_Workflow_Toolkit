"use client";

import { useMemo, useRef, useState } from "react";
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from "docx";
import type { Camera as DbCamera, Equipment, Format } from "../lib/dit-data";
import { cameras, equipment, scoringWeights, sourceNotes } from "../lib/dit-data";

const steps = ["Project Setup", "Shooting Profile", "Storage & Workflow", "Recommendation & Report"];
type ShotCamera = { id: number; cameraId: string; formatId: string; quantity: number; hours: number };
type NumberFieldProps = { value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void; label?: string; suffix?: string };

function gb(v: number) { return v >= 1000 ? `${(v / 1000).toFixed(2)} TB` : `${v.toFixed(0)} GB`; }
function krw(v: number) { return `${Math.round(v).toLocaleString("ko-KR")}원`; }
function monthsSince(date: string) { const [y, m] = date.split("-").map(Number); return (2026 - y) * 12 + (9 - m); }
function getCamera(id: string): DbCamera { return cameras.find((c) => c.id === id) ?? cameras[0]; }
function getFormat(cameraId: string, formatId: string): Format { const cam = getCamera(cameraId); return cam.formats.find((f) => f.id === formatId) ?? cam.formats[0]; }

function NumberField({ value, min = 0, max, step = 1, onChange, label, suffix }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const current = Math.max(min, max === undefined ? value : Math.min(max, value));
  const commit = (raw: string) => {
    if (raw === "") { onChange(min); setDraft(String(min)); return; }
    const n = Number(raw);
    if (!Number.isFinite(n)) { setDraft(String(current)); return; }
    const bounded = Math.max(min, max === undefined ? n : Math.min(max, n));
    onChange(bounded); setDraft(String(bounded));
  };
  return <div className="number-field">
    {label && <label>{label}</label>}
    <div className="counter">
      <button type="button" onClick={() => { const n = Math.max(min, current - step); onChange(n); setDraft(String(n)); }}>−</button>
      <input inputMode="decimal" value={focused ? draft : String(current)} aria-label={label} onFocus={(e) => { setFocused(true); setDraft(String(current)); e.currentTarget.select(); }} onChange={(e) => { const raw = e.target.value.replace(/[^0-9.]/g, ""); if (raw === "") { onChange(min); setDraft(String(min)); return; } if (current === 0 && raw.startsWith("0") && raw.length > 1) { commit(raw.slice(1)); return; } setDraft(raw); commit(raw); }} onBlur={() => { setFocused(false); commit(draft); }} onKeyDown={(e) => { if (e.key === "ArrowUp") { e.preventDefault(); const n = max === undefined ? current + step : Math.min(max, current + step); onChange(n); setDraft(String(n)); } if (e.key === "ArrowDown") { e.preventDefault(); const n = Math.max(min, current - step); onChange(n); setDraft(String(n)); } }} />
      <button type="button" onClick={() => { const n = max === undefined ? current + step : Math.min(max, current + step); onChange(n); setDraft(String(n)); }}>+</button>
      {suffix && <span>{suffix}</span>}
    </div>
  </div>;
}

function scoreEquipment(item: Equipment, requiredMBps: number, requiredTB: number, budgetKRW: number, intensity: number) {
  const capacityFit = Math.min(100, item.capacityTB / Math.max(1, requiredTB) * 100);
  const speedFit = Math.min(100, item.sustainedWriteMBps / Math.max(1, requiredMBps) * 100);
  const workflowFit = Math.round(speedFit * 0.55 + capacityFit * 0.45);
  const performance = Math.min(100, Math.round(item.sustainedWriteMBps / 2500 * 100));
  const budgetPerTB = budgetKRW / Math.max(1, requiredTB);
  const priceEfficiency = Math.max(35, Math.min(100, 112 - item.priceKRW / Math.max(1, budgetPerTB) * 20));
  const lifecycle = Math.max(50, Math.min(100, 100 - Math.max(0, monthsSince(item.launch) - 12) * 1.2));
  const overSpecPenalty = Math.max(0, (item.sustainedWriteMBps / Math.max(1, requiredMBps) - 2.5) * 6) * intensity;
  const score = workflowFit * .25 + item.reliability * .20 + performance * .15 + item.compatibility * .15 + priceEfficiency * .10 + lifecycle * .10 + item.portability * .05 - overSpecPenalty;
  return { ...item, score: Math.max(0, Math.min(100, Math.round(score))), breakdown: { workflowFit, reliability: item.reliability, performance, compatibility: item.compatibility, priceEfficiency: Math.round(priceEfficiency), lifecycle: Math.round(lifecycle), portability: item.portability } };
}

export default function App() {
  const [step, setStep] = useState(0);
  const [projectName, setProjectName] = useState("Untitled DIT Project");
  const [days, setDays] = useState(5);
  const [budget, setBudget] = useState(5000000);
  const [backupSets, setBackupSets] = useState(2);
  const [shuttleTB, setShuttleTB] = useState(4);
  const [workstationSpeed, setWorkstationSpeed] = useState(1000);
  const [shots, setShots] = useState<ShotCamera[]>([
    { id: 1, cameraId: "sony-fx6", formatId: "fx6-xavci-4k60", quantity: 1, hours: 3 },
    { id: 2, cameraId: "sony-fx3", formatId: "fx3-xavcs-4k60", quantity: 1, hours: 2 },
  ]);
  const reportRef = useRef<HTMLDivElement>(null);

  const dailyDataGB = useMemo(() => shots.reduce((sum, shot) => { const f = getFormat(shot.cameraId, shot.formatId); return sum + f.rateMBps * 3600 * shot.hours * shot.quantity / 1000; }, 0), [shots]);
  const projectDataGB = dailyDataGB * Math.max(1, days);
  const peakRate = useMemo(() => shots.reduce((max, shot) => Math.max(max, getFormat(shot.cameraId, shot.formatId).rateMBps), 0), [shots]);
  const projectTB = projectDataGB / 1000;
  const requiredWorkingTB = Math.max(1, Math.ceil(projectTB * 1.2));
  const requiredBackupTB = Math.max(1, Math.ceil(projectTB * backupSets));
  const driveCandidates = useMemo(() => equipment.filter((e) => e.role === "drive"), []);
  const readers = useMemo(() => equipment.filter((e) => e.role === "reader"), []);
  const recommendations = useMemo(() => driveCandidates.map((d) => scoreEquipment(d, Math.max(peakRate, workstationSpeed), requiredWorkingTB, budget, Math.min(2, peakRate / 1000))).map((d) => ({ ...d, units: Math.max(1, Math.ceil(requiredWorkingTB / d.capacityTB)), totalCost: Math.max(1, Math.ceil(requiredWorkingTB / d.capacityTB)) * d.priceKRW })).sort((a, b) => b.score - a.score), [driveCandidates, peakRate, workstationSpeed, requiredWorkingTB, budget]);
  const chosen = recommendations[0];
  const performance = recommendations.find((r) => r.interface.includes("Thunderbolt")) ?? recommendations[1] ?? chosen;
  const safety = recommendations.find((r) => r.reliability >= 94) ?? recommendations[2] ?? chosen;
  const selectedSets = [chosen, performance, safety].filter((x): x is NonNullable<typeof chosen> => Boolean(x)).reduce<typeof recommendations>((out, item) => { if (!out.some((x) => x.id === item.id)) out.push(item); return out; }, []).slice(0, 3);
  const reader = useMemo(() => { const media = shots.map((s) => getCamera(s.cameraId).media).join(" "); return media.includes("Type A") ? (readers.find((r) => r.id === "lexar-cfa-4") ?? readers[0]) : (readers.find((r) => r.id === "lexar-cfb-4") ?? readers[0]); }, [shots, readers]);
  const bom = useMemo(() => {
    if (!chosen || !reader) return [];
    const backupUnits = Math.max(1, Math.ceil(requiredBackupTB / chosen.capacityTB));
    return [
      { name: reader.name, qty: 1, unit: reader.priceKRW, reason: "선택한 기록매체와 호환되는 카드 리더" },
      { name: `${chosen.name} · Working`, qty: chosen.units, unit: chosen.priceKRW, reason: `${requiredWorkingTB}TB 이상 Working capacity` },
      { name: `${chosen.name} · Backup`, qty: backupUnits, unit: chosen.priceKRW, reason: `${requiredBackupTB}TB Backup target` },
      { name: "Thunderbolt 4 40Gbps Certified Cable 1m", qty: chosen.interface.includes("Thunderbolt") ? 2 : 0, unit: 60000, reason: "고속 Working / Backup 링크" },
      { name: "USB-C 10Gbps Cable 1m", qty: 2, unit: 18000, reason: "리더 / SSD 예비 케이블" },
    ].filter((x) => x.qty > 0);
  }, [chosen, reader, requiredWorkingTB, requiredBackupTB]);
  const bomTotal = bom.reduce((sum, x) => sum + x.qty * x.unit, 0);
  const canNext = step !== 1 || shots.some((s) => s.quantity > 0 && s.hours > 0);

  const updateShot = (id: number, patch: Partial<ShotCamera>) => setShots((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
  const removeShot = (id: number) => setShots((prev) => prev.length === 1 ? prev.map((s) => s.id === id ? { ...s, quantity: 0, hours: 0 } : s) : prev.filter((s) => s.id !== id));
  const addShot = () => { const base = cameras.find((c) => c.id === "sony-fx3") ?? cameras[0]; setShots((prev) => [...prev, { id: Date.now(), cameraId: base.id, formatId: base.formats[0].id, quantity: 1, hours: 1 }]); };

  const exportPdf = async () => { if (!reportRef.current) return; const html2pdf = (await import("html2pdf.js")).default; await html2pdf(reportRef.current).set({ margin: 10, filename: `${projectName.replace(/\s+/g, "-") || "dit-plan"}.pdf`, image: { type: "jpeg", quality: .98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: "mm", format: "a4", orientation: "portrait" } }).save(); };
  const exportDocx = async () => {
    if (!chosen || !reader) return;
    const bomRows = bom.map((x) => new TableRow({ children: [new TableCell({ children: [new Paragraph(x.name)] }), new TableCell({ children: [new Paragraph(String(x.qty))] }), new TableCell({ children: [new Paragraph(krw(x.qty * x.unit))] })] }));
    const doc = new Document({ sections: [{ children: [
      new Paragraph({ text: projectName, heading: HeadingLevel.TITLE }),
      new Paragraph({ children: [new TextRun(`촬영 ${days}일 · 예상 데이터 ${gb(projectDataGB)} · 예산 ${krw(budget)}`)] }),
      new Paragraph({ text: "카메라 프로파일", heading: HeadingLevel.HEADING_1 }),
      ...shots.filter((s) => s.quantity > 0).map((s) => { const cam = getCamera(s.cameraId); const f = getFormat(s.cameraId, s.formatId); return new Paragraph(`${s.quantity}× ${cam.name} · ${f.label} · ${s.hours}h/day · ${f.rateMBps.toFixed(1)} MB/s`); }),
      new Paragraph({ text: "추천 시스템", heading: HeadingLevel.HEADING_1 }),
      ...selectedSets.map((s, i) => new Paragraph(`${i + 1}. ${s.name} · ${s.score}/100 · ${s.units}대 · ${krw(s.totalCost)}`)),
      new Paragraph({ text: "Cable & Accessory BOM", heading: HeadingLevel.HEADING_1 }),
      new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph("Item")] }), new TableCell({ children: [new Paragraph("Qty")] }), new TableCell({ children: [new Paragraph("Cost")] })] }), ...bomRows] }),
      new Paragraph({ text: `BOM Subtotal: ${krw(bomTotal)}` }),
      new Paragraph({ text: "Scoring weights", heading: HeadingLevel.HEADING_1 }),
      new Paragraph(Object.entries(scoringWeights).map(([k, v]) => `${k} ${v}`).join(" · ")),
      new Paragraph({ text: "Data / specification notes", heading: HeadingLevel.HEADING_1 }),
      ...sourceNotes.map((x) => new Paragraph(x)),
    ] }] });
    const blob = await Packer.toBlob(doc); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${projectName.replace(/\s+/g, "-") || "dit-plan"}.docx`; a.click(); URL.revokeObjectURL(url);
  };

  return <div className="app">
    <header className="top"><div><div className="brand">DIT <span>WORKFLOW TOOLKIT</span></div><div className="topline">Workflow-first system planner · seeded technical database · deterministic scoring</div></div><div className="header-status"><span className="status-dot" /> Local Database Ready</div></header>
    <main className="wrap">
      <div className="steps">{steps.map((name, i) => <button key={name} className={`step ${i === step ? "active" : i < step ? "done" : ""}`} onClick={() => i <= step && setStep(i)}><span>{String(i + 1).padStart(2, "0")}</span>{name}</button>)}</div>
      <div className="layout"><aside className="sidebar"><div className="panel sticky"><div className="eyebrow">PROJECT</div><h2>{projectName || "Untitled DIT Project"}</h2><div className="field"><label>PROJECT NAME</label><input className="input" value={projectName} onChange={(e) => setProjectName(e.target.value)} /></div><div className="field"><NumberField label="SHOOTING DAYS" value={days} min={1} step={1} suffix="days" onChange={setDays} /></div><div className="field"><NumberField label="PLANNING BUDGET" value={budget} min={0} step={100000} suffix="KRW" onChange={setBudget} /></div><div className="mini-grid"><div><span>DAILY</span><b>{gb(dailyDataGB)}</b></div><div><span>PROJECT</span><b>{gb(projectDataGB)}</b></div></div><div className="nav-actions">{step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>← Previous</button>}{step < 3 && <button className="btn primary" onClick={() => canNext && setStep(step + 1)} disabled={!canNext}>Next Step →</button>}</div></div></aside>
        <section className="content">
          {step === 0 && <div className="panel hero-panel"><div className="hero-copy"><div className="eyebrow">01 · PROJECT SETUP</div><h1>촬영 조건을 넣으면<br /><span>데이터 요구량부터 계산</span>합니다.</h1><p>카메라 수량·녹화 포맷·하루 실제 REC 시간·촬영일을 기준으로 Daily / Project Data를 계산하고, 이후 장비 시스템과 케이블까지 연결합니다.</p><div className="hero-actions"><button className="btn primary large" onClick={() => setStep(1)}>Shooting Profile 시작 →</button><span className="muted">초기값은 예시 프로젝트로 설정되어 있습니다.</span></div></div><div className="hero-metrics"><div><span>DAILY DATA</span><strong>{gb(dailyDataGB)}</strong></div><div><span>PROJECT DATA</span><strong>{gb(projectDataGB)}</strong></div><div><span>PEAK RATE</span><strong>{peakRate.toFixed(0)}<small> MB/s</small></strong></div></div></div>}
          {step === 1 && <div className="panel"><div className="sectionhead"><div><div className="eyebrow">02 · SHOOTING PROFILE</div><h2>Camera / Recording Format</h2><p className="muted">카메라 모델을 선택하면 실제 녹화 포맷·비트레이트·데이터율이 연결됩니다.</p></div><button className="btn" onClick={addShot}>+ Camera</button></div><div className="camera-list">{shots.map((shot, i) => { const cam = getCamera(shot.cameraId); const f = getFormat(shot.cameraId, shot.formatId); return <div className={`camera-row ${shot.quantity === 0 ? "muted-row" : ""}`} key={shot.id}><div className="camera-label"><span>{String(i + 1).padStart(2, "0")}</span><b>CAMERA {i + 1}</b></div><div className="field"><label>CAMERA</label><select className="select" value={shot.cameraId} onChange={(e) => { const next = getCamera(e.target.value); updateShot(shot.id, { cameraId: next.id, formatId: next.formats[0].id }); }}>{cameras.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.launch}</option>)}</select></div><div className="field"><label>RECORDING FORMAT</label><select className="select" value={shot.formatId} onChange={(e) => updateShot(shot.id, { formatId: e.target.value })}>{cam.formats.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div><NumberField label="QTY" value={shot.quantity} min={0} max={16} step={1} onChange={(v) => updateShot(shot.id, { quantity: v })} /><NumberField label="REC / DAY" value={shot.hours} min={0} max={24} step={.5} suffix="h" onChange={(v) => updateShot(shot.id, { hours: v })} /><button className="icon-btn" onClick={() => removeShot(shot.id)} aria-label="remove camera">×</button><div className="spec-strip"><span>{cam.manufacturer}</span><span>{f.codec}</span><span>{f.resolution}</span><span>{f.fps}fps</span><span>{f.bitDepth}</span><span>{f.chroma}</span><b>{f.rateMBps.toFixed(1)} MB/s</b></div></div>; })}</div><div className="data-callout"><div><span>DAILY DATA</span><strong>{gb(dailyDataGB)}</strong></div><div><span>PROJECT DATA</span><strong>{gb(projectDataGB)}</strong></div><div><span>PEAK RECORD RATE</span><strong>{peakRate.toFixed(1)} MB/s</strong></div></div></div>}
          {step === 2 && <div className="stack"><div className="panel"><div className="eyebrow">03 · STORAGE & WORKFLOW</div><h2>Workflow Requirements</h2><div className="stats-grid"><div className="stat"><span>Working target</span><b>{requiredWorkingTB} TB</b><small>Project × 1.2 headroom</small></div><div className="stat"><span>Backup target</span><b>{requiredBackupTB} TB</b><small>{backupSets} backup set(s)</small></div><div className="stat"><span>Shuttle target</span><b>{shuttleTB} TB</b><small>Client / Post handoff</small></div><div className="stat"><span>Workstation path</span><b>{workstationSpeed.toLocaleString()} MB/s</b><small>Minimum planning throughput</small></div></div><div className="control-grid"><NumberField label="BACKUP SETS" value={backupSets} min={1} max={3} step={1} onChange={setBackupSets} /><NumberField label="SHUTTLE DRIVE" value={shuttleTB} min={1} step={1} suffix="TB" onChange={setShuttleTB} /><NumberField label="WORKSTATION THROUGHPUT" value={workstationSpeed} min={250} step={250} suffix="MB/s" onChange={setWorkstationSpeed} /></div></div><div className="panel"><div className="sectionhead"><h2>Workflow Graph</h2><span className="badge">HARD CONSTRAINTS FIRST</span></div><div className="workflow"><div><span>01</span><b>MEDIA</b><small>Camera Card</small></div><i>→</i><div><span>02</span><b>INGEST</b><small>{reader?.name ?? "Card Reader"}</small></div><i>→</i><div><span>03</span><b>WORK</b><small>{chosen?.name ?? "Working Drive"}</small></div><i>→</i><div><span>04</span><b>BACKUP</b><small>{backupSets} copies</small></div><i>→</i><div><span>05</span><b>VERIFY</b><small>Checksum</small></div><i>→</i><div><span>06</span><b>SHUTTLE</b><small>{shuttleTB}TB target</small></div></div></div></div>}
          {step === 3 && <div className="stack"><div className="panel"><div className="sectionhead"><div><div className="eyebrow">04 · RECOMMENDATION ENGINE</div><h2>System Recommendations</h2><p className="muted">평가 기준은 Workflow Fit, Reliability, Performance, Compatibility, Price Efficiency, Lifecycle, Portability이며 과도한 고사양에는 패널티를 적용합니다.</p></div><span className="badge">WEIGHTED SCORE</span></div><div className="score-legend">{Object.entries(scoringWeights).map(([k, v]) => <span key={k}>{k} <b>{v}</b></span>)}</div><div className="recommend-grid">{selectedSets.map((s, i) => <div className={`recommend ${i === 0 ? "best" : ""}`} key={s.id}><div className="option">OPTION {i + 1}</div><div className="recommend-head"><div><h3>{i === 0 ? "Balanced / Best Value" : i === 1 ? "Performance" : "Safety First"}</h3><p>{s.name}</p></div><div className="score-big">{s.score}<small>/100</small></div></div><div className="meter"><i style={{ width: `${s.score}%` }} /></div><div className="breakdown">{Object.entries(s.breakdown).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div><p className="why">{s.sustainedWriteMBps >= peakRate ? "현재 최대 기록 속도를 충분히 커버합니다." : "현재 프로젝트에서 병목 가능성이 있어 보조 경로 또는 상위 인터페이스가 필요합니다."}</p><div className="recommend-spec"><span>{s.units} × {s.capacityTB}TB</span><span>{s.interface}</span><span>{krw(s.totalCost)} 기준</span></div><p className="micro">출시 {s.launch} · 신뢰도 {s.reliability} · 제조사 사양 기반</p></div>)}</div></div>
          <div className="panel"><div className="sectionhead"><div><div className="eyebrow">CAMERA DATABASE</div><h2>초기 카메라 데이터</h2></div><span className="badge">SOURCE-AWARE</span></div><div className="camera-db">{cameras.map((c) => <div className="db-card" key={c.id}><div className="db-top"><b>{c.name}</b><span>{c.launch}</span></div><p>{c.media}</p><div className="db-metrics"><span>Reliability <b>{c.reliability}</b></span><span>Color <b>{c.color}</b></span><span>{c.formats.length} formats</span></div><div className="db-formats">{c.formats.map((f) => <span key={f.id}>{f.label}<b>{f.rateMBps.toFixed(1)} MB/s</b></span>)}</div></div>)}</div></div>
          <div className="panel" id="report" ref={reportRef}><div className="sectionhead"><div><div className="eyebrow">REPORT</div><h2>{projectName} · DIT Plan</h2></div><div className="report-actions"><button className="btn" onClick={exportDocx}>Google Docs용 DOCX</button><button className="btn primary" onClick={exportPdf}>PDF Export</button></div></div><div className="report-grid"><div><span>DAILY</span><b>{gb(dailyDataGB)}</b></div><div><span>PROJECT</span><b>{gb(projectDataGB)}</b></div><div><span>WORKING</span><b>{requiredWorkingTB} TB</b></div><div><span>BACKUP</span><b>{requiredBackupTB} TB</b></div></div><div className="report-block"><h3>Selected System</h3>{selectedSets.map((s, i) => <div className="report-line" key={s.id}><b>{i + 1}. {s.name}</b><span>{s.score}/100 · {s.units} × {s.capacityTB}TB · {krw(s.totalCost)}</span></div>)}</div><div className="report-block"><h3>Cable & Accessory BOM</h3>{bom.map((x) => <div className="report-line" key={x.name}><b>{x.qty}× {x.name}</b><span>{x.reason} · {krw(x.qty * x.unit)}</span></div>)}<div className="report-total">BOM subtotal · {krw(bomTotal)}</div></div><div className="report-note">Google Docs 버튼은 편집 가능한 DOCX를 생성합니다. Google Docs에서 업로드하면 문서로 바로 편집할 수 있습니다. PDF는 현재 리포트 화면을 기준으로 생성됩니다. 가격은 초기 기준가이며 실제 구매·렌탈 전 갱신해야 합니다.</div></div></div>}
          <div className="footer">Seed database: Sony / ARRI / Blackmagic camera specifications · Samsung / SanDisk / OWC / Lexar / ProGrade device specifications. Scoring is project-weighted and source-aware.</div>
        </section>
      </div>
    </main>
  </div>;
}
