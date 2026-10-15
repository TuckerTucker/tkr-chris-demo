import { expect } from 'vitest';
import axe from 'axe-core';
import { cdp } from 'vitest/browser';
import '../theme.css';

/** Run axe against actual rendered DOM including computed browser contrast. */
export async function expectAccessible(container: Element): Promise<void> {
  const result = await axe.run(container);
  expect(result.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) }))).toEqual([]);
}

/** Real Chromium preference emulation; no global or media-query replacement. */
export async function setPreferences(features: { name: string; value: string }[] = []): Promise<void> {
  await cdp().send('Emulation.setEmulatedMedia', { features });
}

/** Touch geometry is measured after the browser lays out the actual controls. */
export function expectTouchTargets(container: Element): void {
  for (const button of container.querySelectorAll('button')) {
    const bounds = button.getBoundingClientRect();
    expect(bounds.width).toBeGreaterThanOrEqual(48);
    expect(bounds.height).toBeGreaterThanOrEqual(48);
  }
}
