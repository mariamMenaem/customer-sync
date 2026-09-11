require("dotenv").config();

const express = require("express");
const cors = require("cors");

const syncRoutes = require("./routes/syncRoutes");
const userRoutes = require("./routes/userRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  return res.json({
    status: "ok",
  });
});

app.use("/sync", syncRoutes);
app.use("/api/v1/users", userRoutes);

app.use((err, req, res, next) => {
  console.error({
    event: "request_error",
    message: err.message,
    statusCode: err.response?.status || err.statusCode || 500,
  });

  if (err.response) {
    return res.status(502).json({
      success: false,
      message: "Customer API request failed",
    });
  }

  return res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

module.exports = app;
