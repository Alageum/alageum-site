# ALAGEUM · Полная тестовая версия сайта

Версия для обсуждения и демонстрации, обновление каталога 1 октября 2026. Основа: репозиторий
`StiveMan1/Alageum_Temp`, исходный коммит `10de31ef9344ad00ddf53bf72ec134e56e1322d8`.
Исходные backend, API/B2B-модули и дизайн-пакет сохранены.

## Быстрый запуск

Node.js 22+, npm. Backend не нужен для публичной части и локального демо-кабинета.

```sh
cd frontend
npm ci
npm run dev
```

Открыть `http://localhost:3000`.

## Что работает

- Главная; компания; 6 профилей предприятий; 3 направления решений с чек-листами
- 4 проектных карточки с датированным статусом и официальными источниками
- Документы: 104 страницы предоставленного каталога, внешние ссылки на 2 проверенных PDF и технические каталоги
- Официальные контакты и 3 региональных отдела продаж
- Каталог: 238 справочных карточек, 65 импортированных семейств, 159 каталожных обозначений, 112 внутриcерийных вариантов; поиск, фильтры,
  сортировка, пагинация, карточки, сравнение до 4 позиций
- Локальная подборка: количества, сохранение в браузере, CSV
- Подготовка запроса: проверка полей, состав оборудования, перечень названий
  документов, предпросмотр, копирование, TXT, открытие почтовой программы
- Демо-кабинет: локальный черновик, роли заказчика/менеджера, этапы рассмотрения,
  уточнения, комментарии, история, удаление и сброс
- Адаптивные паттерны, клавиатурная навигация, состояния ошибок/пустых данных,
  источник данных в каждой продуктовой карточке, noindex для тестовой версии

## Маршруты

`/`, `/catalog`, `/catalog/source?page=1`, `/catalog/tmg-630`, `/catalog/compare?ids=tmg-630,tsl-630`,
`/selection`, `/inquiry`, `/workspace`, `/company`, `/manufacturers`, `/projects`,
`/solutions`, `/documents`, `/contacts`, `/data-policy`.

Синтетический каталог: `/catalog?source=demo`. Существующий backend-адаптер:
`/catalog?source=api`; ошибка API никогда не подменяется публичными или demo данными.
Прежние `/login`, `/b2b` и `/ai` требуют исходного backend и остаются DEV-модулями.

## Честные границы версии

Публичные справочные записи не являются утверждёнными SKU для заказа. Не заданы
цены, наличие, сроки поставки, платёжные условия и совместимость оборудования.
Параметры конкретного исполнения нужно подтвердить у производителя.

Форма не отправляет запрос на сервер. Почтовая ссылка только открывает почтовый
клиент; пользователь проверяет и отправляет письмо самостоятельно. При большом
тексте в письмо передаётся только тема, а текст предлагается скопировать.

Файлы не читаются и не загружаются: в запросе остаются только выбранные названия.
Демо-кабинет не имеет авторизации и сохраняется только в этом браузере. Не вводить
реальные банковские данные или конфиденциальные документы. Данные можно удалить
в кабинете или очистить вместе с данными сайта в браузере.

Точный состав документов покупателя, этап передачи и решение менеджера пока
не согласованы. Реальная отправка, защищённая загрузка, маршрутизация менеджеру,
уведомления, права доступа и промышленная интеграция не имитируются как готовые.

## Проверки и статический просмотр

```sh
npm run check           # lint + все unit-тесты + штатная сборка
npm run build:preview   # отдельная статическая сборка публичной версии
npm run test:e2e:catalog
```

`build:preview` копирует публичное приложение во временный `.preview-build`,
исключает API-only `/b2b`, `/login`, `/ai` и создаёт `frontend/preview-dist`.
Штатная сборка с динамическим backend-маршрутом остаётся без изменений.
Папку `preview-dist` можно отдать любым статическим сервером с поддержкой
`index.html` в подпапках. Не открывать HTML через `file://`: клиентским переходам
нужен HTTP(S). На тестовом хостинге не включать публичную индексацию.

Результаты: [проверка версии](docs/full-site-verification.md).
Вопросы к встрече: [решения и открытые вопросы](docs/full-site-meeting-questions.md).
Источники: [проверенные материалы](docs/public-content-sources.md).

## Supplied catalog expansion (1 October 2026)

The 104-page “Шкафные конструкции” catalog is integrated. `/catalog` contains 238 source-backed cards across five categories, including 65 imported families and 159 printed designation references. An additional 112 configuration/index rows remain inside their families. `/catalog/source` provides all original pages and exact page references. Five overlaps with the previous reference set were merged while retaining URLs; the customer/manager demo is unchanged. See `docs/catalog-import/README.md` for coverage, source limitations and verification. Two damaged RMU labels on page 30 remain unresolved; no orderable-SKU completeness claim is made.


## Category navigation and shared visuals · 2026-10-01

The catalog retains every one of the 238 source-backed records as an independent row. An explicit “Все товары” view supports global search and parameter filters without choosing a category first. Five broad categories and non-empty equipment subcategories narrow the same records; they do not replace individual models with family cards. Search/filter/page/comparison state remains in the URL. Saved selections and comparisons retain the original record IDs and exact designations.

Parameter summaries and available filters reflect the selected category. Volt and kilovolt values remain distinct, current/power values retain source units, and the original page-linked specification tables and warnings remain available. Source-series relationships can still be opened from details.

Shared SVG symbols and on-demand procedural Three.js models are implemented as a small reusable construction library. The rendering engine is downloaded only after opening a model in a detail view; there are no WebGL canvases in product table rows. Models support mouse, touch and keyboard rotation, zoom/reset, on-demand rendering, cleanup and an SVG fallback. They are explicitly illustrative, not CAD or verified drawings of a particular execution. Original source illustrations are retained in each applicable detail page. Navigation taxonomy and visual construction identity are separate concerns; see the visual-map documentation for drawing-level matching and exceptions.

No backend, order submission, inventory, real payment, external upload, audience or access-policy behavior is added by this change.

### Complete product icons · 2026-10-01

All 238 independent official records now receive uniform inline SVG icons, reused
from 62 construction/type silhouettes. 172 have source-based family outlines; 66
have a visible ≈ marker for a typical or unconfirmed execution (including the 10
records without a drawing). The 65 imported families and ambiguous variants are
explicitly mapped to source pages. Tiny scanned thumbnails no longer substitute
for listing icons. The same icon follows a product through its summary, variant
card, comparison and selection. Original drawings and existing lazy 3D behavior
remain unchanged. See `docs/catalog-import/icons-validation.md` for verification.

## Корпоративные страницы · 2026-10-01

Переработаны главная, компания, география предприятий и контакты. Сохранены все
238 записей каталога, продуктовые иконки, админка и конфигурация Vercel. Карта
показывает подтверждённые города (не проходные заводов), выбор сохраняется в URL.
Контакты содержат 11 официальных региональных отделов и 6 контактов предприятий.

`npm run test:e2e:company` проверяет desktop/mobile; `npm run audit:company`
создаёт PNG и JSON-аудит в четырёх размерах экрана. Workflow
`Company pages browser QA` сохраняет артефакты для визуального ревью.
Источники и права фотографий: `docs/company-pages-sources.md`.
Пределы проверки и вопросы: `docs/company-pages-review.md`.
