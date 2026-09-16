import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { http } from "@/lib/axios";
import { queryKeys } from "@/lib/query-keys";
import type { SearchResults } from "@/types/models";

export const MIN_SEARCH_LENGTH = 2;

/** Projects, tasks and notes matching `query` across the user's projects */
export function useGlobalSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: queryKeys.search.query(q),
    queryFn: () =>
      http
        .get<SearchResults>("/search", { params: { q, limit: 6 } })
        .then((res) => res.data),
    enabled: q.length >= MIN_SEARCH_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
