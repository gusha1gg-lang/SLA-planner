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
  // Логин админом (аудит-лог — admin-only).
  await page.goto('http://localhost:3000/');
  await page.getByPlaceholder('admin / planner / viewer').fill('admin');
  await page.getByPlaceholder('Пароль').fill('admin123');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('button', { name: 'Аудит-лог' })).toBeVisible();
  await page.getByRole('button', { name: 'Аудит-лог' }).click();
  await expect(page.getByRole('heading', { name: 'Аудит-лог', level: 1 })).toBeVisible();

  // На свежей БД аудит-лог пуст — сверять нечего (тест данных-зависимый).
  const token = await page.evaluate(() => localStorage.getItem('sla_token'));
  const resp = await page.request.get('http://localhost:8000/api/audit/?limit=1', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const items = await resp.json();
  if (!Array.isArray(items) || items.length === 0) {
    test.skip(true, 'аудит-лог пуст — нет записей для сверки времени');
  }

  // Сверяем время первой строки с ISO-моментом той же записи из API: в UI должно быть
  // МСК (UTC+3). До фикса бэкенд отдавал naive-UTC, и браузер показывал время на 3 ч назад.
  const firstRow = page.locator('table tbody tr').first();
  const displayed = (await firstRow.locator('td').nth(1).innerText()).trim();

  const iso: string = items[0].created_at;
  // naive-строку (если бэкенд снова сломается) трактуем как UTC — так поймаем регресс.
  const isoUtc = /(Z|[+-]\d{2}:\d{2})$/.test(iso) ? iso : `${iso}Z`;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(isoUtc));
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  const expected = `${get('day')}.${get('month')}.${get('year')}, ${get('hour')}:${get('minute')}`;

  expect(displayed, `в логе «${displayed}», а МСК для ${iso} — «${expected}»`).toBe(expected);

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

test('Модель здоровья: выбранная модель переживает F5', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  await page.getByPlaceholder('admin / planner / viewer').fill('admin');
  await page.getByPlaceholder('Пароль').fill('admin123');
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('button', { name: 'Модель здоровья' }).click();

  const select = page.locator('select');
  await expect(select).toBeVisible();
  const options = select.locator('option');
  expect(await options.count(), 'нужно ≥2 моделей здоровья для теста').toBeGreaterThan(1);

  // Выбираем НЕ первую модель (иначе совпадёт с дефолтом)
  const target = await options.nth(1).getAttribute('value');
  await select.selectOption(target!);
  await expect(select).toHaveValue(target!);
  // Выбор отражается в URL (закладка)
  expect(page.url()).toContain(`#/graph?model=${target}`);

  // F5 — остаётся выбранная модель, а не верхняя из списка
  await page.reload();
  await expect(page.locator('select')).toHaveValue(target!);
  expect(page.url()).toContain(`#/graph?model=${target}`);

  await page.screenshot({ path: '/tmp/opencode/ui-verify/graph-model-f5.png' });
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

test('Пользователи: при создании нет выбора групп (группы — только на странице «Группы»)', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  await page.getByPlaceholder('admin / planner / viewer').fill('admin');
  await page.getByPlaceholder('Пароль').fill('admin123');
  await page.getByRole('button', { name: 'Войти' }).click();

  await page.getByRole('button', { name: 'Пользователи' }).click();
  await expect(page.getByRole('heading', { name: 'Пользователи', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Добавить' }).click();
  await expect(page.getByRole('heading', { name: 'Новый пользователь' })).toBeVisible();

  // Назначения групп при создании нет: чекбоксов нет, есть подсказка про страницу «Группы»
  await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(page.getByText('Состав групп задаётся на странице «Группы»')).toBeVisible();

  await page.screenshot({ path: '/tmp/opencode/ui-verify/user-create.png' });
});

test('Тема: переключение light/dark и сохранение после F5', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  await expect(page.getByRole('heading', { name: 'SLA Planner', level: 1 })).toBeVisible();

  // По умолчанию — светлая тема.
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false);

  // Переключатель на логине: светлая → тёмная.
  await page.getByLabel('Включить тёмную тему').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
  // Фон страницы берётся из токена темы (тёмная канва), а не из хардкода.
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(11, 16, 23)');

  // Выбор переживает F5 (localStorage + скрипт в index.html до бандла).
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(11, 16, 23)');

  // Обратно в светлую.
  await page.getByLabel('Включить светлую тему').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false);
});

test('Кнопки: действия страниц — единый примитив Button (модалка «Новая работа»)', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  await page.getByPlaceholder('admin / planner / viewer').fill('admin');
  await page.getByPlaceholder('Пароль').fill('admin123');
  await page.getByRole('button', { name: 'Войти' }).click();

  await page.getByRole('button', { name: 'Плановые работы' }).click();
  await expect(page.getByRole('heading', { name: 'Плановые работы', level: 1 })).toBeVisible();

  // Кнопка-действие — примитив Button: единый класс микро-интеракций (ease-standard).
  const create = page.getByRole('button', { name: 'Создать работу' });
  await expect(create).toHaveClass(/ease-standard/);

  await create.click();
  await expect(page.getByRole('heading', { name: 'Новая плановая работа' })).toBeVisible();

  // Кнопки футера модалки — тоже примитивы Button; submit — реальная отправка формы.
  const submit = page.getByRole('button', { name: 'Создать', exact: true });
  await expect(submit).toHaveClass(/ease-standard/);
  await expect(submit).toHaveAttribute('type', 'submit');
  await expect(page.getByRole('button', { name: 'Отмена', exact: true })).toHaveClass(/ease-standard/);

  await page.screenshot({ path: '/tmp/opencode/ui-verify/buttons-modal.png' });
});

test('Анимации: модалка и карточки дашборда появляются плавно', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  await page.getByPlaceholder('admin / planner / viewer').fill('admin');
  await page.getByPlaceholder('Пароль').fill('admin123');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('button', { name: 'Дашборд' })).toBeVisible();

  // Каскадное появление карточек дашборда (.stagger > *).
  const card = page.locator('.stagger > *').first();
  await expect(card).toBeVisible();
  expect(await card.evaluate(el => getComputedStyle(el).animationName)).toBe('fade-in-up');

  // Модалка новой работы: оверлей и панель анимируются (overlay-in / scale-in).
  await page.getByRole('button', { name: 'Плановые работы' }).click();
  await page.getByRole('button', { name: 'Создать работу' }).click();
  const overlay = page.locator('.animate-overlay-in').first();
  const panel = page.locator('.animate-scale-in').first();
  await expect(panel).toBeVisible();
  expect(await overlay.evaluate(el => getComputedStyle(el).animationName)).toBe('overlay-in');
  expect(await panel.evaluate(el => getComputedStyle(el).animationName)).toBe('scale-in');
});

test('Модель здоровья: индивидуальный цвет узла (клик по узлу → пикер → сброс)', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  await page.getByPlaceholder('admin / planner / viewer').fill('admin');
  await page.getByPlaceholder('Пароль').fill('admin123');
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('button', { name: 'Модель здоровья' }).click();
  await expect(page.locator('canvas')).toBeVisible();

  // Базовые цвета (fallback) видны в шапке
  await expect(page.getByText('Цвет SLA по умолчанию')).toBeVisible();
  await expect(page.getByText('Цвет услуг по умолчанию')).toBeVisible();

  // Выбираем первую услугу в «Структуре модели» — появляется панель цвета узла
  await page.locator('button[title*="(id="]').first().click();
  const colorInput = page.getByTitle('Задать этому узлу свой цвет (только для текущей модели)');
  await expect(colorInput).toBeVisible();
  await expect(page.getByText('Базовый цвет (свой не задан)')).toBeVisible();

  // Ставим индивидуальный цвет: ждём реальный PUT /api/graph/colors/node
  const put = page.waitForResponse(
    r => r.url().includes('/api/graph/colors/node') && r.request().method() === 'PUT'
  );
  await colorInput.evaluate((el: HTMLInputElement) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, '#ff0000');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect((await put).status(), 'индивидуальный цвет сохраняется на бэкенде').toBe(200);

  const resetBtn = page.getByRole('button', { name: 'Сбросить цвет' });
  try {
    // Узел должен реально перекраситься на canvas графа (ищем красные пиксели)
    const countRed = async () => {
      const perCanvas = await page.locator('canvas').evaluateAll((cs) =>
        cs.map((c) => {
          const el = c as HTMLCanvasElement;
          const ctx = el.getContext('2d');
          if (!ctx || !el.width || !el.height) return 0;
          const { data } = ctx.getImageData(0, 0, el.width, el.height);
          let n = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 200 && data[i + 1] < 80 && data[i + 2] < 80 && data[i + 3] > 200) n++;
          }
          return n;
        })
      );
      return perCanvas.reduce((a, b) => a + b, 0);
    };
    await expect.poll(countRed, { message: 'узел перекрашен в красный на графе', timeout: 8000 })
      .toBeGreaterThan(0);

    await expect(resetBtn).toBeVisible();
    await page.screenshot({ path: '/tmp/opencode/ui-verify/node-color.png' });

    // Сброс к базовому цвету: ждём реальный DELETE
    const del = page.waitForResponse(
      r => r.url().includes('/api/graph/colors/node') && r.request().method() === 'DELETE'
    );
    await resetBtn.click();
    expect((await del).status()).toBe(200);
    await expect(page.getByText('Базовый цвет (свой не задан)')).toBeVisible();
    await expect.poll(countRed, { message: 'базовый цвет вернулся', timeout: 8000 }).toBe(0);
  } finally {
    // страховка: не оставляем тестовый цвет на живом узле
    if (await resetBtn.count()) await resetBtn.click().catch(() => {});
  }
});

test('Модель здоровья: под услугой на графе виден статус (OK и критичность)', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  await page.getByPlaceholder('admin / planner / viewer').fill('admin');
  await page.getByPlaceholder('Пароль').fill('admin123');
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('button', { name: 'Модель здоровья' }).click();

  // Модель с известными проблемами в живом Zabbix (Q3MET ТЭСЦ-1: есть и OK, и «Высокая»).
  const select = page.locator('select');
  await expect(select).toBeVisible();
  const options = select.locator('option');
  let target: string | null = null;
  for (let i = 0, n = await options.count(); i < n; i++) {
    const text = (await options.nth(i).innerText()).trim();
    if (text.startsWith('Q3MET ТЭСЦ-1 ')) { target = await options.nth(i).getAttribute('value'); break; }
  }
  expect(target, 'в списке моделей есть Q3MET ТЭСЦ-1').not.toBeNull();
  await select.selectOption(target!);
  await expect(page.locator('canvas')).toBeVisible();

  // Строка статуса рисуется на canvas. Текст мелкий и антиалиасится о тёмный фон, поэтому
  // проверяем адресно: приближаемся к каждому узлу-услуге и ищем пиксели цвета его статуса.
  // Узлы берём из dev-хука графа (window.__graphNetwork — только в DEV).
  const perNode = await page.evaluate(async () => {
    const net = (window as any).__graphNetwork;
    type Row = { label: string; boldColor?: string; green: number; red: number };
    const rows: Row[] = [];
    for (const id of Object.keys(net.body.nodes)) {
      const node = net.body.nodes[id];
      const label: string = node.options?.label ?? '';
      if (label.includes('\n') === false) continue; // SLA-узлы статуса не несут
      const pos = net.getPositions([id])[id];
      net.moveTo({ position: { x: pos.x, y: pos.y }, scale: 2.5, animation: false });
      await new Promise((r) => setTimeout(r, 140));
      const c = net.canvas.frame.canvas as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let green = 0;
      let red = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 200) continue;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (Math.abs(r - 0x59) <= 50 && Math.abs(g - 0xdb) <= 50 && Math.abs(b - 0x8f) <= 50) green++;
        if (Math.abs(r - 0xe9) <= 50 && Math.abs(g - 0x76) <= 50 && Math.abs(b - 0x59) <= 50) red++;
      }
      rows.push({ label, boldColor: node.labelModule?.fontOptions?.bold?.color, green, red });
    }
    return rows;
  });

  expect(perNode.length, 'в модели есть услуги со статусом').toBeGreaterThan(0);
  let okCount = 0;
  let problemCount = 0;
  for (const row of perNode) {
    if (row.label.includes('<b>OK</b>')) {
      okCount++;
      expect(row.boldColor, `цвет строки OK у «${row.label}»`).toBe('#59DB8F');
      expect(row.green, `зелёная строка статуса видна у «${row.label}»`).toBeGreaterThan(0);
    } else if (/<b>Проблема: Высокая<\/b>/.test(row.label)) {
      problemCount++;
      expect(row.boldColor, `цвет строки «Проблема: Высокая» у «${row.label}»`).toBe('#E97659');
      expect(row.red, `красная строка статуса видна у «${row.label}»`).toBeGreaterThan(0);
    }
  }
  expect(okCount, 'есть услуги в статусе OK').toBeGreaterThan(0);
  expect(problemCount, 'есть услуги в статусе «Высокая»').toBeGreaterThan(0);

  await page.screenshot({ path: '/tmp/opencode/ui-verify/node-status.png' });
});
