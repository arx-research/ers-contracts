import "module-alias/register";

import { ethers } from "hardhat";

import { Address } from "@utils/types";
import { Account } from "@utils/test/types";
import { EnrollmentSECP256k1Model } from "@utils/contracts";
import DeployHelper from "@utils/deploys";
import {
  createManufacturerCertificate
} from "@utils/protocolUtils";

import {
  getWaffleExpect,
  getAccounts
} from "@utils/test/index";
import { Blockchain } from "@utils/common";

const expect = getWaffleExpect();

describe("EnrollmentSECP256k1Model", () => {
  let owner: Account;
  let chipOne: Account;
  let chipTwo: Account;
  let manufacturerOne: Account;
  let deployer: DeployHelper;
  let enrollmentAuthModel: EnrollmentSECP256k1Model;
  let chainId: number;
  let blockchain: Blockchain;

  before(async () => {
    [owner, chipOne, chipTwo, manufacturerOne] = await getAccounts();

    blockchain = new Blockchain(ethers.provider);
    chainId = await blockchain.getChainId();

    deployer = new DeployHelper(owner.wallet);

    enrollmentAuthModel = await deployer.deployEnrollmentSECP256k1Model();
  });

  describe("verifyManufacturerCertificate", () => {
    let subjectChipId: Address;
    let subjectManufacturerCertSigner: Account;
    let subjectManufacturerCertificate: string;
    let subjectPayload: string;

    beforeEach(async () => {
      subjectChipId = chipOne.address;
      subjectManufacturerCertSigner = manufacturerOne;
      subjectPayload = "0x";

      subjectManufacturerCertificate = await createManufacturerCertificate(subjectManufacturerCertSigner, chainId, subjectChipId, enrollmentAuthModel.address);
    });

    async function subject(): Promise<boolean> {
      return enrollmentAuthModel.verifyManufacturerCertificate(
        subjectChipId,
        subjectManufacturerCertSigner.address,
        subjectManufacturerCertificate,
        subjectPayload
      );
    }

    it("should return true when the signature is valid", async () => {
      const isValid = await subject();

      expect(isValid).to.be.true;
    });

    describe("when the signature is invalid", () => {
      beforeEach(async () => {
        subjectManufacturerCertSigner = chipTwo;
      });

      it("should return false", async () => {
        const isValid = await subject();

        expect(isValid).to.be.false;
      });
    });
  });
});
