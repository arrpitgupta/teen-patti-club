import { expect, test } from '@playwright/test';
import {
  createGame,
  expectNoHorizontalScroll,
  joinGame,
  newPlayer,
  shot,
  SMALL_PHONE,
  TABLET,
} from './helpers';

test('table chat: drawer, reactions, presets, unread badge, mute and reconnect', async ({
  browser,
}) => {
  const host = await newPlayer(browser);
  const code = await createGame(host, 'Aman');
  const neha = await newPlayer(browser, SMALL_PHONE);
  await joinGame(neha, code, 'Neha');
  const priya = await newPlayer(browser, TABLET);
  await joinGame(priya, code, 'Priya');
  await host.getByRole('button', { name: 'Start game' }).click();
  for (const p of [host, neha, priya])
    await expect(p.getByText('Pot', { exact: true })).toBeVisible();

  // Neha sends a reaction: it floats over her seat on the other screens (~2 s).
  await neha.getByRole('button', { name: 'Open chat' }).click();
  await expect(neha.getByRole('dialog', { name: 'Table chat' })).toBeVisible();
  await expect(neha.getByText('No messages yet. Say hi!')).toBeVisible();
  await shot(neha, 'chat-empty-small-phone');
  await expectNoHorizontalScroll(neha);
  await neha.getByRole('button', { name: 'Send 🔥' }).click();
  // Phones close the drawer after a one-tap send so the bubble is visible.
  await expect(neha.getByRole('dialog', { name: 'Table chat' })).toBeHidden();
  await expect(host.getByText('🔥', { exact: true })).toBeVisible();
  await shot(host, 'chat-reaction-float-phone');
  await expect(host.getByText('🔥', { exact: true })).toBeHidden({ timeout: 4000 });

  // A preset line floats too.
  await neha.getByRole('button', { name: 'Open chat' }).click();
  await neha.getByRole('button', { name: 'Jaldi chal!' }).click();
  await expect(priya.getByText('Jaldi chal!', { exact: true })).toBeVisible();
  await shot(priya, 'chat-preset-float-tablet');

  // A typed message: small toast + unread badge for the others.
  await neha.getByRole('button', { name: 'Open chat' }).click();
  await neha.getByPlaceholder('Message the table').fill('Kaun jeetega aaj?');
  await neha.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(neha.getByPlaceholder('Message the table')).toHaveValue('');
  await neha.getByRole('button', { name: 'Close' }).click();
  await expect(host.getByText('Neha: Kaun jeetega aaj?')).toBeVisible();
  await expect(host.getByRole('button', { name: 'Open chat, 1 new message' })).toBeVisible();

  // Aman reads it: badge clears; the drawer shows everything in order.
  await host.getByRole('button', { name: /Open chat/ }).click();
  const log = host.getByRole('log', { name: 'Table chat' });
  await expect(log.getByText('Kaun jeetega aaj?')).toBeVisible();
  await expect(log.getByText('Jaldi chal!')).toBeVisible();
  await shot(host, 'chat-drawer-phone');
  await host.getByRole('button', { name: 'Close' }).click();
  await expect(host.getByRole('button', { name: 'Open chat', exact: true })).toBeVisible();

  // Tablet: the drawer is a side panel; the table stays visible.
  await priya.getByRole('button', { name: /Open chat/ }).click();
  await priya.getByPlaceholder('Message the table').fill('Main toh blind khelungi');
  await priya.getByPlaceholder('Message the table').press('Enter');
  await expect(priya.getByRole('log').getByText('Main toh blind khelungi')).toBeVisible();
  await expect(priya.getByText('Pot', { exact: true })).toBeVisible();
  await shot(priya, 'chat-drawer-tablet');
  await priya.getByRole('button', { name: 'Close' }).click();

  // Mute: no toasts or bubbles, no badge; messages still in the drawer.
  await host.getByRole('button', { name: /Open chat/ }).click();
  await host.getByRole('button', { name: 'Mute chat' }).click();
  await expect(host.getByText(/Chat is muted/)).toBeVisible();
  await host.getByRole('button', { name: 'Close' }).click();
  await neha.getByRole('button', { name: /Open chat/ }).click();
  await neha.getByPlaceholder('Message the table').fill('Muted?');
  await neha.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(priya.getByText('Neha: Muted?')).toBeVisible();
  await expect(host.getByText('Neha: Muted?')).toBeHidden();
  await expect(host.getByRole('button', { name: 'Open chat', exact: true })).toBeVisible();
  await host.getByRole('button', { name: /Open chat/ }).click();
  await expect(host.getByRole('log').getByText('Muted?')).toBeVisible();
  await host.getByRole('button', { name: 'Unmute' }).click();
  await host.getByRole('button', { name: 'Close' }).click();
  await neha.getByRole('button', { name: 'Close' }).click();

  // Priya's tablet drops off (tab closed); she misses messages and sees them when she's back.
  const priyaCtx = priya.context();
  await priya.close();
  await expect(host.getByText('Priya lost connection')).toBeVisible();
  await host.getByRole('button', { name: /Open chat/ }).click();
  await host.getByPlaceholder('Message the table').fill('Priya kahan gayi?');
  await host.getByRole('button', { name: 'Send', exact: true }).click();
  await host.getByRole('button', { name: 'Send 😂' }).click(); // closes the drawer (phone)
  await expect(host.getByRole('dialog', { name: 'Table chat' })).toBeHidden();
  const priya2 = await priyaCtx.newPage();
  await priya2.goto(`/g/${code}`);
  // "Muted?" (seen only as a toast) and "Priya kahan gayi?" are unread; reactions don't count.
  await expect(priya2.getByRole('button', { name: 'Open chat, 2 new messages' })).toBeVisible();
  await priya2.getByRole('button', { name: /Open chat/ }).click();
  await expect(priya2.getByRole('log').getByText('Priya kahan gayi?')).toBeVisible();
  await expect(priya2.getByRole('log').getByText('😂')).toBeVisible();

  // Reloading keeps the history and the read position.
  await neha.reload();
  await expect(neha.getByText('Pot', { exact: true })).toBeVisible();
  await expect(neha.getByRole('button', { name: 'Open chat, 1 new message' })).toBeVisible();
});
