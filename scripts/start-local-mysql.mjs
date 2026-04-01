import fs from "node:fs"
import net from "node:net"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")

const mysqlCandidates = [
  "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqld.exe",
  "C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqld.exe",
]

const readEnvValue = (contents, key, fallback = "") => {
  const match = contents.match(new RegExp(`^${key}=(.*)$`, "m"))
  if (!match) return fallback
  return match[1].replace(/^"|"$/g, "")
}

const escapeSqlLiteral = (value) => String(value || "").replace(/'/g, "''")

const isPortOpen = (port, host = "127.0.0.1", timeoutMs = 1000) =>
  new Promise((resolve) => {
    const socket = new net.Socket()
    const done = (result) => {
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs)
    socket.once("error", () => done(false))
    socket.once("timeout", () => done(false))
    socket.connect(port, host, () => done(true))
  })

const waitForPort = async (port, host = "127.0.0.1", timeoutMs = 45000) => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortOpen(port, host)) return true
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}

const getMysqlExe = () => {
  if (process.env.MYSQLD_PATH && fs.existsSync(process.env.MYSQLD_PATH)) {
    return process.env.MYSQLD_PATH
  }
  return mysqlCandidates.find((candidate) => fs.existsSync(candidate)) || null
}

const readDbConfig = () => {
  const envPath = path.join(repoRoot, ".env")
  if (!fs.existsSync(envPath)) {
    return { dbName: "css_invest", dbPassword: "" }
  }
  const contents = fs.readFileSync(envPath, "utf8")
  return {
    dbName: readEnvValue(contents, "DB_NAME", "css_invest"),
    dbPassword: readEnvValue(contents, "DB_PASSWORD", ""),
  }
}

const ensureLocalMysqlConfig = (mysqlExe) => {
  const baseDir = path.dirname(path.dirname(mysqlExe))
  const localDir = path.join(repoRoot, ".mysql-local")
  const dataDir = path.join(localDir, "data")
  const iniPath = path.join(localDir, "my-local.ini")
  const bootstrapPath = path.join(localDir, "bootstrap.sql")

  fs.mkdirSync(localDir, { recursive: true })
  fs.mkdirSync(dataDir, { recursive: true })

  const normalizedBase = baseDir.replace(/\\/g, "/")
  const normalizedData = dataDir.replace(/\\/g, "/")
  const ini = [
    "[mysqld]",
    `basedir="${normalizedBase}"`,
    `datadir="${normalizedData}"`,
    "port=3306",
    "bind-address=127.0.0.1",
    "skip-name-resolve",
    "default_authentication_plugin=mysql_native_password",
    "character-set-server=utf8mb4",
    "collation-server=utf8mb4_unicode_ci",
    "",
    "[client]",
    "host=127.0.0.1",
    "port=3306",
    "",
  ].join("\n")
  fs.writeFileSync(iniPath, ini, "utf8")

  return { localDir, dataDir, iniPath, bootstrapPath }
}

const initializeMysqlIfNeeded = (mysqlExe, iniPath, dataDir) => {
  const mysqlSystemDir = path.join(dataDir, "mysql")
  if (fs.existsSync(mysqlSystemDir)) return

  const result = spawnSync(
    mysqlExe,
    [`--defaults-file=${iniPath}`, "--initialize-insecure", `--datadir=${dataDir}`],
    { stdio: "inherit", windowsHide: true },
  )

  if (result.status !== 0) {
    throw new Error(`MySQL initialization failed (exit code ${result.status ?? "unknown"})`)
  }
}

const removeStalePidFiles = (dataDir) => {
  if (!fs.existsSync(dataDir)) return
  const entries = fs.readdirSync(dataDir)
  entries
    .filter((name) => name.toLowerCase().endsWith(".pid"))
    .forEach((name) => fs.rmSync(path.join(dataDir, name), { force: true }))
}

const writeBootstrapSql = (bootstrapPath, dbName, dbPassword) => {
  const safeDbName = dbName
  const safePassword = escapeSqlLiteral(dbPassword)
  const sql = [
    `CREATE USER IF NOT EXISTS 'root'@'127.0.0.1' IDENTIFIED BY '${safePassword}';`,
    `CREATE USER IF NOT EXISTS 'root'@'localhost' IDENTIFIED BY '${safePassword}';`,
    `ALTER USER 'root'@'localhost' IDENTIFIED BY '${safePassword}';`,
    "GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;",
    "GRANT ALL PRIVILEGES ON *.* TO 'root'@'localhost' WITH GRANT OPTION;",
    `CREATE DATABASE IF NOT EXISTS \`${safeDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    "FLUSH PRIVILEGES;",
    "",
  ].join("\n")

  fs.writeFileSync(bootstrapPath, sql, "utf8")
}

const startDetachedMysql = (mysqlExe, iniPath, bootstrapPath) => {
  const child = spawn(mysqlExe, [`--defaults-file=${iniPath}`, `--init-file=${bootstrapPath}`], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  })
  child.unref()
}

async function main() {
  if (await isPortOpen(3306, "127.0.0.1")) {
    console.log("[local-mysql] Port 3306 already reachable.")
    return
  }

  const mysqlExe = getMysqlExe()
  if (!mysqlExe) {
    throw new Error("No mysqld executable found. Install MySQL or set MYSQLD_PATH.")
  }

  const { dbName, dbPassword } = readDbConfig()
  const { dataDir, iniPath, bootstrapPath } = ensureLocalMysqlConfig(mysqlExe)
  removeStalePidFiles(dataDir)
  initializeMysqlIfNeeded(mysqlExe, iniPath, dataDir)
  writeBootstrapSql(bootstrapPath, dbName, dbPassword)
  startDetachedMysql(mysqlExe, iniPath, bootstrapPath)

  const ready = await waitForPort(3306, "127.0.0.1", 60000)
  if (!ready) {
    throw new Error("mysqld did not expose port 3306 in time.")
  }

  console.log("[local-mysql] Local mysqld is ready on 127.0.0.1:3306.")
}

main().catch((error) => {
  console.error(`[local-mysql] ${error.message}`)
  process.exit(1)
})
