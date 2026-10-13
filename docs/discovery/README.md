# ALAGEUM.COM Discovery Package

Рабочий пакет JSJ для получения подтверждённых требований без домыслов за Заказчика. Любое
незаполненное поле имеет статус `[NEEDS_CLIENT]`. Ответ считается фактом только после фиксации в
meeting notes/decision log и подтверждения уполномоченным владельцем решения.

## Результаты Discovery

- согласованные цели, границы и exclusions;
- stakeholder и decision-authority matrix;
- описанные процессы и customer journeys;
- Role × Permission и approval authority matrices;
- Data Source Matrix и master-data ownership;
- паспорта интеграций с mappings, reliability и acceptance;
- утверждённые design/content inputs и approval process;
- AI use cases, knowledge/tool policies и acceptance;
- NFR, security/infrastructure decisions;
- Acceptance Matrix, UAT plan, Final ТЗ и Scope Freeze;
- Change Requests для требований сверх согласованного объёма.

## Что требуется от Alageum

Назначить Project Owner, одного final Design Decision Owner, владельцев направлений и UAT;
предоставить обезличенные примеры, схемы процессов, API/системную документацию и обеспечить
своевременное принятие решений. ФИО и контакты заполняются в [stakeholders](01-project/stakeholders.md).

## Приоритет вопросов

| Код | Значение | Правило |
|---|---|---|
| P0 BLOCKING | Блокирует Discovery/архитектуру/Scope Freeze | эскалация Project Owner, дата решения обязательна |
| P1 REQUIRED BEFORE MODULE IMPLEMENTATION | нужен до начала соответствующего модуля | включается в implementation prerequisite |
| P2 REQUIRED BEFORE UAT | нужен до UAT/контента/приёмки | допускается после Scope Freeze только если не меняет scope |
| P3 OPTIONAL / FUTURE | идея будущего этапа | не включается без решения/CR |

Правило классификации: вопрос с явной меткой использует её; все вопросы без явной метки имеют
базовый приоритет **P1 REQUIRED BEFORE MODULE IMPLEMENTATION**. Детали контента/тестовых данных,
которые не меняют модель или scope, при регистрации могут быть понижены до P2; идеи будущих
возможностей — только до P3 решением Project Owner. P0 всегда фиксируется отдельной строкой в
[Open Questions Register](02-business/open-questions.md), поэтому blocking item нельзя потерять
в тексте анкеты.

## Последовательность

```text
Контакты → Kickoff → Business Discovery → Design → Data / ERP / CRM
→ Production / Finance / Documents → Security / Infrastructure → AI
→ Data Source Matrix → Role Matrix → Integration Passports
→ Acceptance Matrix → Final ТЗ → Scope Freeze → Implementation
```

Рекомендуемые 12 встреч и prerequisites находятся в
[meeting plan](15-meetings/discovery-meeting-plan.md). Не следует собирать всех экспертов на одну
встречу: каждый workshop имеет ограниченный состав и конкретные outputs.

## Рабочие документы

1. Project governance: цели, stakeholders, decisions, risks.
2. Business/design: процессы, journeys, материалы и approval.
3. Users/catalog/orders/production/finance/documents: domain facts без проектирования за клиента.
4. Integrations/data: source-of-truth, passports, mappings, migration.
5. AI/infrastructure/security: use cases, policies, NFR и production gates.
6. Acceptance/scope: UAT, evidence, limits, CR и Final ТЗ.

Master registers: [Open Questions](02-business/open-questions.md),
[Material Requests](material-request-register.md), [Sample Data](sample-data-request.md),
[Decision Log](01-project/decision-log-template.md), [Risks](01-project/risk-register-template.md).
Текущая полнота пакета зафиксирована в [Discovery Readiness](discovery-readiness.md).

## Definition of Discovery Done

- все P0 закрыты утверждёнными решениями;
- P1 имеют ответ, owner и evidence;
- процессы, role/data matrices и integration passports согласованы;
- design owner и approval flow подтверждены;
- NFR/security/infrastructure и client responsibilities определены;
- Acceptance Matrix трассируется к требованиям;
- все количественные limits заполнены;
- спорные расширения классифицированы как CR/out-of-scope;
- Final ТЗ утверждено, Scope Freeze подписан уполномоченными сторонами.

После этого требования переходят в backlog через Requirement ID → Acceptance ID → implementation
item. Устные изменения после freeze оформляются Decision Log и, при влиянии на объём, Change Request.
