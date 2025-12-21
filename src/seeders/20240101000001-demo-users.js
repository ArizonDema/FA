const bcrypt = require("bcryptjs")

module.exports = {
  async up(queryInterface, Sequelize) {
    const hashedPassword = await bcrypt.hash("Password123!", 10)

    await queryInterface.bulkInsert(
      "users",
      [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          full_name: "Admin User",
          email: "admin@cssinvest.com",
          password: hashedPassword,
          phone_number: "+1234567890",
          country: "United States",
          kyc_status: "verified",
          role: "admin",
          status: "active",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440002",
          full_name: "John Investor",
          email: "john@example.com",
          password: hashedPassword,
          phone_number: "+1234567891",
          country: "United States",
          state: "California",
          residential_address: "123 Main St, Los Angeles, CA",
          source_of_funds: "Salary",
          kyc_status: "verified",
          role: "investor",
          status: "active",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440003",
          full_name: "Jane Smith",
          email: "jane@example.com",
          password: hashedPassword,
          phone_number: "+1234567892",
          country: "United States",
          state: "New York",
          residential_address: "456 Park Ave, New York, NY",
          source_of_funds: "Business",
          kyc_status: "verified",
          role: "investor",
          status: "active",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440004",
          full_name: "Bob Pending",
          email: "bob@example.com",
          password: hashedPassword,
          phone_number: "+1234567893",
          country: "United States",
          kyc_status: "pending",
          role: "investor",
          status: "active",
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      {},
    )
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("users", null, {})
  },
}
