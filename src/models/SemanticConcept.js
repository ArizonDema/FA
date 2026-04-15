const { Model } = require("sequelize")
const {
  AGGREGATION_BEHAVIORS,
  EXPECTED_BALANCE_TYPES,
  EXPECTED_SIGNS,
  SEMANTIC_CONCEPT_CATEGORIES,
  STATEMENT_TYPES,
} = require("../modules/semantic/semanticConcept.catalog")

const CATEGORY_KEYS = SEMANTIC_CONCEPT_CATEGORIES.map((item) => item.key)

module.exports = (sequelize, DataTypes) => {
  class SemanticConcept extends Model {
    static associate(models) {
      SemanticConcept.hasMany(models.AccountSemanticMapping, {
        foreignKey: "semantic_concept_id",
        as: "accountMappings",
      })

      SemanticConcept.hasMany(models.TemplateRowSemanticMapping, {
        foreignKey: "semantic_concept_id",
        as: "templateRowMappings",
      })

      SemanticConcept.hasMany(models.TemplateRowMappingSuggestion, {
        foreignKey: "semantic_concept_id",
        as: "templateRowMappingSuggestions",
      })

      SemanticConcept.hasMany(models.AccountMappingSuggestion, {
        foreignKey: "semantic_concept_id",
        as: "accountMappingSuggestions",
      })
    }
  }

  SemanticConcept.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      stable_key: {
        type: DataTypes.STRING(120),
        allowNull: false,
        unique: true,
      },
      label: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      category: {
        type: DataTypes.STRING(120),
        allowNull: false,
        validate: {
          isIn: [CATEGORY_KEYS],
        },
      },
      subcategory: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      expected_sign: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: {
          isIn: [EXPECTED_SIGNS],
        },
      },
      expected_balance_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        validate: {
          isIn: [EXPECTED_BALANCE_TYPES],
        },
      },
      aggregation_behavior: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "sum",
        validate: {
          isIn: [AGGREGATION_BEHAVIORS],
        },
      },
      statement_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "generic",
        validate: {
          isIn: [STATEMENT_TYPES],
        },
      },
      dimensions_allowed_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      synonyms_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      examples_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      metadata_json: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: "SemanticConcept",
      tableName: "semantic_concepts",
      underscored: true,
      timestamps: true,
    },
  )

  return SemanticConcept
}
