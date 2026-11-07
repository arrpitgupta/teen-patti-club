import { expect, test } from '@playwright/test';
import { createGame, joinGame, newPlayer, shot, TABLET, whoseTurn } from './helpers';

test('physical game: deal, look, show, tap winner, dispute, enter cards', async ({ browser }) => {
  const host = await newPlayer(browser);
  const code = await createGame(host, 'Aman', { physical: true });
  const neha = await newPlayer(browser);
  await joinGame(neha, code, 'Neha');
  await host.getByRole('button', { name: 'Start game' }).click();

  // Host deals real cards, then taps "Cards dealt". Neha waits.
  await expect(host.getByText('Deal 3 cards each')).toBeVisible();
  await expect(neha.getByText('Waiting for the host to deal…')).toBeVisible();
  await shot(host, 'physical-deal-host-phone');
  await shot(neha, 'physical-deal-guest-phone');
  await host.getByRole('button', { name: 'Cards dealt' }).click();

  // 2 players: Neha (left of dealer) can ask for a show at once.
  const turn = await whoseTurn([host, neha]);
  expect(turn).toBe(neha);
  await neha.getByRole('button', { name: 'I’ve looked at my cards' }).first().click();
  await expect(neha.getByText('You’ve seen your cards')).toBeVisible();
  // Seen vs blind: Neha cannot ask for a show; she bets instead.
  await neha.getByRole('button', { name: /CHAAL\s*20/ }).click();
  await host.getByRole('button', { name: 'I’ve looked at my cards' }).first().click();
  await host.getByRole('button', { name: /Show · 20/ }).click();

  // Both get the "Who won?" sheet. Host picks Neha.
  await expect(host.getByRole('dialog')).toContainText('Who won?');
  await shot(host, 'physical-who-won-phone');
  await host.getByRole('dialog').getByRole('button', { name: 'Neha', exact: true }).click();
  await host.getByRole('button', { name: /Neha won · ask to confirm/ }).click();

  // Neha sees the choice read-only and disputes.
  await expect(neha.getByRole('dialog')).toContainText('Aman says you won');
  await expect(neha.getByRole('checkbox')).toHaveCount(0);
  await shot(neha, 'physical-confirm-phone');
  await neha.getByRole('button', { name: 'No, everyone enters cards' }).click();

  // Everyone enters cards; taken cards are disabled for the other player.
  await expect(host.getByRole('dialog')).toContainText('Pick your 3 cards');
  for (const c of ['King of hearts', 'King of spades', '7 of diamonds']) {
    await host.getByRole('button', { name: c, exact: true }).click();
  }
  await shot(host, 'physical-card-picker-phone');
  await host.getByRole('button', { name: 'These are my cards' }).click();
  await expect(
    neha.getByRole('button', { name: 'King of hearts, picked by someone else' }),
  ).toBeDisabled();
  for (const c of ['2 of clubs', '5 of diamonds', '9 of spades']) {
    await neha.getByRole('button', { name: c, exact: true }).click();
  }
  await neha.getByRole('button', { name: 'These are my cards' }).click();

  // The evaluator decides and explains. Pot: boots 20 + Neha 20 + Aman's show 20.
  await expect(host.getByText('You won 60!')).toBeVisible();
  await expect(
    neha.getByText(
      'Aman’s Pair of Kings beat your High card: 9-5-2, because Pair ranks above High card.',
    ),
  ).toBeVisible();
  await shot(neha, 'physical-recap-phone');
});

test('physical pot-limit show with 3 players: only the picker can choose winners', async ({
  browser,
}) => {
  const host = await newPlayer(browser, TABLET);
  await host.goto('/create');
  await host.getByPlaceholder('e.g. Neha').fill('Aman');
  await host.getByRole('radio', { name: /^Physical/ }).click();
  await host.getByRole('button', { name: /More rules/ }).click();
  // Pot limit field is the second "No limit" row: set it to 60.
  const potLimit = host
    .locator('label', { hasText: 'Pot limit (forces a show)' })
    .getByRole('spinbutton');
  await potLimit.fill('60');
  await host.getByRole('button', { name: 'Create game' }).click();
  await host.waitForURL(/\/g\/[A-Z0-9]{6}$/);
  const code = host.url().split('/').pop()!;

  const neha = await newPlayer(browser);
  await joinGame(neha, code, 'Neha');
  const rohit = await newPlayer(browser);
  await joinGame(rohit, code, 'Rohit');
  await host.getByRole('button', { name: 'Start game' }).click();
  await host.getByRole('button', { name: 'Cards dealt' }).click();

  // Pot 30 → Neha 20 (50) → Rohit 20 (70) reaches the 60 limit.
  await neha.getByRole('button', { name: /DOUBLE\s*20/ }).click();
  await rohit.getByRole('button', { name: /CHAAL · BLIND\s*20/ }).click();

  await expect(rohit.getByRole('dialog')).toContainText('Pot limit reached');
  await rohit.getByRole('checkbox', { name: /You/ }).click();
  await shot(rohit, 'potlimit-picker-phone');
  await rohit.getByRole('button', { name: 'Send for confirmation' }).click();

  // Others see the selection read-only.
  await expect(neha.getByRole('dialog')).toContainText('Rohit says they won');
  await expect(neha.getByRole('checkbox')).toHaveCount(0);
  await shot(neha, 'potlimit-confirm-phone');
  await shot(host, 'potlimit-confirm-tablet');
  await neha.getByRole('button', { name: 'Confirm' }).click();
  await host.getByRole('button', { name: 'Confirm' }).click();
  await expect(host.getByText('Rohit won 70')).toBeVisible();
});
