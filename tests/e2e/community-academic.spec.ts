/**
 * TL-TEST-E2E-COMMUNITY-ACADEMIC-001 — community and academic profiles in a real browser.
 *
 * Community: a member asks (a phone number is refused; the page fits a
 * phone), another answers, the asker marks it helpful, a third reports it,
 * a moderator hides it with a reason.
 * Academics: a faculty member creates a public faculty profile, lists a
 * publication and asks a college to confirm the post; the college's
 * administrator confirms; the post shows on the public faculty page and on
 * the college's page as confirmed by the college.
 *
 * Fixture steps, as direct database writes: new accounts' emails are marked
 * verified; the moderator is given the moderator role; the college
 * (organization and administrator membership) is created for its
 * administrator's account. Passwords are generated per run. Needs the
 * development DATABASE_URL (from .env.local).
 */

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

function envLocal(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  if (!existsSync('.env.local')) return undefined;
  const line = readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line?.slice(key.length + 1).replace(/^"|"$/g, '');
}

const prisma = new PrismaClient({ datasources: { db: { url: envLocal('DATABASE_URL') } } });
const stamp = Date.now().toString(36);
const id = (prefix: string) => `${prefix}_e2e_${stamp}_${Math.random().toString(36).slice(2, 7)}`;
const person = (label: string) => ({ name: `E2E ${label} ${stamp}`, email: `e2e-cmty-${label.toLowerCase()}-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}` });
const asker = person('Asker');
const answerer = person('Answerer');
const reporter = person('Reporter');
const mod = person('Moderator');
const faculty = person('Faculty');
const collegeAdmin = person('CollegeAdmin');
const questionTitle = `Is it normal for gums to bleed after flossing? (${stamp})`;
const collegeName = `E2E Faculty College ${stamp}`;
const state = { questionUrl: '', collegeId: '', collegeSlug: `e2e-faculty-college-${stamp}` };

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function register(browser: Browser, who: typeof asker): Promise<{ page: Page; userId: string }> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/register');
  await page.getByLabel('Your name').fill(who.name);
  await page.getByLabel('Email address').fill(who.email);
  await page.locator('input[type="password"][autocomplete="new-password"]').fill(who.password);
  await page.locator('#acceptedTerms').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/account', { timeout: 120_000 });
  const user = await prisma.user.update({ where: { email: who.email }, data: { emailVerifiedAt: new Date() } });
  return { page, userId: user.id };
}

async function signIn(browser: Browser, who: typeof asker): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(who.email);
  await page.locator('input[type="password"]').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/account**');
  return page;
}

test('a member asks, another answers, and the asker marks it helpful', async ({ browser }) => {
  const { page } = await register(browser, asker);
  await page.goto('/community');
  await expect(page.getByRole('heading', { name: 'Dental community' })).toBeVisible({ timeout: 120_000 });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto('/community/ask');
  await page.getByLabel('Topic').selectOption('gums');
  await page.getByLabel(/^Question/).fill(questionTitle);
  await page.getByLabel(/^Details/).fill('My gums bleed when I floss. Call me on 98270 12345 please.');
  await page.getByRole('button', { name: 'Post question' }).click();
  await expect(page.getByText(/Do not share phone numbers or email addresses/)).toBeVisible({ timeout: 60_000 });
  await page.getByLabel(/^Details/).fill('I started flossing last week and my gums bleed a little every time. Should I stop?');
  await page.getByRole('button', { name: 'Post question' }).click();
  await expect(page.getByRole('heading', { name: questionTitle })).toBeVisible({ timeout: 120_000 });
  state.questionUrl = new URL(page.url()).pathname;

  const helper = await register(browser, answerer);
  await helper.page.goto(state.questionUrl);
  // The textbox, not the "Answers" card or list that share the word.
  await helper.page.getByRole('textbox', { name: 'Answer' }).fill('Mild bleeding in the first week is common while gums adapt. If it lasts beyond two weeks, see a dentist.');
  await helper.page.getByRole('button', { name: 'Post answer' }).click();
  // In the list of answers — saved — not merely still in the textbox.
  await expect(helper.page.getByRole('list', { name: 'Answers' }).getByText(/Mild bleeding in the first week is common/)).toBeVisible({ timeout: 120_000 });

  await page.reload();
  const answer = page.getByRole('list', { name: 'Answers' }).getByRole('listitem').filter({ hasText: answerer.name });
  await answer.getByRole('button', { name: 'This helped' }).click();
  await expect(answer.getByText('Accepted by the asker')).toBeVisible({ timeout: 60_000 });
});

test('a member reports the answer and a moderator hides it with a reason', async ({ browser }) => {
  const { page } = await register(browser, reporter);
  await page.goto(state.questionUrl);
  const answer = page.getByRole('list', { name: 'Answers' }).getByRole('listitem').filter({ hasText: answerer.name });
  await answer.getByRole('button', { name: 'Report' }).click();
  await answer.getByLabel('What is wrong?').selectOption('MISINFORMATION');
  await answer.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText(/Reported\. Thank you/)).toBeVisible({ timeout: 60_000 });

  const moderator = await register(browser, mod);
  await prisma.roleAssignment.create({ data: { id: id('ra'), userId: moderator.userId, roleKey: 'moderator' } });
  await moderator.page.goto('/admin/community');
  const reports = moderator.page.getByRole('list', { name: 'Open reports' });
  const item = reports.getByRole('listitem').filter({ hasText: questionTitle });
  await expect(item).toBeVisible({ timeout: 120_000 });
  await item.getByRole('button', { name: 'Hide' }).click();
  await item.getByLabel('Reason the author will see').fill('Gives advice without examination; please see a dentist.');
  await item.getByRole('button', { name: 'Hide post' }).click();
  await expect(moderator.page.getByText('Hidden. The author has been told why.')).toBeVisible({ timeout: 60_000 });

  const hidden = await prisma.communityAnswer.findFirstOrThrow({ where: { question: { title: questionTitle } } });
  expect(hidden).toMatchObject({ status: 'HIDDEN', hiddenReason: 'Gives advice without examination; please see a dentist.' });
  expect(await prisma.communityReport.count({ where: { answerId: hidden.id, status: 'UPHELD' } })).toBe(1);
});

test('a faculty member’s post shows once the college confirms it', async ({ browser }) => {
  const admin = await register(browser, collegeAdmin);
  state.collegeId = id('org');
  await prisma.organization.create({ data: { id: state.collegeId, type: 'COLLEGE', name: collegeName, slug: state.collegeSlug, countryCode: 'IN', timezone: 'Asia/Kolkata', currency: 'INR', status: 'PENDING', ownerUserId: admin.userId } });
  await prisma.organizationMember.create({ data: { id: id('om'), userId: admin.userId, organizationId: state.collegeId, roleKey: 'clinic_admin', isPrimary: true } });
  await prisma.roleAssignment.create({ data: { id: id('ra'), userId: admin.userId, roleKey: 'clinic_admin', organizationId: state.collegeId } });

  const { page, userId } = await register(browser, faculty);
  await page.goto('/account/academic');
  const card = page.getByRole('region', { name: 'Faculty profile' });
  await expect(card).toBeVisible({ timeout: 120_000 });
  await card.getByLabel(/^Name as shown/).fill(faculty.name);
  await card.getByLabel('Designation', { exact: true }).fill('Reader');
  await card.getByLabel('Department', { exact: true }).fill('Orthodontics');
  await card.getByRole('checkbox', { name: 'Orthodontics (braces and aligners)' }).check();
  await card.getByRole('checkbox', { name: 'Show this profile publicly' }).check();
  await card.getByRole('button', { name: 'Save faculty profile' }).click();
  await expect(card.getByText('Saved.', { exact: true })).toBeVisible({ timeout: 60_000 });

  await card.getByLabel('Title', { exact: true }).fill('Anchorage loss in adolescent orthodontic patients');
  await card.getByLabel('Journal or conference').fill('J Indian Orthod Soc');
  await card.getByLabel('Year', { exact: true }).fill('2022');
  await card.getByRole('button', { name: 'Add publication' }).click();
  await expect(card.getByText('Publication added.')).toBeVisible({ timeout: 60_000 });

  await card.getByLabel('College', { exact: true }).selectOption({ label: collegeName });
  await card.getByLabel('Your designation there').fill('Reader');
  await card.getByRole('button', { name: 'Ask the college to confirm' }).click();
  await expect(card.getByText('Sent. The college will confirm it.')).toBeVisible({ timeout: 60_000 });

  const adminPage = await signIn(browser, collegeAdmin);
  await adminPage.goto(`/account/organizations/${state.collegeId}/faculty`);
  const request = adminPage.getByRole('listitem').filter({ hasText: faculty.name });
  await expect(request).toBeVisible({ timeout: 120_000 });
  await request.getByRole('button', { name: 'Confirm' }).click();
  await expect(request.getByText('confirmed', { exact: true })).toBeVisible({ timeout: 60_000 });

  const profile = await prisma.profile.findFirstOrThrow({ where: { userId, type: 'FACULTY' } });
  await adminPage.goto(`/faculty/${profile.slug}`);
  await expect(adminPage.getByRole('heading', { name: faculty.name })).toBeVisible({ timeout: 120_000 });
  await expect(adminPage.getByText('(confirmed by the college)')).toBeVisible();
  await expect(adminPage.getByText('Anchorage loss in adolescent orthodontic patients')).toBeVisible();
  await adminPage.goto(`/colleges/${state.collegeSlug}`);
  await expect(adminPage.getByRole('region', { name: 'Faculty' }).getByRole('link', { name: faculty.name })).toBeVisible({ timeout: 120_000 });
});
