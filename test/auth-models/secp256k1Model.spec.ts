import "module-alias/register";

import { ethers } from "hardhat";

import { Address } from "@utils/types";
import { Account } from "@utils/test/types";
import { SECP256k1Model } from "@utils/contracts";
import DeployHelper from "@utils/deploys";

import {
  getWaffleExpect,
  getAccounts
} from "@utils/test/index";

const expect = getWaffleExpect();

describe("ManufacturerRegistry", () => {
  let owner: Account;
  let chipOne: Account;
  let chipTwo: Account;
  let deployer: DeployHelper;
  let authModel: SECP256k1Model;

  before(async () => {
    [owner, chipOne, chipTwo] = await getAccounts();

    deployer = new DeployHelper(owner.wallet);

    authModel = await deployer.deploySECP256k1Model();
  });

  describe("verify", () => {
    let subjectMessage: string;
    let subjectSignature: string;
    let subjectSigner: Address;

    beforeEach(async () => {
      subjectMessage = ethers.utils.hashMessage("deadbeef");
      subjectSignature = await chipOne.wallet.signMessage("deadbeef");
      subjectSigner = chipOne.address;
    });

    async function subject(): Promise<boolean> {
      return authModel.verify(
        subjectMessage,
        subjectSignature,
        subjectSigner
      );
    }

    it("should return true when the signature is valid", async () => {
      const isValid = await subject();

      expect(isValid).to.be.true;
    });

    describe("when the signature is invalid", () => {
      beforeEach(async () => {
        subjectSigner = chipTwo.address;
      });

      it("should return false", async () => {
        const isValid = await subject();

        expect(isValid).to.be.false;
      });
    });
  });
});
