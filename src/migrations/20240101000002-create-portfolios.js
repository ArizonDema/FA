// backend/src/migrations/20240101000002-create-portfolios.js

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("portfolios", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      risk_level: {
        type: Sequelize.ENUM("low", "medium", "high"),
        allowNull: false,
        defaultValue: "medium",
      },
      base_currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: "USD",
      },
      status: {
        type: Sequelize.ENUM("active", "closed", "archived"),
        defaultValue: "active",
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    })

    await queryInterface.addIndex("portfolios", ["status"])
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("portfolios")
  },
}
