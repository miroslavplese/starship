import { expect, test, type Locator, type Page } from '@playwright/test';
import { closeDialog, beginExpedition } from './journeys';

async function expectCornerEdges(page: Page, frame: Locator) {
  const border = await frame.evaluate(element => getComputedStyle(element).borderTopColor);
  const expected = border.match(/\d+/g)!.slice(0, 3).map(Number);
  const image = await frame.screenshot();
  const corners = await page.evaluate(async data => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixel = (x: number, y: number) => Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3);
    return [false, true].flatMap(right => [false, true].map(bottom => {
      const read = (x: number, y: number) => pixel(right ? image.width - 1 - x : x, bottom ? image.height - 1 - y : y);
      return {
        fill: read(5, 9),
        edge: [[2, 8], [5, 5], [8, 2]].map(([x, y]) =>
          [read(x, y), read(x - 1, y), read(x + 1, y), read(x, y - 1), read(x, y + 1)]),
      };
    }));
  }, image.toString('base64'));
  const distance = (color: number[]) => Math.max(...color.map((channel, i) => Math.abs(channel - expected[i])));
  for (const [index, corner] of corners.entries()) {
    for (const pixels of corner.edge) {
      // Fractional positions shift/antialias a 1px stroke; sample its immediate raster neighbors.
      expect(Math.min(...pixels.map(distance)), `${await frame.getAttribute('class')}: corner ${index + 1} must follow its border color`)
        .toBeLessThan(distance(corner.fill) * 0.7);
    }
  }
}

test('clipped frame edges stay connected across panels, selection, confirmations and scrolling', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await expectCornerEdges(page, page.getByRole('dialog', { name: 'Mission selection', exact: true }));
  await page.screenshot({ path: testInfo.outputPath('briefing-corners.png') });

  await closeDialog(page);
  await page.evaluate(() => localStorage.setItem('starship.save.v1', '{broken'));
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'settings', exact: true });
  expect(await settings.evaluate(element => getComputedStyle(element).clipPath)).toBe('none');
  await page.getByRole('button', { name: 'Remove unreadable saves', exact: true }).click();
  const confirmation = page.getByRole('alertdialog', { name: 'Remove unreadable saves', exact: true });
  await expectCornerEdges(page, confirmation);
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await closeDialog(page);
  await beginExpedition(page);
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  for (const selector of ['.player-readout', '.enemy-readout', '.systems-panel', '.weapons-panel', '.drones-panel', '.pause-button', '.crew-card']) {
    await expectCornerEdges(page, page.locator(selector).first());
  }
  await page.locator('.crew-card').first().hover();
  await expectCornerEdges(page, page.locator('.crew-card').first());
  await page.locator('.crew-card').first().click();
  await expectCornerEdges(page, page.locator('.crew-card.selected'));
  await page.screenshot({ path: testInfo.outputPath('hud-corners.png') });

  for (const variant of ['enemy-readout', 'encounter-choice', 'tutorial', 'drill-banner', 'stranded-banner', 'debrief']) {
    await page.evaluate(variant => {
      const frame = document.createElement('section');
      frame.id = 'themed-frame';
      frame.className = `frame ${variant}`;
      frame.style.cssText = 'position:fixed;inset:30px auto auto 30px;width:300px;height:200px;z-index:100';
      document.body.append(frame);
    }, variant);
    await expectCornerEdges(page, page.locator('#themed-frame'));
    await page.locator('#themed-frame').evaluate(element => element.remove());
  }

  await page.evaluate(() => {
    const frame = document.createElement('section');
    frame.id = 'scrolling-frame';
    frame.className = 'start-screen frame';
    frame.style.cssText = 'position:fixed;inset:30px auto auto 30px;width:300px;height:200px;z-index:100';
    const content = document.createElement('div');
    content.style.height = '1000px';
    frame.append(content);
    document.body.append(frame);
    frame.scrollTop = 100;
  });
  await expectCornerEdges(page, page.locator('#scrolling-frame'));
});

test('briefing corners remain connected at the reported screenshot size', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 859, height: 655 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await expectCornerEdges(page, page.getByRole('dialog', { name: 'Mission selection', exact: true }));
  await page.screenshot({ path: testInfo.outputPath('briefing-859x655.png') });
});
