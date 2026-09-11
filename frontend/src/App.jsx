import { useEffect, useState } from "react";
import axios from "axios";

function App() {
  const [users, setUsers] = useState([]);
  const [company, setCompany] = useState("");

  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [error, setError] = useState("");
  const [syncMessage, setSyncMessage] = useState("");

  const LIMIT = 10;

  async function fetchUsers(
    companyName = "",
    currentPage = 1,
  ) {
    try {
      setLoading(true);
      setError("");

      const response = await axios.get(
        "http://localhost:3000/api/v1/users",
        {
          params: {
            company: companyName || undefined,
            page: currentPage,
            limit: LIMIT,
          },
        },
      );

      setUsers(response.data.data);
      setPagination(response.data.pagination);
      setPage(currentPage);
    } catch (error) {
      console.error(error);
      setError("Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    try {
      setSyncing(true);
      setSyncMessage("");
      setError("");

     await axios.post(
  "http://localhost:3000/sync/users",
);

      setSyncMessage(
        "Users synchronized successfully.",
      );

      await fetchUsers(company, 1);
    } catch (error) {
      console.error(error);

      setSyncMessage("");

      setError(
        error.response?.data?.message ||
          "Failed to synchronize users.",
      );
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  function handleSearch() {
    fetchUsers(company, 1);
  }

  function handleClear() {
    setCompany("");
    fetchUsers("", 1);
  }

  function handleNextPage() {
    if (pagination?.hasNextPage) {
      fetchUsers(company, page + 1);
    }
  }

  function handlePreviousPage() {
    if (pagination?.hasPreviousPage) {
      fetchUsers(company, page - 1);
    }
  }

  return (
    <div className="app">
      <h1>Customer Users</h1>

      <button
        onClick={handleSync}
        disabled={syncing || loading}
      >
        {syncing ? "Syncing..." : "Sync Users"}
      </button>

      {syncMessage && (
        <p>{syncMessage}</p>
      )}

      <div className="filters">
        <input
          type="text"
          placeholder="Search by company..."
          value={company}
          onChange={(event) => {
            setCompany(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleSearch();
            }
          }}
        />

        <button
          onClick={handleSearch}
          disabled={loading || syncing}
        >
          Search
        </button>

        <button
          onClick={handleClear}
          disabled={loading || syncing}
        >
          Clear
        </button>
      </div>

      {loading && (
        <p>Loading users...</p>
      )}

      {error && (
        <p>{error}</p>
      )}

      {!loading && !error && (
        <>
          <p>
            Total users:{" "}
            <strong>
              {pagination?.total || 0}
            </strong>
          </p>

          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Company</th>
                <th>Industry</th>
              </tr>
            </thead>

            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan="6">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>
                      {user.phone || "-"}
                    </td>
                    <td>
                      {user.status || "-"}
                    </td>
                    <td>
                      {user.companyName || "-"}
                    </td>
                    <td>
                      {user.companyIndustry || "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="pagination">
            <button
              onClick={handlePreviousPage}
              disabled={
                loading ||
                !pagination?.hasPreviousPage
              }
            >
              Previous
            </button>

            <span>
              Page {pagination?.page || 1} of{" "}
              {pagination?.totalPages || 1}
            </span>

            <button
              onClick={handleNextPage}
              disabled={
                loading ||
                !pagination?.hasNextPage
              }
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default App;