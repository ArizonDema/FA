const { InvestmentContract, User, PortfolioRound } = require("../models");
const logger = require("../config/logger");

class InvestmentContractService {
  static async getAll(filters = {}) {
    return await InvestmentContract.findAll({
      where: filters,
      include: [
        { model: User, as: "user", attributes: ["id", "full_name", "email"] },
        { model: PortfolioRound, as: "round", attributes: ["id", "round_number"] },
      ],
      order: [["entry_date", "DESC"]],
    });
  }

  static async getById(id) {
    const contract = await InvestmentContract.findByPk(id, {
      include: [
        { model: User, as: "user", attributes: ["id", "full_name", "email"] },
        { model: PortfolioRound, as: "round" },
      ],
    });
    if (!contract) throw new Error("Investment contract not found");
    return contract;
  }

  static async create(data) {
    logger.info(`[v0] Admin manually creating investment contract`);
    return await InvestmentContract.create(data);
  }

  static async update(id, data) {
    const contract = await this.getById(id);
    logger.info(`[v0] Admin updating investment contract ${id}`);
    return await contract.update(data);
  }

  static async delete(id) {
    const contract = await this.getById(id);
    logger.info(`[v0] Admin deleting investment contract ${id}`);
    await contract.destroy();
    return { message: "Investment contract deleted" };
  }
}

module.exports = InvestmentContractService;