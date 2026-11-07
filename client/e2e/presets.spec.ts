import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, newPlayer, shot, SMALL_PHONE } from './helpers';

test('house-rule presets: save, pick when creating, delete', async ({ browser }) => {
  const page = await newPlayer(browser, SMALL_PHONE);
  await page.goto('/create');
  await expect(page.getByText(/Save the rules you always play with/)).toBeVisible();

  await page.getByRole('radio', { name: /^Physical/ }).click();
  await page.getByRole('radio', { name: /^Buy-in/ }).click();
  await page.getByRole('button', { name: 'Save these rules' }).click();
  await page.getByLabel('Preset name').fill('Diwali rules');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved “Diwali rules”')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Diwali rules', pressed: true })).toBeVisible();

  // Next time: defaults first, then one tap on the preset.
  await page.reload();
  await expect(page.getByRole('radio', { name: /^Digital/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('button', { name: 'Diwali rules', exact: true }).click();
  await expect(page.getByRole('radio', { name: /^Physical/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('radio', { name: /^Buy-in/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await shot(page, 'create-presets-small-phone');
  await expectNoHorizontalScroll(page);

  await page.getByPlaceholder('e.g. Neha').fill('Aman');
  await page.getByRole('button', { name: 'Create game' }).click();
  await page.waitForURL(/\/g\/[A-Z0-9]{6}$/);
  await expect(page.getByText(/Physical · Buy-in/)).toBeVisible();

  await page.goto('/create');
  await page.getByRole('button', { name: 'Delete preset Diwali rules' }).click();
  await expect(page.getByRole('button', { name: 'Diwali rules', exact: true })).toBeHidden();
});
