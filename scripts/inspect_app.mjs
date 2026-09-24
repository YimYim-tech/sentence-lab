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
  await page.waitForTimeout(1000);

  // Screenshot 1: Home screen
  const homePath = path.join(artifactDir, 'iphone_1_home.png');
  await page.screenshot({ path: homePath });
  console.log('Captured home screen:', homePath);

  // Click continue button 'המשך'
  const continueBtn = page.locator('button:has-text("המשך")').first();
  if (await continueBtn.isVisible()) {
    console.log('Clicking המשך...');
    await continueBtn.click();
    await page.waitForTimeout(1000);
  }

  // Check if we are on a lesson or practice screen
  const lessonAudioBtn = page.locator('.audio-btn').first();
  if (await lessonAudioBtn.isVisible()) {
    console.log('Lesson screen with audio detected!');
    const lessonPath = path.join(artifactDir, 'iphone_2_lesson_audio.png');
    await page.screenshot({ path: lessonPath });
  }

  // Look for start / continue button if in lesson
  const startPracticeBtn = page.locator('button:has-text("בוא נתרגל"), button:has-text("התחל"), button:has-text("הבנתי, בוא נמשיך"), button:has-text("המשך")').first();
  if (await startPracticeBtn.isVisible()) {
    console.log('Clicking to enter practice...');
    await startPracticeBtn.click();
    await page.waitForTimeout(800);
  }

  // Check builder tokens
  const bankTokens = page.locator('.token-btn, .token, button[data-token], .bank button');
  const count = await bankTokens.count();
  console.log('Found tokens in bank:', count);

  if (count > 0) {
    // Tap first token
    await bankTokens.nth(0).click();
    await page.waitForTimeout(300);
    // Tap second token
    if (count > 1) {
      await bankTokens.nth(1).click();
      await page.waitForTimeout(300);
    }

    // Capture Builder screen with Undo button
    const builderPath = path.join(artifactDir, 'iphone_3_builder.png');
    await page.screenshot({ path: builderPath });
    console.log('Captured builder screen with selected words:', builderPath);

    // Look for Undo button: 'בטל'
    const undoBtn = page.locator('button:has-text("בטל"), button[title*="בטל"]').first();
    const isVis = await undoBtn.isVisible().catch(() => false);
    const isEn = isVis ? await undoBtn.isEnabled().catch(() => false) : false;
    console.log('Undo button state:', isVis, isEn);

    if (isVis && isEn) {
      console.log('Undo button is visible and enabled! Clicking Undo...');
      await undoBtn.click();
      await page.waitForTimeout(400);

      const afterUndoPath = path.join(artifactDir, 'iphone_4_after_undo.png');
      await page.screenshot({ path: afterUndoPath });
      console.log('Captured after undo screen:', afterUndoPath);

      // Now clear and build correct answer: "She is presenting the plan now."
      const clearBtn = page.locator('button:has-text("נקה הכול")').first();
      if (await clearBtn.isVisible()) {
        await clearBtn.click();
        await page.waitForTimeout(300);
      }

      for (const word of ['she', 'is', 'presenting', 'the plan', 'now']) {
        const btn = page.locator(`.bank button:has-text("${word}")`).first();
        if (await btn.isVisible()) {
          await btn.click();
          await page.waitForTimeout(150);
        }
      }

      // Click "בדוק" (Submit)
      const submitBtn = page.locator('button:has-text("בדוק")').first();
      if (await submitBtn.isVisible()) {
        console.log('Clicking בדוק to enter feedback...');
        await submitBtn.click();
        await page.waitForTimeout(1000);

        // Capture feedback screen with Audio button
        const feedbackPath = path.join(artifactDir, 'iphone_5_feedback_audio.png');
        await page.screenshot({ path: feedbackPath });
        console.log('Captured feedback screen with audio buttons:', feedbackPath);
      }
    }
  }

  // Check settings screen
  console.log('Navigating to Settings...');
  const settingsTab = page.locator('button:has-text("הגדרות"), a:has-text("הגדרות"), [aria-label*="הגדרות"]').first();
  if (await settingsTab.isVisible()) {
    await settingsTab.click();
    await page.waitForTimeout(800);
    const settingsPath = path.join(artifactDir, 'iphone_6_settings.png');
    await page.screenshot({ path: settingsPath });
    console.log('Captured settings screen:', settingsPath);
  }

  await browser.close();
  console.log('Finished iPhone test inspection successfully!');
}

run().catch(err => {
  console.error('Inspection failed:', err);
  process.exit(1);
});
