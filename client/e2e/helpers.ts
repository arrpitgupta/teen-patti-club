import { expect, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const PHONE = { width: 390, height: 844 };
export const SMALL_PHONE = { width: 360, height: 740 };
export const TABLET = { width: 1180, height: 820 };

const SCREENS = join(process.cwd(), 'e2e', 'screens');
mkdirSync(SCREENS, { recursive: true });

export async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(400); // let animations settle
  await page.screenshot({ path: join(SCREENS, `${name}.png`) });
}

export async function newPlayer(browser: Browser, viewport = PHONE): Promise<Page> {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: viewport.width < 900,
    hasTouch: viewport.width < 900,
  });
  return ctx.newPage();
}

export async function createGame(
  page: Page,
  name: string,
  opts: { physical?: boolean; buyIn?: boolean } = {},
): Promise<string> {
  await page.goto('/create');
  await page.getByPlaceholder('e.g. Neha').fill(name);
  if (opts.physical) await page.getByRole('radio', { name: /^Physical/ }).click();
  if (opts.buyIn) await page.getByRole('radio', { name: /^Buy-in/ }).click();
  await page.getByRole('button', { name: 'Create game' }).click();
  await page.waitForURL(/\/g\/[A-Z0-9]{6}$/);
  return page.url().split('/').pop()!;
}

export async function joinGame(page: Page, code: string, name: string): Promise<void> {
  await page.goto(`/join/${code}`);
  await page.getByPlaceholder('e.g. Neha').fill(name);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.waitForURL(new RegExp(`/g/${code}$`));
}

/** The page whose action bar is showing "YOUR TURN". */
export async function whoseTurn(pages: Page[]): Promise<Page> {
  for (let i = 0; i < 50; i++) {
    for (const p of pages) {
      if (
        await p
          .getByText('YOUR TURN', { exact: true })
          .isVisible()
          .catch(() => false)
      )
        return p;
    }
    await pages[0]!.waitForTimeout(200);
  }
  throw new Error('Nobody has the turn');
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}
