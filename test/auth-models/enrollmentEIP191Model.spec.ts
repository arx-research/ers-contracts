import "module-alias/register";

import { Address } from "@utils/types";
import { Account } from "@utils/test/types";
import { EnrollmentEIP191Model } from "@utils/contracts";
import DeployHelper from "@utils/deploys";
import {
  createEIP191ManufacturerCertificate
} from "@utils/protocolUtils";

import {
  getWaffleExpect,
  getAccounts
} from "@utils/test/index";

const expect = getWaffleExpect();

describe("EnrollmentEIP191Model", () => {
  let owner: Account;
  let chipOne: Account;
  let chipTwo: Account;
  let manufacturerOne: Account;
  let deployer: DeployHelper;
  let enrollmentAuthModel: EnrollmentEIP191Model;

  before(async () => {
    [owner, chipOne, chipTwo, manufacturerOne] = await getAccounts();

    deployer = new DeployHelper(owner.wallet);

    enrollmentAuthModel = await deployer.deployEnrollmentEIP191Model();
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

      subjectManufacturerCertificate = await createEIP191ManufacturerCertificate(subjectManufacturerCertSigner, subjectChipId);
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
