# Business Discovery Questionnaire

Каждый ответ: fact/evidence, owner, priority P0–P3, affected process and acceptance impact.

## Scope and operating model

1. `[P0][NEEDS_CLIENT]` Какие юридические лица, divisions, regions и customer segments входят в release?
2. `[P0][NEEDS_CLIENT]` Какие end-to-end outcomes обязательны для go-live, а какие future?
3. `[P1][NEEDS_CLIENT]` Какие каналы/системы сегодня выполняют каждый этап и где возникает ручной труд?
4. `[P1][NEEDS_CLIENT]` Какие варианты процесса различаются по продукту, клиенту, договору или региону?
5. `[P1][NEEDS_CLIENT]` Какие исключения имеют финансовый, юридический или reputational impact?

## Candidate lifecycle to validate, not assume

```text
Lead → RFQ → Technical clarification → Commercial offer → Negotiation → Contract
→ Signature → Payment → Production → OTK → Shipment → Delivery → Acceptance
→ Warranty → Service → Repeat order
```

Для каждого применимого этапа заполнить [process template](business-process-template.md). Отметить
несуществующие этапы как N/A и добавить реальные. Кто инициирует? Какой trigger/input? Какая система
и source of truth? Какой output/status/document? Кто ответственен? Что видит клиент? Какое
notification? Какие exceptions/escalations? Что является acceptance evidence?

## Governance

6. Кто может изменить process после Scope Freeze?
7. Какие SLA/approval limits и segregations of duties существуют?
8. Какие policy/legal documents подтверждают ответы?
9. Какие quantitative limits должны попасть в scope-limits matrix?

