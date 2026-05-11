const DEFAULT_API_PREFIX = "/api/v1"
const MAX_NETWORK_RETRIES = 3

const RAW_BASE = import.meta.env.VITE_API_BASE_URL
const RAW_PREFIX = import.meta.env.VITE_API_PREFIX || DEFAULT_API_PREFIX

function normalizeApiBase() {
  const prefix = RAW_PREFIX.startsWith("/") ? RAW_PREFIX : `/${RAW_PREFIX}`

  if (!RAW_BASE) {
    return prefix
  }

  const base = String(RAW_BASE).trim()
  const trimmedBase = base.replace(/\/+$/, "")

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

export class ApiError extends Error {
  constructor(message, { status = null, payload = null, errors = null } = {}) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.payload = payload
    this.errors = errors
    this.details = errors
  }
}

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

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function fetchWithRetry(url, options) {
  let lastError = null

  for (let attempt = 1; attempt <= MAX_NETWORK_RETRIES; attempt += 1) {
    try {
      return await fetch(url, options)
    } catch (error) {
      lastError = error
      if (attempt < MAX_NETWORK_RETRIES) {
        await delay(300 * attempt)
      }
    }
  }

  throw lastError
}

async function parseApiError(response) {
  const payload = await parseResponse(response)
  const message = payload?.errors?.[0]?.message || payload?.message || `Request failed (${response.status})`
  return new ApiError(message, {
    status: response.status,
    payload,
    errors: payload?.errors || null,
  })
}

function extractFilenameFromDisposition(dispositionHeader) {
  const header = String(dispositionHeader || "")
  if (!header) return null

  const utfMatch = header.match(/filename\*=UTF-8''([^;]+)/i)
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1].replace(/["']/g, ""))
    } catch {
      return utfMatch[1].replace(/["']/g, "")
    }
  }

  const simpleMatch = header.match(/filename="?([^";]+)"?/i)
  if (simpleMatch?.[1]) {
    return simpleMatch[1].trim()
  }

  return null
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

  let response
  try {
    response = await fetchWithRetry(apiUrl(path), options)
  } catch (error) {
    throw new Error(`Unable to reach the API at ${API_BASE}. Is the backend running?`)
  }

  const payload = await parseResponse(response)

  if (!response.ok) {
    const reason =
      payload?.errors?.[0]?.message || payload?.message || `Request failed (${response.status})`
    if (response.status >= 500) {
      const message = String(payload?.message || "").toLowerCase()
      if (!message || message.includes("econnrefused") || message.includes("proxy")) {
        throw new Error("Backend is unavailable. Make sure the API server is running.")
      }
    }
    throw new ApiError(reason, {
      status: response.status,
      payload,
      errors: payload?.errors || null,
    })
  }

  return payload
}

export async function apiMultipartRequest(path, { method = "POST", token, formData } = {}) {
  if (!(formData instanceof FormData)) {
    throw new Error("apiMultipartRequest requires a FormData instance")
  }

  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  let response
  try {
    response = await fetchWithRetry(apiUrl(path), {
      method,
      headers,
      body: formData,
    })
  } catch (error) {
    throw new Error(`Unable to reach the API at ${API_BASE}. Is the backend running?`)
  }

  const payload = await parseResponse(response)

  if (!response.ok) {
    const reason =
      payload?.errors?.[0]?.message || payload?.message || `Request failed (${response.status})`
    throw new ApiError(reason, {
      status: response.status,
      payload,
      errors: payload?.errors || null,
    })
  }

  return payload
}

export async function apiDownload(path, { method = "GET", token, body, defaultFileName } = {}) {
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  const options = { method, headers }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json"
    options.body = JSON.stringify(body)
  }

  let response
  try {
    response = await fetchWithRetry(apiUrl(path), options)
  } catch (error) {
    throw new Error(`Unable to reach the API at ${API_BASE}. Is the backend running?`)
  }

  if (!response.ok) {
    throw await parseApiError(response)
  }

  const blob = await response.blob()
  const disposition = response.headers.get("content-disposition")
  const filename = extractFilenameFromDisposition(disposition) || defaultFileName || "download.xlsx"

  return { blob, filename }
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
