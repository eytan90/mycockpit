// ─── Issue types ────────────────────────────────────────────────────────────

export interface DesignIssue {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category:
    | 'hierarchy'
    | 'spacing'
    | 'consistency'
    | 'responsiveness'
    | 'accessibility'
    | 'vibe'
    | 'interaction'
    | 'layout'
    | 'typography'
    | 'color';
  description: string;
  /** e.g. "TopBar component", "Home page hero", "mobile navigation" */
  location: string;
  /** component names likely involved */
  affectedComponents: string[];
  suggestedFix: string;
}

// ─── Scores ─────────────────────────────────────────────────────────────────

export interface DesignScore {
  /** 0-10: Is hierarchy clear? One focal point? No clutter? */
  visual_clarity: number;
  /** 0-10: Colors, spacing, typography used consistently */
  consistency: number;
  /** 0-10: Works well at 390px mobile */
  responsiveness: number;
  /** 0-10: Contrast, touch targets, semantic markup */
  accessibility: number;
  /** 0-10: Matches zen/minimal/premium lab dashboard aesthetic */
  vibe_match: number;
  /** 0-10: Clear CTAs, no dead controls, good affordances */
  interaction_clarity: number;
  /** Weighted total 0-10 */
  total: number;
}

// ─── Critic report ───────────────────────────────────────────────────────────

export interface CriticReport {
  issues: DesignIssue[];
  score: DesignScore;
  summary: string;
  topPriorities: string[];
}

// ─── Code edits ──────────────────────────────────────────────────────────────

export interface CodeEdit {
  /** Absolute path to the file */
  filePath: string;
  /** Human-readable description of the change */
  description: string;
  /** Exact string to find in the file — must be unique */
  oldCode: string;
  /** Replacement string */
  newCode: string;
  /** Why this edit fixes the design issue */
  reasoning: string;
}

export interface EditPlan {
  issueId: string;
  issueSummary: string;
  edits: CodeEdit[];
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

export interface IterationSnapshot {
  iteration: number;
  timestamp: string;
  screenshotDesktop: string;
  screenshotMobile: string;
  report: CriticReport;
  editsApplied: EditPlan[];
}

export type RunMode = 'report' | 'semi-auto' | 'full-auto';

export interface OrchestratorConfig {
  mode: RunMode;
  /** URL of the running app, e.g. http://localhost:5173 */
  appUrl: string;
  maxIterations: number;
  /** Git repo root */
  projectRoot: string;
  /** Absolute path to frontend/ directory */
  frontendDir: string;
  /** Directory to write screenshots and reports into */
  screenshotDir: string;
  /** File path substrings that must never be edited */
  protectedFiles: string[];
  /** Minimum score delta to accept an iteration (full-auto mode) */
  scoreImprovementThreshold: number;
}
