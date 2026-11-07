import { expect, test } from '@playwright/test';
import { createGame, joinGame, newPlayer, shot, whoseTurn } from './helpers';

test('history lists your games with your net and the settlement', async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.goto('/history');
  await expect(host.getByText(/Games you play on this phone show up here/)).toBeVisible();

  const code = await createGame(host, 'Aman');
  const neha = await newPlayer(browser);
  await joinGame(neha, code, 'Neha');
  await host.getByRole('button', { name: 'Start game' }).click();
  const actor = await whoseTurn([host, neha]);
  await actor.getByRole('button', { name: /^Pack$/ }).click();
  await expect(host.getByRole('button', { name: 'Next round' })).toBeVisible({ timeout: 8000 });
  await host.getByRole('button', { name: 'Host tools' }).click();
  await host.getByRole('button', { name: 'End game' }).click();
  await host.getByRole('dialog').getByRole('button', { name: 'End game' }).click();
  await expect(host.getByText('Final results')).toBeVisible();

  await host.goto('/history');
  const row = host.getByRole('button', { name: new RegExp(code) });
  await expect(row).toBeVisible();
  await expect(row).toContainText(/[+−]10|^0/);
  await expect(row).toContainText('of 2');
  await shot(host, 'history-phone');
  await row.click();
  await expect(host.getByRole('dialog', { name: 'Final results' })).toContainText(/pays/);
  await shot(host, 'history-detail-phone');
});
