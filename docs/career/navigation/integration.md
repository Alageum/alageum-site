# Согласованная интеграция общей шапки и футера

Не копировать целиком SiteHeader/SiteFooter из этой ветки в основной checkout: там уже есть работа другого агента над Company, `companyMenuLinks`, `companyResources`, `HeaderContact` и мобильными ресурсами. Сохранить эти изменения.

Точный набор careers-правок:

1. Импортировать `careerSections`, `careerSectionIndex` из `@/components/careers/navigation`; заменить старую inline-конфигурацию careers. Остальные наборы пунктов не менять.
2. Только для area careers вычислять currentIndex через careerSectionIndex(pathname). Это исключает активность корня на всех дочерних страницах.
3. Пункты с пустыми links — обычные ссылки: без Chevron, aria-expanded/controls, hover/focus открытия и ArrowDown. Не рендерить desktop mega-panel при area careers. В мобильном меню не рендерить пустые кнопки раскрытия и панели. Company/catalog с дочерними links сохраняют существующее поведение.
4. У существующей кнопки «Оставить резюме» добавить условный класс `career-resume-link`; красный цвет находится в локальном careers.css, общие стили не менять.
5. В SiteFooter импортировать `careerFooterGroups` из той же конфигурации; заменить только careers ветвь выбора nav. Common/catalog и корпоративные ресурсы сохранить.
6. Подключить `docs/career/redirects.json` в согласованной общей конфигурации redirects/reverse proxy, не дублируя локализованные правила. Для отсутствующих публикаций до streaming render требуется общий ответ HTTP404.

`shared-integration.patch` фиксирует точные адаптерные изменения относительно базы worktree career. Это материал для ручного согласованного объединения, не команда для слепого применения к изменённой общей шапке. Никакой merge здесь не выполнен.
