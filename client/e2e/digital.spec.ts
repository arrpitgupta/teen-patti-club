import { expect, test } from '@playwright/test';
import {
  createGame,
  expectNoHorizontalScroll,
  joinGame,
  newPlayer,
  shot,
  SMALL_PHONE,
  TABLET,
  whoseTurn,
} from './helpers';

test('digital game: lobby, blind and seen turns, side show, round end, results', async ({
  browser,
}) => {
  const host = await newPlayer(browser);
  const code = await createGame(host, 'Aman');
  await expect(host.getByText(code, { exact: true })).toBeVisible();

  const neha = await newPlayer(browser);
  await joinGame(neha, code, 'Neha');
  const rohit = await newPlayer(browser, SMALL_PHONE);
  await joinGame(rohit, code, 'Rohit');
  const priya = await newPlayer(browser, TABLET);
  await joinGame(priya, code, 'Priya');
  const all = [host, neha, rohit, priya];

  await expect(host.getByText('4 players')).toBeVisible();
  await shot(host, 'lobby-host-phone');
  await shot(neha, 'lobby-guest-phone');
  await expectNoHorizontalScroll(host);

  await host.getByRole('button', { name: 'Start game' }).click();
  for (const p of all) await expect(p.getByText('Pot', { exact: true })).toBeVisible();

  // Seats: Aman 0 (dealer), Neha 1 → Neha acts first, blind.
  const first = await whoseTurn(all);
  expect(first).toBe(neha);
  await expect(neha.getByText(/You’re blind: bet 10–20\./)).toBeVisible(); // engine values
  await expect(neha.getByRole('button', { name: /CHAAL · BLIND\s*10/ })).toBeVisible();
  await shot(neha, 'turn-blind-phone');
  await shot(rohit, 'waiting-small-phone');
  await shot(priya, 'waiting-tablet');
  for (const p of all) await expectNoHorizontalScroll(p);

  // Long-press explains a button instead of acting.
  await neha.getByRole('button', { name: /^Pack$/ }).dispatchEvent('contextmenu');
  await expect(neha.getByRole('tooltip')).toContainText('Give up this round');

  // Neha bets blind max (Double 20).
  await neha.getByRole('button', { name: /DOUBLE\s*20/ }).click();
  await expect(rohit.getByText('YOUR TURN', { exact: true })).toBeVisible();

  // Rohit looks at his cards, then bets seen.
  await rohit.getByRole('button', { name: 'See cards' }).first().click();
  await expect(rohit.getByText(/You’re seen: bet 40–80\./)).toBeVisible();
  await shot(rohit, 'turn-seen-small-phone');
  await rohit.getByRole('button', { name: /CHAAL\s*40/ }).click();

  // Priya (tablet) opens the custom bet sheet.
  await expect(priya.getByText('YOUR TURN', { exact: true })).toBeVisible();
  await shot(priya, 'turn-blind-tablet');
  await priya.getByRole('button', { name: 'Custom amount' }).click();
  await expect(priya.getByText('Between 20 and 40')).toBeVisible();
  await shot(priya, 'bet-sheet-tablet');
  await priya.getByRole('dialog').getByRole('button', { name: 'Bet 20', exact: true }).click();

  // Aman packs, with the 3-second undo: undo once, then pack for real.
  await expect(host.getByText('YOUR TURN', { exact: true })).toBeVisible();
  await host.getByRole('button', { name: /^Pack$/ }).click();
  await expect(host.getByText(/Packing in \d…/)).toBeVisible();
  await shot(host, 'pack-undo-phone');
  await host.getByRole('button', { name: 'Undo' }).click();
  await expect(host.getByRole('button', { name: /^Pack$/ })).toBeVisible();
  await host.getByRole('button', { name: /^Pack$/ }).click();
  await expect(neha.getByText('YOUR TURN', { exact: true })).toBeVisible({ timeout: 8000 });

  // Neha sees, Neha bets seen; Rohit asks Neha... side show needs the previous player:
  // Neha → Rohit → Priya. Neha sees and bets; Rohit (seen) asks Neha for a side show.
  await neha.getByRole('button', { name: 'See cards' }).first().click();
  await neha.getByRole('button', { name: /CHAAL\s*40/ }).click();
  await expect(rohit.getByText('YOUR TURN', { exact: true })).toBeVisible();
  await rohit.getByRole('button', { name: /Side show · 40/ }).click();
  await expect(neha.getByText('Rohit asks for a side show')).toBeVisible();
  await shot(neha, 'sideshow-prompt-phone');
  await neha.getByRole('button', { name: 'Accept' }).click();
  // The two players privately see each other's cards; Priya sees nothing.
  await expect(neha.getByText(/You saw Rohit’s cards/)).toBeVisible();
  await expect(rohit.getByText(/You saw Neha’s cards/)).toBeVisible();
  await expect(priya.getByText(/You saw/)).toHaveCount(0);

  // Everyone left packs until the round ends.
  for (let i = 0; i < 3; i++) {
    const p = await whoseTurn(all).catch(() => null);
    if (!p) break;
    await p.getByRole('button', { name: /^Pack$/ }).click();
    await p.waitForTimeout(3300);
    if (await host.getByRole('button', { name: 'Next round' }).isVisible()) break;
  }
  await expect(host.getByRole('button', { name: 'Next round' })).toBeVisible();
  await shot(host, 'recap-host-phone');
  await shot(priya, 'recap-tablet');

  // End the game from host tools.
  await host.getByRole('button', { name: 'Host tools' }).click();
  await host.getByRole('button', { name: 'End game' }).click();
  await host.getByRole('dialog').getByRole('button', { name: 'End game' }).click();
  await expect(host.getByText('Final results')).toBeVisible();
  await expect(neha.getByText('Settle up')).toBeVisible();
  await shot(host, 'results-phone');
  await shot(priya, 'results-tablet');
  await expectNoHorizontalScroll(host);
});

test('ten players fit around the table on a phone', async ({ browser }) => {
  const host = await newPlayer(browser);
  const code = await createGame(host, 'Aman', { buyIn: true });
  const names = ['Neha', 'Rohit', 'Priya', 'Kabir', 'Sara', 'Dev', 'Ishaan', 'Meera', 'Tara'];
  const pages = [host];
  for (const n of names) {
    const p = await newPlayer(browser, n === 'Tara' ? SMALL_PHONE : undefined);
    await joinGame(p, code, n);
    pages.push(p);
  }
  await expect(host.getByText('10 players')).toBeVisible();
  await host.getByRole('button', { name: 'Start game' }).click();
  await expect(host.getByText('Pot', { exact: true })).toBeVisible();
  await shot(host, 'ten-players-phone');
  await shot(pages[9]!, 'ten-players-small-phone');
  const turn = await whoseTurn(pages);
  await shot(turn, 'ten-players-turn-phone');
  await expectNoHorizontalScroll(pages[9]!);
});
