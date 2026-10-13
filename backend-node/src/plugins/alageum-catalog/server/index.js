"use strict";
module.exports = {
  bootstrap: require("./bootstrap"),
  controllers: { catalog: require("./controllers/catalog") },
  routes: { admin: require("./routes/admin") },
};
