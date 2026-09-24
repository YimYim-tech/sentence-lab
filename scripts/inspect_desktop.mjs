import { chromium, devices } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const artifactDir = 'C:/Users/ASUS/.gemini/antigravity/brain/9adf7ad6-038b-439a-a829-fc6bd0c778b1';
fs.mkdirSync(artifactDir, { recursive: true });

async function run() {
  console.log('Testing desktop and mobile views...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  });

  // 1. Desktop inspection (1440x900)
  const desktopCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'he-IL',
    serviceWorkers: 'block',
  });
  const desktopPage = await desktopCtx.newPage();
  await desktopPage.goto('http://localhost:4173/', { waitUntil: 'networkidle' });

  // Clear any existing localStorage / IndexedDB to start clean
  await desktopPage.evaluate(async () => {
    localStorage.clear();
    const dbs = await indexedDB.databases?.() || [];
    for (const db of dbs) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
  });
  await desktopPage.reload({ waitUntil: 'networkidle' });
  await desktopPage.waitForTimeout(600);

  // Click 'דלג על הכיול והתחל מהמסלול המוצע' to go straight to regular practice
  const skipBtn = desktopPage.locator('button:has-text("דלג על הכיול")').first();
  if (await skipBtn.isVisible()) {
    console.log('Skipping calibration to reach skill practice...');
    await skipBtn.click();
    await desktopPage.waitForTimeout(600);
  }

  // Today screen on desktop
  const sDesktopHome = path.join(artifactDir, 'desktop_1_today.png');
  await desktopPage.screenshot({ path: sDesktopHome });
  console.log('Captured desktop today screen:', sDesktopHome);

  // Click 'התחל' on Today screen to enter Practice
  const startBtn = desktopPage.locator('button:has-text("התחל")').first();
  if (await startBtn.isVisible()) {
    console.log('Clicking התחל on Today screen...');
    await startBtn.click();
    await desktopPage.waitForTimeout(600);
  }

  // If there's an explanation screen, click continue
  const contExplain = desktopPage.locator('button:has-text("הבנתי"), button:has-text("המשך"), button:has-text("בוא נתרגל")').first();
  if (await contExplain.isVisible()) {
    console.log('Dismissing lesson explanation...');
    await contExplain.click();
    await desktopPage.waitForTimeout(600);
  }

  // Desktop Practice Screen
  const sDesktopPractice = path.join(artifactDir, 'desktop_2_practice.png');
  await desktopPage.screenshot({ path: sDesktopPractice });
  console.log('Captured desktop practice screen:', sDesktopPractice);

  // Click choice A
  const choiceCard = desktopPage.locator('.quick-choice-card').first();
  if (await choiceCard.isVisible()) {
    await choiceCard.click();
    await desktopPage.waitForTimeout(300);
    const sDesktopSelected = path.join(artifactDir, 'desktop_3_selected.png');
    await desktopPage.screenshot({ path: sDesktopSelected });
    console.log('Captured desktop choice selected:', sDesktopSelected);
  }

  // 2. Mobile inspection (iPhone 14)
  const iphone = devices['iPhone 14'];
  const mobileCtx = await browser.newContext({
    ...iphone,
    locale: 'he-IL',
    serviceWorkers: 'block',
  });
  const mobilePage = await mobileCtx.newPage();
  await mobilePage.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await mobilePage.evaluate(async () => {
    localStorage.clear();
    const dbs = await indexedDB.databases?.() || [];
    for (const db of dbs) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
  });
  await mobilePage.reload({ waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(600);

  const mobileSkip = mobilePage.locator('button:has-text("דלג על הכיול")').first();
  if (await mobileSkip.isVisible()) {
    await mobileSkip.click();
    await mobilePage.waitForTimeout(600);
  }
  const mobileStart = mobilePage.locator('button:has-text("התחל")').first();
  if (await mobileStart.isVisible()) {
    await mobileStart.click();
    await mobilePage.waitForTimeout(600);
  }
  const mobileExplain = mobilePage.locator('button:has-text("הבנתי"), button:has-text("המשך"), button:has-text("בוא נתרגל")').first();
  if (await mobileExplain.isVisible()) {
    await mobileExplain.click();
    await mobilePage.waitForTimeout(600);
  }

  const sMobilePractice = path.join(artifactDir, 'mobile_practice_card.png');
  await mobilePage.screenshot({ path: sMobilePractice });
  console.log('Captured mobile practice screen:', sMobilePractice);

  await browser.close();
  console.log('All screenshots captured!');
}

run().catch((err) => {
  console.error('Error running inspection:', err);
  process.exit(1);
});
