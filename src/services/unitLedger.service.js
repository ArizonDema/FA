const { UnitLedger, InvestmentContract } = require("../models");
const logger = require("../config/logger");

class UnitLedgerService {
  static async getAll(filters = {}) {
    return await UnitLedger.findAll({
      where: filters,
      include: [{ model: InvestmentContract, as: "contract" }],
      order: [["event_date", "DESC"]],
    });
  }

  static async getById(id) {
    const entry = await UnitLedger.findByPk(id);
    if (!entry) throw new Error("Unit ledger entry not found");
    return entry;
  }

  static async create(data) {
    logger.info(`[v0] Admin creating unit ledger entry`);
    return await UnitLedger.create(data);
  }

  static async update(id, data) {
    const entry = await this.getById(id);
    logger.info(`[v0] Admin updating unit ledger ${id}`);
    return await entry.update(data);
  }

  static async delete(id) {
    const entry = await this.getById(id);
    logger.info(`[v0] Admin deleting unit ledger ${id}`);
    await entry.destroy();
    return { message: "Unit ledger entry deleted" };
  }
}

module.exports = UnitLedgerService;