const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class AuditLog extends Model {
    static associate(models) {
      AuditLog.belongsTo(models.User, {
        foreignKey: "actor_id",
        as: "actor",
      })
    }
  }

  AuditLog.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      actor_id: DataTypes.UUID,
      entity_type: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      entity_id: DataTypes.STRING(120),
      action: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      before_json: DataTypes.JSON,
      after_json: DataTypes.JSON,
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "AuditLog",
      tableName: "audit_logs",
      underscored: true,
      timestamps: false,
      createdAt: "created_at",
      updatedAt: false,
    },
  )

  return AuditLog
}
