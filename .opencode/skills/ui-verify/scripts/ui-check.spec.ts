/**
 * E2E-проверка «Модели здоровья» SLA Planner (реальный браузер, живые данные).
 * Требует: dev-среда на :3000/:8000, npx playwright install chromium.
 * Запуск: см. SKILL.md (ui-verify).
 */
import { test, expect } from '@playwright/test';

test.setTimeout(60_000);

test('Модель здоровья: логин → граф → дерево → детали узла', async ({ page }) => {
  // 1. Логин через реальный API (фронт ходит в бэкенд :8000 — правило №1, моков нет)
  const loginResp = page.waitForResponse(
    r => r.url().includes('/api/auth/login') && r.request().method() === 'POST'
  );
  await page.goto('http://localhost:3000/');
  await expect(page.getByRole('heading', { name: 'SLA Planner', level: 1 })).toBeVisible();
  await page.getByPlaceholder('admin / planner / viewer').fill('viewer');
  await page.getByPlaceholder('Пароль').fill('viewer123');
  await page.getByRole('button', { name: 'Войти' }).click();
  const resp = await loginResp;
  expect(resp.status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Дашборд' })).toBeVisible();

  // 2. Переход в «Модель здоровья»
  await page.getByRole('button', { name: 'Модель здоровья' }).click();
  await expect(page.getByRole('heading', { name: 'Модель здоровья', level: 1 })).toBeVisible();

  // 3. Граф отрисован (vis-network рисует canvas) + панель «Структура модели» справа
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Структура модели', level: 3 })).toBeVisible();

  // 4. Клик по узлу дерева → детали под графом (вместо пустой заглушки)
  const emptyHint = page.getByText('Кликните на SLA или услугу на графе — детали появятся здесь, под графом');
  await expect(emptyHint).toBeVisible();
  await page.locator('button[title*="(id="]').first().click();
  await expect(emptyHint).toHaveCount(0);
  await expect(page.locator('h2.font-bold')).toBeVisible();

  // 5. Скриншот для визуальной проверки
  await page.screenshot({ path: '/tmp/opencode/ui-verify/model-health.png' });
});