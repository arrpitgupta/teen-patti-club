import { expect, test } from '@playwright/test';
import { createGame, joinGame, newPlayer, shot, whoseTurn } from './helpers';

test('nudge appears after 15 s and buzzes the player to act', async ({ browser }) => {
  test.setTimeout(60_000);
  const host = await newPlayer(browser);
  const code = await createGame(host, 'Aman');
  const neha = await newPlayer(browser);
  await joinGame(neha, code, 'Neha');
  await host.getByRole('button', { name: 'Start game' }).click();

  const actor = await whoseTurn([host, neha]);
  const other = actor === host ? neha : host;
  const actorName = actor === host ? 'Aman' : 'Neha';
  const otherName = actor === host ? 'Neha' : 'Aman';

  await expect(other.getByRole('button', { name: `Nudge ${actorName}` })).toBeHidden();
  await expect(other.getByRole('button', { name: `Nudge ${actorName}` })).toBeVisible({
    timeout: 20_000,
  });
  await shot(other, 'nudge-button-phone');
  await other.getByRole('button', { name: `Nudge ${actorName}` }).click();
  await expect(other.getByText('Nudged')).toBeVisible();
  await expect(actor.getByText(`${otherName}: Jaldi chal!`)).toBeVisible();
  await shot(actor, 'nudged-phone');
  // Cooldown: the button is gone for a while.
  await expect(other.getByRole('button', { name: `Nudge ${actorName}` })).toBeHidden();
});
