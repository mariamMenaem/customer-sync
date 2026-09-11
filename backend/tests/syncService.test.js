const { mapUser } = require("../src/services/syncService");

describe("mapUser", () => {
  test("should transform external user into internal representation", () => {
    const externalUser = {
      id: "external-123",
      name: "Ahmed Ali",
      email: "ahmed@example.com",
      phone: "+201000000000",
      status: "active",

      company: {
        name: "Acme Inc",
        industry: "Technology",
        role: "Software Engineer",
        website: "https://acme.com",
        employees: 100,
      },

      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-05T12:00:00.000Z",
    };

    const result = mapUser(externalUser, 1);

    expect(result).toEqual({
      customerId: 1,

      externalId: "external-123",

      name: "Ahmed Ali",
      email: "ahmed@example.com",
      phone: "+201000000000",
      status: "active",

      companyName: "Acme Inc",
      companyIndustry: "Technology",
      companyRole: "Software Engineer",
      companyWebsite: "https://acme.com",
      companyEmployees: 100,

      deleted: false,

      sourceCreatedAt: "2026-09-01T10:00:00.000Z",
      sourceUpdatedAt: "2026-09-05T12:00:00.000Z",
    });
  });
});
