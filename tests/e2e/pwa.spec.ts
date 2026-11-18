import { expect, test } from '@playwright/test'

test('mobile login shell, install assets, offline reload, and deep route', async ({ page, context, request }) => {
  const response = await request.get('/manifest.webmanifest')
  expect(response.ok()).toBeTruthy()
  const manifest = await response.json()
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toContain('192x192')
  expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBeTruthy()
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBeTruthy()

  await page.goto('/transactions')
  await expect(page.getByRole('heading', { name: 'Pocket Ledger' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Google로 로그인' })).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (navigator.serviceWorker.controller) return
    await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }))
  })
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Pocket Ledger' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Google로 로그인' })).toBeEnabled()
})
