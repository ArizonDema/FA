// backend/src/services/tradeTransaction.service.js

const { TradeTransaction, StockAsset, PortfolioRound } = require("../models");
const logger = require("../config/logger");

class TradeTransactionService {
  static async getAll(filters = {}) {
    return await TradeTransaction.findAll({
      where: filters,
      include: [
        { model: StockAsset, as: "stock" },     // ← Changed from "asset" to "stock"
        { model: PortfolioRound, as: "round" },
      ],
      order: [["executed_at", "DESC"]],
    });
  }

  static async getById(id) {
    const trade = await TradeTransaction.findByPk(id, {
      include: [
        { model: StockAsset, as: "stock" },   // ← Also fixed here
        { model: PortfolioRound, as: "round" },
      ],
    });
    if (!trade) throw new Error("Trade transaction not found");
    return trade;
  }

  static async create(data) {
    logger.info(`[v0] Admin recording manual trade`);
    return await TradeTransaction.create(data);
  }

  static async update(id, data) {
    const trade = await this.getById(id);
    logger.info(`[v0] Admin updating trade ${id}`);
    return await trade.update(data);
  }

  static async delete(id) {
    const trade = await this.getById(id);
    logger.info(`[v0] Admin deleting trade ${id}`);
    await trade.destroy();
    return { message: "Trade transaction deleted" };
  }
}

module.exports = TradeTransactionService;