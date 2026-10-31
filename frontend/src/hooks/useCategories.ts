import { useEffect, useState } from 'react';
import { getCategories } from '../api/subscriptions.api';
import type { Category } from '../types';

// The predefined categories rarely change, so one request per page load is enough
let cached: Promise<Category[]> | undefined;

export function useCategories(): Category[] {
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    let ignore = false;
    cached ??= getCategories().catch((err) => {
      cached = undefined;
      throw err;
    });
    cached.then((list) => !ignore && setCategories(list)).catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);
  return categories;
}
