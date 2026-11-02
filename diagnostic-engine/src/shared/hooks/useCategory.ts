import { useRouter } from 'next/router';
import { CATEGORIES } from '../../lib/config/categories';
import { Category } from '../../lib/types/assessment';

export function useCategory(): Category | null {
  const router = useRouter();
  const { category } = router.query;

  if (!category || typeof category !== 'string') {
    return null;
  }

  return CATEGORIES[category] || null;
}
