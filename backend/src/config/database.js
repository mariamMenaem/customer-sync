const { Sequelize } = require("sequelize");

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: process.env.DATABASE_STORAGE || "./database.sqlite",
  logging: false,
});

module.exports = sequelize;
