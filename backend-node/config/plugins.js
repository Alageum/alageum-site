"use strict";
// Business identity is deliberately separate from CMS administrators.
// Do not expose a second public registration or generic user CRUD surface.
module.exports = {
  "users-permissions": { enabled: false },
  "alageum-catalog": {
    enabled: true,
    resolve: "./src/plugins/alageum-catalog",
  },
};
