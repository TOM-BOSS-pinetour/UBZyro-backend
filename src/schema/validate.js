const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
});
addFormats(ajv);

function buildValidator(schema) {
  const validate = ajv.compile(schema);

  return (req, res, next) => {
    const ok = validate(req.body);
    if (ok) return next();

    return res.status(400).json({
      error: "Validation failed",
      details: validate.errors,
    });
  };
}

module.exports = { buildValidator };
