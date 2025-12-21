const { Model } = require("sequelize")
const bcrypt = require("bcryptjs")

module.exports = (sequelize, DataTypes) => {
  /**
   * User Model
   * Represents investors and admin users in the system
   * Stores KYC information and authentication credentials
   */
  class User extends Model {
    static associate(models) {
      // User can have multiple investment contracts
      User.hasMany(models.InvestmentContract, {
        foreignKey: "user_id",
        as: "investments",
      })

      // User can have multiple withdrawal requests
      User.hasMany(models.WithdrawalRequest, {
        foreignKey: "user_id",
        as: "withdrawalRequests",
      })
    }

    /**
     * Check if password is valid
     * @param {string} password - Plain text password
     * @returns {Promise<boolean>}
     */
    async validatePassword(password) {
      return await bcrypt.compare(password, this.password)
    }

    /**
     * Get user without sensitive data
     * @returns {Object} - User object without password
     */
    toSafeObject() {
      const { password, ...safeUser } = this.get({ plain: true })
      return safeUser
    }
  }

  User.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      full_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
          notEmpty: true,
          len: [2, 255],
        },
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
        },
      },
      password: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      phone_number: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      country: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      state: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      residential_address: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      next_of_kin_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      next_of_kin_contact: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      source_of_funds: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      kyc_status: {
        type: DataTypes.ENUM("pending", "verified", "rejected"),
        defaultValue: "pending",
      },
      role: {
        type: DataTypes.ENUM("investor", "admin"),
        defaultValue: "investor",
      },
      status: {
        type: DataTypes.ENUM("active", "suspended", "closed"),
        defaultValue: "active",
      },
    },
    {
      sequelize,
      modelName: "User",
      tableName: "users",
      underscored: true,
      timestamps: true,
      hooks: {
        // Hash password before creating user
        beforeCreate: async (user) => {
          if (user.password) {
            const salt = await bcrypt.genSalt(10)
            user.password = await bcrypt.hash(user.password, salt)
          }
        },
        // Hash password before updating user
        beforeUpdate: async (user) => {
          if (user.changed("password")) {
            const salt = await bcrypt.genSalt(10)
            user.password = await bcrypt.hash(user.password, salt)
          }
        },
      },
    },
  )

  return User
}
