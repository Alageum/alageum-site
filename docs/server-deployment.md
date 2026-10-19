# Перенос ALAGEUM на собственный сервер

## Статус и граница готовности

Подготовлен переносимый комплект для Linux-сервера: Next.js standalone,
Node.js/Strapi, PostgreSQL 17, ClamAV/FreshClam и Nginx с HTTPS. В рабочем
развёртывании нет обязательного Vercel CLI, Vercel Services или Vercel runtime.
Существующие бизнес-функции и CMS используют один HTTPS-origin.
Минимальные retired-host `vercel.json`/ignore guards намеренно отклоняют новые
сборки/маршруты на старом хостинге; это не runtime-зависимость и не отключение
аккаунта. Владелец отдельно отключает Git/project integration и проверяет старые
публикации в Vercel. Уже опубликованные сайты не изменяются от этого коммита;
Git integration может получить исходники до срабатывания build guard.

Это инструкция и исходный комплект, **не сообщение об уже выполненном переносе**.
Нужны выбранный сервер/домен, реальные сертификаты, независимые секреты,
разрешённый SMTP-провайдер, содержимое БД/медиа и проверка на целевом сервере.
Статические проверки конфигурации не доказывают доставку почты, работоспособность
контейнеров, сохранность томов или восстановление из резервной копии.

Рабочий файл: `deploy/compose.production.yml`. Не объединять его с корневыми
`docker-compose.yml` (исторический Python DEV) или `docker-compose.node.yml`
(локальная Node-разработка). `make bootstrap/reset/restore` относится к старому
стеку и **не применяется** к новому серверу.

## Зафиксированная приёмка 19 октября 2026

Проверенный код приложения: [`2468d1f52c1d39d12fe6fbde75d59af1562fbec4`](https://github.com/Alageum/alageum-site/commit/2468d1f52c1d39d12fe6fbde75d59af1562fbec4).
[Полный hosted Compose proof](https://github.com/Alageum/alageum-site/actions/runs/39242186617/job/118025417173)
**успешен: 14/14 проверок**, итоговый код 0; все пять восстановленных сервисов
healthy. [Артефакт результатов](https://github.com/Alageum/alageum-site/actions/runs/39242186617/artifacts/12181823883)
получен на одноразовом GitHub-hosted сервере с синтетическими данными:

- Собраны оба production-образа; реальные PostgreSQL, ClamAV, backend, frontend
  и HTTPS reverse proxy запущены с конфигурацией `deploy/compose.production.yml`.
- Проверены сертификат/имя HTTPS, редирект HTTP, TLS PostgreSQL, минимальные права
  приложения и отказ plaintext DB. Нативная CMS и Next `/admin/catalog` разделены;
  публичное создание первого CMS-администратора закрыто.
- Регистрация, реальное локальное STARTTLS-письмо, подтверждение email,
  HttpOnly/Secure cookie, CSRF и границы браузерной сессии и Chromium-вход прошли.
  ClamAV принял чистый файл и отклонил стандартный безвредный EICAR.
- Пересоздание контейнеров сохранило БД, сессию и публичные/приватные байты.
  Парный backup восстановлен в **новую пустую** цель; после запуска восстановленного
  стека прежняя подтверждённая учётная запись/сессия и медиа сохранились.
  Повторное восстановление в непустую цель отклонено.
- После восстановления письмо сброса пароля доставлено в локальный TLS capture;
  старый cookie отозван, вход с новым паролем и выход прошли.

[Независимый production/backend job](https://github.com/Alageum/alageum-site/actions/runs/39242186617/job/118025417773)
прошёл 9 проверок production/bootstrap и 6 проверок нативного News lifecycle.
Локально на тех же исходниках прошли 772 backend unit-проверки, 24 PostgreSQL
проверки EDS и 6 EDS HTTP-проверок. Отдельный настоящий `pg_dump`/`pg_restore`
PostgreSQL 17 подтвердил повторный запуск Strapi: две эквивалентные формы enum
CHECK принимаются строго по полному выражению; изменённая/ослабленная схема
по-прежнему отклоняется. Это не подтверждает криптографический EDS-провайдер.

**Полный общий CI не зелёный.** Неустранённые ограничения сохранены:

- `npm audit`: backend 32 затронутых записи (29 high, 3 moderate, 0 critical),
  frontend 5 high в dev-цепочке braces/ESLint. Эти проверки не подавлены;
  `npm audit --force` и несовместимые downgrade/override не применялись.
- Общий frontend aggregate сохраняет 74 исторические source-approval/evidence/PDF
  ошибки. Подписи/approval hashes не переписаны ради зелёного результата.
- Необязательный старый `build:preview` с `output:export` останавливается на
  `/careers/[slug]` без `generateStaticParams`. Обычный server/standalone build
  (1 221 маршрут) и серверные HTTP/browser проверки прошли; Compose этот export
  не использует. Page runtime, CMS authority и быстрые сохранения прошли до этого
  отдельного export-шага.
- Реальный целевой сервер, DNS/сертификаты, SMTP-провайдер и доставляемость,
  секреты, содержимое каталога/новостей, операторские роли, firewall и внешний
  backup требуют настройки владельцем. Google/eGov/EDS-интеграции без выданных
  реквизитов/провайдера не объявляются готовыми.

Эти результаты доказывают переносимость проверенного комплекта и восстановление
в тестовом окружении. Они не означают внешний production cutover, снятие
уязвимостей или приёмку конкретного сервера. Если следующий коммит меняет только
этот отчёт, runtime-доказательство выше относится к неизменённым файлам приложения,
Docker/Compose и тестов; их Git blobs должны совпадать с указанным SHA.

## 1. Архитектура и ограничения

| Компонент | Внутри контейнера | Публичный доступ |
|---|---|---|
| Nginx | HTTPS 443; HTTP 80 перенаправляет | Только 80/443 |
| Next standalone | 3000 | Через Nginx |
| Strapi и встроенный почтовый worker | 8000 | Через Nginx |
| PostgreSQL | 5432, проверяемый TLS | Нет |
| ClamAV/FreshClam | 3310, отдельная частная сеть | Нет |

- `/api/v1/**`, `/cms/**`, нативные CMS `/admin/**`, `/content-manager/**`,
  `/upload/**` и `/uploads/**` направлены в Strapi.
- `/admin/catalog` и его подпути остаются интерфейсом Next. Остальные публичные
  страницы, включая `/news`, обслуживает Next. CMS-учётные записи отделены от
  бизнес-учётных записей; Nginx не заменяет проверку прав Strapi.
- Браузер использует `/api/v1`; SSR использует только серверную переменную
  `API_INTERNAL_BASE_URL=http://backend:8000/api/v1`.
- Почтовая очередь хранится в PostgreSQL; worker запускается в Strapi bootstrap.
  Отдельный `worker`-контейнер запускал бы вторую копию приложения и не нужен.
- Один backend в этом комплекте. Масштабирование, multi-host и внешний CDN/LB
  требуют отдельного проектирования доверенных адресов/томов и проверки.
- Демо-данные, автоматический импорт каталога, EDS и Google отключены. Первичную
  миграцию реальных данных выполняют отдельно по согласованному плану. Пустой
  сервер не получает реальные продукты/пользователей из воздуха.
- Новая загрузка медиа: только PNG/JPEG/WebP, после реального антивируса; замена
  бинарного файла и произвольные новые PDF по-прежнему недоступны.

Нужны Linux x86_64, Docker Engine с BuildKit, Compose **2.30+**, Bash,
Python **3.11+**, OpenSSL/`curl` для проверки и достаточный диск. Зафиксированный
официальный ClamAV manifest в этом комплекте имеет только `linux/amd64`.
Для ARM нужен отдельно проверенный официальный образ/пакет и повтор всех
проверок; эмуляцию нельзя считать доказанной эксплуатационной конфигурацией.
PostgreSQL major 17 выбран под проверяемый приложением контракт схемы. Major 18
имеет несовместимость с текущей проверкой формы ограничений и не поддерживается
этим комплектом; не заменять image на latest.
Практический стартовый бюджет: от 8 GiB RAM для работы, больше для одновременной
сборки; ClamAV выделено 4 GiB. Это ориентир, а не нагрузочный тест.

Базовые Node/PostgreSQL/Nginx/ClamAV образы закреплены по SHA-256 digest; `npm ci`
использует lock-файлы. Сборка backend также использует Debian build packages,
поэтому не заявляется побайтовая воспроизводимость пересборки спустя годы.
Для точного rollback храните **готовые образы** этого релиза и их digest вместе
с парным backup. Обновления образов/сигнатур требуют регулярного обслуживания.

## 2. Конфигурация без секретов в репозитории

Переносить полный отслеживаемый checkout нужного коммита, включая исходные
медиа, которые проверяют source/package guards. Не использовать урезанную копию
из тестовой машины. Не отключать byte/hash guards, если чего-то не хватает.

Скопировать шаблоны вне checkout:

- `deploy/.env.example` → `/etc/alageum/stack.env`
- `deploy/backend.env.example` → `/etc/alageum/backend.env`

`stack.env` содержит пути, DNS-имя, имя проекта и точный `ALAGEUM_RELEASE`
(например, SHA коммита). `backend.env` содержит реальные значения, режим `0600`.
Compose читает backend env в формате **raw**: без shell-кавычек и без подстановок
`${...}`. Никогда не выполнять `source backend.env`, не включать `set -x`,
не печатать `docker compose config` в логи: там могут быть секреты.

Все секреты должен предоставить уполномоченный оператор/secret manager:

- 2–8 независимых `APP_KEYS`, каждый минимум 32 символа;
- отдельные `ADMIN_JWT_SECRET`, `API_TOKEN_SALT`, `TRANSFER_TOKEN_SALT`,
  `ENCRYPTION_KEY`, `ALAGEUM_JWT_SECRET`;
- разные пароли PostgreSQL администратора и `alageum_app`;
- данные уже согласованного SMTP-провайдера.

Пароли PostgreSQL хранятся в файлах `postgres-admin-password` и
`postgres-app-password` внутри `ALAGEUM_SECRET_DIR`. В них только пароль, без
кавычек; владелец `999:999`, режим `0400` (пользователь официального Debian
PostgreSQL образа должен их читать). Родительский каталог на хосте закрыт root.
`DATABASE_URL` использует **app**, не superuser:

```text
postgresql://alageum_app:<URL-encoded app password>@postgres:5432/alageum_strapi
```

Пароль в URL и `postgres-app-password` должны совпадать. Не добавлять URL query
параметры: они могут переопределять проверку TLS. Приложение не получает пароль
DB-администратора. Первичная инициализация создаёт отдельную роль без superuser,
CREATEDB, CREATEROLE или replication; права владельца ограничены этой БД.
Init-скрипт запускается только на **пустом** PGDATA. Изменение файла с паролем
не меняет пароль существующей роли автоматически.

Не заменять `ALAGEUM_JWT_SECRET` при обычном переносе существующей БД: он также
защищает зашифрованные задания почтовой очереди. Сохранить исходный набор ключей
в отдельно согласованной защищённой копии. Ротацию проводить отдельным планом.

## 3. Постоянные директории и TLS

Предполагаемая структура хоста:

```text
/srv/alageum/data/
  postgres/             PostgreSQL, владелец 999:999, 0700
  public/               backend UID/GID 1000:1000, 0755
    uploads/            backend UID/GID 1000:1000, 0755
  private-quarantine/   backend UID/GID 1000:1000, 0700
  clamav/               только база антивирусных сигнатур
/etc/alageum/
  stack.env
  backend.env
  secrets/
    postgres-admin-password
    postgres-app-password
  tls/
    postgres/ca.crt
    postgres/server.crt
    postgres/server.key
    https/fullchain.pem
    https/privkey.pem
```

Создание каталогов выполняет оператор на выбранном сервере, например:

```sh
sudo install -d -m 0755 /srv/alageum/data
sudo install -d -m 0700 -o 999 -g 999 /srv/alageum/data/postgres
sudo install -d -m 0755 -o 1000 -g 1000 /srv/alageum/data/public /srv/alageum/data/public/uploads
sudo install -d -m 0700 -o 1000 -g 1000 /srv/alageum/data/private-quarantine
sudo install -d -m 0755 /srv/alageum/data/clamav
```

Это не перенос существующих данных. Уже имеющиеся uploads копируют с точными
именами/байтами и подходящей DB-копией; операции выполняют при остановленных
писателях. Не делать рекурсивный `chmod/chown` произвольного существующего тома.
На хосте и внутри контейнера пути не должны содержать symlink. Public root
содержит **только uploads**; никакие env, backups, private docs или quarantine
не находятся в нём. Bind mounts имеют `create_host_path: false`: отсутствие
директории останавливает запуск, а не создаёт незаметное временное хранилище.
Rootless Docker/user namespace remapping меняет соответствие UID и требует
отдельной проверки владельцев до запуска.

TLS предоставляется оператором, без автоматического выпуска сертификатов:

- HTTPS fullchain/key для точного `ALAGEUM_HOSTNAME`. `privkey.pem` root `0600`;
  сертификат `0644`. Каталог монтируется только в Nginx.
- PostgreSQL server certificate с SAN **DNS:postgres**, доверенный выделенному
  CA. `ca.crt` `0644`, `server.crt` `0644`, `server.key` root:999 `0640` либо
  postgres:postgres `0600`. Каталог доступен PostgreSQL для traversal.
- Только публичный CA-сертификат монтируется в backend; private CA key туда
  не передаётся. `NODE_EXTRA_CA_CERTS` добавляет доверенный CA без отключения
  проверки имени/цепочки. `DATABASE_SSL=true` обязателен.
- Сертификаты продлевать до истечения; после проверки нового HTTPS сертификата
  выполнить `./deploy/compose.sh /etc/alageum/stack.env exec proxy nginx -t`,
  затем `... exec proxy nginx -s reload`. Обновление DB TLS требует собственного
  проверенного плана перезагрузки. Не использовать `curl -k` как приёмку TLS.

Сети 172.30.44.0/24 (edge/app), 172.30.45.0/24 (scanner), 172.30.46.0/24
(database) не должны пересекаться с существующими сетями сервера/VPN. Backend
доверяет только Nginx `172.30.44.2`. Nginx **заменяет**, а не дополняет,
входящие forwarded headers. У PostgreSQL разрешены TLS-подключения app-роли
только с `172.30.46.3`; база не публикует порт. ClamAV не публикует 3310;
его приватная сеть содержит только backend и scanner. Scanner имеет исходящий
доступ для официальных обновлений FreshClam; backend для SMTP. Docker host и
пользователи Docker являются доверенными администраторами. Фаервол и сетевую
изоляцию проверяет оператор; этот комплект их не меняет.

Если меняются CIDR/IP, согласованно обновить Compose, `pg_hba.conf`,
trusted-proxy/scanner переменные, проверку конфигурации и тесты. Нельзя просто
включить доверие всем proxy или убрать проверку TLS.

## 4. Сборка и закрытая приёмка

Команды ниже выполнять на согласованном тестовом/целевом сервере после
заполнения конфигурации. Для Docker могут потребоваться права администратора.
Сначала проверить изолированную staging-копию, не production-данные.

```sh
./deploy/compose.sh /etc/alageum/stack.env config --quiet
./deploy/scripts/check-config.sh /etc/alageum/stack.env
./deploy/compose.sh /etc/alageum/stack.env build --pull backend frontend
./deploy/compose.sh /etc/alageum/stack.env up -d --wait --wait-timeout 1200 postgres clamav
```

Первое скачивание сигнатур может быть долгим. Проверять логи FreshClam и дату
сигнатур; PING/health status не доказывает их свежесть. До открытия ingress:

```sh
./deploy/compose.sh /etc/alageum/stack.env run --rm --no-deps --entrypoint node backend scripts/check-production-readiness.js
./deploy/compose.sh /etc/alageum/stack.env run --rm --no-deps --entrypoint node backend scripts/check-media-scanner.js
./deploy/compose.sh /etc/alageum/stack.env up -d --wait --wait-timeout 300 backend frontend
./deploy/compose.sh /etc/alageum/stack.env up -d --wait proxy
./deploy/compose.sh /etc/alageum/stack.env ps
```

Inspector exit 0 означает корректную конфигурацию и локальные права каталогов.
Он не запускает БД/SMTP и не подтверждает release evidence. Scanner diagnostic
использует безопасное PNG и стандартную безвредную тестовую строку EICAR;
нужны успешная проверка чистого файла и отказ EICAR **на настоящем ClamAV**.
Не подменять daemon тестовым fixture в production.

Strapi при первом запуске и обновлении выполняет свой schema sync и B2B
bootstrap. **Отдельной подтверждённой команды миграции в этом проекте нет**.
Поэтому запуск нового backend уже является этапом изменения схемы. До него
нужны согласованное окно, сохранённый старый образ, парная резервная копия и
репетиция на восстановленной БД. Не запускать несколько версий backend на одной
БД и не рассчитывать, что откат образа откатит схему.

После запуска проверять настоящий HTTPS-origin с обычной проверкой TLS:

```sh
curl --fail https://YOUR-DOMAIN/healthz
curl --fail https://YOUR-DOMAIN/api/v1/health
curl --fail https://YOUR-DOMAIN/api/v1/readiness
```

- `/healthz`: только процесс Next; `/health`: процесс API;
  `/readiness`: реальное соединение с БД. SMTP/scanner/storage recovery не
  становятся проверенными от зелёного readiness.
- В браузере: публичные страницы/каталог, вход/выход, повторная загрузка,
  Secure/HttpOnly cookie, регистрация → письмо → подтверждение, reset → письмо
  → смена пароля, серверное ограничение ролей, новый пользователь без компании.
- `/cms` и native admin login работают через HTTPS; `/admin/catalog` остаётся
  Next-интерфейсом. Публичный `/admin/register-admin` закрыт Nginx даже на пустой
  БД, чтобы первый посетитель не присвоил себе администратора. Уполномоченный
  владелец создаёт первого администратора через интерактивный native CLI:

  `./deploy/compose.sh /etc/alageum/stack.env exec backend node node_modules/@strapi/strapi/bin/strapi.js admin:create-user`

  CLI запрашивает пароль скрытым вводом. Не передавать его через `--password`,
  историю shell, чат или env шаблон. Не использовать DEV-аккаунты. После входа
  минимальные CMS-роли/права назначаются отдельно, не публичной регистрацией.
- Утверждённый SMTP From/domain, SPF/DKIM/DMARC, STARTTLS/465, receipt в реальном
  разрешённом ящике, повтор/ошибка доставки; никаких массовых пробных писем.
- Upload image → перезапуск/recreate backend → те же URL/байты и DB association.
  Не удалять тома. На изолированной копии выполнить backup/restore ниже.
- Проверить отказ при spoofed forwarded headers, недоступность 3000/8000/5432/3310
  извне, сохранение защиты CSRF и CMS/B2B разделения. Если сервер за ещё одним
  proxy/CDN, текущая схема не считается автоматически проверенной.

### Первые новости в CMS

Новая коллекция новостей Strapi изначально пуста. Редактор с согласованными
CMS-правами создаёт и публикует материалы; до публикации live API не возвращает
новость. Исторический статический источник новостей сохранён в репозитории,
но не импортируется автоматически и не подставляется незаметно вместо пустой
или недоступной CMS. Явный перенос старых новостей требует отдельной проверки
содержимого и решения редактора.

### Первичная инициализация каталога и бизнес-доступа

Connected frontend читает API-каталог. На новой пустой БД он будет пустым, пока
оператор явно не согласует импорт поставленного reference-каталога либо перенос
существующей рабочей БД. Никакие шаблонные продукты не подменяют живые данные
незаметно. Проверить исходный пакет без обращения к БД:

```sh
./deploy/compose.sh /etc/alageum/stack.env exec backend node scripts/bootstrap-reviewed-catalog.js
```

После проверки состава и разрешения на загрузку именно в **пустой** каталог:

```sh
./deploy/compose.sh /etc/alageum/stack.env exec backend node scripts/bootstrap-reviewed-catalog.js --apply
```

Повторный/пересекающийся импорт отказывается менять непустой каталог. Это не
миграция старого каталога и не механизм обновления цен: существующие записи
оператора не перезаписываются. Восстановленной рабочей БД этот bootstrap не нужен.

Бизнес-роли выдаются только уже активному пользователю с подтверждённым email.
Сначала он проходит обычную регистрацию и письмо; CLI не создаёт пароль и не
подделывает верификацию. Команда ниже — **dry-run**, без выдачи прав:

```sh
./deploy/compose.sh /etc/alageum/stack.env exec backend node scripts/provision-business-operator.js --email VERIFIED-OWNER-EMAIL --organization-id EXISTING-ORGANIZATION-UUID --mode organization-admin
```

После проверки точных пользователя, компании и полномочий оператор повторяет
эту же команду с `--apply`. Для каталога есть отдельный `--mode catalog-manager`;
его полномочия влияют на общий каталог, поэтому такой grant требует явного
решения владельца. Не заменять настоящий UUID случайным идентификатором.
Первую согласованную компанию можно подготовить dry-run с
`--create-organization --organization-name "APPROVED NAME" --organization-identifier "EXACT BUSINESS IDENTIFIER"`
**вместо** `--organization-id`, проверить вывод, затем отдельно добавить `--apply`.
Существующие membership не изменяются этой командой.

Команды работают только с текущим production `DATABASE_URL` и проверяемым TLS;
иной `ALAGEUM_OPERATOR_DATABASE_URL` запрещён. Не переводить приложение в
`APP_ENV=test` ради обхода защиты. CMS admin и эти бизнес-роли — разные контуры;
одна команда не выдаёт права другого контура. Вывод dry-run содержит идентификаторы
и email, поэтому он остаётся в закрытом операторском терминале, не в публичных CI
артефактах.

## 5. Резервная копия и восстановление

Только `deploy/scripts/backup.sh` относится к этому стеку. Он останавливает
proxy/frontend/backend, дожидается завершения worker, делает `pg_dump` и архив
public + private-quarantine, проверяет структуру архива и SHA-256; затем
возвращает ранее работающие сервисы. Это короткое **окно недоступности**.
Не должно быть сторонних писателей в эту БД/медиа. ClamAV может продолжать
обновлять сигнатуры: они не являются бизнес-данными и не входят в backup.

```sh
./deploy/scripts/backup.sh /etc/alageum/stack.env /absolute/existing/private/backups
```

Каталог backup приватный; данные и quarantine могут содержать персональную
информацию. Настроить согласованное шифрование, off-host хранение, retention,
доступ, RPO/RTO и мониторинг ошибок. Скрипт не настраивает удалённое хранилище,
не отправляет backup третьей стороне и не включает секреты/сертификаты.
Секреты, которыми расшифровываются DB-поля, сохраняются отдельно безопасно.

Восстановление допускается только в **новую изолированную** конфигурацию/пустую
БД/пустые подготовленные uploads и quarantine. Скрипт проверяет checksums,
запрещает ссылки/выход путей из архива, отказывается при работающем приложении
или существующих пользовательских объектах. Ничего не drop/delete.

```sh
./deploy/scripts/restore.sh /etc/alageum-rehearsal/stack.env /absolute/backup --restore-empty-target
```

После restore приложение **остаётся выключенным**. Сверить release images,
таблицы/число записей, медиа/URL и владельцев; поднять scanner и выполнить
preflight. При частичной ошибке не повторять restore в непустую цель:
разобраться и подготовить другую пустую цель. Архив перед восстановлением
должен происходить из доверенного backup-процесса; checksum не доказывает авторство.

В staging-rehearsal использовать изолированный SMTP-приёмник и не доставлять
скопированные задания очереди реальным пользователям. Запуск backend может
возобновить незавершённую почтовую очередь. Исходный ключ для её расшифровки
сохраняется; внешние SMTP credentials использовать только в согласованной среде.
Репетицию делать на другом хосте либо с отдельно проверенным набором сетей и
портов: одно изменение `ALAGEUM_PROJECT_NAME` не устраняет конфликт fixed CIDR.

## 6. Обновление и rollback

1. Зафиксировать source SHA, app image IDs/digests, версии инфраструктурных образов,
   выполненные тесты и результаты репетиции. Сохранить предыдущие готовые images.
2. Собрать и проверить новый релиз в staging с восстановленной копией, безопасной
   почтой и закрытым ingress. Протестировать совместимость schema sync.
3. Согласовать окно; сделать парный backup и убедиться, что сервисы вернулись.
   Затем остановить ingress/писателей для actual cutover; не путать это со
   скриптом backup, который по окончании возобновляет прежние сервисы.
4. Выставить новый `ALAGEUM_RELEASE`, поднять новый backend **один раз**, дождаться
   readiness; затем frontend/proxy и HTTPS/browser acceptance.
5. При несовместимой схеме остановить новые writers, восстановить парный snapshot
   в новую пустую цель, использовать исходный набор ключей и прежние app images.
   Не запускать старый код на новой схеме без доказанной совместимости.
6. Смена на восстановленную копию откатывает данные к времени backup. Промежуточные
   заказы/изменения и уже отправленные письма требуют отдельного решения оператора.
   Скрипт не переключает DNS/домен, не стирает старую БД и не делает cutover сам.

Для переноса без пересборки оператор может `docker image save` готовые app и
инфраструктурные images, передать архив через согласованный канал и выполнить
`docker image load` на сервере. Проверить SHA-256 архива и image IDs. Не включать
runtime env/тома в image; использовать те же architecture/platform. Автоматически
ничего в registry или на внешний сервер не публикуется.

## 7. Наблюдение и фактические доказательства

Нужен владелец эксплуатации и оповещения на: HTTP/readiness, TLS expiry,
PostgreSQL/disk/inodes, outbox failures/age, ошибку worker, ClamAV memory/engine и
свежесть FreshClam, backup age/restore rehearsal. JSON container logs ограничены
ротацией. Nginx access log не пишет query strings; не добавлять токены/пароли в
логи. Администраторы Docker всё равно имеют доступ к runtime env и данным.

Проверки в checkout: shell/JS/Python syntax, парсинг Compose, security contracts,
разбор безопасных/опасных архивов. Workflow `self-hosted-server.yml` предназначен
для disposable hosted proof реальной Compose-топологии. Его наличие не является
успешным CI: проверять результат на точном опубликованном SHA. Локальная машина
подготовки без Docker не доказывает container build/boot. До получения результатов
такие стадии помечаются **не выполнены**, а не «пройдены».

Официальные справочные материалы:
[Compose env raw](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/),
[PostgreSQL TLS](https://www.postgresql.org/docs/17/ssl-tcp.html),
[ClamAV Docker, память и обновления](https://docs.clamav.net/manual/Installing/Docker.html),
[Nginx proxy headers](https://nginx.org/en/docs/http/ngx_http_proxy_module.html).
