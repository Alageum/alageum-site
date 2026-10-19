'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { accountError, createAccountOperation } from '@/lib/account/model';

export default function useAccountOperation() {
  const operation = useRef(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const owner = createAccountOperation();
    operation.current = owner;
    return () => { owner.dispose(); if (operation.current === owner) operation.current = null; };
  }, []);
  const run = useCallback((work, accept) => {
    if (!operation.current) return;
    return operation.current.run(async signal => {
      setPending(true); setError('');
      return work(signal);
    }, value => { setPending(false); accept?.(value); }, reason => { setPending(false); setError(accountError(reason)); });
  }, []);
  return { pending, error, setError, run };
}
