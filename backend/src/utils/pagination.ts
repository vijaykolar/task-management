import type { Request } from "express";
import type { PipelineStage } from "mongoose";

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface ListQuery<S extends string> {
  page: number;
  limit: number;
  skip: number;
  sortField: S;
  sortOrder: 1 | -1;
  search: string;
}

interface ListQueryOptions<S extends string> {
  sortFields: readonly S[];
  defaultSort: S;
  defaultOrder?: "asc" | "desc";
  defaultLimit?: number;
  maxLimit?: number;
}

const toInt = (value: unknown, fallback: number) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Reads `page`, `limit`, `sort`, `order` and `search` from the query string.
 * Invalid values fall back to defaults instead of failing the request.
 */
export const parseListQuery = <S extends string>(
  query: Request["query"],
  options: ListQueryOptions<S>,
): ListQuery<S> => {
  const maxLimit = options.maxLimit ?? 100;
  const limit = Math.min(
    Math.max(toInt(query.limit, options.defaultLimit ?? 20), 1),
    maxLimit,
  );
  const page = Math.max(toInt(query.page, 1), 1);
  const sortField = options.sortFields.includes(query.sort as S)
    ? (query.sort as S)
    : options.defaultSort;
  const order =
    query.order === "asc" || query.order === "desc"
      ? query.order
      : (options.defaultOrder ?? "desc");
  const search =
    typeof query.search === "string" ? query.search.trim().slice(0, 100) : "";

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    sortField,
    sortOrder: order === "asc" ? 1 : -1,
    search,
  };
};

/** Makes user input safe to embed in a $regex */
export const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const searchRegex = (search: string) => ({
  $regex: escapeRegex(search),
  $options: "i",
});

export const paginationMeta = (
  total: number,
  { page, limit }: { page: number; limit: number },
): PaginationMeta => ({
  page,
  limit,
  total,
  totalPages: Math.max(Math.ceil(total / limit), 1),
  hasNextPage: page * limit < total,
});

type FacetPipeline = PipelineStage.Facet["$facet"][string];

/** One page of results plus the total count, in a single aggregation */
export const facetPage = (
  { skip, limit }: { skip: number; limit: number },
  itemStages: FacetPipeline = [],
): PipelineStage.Facet => ({
  $facet: {
    items: [{ $skip: skip }, { $limit: limit }, ...itemStages],
    total: [{ $count: "count" }],
  },
});

export interface FacetResult<T> {
  items: T[];
  total: { count: number }[];
}

export const fromFacet = <T>(
  result: FacetResult<T>[],
  query: { page: number; limit: number },
) => {
  const { items = [], total = [] } = result[0] ?? {};
  return {
    items,
    pagination: paginationMeta(total[0]?.count ?? 0, query),
  };
};
