## 1. Overview

This project implements a customer user synchronization service.

The main responsibility of the system is to retrieve users from an external customer API, transform the external data into an internal representation, store it locally, and expose the stored data through an internal REST API.

The system also provides a small React frontend for viewing, searching, paginating, and manually triggering synchronization.

The main design goals are:

- Reliable synchronization
- Idempotent operations
- Duplicate prevention
- Data preservation when the external API fails
- Separation between external and internal data models
- Support for multiple customers
- Simple and maintainable architecture
- Reasonable performance for the expected assessment scale

---

# 2. Architecture

The application follows a layered architecture.

```text
                    ┌──────────────────────┐
                    │   External Customer  │
                    │         API          │
                    └──────────┬───────────┘
                               │
                               │ HTTP + Bearer Token
                               ▼
                    ┌──────────────────────┐
                    │  Synchronization     │
                    │      Service         │
                    └──────────┬───────────┘
                               │
                               │ Transform
                               ▼
                    ┌──────────────────────┐
                    │   Internal User      │
                    │   Representation     │
                    └──────────┬───────────┘
                               │
                               │ Transaction
                               ▼
                    ┌──────────────────────┐
                    │   SQLite Database    │
                    └──────────┬───────────┘
                               │
                               │ Query
                               ▼
                    ┌──────────────────────┐
                    │    Internal REST     │
                    │         API          │
                    └──────────┬───────────┘
                               │
                               │ HTTP
                               ▼
                    ┌──────────────────────┐
                    │      React UI        │
                    └──────────────────────┘
```

The frontend only communicates with the internal API.

It never communicates directly with the external customer API.

---

# 3. Backend Layering

The backend is organized into several layers.

```text
Routes
  ↓
Controllers
  ↓
Services
  ↓
Models / Database
```

## Routes

Routes define the public HTTP endpoints.

Examples:

```text
POST /sync/users

GET /api/v1/users

GET /health
```

Routes remain thin and delegate business logic to controllers and services.

## Controllers

Controllers handle HTTP concerns such as:

- Reading query parameters
- Reading request bodies
- Calling services
- Returning HTTP responses
- Passing errors to the centralized error handler

Business logic is intentionally kept out of controllers.

## Services

Services contain the application's main business logic.

Important services include:

- `syncService.js`
- `paginationService.js`
- `schedulerService.js`

The synchronization service is responsible for communicating with the external API, transforming the data, and updating the database.

## Models

Sequelize models represent the local database structure.

The main models are:

- `Customer`
- `User`

---

# 4. Data Flow

A normal synchronization follows this flow:

```text
POST /sync/users

        ↓

syncController

        ↓

syncCustomerUsers()

        ↓

Load Customer

        ↓

Fetch External Users

        ↓

Validate Response

        ↓

Transform Users

        ↓

Start DB Transaction

        ↓

Bulk Upsert Users

        ↓

Soft Delete Missing Users

        ↓

Commit Transaction
```

If any step before the database mutation fails, the local data is not modified.

If a database operation fails during the transaction, the transaction is rolled back.

---

# 5. External API Isolation

One of the main design requirements is that the external API response should not dictate the internal database or API structure.

The external response contains nested information such as:

```json
{
  "id": "external-id",
  "name": "John Doe",
  "company": {
    "name": "Acme",
    "industry": "Technology",
    "role": "Engineer",
    "website": "https://example.com",
    "employees": 100
  }
}
```

The internal model instead stores:

```text
externalId

name

companyName

companyIndustry

companyRole

companyWebsite

companyEmployees
```

The transformation is performed inside the synchronization service.

This provides a clear boundary between the external system and our application.

### Benefits

If the external API changes:

```text
company.name
```

to:

```text
organization.name
```

only the transformation/integration layer needs to be updated.

The internal database and public API can remain unchanged.

---

# 6. Database Design

The database currently contains two main entities.

## Customer

```text
Customer
---------

id
name
apiUrl
createdAt
updatedAt
```

## User

```text
User
----

id
customerId
externalId
name
email
phone
status
companyName
companyIndustry
companyRole
companyWebsite
companyEmployees
deleted
sourceCreatedAt
sourceUpdatedAt
createdAt
updatedAt
```

A customer has many users.

```text
Customer 1 ──────── * User
```

The relationship is represented using:

```text
User.customerId
```

---

# 7. Duplicate Prevention

Duplicate prevention is enforced at the database level.

The users table has a composite unique constraint:

```text
UNIQUE(customerId, externalId)
```

The reason for using a composite key instead of making `externalId` globally unique is that external IDs are only guaranteed to be unique within the context of a customer.

For example:

```text
Customer A → externalId = 123

Customer B → externalId = 123
```

These can represent two different users in two different external systems.

Therefore:

```text
(customerId, externalId)
```

is the correct uniqueness boundary.

### Why use a database constraint?

Application-level checks alone are not sufficient.

A pattern such as:

```text
SELECT

if not exists:

    INSERT
```

can still produce duplicates when two requests run concurrently.

The database constraint provides the final guarantee.

---

# 8. Idempotent Synchronization

Synchronization is designed to be idempotent.

Running:

```text
POST /sync/users
```

multiple times with the same external data should not create duplicate users.

The process works as follows:

```text
First sync

    ↓

Insert users

Second sync

    ↓

Find matching (customerId, externalId)

    ↓

Update existing records
```

Therefore:

```text
Sync(Sync(Database))
=
Sync(Database)
```

from a data-state perspective.

This is important because scheduled jobs, retries, deployments, or manual actions can cause the same synchronization to run more than once.

---

# 9. Synchronization Safety

A major requirement is that a failed external API request must not destroy previously synchronized data.

The implementation follows this sequence:

```text
1. Fetch external data

2. Validate external data

3. Transform external data

4. Start database transaction

5. Modify database

6. Commit
```

The database transaction does not start until the external request succeeds.

Therefore, if the external API fails:

```text
External API

     ↓

Failure

     ↓

No database mutation

     ↓

Previous data remains
```

This is safer than deleting the existing users first and then attempting to refill them.

---

# 10. Handling Deleted Users

The external API is treated as an authoritative snapshot.

Suppose the local database contains:

```text
User A

User B

User C
```

The next successful external response contains:

```text
User A

User C
```

User B is no longer present.

Instead of physically deleting User B:

```text
deleted = true
```

is applied.

The database becomes:

```text
User A → deleted = false

User B → deleted = true

User C → deleted = false
```

### Why soft delete?

Soft deletion provides several advantages:

- Historical records are preserved.
- Accidental data loss is reduced.
- Deleted users can be inspected later.
- The system can potentially restore a user if the external system sends it again.

If the user appears in a future synchronization, the record is updated with:

```text
deleted = false
```

---

# 11. Empty Successful Snapshot

An important edge case is an empty successful response.

If the external API returns:

```json
{
  "data": []
}
```

this is treated as a valid authoritative snapshot.

Therefore, all existing users for that customer are marked as:

```text
deleted = true
```

This behavior is different from an API failure.

An API failure means:

```text
Unknown state
```

while a successful empty snapshot means:

```text
Known state: there are currently no users
```

This distinction prevents accidental data loss when the external service is unavailable.

---

# 12. Transactions

Database mutations are performed inside a Sequelize transaction.

The main mutation sequence is:

```text
BEGIN TRANSACTION

Bulk upsert synchronized users

Mark missing users as deleted

COMMIT
```

If an operation fails:

```text
BEGIN TRANSACTION

Bulk upsert

    ↓

Failure

ROLLBACK
```

This guarantees that a partial synchronization is not committed.

For example, if the user upsert succeeds but the soft-delete operation fails, the user upserts are also rolled back.

---

# 13. Retry Strategy

External APIs can fail temporarily.

The synchronization service therefore implements retry logic.

Current configuration:

```text
Maximum attempts: 3

Base delay:       500ms
```

Exponential backoff is used:

```text
Attempt 1

   ↓

500ms

   ↓

Attempt 2

   ↓

1000ms

   ↓

Attempt 3
```

Retryable failures include:

- `429 Too Many Requests`
- `5xx Server Errors`
- Network errors without an HTTP response

Normal client errors such as:

- `400`
- `401`
- `403`
- `404`

are not retried because retrying these errors is unlikely to resolve the underlying problem.

### Why retry before the transaction?

Retries happen while fetching the external data and before the database transaction starts.

This keeps the transaction short and avoids holding database resources while waiting for a remote service.

---

# 14. Pagination

The users API supports pagination:

```text
GET /api/v1/users?page=1&limit=20
```

The pagination logic is isolated in:

```text
paginationService.js
```

This service handles:

- Page normalization
- Limit normalization
- Maximum page size
- Offset calculation
- Total count
- Total pages
- Next-page information
- Previous-page information

The maximum page size is currently:

```text
100
```

This prevents clients from requesting an unnecessarily large result set.

---

# 15. Company Search

Users can be filtered by company:

```text
GET /api/v1/users?company=Acme
```

The search is performed against:

```text
companyName
```

using a partial match.

The database also includes a composite index:

```text
(customerId, deleted, companyName)
```

This index is aligned with the common query pattern:

```text
customerId

deleted = false

companyName
```

The current implementation is appropriate for the expected assessment scale.

For very large datasets, search requirements could be revisited with database-specific full-text search or a dedicated search engine.

---

# 16. Scheduler Design

The application supports scheduled synchronization.

The scheduler uses recursive `setTimeout` rather than `setInterval`.

Conceptually:

```text
Run sync

   ↓

Wait until sync finishes

   ↓

Schedule next run

   ↓

Run sync

   ↓

Wait until sync finishes

   ↓

...
```

This prevents overlapping jobs.

With `setInterval`, a long-running synchronization could result in:

```text
Sync #1 ──────────────────────

Sync #2       ──────────────────────

Sync #3             ──────────────────────
```

With recursive `setTimeout`:

```text
Sync #1 ─────────

              Wait

                  Sync #2 ─────────

                              Wait

                                  Sync #3
```

This is safer for a small service.

The scheduler also includes an `isRunning` guard to prevent accidental concurrent executions.

---

# 17. Multiple Customer Support

The system is designed with multiple customers in mind.

Instead of storing users without context:

```text
User
```

users belong to:

```text
Customer
```

through:

```text
customerId
```

The synchronization service accepts a customer ID:

```text
syncCustomerUsers(customerId)
```

This allows the same synchronization logic to be reused for different customers.

Each customer can have its own:

```text
apiUrl
```

The current assessment uses one customer and a shared `CUSTOMER_API_TOKEN`.

In a multi-customer production implementation, credentials should be managed per customer through a secure secrets mechanism rather than relying on a single global token.

The current data model does not require a redesign to support additional customers.

---

# 18. Scheduler and Multiple Customers

The scheduler loads all customers:

```text
Customer.findAll()
```

and synchronizes them sequentially.

Conceptually:

```text
Customer A

   ↓

Sync A

   ↓

Customer B

   ↓

Sync B

   ↓

Customer C

   ↓

Sync C
```

Sequential processing was chosen intentionally for the current scope.

### Why not run all customers in parallel?

Uncontrolled parallelism could create:

- Too many external API requests
- Rate limiting
- Higher database load
- Increased memory usage
- More difficult failure handling

For the current assessment, sequential processing provides predictable resource usage.

At larger scale, a bounded concurrency model or job queue would be preferable.

---

# 19. Performance Considerations

Several decisions were made to reduce unnecessary database and network overhead.

## Bulk Operations

Users are synchronized using Sequelize `bulkCreate` with update behavior instead of inserting each user individually.

This reduces the number of database operations.

The current implementation intentionally does not chunk the operation because the expected assessment dataset is relatively small.

## Database Indexes

The database uses:

```text
UNIQUE(customerId, externalId)
```

and:

```text
(customerId, deleted, companyName)
```

The first protects data integrity and supports synchronization lookup behavior.

The second supports the most common read/filter pattern.

## Pagination

Pagination prevents the API from returning the entire dataset at once.

## Short Transactions

The external API is called before opening the database transaction.

This means the transaction is only used for local database work.

## Sequential Scheduled Sync

Scheduled synchronization is intentionally sequential to avoid uncontrolled concurrency.

---

# 20. Error Handling

Errors are handled at multiple layers.

## Controller Layer

Controllers pass errors to Express's centralized error handler.

## Service Layer

Services throw meaningful errors when:

- Customer does not exist
- External API request fails
- External API response is invalid
- Database operations fail

## Central Error Handler

The Express application contains a centralized error handler that converts errors into API responses.

External API failures are exposed as a `502 Bad Gateway` style response because the internal service depends on an upstream service.

The implementation avoids returning raw external API details to clients.

---

# 21. Structured Logging

The application uses structured JSON logging.

Example:

```json
{
  "timestamp": "2026-09-10T20:00:00.000Z",
  "level": "info",
  "event": "sync_completed",
  "customerId": "<customerId>",
  "synchronized": 20
}
```

Structured logging makes it easier to:

- Search logs
- Filter by customer
- Monitor synchronization
- Integrate with log aggregation systems
- Add observability later

Important events include:

```text
sync_started

sync_completed

sync_failed

customer_api_retry

scheduled_sync_started

scheduled_sync_completed

scheduled_customer_sync_failed
```

---

# 22. Frontend Architecture

The frontend is intentionally small because the assessment focuses primarily on the backend synchronization service.

The React UI provides:

- User listing
- Company search
- Pagination
- Manual synchronization
- Loading states
- Error messages
- Synchronization success feedback

The frontend communicates only with the backend REST API.

In local development, the backend is typically available at:

```text
http://localhost:3000
```

The external customer API is not exposed to the frontend.

---

# 23. Security Considerations

The external API token is stored in an environment variable:

```text
CUSTOMER_API_TOKEN
```

It is not hard-coded into the source code.

The `.env` file should not be committed to source control.

For production, credentials should be stored in a secrets manager or deployment platform secret store.

The current internal API does not implement authentication because authentication is outside the primary scope of the assessment.

Before exposing the service publicly, authentication and authorization should be added.

---

# 24. Trade-offs

## SQLite

SQLite was selected because:

- It requires no separate database server.
- It is easy to run locally.
- It is sufficient for the expected assessment scale.
- Sequelize allows switching to PostgreSQL later with limited application-level changes.

For production workloads with multiple application instances and higher concurrency, PostgreSQL would be a stronger choice.

## Bulk Create Without Chunking

The current implementation uses a single bulk operation.

This keeps the code simple and efficient for the expected dataset size.

For very large customer datasets, the synchronization should be changed to process users in chunks.

For example:

```text
100,000 users

    ↓

Batch 1: 1,000

Batch 2: 1,000

Batch 3: 1,000

...
```

This would reduce memory pressure and make large synchronization jobs more manageable.

## Recursive setTimeout

The scheduler uses recursive `setTimeout` instead of `setInterval`.

This adds a little scheduling complexity but prevents overlapping jobs.

For a distributed production environment, a persistent job queue would be a better solution.

---

# 25. Failure Scenarios

## External API Is Down

```text
Request

   ↓

Retry

   ↓

Retry

   ↓

Retry

   ↓

Failure
```

Result:

```text
Database remains unchanged
```

## External API Returns Invalid Data

```text
Request

   ↓

Invalid response

   ↓

Validation fails

   ↓

No database mutation
```

## Database Mutation Fails

```text
Fetch succeeds

   ↓

Transaction starts

   ↓

Mutation fails

   ↓

ROLLBACK
```

Result:

```text
Previous local state remains intact
```

## User Is Removed From External API

```text
Successful snapshot

   ↓

User missing

   ↓

deleted = true
```

The record remains available internally for historical/reference purposes.

---

# 26. Why This Architecture

The architecture intentionally separates responsibilities:

```text
Controller

    ↓

Service

    ↓

Integration + Transformation

    ↓

Database
```

This makes the code easier to:

- Test
- Maintain
- Extend
- Replace external integrations
- Change database implementation
- Add additional customers
- Add new synchronization strategies

The most important principle is that the external API is treated as an integration boundary rather than as the application's data model.

---

# 27. Scalability Path

The current architecture is suitable for the expected assessment scale.

If the system grows significantly, the next architectural steps would be:

### 1. PostgreSQL

Move from SQLite to PostgreSQL for stronger concurrency and production deployment.

### 2. Job Queue

Move synchronization jobs into a queue such as:

```text
Application

    ↓

Job Queue

    ↓

Sync Workers
```

This allows synchronization to run independently of API requests.

### 3. Bounded Concurrency

Process multiple customers concurrently but with a controlled limit.

For example:

```text
Maximum 5 customers at a time
```

instead of unlimited parallelism.

### 4. Distributed Scheduling

Move scheduling responsibility to a dedicated worker or distributed scheduler.

### 5. Observability

Add:

- Metrics
- Tracing
- Sync duration
- Success/failure rates
- Retry counts
- Per-customer health

### 6. Incremental Synchronization

If the external API supports:

```text
updatedSince
cursor
page
```

the service could synchronize only changed records instead of downloading the entire dataset every time.

---

# 28. Testing Strategy

The synchronization logic is tested independently from the external service.

The external API is mocked during tests.

Core scenarios include:

1. Successful synchronization
2. Idempotent synchronization and updating existing users
3. Soft deletion
4. Preserving existing data after API failure
5. Retrying transient API failures
6. External-to-internal data transformation

This approach makes tests deterministic and prevents external API availability from affecting the test suite.

---

# 29. Summary

The system uses a simple layered architecture with a clear integration boundary around the external customer API.

The key design decisions are:

- External data is transformed before persistence.
- Local database data is used by the internal API.
- Duplicate users are prevented using a database-level composite unique constraint.
- Synchronization is idempotent.
- Missing users are soft-deleted.
- External failures do not destroy existing local data.
- Database changes are transactional.
- Transient external failures are retried with exponential backoff.
- User queries are paginated.
- Company filtering is indexed.
- Scheduled synchronization avoids overlapping jobs.
- The data model supports multiple customers.
- The implementation remains intentionally simple for the current assessment scale.

The architecture provides a reasonable balance between correctness, maintainability, and performance while leaving a clear path toward production-scale infrastructure.
