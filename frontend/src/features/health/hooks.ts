import { useQuery } from "@tanstack/react-query";

import { http } from "@/lib/axios";
import { queryKeys } from "@/lib/query-keys";

export const healthApi = {
  check: () => http.get<{ message: string }>("/healthcheck"),
};

export function useHealthCheck() {
  return useQuery({
    queryKey: queryKeys.health.all,
    queryFn: () => healthApi.check().then((res) => res.data),
    refetchInterval: 30_000,
    staleTime: 0,
    retry: false,
  });
}
