import { expect, test } from '@playwright/test';
import { createGame, joinGame, newPlayer, shot, SMALL_PHONE } from './helpers';

test('rematch: one tap to start, one tap to join, same rules', async ({ browser }) => {
  const host = await newPlayer(browser);
  const code = await createGame(host, 'Aman', { buyIn: true });
  const neha = await newPlayer(browser, SMALL_PHONE);
  await joinGame(neha, code, 'Neha');
  await host.getByRole('button', { name: 'Start game' }).click();
  await expect(host.getByText('Pot', { exact: true })).toBeVisible();

  await host.getByRole('button', { name: 'Host tools' }).click();
  await host.getByRole('button', { name: 'End game' }).click();
  await host.getByRole('dialog').getByRole('button', { name: 'End game' }).click();
  await expect(neha.getByText('Final results')).toBeVisible();
  await expect(neha.getByText('Same players and rules. You’ll be the host.')).toBeVisible();

  // Neha starts it and lands in the new lobby as host.
  await neha.getByRole('button', { name: 'Rematch' }).click();
  await neha.waitForURL((u) => /\/g\/[A-Z0-9]{6}$/.test(u.pathname) && !u.pathname.endsWith(code));
  const next = neha.url().split('/').pop()!;
  await expect(neha.getByRole('button', { name: 'Need at least 2 players' })).toBeVisible();
  await expect(neha.getByText(/Buy-in 1,000/)).toBeVisible(); // same rules

  // Aman sees the invitation on the results screen and joins with one tap.
  await expect(host.getByText('Neha started a rematch — same players and rules.')).toBeVisible();
  await shot(host, 'results-rematch-ready-phone');
  await host.getByRole('button', { name: 'Join rematch' }).click();
  await host.waitForURL(new RegExp(`/g/${next}$`));
  await expect(neha.getByText('2 players')).toBeVisible();
  await expect(host.getByText('Waiting for the host to start…')).toBeVisible();

  await neha.getByRole('button', { name: 'Start game' }).click();
  await expect(host.getByText('Pot', { exact: true })).toBeVisible();
});
