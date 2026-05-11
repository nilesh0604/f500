export interface PaginationMeta {
  hasNextPage: boolean;
  nextCursor: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface CursorPaginationParams {
  cursor?: string;
  limit?: number;
}
