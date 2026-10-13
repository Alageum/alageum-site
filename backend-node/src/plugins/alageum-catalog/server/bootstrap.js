"use strict";
module.exports = async ({ strapi }) => {
  await strapi.service("admin::permission").actionProvider.registerMany([
    {
      section: "plugins",
      displayName: "Manage ALAGEUM catalog",
      uid: "manage",
      pluginName: "alageum-catalog",
    },
  ]);
};
