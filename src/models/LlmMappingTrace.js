const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  class LlmMappingTrace extends Model {
    static associate(models) {
      LlmMappingTrace.belongsTo(models.Portfolio, {
        foreignKey: "portfolio_id",
        as: "portfolio",
      })

      LlmMappingTrace.belongsTo(models.TemplateVersion, {
        foreignKey: "template_version_id",
        as: "templateVersion",
      })

      LlmMappingTrace.belongsTo(models.TemplateRow, {
        foreignKey: "template_row_id",
        as: "templateRow",
      })

      LlmMappingTrace.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "createdBy",
      })

      LlmMappingTrace.hasMany(models.TemplateRowMappingSuggestion, {
        foreignKey: "trace_id",
        as: "suggestions",
      })
    }
  }

  LlmMappingTrace.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      portfolio_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      template_version_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      template_row_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      provider: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "ollama",
      },
      model: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      prompt_version: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      prompt_hash: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      timeout_ms: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      prompt_chars: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      request_bytes: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      duration_ms: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("pending", "success", "failed", "fallback"),
        allowNull: false,
        defaultValue: "pending",
      },
      parse_status: {
        type: DataTypes.ENUM("pending", "parsed", "rejected"),
        allowNull: false,
        defaultValue: "pending",
      },
      needs_human_review: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      disagreement_flag: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      failure_code: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      failure_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      request_payload_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      response_payload_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      parsed_response_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      metadata_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "LlmMappingTrace",
      tableName: "llm_mapping_traces",
      underscored: true,
      timestamps: true,
    },
  )

  return LlmMappingTrace
}
