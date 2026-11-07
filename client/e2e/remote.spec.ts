import { expect, test, type Page } from '@playwright/test';
import { createGame, joinGame, newPlayer, shot, whoseTurn } from './helpers';

/** Whoever has the turn packs, until the round is over. */
async function packAll(pages: Page[], host: Page) {
  while (!(await host.getByRole('button', { name: 'Next round' }).isVisible())) {
    const p = await whoseTurn(pages);
    await p.getByRole('button', { name: /^Pack$/ }).click();
    await p.waitForTimeout(3600); // the 3 s pack undo
  }
}

test('away sits out without boot; show my cards after a round; cards stay in the log', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const host = await newPlayer(browser);
  const code = await createGame(host, 'Aman', { buyIn: true });
  const neha = await newPlayer(browser);
  await joinGame(neha, code, 'Neha');
  const rohit = await newPlayer(browser);
  await joinGame(rohit, code, 'Rohit');
  await host.getByRole('button', { name: 'Start game' }).click();

  // Rohit turns on Away during round 1: it applies from the next round.
  await rohit.getByRole('button', { name: 'Menu' }).click();
  await rohit.getByLabel(/Away: sit out the next rounds/).check();
  await expect(rohit.getByLabel(/Away: sit out the next rounds/)).toBeChecked();
  await rohit.getByRole('button', { name: 'Close' }).click();
  await packAll([host, neha, rohit], host);
  const rohitBalance = await host
    .getByLabel(/^Rohit, /)
    .getAttribute('aria-label')
    .then((l) => l!.split(', ')[1]);

  await host.getByRole('button', { name: 'Next round' }).click();
  await expect(rohit.getByText('You’re away: you sit out rounds and pay no boot.')).toBeVisible();
  await expect(host.getByLabel(/^Rohit, .*away/)).toBeVisible();
  // No boot taken from Rohit.
  await expect(host.getByLabel(new RegExp(`^Rohit, ${rohitBalance}`))).toBeVisible();
  await shot(rohit, 'away-phone');
  await shot(host, 'away-seat-phone');

  // Round 2 (Aman and Neha): the player to act packs; they then show their cards.
  const actor = await whoseTurn([host, neha]);
  const other = actor === host ? neha : host;
  const actorName = actor === host ? 'Aman' : 'Neha';
  await actor.getByRole('button', { name: /^Pack$/ }).click();
  await expect(actor.getByRole('button', { name: 'Show my cards' })).toBeVisible({ timeout: 8000 });
  await actor.getByRole('button', { name: 'Show my cards' }).click();
  await expect(other.getByText('Shown after the round')).toBeVisible();
  await expect(other.getByText(new RegExp(`^${actorName} · `))).toBeVisible();
  await expect(actor.getByRole('button', { name: 'Show my cards' })).toBeHidden();
  await shot(other, 'shown-cards-phone');

  // The log keeps the cards.
  await other.getByRole('button', { name: 'Game log' }).click();
  const log = other.getByRole('dialog', { name: 'Game log' });
  await expect(log.getByText(new RegExp(`${actorName} showed their cards: `))).toBeVisible();
  await shot(other, 'log-shown-cards-phone');
  await other.getByRole('button', { name: 'Close' }).click();

  // Rohit comes back and plays the next round.
  await rohit.getByRole('button', { name: 'I’m back' }).click();
  await host.getByRole('button', { name: 'Next round' }).click();
  await expect(rohit.getByText('You’re away: you sit out rounds and pay no boot.')).toBeHidden();
  await expect(host.getByLabel(/^Rohit, .*away/)).toBeHidden();
});
