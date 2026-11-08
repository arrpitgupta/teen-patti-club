import { expect, test, type Page } from '@playwright/test';
import {
  expectNoHorizontalScroll,
  newPlayer,
  shot,
  SMALL_PHONE,
  TABLET,
  whoseTurn,
} from './helpers';

async function playOneRoundAndEnd(host: Page, others: Page[]) {
  await host.getByRole('button', { name: 'Start game' }).click();
  const actor = await whoseTurn([host, ...others]);
  await actor.getByRole('button', { name: /^Pack$/ }).click();
  await expect(host.getByRole('button', { name: 'Next round' })).toBeVisible({ timeout: 8000 });
  await host.getByRole('button', { name: 'Host tools' }).click();
  await host.getByRole('button', { name: 'End game' }).click();
  await host.getByRole('dialog').getByRole('button', { name: 'End game' }).click();
  await expect(host.getByText('Final results')).toBeVisible();
}

test('group: create, play from it, results link, leaderboard, pick your name', async ({
  browser,
}) => {
  const host = await newPlayer(browser);
  await host.goto('/groups');
  await host.getByPlaceholder('Friday night club').fill('Friday club');
  await host.getByRole('button', { name: 'Create group' }).click();
  await host.waitForURL(/\/group\/[A-Za-z0-9_-]{22}$/);
  const groupPath = new URL(host.url()).pathname;
  await expect(host.getByRole('heading', { name: 'Friday club' })).toBeVisible();
  await expect(host.getByText('No finished games yet', { exact: false }).first()).toBeVisible();

  // Game 1 from the group.
  await host.getByRole('button', { name: 'New game with the group' }).click();
  await expect(host.getByRole('heading', { name: 'Game for Friday club' })).toBeVisible();
  await host.getByPlaceholder('e.g. Neha').fill('Aman');
  await host.getByRole('button', { name: 'Create game' }).click();
  await host.waitForURL(/\/g\/[A-Z0-9]{6}$/);
  const code1 = host.url().split('/').pop()!;

  const neha = await newPlayer(browser);
  await neha.goto(`/join/${code1}`);
  await expect(neha.getByText('Friday club game')).toBeVisible();
  await expect(neha.getByRole('radio', { name: /Aman/ })).toBeDisabled();
  await neha.getByPlaceholder('e.g. Neha').fill('Neha');
  await neha.getByRole('button', { name: 'Join', exact: true }).click();
  await neha.waitForURL(new RegExp(`/g/${code1}$`));

  await playOneRoundAndEnd(host, [neha]);
  const link = host.getByRole('link', { name: /\/r\/[A-Za-z0-9_-]{22}/ });
  await expect(link).toBeVisible();
  await expect(host.getByRole('link', { name: 'Open Friday club' })).toBeVisible();
  await shot(host, 'results-link-phone');
  const resultsPath = new URL((await link.getAttribute('href'))!).pathname;

  // Anyone with the link: read-only podium, settlement and every round.
  const guest = await newPlayer(browser, SMALL_PHONE);
  await guest.goto(resultsPath);
  await expect(guest.getByRole('heading', { name: 'Final results' })).toBeVisible();
  await expect(guest.getByText('Played in Friday club')).toBeVisible();
  await expect(guest.getByText(/pays/)).toBeVisible();
  await guest.getByText(/Round 1 · Pot/).click();
  await expect(guest.getByText(/packed/).first()).toBeVisible();
  await expectNoHorizontalScroll(guest);
  await shot(guest, 'results-page-small');

  // The group page now has the game and a leaderboard.
  await host.goto(groupPath);
  const board = host.getByRole('list', { name: 'This month' });
  await expect(board.getByRole('listitem')).toHaveCount(2);
  await host.getByRole('radio', { name: 'All time' }).click();
  await expect(host.getByRole('list', { name: 'All time' }).getByRole('listitem')).toHaveCount(2);
  await expect(host.getByRole('link', { name: new RegExp(code1) })).toBeVisible();
  await shot(host, 'group-phone');

  // Game 2: names come from the group (profile names are preselected).
  await host.getByRole('button', { name: 'New game with the group' }).click();
  await expect(host.getByRole('radio', { name: /Aman/ })).toHaveAttribute('aria-checked', 'true');
  await host.getByRole('button', { name: 'Create game' }).click();
  await host.waitForURL(/\/g\/[A-Z0-9]{6}$/);
  const code2 = host.url().split('/').pop()!;
  await neha.goto(`/join/${code2}`);
  await expect(neha.getByRole('radio', { name: /Neha/ })).toHaveAttribute('aria-checked', 'true');
  await expect(neha.getByRole('radio', { name: /Aman/ })).toBeDisabled();
  await shot(neha, 'group-join-phone');
  await neha.getByRole('button', { name: 'Join', exact: true }).click();
  await neha.waitForURL(new RegExp(`/g/${code2}$`));
  await expect(host.getByText('Neha').first()).toBeVisible();

  // The group page lists the game in progress; tablet layout fits.
  const tablet = await newPlayer(browser, TABLET);
  await tablet.goto(groupPath);
  await expect(tablet.getByText('Playing now')).toBeVisible();
  await expect(tablet.getByRole('link', { name: new RegExp(code2) })).toBeVisible();
  await expectNoHorizontalScroll(tablet);
  await shot(tablet, 'group-tablet');

  // Groups opened on a phone are listed on /groups.
  await guest.goto(groupPath);
  await guest.goto('/groups');
  await expect(guest.getByRole('link', { name: 'Friday club' })).toBeVisible();
});
