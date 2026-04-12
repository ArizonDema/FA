const mockCreate = jest.fn()

jest.mock("../src/models", () => ({
  AuditEvent: {
    create: (...args) => mockCreate(...args),
  },
  AuditLog: {
    create: (...args) => mockCreate(...args),
  },
}))

jest.mock("../src/config/logger", () => ({
  warn: jest.fn(),
}))

const AuditService = require("../src/modules/audit/services/audit.service")

describe("AuditService", () => {
  beforeEach(() => {
    mockCreate.mockReset()
    mockCreate.mockResolvedValue({ id: "audit-1" })
  })

  test("writes append-only audit events with canonical fields", async () => {
    await AuditService.logEvent({
      actorId: "user-1",
      eventType: "template_created",
      entityType: "template",
      entityId: "template-1",
      metadata: { fund_id: "fund-1" },
      before: null,
      after: { id: "template-1" },
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: "user-1",
        event_type: "template_created",
        action: "template_created",
        entity_type: "template",
        entity_id: "template-1",
        metadata_json: { fund_id: "fund-1" },
        after_json: { id: "template-1" },
      }),
    )
  })
})
