# Master Data Questionnaire

For each entity in Data Source Matrix:

- business definition and owner;
- canonical identifier and uniqueness scope;
- mandatory/optional attributes and reference dictionaries;
- create/update/archive/delete authority;
- duplicate/merge/split/correction behavior;
- effective dates/versioning/localization;
- consumer systems and propagation latency;
- data classification/retention;
- quality rules and stewardship/escalation;
- sample normal, edge and invalid records.

`[P0][NEEDS_CLIENT]`: approve one master per attribute group or an explicit conflict policy. «Обе
системы главные» без precedence/reconciliation является unresolved blocker.

