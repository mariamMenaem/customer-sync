const axios = require("axios");
const { Op } = require("sequelize");

const sequelize = require("../config/database");
const { Customer, User } = require("../models");
const logger = require("../utils/logger");

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY = 500;
const REQUEST_TIMEOUT = 10000;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function shouldRetry(error) {
  if (!error.response) {
    return true;
  }

  const statusCode = error.response.status;

  return statusCode === 429 || statusCode >= 500;
}

async function requestWithRetry(requestFn) {
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRY_ATTEMPTS;

      if (isLastAttempt || !shouldRetry(error)) {
        throw error;
      }

      const delay = RETRY_BASE_DELAY * 2 ** (attempt - 1);

      logger.warn("customer_api_retry", {
        attempt,
        nextAttempt: attempt + 1,
        delayMs: delay,
        statusCode: error.response?.status || null,
      });

      await sleep(delay);
    }
  }
}

function mapUser(rawUser, customerId) {
  return {
    customerId,
    externalId: String(rawUser.id),

    name: rawUser.name,
    email: rawUser.email,
    phone: rawUser.phone || null,
    status: rawUser.status || null,

    companyName: rawUser.company?.name || null,

    companyIndustry: rawUser.company?.industry || null,

    companyRole: rawUser.company?.role || null,

    companyWebsite: rawUser.company?.website || null,

    companyEmployees: rawUser.company?.employees || null,

    deleted: false,

    sourceCreatedAt: rawUser.createdAt || null,

    sourceUpdatedAt: rawUser.updatedAt || null,
  };
}

async function fetchUsers(customer, page = 1) {
  const response = await requestWithRetry(() =>
    axios.get(customer.apiUrl, {
      headers: {
        Authorization: `Bearer ${process.env.CUSTOMER_API_TOKEN}`,
        Accept: "application/json",
      },

      params: {
        page,
      },

      timeout: REQUEST_TIMEOUT,
    }),
  );

  if (!response.data || !Array.isArray(response.data.data)) {
    throw new Error("Invalid customer API response");
  }

  return response.data;
}

async function fetchAllUsers(customer) {
  const allUsers = [];

  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await fetchUsers(customer, page);

    allUsers.push(...response.data);

    hasNextPage = response.pagination?.hasNextPage === true;

    if (hasNextPage) {
      page += 1;
    }
  }

  logger.info("customer_api_fetch_completed", {
    customerId: customer.id,
    pagesFetched: page,
    usersFetched: allUsers.length,
  });

  return allUsers;
}

async function syncCustomerUsers(customerId) {
  const customer = await Customer.findByPk(customerId);

  if (!customer) {
    const error = new Error("Customer not found");

    error.statusCode = 404;

    throw error;
  }

  logger.info("sync_started", {
    customerId: customer.id,
  });

  const remoteUsers = await fetchAllUsers(customer);

  const transformedUsers = remoteUsers.map((user) =>
    mapUser(user, customer.id),
  );

  const externalIds = remoteUsers.map((user) => String(user.id));

  const transaction = await sequelize.transaction();

  try {
    await User.bulkCreate(transformedUsers, {
      updateOnDuplicate: [
        "name",
        "email",
        "phone",
        "status",

        "companyName",
        "companyIndustry",
        "companyRole",
        "companyWebsite",
        "companyEmployees",

        "deleted",

        "sourceCreatedAt",
        "sourceUpdatedAt",

        "updatedAt",
      ],

      transaction,
    });

    await User.update(
      {
        deleted: true,
      },
      {
        where: {
          customerId: customer.id,

          ...(externalIds.length > 0
            ? {
                externalId: {
                  [Op.notIn]: externalIds,
                },
              }
            : {}),
        },

        transaction,
      },
    );

    await transaction.commit();

    logger.info("sync_completed", {
      customerId: customer.id,
      synchronized: transformedUsers.length,
    });

    return {
      success: true,
      synchronized: transformedUsers.length,
    };
  } catch (error) {
    await transaction.rollback();

    logger.error("sync_failed", {
      customerId: customer.id,
      message: error.message,
    });

    throw error;
  }
}

module.exports = {
  syncCustomerUsers,
  mapUser,
  fetchUsers,
  fetchAllUsers,
  requestWithRetry,
};
