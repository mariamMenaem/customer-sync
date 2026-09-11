const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Customer = sequelize.define(
  "Customer",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    apiUrl: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    tableName: "customers",
    timestamps: true,
  },
);

module.exports = Customer;
