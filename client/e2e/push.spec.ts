import { expect, test } from '@playwright/test';
import { createGame, joinGame, newPlayer, shot } from './helpers';

test('notification prompt: only after joining, explains itself, "Not now" sticks', async ({
  browser,
}) => {
  const host = await newPlayer(browser);
  // Not on the home or create screens.
  await host.goto('/');
  await expect(host.getByText('Get a buzz on your turn')).toBeHidden();
  const code = await createGame(host, 'Aman');

  const neha = await newPlayer(browser);
  // Headless Chromium starts at "denied"; a real phone starts at "default" (not asked yet).
  await neha.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { get: () => 'default' });
  });
  await neha.goto(`/join/${code}`);
  await expect(neha.getByText('Get a buzz on your turn')).toBeHidden();
  await joinGame(neha, code, 'Neha');
  const prompt = neha.getByRole('region', { name: 'Get a buzz on your turn' });
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('only when it’s your turn');
  await shot(neha, 'push-prompt-lobby-phone');
  await prompt.getByRole('button', { name: 'Not now' }).click();
  await expect(prompt).toBeHidden();
  await neha.reload();
  await expect(neha.getByText('2 players')).toBeVisible();
  await expect(neha.getByText('Get a buzz on your turn')).toBeHidden();
});
