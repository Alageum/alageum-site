# AI tool/action matrix

| Tool placeholder | Description | User types | READ/WRITE | Required permission | Confirmation | Data source | Audit | Human approval | Risk | Allowed | Open questions |
|---|---|---|---|---|---|---|---|---|---|---|---|
| search_products | Search approved catalog | [NEEDS_CLIENT] | READ | [NEEDS_CLIENT] | No | Catalog | Yes? | [NEEDS_CLIENT] | Incorrect recommendation | [NEEDS_CLIENT] | Sources/locales/filters |
| get_product | Read product details | [NEEDS_CLIENT] | READ | [NEEDS_CLIENT] | No | Catalog | Yes? | [NEEDS_CLIENT] | Stale data | [NEEDS_CLIENT] | Public/B2B fields |
| get_order | Read one tenant order | [NEEDS_CLIENT] | READ | order.read? | No | ERP/platform cache | Yes | [NEEDS_CLIENT] | Private data leak | [NEEDS_CLIENT] | Visible fields/freshness |
| get_documents | List tenant documents | [NEEDS_CLIENT] | READ | document.read? | No | Document service | Yes | [NEEDS_CLIENT] | Confidential data | [NEEDS_CLIENT] | Types/metadata/download |
| get_finance | Read tenant finance | [NEEDS_CLIENT] | READ | finance.read? | No | ERP/platform cache | Yes | [NEEDS_CLIENT] | Sensitive finance | [NEEDS_CLIENT] | Roles/fields/freshness |
| create_rfq | Prepare/submit RFQ | [NEEDS_CLIENT] | WRITE | quote.create? | **Yes** | RFQ service | Yes | [NEEDS_CLIENT] | Binding/incorrect request | [NEEDS_CLIENT] | Submit vs draft |
| create_ticket | Create support request | [NEEDS_CLIENT] | WRITE | ticket.create? | **Yes** | Support service | Yes | [NEEDS_CLIENT] | Disclosure/spam | [NEEDS_CLIENT] | Categories/SLA |
| create_lead | Send lead to CRM | [NEEDS_CLIENT] | WRITE | [NEEDS_CLIENT] | **Yes** | CRM adapter | Yes | [NEEDS_CLIENT] | Personal data/duplicates | [NEEDS_CLIENT] | Consent/deduplication |

Имена и permissions — placeholders. Любой WRITE по умолчанию требует confirmation, scoped к user + organization + tool + arguments + expiry. Разрешение матрицы не заменяет backend authorization.
