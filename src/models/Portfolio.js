// backend/src/models/Portfolio.js
const { Model } = require("sequelize")

module.exports = (sequelize, DataTypes) => {
  /**
   * Portfolio Model
   * Represents long-lived investment portfolios
   * Portfolios never reset - they have multiple rounds
   */
  class Portfolio extends Model {
    static associate(models) {
      // Portfolio has many rounds
      Portfolio.hasMany(models.PortfolioRound, {
        foreignKey: "portfolio_id",
        as: "rounds",
      })

      Portfolio.hasOne(models.FundProfile, {
        foreignKey: "portfolio_id",
        as: "fundProfile",
      })

      Portfolio.hasOne(models.FundGovernance, {
        foreignKey: "portfolio_id",
        as: "fundGovernance",
      })

      Portfolio.hasOne(models.FundAccountingPolicy, {
        foreignKey: "portfolio_id",
        as: "fundAccountingPolicy",
      })

      Portfolio.hasOne(models.FundTaxProfile, {
        foreignKey: "portfolio_id",
        as: "fundTaxProfile",
      })

      Portfolio.hasMany(models.FundBankAccount, {
        foreignKey: "portfolio_id",
        as: "fundBankAccounts",
      })

      Portfolio.hasMany(models.ShareClass, {
        foreignKey: "portfolio_id",
        as: "shareClasses",
      })

      Portfolio.hasMany(models.CapitalCall, {
        foreignKey: "portfolio_id",
        as: "capitalCalls",
      })

      Portfolio.hasMany(models.Distribution, {
        foreignKey: "portfolio_id",
        as: "distributions",
      })

      Portfolio.hasMany(models.JournalEntry, {
        foreignKey: "portfolio_id",
        as: "journalEntries",
      })

      Portfolio.hasMany(models.ReportRun, {
        foreignKey: "portfolio_id",
        as: "reportRuns",
      })

      Portfolio.hasMany(models.ReportLineage, {
        foreignKey: "portfolio_id",
        as: "reportLineage",
      })

      Portfolio.hasMany(models.AgentToolInvocation, {
        foreignKey: "portfolio_id",
        as: "agentToolInvocations",
      })

      Portfolio.hasMany(models.AgentWorkflowRun, {
        foreignKey: "portfolio_id",
        as: "agentWorkflowRuns",
      })

      Portfolio.hasMany(models.ExternalIntegration, {
        foreignKey: "portfolio_id",
        as: "externalIntegrations",
      })

      Portfolio.hasMany(models.ExternalSyncRun, {
        foreignKey: "portfolio_id",
        as: "externalSyncRuns",
      })

      Portfolio.hasMany(models.CashFlowTemplate, {
        foreignKey: "portfolio_id",
        as: "cashFlowTemplates",
      })

      Portfolio.hasMany(models.FundDocument, {
        foreignKey: "portfolio_id",
        as: "fundDocuments",
      })

      Portfolio.hasMany(models.FundRepositoryItem, {
        foreignKey: "portfolio_id",
        as: "fundRepositoryItems",
      })

      Portfolio.hasMany(models.FundRepositoryAnalysis, {
        foreignKey: "portfolio_id",
        as: "fundRepositoryAnalyses",
      })

      Portfolio.hasMany(models.FundRepositoryKeyPoint, {
        foreignKey: "portfolio_id",
        as: "fundRepositoryKeyPoints",
      })

      Portfolio.hasMany(models.ReportingProject, {
        foreignKey: "portfolio_id",
        as: "reportingProjects",
      })

      Portfolio.hasMany(models.ReportingProjectSource, {
        foreignKey: "portfolio_id",
        as: "reportingProjectSources",
      })

      Portfolio.hasMany(models.Account, {
        foreignKey: "portfolio_id",
        as: "accounts",
      })

      Portfolio.hasMany(models.AccountSemanticMapping, {
        foreignKey: "portfolio_id",
        as: "accountSemanticMappings",
      })

      Portfolio.hasMany(models.TemplateVersion, {
        foreignKey: "portfolio_id",
        as: "templateVersions",
      })

      Portfolio.hasMany(models.TemplateRowSemanticMapping, {
        foreignKey: "portfolio_id",
        as: "templateRowSemanticMappings",
      })

      Portfolio.hasMany(models.TemplateRowMappingSuggestion, {
        foreignKey: "portfolio_id",
        as: "templateRowMappingSuggestions",
      })

      Portfolio.hasMany(models.AccountMappingSuggestion, {
        foreignKey: "portfolio_id",
        as: "accountMappingSuggestions",
      })

      Portfolio.hasMany(models.LlmMappingTrace, {
        foreignKey: "portfolio_id",
        as: "llmMappingTraces",
      })

      Portfolio.hasMany(models.ReviewTask, {
        foreignKey: "portfolio_id",
        as: "reviewTasks",
      })

      // Portfolio has many stock positions
      Portfolio.hasMany(models.StockPosition, {
        foreignKey: "portfolio_id",
        as: "positions",
      })
    }
  }

  Portfolio.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      risk_level: {
        type: DataTypes.ENUM("low", "medium", "high"),
        allowNull: false,
        defaultValue: "medium",
      },
      base_currency: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: "USD",
      },
      status: {
        type: DataTypes.ENUM("active", "closed", "archived"),
        defaultValue: "active",
      },

      // Add these inside Portfolio.init()
strategy_type: {
  type: DataTypes.STRING(100),
  allowNull: false,
},
management_fee_percent: {
  type: DataTypes.DECIMAL(5, 2),
  allowNull: false,
},
performance_fee_percent: {
  type: DataTypes.DECIMAL(5, 2),
  allowNull: false,
},
lock_up_period_months: {
  type: DataTypes.INTEGER,
  allowNull: false,
},
early_withdrawal_penalty_percent: {
  type: DataTypes.DECIMAL(5, 2),
  allowNull: false,
},
minimum_investment: {
  type: DataTypes.DECIMAL(15, 2),
  allowNull: false,
},

    },
    {
      sequelize,
      modelName: "Portfolio",
      tableName: "portfolios",
      underscored: true,
      timestamps: true,
    },
  )

  return Portfolio
}
