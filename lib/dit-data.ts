export type Format = {
  id: string;
  label: string;
  codec: string;
  resolution: string;
  fps: number;
  bitDepth: string;
  chroma: string;
  bitrateMbps: number;
  rateMBps: number;
};

export type Camera = {
  id: string;
  name: string;
  manufacturer: string;
  launch: string;
  media: string;
  reliability: number;
  color: number;
  formats: Format[];
  source: string;
};

export type Equipment = {
  id: string;
  role: "drive" | "reader" | "cable";
  name: string;
  manufacturer: string;
  capacityTB: number;
  interface: string;
  sustainedWriteMBps: number;
  reliability: number;
  compatibility: number;
  portability: number;
  priceKRW: number;
  launch: string;
  source: string;
  note: string;
};

const fx6XavcI: Format[] = [
  { id: "fx6-xavci-4k60", label: "4K DCI 60p · XAVC-I", codec: "XAVC-I", resolution: "4096×2160", fps: 59.94, bitDepth: "10-bit", chroma: "4:2:2", bitrateMbps: 600, rateMBps: 75 },
  { id: "fx6-xavci-4k24", label: "4K DCI 24p · XAVC-I", codec: "XAVC-I", resolution: "4096×2160", fps: 24, bitDepth: "10-bit", chroma: "4:2:2", bitrateMbps: 240, rateMBps: 30 },
  { id: "fx6-xavcs-4k60", label: "4K 60p · XAVC-S", codec: "XAVC-S", resolution: "3840×2160", fps: 59.94, bitDepth: "10-bit", chroma: "4:2:2", bitrateMbps: 200, rateMBps: 25 },
];

const fx3Formats: Format[] = [
  { id: "fx3-xavcsi-4k60", label: "4K DCI 60p · XAVC-SI", codec: "XAVC-SI", resolution: "4096×2160", fps: 59.94, bitDepth: "10-bit", chroma: "4:2:2", bitrateMbps: 600, rateMBps: 75 },
  { id: "fx3-xavcsi-4k24", label: "4K DCI 24p · XAVC-SI", codec: "XAVC-SI", resolution: "4096×2160", fps: 24, bitDepth: "10-bit", chroma: "4:2:2", bitrateMbps: 240, rateMBps: 30 },
  { id: "fx3-xavcs-4k60", label: "4K 60p · XAVC-S", codec: "XAVC-S", resolution: "3840×2160", fps: 59.94, bitDepth: "10-bit", chroma: "4:2:2", bitrateMbps: 200, rateMBps: 25 },
];

const alexa35Formats: Format[] = [
  { id: "alexa35-arriraw-46", label: "4.6K 3:2 Open Gate · ARRIRAW", codec: "ARRIRAW", resolution: "4608×3164", fps: 24, bitDepth: "12-bit", chroma: "RAW", bitrateMbps: 4567, rateMBps: 570.9 },
  { id: "alexa35-pr4444xq", label: "4.6K 3:2 Open Gate · ProRes 4444 XQ", codec: "ProRes 4444 XQ", resolution: "4608×3164", fps: 24, bitDepth: "12-bit", chroma: "4:4:4:4", bitrateMbps: 3140, rateMBps: 392.5 },
  { id: "alexa35-pr4444", label: "4.6K 3:2 Open Gate · ProRes 4444", codec: "ProRes 4444", resolution: "4608×3164", fps: 24, bitDepth: "12-bit", chroma: "4:4:4:4", bitrateMbps: 2100, rateMBps: 262.5 },
  { id: "alexa35-pr422hq", label: "4.6K 3:2 Open Gate · ProRes 422 HQ", codec: "ProRes 422 HQ", resolution: "4608×3164", fps: 24, bitDepth: "10-bit", chroma: "4:2:2", bitrateMbps: 1407, rateMBps: 175.8 },
];

const ursaFormats: Format[] = [
  { id: "ursa-braw-12k5", label: "12K 24p · BRAW 5:1", codec: "BRAW 5:1", resolution: "12288×6480", fps: 24, bitDepth: "12-bit", chroma: "RAW", bitrateMbps: 4624, rateMBps: 578 },
  { id: "ursa-braw-12k8", label: "12K 24p · BRAW 8:1", codec: "BRAW 8:1", resolution: "12288×6480", fps: 24, bitDepth: "12-bit", chroma: "RAW", bitrateMbps: 2888, rateMBps: 361 },
  { id: "ursa-braw-8k8", label: "8K 24p · BRAW 8:1", codec: "BRAW 8:1", resolution: "8192×4320", fps: 24, bitDepth: "12-bit", chroma: "RAW", bitrateMbps: 1288, rateMBps: 161 },
];

export const cameras: Camera[] = [
  { id: "sony-fx6", name: "Sony FX6", manufacturer: "Sony", launch: "2020-11", media: "CFexpress Type B / XQD", reliability: 92, color: 91, formats: fx6XavcI, source: "Sony FX6 Specifications / Sony Group Press" },
  { id: "sony-fx3", name: "Sony FX3", manufacturer: "Sony", launch: "2021-02", media: "CFexpress Type A / SDXC", reliability: 90, color: 90, formats: fx3Formats, source: "Sony FX3 Specifications / Sony Design" },
  { id: "arri-alexa35", name: "ARRI ALEXA 35", manufacturer: "ARRI", launch: "2022-05", media: "Codex Compact Drive", reliability: 97, color: 99, formats: alexa35Formats, source: "ARRI ALEXA 35 User Manual / Press Release" },
  { id: "blackmagic-ursa12k", name: "Blackmagic URSA Mini Pro 12K", manufacturer: "Blackmagic Design", launch: "2020-07", media: "CFast 2.0 / SD UHS-II / USB-C", reliability: 88, color: 92, formats: ursaFormats, source: "Blackmagic URSA Mini Pro Tech Specs" },
];

export const equipment: Equipment[] = [
  { id: "samsung-t7-shield-4tb", role: "drive", name: "Samsung T7 Shield 4TB", manufacturer: "Samsung", capacityTB: 4, interface: "USB 3.2 Gen 2 · 10Gbps", sustainedWriteMBps: 850, reliability: 89, compatibility: 97, portability: 96, priceKRW: 420000, launch: "2022-04", source: "Samsung official specification", note: "IP65, AES-256, 1,050/1,000 MB/s max sequential read/write" },
  { id: "sandisk-pro-g40-4tb", role: "drive", name: "SanDisk Professional PRO-G40 4TB", manufacturer: "SanDisk Professional", capacityTB: 4, interface: "Thunderbolt 3 40Gbps / USB 3.2 Gen 2", sustainedWriteMBps: 2200, reliability: 95, compatibility: 94, portability: 92, priceKRW: 980000, launch: "2022-11", source: "SanDisk official specification", note: "Up to 3,000/2,500 MB/s via Thunderbolt 3; IP68; 5-year warranty" },
  { id: "owc-envoy-pro-fx-4tb", role: "drive", name: "OWC Envoy Pro FX 4TB", manufacturer: "OWC", capacityTB: 4, interface: "Thunderbolt / USB-C", sustainedWriteMBps: 1850, reliability: 93, compatibility: 98, portability: 91, priceKRW: 900000, launch: "2021-04", source: "OWC official specification", note: "Portable SSD with Thunderbolt and USB compatibility; up to 2,800 MB/s" },
  { id: "lexar-cfa-4", role: "reader", name: "Lexar Professional Workflow CFexpress 4.0 Type A Reader", manufacturer: "Lexar", capacityTB: 0, interface: "USB4 40Gbps", sustainedWriteMBps: 2500, reliability: 91, compatibility: 94, portability: 95, priceKRW: 180000, launch: "2025-10", source: "Lexar official specification", note: "Up to 40Gbps; backwards compatible with CFexpress 2.0 Type A" },
  { id: "lexar-cfb-4", role: "reader", name: "Lexar Professional Workflow CFexpress 4.0 Type B Reader", manufacturer: "Lexar", capacityTB: 0, interface: "USB4 40Gbps", sustainedWriteMBps: 2600, reliability: 91, compatibility: 94, portability: 95, priceKRW: 190000, launch: "2025-10", source: "Lexar official specification", note: "Up to 3,300 MB/s with compatible CFexpress 4.0 media" },
  { id: "prograde-cfb-sd", role: "reader", name: "ProGrade Digital PG05.5 CFexpress Type B + SD Reader", manufacturer: "ProGrade Digital", capacityTB: 0, interface: "USB 3.2 Gen 2 · 10Gbps", sustainedWriteMBps: 1000, reliability: 90, compatibility: 93, portability: 94, priceKRW: 120000, launch: "2021-03", source: "ProGrade official specification", note: "Dual-slot CFexpress Type B and SDXC, up to 1.25GB/s" },
  { id: "tb4-cable", role: "cable", name: "Thunderbolt 4 40Gbps Certified Cable 1m", manufacturer: "Universal", capacityTB: 0, interface: "Thunderbolt 4 · USB4", sustainedWriteMBps: 3000, reliability: 95, compatibility: 97, portability: 98, priceKRW: 60000, launch: "2021-01", source: "USB-IF / Thunderbolt standard", note: "Use for high-speed drive-to-workstation paths" },
  { id: "usb-c-10g-cable", role: "cable", name: "USB-C 10Gbps Cable 1m", manufacturer: "Universal", capacityTB: 0, interface: "USB 3.2 Gen 2", sustainedWriteMBps: 900, reliability: 94, compatibility: 98, portability: 98, priceKRW: 18000, launch: "2020-01", source: "USB-IF / USB 3.2 standard", note: "Baseline cable for USB 10Gbps readers and SSDs" },
];

export const scoringWeights = {
  workflowFit: 25,
  reliability: 20,
  performance: 15,
  compatibility: 15,
  priceEfficiency: 10,
  lifecycle: 10,
  portability: 5,
};

export const sourceNotes = [
  "Sony FX6: XAVC-I DCI/QFHD 59.94p max 600Mbps, 50p 500Mbps, 24p 240Mbps.",
  "Sony FX3: XAVC S-I DCI 4K 59.94p 600Mbps and 24p 240Mbps.",
  "ARRI ALEXA 35: official 4.6K Open Gate 24fps recording-time tables used to derive planning data rates.",
  "Blackmagic URSA Mini Pro 12K: 12K BRAW 5:1 578MB/s, 8:1 361MB/s; 8K BRAW 8:1 161MB/s at 24fps.",
  "Storage performance values use manufacturer maximums where available, with a conservative sustained-write planning estimate for scoring.",
  "Prices are initial planning estimates in KRW, not live checkout prices. Refresh before a real purchase or rental decision.",
];
