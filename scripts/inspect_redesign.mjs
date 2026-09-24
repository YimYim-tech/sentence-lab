import { chromium, devices } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const artifactDir = 'C:/Users/ASUS/.gemini/antigravity/brain/9adf7ad6-038b-439a-a829-fc6bd0c778b1';
fs.mkdirSync(artifactDir, { recursive: true });

async function run() {
  console.log('Launching Chrome in iPhone 14 emulation...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  });

  const iphone = devices['iPhone 14'];
  const context = await browser.newContext({
    ...iphone,
    locale: 'he-IL',
    serviceWorkers: 'block',
  });

  const page = await context.newPage();

  console.log('Navigating to http://localhost:4173/ ...');
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });

  // Clear service workers and indexedDB for clean state
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      for (const k of keys) await caches.delete(k);
    }
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // 1. Capture redesigned Onboarding / Home screen
  const s1Path = path.join(artifactDir, 'redesign_1_home.png');
  await page.screenshot({ path: s1Path });
  console.log('Captured screen 1 (Home/Onboarding):', s1Path);

  // Click start: 'התחל'
  const startBtn = page.locator('button:has-text("התחל")').first();
  if (await startBtn.isVisible()) {
    console.log('Clicking התחל...');
    await startBtn.click();
    await page.waitForTimeout(600);
  }

  // 2. Capture Quick 2-Choice Decision screen
  const s2Path = path.join(artifactDir, 'redesign_2_quick_choices.png');
  await page.screenshot({ path: s2Path });
  console.log('Captured screen 2 (Quick Choices):', s2Path);

  // Click Option A (the first quick choice card)
  const choiceCard = page.locator('.quick-choice-card').first();
  if (await choiceCard.isVisible()) {
    console.log('Selecting Option A...');
    await choiceCard.click();
    await page.waitForTimeout(400);

    // 3. Capture Selected State
    const s3Path = path.join(artifactDir, 'redesign_3_choice_selected.png');
    await page.screenshot({ path: s3Path });
    console.log('Captured screen 3 (Option A selected):', s3Path);

    // Click 'בדוק' (Check)
    const checkBtn = page.locator('button:has-text("בדוק")').first();
    if (await checkBtn.isVisible() && await checkBtn.isEnabled()) {
      console.log('Clicking בדוק...');
      await checkBtn.click();
      await page.waitForTimeout(700);

      // 4. Capture Feedback screen
      const s4Path = path.join(artifactDir, 'redesign_4_feedback.png');
      await page.screenshot({ path: s4Path });
      console.log('Captured screen 4 (Feedback):', s4Path);
    }
  }

  // Test switching to puzzle mode
  console.log('Testing puzzle mode toggle...');
  // Click continue if feedback is open
  const continueBtn = page.locator('button:has-text("המשך")').first();
  if (await continueBtn.isVisible()) {
    await continueBtn.click();
    await page.waitForTimeout(600);
  }

  const puzzleToggle = page.locator('button:has-text("הרכבת מילים"), button:has-text("מילה במילה")').first();
  if (await puzzleToggle.isVisible()) {
    console.log('Clicking puzzle toggle...');
    await puzzleToggle.click();
    await page.waitForTimeout(400);

    const s5Path = path.join(artifactDir, 'redesign_5_puzzle_mode.png');
    await page.screenshot({ path: s5Path });
    console.log('Captured screen 5 (Puzzle mode):', s5Path);
  }

  await browser.close();
  console.log('All redesign screenshots successfully captured!');
}

run().catch((err) => {
  console.error('Inspection failed:', err);
  process.exit(1);
});
