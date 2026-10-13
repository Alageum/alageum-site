"use strict";
function required(env, name) {
  const value = env(name);
  if (typeof value !== "string" || value.length < 32)
    throw new Error(
      `${name} must be explicitly supplied (at least 32 characters)`,
    );
  return value;
}
module.exports = { required };
