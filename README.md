# CSS Invest Backend

A production-ready NAV-based managed investment platform built with Node.js, Express, and MySQL.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Core Financial Logic](#core-financial-logic)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Database Setup](#database-setup)
- [Environment Configuration](#environment-configuration)
- [Running the Application](#running-the-application)
- [API Documentation](#api-documentation)
- [Background Jobs](#background-jobs)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Key Features](#key-features)

## Overview

CSS Invest is a comprehensive managed investment platform that implements:

- **NAV-based unit accounting** - Professional fund management approach
- **Multi-round investments** - Users can invest in multiple yearly cycles
- **Append-only audit trail** - Complete financial history with no deletions
- **Automated fee calculations** - Management and performance fees
- **Lock-up periods** - Configurable investment lock-up with penalties
- **Real-time NAV tracking** - Daily NAV calculation and recording

## Architecture

### Design Principles

1. **Nothing is overwritten** - All data is append-only
2. **Everything is event-based** - Complete audit trail
3. **Each investment is a contract** - Separate legal entities
4. **Rounds are explicit** - Clear historical separation
5. **NAV is time-series** - Reconstruct any point in history
6. **Units are immutable once issued** - Only issue or burn

### Data Flow

\`\`\`
Investment Flow:
User → Investment Request → NAV Calculation → Unit Issuance → Unit Ledger
                                           ↓
                                    Cash Ledger Update
                                           ↓
                                    Round Statistics Update

Withdrawal Flow:
User → Withdrawal Request → Fee Calculation → Admin Approval → Unit Burn
                                           ↓
                                    Cash Outflow
                                           ↓
                                    Fee Records Creation
\`\`\`

## Core Financial Logic

### 1. NAV Calculation

\`\`\`
NAV = (Cash Balance + Market Value - Accrued Fees) / Total Units
\`\`\`

Components:
- **Cash Balance**: Sum of all cash ledger entries
- **Market Value**: Current value of all stock positions
- **Accrued Fees**: Management fees not yet charged
- **Total Units**: Total units issued minus units burned

### 2. Unit Issuance

\`\`\`
Units Issued = Investment Amount / Current NAV
\`\`\`

Example:
- Investment: $5,000
- Current NAV: $1.25
- Units Issued: 4,000 units

### 3. Management Fees

\`\`\`
Daily Fee = (Contract Value × Annual Fee %) / 365
\`\`\`

Example:
- Contract Value: $10,000
- Annual Fee: 2%
- Daily Fee: $0.55

### 4. Performance Fees

Charged only on profit at withdrawal:

\`\`\`
Performance Fee = Profit × Performance Fee %
\`\`\`

Example:
- Invested: $5,000
- Current Value: $6,500
- Profit: $1,500
- Performance Fee (20%): $300

### 5. Early Withdrawal Penalty

\`\`\`
Penalty = Gross Amount × Penalty %
\`\`\`

Applied if withdrawal occurs before lockup end date.

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MySQL 8.0+
- **ORM**: Sequelize
- **Authentication**: JWT
- **Validation**: Joi
- **Documentation**: Swagger/OpenAPI 3.0
- **Logging**: Winston
- **Background Jobs**: node-cron
- **Security**: Helmet, bcryptjs

## Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- MySQL >= 8.0
- Git

## Installation

1. Clone the repository:

\`\`\`bash
git clone <repository-url>
cd backend
\`\`\`

2. Install dependencies:

\`\`\`bash
npm install
\`\`\`

## Database Setup

1. Create MySQL database:

\`\`\`sql
CREATE DATABASE css_invest CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
\`\`\`

2. Run migrations:

\`\`\`bash
npm run migrate
\`\`\`

3. Seed demo data (optional):

\`\`\`bash
npm run seed
\`\`\`

To undo all seeds:

\`\`\`bash
npm run seed:undo
\`\`\`

To undo last migration:

\`\`\`bash
npm run migrate:undo
\`\`\`

## Environment Configuration

1. Copy the example environment file:

\`\`\`bash
cp .env.example .env
\`\`\`

2. Configure your environment variables:

\`\`\`env
# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=css_invest
DB_USER=root
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production

# Fees
MANAGEMENT_FEE_ANNUAL=2.0
PERFORMANCE_FEE=20.0
EARLY_WITHDRAWAL_PENALTY=5.0

# Lock-up
DEFAULT_LOCKUP_MONTHS=12
\`\`\`

## Running the Application

### Development Mode

\`\`\`bash
npm run dev
\`\`\`

The server will start with hot-reload enabled.

### Production Mode

\`\`\`bash
npm start
\`\`\`

### Quick Setup

Run everything at once:

\`\`\`bash
npm run db:setup  # Run migrations and seeds
npm start         # Start server
\`\`\`

## API Documentation

Once the server is running, access the interactive Swagger documentation at:

\`\`\`
http://localhost:3000/api/docs
\`\`\`

### Key Endpoints

#### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `GET /api/v1/auth/me` - Get profile

#### Investor
- `GET /api/v1/investor/portfolios` - View portfolios
- `POST /api/v1/investor/invest` - Create investment
- `GET /api/v1/investor/investments` - View investments
- `POST /api/v1/investor/withdraw` - Request withdrawal
- `GET /api/v1/investor/statistics` - View statistics

#### Admin
- `POST /api/v1/admin/portfolios` - Create portfolio
- `POST /api/v1/admin/rounds` - Create round
- `POST /api/v1/admin/nav/calculate/:roundId` - Calculate NAV
- `PUT /api/v1/admin/withdrawals/:id/approve` - Approve withdrawal
- `GET /api/v1/admin/aum` - View AUM

### Sample API Requests

#### Register User

\`\`\`bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "John Doe",
    "email": "john@example.com",
    "password": "SecurePass123!",
    "phone_number": "+1234567890",
    "country": "United States"
  }'
\`\`\`

#### Login

\`\`\`bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123!"
  }'
\`\`\`

#### Create Investment

\`\`\`bash
curl -X POST http://localhost:3000/api/v1/investor/invest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "portfolio_round_id": "770e8400-e29b-41d4-a716-446655440001",
    "amount": 5000
  }'
\`\`\`

## Background Jobs

The system runs two automated background jobs:

### 1. NAV Calculation Job

**Schedule**: Daily at midnight (configurable)

**Purpose**: Calculate and record NAV for all open portfolio rounds

**Configuration**: `NAV_CALCULATION_SCHEDULE` in .env

Example: `0 0 * * *` (midnight daily)

### 2. Fee Accrual Job

**Schedule**: Daily at 1 AM (configurable)

**Purpose**: Calculate and record daily management fees

**Configuration**: `FEE_ACCRUAL_SCHEDULE` in .env

Example: `0 1 * * *` (1 AM daily)

### Job Logs

All background jobs include detailed logging with `[v0]` prefix for easy tracking:

\`\`\`
[v0] NAV Calculation Job - Starting execution
[v0] Found 2 open rounds to process
[v0] Processing round: 770e8400-e29b-41d4-a716-446655440001
[v0] NAV calculated for round: 1.234567
[v0] NAV Calculation Job - Execution completed
\`\`\`

## Testing

Run tests:

\`\`\`bash
npm test
\`\`\`

Run tests with coverage:

\`\`\`bash
npm test -- --coverage
\`\`\`

## Project Structure

\`\`\`
backend/
├── src/
│   ├── config/           # Configuration files
│   │   ├── app.js        # App configuration
│   │   ├── database.js   # Database configuration
│   │   ├── logger.js     # Winston logger setup
│   │   └── swagger.js    # Swagger configuration
│   ├── controllers/      # Request handlers
│   │   ├── auth.controller.js
│   │   ├── investor.controller.js
│   │   └── admin.controller.js
│   ├── jobs/             # Background jobs
│   │   ├── index.js
│   │   ├── navCalculation.job.js
│   │   └── feeAccrual.job.js
│   ├── middlewares/      # Express middlewares
│   │   ├── auth.js       # Authentication & authorization
│   │   ├── errorHandler.js
│   │   └── validation.js
│   ├── migrations/       # Sequelize migrations
│   ├── models/           # Sequelize models
│   │   ├── index.js
│   │   ├── User.js
│   │   ├── Portfolio.js
│   │   ├── PortfolioRound.js
│   │   ├── InvestmentContract.js
│   │   └── ... (12 models total)
│   ├── routes/           # API routes
│   │   ├── auth.routes.js
│   │   ├── investor.routes.js
│   │   ├── admin.routes.js
│   │   └── system.routes.js
│   ├── seeders/          # Database seeders
│   ├── services/         # Business logic
│   │   ├── nav.service.js
│   │   ├── investment.service.js
│   │   ├── withdrawal.service.js
│   │   └── portfolio.service.js
│   ├── utils/            # Utility functions
│   │   ├── responseHandler.js
│   │   └── AppError.js
│   ├── app.js            # Express app setup
│   └── server.js         # Server entry point
├── logs/                 # Application logs
├── .env.example          # Environment variables template
├── .sequelizerc          # Sequelize CLI config
├── package.json
└── README.md
\`\`\`

## Key Features

### 1. Comprehensive Audit Trail

Every financial transaction is recorded in append-only ledgers:
- **Unit Ledger**: All unit issuances and burns
- **Cash Ledger**: All money movements
- **Fee Records**: All fee charges
- **NAV History**: Complete NAV time-series

### 2. Role-Based Access Control

- **Investors**: Can view portfolios, invest, request withdrawals
- **Admins**: Can manage portfolios, rounds, approve withdrawals, view AUM

### 3. KYC Verification

Users must complete KYC verification before investing:
- Status: pending, verified, rejected
- Admin-controlled verification process

### 4. Lock-up Periods

Investments have configurable lock-up periods:
- Default: 12 months
- Early withdrawal penalty: 5%
- No withdrawals during lock-up without penalty

### 5. Multiple Portfolio Support

- Create unlimited portfolios
- Different risk levels (low, medium, high)
- Independent rounds per portfolio

### 6. Performance Tracking

Real-time tracking of:
- Current investment value
- Profit/loss
- Return percentage
- NAV history charts

### 7. Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Helmet security headers
- Input validation with Joi
- SQL injection protection via Sequelize
- Rate limiting ready

## Demo Credentials

After running seeders, use these credentials:

**Admin Account:**
- Email: `admin@cssinvest.com`
- Password: `Password123!`

**Investor Account:**
- Email: `john@example.com`
- Password: `Password123!`

## Important Notes

### Production Deployment

Before deploying to production:

1. Change `JWT_SECRET` to a strong random string
2. Set `NODE_ENV=production`
3. Configure proper database credentials
4. Enable SSL/TLS for database connections
5. Set up proper logging and monitoring
6. Configure CORS for your frontend domain
7. Implement rate limiting
8. Set up database backups
9. Review and adjust fee percentages
10. Add legal disclaimers

### Legal Compliance

This is a financial application. Ensure you:

- Partner with a licensed broker/dealer
- Add proper legal disclaimers
- Never promise guaranteed returns
- Comply with local financial regulations
- Implement proper audit trails
- Have proper legal review

### Performance Optimization

For production with large datasets:

- Enable database query caching
- Partition NAV history table by date
- Index frequently queried fields
- Use Redis for session management
- Implement connection pooling
- Add CDN for static assets

## Support

For issues, questions, or contributions:

1. Check existing issues in the repository
2. Create a new issue with detailed information
3. Include logs with `[v0]` prefix for debugging

## License

MIT License - See LICENSE file for details

---

Built with best practices for production fintech applications.
# fund-accounting-backend
