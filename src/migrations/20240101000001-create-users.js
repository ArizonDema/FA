module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("users", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      full_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      password: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      phone_number: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      country: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      state: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      residential_address: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      next_of_kin_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      next_of_kin_contact: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      source_of_funds: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      kyc_status: {
        type: Sequelize.ENUM("pending", "verified", "rejected"),
        defaultValue: "pending",
      },
      role: {
        type: Sequelize.ENUM("investor", "admin"),
        defaultValue: "investor",
      },
      status: {
        type: Sequelize.ENUM("active", "suspended", "closed"),
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

    // Add indexes
    await queryInterface.addIndex("users", ["email"])
    await queryInterface.addIndex("users", ["kyc_status"])
    await queryInterface.addIndex("users", ["role"])
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("users")
  },
}
