const { StockAsset } = require("../models");
const logger = require("../config/logger");

class StockAssetService {
  static async getAll(filters = {}) {
    return await StockAsset.findAll({
      where: filters,
      order: [["ticker", "ASC"]],
    });
  }

  static async getById(id) {
    const asset = await StockAsset.findByPk(id);
    if (!asset) throw new Error("Stock asset not found");
    return asset;
  }

  static async create(data) {
    logger.info(`[v0] Admin creating stock asset ${data.ticker}`);
    return await StockAsset.create(data);
  }

  static async update(id, data) {
    const asset = await this.getById(id);
    logger.info(`[v0] Admin updating stock asset ${id}`);
    return await asset.update(data);
  }

  static async delete(id) {
    const asset = await this.getById(id);
    logger.info(`[v0] Admin deleting stock asset ${id}`);
    await asset.destroy();
    return { message: "Stock asset deleted" };
  }
}

module.exports = StockAssetService;