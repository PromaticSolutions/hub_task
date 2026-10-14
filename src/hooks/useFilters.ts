import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EMPTY_FILTERS, filtersFromParams, writeFilters, type Filters } from '../lib/filters';

/** Filters live in the URL so they survive reloads and can be linked from the dashboard. */
export function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);

  const update = useCallback(
    (patch: Partial<Filters>) => {
      setParams((prev) => writeFilters(prev, { ...filtersFromParams(prev), ...patch }), { replace: true });
    },
    [setParams],
  );

  const clear = useCallback(() => {
    setParams((prev) => writeFilters(prev, EMPTY_FILTERS), { replace: true });
  }, [setParams]);

  return { filters, update, clear };
}
