/**
 * Observer — captures screenshots and DOM snapshots using Playwright.
 *
 * Takes desktop (1440×900) and mobile (390×844) screenshots, extracts an
 * abbreviated DOM tree, and lists interactive elements with their bounds.
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

export interface InteractiveElement {
  tag: string;
  text: string;
  ariaLabel?: string;
  bounds: { x: number; y: number; width: number; height: number };
  isVisible: boolean;
  hasClickHandler: boolean;
}

export interface ObserverResult {
  desktopScreenshotPath: string;
  mobileScreenshotPath: string;
  /** PNG as base64, ready for Claude vision */
  desktopScreenshotBase64: string;
  mobileScreenshotBase64: string;
  /** Abbreviated DOM tree (≤8000 chars) */
  domSnapshot: string;
  /** Up to 50 interactive elements with layout measurements */
  interactiveElements: InteractiveElement[];
  /** Current page title and URL */
  pageInfo: { title: string; url: string };
}

// ─── DOM extraction helpers (runs in browser context) ────────────────────────

function extractDomTree(maxChars = 7000): string {
  function walk(el: Element, depth: number): string {
    if (depth > 7) return '';
    const tag = el.tagName.toLowerCase();
    if (['script', 'style', 'svg', 'path', 'defs'].includes(tag)) return '';

    const classes =
      typeof el.className === 'string'
        ? el.className
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 6)
            .join(' ')
        : '';

    const role = el.getAttribute('role') ?? '';
    const ariaLabel = el.getAttribute('aria-label') ?? '';
    const dataTestId = el.getAttribute('data-testid') ?? '';

    // Direct text (no child element text)
    const directText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent?.trim() ?? '')
      .join(' ')
      .slice(0, 50);

    const children = Array.from(el.children)
      .map((c) => walk(c, depth + 1))
      .filter(Boolean)
      .join('');

    const indent = '  '.repeat(depth);
    const attrs = [
      classes ? `class="${classes}"` : '',
      role ? `role="${role}"` : '',
      ariaLabel ? `aria-label="${ariaLabel}"` : '',
      dataTestId ? `data-testid="${dataTestId}"` : '',
    ]
      .filter(Boolean)
      .join(' ');

    const open = `<${tag}${attrs ? ' ' + attrs : ''}>`;
    const text = directText ? ` ${directText}` : '';
    const inner = children ? `\n${children}${indent}` : '';

    return `${indent}${open}${text}${inner}</${tag}>\n`;
  }

  const result = walk(document.body, 0);
  return result.length > maxChars ? result.slice(0, maxChars) + '\n... (truncated)' : result;
}

function extractInteractiveElements(): InteractiveElement[] {
  const selectors = [
    'button',
    'a[href]',
    'input',
    'select',
    'textarea',
    '[role="button"]',
    '[role="tab"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[tabindex]',
  ].join(', ');

  return Array.from(document.querySelectorAll(selectors))
    .slice(0, 50)
    .map((el) => {
      const rect = el.getBoundingClientRect();
      const hasClick =
        typeof (el as HTMLElement).onclick === 'function' ||
        el.getAttribute('onclick') !== null ||
        el.tagName === 'BUTTON' ||
        el.tagName === 'A';

      return {
        tag: el.tagName.toLowerCase(),
        text: (el.textContent ?? '').trim().slice(0, 50),
        ariaLabel: el.getAttribute('aria-label') ?? undefined,
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        isVisible: rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight,
        hasClickHandler: hasClick,
      };
    });
}

// ─── Main capture function ────────────────────────────────────────────────────

export async function observe(
  appUrl: string,
  screenshotDir: string,
  prefix = '',
): Promise<ObserverResult> {
  await fs.mkdir(screenshotDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    // ── Desktop (1440×900) ──────────────────────────────────────────────────
    const desktopPage = await browser.newPage();
    await desktopPage.setViewportSize({ width: 1440, height: 900 });
    await desktopPage.goto(appUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    // Let animations/transitions settle
    await desktopPage.waitForTimeout(1500);

    const desktopPath = path.join(screenshotDir, `${prefix}desktop.png`);
    await desktopPage.screenshot({ path: desktopPath, fullPage: false });

    const shim = 'const __name = (fn) => fn; const __defProp = Object.defineProperty; const __name2 = (fn) => fn;';
    const domSnapshot = await desktopPage.evaluate(`${shim}(${extractDomTree.toString()})()`);
    const interactiveElements = await desktopPage.evaluate(`${shim}(${extractInteractiveElements.toString()})()`);

    const pageInfo = await desktopPage.evaluate(() => ({
      title: document.title,
      url: window.location.href,
    }));

    await desktopPage.close();

    // ── Mobile (390×844 — iPhone 14) ────────────────────────────────────────
    const mobilePage = await browser.newPage();
    await mobilePage.setViewportSize({ width: 390, height: 844 });
    await mobilePage.goto(appUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    await mobilePage.waitForTimeout(1500);

    const mobilePath = path.join(screenshotDir, `${prefix}mobile.png`);
    await mobilePage.screenshot({ path: mobilePath, fullPage: false });
    await mobilePage.close();

    // ── Read back as base64 ─────────────────────────────────────────────────
    const [desktopBase64, mobileBase64] = await Promise.all([
      fs.readFile(desktopPath).then((b) => b.toString('base64')),
      fs.readFile(mobilePath).then((b) => b.toString('base64')),
    ]);

    return {
      desktopScreenshotPath: desktopPath,
      mobileScreenshotPath: mobilePath,
      desktopScreenshotBase64: desktopBase64,
      mobileScreenshotBase64: mobileBase64,
      domSnapshot,
      interactiveElements,
      pageInfo,
    };
  } finally {
    await browser.close();
  }
}
