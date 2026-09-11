const { Op } = require("sequelize");

const { Customer, User } = require("../models");
const { paginate } = require("../services/paginationService");

async function getUsers(req, res, next) {
  try {
    let customerId = Number(req.query.customerId);

    // If no customerId was provided,
    // use the default assessment customer.
    if (!customerId) {
      const customer = await Customer.findOne({
        where: {
          name: "Assessment Customer",
        },
      });

      if (!customer) {
        const error = new Error("Default customer not found");

        error.statusCode = 404;

        throw error;
      }

      customerId = customer.id;
    }

    const { company, includeDeleted = "false" } = req.query;

    const where = {
      customerId,
    };

    if (includeDeleted !== "true") {
      where.deleted = false;
    }

    if (company) {
      where.companyName = {
        [Op.like]: `%${company}%`,
      };
    }

    const result = await paginate(User, {
      where,
      page: req.query.page,
      limit: req.query.limit,
      order: [["id", "ASC"]],
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getUsers,
};
