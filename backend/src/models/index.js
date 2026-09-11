const Customer = require("./Customer");
const User = require("./User");

Customer.hasMany(User, {
  foreignKey: "customerId",
});

User.belongsTo(Customer, {
  foreignKey: "customerId",
});

module.exports = {
  Customer,
  User,
};
