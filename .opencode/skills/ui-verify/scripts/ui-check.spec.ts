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

test('Права: меню по правам групп + страница «Группы» у admin', async ({ page }) => {
  // 1. Логин viewer (role=user, группа «Наблюдатели»): админ-страницы скрыты
  await page.goto('http://localhost:3000/');
  await page.getByPlaceholder('admin / planner / viewer').fill('viewer');
  await page.getByPlaceholder('Пароль').fill('viewer123');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('button', { name: 'Дашборд' })).toBeVisible();

  await expect(page.getByRole('button', { name: 'Пользователи' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Группы' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Настройки' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Аудит-лог' })).toHaveCount(0);
  await expect(page.getByText('Наблюдатели')).toBeVisible();

  // Обычный пользователь НЕ видит следов интеграции с Zabbix (кнопка, статус, Read-Only)
  await expect(page.getByText('Сервер: Online')).toBeVisible();
  await expect(page.getByText('Zabbix')).toHaveCount(0);
  await expect(page.getByText('Read-Only')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Синхр. с Zabbix' })).toHaveCount(0);

  // 2. Выход и логин админом
  await page.getByTitle('Выйти').click();
  await page.getByPlaceholder('admin / planner / viewer').fill('admin');
  await page.getByPlaceholder('Пароль').fill('admin123');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('button', { name: 'Группы' })).toBeVisible();

  // Админ видит кнопку синхронизации и состояние Zabbix
  await expect(page.getByRole('button', { name: 'Синхр. с Zabbix' })).toBeVisible();
  await expect(page.getByText('Zabbix:')).toBeVisible();

  // 3. Страница «Группы»: системные группы видны с правами
  await page.getByRole('button', { name: 'Группы' }).click();
  await expect(page.getByRole('heading', { name: 'Группы', level: 1 })).toBeVisible();
  await expect(page.getByText('Планировщики')).toBeVisible();
  await expect(page.getByText('Наблюдатели')).toBeVisible();

  // 4. Область моделей здоровья и добавление участников (как в Grafana)
  await expect(page.getByText('все модели').first()).toBeVisible();
  await page.getByTitle('Редактировать').first().click();
  await expect(page.getByText('Права группы')).toBeVisible();
  await expect(page.getByText('Все модели здоровья')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Добавить участника' })).toBeVisible();
  // «+ Добавить участника» раскрывает выбор пользователя
  await page.getByRole('button', { name: 'Добавить участника' }).click();
  await expect(page.locator('select')).toBeVisible();
  await page.getByRole('button', { name: 'Отмена' }).last().click();

  await page.screenshot({ path: '/tmp/opencode/ui-verify/groups.png' });
});

test('Время: аудит-лог показывает московское время (MSK)', async ({ page }) => {
  // Логин админом (аудит-лог — admin-only). Само событие login пишет запись в лог.
  await page.goto('http://localhost:3000/');
  await page.getByPlaceholder('admin / planner / viewer').fill('admin');
  await page.getByPlaceholder('Пароль').fill('admin123');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('button', { name: 'Аудит-лог' })).toBeVisible();
  await page.getByRole('button', { name: 'Аудит-лог' }).click();
  await expect(page.getByRole('heading', { name: 'Аудит-лог', level: 1 })).toBeVisible();

  // Время первой строки — событие login только что; оно должно совпасть с текущим МСК (±5 мин).
  // До фикса бэкенд отдавал naive-UTC, и браузер показывал время на 3 часа назад.
  const firstRow = page.locator('table tbody tr').first();
  const timeText = (await firstRow.locator('td').nth(1).innerText()).trim();
  const m = timeText.match(/(\d{2})\.(\d{2})\.(\d{4}),\s*(\d{2}):(\d{2})/);
  expect(m, `не разобрали время в аудит-логе: «${timeText}»`).not.toBeNull();
  const [, dd, mo, yyyy, hh, mi] = m!;
  // Показанное время — московское (UTC+3): переводим в UTC-момент и сравниваем с текущим.
  const shownUtc = Date.UTC(Number(yyyy), Number(mo) - 1, Number(dd), Number(hh) - 3, Number(mi));
  const diffMin = Math.abs(Date.now() - shownUtc) / 60000;
  expect(diffMin, `время в логе «${timeText}» расходится с МСК на ${diffMin.toFixed(1)} мин`).toBeLessThan(5);

  await page.screenshot({ path: '/tmp/opencode/ui-verify/audit-time.png' });
});

test('Навигация: F5 и закладка сохраняют текущую страницу', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  await page.getByPlaceholder('admin / planner / viewer').fill('admin');
  await page.getByPlaceholder('Пароль').fill('admin123');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('button', { name: 'Модель здоровья' })).toBeVisible();

  // Переход на «Модель здоровья» — страница отражается в URL (hash)
  await page.getByRole('button', { name: 'Модель здоровья' }).click();
  await expect(page.getByRole('heading', { name: 'Модель здоровья', level: 1 })).toBeVisible();
  expect(page.url()).toContain('#/graph');

  // F5 — остаёмся на «Модели здоровья», а НЕ падаем на дашборд (главный кейс)
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Модель здоровья', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Модель здоровья' })).toBeVisible();

  // Прямой заход по закладке «#/works» — открывается нужная страница
  await page.goto('http://localhost:3000/#/works');
  await expect(page.getByRole('heading', { name: 'Плановые работы', level: 1 })).toBeVisible();

  // Кнопка «назад» браузера возвращает на «Модель здоровья»
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Модель здоровья', level: 1 })).toBeVisible();

  await page.screenshot({ path: '/tmp/opencode/ui-verify/navigation.png' });
});

test('Навигация: закладка на чужую страницу не открывается (viewer → дашборд)', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  await page.getByPlaceholder('admin / planner / viewer').fill('viewer');
  await page.getByPlaceholder('Пароль').fill('viewer123');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('button', { name: 'Дашборд' })).toBeVisible();

  // Прямой заход на админ-страницу по закладке — у обычного пользователя прав нет,
  // маршрут откатывается на дашборд (страница «Пользователи» не показывается).
  await page.goto('http://localhost:3000/#/users');
  await expect(page.getByRole('heading', { name: 'Дашборд', level: 1 })).toBeVisible();
  expect(page.url()).toContain('#/dashboard');
});
