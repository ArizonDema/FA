const mockFindAll = jest.fn()
const mockCreate = jest.fn()
const mockFindByPk = jest.fn()
const mockProfileFindOrCreate = jest.fn()
const mockGovernanceFindOrCreate = jest.fn()
const mockPolicyFindOrCreate = jest.fn()
const mockTaxFindOrCreate = jest.fn()
const mockProfileFindByPk = jest.fn()
const mockGovernanceFindByPk = jest.fn()
const mockPolicyFindByPk = jest.fn()
const mockTaxFindByPk = jest.fn()
const mockBankFindAll = jest.fn()
const mockBankDestroy = jest.fn()
const mockBankBulkCreate = jest.fn()
const mockAuditLogEvent = jest.fn()

jest.mock("../src/models", () => ({
  Fund: {
    findAll: (...args) => mockFindAll(...args),
    create: (...args) => mockCreate(...args),
    findByPk: (...args) => mockFindByPk(...args),
  },
  Portfolio: {
    findAll: (...args) => mockFindAll(...args),
    create: (...args) => mockCreate(...args),
    findByPk: (...args) => mockFindByPk(...args),
  },
  FundProfile: {
    findOrCreate: (...args) => mockProfileFindOrCreate(...args),
    findByPk: (...args) => mockProfileFindByPk(...args),
    upsert: jest.fn(),
  },
  FundGovernance: {
    findOrCreate: (...args) => mockGovernanceFindOrCreate(...args),
    findByPk: (...args) => mockGovernanceFindByPk(...args),
    upsert: jest.fn(),
  },
  FundAccountingPolicy: {
    findOrCreate: (...args) => mockPolicyFindOrCreate(...args),
    findByPk: (...args) => mockPolicyFindByPk(...args),
    upsert: jest.fn(),
  },
  FundTaxProfile: {
    findOrCreate: (...args) => mockTaxFindOrCreate(...args),
    findByPk: (...args) => mockTaxFindByPk(...args),
    upsert: jest.fn(),
  },
  FundBankAccount: {
    findAll: (...args) => mockBankFindAll(...args),
    destroy: (...args) => mockBankDestroy(...args),
    bulkCreate: (...args) => mockBankBulkCreate(...args),
  },
}))

jest.mock("../src/modules/audit/services/audit.service", () => ({
  logEvent: (...args) => mockAuditLogEvent(...args),
}))

const FundService = require("../src/modules/funds/services/fund.service")

function createFundRecord() {
  return {
    id: "fund-1",
    name: "Fund One",
    update: jest.fn(async function update(values) {
      Object.assign(this, values)
      return this
    }),
    toJSON() {
      return { id: this.id, name: this.name }
    },
  }
}

describe("FundService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFindAll.mockResolvedValue([createFundRecord()])
    mockCreate.mockResolvedValue(createFundRecord())
    mockFindByPk.mockResolvedValue(createFundRecord())
    mockProfileFindOrCreate.mockResolvedValue([{}, true])
    mockGovernanceFindOrCreate.mockResolvedValue([{}, true])
    mockPolicyFindOrCreate.mockResolvedValue([{}, true])
    mockTaxFindOrCreate.mockResolvedValue([{}, true])
    mockProfileFindByPk.mockResolvedValue({ legal_name: "Fund One LP" })
    mockGovernanceFindByPk.mockResolvedValue({})
    mockPolicyFindByPk.mockResolvedValue({})
    mockTaxFindByPk.mockResolvedValue({})
    mockBankFindAll.mockResolvedValue([])
    mockBankDestroy.mockResolvedValue(0)
    mockBankBulkCreate.mockResolvedValue([])
    mockAuditLogEvent.mockResolvedValue(null)
  })

  test("lists and creates funds with canonical fund_id", async () => {
    const funds = await FundService.listFunds()
    expect(funds[0].fund_id).toBe("fund-1")

    const created = await FundService.createFund({
      actorId: "admin-1",
      payload: { name: "New Fund" },
    })
    expect(created.fund_id).toBe("fund-1")
    expect(mockAuditLogEvent).toHaveBeenCalled()
  })

  test("returns full fund profile payload", async () => {
    const profile = await FundService.getFundProfile("fund-1")
    expect(profile.fund.fund_id).toBe("fund-1")
    expect(profile.profile.legal_name).toBe("Fund One LP")
  })
})
