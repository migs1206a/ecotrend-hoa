const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const parsePagination = (query = {}, options = {}) => {
  const defaultLimit = options.defaultLimit || DEFAULT_LIMIT;
  const maxLimit = options.maxLimit || MAX_LIMIT;
  const hasPagination = query.paginate === 'true' || query.page !== undefined || query.limit !== undefined;

  const parsedPage = Number.parseInt(query.page, 10);
  const parsedLimit = Number.parseInt(query.limit, 10);

  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, maxLimit)
    : defaultLimit;

  return {
    enabled: hasPagination,
    page,
    limit,
    skip: (page - 1) * limit
  };
};

const buildPaginatedPayload = ({ items, total, page, limit }) => ({
  items,
  pagination: {
    page,
    limit,
    total,
    totalPages: total > 0 ? Math.ceil(total / limit) : 1,
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1
  }
});

const sendPaginatedResponse = (res, pagination, items, total) => {
  if (!pagination.enabled) {
    return res.json(items);
  }

  return res.json(buildPaginatedPayload({
    items,
    total,
    page: pagination.page,
    limit: pagination.limit
  }));
};

const paginateArray = (items, pagination) => {
  if (!pagination.enabled) {
    return {
      items,
      total: items.length
    };
  }

  return {
    items: items.slice(pagination.skip, pagination.skip + pagination.limit),
    total: items.length
  };
};

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parsePagination,
  buildPaginatedPayload,
  sendPaginatedResponse,
  paginateArray
};
