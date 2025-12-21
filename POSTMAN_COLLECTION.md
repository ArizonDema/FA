# CSS Invest API - Postman Collection

Quick start guide for testing the API with Postman or cURL.

## Environment Variables

Create these variables in Postman:

- `BASE_URL`: http://localhost:3000/api/v1
- `TOKEN`: (will be set after login)

## 1. Authentication

### Register User

\`\`\`
POST {{BASE_URL}}/auth/register
Content-Type: application/json

{
  "full_name": "Test User",
  "email": "test@example.com",
  "password": "SecurePass123!",
  "phone_number": "+1234567890",
  "country": "United States"
}
\`\`\`

### Login

\`\`\`
POST {{BASE_URL}}/auth/login
Content-Type: application/json

{
  "email": "admin@cssinvest.com",
  "password": "Password123!"
}
\`\`\`

**Response**: Copy the `token` value and set it in your environment.

### Get Profile

\`\`\`
GET {{BASE_URL}}/auth/me
Authorization: Bearer {{TOKEN}}
\`\`\`

## 2. Investor Endpoints

### Get Available Portfolios

\`\`\`
GET {{BASE_URL}}/investor/portfolios
Authorization: Bearer {{TOKEN}}
\`\`\`

### Get Active Rounds

\`\`\`
GET {{BASE_URL}}/investor/rounds
Authorization: Bearer {{TOKEN}}
\`\`\`

### Create Investment

\`\`\`
POST {{BASE_URL}}/investor/invest
Authorization: Bearer {{TOKEN}}
Content-Type: application/json

{
  "portfolio_round_id": "770e8400-e29b-41d4-a716-446655440001",
  "amount": 5000
}
\`\`\`

### Get My Investments

\`\`\`
GET {{BASE_URL}}/investor/investments
Authorization: Bearer {{TOKEN}}
\`\`\`

### Get Investment Details

\`\`\`
GET {{BASE_URL}}/investor/investments/{investment_id}
Authorization: Bearer {{TOKEN}}
\`\`\`

### Get Statistics

\`\`\`
GET {{BASE_URL}}/investor/statistics
Authorization: Bearer {{TOKEN}}
\`\`\`

### Request Withdrawal

\`\`\`
POST {{BASE_URL}}/investor/withdraw
Authorization: Bearer {{TOKEN}}
Content-Type: application/json

{
  "investment_contract_id": "990e8400-e29b-41d4-a716-446655440001",
  "units_to_redeem": 1000
}
\`\`\`

### Get My Withdrawals

\`\`\`
GET {{BASE_URL}}/investor/withdrawals
Authorization: Bearer {{TOKEN}}
\`\`\`

## 3. Admin Endpoints

**Note**: Use admin token for these endpoints.

### Create Portfolio

\`\`\`
POST {{BASE_URL}}/admin/portfolios
Authorization: Bearer {{ADMIN_TOKEN}}
Content-Type: application/json

{
  "name": "Tech Growth Portfolio",
  "description": "High-growth technology stocks",
  "risk_level": "high",
  "base_currency": "USD"
}
\`\`\`

### Create Portfolio Round

\`\`\`
POST {{BASE_URL}}/admin/rounds
Authorization: Bearer {{ADMIN_TOKEN}}
Content-Type: application/json

{
  "portfolio_id": "660e8400-e29b-41d4-a716-446655440001",
  "start_date": "2024-01-01"
}
\`\`\`

### Calculate NAV

\`\`\`
POST {{BASE_URL}}/admin/nav/calculate/{round_id}
Authorization: Bearer {{ADMIN_TOKEN}}
\`\`\`

### Get All Withdrawal Requests

\`\`\`
GET {{BASE_URL}}/admin/withdrawals?status=pending
Authorization: Bearer {{ADMIN_TOKEN}}
\`\`\`

### Approve Withdrawal

\`\`\`
PUT {{BASE_URL}}/admin/withdrawals/{withdrawal_id}/approve
Authorization: Bearer {{ADMIN_TOKEN}}
Content-Type: application/json

{
  "admin_notes": "Approved and processed"
}
\`\`\`

### Reject Withdrawal

\`\`\`
PUT {{BASE_URL}}/admin/withdrawals/{withdrawal_id}/reject
Authorization: Bearer {{ADMIN_TOKEN}}
Content-Type: application/json

{
  "reason": "Insufficient documentation"
}
\`\`\`

### Get AUM

\`\`\`
GET {{BASE_URL}}/admin/aum
Authorization: Bearer {{ADMIN_TOKEN}}
\`\`\`

### Update User KYC Status

\`\`\`
PUT {{BASE_URL}}/admin/users/{user_id}/kyc
Authorization: Bearer {{ADMIN_TOKEN}}
Content-Type: application/json

{
  "kyc_status": "verified"
}
\`\`\`

### Get All Users

\`\`\`
GET {{BASE_URL}}/admin/users?kyc_status=pending
Authorization: Bearer {{ADMIN_TOKEN}}
\`\`\`

## 4. System Endpoints

### Health Check

\`\`\`
GET {{BASE_URL}}/system/health
\`\`\`

### System Statistics

\`\`\`
GET {{BASE_URL}}/system/stats
\`\`\`

## Testing Flow

1. **Login as Admin**
   - POST /auth/login with admin credentials
   - Save admin token

2. **Create Portfolio** (Admin)
   - POST /admin/portfolios

3. **Create Round** (Admin)
   - POST /admin/rounds

4. **Login as Investor**
   - POST /auth/login with investor credentials
   - Save investor token

5. **View Portfolios** (Investor)
   - GET /investor/portfolios

6. **Make Investment** (Investor)
   - POST /investor/invest

7. **Check Investment** (Investor)
   - GET /investor/investments

8. **Calculate NAV** (Admin)
   - POST /admin/nav/calculate/:roundId

9. **Request Withdrawal** (Investor)
   - POST /investor/withdraw

10. **Approve Withdrawal** (Admin)
    - PUT /admin/withdrawals/:id/approve
