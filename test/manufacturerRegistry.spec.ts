import "module-alias/register";

import { BigNumber, ethers } from "ethers";

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

import { calculateEnrollmentId, ManufacturerTree } from "@utils/index";

const expect = getWaffleExpect();

describe("ManufacturerRegistry", () => {
  let governance: Account;
  let manufacturerOne: Account;
  let manufacturerTwo: Account;
  let authModel: Account;
  let manufacturerRegistry: ManufacturerRegistry;
  let chipOne: Account;
  let chipTwo: Account;
  let deployer: DeployHelper;

  beforeEach(async () => {
    [
      governance,
      manufacturerOne,
      manufacturerTwo,
      authModel,
      chipOne,
      chipTwo,
    ] = await getAccounts();

    deployer = new DeployHelper(governance.wallet);

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
    let subjectMerkleRoot: string;
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

      subjectMerkleRoot = ethers.utils.formatBytes32String("merkleRoot");
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
        subjectMerkleRoot,
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
      expect(eInfo.merkleRoot).to.eq(subjectMerkleRoot);
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
        subjectMerkleRoot,
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
    let subjectIndex: BigNumber;
    let subjectChipId: Address;
    let subjectMerkleProof: string[];

    let merkleTree: ManufacturerTree;

    beforeEach(async () => {
      const manufacturerId = ethers.utils.formatBytes32String("manufacturerOne");

      await manufacturerRegistry.addManufacturer(manufacturerId, manufacturerOne.address);

      merkleTree =  new ManufacturerTree([{ chipId: chipOne.address}, { chipId: chipTwo.address}]);

      const merkleRoot = merkleTree.getHexRoot();
      const certSigner = manufacturerOne.address;
      const chipAuthModel = authModel.address;
      const chipValidationDataUri = "ipfs://ipfsHash";
      const bootloaderApp = "https://bootloader.app";
      const chipModel = "SuperCool ChipModel";

      await manufacturerRegistry.connect(manufacturerOne.wallet).addChipEnrollment(
        manufacturerId,
        merkleRoot,
        certSigner,
        chipAuthModel,
        chipValidationDataUri,
        bootloaderApp,
        chipModel
      );

      subjectEnrollmentId = calculateEnrollmentId(manufacturerId, ZERO);
      subjectIndex = ZERO;
      subjectChipId = chipOne.address;
      subjectMerkleProof = merkleTree.getProof(subjectIndex, subjectChipId);
    });

    async function subject(): Promise<any> {
      return await manufacturerRegistry.isEnrolledChip(
        subjectEnrollmentId,
        subjectIndex,
        subjectChipId,
        subjectMerkleProof
      );
    }

    it("should return true", async () => {
      const isChip = await subject();

      expect(isChip).to.be.true;
    });

    describe("when proof is invalid", () => {
      beforeEach(async () => {
        subjectMerkleProof = merkleTree.getProof(ONE, chipTwo.address);
      });

      it("should return false", async () => {
        const isChip = await subject();

        expect(isChip).to.be.false;
      });
    });
  });
});
