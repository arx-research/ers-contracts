
import chai from "chai";
import { Blockchain } from "../common";

// Use HARDHAT version of providers
import { ethers } from "hardhat";
import { providers } from "ethers";

const provider = ethers.provider;

// HARDHAT-SPECIFIC Provider
export const getProvider = (): providers.JsonRpcProvider => {
  return ethers.provider;
};

// HARDHAT / WAFFLE
export const getWaffleExpect = (): Chai.ExpectStatic => {
  return chai.expect;
};

export const addSnapshotBeforeRestoreAfterEach = () => {
  const blockchain = new Blockchain(provider);
  beforeEach(async () => {
    await blockchain.saveSnapshotAsync();
  });

  afterEach(async () => {
    await blockchain.revertAsync();
  });
};
