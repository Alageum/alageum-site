# Order Process Questionnaire

Заполнить process template на реальных примерах; candidate lifecycle не является требованием.

1. `[P0/P1][NEEDS_CLIENT]` Что является Order, где master и какой stable external ID?
2. Как Order связан с customer/legal entity, contract, RFQ/offer, items/configuration, invoice и shipment?
3. Кто/какая система создаёт и может изменять/cancel order; пишет ли platform что-либо обратно?
4. Какие fields обязательны/optional/confidential; какие доступны разным ролям?
5. Реальные statuses/transitions, timestamps, expected/actual dates и status owner?
6. Что показывается customer vs internal-only; когда уведомлять?
7. Как обрабатываются partial fulfillment, amendment, replacement, split/merge, cancellation и stale data?
8. Какие документы/events являются evidence каждого этапа?
9. Update latency, expected volume/history и reconciliation process?
10. Acceptance examples: normal, delayed, changed, cancelled, missing/duplicate external event.

