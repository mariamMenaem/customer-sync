const axios = require("axios");

jest.mock("axios");

const sequelize = require("../src/config/database");
const { Customer, User } = require("../src/models");
const { syncCustomerUsers } = require("../src/services/syncService");

describe("syncCustomerUsers", () => {
  beforeAll(async () => {
    await sequelize.authenticate();
    await sequelize.sync({ force: true });
  });

  beforeEach(async () => {
    await User.destroy({
      where: {},
      truncate: true,
      restartIdentity: true,
    });

    await Customer.destroy({
      where: {},
      truncate: true,
      restartIdentity: true,
    });

    jest.clearAllMocks();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  test("syncs users successfully", async () => {
    const customer = await Customer.create({
      name: "Test Customer",
      apiUrl: "https://example.com/api/users",
    });

    axios.get.mockResolvedValue({
      data: {
        data: [
          {
            id: "external-1",
            name: "John Doe",
            email: "john@example.com",
            phone: "+123456789",
            status: "active",
            company: {
              name: "Acme Inc",
              industry: "Technology",
              role: "Engineer",
              website: "https://acme.com",
              employees: 100,
            },
            createdAt: "2026-09-01T10:00:00.000Z",
            updatedAt: "2026-09-02T10:00:00.000Z",
          },
        ],
      },
    });

    const result = await syncCustomerUsers(customer.id);

    expect(result).toEqual({
      success: true,
      synchronized: 1,
    });

    const users = await User.findAll();

    expect(users).toHaveLength(1);

    expect(users[0].externalId).toBe("external-1");

    expect(users[0].name).toBe("John Doe");

    expect(users[0].email).toBe("john@example.com");

    expect(users[0].companyName).toBe("Acme Inc");

    expect(users[0].deleted).toBe(false);

    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  test("is idempotent and updates existing users", async () => {
    const customer = await Customer.create({
      name: "Test Customer",
      apiUrl: "https://example.com/api/users",
    });

    const firstResponse = {
      data: {
        data: [
          {
            id: "external-1",
            name: "John Doe",
            email: "john@example.com",
            phone: "+123456789",
            status: "active",
            company: {
              name: "Acme Inc",
              industry: "Technology",
            },
          },
        ],
      },
    };

    const secondResponse = {
      data: {
        data: [
          {
            id: "external-1",
            name: "John Updated",
            email: "john.updated@example.com",
            phone: "+987654321",
            status: "inactive",
            company: {
              name: "New Acme Inc",
              industry: "Finance",
            },
          },
        ],
      },
    };

    axios.get
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(secondResponse);

    await syncCustomerUsers(customer.id);

    await syncCustomerUsers(customer.id);

    const users = await User.findAll();

    expect(users).toHaveLength(1);

    expect(users[0].externalId).toBe("external-1");

    expect(users[0].name).toBe("John Updated");

    expect(users[0].email).toBe("john.updated@example.com");

    expect(users[0].phone).toBe("+987654321");

    expect(users[0].status).toBe("inactive");

    expect(users[0].companyName).toBe("New Acme Inc");

    expect(users[0].companyIndustry).toBe("Finance");

    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  test("soft deletes users missing from the latest snapshot", async () => {
    const customer = await Customer.create({
      name: "Test Customer",
      apiUrl: "https://example.com/api/users",
    });

    const firstResponse = {
      data: {
        data: [
          {
            id: "external-1",
            name: "John Doe",
            email: "john@example.com",
            phone: "+123456789",
            status: "active",
            company: {
              name: "Acme Inc",
              industry: "Technology",
            },
          },
          {
            id: "external-2",
            name: "Jane Doe",
            email: "jane@example.com",
            phone: "+987654321",
            status: "active",
            company: {
              name: "Beta Inc",
              industry: "Finance",
            },
          },
        ],
      },
    };

    const secondResponse = {
      data: {
        data: [
          {
            id: "external-1",
            name: "John Doe",
            email: "john@example.com",
            phone: "+123456789",
            status: "active",
            company: {
              name: "Acme Inc",
              industry: "Technology",
            },
          },
        ],
      },
    };

    axios.get
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(secondResponse);

    await syncCustomerUsers(customer.id);

    await syncCustomerUsers(customer.id);

    const users = await User.findAll({
      order: [["externalId", "ASC"]],
    });

    expect(users).toHaveLength(2);

    const john = users.find((user) => user.externalId === "external-1");

    const jane = users.find((user) => user.externalId === "external-2");

    expect(john.deleted).toBe(false);

    expect(jane.deleted).toBe(true);
  });
  test("preserves existing data when customer API fails", async () => {
    const customer = await Customer.create({
      name: "Test Customer",
      apiUrl: "https://example.com/api/users",
    });

    axios.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: "external-1",
            name: "John Doe",
            email: "john@example.com",
            phone: "+123456789",
            status: "active",
            company: {
              name: "Acme Inc",
              industry: "Technology",
            },
          },
        ],
      },
    });

    await syncCustomerUsers(customer.id);

    axios.get.mockRejectedValue(new Error("Customer API unavailable"));

    await expect(syncCustomerUsers(customer.id)).rejects.toThrow(
      "Customer API unavailable",
    );

    const users = await User.findAll();

    expect(users).toHaveLength(1);

    expect(users[0].externalId).toBe("external-1");

    expect(users[0].name).toBe("John Doe");

    expect(users[0].email).toBe("john@example.com");

    expect(users[0].deleted).toBe(false);
  });
  test("retries when customer API returns a server error", async () => {
    const customer = await Customer.create({
      name: "Test Customer",
      apiUrl: "https://example.com/api/users",
    });

    const successfulResponse = {
      data: {
        data: [
          {
            id: "external-1",
            name: "John Doe",
            email: "john@example.com",
            status: "active",
            company: {
              name: "Acme Inc",
              industry: "Technology",
            },
          },
        ],
      },
    };

    const serverError = {
      response: {
        status: 500,
      },
    };

    axios.get
      .mockRejectedValueOnce(serverError)
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce(successfulResponse);

    const result = await syncCustomerUsers(customer.id);

    expect(result).toEqual({
      success: true,
      synchronized: 1,
    });

    expect(axios.get).toHaveBeenCalledTimes(3);

    const users = await User.findAll();

    expect(users).toHaveLength(1);

    expect(users[0].externalId).toBe("external-1");
  });
});
