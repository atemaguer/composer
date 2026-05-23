const { sign } = require("app-builder-lib/out/codeSign/macCodeSign");

exports.default = async function macSign(options) {
  await sign(options);
};

exports.sign = exports.default;
