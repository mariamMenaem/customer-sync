const { Customer } = require("../models");
const { syncCustomerUsers } = require("../services/syncService");

async function syncUsers(req, res, next) {
  try {
    let customerId = Number(req.body?.customerId || req.query?.customerId);

    // If no customerId was provided, use the default assessment customer.
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

    const result = await syncCustomerUsers(customerId);

    return res.status(200).json({
      success: true,
      message: "Users synchronized successfully",
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  syncUsers,
};
