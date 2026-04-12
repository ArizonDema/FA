// backend/src/models/index.js

const fs = require("fs")
const path = require("path")
const Sequelize = require("sequelize")
const basename = path.basename(__filename)
const env = process.env.NODE_ENV || "development"
const config = require(__dirname + "/../config/database.js")[env]
const db = {}

let sequelize
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config)
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, config)
}

// Load models without side effects. Bootstrap and health services own DB probing.
fs.readdirSync(__dirname)
  .filter((file) => {
    return file.indexOf(".") !== 0 && file !== basename && file.slice(-3) === ".js"
  })
  .forEach((file) => {
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes)
    db[model.name] = model
  })

// Set up associations
Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db)
  }
})

if (db.Portfolio && !db.Fund) {
  db.Fund = db.Portfolio
}

if (db.CashFlowTemplate && !db.Template) {
  db.Template = db.CashFlowTemplate
}

if (db.ReportTemplate && !db.ReportDefinition) {
  db.ReportDefinition = db.ReportTemplate
}

if (db.AuditLog && !db.AuditEvent) {
  db.AuditEvent = db.AuditLog
}

db.sequelize = sequelize
db.Sequelize = Sequelize

module.exports = db
