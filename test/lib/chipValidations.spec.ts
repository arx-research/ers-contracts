import "module-alias/register";

import { ethers } from "hardhat";
import { BigNumber } from "ethers";

import {
  Address
} from "@utils/types";
import { Account } from "@utils/test/types";
import {
  AccountMock,
  ChipValidationsMock
} from "@utils/contracts";
import DeployHelper from "@utils/deploys";

import {
  getWaffleExpect,
  getAccounts
} from "@utils/test/index";

import { Blockchain } from "@utils/common";

const expect = getWaffleExpect();

describe("ChipValidations", () => {
  let owner: Account;
  let chip: Account;
  let chipTwo: Account;

  let chipValidations: ChipValidationsMock;
  let accountMock: AccountMock;

  let deployer: DeployHelper;
  const blockchain = new Blockchain(ethers.provider);

  beforeEach(async () => {
    [
      owner,
      chip,
      chipTwo,
    ] = await getAccounts();

    deployer = new DeployHelper(owner.wallet);

    accountMock = await deployer.mocks.deployAccountMock(chipTwo.address, owner.address); // Using owner as stand-in
    chipValidations = await deployer.mocks.deployChipValidationsMock();
  });

  describe("#validateSignatureAndExpiration", async () => {
    let subjectChipId: Address;
    let subjectCommitBlock: BigNumber;
    let subjectMaxBlockWindow: BigNumber;
    let subjectPayload: string;
    let subjectSignature: string;

    beforeEach(async () => {
      subjectChipId = chip.address;
      subjectCommitBlock = await blockchain.getLatestBlockNumber();
      subjectMaxBlockWindow = BigNumber.from(5);

      subjectPayload = ethers.utils.solidityPack(["uint256"], [subjectCommitBlock]);
      subjectSignature = await chip.wallet.signMessage(ethers.utils.arrayify(subjectPayload));
    });

    async function subject(): Promise<any> {
      return chipValidations.validateSignatureAndExpiration(
        subjectChipId,
        subjectCommitBlock,
        subjectMaxBlockWindow,
        subjectPayload,
        subjectSignature
      );
    }

    it("should not revert", async () => {
      await expect(subject()).to.not.be.reverted;
    });

    describe("when the chip address is not an EOA but an account contract", async () => {
      beforeEach(async () => {
        subjectChipId = accountMock.address;
        subjectSignature = await chipTwo.wallet.signMessage(ethers.utils.arrayify(subjectPayload));
      });

      it("should not revert", async () => {
        await expect(subject()).to.not.be.reverted;
      });
    });

    describe("when the chipId is not the same as the signer", async () => {
      beforeEach(async () => {
        subjectChipId = chipTwo.address;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Invalid signature");
      });
    });

    describe("when the signature has expired", async () => {
      beforeEach(async () => {
        subjectCommitBlock = (await blockchain.getLatestBlockNumber()).sub(6);
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Signature expired");
      });
    });
  });
});
