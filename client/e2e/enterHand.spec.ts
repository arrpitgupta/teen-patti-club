import { expect, test, type Page } from '@playwright/test';
import { createGame, joinGame, newPlayer, shot, SMALL_PHONE, whoseTurn } from './helpers';

async function enterHand(page: Page, cards: string[]) {
  const sheet = page.getByRole('dialog', { name: 'Enter your hand' });
  await expect(sheet).toBeVisible();
  for (const c of cards) await sheet.getByRole('button', { name: c, exact: true }).click();
  await sheet.getByRole('button', { name: 'Save my hand' }).click();
  await expect(sheet).toBeHidden();
}

test('physical: enter my hand, edit it, app decides the show, both confirm', async ({
  browser,
}) => {
  const host = await newPlayer(browser);
  const code = await createGame(host, 'Aman', { physical: true });
  const neha = await newPlayer(browser, SMALL_PHONE);
  await joinGame(neha, code, 'Neha');
  await host.getByRole('button', { name: 'Start game' }).click();
  await host.getByRole('button', { name: 'Cards dealt' }).click();
  expect(await whoseTurn([host, neha])).toBe(neha);

  // Neha enters a hand with a typo, then fixes it before betting.
  await neha.getByRole('button', { name: 'Enter my hand' }).click();
  // All 52 cards stay selectable: nothing tells her what others entered.
  await expect(neha.getByRole('button', { name: /picked by someone else/ })).toHaveCount(0);
  await enterHand(neha, ['Ace of spades', 'Ace of hearts', '7 of clubs']);
  await expect(neha.getByText('Pair of Aces')).toBeVisible();
  await neha.getByRole('button', { name: 'Edit', exact: true }).click();
  const sheet = neha.getByRole('dialog', { name: 'Enter your hand' });
  await sheet.getByRole('button', { name: /Remove 7 of clubs/ }).click();
  await enterHand(neha, ['Ace of diamonds']);
  await expect(neha.getByText('Trail of Aces')).toBeVisible();
  await shot(neha, 'enter-hand-entered-small-phone');
  // The hand is highlighted in the rankings cheat sheet.
  await neha.getByRole('button', { name: 'Ranks' }).click();
  await expect(neha.getByText('Your hand')).toBeVisible();
  await neha.getByRole('button', { name: 'Close' }).click();

  // Betting locks it.
  await neha.getByRole('button', { name: /CHAAL\s*20/ }).click();
  await expect(neha.getByText('Fixed: you bet after entering it.')).toBeVisible();
  await expect(neha.getByRole('button', { name: 'Edit', exact: true })).toBeHidden();

  // Aman enters his hand too, then asks for the show.
  await host.getByRole('button', { name: 'Enter my hand' }).click();
  await enterHand(host, ['King of spades', 'King of hearts', '2 of clubs']);
  await host.getByRole('button', { name: /Show · 20/ }).click();

  // The app compared them; both see the cards and the reason, and confirm.
  for (const p of [host, neha]) {
    await expect(p.getByRole('dialog')).toContainText('The app compared the entered hands');
  }
  await expect(host.getByRole('dialog')).toContainText(
    'Neha’s Trail of Aces beat your Pair of Kings',
  );
  await shot(host, 'enter-hand-compare-phone');
  await host.getByRole('button', { name: 'Yes, these match' }).click();
  await neha.getByRole('button', { name: 'Yes, these match' }).click();
  await expect(neha.getByText('You won 60!')).toBeVisible();
  await expect(host.getByText(/Neha’s Trail of Aces beat your Pair of Kings/)).toBeVisible();
});
