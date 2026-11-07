import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, newPlayer, shot, SMALL_PHONE, TABLET } from './helpers';

const coach = (p: Page) => p.getByRole('status', { name: 'Coach' });

test('first launch: How to play cards, then the Learn hub and glossary', async ({ browser }) => {
  const page = await newPlayer(browser, SMALL_PHONE);
  await page.goto('/');
  const how = page.getByRole('dialog', { name: 'How to play' });
  await expect(how).toBeVisible();
  await expect(how.getByRole('heading', { name: 'Win the pot' })).toBeVisible();
  await shot(page, 'walkthrough-1-small-phone');
  await expectNoHorizontalScroll(page);
  // Numbers come from the engine (default boot 10, 4 players).
  for (let i = 0; i < 5; i++) await how.getByRole('button', { name: 'Next' }).click();
  await expect(how.getByRole('heading', { name: 'Which hand wins' })).toBeVisible();
  await shot(page, 'walkthrough-6-small-phone');
  await how.getByRole('button', { name: 'Let’s play' }).click();
  await expect(how).toBeHidden();
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'How to play' })).toBeHidden();

  await page.getByRole('link', { name: 'Learn & practice' }).click();
  await expect(page.getByRole('heading', { name: 'Learn to play' })).toBeVisible();
  await shot(page, 'learn-hub-small-phone');
  await page.getByRole('link', { name: /Glossary/ }).click();
  await expect(page.getByText('Side show', { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('interactive tutorial: the coach walks through a whole round', async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await newPlayer(browser);
  await page.goto('/tutorial');
  await expect(coach(page)).toContainText('the pot is 40');
  await shot(page, 'tutorial-welcome-phone');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(coach(page)).toContainText('you can bet 10–20. Tap Chaal (10)');
  // Only the coached move is accepted.
  await page.getByRole('button', { name: /DOUBLE\s*20/ }).click();
  await expect(page.getByText('Follow the coach: do what the bubble says.')).toBeVisible();
  await page.getByRole('button', { name: /CHAAL · BLIND\s*10/ }).click();

  await expect(coach(page)).toContainText('her 20 matches your blind 10', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(coach(page)).toContainText('Rohit packed', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(coach(page)).toContainText('Look at your cards', { timeout: 10_000 });
  await page.getByRole('button', { name: 'See cards' }).first().click();
  await expect(coach(page)).toContainText('You have Pair of Kings');
  await shot(page, 'tutorial-hand-phone');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(coach(page)).toContainText('20–40');
  await page.getByRole('button', { name: /DOUBLE\s*40/ }).click();

  await expect(coach(page)).toContainText('Asha asks you for a side show', { timeout: 10_000 });
  await shot(page, 'tutorial-sideshow-phone');
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(coach(page)).toContainText(
    'Your Pair of Kings beat Asha’s Pair of Fives, because a pair of Kings beats a pair of Fives.',
  );
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(coach(page)).toContainText('Tap Show (40)', { timeout: 10_000 });
  await page.getByRole('button', { name: /Show · 40/ }).click();
  await expect(coach(page)).toContainText('You won 240!');
  await expect(page.getByText(/Pair of Kings beat Dev’s/)).toBeVisible();
  await shot(page, 'tutorial-won-phone');
  await page.getByRole('button', { name: 'Practice vs bots' }).click();
  await expect(page).toHaveURL(/\/practice$/);
});

test('practice vs bots: bots play, the round ends, results at the end', async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await newPlayer(browser, TABLET);
  await page.goto('/practice');
  await expect(page.getByText('Practice vs bots')).toBeVisible();
  await expect(page.getByText('YOUR TURN', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Pack$/ }).click();
  // Bots finish the round on their own.
  await expect(page.getByRole('button', { name: 'Next round' })).toBeVisible({ timeout: 70_000 });
  await shot(page, 'practice-recap-tablet');
  await page.getByRole('button', { name: 'Host tools' }).click();
  await page.getByRole('button', { name: 'End game' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'End game' }).click();
  await expect(page.getByText('Final results')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible();
});
