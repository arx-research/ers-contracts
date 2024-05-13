import "module-alias/register";

import { ethers } from "hardhat";
import { Blockchain } from "@utils/common";

import { Address } from "@utils/types";
import { Account } from "@utils/test/types";
import { ManufacturerRegistry } from "@utils/contracts";
import { ONE, ZERO, ADDRESS_ZERO } from "@utils/constants";
import DeployHelper from "@utils/deploys";

import {
  addSnapshotBeforeRestoreAfterEach,
  getWaffleExpect,
  getAccounts
} from "@utils/test/index";

import { createManufacturerCertificate } from "@utils/protocolUtils";
import { calculateEnrollmentId } from "@utils/index";

const expect = getWaffleExpect();

describe.only("ManufacturerRegistry", () => {
  let governance: Account;
  let manufacturerOne: Account;
  let manufacturerTwo: Account;
  let authModel: Account;
  let manufacturerRegistry: ManufacturerRegistry;
  let chipOne: Account;
  let invalidChip: Account;
  let deployer: DeployHelper;
  let chainId: number;

  const blockchain = new Blockchain(ethers.provider);

  beforeEach(async () => {
    [
      governance,
      manufacturerOne,
      manufacturerTwo,
      authModel,
      chipOne,
      invalidChip,
    ] = await getAccounts();

    deployer = new DeployHelper(governance.wallet);
    chainId = await blockchain.getChainId();

    manufacturerRegistry = await deployer.deployManufacturerRegistry(governance.address);
  });

  addSnapshotBeforeRestoreAfterEach();

  describe("#constructor", async () => {
    it("should have the deployer set as the owner", async () => {
      const actualOwner = await manufacturerRegistry.owner();
      expect(actualOwner).to.eq(governance.address);
    });
  });

  describe("#addManufacturer", async () => {
    let subjectManufacturerId: string;
    let subjectManufacturer: Address;
    let subjectCaller: Account;

    beforeEach(async () => {
      subjectManufacturerId = ethers.utils.formatBytes32String("manufacturerOne");
      subjectManufacturer = manufacturerOne.address;
      subjectCaller = governance;
    });

    async function subject(): Promise<any> {
      return await manufacturerRegistry.connect(subjectCaller.wallet).addManufacturer(subjectManufacturerId, subjectManufacturer);
    }

    it("should set the manufacturerInfo correctly", async () => {
      await subject();

      const mInfo = await manufacturerRegistry.getManufacturerInfo(subjectManufacturerId);
      expect(mInfo.owner).to.eq(subjectManufacturer);
      expect(mInfo.registered).to.be.true;
      expect(mInfo.enrollments).to.be.empty;
      expect(mInfo.nonce).to.eq(ZERO);
    });

    it("should emit a ManufacturerAdded event", async () => {
      await expect(subject()).to.emit(manufacturerRegistry, "ManufacturerAdded").withArgs(subjectManufacturerId, subjectManufacturer);
    });

    describe("when manufacturer is already registered", () => {
      beforeEach(async () => {
        await subject();

        subjectManufacturer = manufacturerTwo.address;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Manufacturer already registered");
      });
    });

    describe("when owner is zero address", () => {
      beforeEach(async () => {
        subjectManufacturer = ADDRESS_ZERO;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Invalid owner address");
      });
    });

    describe("when caller is not owner", () => {
      beforeEach(async () => {
        subjectCaller = manufacturerOne;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("#addChipEnrollment", async () => {
    let subjectManufacturerId: string;
    let subjectCertSigner: Address;
    let subjectAuthModel: Address;
    let subjectBootloaderApp: string;
    let subjectChipModel: string;
    let subjectChipValidationDataUri: string;
    let subjectCaller: Account;

    let expectedEnrollmentId: string;

    beforeEach(async () => {
      subjectManufacturerId = ethers.utils.formatBytes32String("manufacturerOne");

      await manufacturerRegistry.addManufacturer(subjectManufacturerId, manufacturerOne.address);

      expectedEnrollmentId = calculateEnrollmentId(
        subjectManufacturerId,
        ZERO
      );

      subjectCertSigner = manufacturerOne.address;
      subjectAuthModel = authModel.address;
      subjectChipValidationDataUri = "ipfs://ipfsHash";
      subjectBootloaderApp = "https://bootloader.app";
      subjectChipModel = "SuperCool ChipModel";
      subjectCaller = manufacturerOne;
    });

    async function subject(): Promise<any> {
      return await manufacturerRegistry.connect(subjectCaller.wallet).addChipEnrollment(
        subjectManufacturerId,
        subjectCertSigner,
        subjectAuthModel,
        subjectChipValidationDataUri,
        subjectBootloaderApp,
        subjectChipModel
      );
    }

    it("should set the enrollmentInfo correctly", async () => {
      await subject();

      const eInfo = await manufacturerRegistry.getEnrollmentInfo(expectedEnrollmentId);

      expect(eInfo.manufacturerId).to.eq(subjectManufacturerId);
      expect(eInfo.manufacturerCertSigner).to.eq(subjectCertSigner);
      expect(eInfo.authModel).to.eq(subjectAuthModel);
      expect(eInfo.bootloaderApp).to.eq(subjectBootloaderApp);
      expect(eInfo.chipModel).to.eq(subjectChipModel);
      expect(eInfo.chipValidationDataUri).to.eq(subjectChipValidationDataUri);
    });

    it("should increment the manufacturer's nonce", async () => {
      await subject();

      const manufacturerNonce = (await manufacturerRegistry.getManufacturerInfo(subjectManufacturerId)).nonce;
      expect(manufacturerNonce).to.eq(ONE);
    });

    it("should add enrollmentId to manufacturer's info", async () => {
      const oldMInfo = await manufacturerRegistry.getManufacturerInfo(subjectManufacturerId);
      expect(oldMInfo.enrollments).to.have.lengthOf(0);

      await subject();

      const newMInfo = await manufacturerRegistry.getManufacturerInfo(subjectManufacturerId);

      expect(newMInfo.enrollments).to.have.lengthOf(1);
      expect(newMInfo.enrollments[0]).to.eq(expectedEnrollmentId);
    });

    it("should emit a EnrollmentAdded event", async () => {
      await expect(subject()).to.emit(manufacturerRegistry, "EnrollmentAdded").withArgs(
        subjectManufacturerId,
        expectedEnrollmentId,
        subjectCertSigner,
        subjectAuthModel,
        subjectChipValidationDataUri,
        subjectBootloaderApp,
        subjectChipModel
      );
    });

    describe("when auth model is zero address", () => {
      beforeEach(async () => {
        subjectAuthModel = ADDRESS_ZERO;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Invalid auth model address");
      });
    });

    describe("when cert signer is zero address", () => {
      beforeEach(async () => {
        subjectCertSigner = ADDRESS_ZERO;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Invalid certificate signer address");
      });
    });

    describe("when caller is not manufacturer", () => {
      beforeEach(async () => {
        subjectCaller = governance;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Only manufacturer can call this function");
      });
    });
  });

  describe("#updateChipEnrollment", async () => {
    let subjectManufacturerId: string;
    let subjectManufacturerIdTwo: string;
    let subjectCertSigner: Address;
    let subjectCertSignerTwo: Address;
    let subjectAuthModel: Address;
    let subjectBootloaderApp: string;
    let subjectChipModel: string;
    let subjectChipValidationDataUri: string;
    let subjectCaller: Account;

    let expectedEnrollmentId: string;
    let expectedEnrollmentIdTwo: string;

    beforeEach(async () => {
      subjectManufacturerId = ethers.utils.formatBytes32String("manufacturerOne");
      subjectManufacturerIdTwo = ethers.utils.formatBytes32String("manufacturerTwo");

      await manufacturerRegistry.addManufacturer(subjectManufacturerId, manufacturerOne.address);
      await manufacturerRegistry.addManufacturer(subjectManufacturerIdTwo, manufacturerTwo.address);

      expectedEnrollmentId = calculateEnrollmentId(
        subjectManufacturerId,
        ZERO
      );

      expectedEnrollmentIdTwo = calculateEnrollmentId(
        subjectManufacturerIdTwo,
        ZERO
      );

      subjectCertSigner = manufacturerOne.address;
      subjectCertSignerTwo = manufacturerTwo.address;

      subjectAuthModel = authModel.address;
      subjectChipValidationDataUri = "ipfs://ipfsHash";
      subjectBootloaderApp = "https://bootloader.app";
      subjectChipModel = "SuperCool ChipModel";
      subjectCaller = manufacturerOne;
    });

    async function subject(): Promise<any> {
      await manufacturerRegistry.connect(manufacturerTwo.wallet).addChipEnrollment(
        subjectManufacturerIdTwo,
        subjectCertSignerTwo,
        subjectAuthModel,
        subjectChipValidationDataUri,
        subjectBootloaderApp,
        subjectChipModel
      );

      return await manufacturerRegistry.connect(subjectCaller.wallet).addChipEnrollment(
        subjectManufacturerId,
        subjectCertSigner,
        subjectAuthModel,
        subjectChipValidationDataUri,
        subjectBootloaderApp,
        subjectChipModel
      );
    }

    it("should set the enrollment to active correctly", async () => {
      await subject();

      const eInfo = await manufacturerRegistry.getEnrollmentInfo(expectedEnrollmentId);

      expect(eInfo.active).to.eq(true);
    });

    it("should disable enrollment", async () => {
      await subject();

      await manufacturerRegistry.connect(subjectCaller.wallet).updateChipEnrollment(subjectManufacturerId, false, expectedEnrollmentId);

      const eInfo = await manufacturerRegistry.getEnrollmentInfo(expectedEnrollmentId);

      expect(eInfo.active).to.eq(false);
    });

    it("should fail to disable enrollment when another manufacturer", async () => {
      await subject();

      await expect(manufacturerRegistry.connect(subjectCaller.wallet).updateChipEnrollment(subjectManufacturerId, false, expectedEnrollmentIdTwo)).to.be.revertedWith("Wrong manufacturer for enrollment id");
    });
  });

  describe("#removeManufacturer", async () => {
    let subjectManufacturerId: string;
    let subjectCaller: Account;

    beforeEach(async () => {
      subjectManufacturerId = ethers.utils.formatBytes32String("manufacturerOne");
      subjectCaller = governance;

      await manufacturerRegistry.addManufacturer(subjectManufacturerId, manufacturerOne.address);
    });

    async function subject(): Promise<any> {
      return await manufacturerRegistry.connect(subjectCaller.wallet).removeManufacturer(subjectManufacturerId);
    }

    it("should set the manufacturerInfo correctly", async () => {
      await subject();

      const mInfo = await manufacturerRegistry.getManufacturerInfo(subjectManufacturerId);

      expect(mInfo.owner).to.eq(ethers.constants.AddressZero);
      expect(mInfo.registered).to.be.true;
    });

    it("should emit a ManufacturerRemoved event", async () => {
      await expect(subject()).to.emit(manufacturerRegistry, "ManufacturerRemoved").withArgs(subjectManufacturerId);
    });

    describe("when manufacturer is not registered", () => {
      beforeEach(async () => {
        subjectManufacturerId = ethers.utils.formatBytes32String("manufacturerTwo");
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Manufacturer not registered");
      });
    });

    describe("when caller is not owner", () => {
      beforeEach(async () => {
        subjectCaller = manufacturerOne;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("#updateManufacturerOwner", async () => {
    let subjectManufacturerId: string;
    let subjectNewOwner: Address;
    let subjectCaller: Account;

    beforeEach(async () => {
      subjectManufacturerId = ethers.utils.formatBytes32String("manufacturerOne");

      await manufacturerRegistry.addManufacturer(subjectManufacturerId, manufacturerOne.address);

      subjectNewOwner = manufacturerTwo.address;
      subjectCaller = manufacturerOne;
    });

    async function subject(): Promise<any> {
      return await manufacturerRegistry.connect(subjectCaller.wallet).updateManufacturerOwner(subjectManufacturerId, subjectNewOwner);
    }

    it("should set the manufacturerInfo correctly", async () => {
      await subject();

      const mInfo = await manufacturerRegistry.getManufacturerInfo(subjectManufacturerId);

      expect(mInfo.owner).to.eq(subjectNewOwner);
      expect(mInfo.registered).to.be.true;
    });

    it("should emit a ManufacturerOwnerUpdated event", async () => {
      await expect(subject()).to.emit(manufacturerRegistry, "ManufacturerOwnerUpdated").withArgs(subjectManufacturerId, subjectNewOwner);
    });

    describe("when new owner address is zero address", () => {
      beforeEach(async () => {
        subjectNewOwner = ADDRESS_ZERO;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Invalid owner address");
      });
    });

    describe("when caller is not owner", () => {
      beforeEach(async () => {
        subjectCaller = governance;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Only manufacturer can call this function");
      });
    });
  });

  describe("#isEnrolledChip", async () => {
    let subjectEnrollmentId: string;
    let subjectChipId: Address;
    let subjectManufacturerCertificate: string;

    beforeEach(async () => {
      const manufacturerId = ethers.utils.formatBytes32String("manufacturerOne");

      await manufacturerRegistry.addManufacturer(manufacturerId, manufacturerOne.address);

      const certSigner = manufacturerOne.address;
      const chipAuthModel = authModel.address;
      const chipValidationDataUri = "ipfs://ipfsHash";
      const bootloaderApp = "https://bootloader.app";
      const chipModel = "SuperCool ChipModel";

      await manufacturerRegistry.connect(manufacturerOne.wallet).addChipEnrollment(
        manufacturerId,
        certSigner,
        chipAuthModel,
        chipValidationDataUri,
        bootloaderApp,
        chipModel
      );

      subjectManufacturerCertificate = await createManufacturerCertificate(manufacturerOne, chainId, chipOne.address),
      subjectEnrollmentId = calculateEnrollmentId(manufacturerId, ZERO);
      subjectChipId = chipOne.address;
    });

    async function subject(): Promise<any> {
      return await manufacturerRegistry.isEnrolledChip(
        subjectEnrollmentId,
        subjectChipId,
        subjectManufacturerCertificate
      );
    }

    it("should return true", async () => {
      const isChip = await subject();

      expect(isChip).to.be.true;
    });

    describe("when certificate is invalid", () => {
      beforeEach(async () => {
        subjectManufacturerCertificate = await createManufacturerCertificate(manufacturerOne, chainId, invalidChip.address);
      });

      it("should return false", async () => {
        const isChip = await subject();

        expect(isChip).to.be.false;
      });
    });
  });

  describe("#getEnrollmentBootloaderApp", async () => {
    let subjectEnrollmentId: string;

    beforeEach(async () => {
      const manufacturerId = ethers.utils.formatBytes32String("manufacturerOne");

      await manufacturerRegistry.addManufacturer(manufacturerId, manufacturerOne.address);

      const certSigner = manufacturerOne.address;
      const chipAuthModel = authModel.address;
      const chipValidationDataUri = "ipfs://ipfsHash";
      const bootloaderApp = "https://bootloader.app";
      const chipModel = "SuperCool ChipModel";

      await manufacturerRegistry.connect(manufacturerOne.wallet).addChipEnrollment(
        manufacturerId,
        certSigner,
        chipAuthModel,
        chipValidationDataUri,
        bootloaderApp,
        chipModel
      );

      subjectEnrollmentId = calculateEnrollmentId(manufacturerId, ZERO);
    });

    async function subject(): Promise<any> {
      return await manufacturerRegistry.getEnrollmentBootloaderApp(subjectEnrollmentId);
    }

    it("should return correct bootloader app", async () => {
      const actualBootloaderApp = await subject();

      expect(actualBootloaderApp).to.eq("https://bootloader.app");
    });
  });
});
