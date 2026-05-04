export const PAGE_SIZE = 10;

export const buildPaginatedUrl = (path, page = 1, extraParams = {}) => {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(PAGE_SIZE)
  });

  Object.entries(extraParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });

  return `${path}${path.includes('?') ? '&' : '?'}${params.toString()}`;
};

export const parsePaginatedResponse = (data) => {
  if (Array.isArray(data)) {
    return {
      items: data,
      pagination: {
        page: 1,
        limit: data.length,
        total: data.length,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false
      }
    };
  }

  return {
    items: Array.isArray(data?.items) ? data.items : [],
    pagination: data?.pagination || {
      page: 1,
      limit: PAGE_SIZE,
      total: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false
    }
  };
};
