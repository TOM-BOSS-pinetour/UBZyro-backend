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

const workerSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Worker",
  type: "object",
  additionalProperties: false,
  required: [
    "email",
    "phone_number",
    "first_name",
    "last_name",
    "work_types",
    "service_area",
  ],
  properties: {
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
};

module.exports = workerSchema;
