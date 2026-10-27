# Комплект кода для администратора: 23 октября 2026

Назначение: исходники, lock-файлы, переносимый deployment-комплект и инструкция
для администратора. Это **не опубликованный production-сайт и не разрешение
на открытие трафика**. Рабочая база: `3b817bbfcb11f2952f292ec078d790f546bc22e7`;
точный коммит передачи и SHA-256 архива находятся в сопроводительном файле.

Начните с [краткой памятки](../ADMINISTRATOR-RU.md), затем используйте
[полное руководство](../server-deployment.md). Никакие серверы, домены,
секреты или внешние учётные записи этим изменением не настраивались.

## Что исправлено

- Next.js и его ESLint-конфигурация закреплены на **16.4.2** вместо 16.3.8.
  Удалены новые critical/high advisory записи Next. Официальные исправления
  начинаются с 16.4.1: [SVG/Image Optimization](https://github.com/advisories/GHSA-2464-fhr4-w9xw),
  [use cache](https://github.com/advisories/GHSA-673q-mjm6-r5xr),
  [Server Actions](https://github.com/advisories/GHSA-p3m5-59mp-jv5r).
- Совместимые backend-обновления DOMPurify, markdown-it, Vite и MCP SDK убрали
  все текущие critical-записи backend. Strapi 5.56.0 и защищённые байты
  native-editor/webpack adapters сохранены. [Полный разбор](../../backend-node/docs/security-2026-10-23/README.md).
- Сборка Next ограничена двумя prerender-воркерами. Первый прогон с восемью
  завершился нехваткой ресурсов; повтор с ограничением успешно собрал весь
  обычный standalone. Маршруты, проверки и runtime от этого не упрощены.
- Необязательный `build:preview` теперь перечисляет статические slug/locale,
  принудительно использует сохранённые новости, не требует request headers
  и не предлагает создание документов с несуществующими статическими ID.
  Preview явно помечен как снимок, а обычная CMS/Next-сборка остаётся динамической.
- Убрана битая ссылка на отсутствующий оригинал PDF трансформаторов.
  RU/KK/EN-уведомление честно объясняет отдельную передачу оригинала;
  все 187 постраничных изображений доступны, другой комплектный PDF сохранён.
- Добавлены воспроизводимый HTTP smoke standalone, целевые security/link/preview
  регрессионные тесты и короткая инструкция администратору.

## Что проверено на обновлённом коде

Среда: Node 24.19.0, npm 11.9.0. Зависимости установлены по lock-файлам.

- Backend: полный `npm run check` — **776/776**, без пропусков; итоги в
  [verification.json](../../backend-node/docs/security-2026-10-23/verification.json).
- Настоящая сборка Strapi admin через `node scripts/build-container.js` успешна.
- Disposable PostgreSQL 17.11: **9/9** production/account/mail/operator tests
  и **6/6** native News/CMS lifecycle tests. Почта синтетическая, не внешний SMTP.
- Connected Next standalone: успешны compile, TypeScript и генерация **1 221**
  страниц; `.next/standalone` подготовлен с публичными assets.
  [Лог сборки](frontend-build.txt).
- Backend-free HTTP smoke настоящего standalone: **19/19**.
  RU/KK/EN, публичные/auth-страницы, liveness, честная недоступность CMS,
  закрытие исходников/env и static assets. [Результат](frontend-http-smoke.json).
- Deployment/security/backup/restore contracts: **36/36** Python tests и
  **7/7** production-proof contracts; shell/JS syntax и diff checks успешны.
  [Deployment](deployment-tests.txt), [proof contracts](proof-contract-tests.txt).
- Все **350** комплектных source assets совпадают с размерами и SHA-256 manifest.
  Это не подтверждение отсутствующего исходного PDF.

- Полный frontend unit: **870** тестов, **795** успешны, **74** исторические
  ошибки, **1** opt-in output-check пропущен здесь и выполнен отдельно ниже.
- Последний `build:preview`: **4 893** статические страницы, два воркера.
  Все **10/10** focused preview/news/output tests успешны, без пропусков, включая
  настоящие RU/KK/EN HTML и переведённый текст недоступного статического кабинета.
  [Лог export](frontend-preview-build.txt), [тесты](frontend-preview-tests.txt).

Машиночитаемые итоги: [verification.json](verification.json). Исторические
ограничения ниже остаются обязательной частью результата.

## Что не зелёное и не подтверждено

1. **Dependency audit не полностью чистый.** Frontend production audit:
   **0**; полный frontend audit: **5 high**, цепочка dev-ESLint/braces.
   Backend: **32** затронутые записи, **29 high, 3 moderate, 0 critical**.
   Это наследуемые package-записи, а не 32 независимых дефекта. Неустранённые
   roots: braces без upstream-исправления, React Router 6 с исправлениями только
   в 7.x, stream-json 1 с переходом API на 3.x. Принудительные major overrides
   не делались. Не открывать untrusted CMS/dev/import поверхности и не считать
   эти меры заменой устранению/оценке риска. Точные условия, используемые Strapi
   API и дальнейшие действия указаны в [backend-разборе](../../backend-node/docs/security-2026-10-23/README.md).
2. **Общий frontend aggregate сохраняет 74 исторические ошибки**:
   65 старых approval/hash mismatch, 8 отсутствующих исторических browser-log
   зависимостей, 1 оригинальный PDF. Новые хеши не выдаются за старое согласование;
   проверки не удалены, не переписаны и не скрыты. [Разбор и подлинные хеши](frontend-validation.md).
3. **Свежая браузерная приёмка не выполнена.** Запуск Chromium в текущем
   executor блокируется запретом Unix socket до выполнения assertions;
   разрешённый cloud browser не видит loopback отдельного executor
   (`ERR_CONNECTION_REFUSED`). HTTP smoke не выдаётся за hydration/browser test.
   Отдельный повторяемый sanitizer browser test передан администратору.
4. **Полная Docker/Compose/TLS/ClamAV/backup-restoration приёмка этого обновления
   не выполнена.** Docker здесь отсутствует. Успешный hosted proof от 19 октября
   относится к своему прежнему коммиту; он не переносится автоматически на
   новые зависимости. Перед production необходим новый `self-hosted-server.yml`
   или эквивалентный закрытый прогон целевого комплекта.
5. **Реальный сервер и интеграции не настраивались.** Домен/TLS, SMTP,
   секреты, роли, данные и off-host backup задаёт администратор. eGov/ЭЦП,
   Google и demo/import в production template отключены. Это не подразумевает
   готовность криптографического подписания, внешнего почтового сервиса или DNS.

Сборка и функциональные проверки делают комплект пригодным для технической
передачи и закрытой приёмки администратором, но оставшиеся audit/evidence и
непройденные deployment/browser стадии не позволяют назвать его полностью
безопасным или одобренным для production.

## Повторение проверок

Из корня распакованного checkout:

```sh
npm ci --prefix backend-node
npm ci --prefix frontend
(cd backend-node && npm run check)
(cd frontend && npm run lint && npm run test:unit)
(cd frontend && npm run build:standalone && node scripts/check-admin-package.mjs)
(cd frontend && npm run build:preview && ALAGEUM_PREVIEW_OUTPUT_TEST=1 node --test tests/static-preview-routes.test.mjs)
python3 -m unittest discover -s deploy/tests -v
node --test deploy/ci/proof-contract.test.mjs
(cd frontend && npm audit --omit=dev)
(cd frontend && npm audit)
(cd backend-node && npm audit)
```

Python deployment tests требуют PyYAML. `npm run test:unit` ожидаемо завершится
ненулевым кодом, пока не восстановлены/пересогласованы исторические доказательства.
Не связывайте это с разрешением игнорировать новые ошибки: сравните их с точным
отчётом. Команды настоящих backend/браузерных проверок приведены в linked отчётах.
