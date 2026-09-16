import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiClientError } from "@/lib/axios";

declare module "@tanstack/react-query" {
  interface Register {
    defaultError: ApiClientError;
    queryMeta: {
      /** Show this toast message when the query fails */
      errorMessage?: string;
    };
    mutationMeta: {
      /** Skip the global error toast for this mutation */
      silent?: boolean;
      /** Show this toast message on success */
      successMessage?: string;
    };
  }
}

const MAX_RETRIES = 2;

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.errorMessage) {
        toast.error(query.meta.errorMessage, { description: error.message });
      }
    },
  }),
  mutationCache: new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      if (mutation.meta?.successMessage) {
        toast.success(mutation.meta.successMessage);
      }
    },
    onError: (error, _variables, _context, mutation) => {
      if (!mutation.meta?.silent) {
        toast.error(error.message || "Something went wrong");
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Don't retry client errors (400-499), only network / server errors
        if (
          error instanceof ApiClientError &&
          error.statusCode >= 400 &&
          error.statusCode < 500
        ) {
          return false;
        }
        return failureCount < MAX_RETRIES;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
