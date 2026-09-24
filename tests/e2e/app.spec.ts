import { expect, test, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ITEM_BY_ID } from '../../src/content';
import { findBuild } from '../../src/content/validate';
import { buildView } from '../../src/engine/builder';
import { toWords } from '../../src/engine/evaluate';

/* ------------------------------------------------------------------ helpers */

async function noHorizontalScroll(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(sw, 'page must not scroll sideways').toBeLessThanOrEqual(cw + 1);
}

async function noTextInputs(page: Page) {
  const n = await page
    .locator('input:not([type="file"]), textarea, [contenteditable=""], [contenteditable="true"]')
    .count();
  expect(n, 'no typing anywhere in the learning flow').toBe(0);
}

async function state(page: Page) {
  const main = page.locator('main.practice');
  return {
    phase: await main.getAttribute('data-phase'),
    item: (await main.getAttribute('data-item')) ?? '',
    turn: (await main.getAttribute('data-turn')) ?? '',
  };
}

async function tap(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).first().click();
}

/** Build the current task's answer by tapping tiles, then press "check". */
async function answerCurrent(page: Page, mode: 'correct' | 'wrong' = 'correct') {
  const st = await state(page);
  const item = ITEM_BY_ID.get(st.item);
  if (!item) throw new Error(`unknown item ${st.item}`);
  const turn = st.turn === '' ? null : Number(st.turn);
  if (item.type === 'discriminate') {
    const picks = item.options.filter((o) => (mode === 'correct' ? o.v === 'fits' : o.v !== 'fits')).slice(0, mode === 'correct' ? 9 : 1);
    for (const o of picks) await page.getByRole(item.multi ? 'checkbox' : 'radio', { name: o.en }).click();
  } else {
    const quick = page.locator('.quick-choice-card');
    if ((await quick.count()) > 0) {
      const view = buildView(item, turn)!;
      const targetText = view.spec.accept.find((a) => a.o === 'correct_target')?.a.toLowerCase() ?? '';
      const firstText = (await quick.first().locator('.quick-choice-text').innerText()).toLowerCase();
      const firstIsTarget = firstText.includes(targetText.slice(0, 10));
      if (mode === 'correct') {
        await (firstIsTarget ? quick.first() : quick.last()).click();
      } else {
        await (firstIsTarget ? quick.last() : quick.first()).click();
      }
    } else {
      const view = buildView(item, turn)!;
      // clear the answer line (correction / transformation items start pre-filled)
      for (let guard = 0; guard < 20 && (await page.locator('.line .tile').count()) > 0; guard++) {
        await page.locator('.line .tile').first().click();
      }
      const correct = findBuild(toWords(view.spec.accept.find((a) => a.o === 'correct_target')!.a), view.all);
      if (!correct) throw new Error(`cannot build the answer of ${item.id}`);
      let path = correct;
      if (mode === 'wrong') {
        const known = view.spec.wrong?.find((w) => w.as !== 'target_not_used');
        const knownPath = known ? findBuild(toWords(known.a), view.all) : null;
        const distractor = view.all.find((t) => t.why && !correct.includes(t));
        path = knownPath ?? (distractor ? [...correct.slice(0, -1), distractor] : correct);
      }
      for (const t of path) await tap(page, `${t.t} — הוסף למשפט`);
    }
  }
  await tap(page, 'בדוק');
  await expect(page.locator('main.practice')).toHaveAttribute('data-phase', 'feedback');
}

async function continueTask(page: Page) {
  const skipRepair = page.getByRole('button', { name: 'המשך בלי לתקן', exact: true });
  if (await skipRepair.isVisible()) await skipRepair.click();
  else await tap(page, 'המשך');
}

async function skipCalibration(page: Page) {
  await page.goto('/');
  await tap(page, 'דלג על הכיול והתחל מהמסלול המוצע');
  await expect(page.getByText('התרגול המומלץ').or(page.getByText('המקטע הראשון')).first()).toBeVisible();
}

/* -------------------------------------------------------------------- tests */

test('first use: onboarding and calibration by taps only, RTL shell with LTR English', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /בונים משפטים/ })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await noTextInputs(page);
  await noHorizontalScroll(page);
  await tap(page, 'התחל');
  await expect(page.locator('main.practice')).toHaveAttribute('data-phase', 'task');
  await expect(page.locator('.line')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('button', { name: 'בדוק', exact: true })).toBeDisabled();
  for (let i = 0; i < 4; i++) {
    await answerCurrent(page, i === 1 ? 'wrong' : 'correct');
    await noTextInputs(page);
    await noHorizontalScroll(page);
    await continueTask(page);
  }
  await expect(page.getByText('נקודת ההתחלה שלך')).toBeVisible();
  await expect(page.getByText('זה לא ציון רמה', { exact: false })).toBeVisible();
});

test('a wrong answer gets a specific correction, a repair, and is never a loop', async ({ page }) => {
  await page.goto('/');
  await tap(page, 'התחל');
  await answerCurrent(page, 'wrong');
  await expect(page.getByText('לא בדיוק').or(page.getByText('תקין דקדוקית, אבל לא מתאים לסיטואציה'))).toBeVisible();
  await expect(page.getByText('המשפט המתוקן')).toBeVisible();
  await tap(page, 'תקן את המשפט');
  await expect(page.locator('main.practice')).toHaveAttribute('data-phase', 'repair');
  await answerCurrent(page, 'correct');
  await expect(page.getByText('תוקן', { exact: true })).toBeVisible();
  await expect(page.getByText('נרשם כתיקון בעזרת התשובה', { exact: false })).toBeVisible();
});

test('refresh in the middle of a task restores the partial answer and the open help', async ({ page }) => {
  await page.goto('/');
  await tap(page, 'התחל');
  const before = await state(page);
  const puzzleToggle = page.locator('button:has-text("הרכבת מילים"), button:has-text("מילה במילה")');
  if (await puzzleToggle.isVisible()) {
    await puzzleToggle.click();
  }
  const bank = page.locator('.bank .tile');
  await bank.nth(0).click();
  await bank.nth(0).click();
  const placed = await page.locator('.line .tile').allTextContents();
  await tap(page, 'רמז');
  await expect(page.locator('.help-panel')).toBeVisible();
  await page.waitForTimeout(400);
  await page.reload();
  await page.goto('/#practice');
  await expect(page.locator('main.practice')).toHaveAttribute('data-item', before.item);
  await expect(page.locator('.line .tile')).toHaveText(placed);
  await expect(page.locator('.help-panel')).toBeVisible();
});

test('a full first segment can be completed by taps', async ({ page }) => {
  test.slow();
  await skipCalibration(page);
  await tap(page, 'התחל');
  let guard = 0;
  let tasks = 0;
  while (guard++ < 60) {
    const st = await state(page);
    if (st.phase === 'summary') break;
    if (st.phase === 'explain') {
      await noHorizontalScroll(page);
      await tap(page, 'המשך לתרגול');
      continue;
    }
    await answerCurrent(page, 'correct');
    await noHorizontalScroll(page);
    tasks += 1;
    await continueTask(page);
  }
  await expect(page.getByText('סיכום המקטע')).toBeVisible();
  expect(tasks).toBeGreaterThanOrEqual(12);
  await expect(page.getByText('מה הצלחת בלי רמז נוסף')).toBeVisible();
});

test('screens, navigation and larger text work without sideways scrolling', async ({ page }) => {
  await skipCalibration(page);
  for (const name of ['המסלול שלי', 'ההתקדמות שלי', 'היום']) {
    await page.getByRole('link', { name }).click();
    await noHorizontalScroll(page);
    await noTextInputs(page);
  }
  await page.getByRole('link', { name: 'ההתקדמות שלי' }).click();
  await expect(page.getByText('עוד אין נתונים.')).toBeVisible();
  await page.getByRole('link', { name: 'המסלול שלי' }).click();
  await page.getByRole('link', { name: 'הגדרות, גיבוי ועזרה' }).click();
  await tap(page, 'גדול מאוד');
  await expect(page.locator('html')).toHaveAttribute('data-text', 'larger');
  await tap(page, 'כהה');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await noHorizontalScroll(page);
  await tap(page, 'חזרה');
  await tap(page, 'התחל');
  await noHorizontalScroll(page);
  await page.getByRole('link', { name: 'המסלול שלי' }).count();
});

test('backup and restore return the same data; a damaged file changes nothing', async ({ page }) => {
  await page.goto('/');
  await tap(page, 'התחל');
  await answerCurrent(page, 'correct');
  await continueTask(page);
  await answerCurrent(page, 'correct');
  await continueTask(page);
  await tap(page, 'עצור ושמור — אפשר להמשיך אחר כך');
  await page.getByRole('link', { name: 'הגדרות, גיבוי ועזרה' }).click();

  const downloadPromise = page.waitForEvent('download');
  await tap(page, 'ייצא גיבוי');
  const download = await downloadPromise;
  const dir = mkdtempSync(join(tmpdir(), 'sl-'));
  const file = join(dir, 'backup.json');
  await download.saveAs(file);
  const backup = JSON.parse(readFileSync(file, 'utf8'));
  expect(backup.app).toBe('sentence-lab');
  expect(backup.data.attempts.length).toBeGreaterThanOrEqual(2);

  // a damaged file is rejected and nothing changes
  const broken = join(dir, 'broken.json');
  writeFileSync(broken, '{"app":"sentence-lab","schemaVersion":1,"data":{"attempts":[{"attemptId":5}]}}');
  await page.locator('input[type="file"]').setInputFiles(broken);
  await expect(page.getByRole('alert')).toContainText('הנתונים הקיימים לא שונו');

  // delete everything, then restore
  await tap(page, 'מחק את כל הנתונים');
  await tap(page, 'כן, למחוק הכול');
  await expect(page.getByRole('heading', { name: /בונים משפטים/ })).toBeVisible();
  await page.goto('/#settings');
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText('לשחזר מהגיבוי?')).toBeVisible();
  await tap(page, 'כן, החלף את ההתקדמות');
  await expect(page.getByText('השחזור הושלם.')).toBeVisible();
  await page.goto('/#today');
  await expect(page.getByText('המשך מהנקודה האחרונה')).toBeVisible();
});

test('a second tab cannot silently overwrite progress', async ({ page, context }) => {
  await page.goto('/');
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByRole('heading', { name: /בונים משפטים/ })).toBeVisible();
  await tap(page, 'התחל');
  await expect(page.locator('main.practice')).toBeVisible();
  await expect(other.getByText('האפליקציה עודכנה בחלון או בלשונית אחרת', { exact: false })).toBeVisible();
});

test('works offline once the app says it is ready', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'service-worker offline check runs on Chromium');
  await skipCalibration(page);
  await expect(page.getByText('זמין ללא רשת במכשיר הזה.')).toBeVisible({ timeout: 20_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('התרגול המומלץ').or(page.getByText('המקטע הראשון')).first()).toBeVisible();
  await tap(page, 'התחל');
  await expect(page.locator('main.practice')).toBeVisible();
  await answerCurrent(page, 'correct');
  await context.setOffline(false);
});
