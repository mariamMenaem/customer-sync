const { Customer } = require("../models");
const { syncCustomerUsers } = require("./syncService");
const logger = require("../utils/logger");

const SYNC_INTERVAL_MINUTES = Number(process.env.SYNC_INTERVAL_MINUTES) || 30;

const SYNC_INTERVAL_MS = SYNC_INTERVAL_MINUTES * 60 * 1000;

let schedulerTimeout = null;
let isRunning = false;

async function syncAllCustomers() {
  const customers = await Customer.findAll();

  logger.info("scheduled_sync_started", {
    customers: customers.length,
  });

  for (const customer of customers) {
    try {
      await syncCustomerUsers(customer.id);
    } catch (error) {
      logger.error("scheduled_customer_sync_failed", {
        customerId: customer.id,
        message: error.message,
      });
    }
  }

  logger.info("scheduled_sync_completed", {
    customers: customers.length,
  });
}

async function runScheduler() {
  if (isRunning) {
    logger.warn("scheduled_sync_skipped", {
      reason: "previous_sync_still_running",
    });

    scheduleNextRun();
    return;
  }

  isRunning = true;

  try {
    await syncAllCustomers();
  } catch (error) {
    logger.error("scheduled_sync_failed", {
      message: error.message,
    });
  } finally {
    isRunning = false;
    scheduleNextRun();
  }
}

function scheduleNextRun() {
  schedulerTimeout = setTimeout(runScheduler, SYNC_INTERVAL_MS);
}

async function startScheduler() {
  if (schedulerTimeout) {
    return;
  }

  logger.info("scheduler_started", {
    intervalMinutes: SYNC_INTERVAL_MINUTES,
  });

  await runScheduler();
}

function stopScheduler() {
  if (schedulerTimeout) {
    clearTimeout(schedulerTimeout);
    schedulerTimeout = null;
  }

  logger.info("scheduler_stopped");
}

module.exports = {
  startScheduler,
  stopScheduler,
  runScheduler,
};
