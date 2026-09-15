"use client";

import { useMemo, useRef, useState } from "react";
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from "docx";
import type { Camera as DbCamera, Equipment, Format } from "../lib/dit-data";
import { cameras, equipment, scoringWeights, sourceNotes } from "../lib/dit-data";

const steps = ["Project Setup", "Camera Selection", "Workflow Organization", "Recommendation & Report"];
type ShotCamera = { id: number; cameraId: string; formatId: string; quantity: number; hours: number };
type NumberFieldProps = { value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void; label?: string; suffix?: string };

function gb(v: number) { return v >= 1000 ? `${(v / 1000).toFixed(2)} TB` : `${Math.max(0, v).toFixed(0)} GB`; }
function krw(v: number) { return `${Math.round(v).toLocaleString("ko-KR")}원`; }
function monthsSince(date: string) { const [y, m] = date.split("-").map(Number); return Math.max(0, (2026 - y) * 12 + (9 - m)); }
function getCamera(id: string): DbCamera { return cameras.find((c) => c.id === id) ?? cameras[0]; }
function getFormat(cameraId: string, formatId: string): Format { const cam = getCamera(cameraId); return cam.formats.find((f) => f.id === formatId) ?? cam.formats[0]; }

function NumberField({ value, min = 0, max, step = 1, onChange, label, suffix }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const current = Math.max(min, max === undefined ? value : Math.min(max, value));

  const apply = (raw: string) => {
    if (raw === "") {
      onChange(min);
      setDraft(String(min));
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const bounded = Math.max(min, max === undefined ? n : Math.min(max, n));
    onChange(bounded);
    setDraft(String(bounded));
  };

  const onTextChange = (raw: string) => {
    const clean = raw.replace(/[^0-9.]/g, "");
    if (clean === "") {
      apply("");
      return;
    }
    const normalized = clean.replace(/^0+(?=\d)/, "");
    setDraft(normalized);
    apply(normalized);
  };

  const changeBy = (delta: number) => {
    const next = Math.max(min, max === undefined ? current + delta : Math.min(max, current + delta));
    onChange(next);
    setDraft(String(next));
  };

  return <div className="number-field">
    {label && <label>{label}</label>}
    <div className="counter">
      <button type="button" aria-label="decrease" onClick={() => changeBy(-step)}>−</button>
      <input
        inputMode="decimal"
        value={focused ? draft : String(current)}
        aria-label={label}
        onFocus={(e) => { setFocused(true); setDraft(String(current)); e.currentTarget.select(); }}
        onChange={(e) => onTextChange(e.target.value)}
        onBlur={() => { setFocused(false); apply(draft); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") { e.preventDefault(); changeBy(step); }
          if (e.key === "ArrowDown") { e.preventDefault(); changeBy(-step); }
        }}
      />
      <button type="button" aria-label="increase" onClick={() => changeBy(step)}>+</button>
      {suffix && <span>{suffix}</span>}
    </div>
  </div>;
}

function scoreEquipment(item: Equipment, requiredMBps: number, requiredTB: number, budgetKRW: number, intensity: number) {
  const capacityFit = Math.min(100, (item.capacityTB / Math.max(1, requiredTB)) * 100);
  const speedFit = Math.min(100, (item.sustainedWriteMBps / Math.max(1, requiredMBps)) * 100);
  const workflowFit = Math.round(speedFit * 0.55 + capacityFit * 0.45);
  const performance = Math.min(100, Math.round((item.sustainedWriteMBps / 2500) * 100));
  const budgetPerTB = budgetKRW / Math.max(1, requiredTB);
  const priceEfficiency = Math.max(35, Math.min(100, 112 - (item.priceKRW / Math.max(1, budgetPerTB)) * 20));
  const lifecycle = Math.max(50, Math.min(100, 100 - Math.max(0, monthsSince(item.launch) - 12) * 1.2));
  const overSpecPenalty = Math.max(0, (item.sustainedWriteMBps / Math.max(1, requiredMBps) - 2.5) * 6) * intensity;
  const raw = workflowFit * 0.25 + item.reliability * 0.2 + performance * 0.15 + item.compatibility * 0.15 + priceEfficiency * 0.1 + lifecycle * 0.1 + item.portability * 0.05 - overSpecPenalty;
  return {
    ...item,
    score: Math.max(0, Math.min(100, Math.round(raw))),
    breakdown: { workflowFit, reliability: item.reliability, performance, compatibility: item.compatibility, priceEfficiency: Math.round(priceEfficiency), lifecycle: Math.round(lifecycle), portability: item.portability },
  };
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

  const activeShots = shots.filter((s) => s.quantity > 0 && s.hours > 0);
  const dailyDataGB = useMemo(() => activeShots.reduce((sum, shot) => {
    const f = getFormat(shot.cameraId, shot.formatId);
    return sum + (f.rateMBps * 3600 * shot.hours * shot.quantity) / 1000;
  }, 0), [activeShots]);
  const projectDataGB = dailyDataGB * Math.max(1, days);
  const peakRate = useMemo(() => activeShots.reduce((max, shot) => Math.max(max, getFormat(shot.cameraId, shot.formatId).rateMBps), 0), [activeShots]);
  const projectTB = projectDataGB / 1000;
  const requiredWorkingTB = Math.max(1, Math.ceil(projectTB * 1.2));
  const requiredBackupTB = Math.max(1, Math.ceil(projectTB * Math.max(1, backupSets)));
  const driveCandidates = useMemo(() => equipment.filter((e) => e.role === "drive"), []);
  const readerCandidates = useMemo(() => equipment.filter((e) => e.role === "reader"), []);
  const cableCandidates = useMemo(() => equipment.filter((e) => e.role === "cable"), []);

  const recommendations = useMemo(() => driveCandidates
    .map((d) => scoreEquipment(d, Math.max(peakRate, workstationSpeed), requiredWorkingTB, budget, Math.min(2, peakRate / 1000)))
    .map((d) => ({ ...d, units: Math.max(1, Math.ceil(requiredWorkingTB / d.capacityTB)), totalCost: Math.max(1, Math.ceil(requiredWorkingTB / d.capacityTB)) * d.priceKRW }))
    .sort((a, b) => b.score - a.score), [driveCandidates, peakRate, workstationSpeed, requiredWorkingTB, budget]);

  const chosen = recommendations[0];
  const performance = recommendations.find((r) => r.interface.includes("Thunderbolt")) ?? recommendations[1] ?? chosen;
  const safety = recommendations.find((r) => r.reliability >= 94) ?? recommendations[2] ?? chosen;
  const selectedSets = [chosen, performance, safety].filter(Boolean).reduce<typeof recommendations>((out, item) => {
    if (!out.some((x) => x.id === item.id)) out.push(item);
    return out;
  }, []).slice(0, 3);

  const reader = useMemo(() => {
    const media = activeShots.map((s) => getCamera(s.cameraId).media).join(" ");
    if (media.includes("Type A")) return readerCandidates.find((r) => r.id === "lexar-cfa-4") ?? readerCandidates[0];
    if (media.includes("Type B")) return readerCandidates.find((r) => r.id === "lexar-cfb-4") ?? readerCandidates[0];
    return readerCandidates.find((r) => r.id === "prograde-cfb-sd") ?? readerCandidates[0];
  }, [activeShots, readerCandidates]);

  const cableForDrive = chosen?.interface.includes("Thunderbolt") ? cableCandidates.find((c) => c.id === "tb4-cable") : cableCandidates.find((c) => c.id === "usb-c-10g-cable");
  const bom = useMemo(() => {
    if (!chosen || !reader) return [];
    const workUnits = chosen.units;
    const backupUnits = Math.max(1, Math.ceil(requiredBackupTB / chosen.capacityTB));
    const items = [
      { name: reader.name, qty: 1, unit: reader.priceKRW, reason: "선택 기록매체 호환 리더" },
      { name: `${chosen.name} · Working`, qty: workUnits, unit: chosen.priceKRW, reason: `${requiredWorkingTB}TB 이상 Working` },
      { name: `${chosen.name} · Backup`, qty: backupUnits, unit: chosen.priceKRW, reason: `${requiredBackupTB}TB Backup target` },
      { name: cableForDrive?.name ?? "USB-C Cable", qty: 2, unit: cableForDrive?.priceKRW ?? 18000, reason: "고속 데이터 경로 및 예비 케이블" },
    ];
    return items;
  }, [chosen, reader, cableForDrive, requiredWorkingTB, requiredBackupTB]);
  const bomTotal = bom.reduce((sum, x) => sum + x.qty * x.unit, 0);

  const updateShot = (id: number, patch: Partial<ShotCamera>) => setShots((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
  const removeShot = (id: number) => setShots((prev) => prev.length === 1 ? prev.map((s) => s.id === id ? { ...s, quantity: 0, hours: 0 } : s) : prev.filter((s) => s.id !== id));
  const addShot = () => {
    const base = cameras.find((c) => c.id === "sony-fx3") ?? cameras[0];
    setShots((prev) => [...prev, { id: Date.now(), cameraId: base.id, formatId: base.formats[0].id, quantity: 1, hours: 1 }]);
    setStep(1);
  };

  const exportPdf = async () => {
    if (!reportRef.current) return;
    const html2pdf = (await import("html2pdf.js")).default;
    await html2pdf(reportRef.current).set({
      margin: 10,
      filename: `${projectName.replace(/\s+/g, "-") || "dit-plan"}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    }).save();
  };

  const exportDocx = async () => {
    if (!chosen || !reader) return;
    const rows = bom.map((x) => new TableRow({ children: [
      new TableCell({ children: [new Paragraph(x.name)] }),
      new TableCell({ children: [new Paragraph(String(x.qty))] }),
      new TableCell({ children: [new Paragraph(krw(x.qty * x.unit))] }),
    ] }));
    const doc = new Document({ sections: [{ children: [
      new Paragraph({ text: projectName, heading: HeadingLevel.TITLE }),
      new Paragraph({ children: [new TextRun(`촬영 ${days}일 · 예상 데이터 ${gb(projectDataGB)} · 예산 ${krw(budget)}`)] }),
      new Paragraph({ text: "Camera Selection", heading: HeadingLevel.HEADING_1 }),
      ...activeShots.map((s) => { const cam = getCamera(s.cameraId); const f = getFormat(s.cameraId, s.formatId); return new Paragraph(`${s.quantity}× ${cam.name} · ${f.label} · ${s.hours}h/day · ${f.rateMBps.toFixed(1)} MB/s`); }),
      new Paragraph({ text: "Workflow Organization", heading: HeadingLevel.HEADING_1 }),
      new Paragraph("Camera Media → Reader → Ingest / Checksum → Working Storage → Backup A → Backup B → Verification / Handoff"),
      new Paragraph({ text: "Recommendation", heading: HeadingLevel.HEADING_1 }),
      ...selectedSets.map((s, i) => new Paragraph(`${i + 1}. ${s.name} · ${s.score}/100 · ${s.units}대 · ${krw(s.totalCost)}`)),
      new Paragraph({ text: "Cable & Accessory BOM", heading: HeadingLevel.HEADING_1 }),
      new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph("Item")] }), new TableCell({ children: [new Paragraph("Qty")] }), new TableCell({ children: [new Paragraph("Cost")] })] }), ...rows] }),
      new Paragraph({ text: `BOM Subtotal: ${krw(bomTotal)}` }),
      new Paragraph({ text: "Scoring", heading: HeadingLevel.HEADING_1 }),
      new Paragraph(Object.entries(scoringWeights).map(([k, v]) => `${k}: ${v}%`).join(" · ")),
      new Paragraph({ text: "Notes", heading: HeadingLevel.HEADING_1 }),
      ...sourceNotes.map((x) => new Paragraph(x)),
    ] }] });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, "-") || "dit-plan"}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pageNext = () => setStep((s) => Math.min(3, s + 1));
  const pagePrev = () => setStep((s) => Math.max(0, s - 1));

  return <div className="app">
    <header className="top">
      <div><div className="brand">DIT <span>WORKFLOW TOOLKIT</span></div><div className="topline">Workflow-first system planner · camera data · storage · cable BOM · deterministic scoring</div></div>
      <div className="header-status"><span className="status-dot" /> Local Database Ready</div>
    </header>

    <main className="wrap">
      <div className="steps">
        {steps.map((name, i) => <button key={name} className={`step ${i === step ? "active" : i < step ? "done" : ""}`} onClick={() => setStep(i)}>
          <span>{String(i + 1).padStart(2, "0")}</span>{name}
        </button>)}
      </div>

      <div className="layout">
        <aside className="sidebar">
          <div className="panel sticky">
            <div className="eyebrow">PROJECT</div>
            <h2>{projectName || "Untitled DIT Project"}</h2>
            <div className="field"><label>PROJECT NAME</label><input className="input" value={projectName} onChange={(e) => setProjectName(e.target.value)} /></div>
            <div className="field"><NumberField label="SHOOTING DAYS" value={days} min={1} step={1} suffix="days" onChange={setDays} /></div>
            <div className="field"><NumberField label="PLANNING BUDGET" value={budget} min={0} step={100000} suffix="KRW" onChange={setBudget} /></div>
            <div className="mini-grid"><div><span>DAILY</span><b>{gb(dailyDataGB)}</b></div><div><span>PROJECT</span><b>{gb(projectDataGB)}</b></div></div>
            <div className="mini-grid compact"><div><span>PEAK RATE</span><b>{peakRate.toFixed(1)} MB/s</b></div><div><span>WORKING</span><b>{requiredWorkingTB} TB</b></div></div>
            <div className="nav-actions">{step > 0 && <button className="btn" onClick={pagePrev}>← Previous</button>}{step < 3 && <button className="btn primary" onClick={pageNext}>Next Step →</button>}</div>
          </div>
        </aside>

        <section className="content">
          {step === 0 && <div className="panel hero-panel">
            <div className="hero-copy">
              <div className="eyebrow">01 · PROJECT SETUP</div>
              <h1>촬영 조건을 입력하고<br /><span>실제 DIT 시스템을 조직</span>합니다.</h1>
              <p>첫 단계에서 프로젝트 조건을 넣고 바로 카메라 선택으로 이동합니다. 이후 선택한 카메라와 녹화 포맷이 데이터 요구량, 저장장치 성능, 리더, 케이블 BOM과 추천 점수에 연결됩니다.</p>
              <div className="hero-actions"><button className="btn primary large" onClick={() => setStep(1)}>카메라 선택으로 이동 →</button><span className="muted">모든 단계는 상단 Step bar에서도 바로 이동 가능</span></div>
            </div>
            <div className="hero-metrics">
              <div><span>DATABASE</span><strong>{cameras.length} Cameras</strong><small>녹화 포맷 / 미디어 포함</small></div>
              <div><span>EQUIPMENT</span><strong>{equipment.length} Items</strong><small>Drive · Reader · Cable</small></div>
              <div><span>CALCULATION</span><strong>{gb(projectDataGB)}</strong><small>현재 프로젝트 예상 데이터</small></div>
            </div>
          </div>}

          {step === 1 && <div className="stack">
            <div className="panel">
              <div className="sectionhead"><div><div className="eyebrow">02 · CAMERA SELECTION</div><h2>카메라 / 기록 포맷 / 실제 REC 시간을 선택</h2><p className="muted">카메라 모델만 선택하는 것이 아니라 실제 녹화 포맷의 codec, resolution, fps, bit depth, chroma, data rate를 함께 반영합니다.</p></div><span className="badge">{activeShots.length} active camera paths</span></div>
              <div className="camera-list">
                {shots.map((shot, index) => { const cam = getCamera(shot.cameraId); const fmt = getFormat(shot.cameraId, shot.formatId); return <div className={`camera-row ${shot.quantity <= 0 ? "muted-row" : ""}`} key={shot.id}>
                  <div className="camera-label"><span>CAM {String(index + 1).padStart(2, "0")}</span><b>{cam.manufacturer}</b></div>
                  <div className="field"><label>CAMERA</label><select className="select" value={shot.cameraId} onChange={(e) => { const next = getCamera(e.target.value); updateShot(shot.id, { cameraId: next.id, formatId: next.formats[0].id }); }}><option value="">Select</option>{cameras.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                  <div className="field"><label>RECORDING FORMAT</label><select className="select" value={shot.formatId} onChange={(e) => updateShot(shot.id, { formatId: e.target.value })}>{cam.formats.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
                  <div className="field"><NumberField label="QTY" value={shot.quantity} min={0} step={1} onChange={(v) => updateShot(shot.id, { quantity: v })} /></div>
                  <div className="field"><NumberField label="REC HOURS / DAY" value={shot.hours} min={0} max={24} step={0.5} suffix="h" onChange={(v) => updateShot(shot.id, { hours: v })} /></div>
                  <button type="button" className="icon-btn" onClick={() => removeShot(shot.id)} aria-label="remove camera">×</button>
                  <div className="spec-strip"><span>{cam.media}</span><span>{fmt.resolution}</span><span>{fmt.fps} fps</span><span>{fmt.bitDepth}</span><span>{fmt.chroma}</span><b>{fmt.rateMBps.toFixed(1)} MB/s</b></div>
                </div>; })}
              </div>
              <div className="hero-actions"><button className="btn" onClick={addShot}>+ Add Camera Path</button><span className="muted">삭제하면 마지막 1개는 0 Qty / 0h로 남아 계산에서 제외됩니다.</span></div>
              <div className="data-callout"><div><span>DAILY DATA</span><strong>{gb(dailyDataGB)}</strong></div><div><span>PROJECT DATA</span><strong>{gb(projectDataGB)}</strong></div><div><span>PEAK RECORD RATE</span><strong>{peakRate.toFixed(1)} MB/s</strong></div></div>
            </div>
            <div className="panel"><div className="sectionhead"><div><div className="eyebrow">CAMERA DATABASE</div><h2>초기 입력 DB</h2></div><span className="badge">Source-backed seed values</span></div>
              <div className="camera-db">{cameras.map((cam) => <div className="db-card" key={cam.id}><div className="db-top"><b>{cam.name}</b><span>{cam.launch}</span></div><p>{cam.media}</p><div className="db-metrics"><span>Reliability <b>{cam.reliability}</b></span><span>Color <b>{cam.color}</b></span></div><div className="db-formats">{cam.formats.map((f) => <span key={f.id}>{f.label}<b>{f.rateMBps.toFixed(1)} MB/s</b></span>)}</div></div>)}</div>
            </div>
            <div className="panel"><div className="sectionhead"><div><div className="eyebrow">NEXT</div><h2>카메라 선택이 끝났으면 Workflow Organization으로 이동</h2></div><button className="btn primary" onClick={() => setStep(2)}>Workflow Organization →</button></div></div>
          </div>}

          {step === 2 && <div className="stack">
            <div className="panel"><div className="sectionhead"><div><div className="eyebrow">03 · WORKFLOW ORGANIZATION</div><h2>선택한 카메라에서 백업/검증까지 조직도</h2><p className="muted">이 화면은 단순 장비 리스트가 아니라 실제 데이터 이동 순서를 보여주는 시스템 설계 단계입니다.</p></div><span className="badge">{gb(projectDataGB)} project load</span></div>
              <div className="workflow-diagram">
                <div className="wf-node source"><small>01 · SOURCE</small><b>{activeShots.map((s) => getCamera(s.cameraId).name).join(" + ") || "No camera"}</b><span>{activeShots.map((s) => getCamera(s.cameraId).media).join(" / ") || "기록매체 선택 필요"}</span></div>
                <i>→</i>
                <div className="wf-node"><small>02 · INGEST</small><b>{reader?.name ?? "Card Reader"}</b><span>{reader?.interface ?? "media reader"}</span></div>
                <i>→</i>
                <div className="wf-node"><small>03 · CHECKSUM</small><b>Ingest / Verify</b><span>{workstationSpeed.toLocaleString()} MB/s workstation target</span></div>
                <i>→</i>
                <div className="wf-node active-node"><small>04 · WORKING</small><b>{chosen?.name ?? "Working Storage"}</b><span>{requiredWorkingTB} TB target · {chosen?.interface ?? ""}</span></div>
                <i>→</i>
                <div className="wf-node"><small>05 · BACKUP A</small><b>Primary Backup</b><span>{requiredBackupTB} TB target</span></div>
                <i>→</i>
                <div className="wf-node"><small>06 · BACKUP B</small><b>Second Backup</b><span>독립 복제 / 검증</span></div>
                <i>→</i>
                <div className="wf-node"><small>07 · HANDOFF</small><b>Verification</b><span>Checksum report · client handoff</span></div>
              </div>
            </div>
            <div className="panel"><div className="sectionhead"><div><div className="eyebrow">STORAGE PARAMETERS</div><h2>백업과 작업환경을 시스템 계산에 반영</h2></div></div>
              <div className="control-grid">
                <div className="field"><NumberField label="BACKUP SETS" value={backupSets} min={1} max={4} step={1} onChange={setBackupSets} /></div>
                <div className="field"><NumberField label="SHUTTLE CAPACITY" value={shuttleTB} min={1} max={64} step={1} suffix="TB" onChange={setShuttleTB} /></div>
                <div className="field"><NumberField label="WORKSTATION WRITE TARGET" value={workstationSpeed} min={100} max={10000} step={100} suffix="MB/s" onChange={setWorkstationSpeed} /></div>
              </div>
              <div className="stats-grid"><div className="stat"><span>WORKING TARGET</span><b>{requiredWorkingTB} TB</b><small>프로젝트 데이터 × 1.2 headroom</small></div><div className="stat"><span>BACKUP TARGET</span><b>{requiredBackupTB} TB</b><small>{backupSets} set 기준</small></div><div className="stat"><span>SHUTTLE</span><b>{shuttleTB} TB</b><small>현장 이동 단위</small></div><div className="stat"><span>BOTTLENECK</span><b>{Math.max(peakRate, workstationSpeed).toFixed(0)} MB/s</b><small>카메라 peak vs workstation</small></div></div>
            </div>
            <div className="panel"><div className="sectionhead"><div><div className="eyebrow">CABLE DATABASE</div><h2>연결에 필요한 케이블 DB</h2><p className="muted">장비 추천과 별개로 실제 데이터 경로에 필요한 케이블을 BOM에 자동 반영합니다.</p></div></div>
              <div className="camera-db">{cableCandidates.map((c) => <div className="db-card" key={c.id}><div className="db-top"><b>{c.name}</b><span>{c.launch}</span></div><p>{c.interface}</p><div className="db-metrics"><span>Rate <b>{c.sustainedWriteMBps.toLocaleString()} MB/s</b></span><span>Price <b>{krw(c.priceKRW)}</b></span></div><div className="report-note">{c.note}</div></div>)}</div>
            </div>
            <div className="panel"><div className="sectionhead"><div><div className="eyebrow">NEXT</div><h2>Workflow가 정리되면 Recommendation & Report로 이동</h2></div><button className="btn primary" onClick={() => setStep(3)}>Recommendation & Report →</button></div></div>
          </div>}

          {step === 3 && <div className="stack" ref={reportRef}>
            <div className="panel"><div className="sectionhead"><div><div className="eyebrow">04 · RECOMMENDATION & REPORT</div><h2>{projectName}</h2><p className="muted">하드 제약을 먼저 통과한 뒤 Workflow Fit, Reliability, Performance, Compatibility, Price Efficiency, Lifecycle, Portability를 가중합합니다.</p></div><div className="report-actions"><button className="btn" onClick={exportDocx}>Export DIT Report · Google Docs</button><button className="btn primary" onClick={exportPdf}>Export DIT Report · PDF</button></div></div>
              <div className="report-grid"><div><span>SHOOTING</span><b>{days} days</b></div><div><span>DATA</span><b>{gb(projectDataGB)}</b></div><div><span>WORKING</span><b>{requiredWorkingTB} TB</b></div><div><span>PEAK</span><b>{peakRate.toFixed(1)} MB/s</b></div></div>
              <div className="score-legend">{Object.entries(scoringWeights).map(([k, v]) => <span key={k}>{k}<b>{v}%</b></span>)}</div>
            </div>
            <div className="panel"><div className="sectionhead"><div><div className="eyebrow">SYSTEM OPTIONS</div><h2>프로젝트 조건에 맞춘 3안</h2></div><span className="badge">Budget {krw(budget)}</span></div>
              <div className="recommend-grid">{selectedSets.map((r, i) => <div className={`recommend ${i === 0 ? "best" : ""}`} key={r.id}><div className="option">{i === 0 ? "BALANCED / BEST FIT" : i === 1 ? "PERFORMANCE" : "RELIABILITY"}</div><div className="recommend-head"><div><h3>{r.name}</h3><p>{r.interface}</p></div><div className="score-big">{r.score}<small>/100</small></div></div><div className="meter"><i style={{ width: `${r.score}%` }} /></div><div className="breakdown">{Object.entries(r.breakdown).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div><div className="recommend-spec"><span>{r.capacityTB}TB each</span><span>{r.sustainedWriteMBps.toLocaleString()} MB/s plan</span><span>{r.units} units</span><span>{krw(r.totalCost)}</span></div><p className="why">Score는 단일 리뷰 점수가 아니라 현재 프로젝트의 저장량, peak rate, 예산, 출시 시점과 휴대/호환 특성을 합산한 계획용 점수입니다.</p><p className="micro">{r.note}</p></div>)}</div>
            </div>
            <div className="panel"><div className="sectionhead"><div><div className="eyebrow">CABLE & ACCESSORY BOM</div><h2>추천 시스템에 필요한 실제 구성품</h2></div><span className="badge">{krw(bomTotal)} subtotal</span></div>
              <div className="report-block">{bom.map((x) => <div className="report-line" key={x.name}><b>{x.qty}× {x.name}</b><span>{x.reason} · {krw(x.qty * x.unit)}</span></div>)}<div className="report-total">BOM SUBTOTAL · {krw(bomTotal)}</div></div>
            </div>
            <div className="panel"><div className="sectionhead"><div><div className="eyebrow">FIELD FLOW</div><h2>최종 현장 운영 순서</h2></div></div><div className="workflow"><div><span>01</span><b>Card Offload</b><small>{reader?.name ?? "Reader"}</small></div><i>→</i><div><span>02</span><b>Checksum</b><small>무결성 검증</small></div><i>→</i><div><span>03</span><b>Working</b><small>{chosen?.name ?? "SSD"}</small></div><i>→</i><div><span>04</span><b>Backup A/B</b><small>{requiredBackupTB}TB target</small></div><i>→</i><div><span>05</span><b>Verify</b><small>Log / checksum</small></div><i>→</i><div><span>06</span><b>Handoff</b><small>Report + media status</small></div></div></div>
            <div className="panel report-note">Google Docs export는 브라우저에서 생성되는 DOCX 형식이며 Google Docs에 업로드해 편집할 수 있습니다. 가격은 초기 계획용 seed 값이므로 실제 구매/대여 전 최신 가격으로 갱신해야 합니다.</div>
          </div>}
        </section>
      </div>
      <div className="footer">DIT Workflow Toolkit · source-backed seed database · deterministic planning heuristic · {new Date().getFullYear()}</div>
    </main>
  </div>;
}
