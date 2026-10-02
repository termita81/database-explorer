import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { startApplication } from '../../packages/server/src/app.js';
let application: Awaited<ReturnType<typeof startApplication>>;
const fixture = fileURLToPath(
  new URL('../fixtures/sample.db', import.meta.url),
);
test.beforeAll(async () => {
  application = await startApplication();
});
test.afterAll(async () => {
  await application.app.close();
});

test('opens the fixture, searches, follows a composite relationship, and navigates back', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(application.url);
  await page.getByTestId('database-file').setInputFiles(fixture);
  await expect(
    page.getByRole('heading', { name: 'sample.db', exact: true }),
  ).toBeVisible();
  await page.getByRole('textbox', { name: 'Search tables' }).fill('membership');
  await page
    .getByRole('navigation', { name: 'Database tables' })
    .getByRole('button', { name: 'memberships', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'memberships', exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Relationships', exact: true }).click();
  await page.getByRole('button', { name: /memberships → projects/ }).click();
  await expect(
    page.getByRole('heading', { name: 'projects', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('tab', { name: 'memberships', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'memberships', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('tab', { name: 'Relationships', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Go forward', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'projects', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'projects', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Jump to a table/ }).click();
  await expect(
    page.getByRole('combobox', { name: 'Find a table' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('dialog', { name: 'Jump to a table' }),
  ).toBeHidden();
  await page.keyboard.press('Control+k');
  await expect(
    page.getByRole('combobox', { name: 'Find a table' }),
  ).toBeFocused();
  await page.getByRole('combobox', { name: 'Find a table' }).fill('people');
  await page.getByRole('combobox', { name: 'Find a table' }).press('Enter');
  await expect(
    page.getByRole('heading', { name: 'people', exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Columns', exact: true }).click();
  await page.getByRole('button', { name: 'team_id', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'team_id', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/explorer.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('saves a local path, reconnects from Home, and retains browser profiles on reload', async ({
  page,
}) => {
  await page.goto(application.url);
  await page
    .getByRole('textbox', { name: 'Database path', exact: true })
    .fill(fixture);
  await page
    .getByRole('textbox', { name: 'Connection name', exact: false })
    .fill('Fixture database');
  await page.getByText('Save in this browser', { exact: true }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Fixture database', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'DB Explorer home' }).click();
  await page.reload();
  const saved = page
    .locator('.saved-row')
    .getByRole('button', { name: /Fixture database/ })
    .first();
  await expect(saved).toBeVisible();
  await saved.click();
  await expect(
    page.getByRole('heading', { name: 'Fixture database', exact: true }),
  ).toBeVisible();
});

test('opens a dropped file and recovers from invalid files and stale deep links', async ({
  page,
}) => {
  await page.goto(application.url);
  await page.getByTestId('database-file').setInputFiles({
    name: 'invalid.db',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('not SQLite'),
  });
  await expect(page.getByRole('alert')).toContainText('Unable to open');
  const file = await import('node:fs/promises').then((fs) =>
    fs.readFile(fixture),
  );
  await page.evaluate((bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([new Uint8Array(bytes)], 'dropped.db', {
        type: 'application/octet-stream',
      }),
    );
    window.dispatchEvent(
      new DragEvent('drop', { dataTransfer: transfer, bubbles: true }),
    );
  }, Array.from(file));
  await expect(
    page.getByRole('heading', { name: 'dropped.db', exact: true }),
  ).toBeVisible();
  await page.goto(`${application.url}/connections/not-open/tables/main/people`);
  await expect(
    page.getByRole('heading', { name: 'This connection is no longer open.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Go home' }).click();
  await expect(
    page.getByRole('heading', { name: 'Get to know your database.' }),
  ).toBeVisible();
});
