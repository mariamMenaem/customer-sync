const router = require("express").Router();

const { syncUsers } = require("../controllers/syncController");

router.post("/users", syncUsers);

module.exports = router;
