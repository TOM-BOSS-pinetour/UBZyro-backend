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

const districtNames = [
  "Багануур",
  "Багахангай",
  "Баянгол",
  "Баянзүрх",
  "Налайх",
  "Сонгинохайрхан",
  "Сүхбаатар",
  "Хан-Уул",
  "Чингэлтэй",
];

const orderSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Order",
  type: "object",
  additionalProperties: false,
  required: [
    "service_key",
    "scheduled_date",
    "district",
    "khoroo",
    "address",
    "description",
    "urgency",
  ],
  properties: {
    service_key: {
      type: "string",
      enum: serviceKeys,
    },
    service_label: {
      type: "string",
      minLength: 1,
      maxLength: 80,
    },
    scheduled_date: {
      type: "string",
      format: "date",
    },
    district: {
      type: "string",
      enum: districtNames,
    },
    khoroo: {
      type: "string",
      minLength: 1,
      maxLength: 80,
    },
    address: {
      type: "string",
      minLength: 1,
      maxLength: 200,
    },
    description: {
      type: "string",
      minLength: 1,
      maxLength: 2000,
    },
    urgency: {
      type: "string",
      enum: ["normal", "urgent"],
    },
    status: {
      type: "string",
      enum: [
        "pending",
        "accepted",
        "en_route",
        "in_progress",
        "completed",
        "cancelled",
        "rejected",
      ],
    },
    attachment_urls: {
      type: "array",
      items: {
        type: "string",
        maxLength: 500,
      },
    },
    user_profile_id: {
      type: "string",
      format: "uuid",
    },
    worker_profile_id: {
      type: "string",
      format: "uuid",
    },
    latitude: {
      type: "number",
      minimum: -90,
      maximum: 90,
    },
    longitude: {
      type: "number",
      minimum: -180,
      maximum: 180,
    },
  },
};

module.exports = orderSchema;
