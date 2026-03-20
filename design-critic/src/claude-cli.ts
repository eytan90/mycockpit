/**
 * claude-cli.ts — Drop-in replacement for `new Anthropic()` that routes all
 * API calls through the `claude api messages create` CLI subcommand.
 *
 * This means no ANTHROPIC_API_KEY is needed — the CLI uses the already-open
 * authenticated session from the running Claude Code instance.
 *
 * Mimics the subset of the Anthropic SDK used by this project:
 *   client.messages.create(params)   → Promise<ResponseMessage>
 *   client.messages.stream(params)   → { finalMessage(): Promise<ResponseMessage> }
 */

import { spawn } from 'child_process';

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
 * Pipes `params` as JSON to `claude api messages create` and returns the
 * parsed response. Handles large payloads (base64 images) via spawn stdio.
 */
async function callCLI(params: CreateParams): Promise<ResponseMessage> {
  // adaptive thinking → enabled with a sensible budget
  const body: Record<string, unknown> = { ...params };
  if (params.thinking?.type === 'adaptive') {
    body.thinking = { type: 'enabled', budget_tokens: 8000 };
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['api', 'messages', 'create'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.stderr.on('data', (d: Buffer) => errChunks.push(d));

    proc.on('close', (code) => {
      const stdout = Buffer.concat(chunks).toString('utf-8');
      const stderr = Buffer.concat(errChunks).toString('utf-8');

      if (code !== 0) {
        reject(
          new Error(
            `claude CLI exited with code ${code}.\nstderr: ${stderr.slice(0, 500)}`,
          ),
        );
        return;
      }

      try {
        resolve(JSON.parse(stdout) as ResponseMessage);
      } catch {
        reject(
          new Error(
            `Failed to parse claude CLI response as JSON.\n` +
              `stdout preview: ${stdout.slice(0, 400)}`,
          ),
        );
      }
    });

    proc.on('error', (err) => {
      reject(
        new Error(
          `Failed to spawn claude CLI. Is it installed and in PATH?\n${err.message}`,
        ),
      );
    });

    const payload = JSON.stringify(body);
    proc.stdin.write(payload, 'utf-8');
    proc.stdin.end();
  });
}

// ─── Client object (matches Anthropic SDK shape used in this project) ─────────

export const client = {
  messages: {
    /** Non-streaming call. */
    create(params: CreateParams): Promise<ResponseMessage> {
      return callCLI(params);
    },

    /**
     * Streaming-style call — the claude CLI doesn't stream in our usage,
     * so we just return an object with `finalMessage()` that resolves the
     * whole response at once.
     */
    stream(params: CreateParams): { finalMessage(): Promise<ResponseMessage> } {
      return {
        finalMessage: () => callCLI(params),
      };
    },
  },
};
