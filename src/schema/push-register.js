const pushRegisterSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "PushRegister",
  type: "object",
  additionalProperties: false,
  required: ["token"],
  properties: {
    token: {
      type: "string",
      minLength: 1,
      maxLength: 300,
    },
    platform: {
      type: "string",
      enum: ["ios", "android", "web"],
    },
  },
};

module.exports = pushRegisterSchema;
