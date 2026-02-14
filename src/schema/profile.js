const serviceKeys = [
  "electric",
  "plumbing",
  "lock",
  "paint",
  "carpenter",
  "clean",
  "heat",
  "internet",
  "ac",
  "security",
  "glass",
  "furniture",
  "floor",
  "roof",
  "moving",
  "garden",
];

const profileSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Profile",
  type: "object",
  additionalProperties: false,
  required: ["email", "phone_number", "first_name", "last_name", "role"],
  properties: {
    id: {
      type: "string",
      format: "uuid",
    },
    role: {
      type: "string",
      enum: ["user", "worker"],
    },
    email: {
      type: "string",
      format: "email",
      minLength: 3,
      maxLength: 254,
    },
    phone_number: {
      type: "string",
      minLength: 6,
      maxLength: 20,
      pattern: "^[+0-9()\\-\\s]+$",
    },
    first_name: {
      type: "string",
      minLength: 1,
      maxLength: 60,
    },
    last_name: {
      type: "string",
      minLength: 1,
      maxLength: 60,
    },
    work_types: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: {
        type: "string",
        enum: serviceKeys,
      },
    },
    service_area: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: {
        type: "string",
        minLength: 1,
        maxLength: 80,
      },
    },
  },
  allOf: [
    {
      if: {
        properties: {
          role: { const: "worker" },
        },
      },
      then: {
        required: ["work_types", "service_area"],
      },
    },
    {
      if: {
        properties: {
          role: { const: "user" },
        },
      },
      then: {
        not: {
          anyOf: [{ required: ["work_types"] }, { required: ["service_area"] }],
        },
      },
    },
  ],
};

module.exports = profileSchema;
