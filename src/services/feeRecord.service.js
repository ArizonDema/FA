const { FeeRecord } = require("../models");
const logger = require("../config/logger");

class FeeRecordService {
  static async getAll(filters = {}) {
    return await FeeRecord.findAll({
      where: filters,
      order: [["charged_at", "DESC"]],
    });
  }

  static async getById(id) {
    const record = await FeeRecord.findByPk(id);
    if (!record) throw new Error("Fee record not found");
    return record;
  }

  static async create(data) {
    logger.info(`[v0] Admin creating fee record`);
    return await FeeRecord.create(data);
  }

  static async update(id, data) {
    const record = await this.getById(id);
    logger.info(`[v0] Admin updating fee record ${id}`);
    return await record.update(data);
  }

  static async delete(id) {
    const record = await this.getById(id);
    logger.info(`[v0] Admin deleting fee record ${id}`);
    await record.destroy();
    return { message: "Fee record deleted" };
  }
}

module.exports = FeeRecordService;