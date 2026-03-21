import { spawn } from "node:child_process"
import fs from "node:fs"
import net from "node:net"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..", "..")

let backend = null
let frontend = null
let mysql = null
let shuttingDown = false

const spawnCmd = (command, cwd) =>
  spawn(command, {
    cwd,
    stdio: "inherit",
    shell: true,
  })

const isPortOpen = (port, host = "127.0.0.1", timeoutMs = 1200) =>
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

const mysqlCandidates = [
  {
    exe: "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqld.exe",
  },
  {
    exe: "C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqld.exe",
  },
]

const findMysqlExe = () => {
  const envExe = process.env.MYSQLD_PATH
  if (envExe && fs.existsSync(envExe)) {
    return envExe
  }
  const candidate = mysqlCandidates.find((item) => fs.existsSync(item.exe))
  return candidate?.exe || null
}

const readEnvValue = (contents, key) => {
  const match = contents.match(new RegExp(`^${key}=(.*)$`, "m"))
  if (!match) return ""
  return match[1].replace(/^"|"$/g, "")
}

const escapeSql = (value) => String(value).replace(/'/g, "''")

const readDbConfig = () => {
  const envPath = path.resolve(repoRoot, ".env")
  let dbName = "css_invest"
  let dbPassword = ""
  let autoMigrate = ""
  let autoSeed = ""
  if (fs.existsSync(envPath)) {
    const envContents = fs.readFileSync(envPath, "utf8")
    dbName = readEnvValue(envContents, "DB_NAME") || dbName
    dbPassword = readEnvValue(envContents, "DB_PASSWORD") || dbPassword
    autoMigrate = readEnvValue(envContents, "AUTO_MIGRATE")
    autoSeed = readEnvValue(envContents, "AUTO_SEED")
  }
  return { dbName, dbPassword, autoMigrate, autoSeed }
}

const ensureLocalMysqlConfig = (exePath) => {
  const baseDir = path.dirname(path.dirname(exePath))
  const localDir = path.resolve(repoRoot, ".mysql-local")
  const dataDir = path.join(localDir, "data")
  const iniPath = path.join(localDir, "my-local.ini")

  fs.mkdirSync(localDir, { recursive: true })
  fs.mkdirSync(dataDir, { recursive: true })

  if (!fs.existsSync(iniPath)) {
    const normalizedBase = baseDir.replace(/\\/g, "/")
    const normalizedData = dataDir.replace(/\\/g, "/")
    const iniContents = [
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
      "port=3306",
      "host=127.0.0.1",
      "",
    ].join("\n")
    fs.writeFileSync(iniPath, iniContents, "utf8")
  }

  return { baseDir, dataDir, iniPath, localDir }
}

const initializeLocalMysql = (exePath, iniPath, dataDir) => {
  const mysqlSystemDir = path.join(dataDir, "mysql")
  if (fs.existsSync(mysqlSystemDir)) {
    return
  }
  if (fs.existsSync(dataDir)) {
    const entries = fs.readdirSync(dataDir)
    if (entries.length > 0) {
      console.warn("Cleaning existing local MySQL data directory before initialization.")
      entries.forEach((entry) => {
        fs.rmSync(path.join(dataDir, entry), { recursive: true, force: true })
      })
    }
  }
  const result = spawnSync(
    exePath,
    [`--defaults-file=${iniPath}`, `--initialize-insecure`, `--datadir=${dataDir}`],
    {
      stdio: "inherit",
      windowsHide: true,
    },
  )
  if (result.status !== 0) {
    console.error("MySQL initialization failed. Start MySQL80 service or run setup manually.")
  }
}

const ensureMysqlInitFile = (localDir, dbName, dbPassword) => {
  const initFilePath = path.join(localDir, "bootstrap.sql")
  const normalizedInit = initFilePath.replace(/\\/g, "/")
  const passwordValue = dbPassword ? escapeSql(dbPassword) : ""
  const passwordClause = `IDENTIFIED BY '${passwordValue}'`
  const initSql = [
    `CREATE USER IF NOT EXISTS 'root'@'127.0.0.1' ${passwordClause};`,
    `CREATE USER IF NOT EXISTS 'root'@'localhost' ${passwordClause};`,
    `ALTER USER 'root'@'localhost' ${passwordClause};`,
    `GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;`,
    `GRANT ALL PRIVILEGES ON *.* TO 'root'@'localhost' WITH GRANT OPTION;`,
    `CREATE DATABASE IF NOT EXISTS \`${escapeSql(
      dbName,
    )}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    "FLUSH PRIVILEGES;",
    "",
  ].join("\n")
  fs.writeFileSync(initFilePath, initSql, "utf8")
  return normalizedInit
}

const ensureDatabase = (baseDir, dbName, dbPassword) => {
  const resolvedConfig = dbName ? { dbName, dbPassword } : readDbConfig()
  const finalName = resolvedConfig.dbName || "css_invest"
  const finalPassword = resolvedConfig.dbPassword || ""

  const mysqlExe = path.join(baseDir, "bin", "mysql.exe")
  if (!fs.existsSync(mysqlExe)) {
    return
  }

  const baseArgs = ["--protocol=tcp", "--host=127.0.0.1", "--port=3306", "-u", "root"]
  const runQuery = (args, query) =>
    spawnSync(mysqlExe, [...baseArgs, ...args, "-e", query], { stdio: "ignore" }).status === 0

  const passwordQuery = finalPassword
    ? `ALTER USER 'root'@'localhost' IDENTIFIED BY '${escapeSql(finalPassword)}';`
    : ""
  const createDbQuery = `CREATE DATABASE IF NOT EXISTS \`${escapeSql(
    finalName,
  )}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`

  if (finalPassword && runQuery([`-p${finalPassword}`], "SELECT 1;")) {
    runQuery([`-p${finalPassword}`], createDbQuery)
    return
  }

  if (runQuery([], "SELECT 1;")) {
    if (passwordQuery) {
      runQuery([], `${passwordQuery}${createDbQuery}`)
    } else {
      runQuery([], createDbQuery)
    }
  }
}

const isEnvEnabled = (value, fallback = true) => {
  if (!value) return fallback
  return !["0", "false", "no", "off"].includes(value.toLowerCase())
}

const runCommand = (command, cwd) =>
  spawnSync(command, {
    cwd,
    stdio: "inherit",
    shell: true,
  })

const runMigrations = () => runCommand("npm run migrate", repoRoot)

const runSeeds = () => runCommand("npm run seed", repoRoot)

const startMysqlIfNeeded = async () => {
  const ready = await isPortOpen(3306, "127.0.0.1")
  const exePath = findMysqlExe()
  const { dbName, dbPassword, autoMigrate, autoSeed } = readDbConfig()

  if (!ready) {
    if (!exePath) {
      console.error("MySQL is not running and no mysqld executable was found.")
      console.error("Start MySQL80 service or set MYSQLD_PATH and MYSQLD_INI.")
      return
    }
    const { baseDir, dataDir, iniPath, localDir } = ensureLocalMysqlConfig(exePath)
    initializeLocalMysql(exePath, iniPath, dataDir)
    const initFilePath = ensureMysqlInitFile(localDir, dbName, dbPassword)
    mysql = spawn(exePath, [`--defaults-file=${iniPath}`, `--init-file=${initFilePath}`], {
      stdio: "inherit",
      windowsHide: true,
    })
    mysql.on("close", (code, signal) => {
      if (shuttingDown) return
      const reason = signal ? `signal ${signal}` : `code ${code}`
      console.error(`MySQL stopped (${reason}).`)
    })
    await new Promise((resolve) => setTimeout(resolve, 2000))
    ensureDatabase(baseDir, dbName, dbPassword)
  } else if (exePath) {
    const baseDir = path.dirname(path.dirname(exePath))
    ensureDatabase(baseDir, dbName, dbPassword)
  }

  if (isEnvEnabled(autoMigrate, true)) {
    runMigrations()
  }
  if (isEnvEnabled(autoSeed, true)) {
    runSeeds()
  }
}

const startBackend = () => {
  if (shuttingDown) return
  backend = spawnCmd("npm run dev", repoRoot)
  backend.on("close", (code, signal) => {
    if (shuttingDown) return
    const reason = signal ? `signal ${signal}` : `code ${code}`
    console.error(`Backend stopped (${reason}). Retrying in 3s. Ensure MySQL is running.`)
    setTimeout(startBackend, 3000)
  })
}

const startFrontend = () => {
  if (shuttingDown) return
  frontend = spawnCmd("npm run dev:solo", path.resolve(repoRoot, "frontend"))
  frontend.on("close", (code, signal) => {
    if (shuttingDown) return
    const reason = signal ? `signal ${signal}` : `code ${code}`
    console.error(`Frontend stopped (${reason}).`)
  })
}

const shutdown = () => {
  shuttingDown = true
  if (backend) backend.kill("SIGINT")
  if (frontend) frontend.kill("SIGINT")
  if (mysql) mysql.kill("SIGINT")
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

await startMysqlIfNeeded()
const backendRunning = await isPortOpen(8000, "127.0.0.1")
if (backendRunning) {
  console.log("Backend already running on port 8000.")
} else {
  startBackend()
}
startFrontend()
