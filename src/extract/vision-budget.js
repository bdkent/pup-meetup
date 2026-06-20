// Monthly spend guardrail for vision calls. A hard cap, baked into ingest, so a
// bug or runaway loop can never drain the API budget: once the month's calls hit
// the cap, ingest stops calling the model and falls back to the free text
// heuristic. The counter persists per-month in the durable state dir (committed
// to the `data` branch alongside the rest of the cursors).
//
// Default 100 calls/month ≈ $0.22/month at Haiku rates — so a $5 balance survives
// ~2 years even if the cap is hit every month. Override via VISION_MAX_CALLS_PER_MONTH.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE_PATH = fileURLToPath(new URL('../../data/state/vision-usage.json', import.meta.url));

export const defaultCap = () => Number(process.env.VISION_MAX_CALLS_PER_MONTH || 100);
export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7); // YYYY-MM

export async function loadVisionUsage(path = USAGE_PATH) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return {}; }
}

export async function saveVisionUsage(usage, path = USAGE_PATH) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(usage, null, 2) + '\n');
}

// A small per-run budget tracker over a usage record (mutated in place via record()).
export function makeVisionBudget(usage = {}, { now = new Date(), cap = defaultCap() } = {}) {
  const key = monthKey(now);
  return {
    cap,
    used: () => usage[key] || 0,
    remaining: () => Math.max(0, cap - (usage[key] || 0)),
    canSpend: () => (usage[key] || 0) < cap,
    record: () => { usage[key] = (usage[key] || 0) + 1; },
  };
}
