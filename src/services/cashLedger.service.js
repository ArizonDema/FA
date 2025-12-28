const { CashLedger } = require("../models");
const logger = require("../config/logger");

class CashLedgerService {
  static async getAll(filters = {}) {
    return await CashLedger.findAll({
      where: filters,
      order: [["recorded_at", "DESC"]],
    });
  }

  static async getById(id) {
    const record = await CashLedger.findByPk(id);
    if (!record) throw new Error("Cash ledger record not found");
    return record;
  }

  static async create(data) {
    logger.info(`[v0] Admin creating cash ledger entry`);
    return await CashLedger.create(data);
  }

  static async update(id, data) {
    const record = await this.getById(id);
    logger.info(`[v0] Admin updating cash ledger ${id}`);
    return await record.update(data);
  }

  static async delete(id) {
    const record = await this.getById(id);
    logger.info(`[v0] Admin deleting cash ledger ${id}`);
    await record.destroy();
    return { message: "Cash ledger record deleted" };
  }
}

module.exports = CashLedgerService;