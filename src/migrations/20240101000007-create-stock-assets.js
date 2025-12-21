module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("stock_assets", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      ticker: {
        type: Sequelize.STRING(10),
        allowNull: false,
        unique: true,
      },
      exchange: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      company_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      sector: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      currency: {
        type: Sequelize.STRING(3),
        defaultValue: "USD",
      },
      status: {
        type: Sequelize.ENUM("active", "delisted", "suspended"),
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

    await queryInterface.addIndex("stock_assets", ["ticker"])
    await queryInterface.addIndex("stock_assets", ["status"])
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("stock_assets")
  },
}
