# Role × Permission Matrix Template

Значения: Allow / Deny / Own / Organization / Conditional / N/A. Роли — `[NEEDS_CLIENT]`.

| Permission group | Permission / action | Role 1 | Role 2 | Role 3 | Scope/condition | Approval needed | Source/evidence |
|---|---|---|---|---|---|---|---|
| Organization | view organization profile | | | | | | |
| Organization | manage users/invitations | | | | | | |
| Organization | change roles | | | | | | |
| Catalog | view public/B2B catalog | | | | | | |
| RFQ | create/view/update/cancel RFQ | | | | split if different | | |
| Orders | list/view/export order | | | | | | |
| Finance | view invoices/payments/debt/schedule | | | | split by data type | | |
| Documents | list/download/upload/sign | | | | split by document type | | |
| Support | create/view/respond/close case | | | | | | |
| Users | view user identity/audit | | | | | | |
| Service | warranty/complaint/service actions | | | | | | |
| AI | public chat/B2B chat/read tools | | | | | | |
| AI | confirm each WRITE tool | | | | tool-specific | | |
| Administration | content/catalog/status/config management | | | | | | |

Финальная матрица должна быть трассируема к backend permission codes, но Заказчик определяет
business roles/actions, а не ORM/API implementation.

