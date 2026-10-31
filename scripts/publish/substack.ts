import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Status } from './site.ts';

const PYTHON = path.join(import.meta.dirname, '.venv/bin/python');
const SCRIPT = path.join(import.meta.dirname, 'substack_bridge.py');

export interface SubstackDraft {
  status: Exclude<Status, 'undrafted'> | 'missing';
  draft_id: number;
  url: string;
  revision?: string;
  skipped?: string;
}

export interface UpsertRequest {
  title: string;
  subtitle: string;
  slug: string;
  markdown: string;
  draft_id?: number;
  revision?: string;
  force?: boolean;
}

export const upsertDraft = (request: UpsertRequest) => call<SubstackDraft>({ action: 'upsert', ...request });

export const draftStatuses = (draftIds: number[]) =>
  call<{ results: Record<string, SubstackDraft> }>({ action: 'status', draft_ids: draftIds }).results;

function call<T>(request: object): T {
  if (!existsSync(PYTHON)) throw new Error('Substack tooling missing. Run `pnpm publish:setup` first.');
  const run = spawnSync(PYTHON, [SCRIPT], { input: JSON.stringify(request), encoding: 'utf8' });
  if (run.error) throw run.error;
  let response: { ok: boolean; error?: string } & T;
  try {
    response = JSON.parse(run.stdout.trim().split('\n').at(-1) ?? '');
  } catch {
    throw new Error(`Substack helper failed: ${run.stderr || run.stdout}`);
  }
  if (!response.ok) throw new Error(response.error);
  return response;
}
