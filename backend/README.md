# Customer User Synchronization Service

A backend service that synchronizes customer users from an external API into a local database, exposes the synchronized data through an internal REST API, and provides a small React UI for viewing, searching, paginating, and triggering synchronization.

## Overview

The system is designed around the following flow:

```text
External Customer API
        ↓
Synchronization Service
        ↓
Transformation Layer
        ↓
Local Database
        ↓
Internal REST API
        ↓
React UI
```

The local database is the source for the application's read API. The frontend never reads users directly from the external customer API.

## Features

- Synchronize users from an external customer API
- Bearer token authentication using environment variables
- Idempotent synchronization
- Duplicate prevention using a database-level unique constraint
- Update existing users with the latest customer information
- Soft-delete users missing from the latest successful snapshot
- Preserve existing data when the external API fails
- Retry transient external API failures
- Structured JSON logging
- Search users by company
- Reusable backend pagination service
- Scheduled automatic synchronization
- Customer-aware data model for future multi-customer support
- React frontend for viewing and filtering users
- SQLite persistence
- Automated tests for core synchronization behavior
- Docker and Docker Compose support

## Tech Stack

### Backend

- Node.js
- Express
- Sequelize
- SQLite
- Axios
- Jest

### Frontend

- React
- Vite
- Axios

### Infrastructure

- Docker
- Docker Compose

## Project Structure

```text
customer-sync/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js
│   │   ├── controllers/
│   │   │   ├── syncController.js
│   │   │   └── userController.js
│   │   ├── models/
│   │   │   ├── Customer.js
│   │   │   ├── User.js
│   │   │   └── index.js
│   │   ├── routes/
│   │   │   ├── syncRoutes.js
│   │   │   └── userRoutes.js
│   │   ├── services/
│   │   │   ├── paginationService.js
│   │   │   ├── schedulerService.js
│   │   │   └── syncService.js
│   │   ├── utils/
│   │   │   └── logger.js
│   │   ├── app.js
│   │   └── server.js
│   ├── tests/
│   │   ├── syncService.test.js
│   │   └── syncCustomerUsers.test.js
│   ├── .env
│   ├── .dockerignore
│   ├── Dockerfile
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── .dockerignore
│   ├── Dockerfile
│   └── package.json
│
├── docker-compose.yml
├── DESIGN.md
└── README.md
```

# Backend Setup

Navigate to the backend:

```bash
cd backend
```

Install dependencies:

```bash
npm install
```

Create a `.env` file:

```env
PORT=3000
DATABASE_STORAGE=./database.sqlite
CUSTOMER_API_URL=https://assessment-api-gamma.vercel.app/api/users
CUSTOMER_API_TOKEN=your_customer_api_token
SYNC_INTERVAL_MINUTES=30
```

The customer API token must be provided through the environment and should never be committed to source control.

Start the backend in development mode:

```bash
npm run dev
```

Or start it normally:

```bash
npm start
```

The backend runs by default on:

```text
http://localhost:3000
```

# Frontend Setup

In another terminal:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start the frontend:

```bash
npm run dev
```

Vite will display the local frontend URL in the terminal.

The default development URL is:

```text
http://localhost:5173
```

# External Customer API

The application synchronizes users from:

```text
https://assessment-api-gamma.vercel.app/api/users
```

The API requires a Bearer token.

The application does not expose or hard-code the token. It is loaded from:

```text
CUSTOMER_API_TOKEN
```

The external response is transformed before it reaches the database.

For example, the external nested company object:

```json
{
  "company": {
    "name": "Acme Inc",
    "industry": "Technology"
  }
}
```

is transformed into internal fields:

```text
companyName
companyIndustry
```

This keeps the internal schema independent from the external API response structure.

# Database Model

The system currently contains two main entities.

## Customer

Represents an external customer/source.

Important fields:

- `id`
- `name`
- `apiUrl`

## User

Represents a synchronized user.

Important fields:

- `id`
- `customerId`
- `externalId`
- `name`
- `email`
- `phone`
- `status`
- `companyName`
- `companyIndustry`
- `companyRole`
- `companyWebsite`
- `companyEmployees`
- `deleted`
- `sourceCreatedAt`
- `sourceUpdatedAt`

Users have a composite unique constraint:

```text
(customerId, externalId)
```

This prevents the same external user from being inserted more than once for the same customer.

# Synchronization

## Manual Synchronization

Send:

```http
POST /sync/users
```

Example:

```bash
curl -X POST http://localhost:3000/sync/users
```

When no `customerId` is provided, the backend resolves the configured `Assessment Customer`.

A specific customer can also be selected when required:

```http
POST /sync/users?customerId=6
```

Customer IDs are database-generated and should not be assumed to have a fixed value across environments.

Successful response:

```json
{
  "success": true,
  "message": "Users synchronized successfully",
  "synchronized": 20
}
```

## Synchronization Behavior

A synchronization follows these steps:

1. Load the customer configuration.
2. Request the latest users from the external API.
3. Retry transient external API failures when appropriate.
4. Validate the response shape.
5. Transform external users into the internal representation.
6. Insert new users.
7. Update existing users.
8. Soft-delete users missing from the latest successful snapshot.
9. Commit the database transaction.

The external API request and response validation happen before database mutations.

This is important because an external API failure must not remove or modify previously synchronized data.

## Idempotency

The synchronization can safely be executed multiple times.

If the same external user appears again, the database-level unique constraint:

```text
(customerId, externalId)
```

prevents duplicate records.

Existing records are updated with the latest synchronized information.

## Deleted Users

The external API is treated as an authoritative snapshot.

If a previously synchronized user is absent from a successful response, the user is marked:

```text
deleted = true
```

The database record is not physically removed.

By default, deleted users are excluded from the public users API.

# Retry Strategy

Transient customer API failures are retried automatically.

The current configuration is:

- Maximum attempts: 3
- Base delay: 500ms
- Exponential backoff

Retryable responses include:

```text
429
500+
```

Errors without an HTTP response are also treated as retryable.

The approximate retry delays are:

```text
Attempt 1 fails
    ↓
500ms
    ↓
Attempt 2 fails
    ↓
1000ms
    ↓
Attempt 3
```

Normal client errors such as `400`, `401`, `403`, and `404` are not retried.

Retries happen before database mutations begin, so temporary external API failures do not affect previously synchronized data.

# Scheduled Synchronization

The service supports automatic synchronization using a recursive `setTimeout` scheduler.

Configuration:

```env
SYNC_INTERVAL_MINUTES=30
```

The scheduler:

1. Starts after the database and server are initialized.
2. Performs an initial synchronization.
3. Waits for the configured interval after synchronization completes.
4. Runs the next synchronization.
5. Repeats continuously.

Using recursive `setTimeout` instead of `setInterval` prevents overlapping synchronization jobs caused by a previous synchronization taking longer than expected.

The scheduler also supports multiple customers by loading customers from the database and synchronizing each one sequentially.

# API Documentation

The backend exposes a small REST API for synchronization, health checks, and retrieving locally synchronized users.

## Base URL

When running locally:

```text
http://localhost:3000
```

Versioned user endpoints are available under:

```text
/api/v1
```

## 1. Health Check

### Request

```http
GET /health
```

### Example

```bash
curl http://localhost:3000/health
```

### Response

```json
{
  "status": "ok"
}
```

## 2. Synchronize Users

Triggers synchronization from the configured external customer API.

### Request

```http
POST /sync/users
```

### Example

```bash
curl -X POST http://localhost:3000/sync/users
```

When no customer ID is provided, the backend resolves the configured default customer.

A specific customer can optionally be selected:

```http
POST /sync/users?customerId=<customerId>
```

### Successful Response

```json
{
  "success": true,
  "message": "Users synchronized successfully",
  "synchronized": 20
}
```

### Behavior

The synchronization:

- fetches users from the external API
- validates the response
- transforms external data into the internal model
- inserts new users
- updates existing users
- soft-deletes users missing from the latest successful snapshot
- commits database changes inside a transaction

If the external API fails, existing local data is preserved.

## 3. Get Users

Returns users stored in the local database.

The endpoint does not call the external customer API.

### Request

```http
GET /api/v1/users
```

### Example

```bash
curl http://localhost:3000/api/v1/users
```

By default, only non-deleted users are returned.

### Response

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "customerId": 6,
      "externalId": "6aa0527a3d202533d436ff0a",
      "name": "Ethelyn Heaney",
      "email": "ethelyn.heaney@wehnerinc.com",
      "phone": "+19808846205",
      "status": "active",
      "companyName": "Wehner Inc",
      "companyIndustry": "Cybersecurity",
      "companyRole": "Staff Engineer",
      "companyWebsite": "https://wehnerinc.com",
      "companyEmployees": 12322,
      "deleted": false
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 20,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

The exact database-generated `id` and `customerId` values may differ between environments.

## 4. Pagination

### Request

```http
GET /api/v1/users?page=1&limit=20
```

### Parameters

| Parameter | Type    | Default | Maximum | Description                |
| --------- | ------- | ------: | ------: | -------------------------- |
| `page`    | integer |     `1` |       - | Page number                |
| `limit`   | integer |    `20` |   `100` | Number of records per page |

### Example

```bash
curl "http://localhost:3000/api/v1/users?page=2&limit=10"
```

### Response

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 2,
    "limit": 10,
    "total": 20,
    "totalPages": 2,
    "hasNextPage": false,
    "hasPreviousPage": true
  }
}
```

## 5. Search by Company

Users can be filtered using a partial company name.

### Request

```http
GET /api/v1/users?company=Acme
```

### Example

```bash
curl "http://localhost:3000/api/v1/users?company=Wehner"
```

The search is performed against the internal `companyName` field.

## 6. Include Deleted Users

Deleted users are excluded by default.

To include soft-deleted users:

```http
GET /api/v1/users?includeDeleted=true
```

### Example

```bash
curl "http://localhost:3000/api/v1/users?includeDeleted=true"
```

## 7. Filter by Customer

The API supports selecting a specific customer when needed:

```http
GET /api/v1/users?customerId=<customerId>
```

For example:

```http
GET /api/v1/users?customerId=6
```

Customer IDs are database-generated and should not be assumed to have a fixed value across environments.

Parameters can be combined:

```http
GET /api/v1/users?customerId=6&company=Acme&page=1&limit=10
```

## Error Responses

### Customer Not Found

```json
{
  "success": false,
  "message": "Customer not found"
}
```

### External Customer API Failure

```json
{
  "success": false,
  "message": "Customer API request failed"
}
```

### Invalid External API Response

An invalid response from the external customer API causes synchronization to fail before database mutations are committed.

The previously synchronized local data remains intact.

## API Summary

| Method | Endpoint                            | Description                             |
| ------ | ----------------------------------- | --------------------------------------- |
| `GET`  | `/health`                           | Health check                            |
| `POST` | `/sync/users`                       | Synchronize users from the external API |
| `GET`  | `/api/v1/users`                     | Retrieve locally synchronized users     |
| `GET`  | `/api/v1/users?company=...`         | Search users by company                 |
| `GET`  | `/api/v1/users?customerId=...`      | Filter users by customer                |
| `GET`  | `/api/v1/users?includeDeleted=true` | Include soft-deleted users              |
| `GET`  | `/api/v1/users?page=1&limit=20`     | Paginated users                         |

# Error Handling

The application handles failures at different levels.

## External API Failure

If the customer API is unavailable after retries:

- synchronization fails
- previous local data remains intact
- the error is logged
- the API returns an appropriate error response

## Invalid External Response

If the external API returns an unexpected response structure, synchronization fails before modifying the database.

This protects the local database from accidentally treating malformed data as a valid snapshot.

## Database Failure

Database mutations are executed inside a transaction.

If a database operation fails, the transaction is rolled back.

This prevents partially completed synchronization from being committed.

# Transformation Layer

The external API response is intentionally not used as the internal database model.

The synchronization service maps external users into an internal representation before persistence.

For example:

```text
External API

user.company.name
        ↓
Transformation Layer
        ↓
Internal model
        ↓
user.companyName
```

This separation provides several benefits:

- The internal API is stable if the external API changes.
- Database design remains under our control.
- Business logic does not depend directly on the external response structure.
- Multiple external customer APIs can later be normalized into the same internal model.

# Data Integrity

The system protects data integrity at multiple levels.

## Database Constraint

Duplicate users are prevented using:

```text
UNIQUE(customerId, externalId)
```

## Transaction

The local database mutation phase runs inside a transaction.

## External API Validation

The external response is validated before local database changes are made.

## Failure Isolation

If fetching the external data fails, the existing local database is left untouched.

Together, these mechanisms make synchronization safe to repeat and resilient to common failure scenarios.

# Logging

The application uses structured JSON logs.

Example:

```json
{
  "timestamp": "2026-09-10T20:00:00.000Z",
  "level": "info",
  "event": "sync_completed",
  "customerId": 6,
  "synchronized": 20
}
```

Structured logs make the service easier to monitor and integrate with centralized logging systems.

Important synchronization events include:

- `sync_started`
- `sync_completed`
- `sync_failed`
- `customer_api_retry`
- `scheduled_sync_started`
- `scheduled_sync_completed`
- `scheduled_customer_sync_failed`

# Testing

Run the backend tests:

```bash
cd backend
npm test
```

The tests cover core synchronization scenarios including:

- successful synchronization
- idempotent synchronization
- duplicate prevention
- updating existing users
- soft deletion
- preserving data when the external API fails
- retrying transient API failures
- external user transformation

The external API is mocked during tests, so tests do not depend on the availability of the remote service.

# Performance Considerations

The implementation is designed to be simple and efficient for the expected assessment scale.

## Bulk Database Writes

Synchronization uses Sequelize `bulkCreate` with duplicate update behavior instead of inserting users one by one.

This reduces the number of database round trips.

## Indexes

The users table includes:

```text
UNIQUE(customerId, externalId)
```

for duplicate prevention and efficient lookup/upsert behavior.

It also includes a composite index for common read patterns:

```text
(customerId, deleted, companyName)
```

This supports the default user listing and company filtering use cases.

## Pagination

The users endpoint is paginated to avoid returning the entire users table in a single response.

The API also limits the maximum page size to `100`.

## Scheduler

Scheduled synchronization uses sequential customer processing.

This avoids sending an uncontrolled number of concurrent requests to the external API or database.

For a much larger number of customers, a bounded worker pool or job queue would be more appropriate.

# Multi-Customer Readiness

The database model includes a `Customer` entity and every user belongs to a customer through:

```text
User.customerId
```

The duplicate constraint is scoped to the customer:

```text
(customerId, externalId)
```

This is intentional.

The same external ID could theoretically exist in two different customer systems, so making `externalId` globally unique would create an unnecessary restriction.

The current assessment uses one customer, but the architecture can support additional customers without changing the fundamental user model.

# Security Considerations

The customer API token is loaded from an environment variable:

```text
CUSTOMER_API_TOKEN
```

Secrets should not be committed to source control.

The `.env` file should be excluded using `.gitignore`.

In a production environment, secrets should be stored in a dedicated secrets manager or deployment platform secret store.

The internal API should also be protected by authentication and authorization before being exposed publicly.

# Docker

The project includes Docker support for both backend and frontend.

Build and start the complete application from the project root:

```bash
docker compose up --build
```

The backend is available at:

```text
http://localhost:3000
```

The frontend is available at:

```text
http://localhost:5173
```

The SQLite database is persisted using a Docker Compose volume mapping:

```text
./backend/database.sqlite:/app/database.sqlite
```

This keeps the local database available across container recreation.

To stop the application:

```bash
docker compose down
```

# Running the Complete Application

## Option 1: Local Development

Start the backend:

```bash
cd backend
npm install
npm run dev
```

Then start the frontend in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Once both applications are running:

1. Open the frontend URL displayed by Vite.
2. The UI loads synchronized users from the backend.
3. Use the company search field to filter users.
4. Use pagination to navigate between result pages.
5. Click `Sync Users` to manually trigger synchronization.
6. The frontend refreshes the first page after a successful synchronization.

## Option 2: Docker Compose

From the project root:

```bash
docker compose up --build
```

Then open:

```text
http://localhost:5173
```

# Design Decisions

The main architectural goals are:

- Keep external API concerns isolated from internal business logic.
- Keep the local database independent from the external response shape.
- Make synchronization idempotent.
- Protect existing data from external failures.
- Keep pagination reusable.
- Prepare the data model for multiple customers.
- Use database constraints as the final line of defense against duplicates.
- Avoid coupling the frontend to database-generated customer IDs.
- Keep the implementation simple enough for the current scale while allowing future expansion.

More detailed architectural decisions and trade-offs are documented in:

```text
DESIGN.md
```

# Future Improvements

Possible future improvements include:

- OpenAPI/Swagger specification
- Cursor-based pagination for very large datasets
- Persistent job queues such as BullMQ/Redis
- Distributed scheduler/worker architecture
- More comprehensive API integration tests
- Authentication and authorization for the internal API
- Improved observability and metrics
- Chunked bulk synchronization for very large datasets
- Per-customer credentials and configuration
- More sophisticated retry policies
- Dead-letter handling for permanently failing customer synchronizations
- Incremental synchronization if the external API supports change tracking

# Assessment Requirements Coverage

| Requirement                   | Implementation                               |
| ----------------------------- | -------------------------------------------- |
| Sync users from external API  | `POST /sync/users` + synchronization service |
| Users stored locally          | Sequelize + SQLite                           |
| Prevent duplicates            | `UNIQUE(customerId, externalId)`             |
| Update existing users         | Bulk upsert/update behavior                  |
| Handle deleted users          | Soft deletion using `deleted`                |
| Idempotent sync               | Repeated synchronization is safe             |
| Preserve data on API failure  | Fetch before DB mutation + retry             |
| Internal API reads local data | `/api/v1/users` reads SQLite                 |
| Search by company             | `company` query parameter                    |
| Pagination                    | Reusable pagination service                  |
| External response isolation   | Transformation layer                         |
| Multiple customer readiness   | `Customer` model + `customerId`              |
| Manual sync UI                | React `Sync Users` button                    |
| Search/filter UI              | React company filter                         |
| Scheduled sync                | Recursive scheduler                          |
| Retry logic                   | Exponential backoff                          |
| Structured logging            | JSON logger                                  |
| Automated tests               | Jest test suite                              |
| Docker support                | Dockerfiles + Docker Compose                 |
| API documentation             | README API documentation section             |

# License

This project was created as a backend assessment implementation.
