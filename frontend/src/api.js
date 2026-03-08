const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1"

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    return response.json()
  }
  return { message: await response.text() }
}

export async function apiRequest(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const payload = await parseResponse(response)

  if (!response.ok) {
    const reason =
      payload?.errors?.[0]?.message || payload?.message || `Request failed (${response.status})`
    throw new Error(reason)
  }

  return payload
}

export function currency(value) {
  const number = Number(value || 0)
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(number)
}

export function percent(value) {
  const number = Number(value || 0)
  return `${number.toFixed(2)}%`
}

export function shortDate(dateValue) {
  if (!dateValue) return "-"
  const date = new Date(dateValue)
  return date.toLocaleDateString()
}
