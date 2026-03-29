/**
 * claude-cli.ts — Routes calls through `claude -p` (stdin prompt mode).
 *
 * Images are saved to temp files and referenced by path in the prompt so
 * Claude can read them via its built-in Read tool (which handles PNG/JPG).
 * The subprocess is fully isolated from the parent Claude Code session.
 *
 * No ANTHROPIC_API_KEY needed — leverages the authenticated Claude Code session.
 */

import { spawn } from 'child_process';
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { homedir, tmpdir } from 'os';
import path from 'path';

// Resolve claude CLI — on Windows it lives as claude.cmd in the npm bin dir
const _npmBin = path.join(homedir(), 'AppData', 'Roaming', 'npm');
const _claudeCmd = existsSync(path.join(_npmBin, 'claude.cmd'))
  ? path.join(_npmBin, 'claude.cmd')
  : 'claude';
const _env = { ...process.env, PATH: _npmBin + path.delimiter + (process.env.PATH ?? '') };

let _tmpCounter = 0;

// ─── Types (mirrors Anthropic SDK surface used here) ──────────────────────────

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export type ContentBlock = TextBlock | ThinkingBlock;

export interface ResponseMessage {
  content: ContentBlock[];
  stop_reason: string;
  usage?: { input_tokens: number; output_tokens: number };
}

type ImageSource = {
  type: 'base64';
  media_type: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  data: string;
};

type UserContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: ImageSource };

export interface CreateParams {
  model: string;
  max_tokens: number;
  system?: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string | UserContentBlock[];
  }>;
  thinking?: { type: 'enabled' | 'adaptive'; budget_tokens?: number };
}

// ─── Core CLI call ────────────────────────────────────────────────────────────

/**
 * Calls `claude -p -` with the prompt via stdin.
 * Image content blocks are saved to temp files and injected into the prompt
 * as file paths so Claude reads them visually via its Read tool.
 * System prompt is prepended to the user message.
 */
async function callCLI(params: CreateParams): Promise<ResponseMessage> {
  const tempDir = path.join(tmpdir(), 'design-critic-imgs');
  mkdirSync(tempDir, { recursive: true });
  const tempFiles: string[] = [];

  try {
    // Build text prompt: system block + all message content
    const parts: string[] = [];
    if (params.system) {
      parts.push(params.system);
      parts.push('---');
    }

    for (const msg of params.messages) {
      if (typeof msg.content === 'string') {
        parts.push(msg.content);
      } else {
        for (const block of msg.content) {
          if (block.type === 'text') {
            parts.push(block.text);
          } else if (block.type === 'image') {
            // Save base64 to a temp file; reference by path in the prompt
            const ext = block.source.media_type.split('/')[1] ?? 'png';
            const tmpPath = path.join(tempDir, `img_${++_tmpCounter}.${ext}`);
            writeFileSync(tmpPath, Buffer.from(block.source.data, 'base64'));
            tempFiles.push(tmpPath);
            // Tell Claude to read the file — its Read tool handles PNG/JPG visually
            parts.push(`[Image: read this file and analyze it visually: ${tmpPath}]`);
          }
        }
      }
    }

    const prompt = parts.join('\n\n');

    const isWindows = process.platform === 'win32';
    const args = [
      '-p', '-',
      '--output-format', 'json',
      '--dangerously-skip-permissions',
      '--allowedTools', 'Read',
    ];

    return await new Promise<ResponseMessage>((resolve, reject) => {
      const proc = spawn(_claudeCmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: _env,
        shell: isWindows,
      });

      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];

      proc.stdout.on('data', (d: Buffer) => chunks.push(d));
      proc.stderr.on('data', (d: Buffer) => errChunks.push(d));

      proc.on('close', (code) => {
        const stdout = Buffer.concat(chunks).toString('utf-8').trim();
        const stderr = Buffer.concat(errChunks).toString('utf-8').trim();

        if (code !== 0) {
          reject(new Error(`claude CLI exited ${code}.\nstderr: ${stderr.slice(0, 500)}`));
          return;
        }

        // `claude -p --output-format json` returns { result: "...", session_id: "..." }
        try {
          const parsed = JSON.parse(stdout);
          if (Array.isArray(parsed.content)) {
            resolve(parsed as ResponseMessage);
            return;
          }
          const text = typeof parsed.result === 'string' ? parsed.result : stdout;
          resolve({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });
        } catch {
          resolve({ content: [{ type: 'text', text: stdout }], stop_reason: 'end_turn' });
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn claude CLI: ${err.message}`));
      });

      proc.stdin.write(prompt, 'utf-8');
      proc.stdin.end();
    });
  } finally {
    for (const f of tempFiles) {
      try { unlinkSync(f); } catch { /* ignore */ }
    }
  }
}

// ─── Client object (matches Anthropic SDK shape used in this project) ─────────

export const client = {
  messages: {
    create(params: CreateParams): Promise<ResponseMessage> {
      return callCLI(params);
    },
    stream(params: CreateParams): { finalMessage(): Promise<ResponseMessage> } {
      return { finalMessage: () => callCLI(params) };
    },
  },
};
