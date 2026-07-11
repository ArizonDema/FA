const fs = require("fs")
const os = require("os")
const path = require("path")

const mockTransaction = jest.fn(async (callback) => callback({ id: "tx" }))
const mockReportRunFindByPk = jest.fn()
const mockReportExportFindOne = jest.fn()
const mockReportExportCreate = jest.fn()
const mockReviewTaskCreate = jest.fn()
const mockAuditLogEvent = jest.fn()
const mockGetLatestValidationForRun = jest.fn()

jest.mock("../src/models", () => ({
  sequelize: {
    transaction: (...args) => mockTransaction(...args),
  },
  ReportRun: {
    findByPk: (...args) => mockReportRunFindByPk(...args),
  },
  ReportExport: {
    findOne: (...args) => mockReportExportFindOne(...args),
    create: (...args) => mockReportExportCreate(...args),
    findAll: jest.fn(async () => []),
  },
  ReviewTask: {
    create: (...args) => mockReviewTaskCreate(...args),
  },
}))

jest.mock("../src/modules/audit/services/audit.service", () => ({
  logEvent: (...args) => mockAuditLogEvent(...args),
}))

jest.mock("../src/modules/reports/services/validationResult.service", () => ({
  getLatestForRun: (...args) => mockGetLatestValidationForRun(...args),
}))

const ReportExportService = require("../src/modules/reports/services/reportExport.service")

function createExportRecord(overrides = {}) {
  return {
    id: "export-1",
    report_run_id: "run-1",
    format: "xlsx",
    status: "approval_requested",
    output_path: overrides.output_path || "report.xlsx",
    checksum_sha256: overrides.checksum_sha256 || null,
    approval_review_task_id: "task-1",
    update: jest.fn(async function update(values) {
      Object.assign(this, values)
      return this
    }),
    toJSON() {
      return { ...this }
    },
    ...overrides,
  }
}

describe("ReportExportService", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "report-export-test-"))
  const reportPath = path.join(tempDir, "report.xlsx")

  beforeEach(() => {
    jest.clearAllMocks()
    fs.writeFileSync(reportPath, "xlsx-bytes")
    mockReportRunFindByPk.mockResolvedValue({
      id: "run-1",
      type: "cash_flow",
      portfolio_id: "fund-1",
      template_version_id: "version-1",
      output_paths: { xlsx: reportPath },
    })
    mockReportExportFindOne.mockResolvedValue(null)
    mockGetLatestValidationForRun.mockResolvedValue({
      validationResult: {
        id: "validation-1",
        readinessStatus: "ready",
      },
      checks: [],
    })
    mockReportExportCreate.mockImplementation(async (payload) => createExportRecord(payload))
    mockReviewTaskCreate.mockResolvedValue({ id: "task-1" })
    mockAuditLogEvent.mockResolvedValue(null)
  })

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test("creates an export approval review task only after ready validation", async () => {
    const result = await ReportExportService.requestFinalExport({
      runId: "run-1",
      actorId: "admin-1",
    })

    expect(result.export.status).toBe("approval_requested")
    expect(result.reviewTaskId).toBe("task-1")
    expect(mockReviewTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        task_type: "export_approval",
        target_type: "report_export",
        portfolio_id: "fund-1",
      }),
      expect.any(Object),
    )
  })

  test("blocks export approval when validation is not ready", async () => {
    mockGetLatestValidationForRun.mockResolvedValueOnce({
      validationResult: {
        id: "validation-2",
        readinessStatus: "not_ready",
      },
      checks: [],
    })

    await expect(ReportExportService.requestFinalExport({ runId: "run-1" })).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(mockReviewTaskCreate).not.toHaveBeenCalled()
  })

  test("requires an approved export record for final downloads", async () => {
    await expect(
      ReportExportService.resolveDownload({
        runId: "run-1",
        requireFinalApproval: true,
      }),
    ).rejects.toMatchObject({ statusCode: 403 })

    mockReportExportFindOne.mockResolvedValueOnce(
      createExportRecord({
        status: "approved",
        output_path: reportPath,
        checksum_sha256: require("crypto").createHash("sha256").update(fs.readFileSync(reportPath)).digest("hex"),
      }),
    )
    const download = await ReportExportService.resolveDownload({
      runId: "run-1",
      actorId: "admin-1",
      requireFinalApproval: true,
    })

    expect(download.final).toBe(true)
    expect(download.filePath).toBe(reportPath)
  })
})
