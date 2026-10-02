import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PasswordStore } from '../../packages/server/src/keychain.js';
import { ProfileStore } from '../../packages/server/src/profiles.js';
import { startApplication } from '../../packages/server/src/app.js';
const keychainSecrets = new Map<string, string>();
const passwordStore: PasswordStore = {
  get: async (id) => keychainSecrets.get(id) ?? null,
  set: async (id, password) => {
    keychainSecrets.set(id, password);
  },
  delete: async (id) => {
    keychainSecrets.delete(id);
  },
};
let profileDirectory: string;
let profilePath: string;
let application: Awaited<ReturnType<typeof startApplication>>;
const fixture = fileURLToPath(
  new URL('../fixtures/sample.db', import.meta.url),
);
test.beforeAll(async () => {
  profileDirectory = await mkdtemp(
    join(tmpdir(), 'db-explorer-browser-profiles-'),
  );
  profilePath = join(profileDirectory, 'profiles.json');
  application = await startApplication(undefined, {
    profiles: new ProfileStore(profilePath, passwordStore, {
      SAMPLE_DB: fixture,
    }),
  });
});
test.afterAll(async () => {
  await application.app.close();
  await rm(profileDirectory, { recursive: true, force: true });
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

test('saves, edits, and reconnects a profile after a server restart on a new port', async ({
  page,
}) => {
  await page.goto(application.url);
  await page
    .getByRole('textbox', { name: 'Database path', exact: true })
    .fill('${SAMPLE_DB}');
  await page
    .getByRole('textbox', { name: 'Connection name', exact: false })
    .fill('Fixture database');
  await page.getByText('Save connection profile', { exact: true }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Fixture database', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'DB Explorer home' }).click();
  await page
    .getByRole('button', { name: 'Edit saved Fixture database', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Profile name', exact: true })
    .fill('Persistent fixture');
  await page
    .getByRole('dialog', { name: 'Edit connection profile' })
    .getByText('Allow active data profiling when available', { exact: true })
    .click();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Edit connection profile' }),
  ).toBeHidden();
  const persisted = await readFile(profilePath, 'utf8');
  expect(persisted).toContain('${SAMPLE_DB}');
  expect(persisted).not.toContain(fixture);
  const previousUrl = application.url;
  await application.app.close();
  application = await startApplication(undefined, {
    profiles: new ProfileStore(profilePath, passwordStore, {
      SAMPLE_DB: fixture,
    }),
  });
  expect(application.url).not.toBe(previousUrl);
  await page.goto(application.url);
  const saved = page
    .locator('.saved-row')
    .getByRole('button', { name: /Persistent fixture/ })
    .first();
  await expect(saved).toBeVisible();
  await saved.click();
  await expect(
    page.getByRole('heading', { name: 'Persistent fixture', exact: true }),
  ).toBeVisible();
  const live = await page.request.get(`${application.url}/api/connections`);
  expect((await live.json())[0].preferences).toEqual({
    activeProfiling: false,
  });
  await page.getByRole('link', { name: 'DB Explorer home' }).click();
  await page
    .getByRole('button', {
      name: 'Remove saved Persistent fixture',
      exact: true,
    })
    .click();
  await expect(page.locator('.saved-row')).toHaveCount(0);
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

test('imports profiles previously saved in browser storage', async ({
  page,
}) => {
  await page.goto(application.url);
  await page.evaluate((path) => {
    localStorage.setItem(
      'db-explorer.saved',
      JSON.stringify([{ name: 'Imported profile', kind: 'path', path }]),
    );
  }, fixture);
  await page.reload();
  await page
    .getByRole('button', { name: 'Import browser profiles', exact: true })
    .click();
  const saved = page
    .locator('.saved-row')
    .getByRole('button', { name: 'Imported profile', exact: false })
    .first();
  await expect(saved).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('db-explorer.saved') ?? '[]'),
    ),
  ).toEqual([]);
  await saved.click();
  await expect(
    page.getByRole('heading', { name: 'Imported profile', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'DB Explorer home' }).click();
  await page.screenshot({
    path: 'test-results/profiles-home.png',
    fullPage: true,
  });
});

test('changes a network profile to keychain storage and then prompts for a transient password', async ({
  page,
}) => {
  const created = await page.request.post(`${application.url}/api/profiles`, {
    data: {
      name: 'Remote profile',
      adapterId: 'postgres',
      config: { host: 'localhost', user: 'reader' },
    },
  });
  expect(created.status()).toBe(201);
  const profile = await created.json();
  await page.goto(application.url);
  await page
    .getByRole('button', { name: 'Edit saved Remote profile', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Edit connection profile' });
  await dialog
    .getByRole('combobox', { name: 'Password source' })
    .selectOption('keychain');
  await dialog
    .getByRole('textbox', { name: 'Password for the OS keychain', exact: true })
    .fill('browser-secret-marker');
  await dialog
    .getByRole('button', { name: 'Save profile', exact: true })
    .click();
  await expect(dialog).toBeHidden();
  expect([...keychainSecrets.values()]).toContain('browser-secret-marker');
  expect(await readFile(profilePath, 'utf8')).not.toContain(
    'browser-secret-marker',
  );
  const response = await page.request.get(
    `${application.url}/api/profiles/${profile.id}`,
  );
  expect(await response.json()).toMatchObject({ credential: 'keychain' });
  await page
    .getByRole('button', { name: 'Edit saved Remote profile', exact: true })
    .click();
  await dialog
    .getByRole('combobox', { name: 'Password source' })
    .selectOption('prompt');
  await dialog
    .getByRole('button', { name: 'Save profile', exact: true })
    .click();
  await expect(dialog).toBeHidden();
  expect(keychainSecrets.size).toBe(0);
  await page
    .locator('.saved-row')
    .getByRole('button', { name: 'Remote profile', exact: false })
    .first()
    .click();
  const passwordDialog = page.getByRole('dialog', {
    name: 'Connection password',
  });
  await expect(passwordDialog).toBeVisible();
  await passwordDialog
    .getByLabel('Password', { exact: true })
    .fill('transient-browser-secret');
  const connectionRequest = page.waitForRequest((request) =>
    request.url().endsWith(`/profiles/${profile.id}/connect`),
  );
  await passwordDialog
    .getByRole('button', { name: 'Connect', exact: true })
    .click();
  expect((await connectionRequest).postDataJSON()).toEqual({
    password: 'transient-browser-secret',
  });
  await expect(passwordDialog.getByRole('alert')).toContainText(
    'adapter is not available',
  );
  expect(await readFile(profilePath, 'utf8')).not.toContain(
    'transient-browser-secret',
  );
  await passwordDialog
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Remove saved Remote profile', exact: true })
    .click();
});
