require("dotenv").config();

const app = require("./app");
const sequelize = require("./config/database");

const { Customer } = require("./models");

const PORT = process.env.PORT || 3000;
const { startScheduler } = require("./services/schedulerService");
async function start() {
  try {
    await sequelize.authenticate();

    console.log("Database connected");

    await sequelize.sync();

    console.log("Tables synchronized");

    const [customer] = await Customer.findOrCreate({
      where: {
        name: "Assessment Customer",
      },
      defaults: {
        name: "Assessment Customer",
        apiUrl:
          process.env.CUSTOMER_API_URL ||
          "https://assessment-api-gamma.vercel.app/api/users",
      },
    });

    if (process.env.CUSTOMER_API_URL) {
      await customer.update({
        apiUrl: process.env.CUSTOMER_API_URL,
      });
    }

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      startScheduler();
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

start();
