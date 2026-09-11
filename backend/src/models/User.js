const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    customerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    externalId: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    status: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    companyName: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    companyIndustry: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    companyRole: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    companyWebsite: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    companyEmployees: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    deleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    sourceCreatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    sourceUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "users",
    timestamps: true,

    indexes: [
      {
        unique: true,
        fields: ["customerId", "externalId"],
      },

      {
        fields: ["customerId", "deleted", "companyName"],
      },
    ],
  },
);

module.exports = User;
