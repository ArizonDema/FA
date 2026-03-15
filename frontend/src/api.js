const DEFAULT_API_ORIGIN = "http://localhost:8000"
const DEFAULT_API_PREFIX = "/api/v1"

const RAW_BASE = import.meta.env.VITE_API_BASE_URL
const RAW_PREFIX = import.meta.env.VITE_API_PREFIX || DEFAULT_API_PREFIX

function normalizeApiBase() {
  const base = (RAW_BASE && String(RAW_BASE).trim()) || DEFAULT_API_ORIGIN
  const trimmedBase = base.replace(/\/+$/, "")
  const prefix = RAW_PREFIX.startsWith("/") ? RAW_PREFIX : `/${RAW_PREFIX}`

  if (!RAW_BASE) {
    return `${trimmedBase}${prefix}`
  }

  try {
    const parsed = new URL(trimmedBase)
    if (parsed.pathname === "" || parsed.pathname === "/") {
      return `${trimmedBase}${prefix}`
    }
    return trimmedBase
  } catch {
    if (trimmedBase.includes("/api/") || trimmedBase.endsWith("/api") || trimmedBase.endsWith("/api/v1")) {
      return trimmedBase
    }
    return `${trimmedBase}${prefix}`
  }
}

export const API_BASE = normalizeApiBase()
export const API_ORIGIN = (() => {
  try {
    return new URL(API_BASE).origin
  } catch {
    return ""
  }
})()
export const API_DOCS_URL = API_ORIGIN ? `${API_ORIGIN}/api/docs` : "/api/docs"

export function apiUrl(path = "") {
  if (!path) return API_BASE
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${API_BASE}${normalizedPath}`
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    return response.json()
  }
  return { message: await response.text() }
}

export async function apiRequest(path, { method = "GET", token, body } = {}) {
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  const options = { method, headers }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json"
    options.body = JSON.stringify(body)
  }

  const response = await fetch(apiUrl(path), options)

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
