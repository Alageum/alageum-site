"use strict";
const { readMediaConfig } = require("../src/domain/media-policy");
module.exports = ({ env }) => readMediaConfig(env);
