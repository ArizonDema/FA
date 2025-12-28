// backend/src/services/stockPosition.service.js

const { StockPosition, StockAsset, Portfolio, PortfolioRound } = require("../models");
const logger = require("../config/logger");

class StockPositionService {
  static async getAll(filters = {}) {
    return await StockPosition.findAll({
      where: filters,
      include: [
        { model: StockAsset, as: "stock" },          // ← Fixed: use "stock" not "asset"
        { model: Portfolio, as: "portfolio" },
        { model: PortfolioRound, as: "round" },     // Optional: include round info if useful
      ],
      order: [["recorded_at", "DESC"]],
    });
  }

  static async getById(id) {
    const position = await StockPosition.findByPk(id, {
      include: [
        { model: StockAsset, as: "stock" },        // ← Fixed here too
        { model: Portfolio, as: "portfolio" },
        { model: PortfolioRound, as: "round" },
      ],
    });
    if (!position) throw new Error("Stock position not found");
    return position;
  }

  static async create(data) {
    logger.info(`[v0] Admin creating stock position`);
    return await StockPosition.create(data);
  }

  static async update(id, data) {
    const position = await this.getById(id);
    logger.info(`[v0] Admin updating stock position ${id}`);
    return await position.update(data);
  }

  static async delete(id) {
    const position = await this.getById(id);
    logger.info(`[v0] Admin deleting stock position ${id}`);
    await position.destroy();
    return { message: "Stock position deleted" };
  }
}

module.exports = StockPositionService;