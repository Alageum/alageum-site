'use client';
import { useState } from 'react';
import { parseComparison, reconcileComparisonDraft } from '@/lib/catalog/query';

// Controlled checkboxes update in the same event, rather than waiting on a router
// transition. A changed URL (including Back/Forward) replaces the optimistic value.
export function useUrlComparison(value, products) {
 const query = value || '';
 const [draft, setDraft] = useState(() => reconcileComparisonDraft(query));
 const current = reconcileComparisonDraft(query, draft);
 if (current !== draft) setDraft(current);
 return [parseComparison(current.ids.join(','), products), next => setDraft({ query, ids: next })];
}
