async function paginate(Model, options = {}) {
  const { where = {}, page = 1, limit = 20, order = [["id", "ASC"]] } = options;

  const normalizedPage = Math.max(parseInt(page, 10) || 1, 1);

  const normalizedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const offset = (normalizedPage - 1) * normalizedLimit;

  const result = await Model.findAndCountAll({
    where,
    limit: normalizedLimit,
    offset,
    order,
  });

  const totalPages = Math.ceil(result.count / normalizedLimit);

  return {
    data: result.rows,

    pagination: {
      page: normalizedPage,
      limit: normalizedLimit,
      total: result.count,
      totalPages,

      hasNextPage: normalizedPage < totalPages,

      hasPreviousPage: normalizedPage > 1,
    },
  };
}

module.exports = {
  paginate,
};
