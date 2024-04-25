import "module-alias/register";

import { ethers } from "hardhat";
import { BigNumber } from "ethers";

import {
  Address,
  ExpandedChipService,
  Service,
  ServiceRecord
} from "@utils/types";
import { Account } from "@utils/test/types";
import {
  ChipRegistryMock,
  ServicesRegistry
} from "@utils/contracts";
import { ADDRESS_ZERO, ZERO } from "@utils/constants";
import DeployHelper from "@utils/deploys";

import {
  getWaffleExpect,
  getAccounts
} from "@utils/test/index";
import {
  calculateSubnodeHash
} from "@utils/protocolUtils";

import { Blockchain } from "@utils/common";

const expect = getWaffleExpect();

describe("ServicesRegistry", () => {
  let deployAccount: Account;
  let owner: Account;
  let chip: Account;
  let chipTwo: Account;
  let chipRegistry: ChipRegistryMock;
  let servicesRegistry: ServicesRegistry;

  let deployer: DeployHelper;

  const blockchain = new Blockchain(ethers.provider);
  const maxBlockWindow = BigNumber.from(5);

  beforeEach(async () => {
    [
      deployAccount,
      owner,
      chip,
      chipTwo,
    ] = await getAccounts();

    deployer = new DeployHelper(deployAccount.wallet);

    chipRegistry = await deployer.mocks.deployChipRegistryMock(owner.address);

    servicesRegistry = await deployer.deployServicesRegistry(chipRegistry.address, maxBlockWindow);

    await chipRegistry.initialize(owner.address, servicesRegistry.address, owner.address);
  });

  describe("#constructor", async () => {
    it("should set the correct state variables", async () => {
      const actualChipRegistry = await servicesRegistry.chipRegistry();
      const actualMaxBlockWindow = await servicesRegistry.maxBlockWindow();

      expect(actualChipRegistry).to.eq(chipRegistry.address);
      expect(actualMaxBlockWindow).to.eq(maxBlockWindow);
    });
  });

  describe("#createService", async () => {
    let recordOneType: string;
    let recordOneContent: string;
    let recordTwoType: string;
    let recordTwoContent: string;

    let subjectServiceId: string;
    let subjectServiceRecords: ServiceRecord[];
    let subjectCaller: Account;

    before(async () => {
      recordOneType = ethers.utils.formatBytes32String("tokenUri");
      recordOneContent = ethers.utils.hexlify(Buffer.from("//api.gucci.com/tokens/1"));

      recordTwoType = ethers.utils.formatBytes32String("redirectUrl");
      recordTwoContent = ethers.utils.hexlify(Buffer.from("flex.gucci.com"));
    });

    beforeEach(async () => {
      subjectServiceId = ethers.utils.formatBytes32String("Gucci-Flex");
      subjectServiceRecords = [
        {
          recordType: recordOneType,
          content: recordOneContent,
          appendId: true,
        },
        {
          recordType: recordTwoType,
          content: recordTwoContent,
          appendId: false,
        },
      ];
      subjectCaller = owner;
    });

    async function subject(): Promise<any> {
      return servicesRegistry.connect(subjectCaller.wallet).createService(subjectServiceId, subjectServiceRecords);
    }

    it("should create an entry in the serviceInfo mapping", async () => {
      await subject();

      const serviceInfo = await servicesRegistry.getServiceInfo(subjectServiceId);

      expect(serviceInfo.owner).to.eq(subjectCaller.address);
      expect(serviceInfo.recordTypes).to.deep.eq(
        subjectServiceRecords.map((record) => record.recordType)
      );
    });

    it("should fill out the serviceRecords mapping", async () => {
      await subject();

      const serviceRecordOne = await servicesRegistry.serviceRecords(subjectServiceId, recordOneType);
      expect(serviceRecordOne.content).to.eq(recordOneContent);
      expect(serviceRecordOne.appendId).to.be.true;

      const serviceRecordTwo = await servicesRegistry.serviceRecords(subjectServiceId, recordTwoType);
      expect(serviceRecordTwo.content).to.eq(recordTwoContent);
      expect(serviceRecordTwo.appendId).to.be.false;
    });

    it("should emit a ServiceCreated event", async () => {
      await expect(subject()).to.emit(servicesRegistry, "ServiceCreated").withArgs(
        subjectServiceId,
        subjectCaller.address
      );
    });

    it("should emit a ServiceRecordAdded event", async () => {
      await expect(subject()).to.emit(servicesRegistry, "ServiceRecordAdded").withArgs(
        subjectServiceId,
        subjectServiceRecords[0].recordType,
        subjectServiceRecords[0].content,
        subjectServiceRecords[0].appendId
      );
    });

    describe("when the serviceId is already in use", async () => {
      beforeEach(async () => {
        await subject();
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("ServiceId already taken");
      });
    });

    describe("when the passed serviceId is bytes32(0)", async () => {
      beforeEach(async () => {
        subjectServiceId = ethers.utils.formatBytes32String("");
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Invalid ServiceId");
      });
    });

    describe("when there are duplicate recordTypes in the serviceRecords array", async () => {
      beforeEach(async () => {
        subjectServiceRecords = [
          {
            recordType: recordOneType,
            content: recordOneContent,
            appendId: true,
          },
          {
            recordType: recordOneType,
            content: recordTwoContent,
            appendId: false,
          },
        ];
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Record type already exists for service");
      });
    });
  });

  context("when a service has been created", async () => {
    let serviceId: string;
    let recordOneType: string;
    let recordOneContent: string;
    let recordTwoType: string;
    let recordTwoContent: string;

    let serviceOwner: Account;

    beforeEach(async () => {
      recordOneType = ethers.utils.formatBytes32String("tokenUri");
      recordOneContent = ethers.utils.hexlify(Buffer.from("//api.gucci.com/tokens/1"));

      recordTwoType = ethers.utils.formatBytes32String("redirectUrl");
      recordTwoContent = ethers.utils.hexlify(Buffer.from("flex.gucci.com"));

      serviceId = ethers.utils.formatBytes32String("Gucci-Flex");
      const serviceRecords = [
        {
          recordType: recordOneType,
          content: recordOneContent,
          appendId: true,
        },
        {
          recordType: recordTwoType,
          content: recordTwoContent,
          appendId: false,
        },
      ];
      serviceOwner = owner;

      await servicesRegistry.connect(serviceOwner.wallet).createService(serviceId, serviceRecords);
    });

    describe("#addServiceRecords", async () => {
      let recordThreeType: string;
      let recordThreeContent: string;
      let recordFourType: string;
      let recordFourContent: string;

      let subjectServiceId: string;
      let subjectServiceRecords: ServiceRecord[];
      let subjectCaller: Account;

      before(async () => {
        recordThreeType = ethers.utils.formatBytes32String("airdropService");
        recordThreeContent = ethers.utils.hexlify(Buffer.from("//api.gucci.com/tokens/2"));

        recordFourType = ethers.utils.formatBytes32String("contractAddress");
        recordFourContent = ethers.utils.hexlify(Buffer.from(ADDRESS_ZERO));
      });

      beforeEach(async () => {
        subjectServiceId = serviceId;
        subjectServiceRecords = [
          {
            recordType: recordThreeType,
            content: recordThreeContent,
            appendId: true,
          },
          {
            recordType: recordFourType,
            content: recordFourContent,
            appendId: false,
          },
        ];
        subjectCaller = serviceOwner;
      });

      async function subject(): Promise<any> {
        return servicesRegistry.connect(subjectCaller.wallet).addServiceRecords(subjectServiceId, subjectServiceRecords);
      }

      it("should add the passed records to the serviceRecords mapping", async () => {
        await subject();

        const serviceRecordThree = await servicesRegistry.serviceRecords(subjectServiceId, recordThreeType);
        expect(serviceRecordThree.content).to.eq(recordThreeContent);
        expect(serviceRecordThree.appendId).to.be.true;

        const serviceRecordFour = await servicesRegistry.serviceRecords(subjectServiceId, recordFourType);
        expect(serviceRecordFour.content).to.eq(recordFourContent);
        expect(serviceRecordFour.appendId).to.be.false;
      });

      it("should add the passed recordTypes to the serviceInfo mapping", async () => {
        await subject();

        const serviceInfo = await servicesRegistry.getServiceInfo(subjectServiceId);

        expect(serviceInfo.recordTypes).to.include(recordThreeType);
        expect(serviceInfo.recordTypes).to.include(recordFourType);
      });

      it("should emit a ServiceRecordAdded event for record three type", async () => {
        await expect(subject()).to.emit(servicesRegistry, "ServiceRecordAdded").withArgs(
          subjectServiceId,
          recordThreeType,
          recordThreeContent,
          true
        );
      });

      it("should emit a ServiceRecordAdded event for record four type", async () => {
        await expect(subject()).to.emit(servicesRegistry, "ServiceRecordAdded").withArgs(
          subjectServiceId,
          recordFourType,
          recordFourContent,
          false
        );
      });

      describe("when a record exists for the passed record type", async () => {
        before(async () => {
          recordThreeType = recordOneType;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Record type already exists for service");
        });

        after(async () => {
          recordThreeType = ethers.utils.formatBytes32String("airdropService");
        });
      });

      describe("when a duplicate records are passed in the array", async () => {
        before(async () => {
          recordFourType = recordThreeType;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Record type already exists for service");
        });

        after(async () => {
          recordFourType = ethers.utils.formatBytes32String("contractAddress");
        });
      });

      describe("when the service hasn't been created yet", async () => {
        beforeEach(async () => {
          subjectServiceId = ethers.utils.formatBytes32String("Gucci-Flex-2");
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Caller must be service owner");
        });
      });

      describe("when the caller is not the service owner", async () => {
        beforeEach(async () => {
          subjectCaller = deployAccount;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Caller must be service owner");
        });
      });
    });

    describe("#editServiceRecords", async () => {
      let recordOneNewContent: string;
      let recordTwoNewContent: string;

      let subjectServiceId: string;
      let subjectServiceRecords: ServiceRecord[];
      let subjectCaller: Account;

      beforeEach(async () => {
        subjectServiceId = serviceId;
        recordOneNewContent = ethers.utils.hexlify(Buffer.from("//api.gucci.com/tokens/2"));
        recordTwoNewContent = ethers.utils.hexlify(Buffer.from("flex.gucci.com"));
        subjectServiceRecords = [
          {
            recordType: recordOneType,
            content: recordOneNewContent,
            appendId: false,
          },
          {
            recordType: recordTwoType,
            content: recordTwoNewContent,
            appendId: true,
          },
        ];
        subjectCaller = serviceOwner;
      });

      async function subject(): Promise<any> {
        return servicesRegistry.connect(subjectCaller.wallet).editServiceRecords(subjectServiceId, subjectServiceRecords);
      }

      it("should update the content of the passed record types", async () => {
        await subject();

        const serviceRecordThree = await servicesRegistry.serviceRecords(subjectServiceId, recordOneType);
        expect(serviceRecordThree.content).to.eq(recordOneNewContent);
        expect(serviceRecordThree.appendId).to.be.false;

        const serviceRecordFour = await servicesRegistry.serviceRecords(subjectServiceId, recordTwoType);
        expect(serviceRecordFour.appendId).to.be.true;
      });

      it("should emit a ServiceRecordEdited event for record one type", async () => {
        await expect(subject()).to.emit(servicesRegistry, "ServiceRecordEdited").withArgs(
          subjectServiceId,
          recordOneType,
          recordOneNewContent,
          false
        );
      });

      it("should emit a ServiceRecordEdited event for record two type", async () => {
        await expect(subject()).to.emit(servicesRegistry, "ServiceRecordEdited").withArgs(
          subjectServiceId,
          recordTwoType,
          recordTwoNewContent,
          true
        );
      });

      describe("when a record doesn't exist for the passed record type", async () => {
        beforeEach(async () => {
          subjectServiceRecords[0].recordType = ethers.utils.formatBytes32String("contractAddress");
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Record type does not exist for service");
        });
      });

      describe("when a duplicate records are passed in the array", async () => {
        beforeEach(async () => {
          subjectServiceRecords[0].recordType = recordTwoType;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Duplicate record types");
        });
      });

      describe("when the service hasn't been created yet", async () => {
        beforeEach(async () => {
          subjectServiceId = ethers.utils.formatBytes32String("Gucci-Flex-2");
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Caller must be service owner");
        });
      });

      describe("when the caller is not the service owner", async () => {
        beforeEach(async () => {
          subjectCaller = deployAccount;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Caller must be service owner");
        });
      });
    });

    describe("#removeServiceRecords", async () => {
      let subjectServiceId: string;
      let subjectRecordTypes: string[];
      let subjectCaller: Account;

      beforeEach(async () => {
        subjectServiceId = serviceId;
        subjectRecordTypes = [recordOneType];
        subjectCaller = serviceOwner;
      });

      async function subject(): Promise<any> {
        return servicesRegistry.connect(subjectCaller.wallet).removeServiceRecords(subjectServiceId, subjectRecordTypes);
      }

      it("should remove the passed records from the serviceRecords mapping", async () => {
        await subject();

        const serviceRecord = await servicesRegistry.serviceRecords(subjectServiceId, recordOneType);
        expect(serviceRecord.enabled).to.be.false;
        expect(serviceRecord.content).to.eq("0x");
        expect(serviceRecord.appendId).to.be.false;
      });

      it("should remove the passed recordTypes from the serviceInfo mapping", async () => {
        const preServiceInfo = await servicesRegistry.getServiceInfo(subjectServiceId);

        expect(preServiceInfo.recordTypes).to.include(recordOneType);

        await subject();

        const postServiceInfo = await servicesRegistry.getServiceInfo(subjectServiceId);

        expect(postServiceInfo.recordTypes).to.not.include(recordOneType);
      });

      it("should emit a ServiceRecordRemoved event for record one type", async () => {
        await expect(subject()).to.emit(servicesRegistry, "ServiceRecordRemoved").withArgs(
          subjectServiceId,
          recordOneType
        );
      });

      describe("when a record doesn't exist for the passed record type", async () => {
        beforeEach(async () => {
          subjectRecordTypes = [ethers.utils.formatBytes32String("contractAddress")];
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Record type does not exist for service");
        });
      });

      describe("when a duplicate records are passed in the array", async () => {
        beforeEach(async () => {
          subjectRecordTypes = [recordOneType, recordOneType];
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Record type does not exist for service");
        });
      });

      describe("when the service hasn't been created yet", async () => {
        beforeEach(async () => {
          subjectServiceId = ethers.utils.formatBytes32String("Gucci-Flex-2");
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Caller must be service owner");
        });
      });

      describe("when the caller is not the service owner", async () => {
        beforeEach(async () => {
          subjectCaller = deployAccount;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Caller must be service owner");
        });
      });
    });

    describe("#setServiceOwner", async () => {
      let subjectServiceId: string;
      let subjectNewOwner: Address;
      let subjectCaller: Account;

      beforeEach(async () => {
        subjectServiceId = serviceId;
        subjectNewOwner = deployAccount.address;
        subjectCaller = serviceOwner;
      });

      async function subject(): Promise<any> {
        return servicesRegistry.connect(subjectCaller.wallet).setServiceOwner(subjectServiceId, subjectNewOwner);
      }

      it("should update the owner", async () => {
        await subject();

        const newOwner = (await servicesRegistry.getServiceInfo(subjectServiceId)).owner;

        expect(newOwner).to.eq(subjectNewOwner);
      });

      it("should emit a ServiceOwnershipTransferred event for record one type", async () => {
        await expect(subject()).to.emit(servicesRegistry, "ServiceOwnershipTransferred").withArgs(
          subjectServiceId,
          serviceOwner.address,
          subjectNewOwner
        );
      });

      describe("when the old and new owner are the same address", async () => {
        beforeEach(async () => {
          subjectNewOwner = serviceOwner.address;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Old and new owner are same address");
        });
      });

      describe("when the passed newOwner is the zero address", async () => {
        beforeEach(async () => {
          subjectNewOwner = ADDRESS_ZERO;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Invalid address");
        });
      });

      describe("when the service hasn't been created yet", async () => {
        beforeEach(async () => {
          subjectServiceId = ethers.utils.formatBytes32String("Gucci-Flex-2");
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Caller must be service owner");
        });
      });

      describe("when the caller is not the service owner", async () => {
        beforeEach(async () => {
          subjectCaller = deployAccount;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Caller must be service owner");
        });
      });
    });
  });

  context("when multiple services have been created", async () => {
    const uriDataType = ethers.utils.formatBytes32String("tokenUri");
    const redirectUrlType = ethers.utils.formatBytes32String("redirectUrl");

    const serviceOneId = ethers.utils.formatBytes32String("Gucci-Flex");
    const serviceTwoId = ethers.utils.formatBytes32String("Rainbow-Wallet");
    const serviceThreeId = ethers.utils.formatBytes32String("Ticketing");

    const dummyContent = "//api.gucci.com/tokens/";

    const serviceRecordsOne = createServiceRecords(dummyContent.concat("1/"));
    const serviceRecordsTwo = createServiceRecords(dummyContent.concat("2/"));
    const serviceRecordsThree = createServiceRecords(dummyContent.concat("3/"));

    function createServiceRecords(content: string): ServiceRecord[] {
      return [
        {
          recordType: uriDataType,
          content: ethers.utils.hexlify(Buffer.from(content)),
          appendId: true,
        },
        {
          recordType: redirectUrlType,
          content: ethers.utils.hexlify(Buffer.from(content)),
          appendId: false,
        },
      ];
    }

    beforeEach(async () => {
      await servicesRegistry.connect(owner.wallet).createService(serviceOneId, serviceRecordsOne);
      await servicesRegistry.connect(owner.wallet).createService(serviceTwoId, serviceRecordsTwo);
      await servicesRegistry.connect(owner.wallet).createService(serviceThreeId, serviceRecordsThree);
    });

    describe("#setInitialService", async () => {
      let subjectChipId: Address;
      let subjectServiceId: string;
      let subjectTimelock: BigNumber;

      beforeEach(async () => {
        subjectChipId = chip.address;
        subjectServiceId = serviceOneId;
        subjectTimelock = (await blockchain.getCurrentTimestamp()).add(100);
      });

      async function subject(): Promise<any> {
        return chipRegistry.setInitialService(subjectChipId, subjectServiceId, subjectTimelock);
      }

      it("should create an entry in the chip services mapping with the correct info", async () => {
        await subject();

        const chipServices = await servicesRegistry.chipServices(subjectChipId);
        const chipSecondaryServices = await servicesRegistry.getChipSecondaryServices(subjectChipId);

        expect(chipServices.primaryService).to.eq(subjectServiceId);
        expect(chipServices.serviceTimelock).to.eq(subjectTimelock);
        expect(chipSecondaryServices).to.be.empty;
      });

      it("should emit a PrimaryServiceUpdated event for record one type", async () => {
        await expect(subject()).to.emit(servicesRegistry, "PrimaryServiceUpdated").withArgs(
          subjectChipId,
          subjectServiceId,
          ethers.utils.formatBytes32String(""),
          subjectTimelock
        );
      });

      describe("when the passed timelock is zero", async () => {
        beforeEach(async () => {
          subjectTimelock = ZERO;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Timelock cannot be set to 0");
        });
      });

      describe("when the primary service has already been set", async () => {
        beforeEach(async () => {
          await subject();
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Primary service already set");
        });
      });

      describe("when the service does not exist", async () => {
        beforeEach(async () => {
          subjectServiceId = ethers.utils.formatBytes32String("UnenrolledService");
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Service does not exist");
        });
      });

      describe("when the caller is not the chip registry", async () => {
        async function errorSubject(): Promise<any> {
          return servicesRegistry.connect(owner.wallet).setInitialService(subjectChipId, subjectServiceId, subjectTimelock);
        }

        it("should revert", async () => {
          await expect(errorSubject()).to.be.revertedWith("Caller must be ChipRegistry");
        });
      });
    });

    describe("#addSecondaryService", async () => {
      let subjectChipId: Address;
      let subjectServiceId: string;
      let subjectCommitBlock: BigNumber;
      let subjectSignature: string;
      let subjectCaller: Account;
      let mockChipNode: string;

      let packedMsg: string;

      beforeEach(async () => {
        const primaryService = serviceOneId;
        const initialTimestamp = (await blockchain.getCurrentTimestamp()).add(100);
        mockChipNode = calculateSubnodeHash(`${chip.address}.ProjectY.gucci.ers`);

        await chipRegistry.mockAddChip(chip.address, mockChipNode, owner.address);
        await chipRegistry.setInitialService(
          chip.address,
          primaryService,
          initialTimestamp
        );

        subjectServiceId = serviceTwoId;
        subjectCommitBlock = await blockchain.getLatestBlockNumber();

        packedMsg = ethers.utils.solidityPack(
          ["uint256", "address"],
          [subjectCommitBlock, subjectServiceId]
        );
        subjectSignature = await chip.wallet.signMessage(ethers.utils.arrayify(packedMsg));
        subjectChipId = chip.address;
        subjectCaller = owner;
      });

      async function subject(): Promise<any> {
        return servicesRegistry.connect(subjectCaller.wallet).addSecondaryService(
          subjectChipId,
          subjectServiceId,
          subjectCommitBlock,
          subjectSignature
        );
      }

      it("should add the service to the secondary services array", async () => {
        await subject();

        const chipSecondaryServices = await servicesRegistry.getChipSecondaryServices(chip.address);

        expect(chipSecondaryServices).to.include(subjectServiceId);
        expect(chipSecondaryServices.length).to.eq(1);
      });

      it("should mark the service as an enrolled service for the chip", async () => {
        await subject();

        const isEnrolled = await servicesRegistry.enrolledServices(chip.address, subjectServiceId);

        expect(isEnrolled).to.be.true;
      });

      it("should emit a SecondaryServiceAdded event", async () => {
        await expect(subject()).to.emit(servicesRegistry, "SecondaryServiceAdded").withArgs(
          chip.address,
          subjectServiceId
        );
      });

      describe("when the service has already been added", async () => {
        beforeEach(async () => {
          await subject();
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Service already enrolled");
        });
      });

      describe("when the service is the primary service", async () => {
        beforeEach(async () => {
          subjectServiceId = serviceOneId;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Service already set as primary service");
        });
      });

      describe("when the service does not exist", async () => {
        beforeEach(async () => {
          subjectServiceId = ethers.utils.formatBytes32String("UnenrolledService");
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Service does not exist");
        });
      });

      describe("when the caller is not the owner", async () => {
        beforeEach(async () => {
          subjectCaller = deployAccount;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Caller must be chip owner");
        });
      });

      describe("when the signature isn't valid", async () => {
        beforeEach(async () => {
          subjectSignature = await chipTwo.wallet.signMessage(packedMsg);
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Invalid signature");
        });
      });

      describe("when the signature has expired", async () => {
        beforeEach(async () => {
          await blockchain.waitBlocksAsync(6);
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Signature expired");
        });
      });
    });

    describe("#setNewPrimaryService", async () => {
      let timeJump: number;
      let addingChip: boolean;

      let subjectChipId: Address;
      let subjectServiceId: string;
      let subjectNewTimelock: BigNumber;
      let subjectCommitBlock: BigNumber;
      let subjectSignature: string;
      let subjectCaller: Account;

      let mockChipNode: string;
      let packedMsg: string;

      before(async () => {
        timeJump = 100;
        addingChip = true;
      });

      beforeEach(async () => {
        subjectChipId = chip.address;
        subjectCaller = owner;
        if (addingChip) {
          const primaryService = serviceOneId;
          const initialTimestamp = (await blockchain.getCurrentTimestamp()).add(100);
          mockChipNode = calculateSubnodeHash(`${subjectChipId}.ProjectY.gucci.ers`);

          await chipRegistry.mockAddChip(subjectChipId, mockChipNode, subjectCaller.address);
          await chipRegistry.setInitialService(
            chip.address,
            primaryService,
            initialTimestamp
          );
        }

        await blockchain.increaseTimeAsync(timeJump);
        await blockchain.increaseTimeAsync(timeJump);

        subjectCommitBlock = await blockchain.getLatestBlockNumber();
        subjectServiceId = serviceTwoId;
        subjectNewTimelock = (await blockchain.getCurrentTimestamp()).add(100);

        packedMsg = ethers.utils.solidityPack(
          ["uint256", "address", "uint256"],
          [subjectCommitBlock, subjectServiceId, subjectNewTimelock]
        );
        subjectSignature = await chip.wallet.signMessage(ethers.utils.arrayify(packedMsg));
      });

      async function subject(): Promise<any> {
        return servicesRegistry.connect(subjectCaller.wallet).setNewPrimaryService(
          subjectChipId,
          subjectServiceId,
          subjectNewTimelock,
          subjectCommitBlock,
          subjectSignature
        );
      }

      it("should set the new primary service and it's new timestamp", async () => {
        await subject();

        const chipServices = await servicesRegistry.chipServices(chip.address);

        expect(chipServices.primaryService).to.eq(subjectServiceId);
        expect(chipServices.serviceTimelock).to.eq(subjectNewTimelock);
      });

      it("should emit a PrimaryServiceUpdated event", async () => {
        await expect(subject()).to.emit(servicesRegistry, "PrimaryServiceUpdated").withArgs(
          chip.address,
          subjectServiceId,
          serviceOneId,
          subjectNewTimelock
        );
      });

      describe("when the service is a secondary service", async () => {
        beforeEach(async () => {
          const commitBlock = await blockchain.getLatestBlockNumber();

          const addServicePackedMsg = ethers.utils.solidityPack(
            ["uint256", "address"],
            [commitBlock, subjectServiceId]
          );
          const signature = await chip.wallet.signMessage(ethers.utils.arrayify(addServicePackedMsg));
          await servicesRegistry.connect(subjectCaller.wallet).addSecondaryService(
            subjectChipId,
            subjectServiceId,
            commitBlock,
            signature
          );
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Primary service cannot be secondary service");
        });
      });

      describe("when the service is already the primary service", async () => {
        beforeEach(async () => {
          subjectServiceId = serviceOneId;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Service already set as primary service");
        });
      });

      describe("when the new timelock is not greater than the current timestamp", async () => {
        beforeEach(async () => {
          subjectNewTimelock = (await blockchain.getCurrentTimestamp()).sub(100);
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Timelock must be greater than current timestamp");
        });
      });

      describe("when the primary service timelock hasn't passed", async () => {
        before(async () => {
          timeJump = 0;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Timelock has not expired");
        });

        after(async () => {
          timeJump = 100;
        });
      });

      describe("when the service does not exist", async () => {
        beforeEach(async () => {
          subjectServiceId = ethers.utils.formatBytes32String("UnenrolledService");
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Service does not exist");
        });
      });

      describe("when the caller is not the owner", async () => {
        beforeEach(async () => {
          subjectCaller = deployAccount;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Caller must be chip owner");
        });
      });

      describe("when the signature isn't valid", async () => {
        beforeEach(async () => {
          subjectSignature = await chipTwo.wallet.signMessage(packedMsg);
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Invalid signature");
        });
      });

      describe("when the signature has expired", async () => {
        beforeEach(async () => {
          await blockchain.waitBlocksAsync(6);
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Signature expired");
        });
      });

      describe("when chip has not been added and primaryService not set", async () => {
        before(async () => {
          addingChip = false;
        });

        after(async () => {
          addingChip = true;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Chip not added");
        });
      });
    });

    describe("#removeSecondaryService", async () => {
      let subjectChipId: Address;
      let subjectServiceId: string;
      let subjectCommitBlock: BigNumber;
      let subjectSignature: string;
      let subjectCaller: Account;

      let mockChipNode: string;
      let packedMsg: string;

      beforeEach(async () => {
        subjectChipId = chip.address;
        subjectCaller = owner;

        const primaryService = serviceOneId;
        const initialTimestamp = (await blockchain.getCurrentTimestamp()).add(100);
        mockChipNode = calculateSubnodeHash(`${subjectChipId}.ProjectY.gucci.ers`);

        await chipRegistry.mockAddChip(subjectChipId, mockChipNode, owner.address);
        await chipRegistry.setInitialService(
          subjectChipId,
          primaryService,
          initialTimestamp
        );

        subjectServiceId = serviceTwoId;
        subjectCommitBlock = await blockchain.getLatestBlockNumber();

        packedMsg = ethers.utils.solidityPack(
          ["uint256", "address"],
          [subjectCommitBlock, subjectServiceId]
        );
        subjectSignature = await chip.wallet.signMessage(ethers.utils.arrayify(packedMsg));

        await servicesRegistry.connect(subjectCaller.wallet).addSecondaryService(
          subjectChipId,
          subjectServiceId,
          subjectCommitBlock,
          subjectSignature
        );
      });

      async function subject(): Promise<any> {
        return servicesRegistry.connect(subjectCaller.wallet).removeSecondaryService(
          subjectChipId,
          subjectServiceId,
          subjectCommitBlock,
          subjectSignature
        );
      }

      it("should add the service to the secondary services array", async () => {
        const preChipSecondaryServices = await servicesRegistry.getChipSecondaryServices(chip.address);

        expect(preChipSecondaryServices).to.include(subjectServiceId);
        expect(preChipSecondaryServices.length).to.eq(1);

        await subject();

        const postChipSecondaryServices = await servicesRegistry.getChipSecondaryServices(chip.address);

        expect(postChipSecondaryServices).to.not.include(subjectServiceId);
        expect(postChipSecondaryServices.length).to.eq(0);
      });

      it("should mark the service as an enrolled service for the chip", async () => {
        const preIsEnrolled = await servicesRegistry.enrolledServices(chip.address, subjectServiceId);
        expect(preIsEnrolled).to.be.true;

        await subject();

        const postIsEnrolled = await servicesRegistry.enrolledServices(chip.address, subjectServiceId);

        expect(postIsEnrolled).to.be.false;
      });

      it("should emit a SecondaryServiceRemoved event", async () => {
        await expect(subject()).to.emit(servicesRegistry, "SecondaryServiceRemoved").withArgs(
          chip.address,
          subjectServiceId
        );
      });

      describe("when the service has not been added", async () => {
        beforeEach(async () => {
          await subject();
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Service not enrolled");
        });
      });

      describe("when the service does not exist", async () => {
        beforeEach(async () => {
          subjectServiceId = ethers.utils.formatBytes32String("UnenrolledService");
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Service does not exist");
        });
      });

      describe("when the chip has not been claimed", async () => {
        beforeEach(async () => {
          subjectCaller = deployAccount;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Caller must be chip owner");
        });
      });

      describe("when the signature isn't valid", async () => {
        beforeEach(async () => {
          subjectSignature = await chipTwo.wallet.signMessage(packedMsg);
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Invalid signature");
        });
      });

      describe("when the signature has expired", async () => {
        beforeEach(async () => {
          await blockchain.waitBlocksAsync(6);
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Signature expired");
        });
      });
    });

    describe("#getPrimaryServiceContentByRecordtype", async () => {
      let subjectChipId: Address;
      let subjectRecordtype: string;

      beforeEach(async() => {
        await chipRegistry.setInitialService(
          chip.address,
          serviceOneId,
          (await blockchain.getCurrentTimestamp()).add(100)
        );

        subjectChipId = chip.address;
        subjectRecordtype = uriDataType;
      });

      async function subject(): Promise<any> {
        return servicesRegistry.getPrimaryServiceContentByRecordtype(subjectChipId, subjectRecordtype);
      }

      it("should return the correct content", async () => {
        const content = await subject();

        const contentString = ethers.utils.toUtf8String(ethers.utils.hexlify(content));
        expect(contentString).to.eq(dummyContent + "1/" + subjectChipId.toLowerCase());
      });

      describe("when the chipId should not be concatenated", async () => {
        beforeEach(async() => {
          subjectRecordtype = redirectUrlType;
        });

        it("should return the correct content", async () => {
          const content = await subject();

          const contentString = ethers.utils.toUtf8String(ethers.utils.hexlify(content));
          expect(contentString).to.eq(dummyContent + "1/");
        });
      });
    });

    describe("#getServiceContent", async () => {
      let subjectChipId: Address;
      let subjectServiceId: string;

      beforeEach(async() => {
        subjectChipId = chip.address;
        subjectServiceId = serviceTwoId;
      });

      async function subject(): Promise<any> {
        return servicesRegistry.getServiceContent(subjectChipId, subjectServiceId);
      }

      it("should return the correct content", async () => {
        const records: ServiceRecord[] = await subject();

        const bytesChipId = ethers.utils.hexlify(Buffer.from(subjectChipId.toLowerCase())).slice(2);
        expect(records[0].recordType).to.eq(uriDataType);
        expect(records[0].content).to.eq(serviceRecordsTwo[0].content.concat(bytesChipId));
        expect(records[1].recordType).to.eq(redirectUrlType);
        expect(records[1].content).to.eq(serviceRecordsTwo[1].content);
      });
    });

    describe("#getPrimaryServiceRecords", async () => {
      let subjectChipId: Address;
      let mockChipNode: string;

      beforeEach(async() => {
        subjectChipId = chip.address;

        const serviceTimelock = (await blockchain.getCurrentTimestamp()).add(100);
        mockChipNode = calculateSubnodeHash(`${subjectChipId}.ProjectY.gucci.ers`);

        await chipRegistry.mockAddChip(chip.address, mockChipNode, owner.address);
        await chipRegistry.setInitialService(
          subjectChipId,
          serviceOneId,
          serviceTimelock
        );
      });

      async function subject(): Promise<any> {
        return servicesRegistry.getPrimaryServiceContent(subjectChipId);
      }

      it("should return the correct content", async () => {
        const records: ServiceRecord[] = await subject();

        const bytesChipId = ethers.utils.hexlify(Buffer.from(subjectChipId.toLowerCase())).slice(2);
        expect(records[0].recordType).to.eq(uriDataType);
        expect(records[0].content).to.eq(serviceRecordsOne[0].content.concat(bytesChipId));
        expect(records[1].recordType).to.eq(redirectUrlType);
        expect(records[1].content).to.eq(serviceRecordsOne[1].content);
      });
    });

    describe("#getAllChipServiceData", async () => {
      let subjectChipId: Address;

      let serviceTimelock: BigNumber;
      let mockChipNode: string;

      beforeEach(async() => {
        subjectChipId = chip.address;

        serviceTimelock = (await blockchain.getCurrentTimestamp()).add(100);
        mockChipNode = calculateSubnodeHash(`${subjectChipId}.ProjectY.gucci.ers`);

        await chipRegistry.mockAddChip(chip.address, mockChipNode, owner.address);
        await chipRegistry.setInitialService(
          subjectChipId,
          serviceOneId,
          serviceTimelock
        );

        const commitBlock = await blockchain.getLatestBlockNumber();
        const firstServiceId = serviceTwoId;
        const secondServiceId = serviceThreeId;

        const firstPackedMsg = ethers.utils.solidityPack(
          ["uint256", "address"],
          [commitBlock, firstServiceId]
        );
        const secondPackedMsg = ethers.utils.solidityPack(
          ["uint256", "address"],
          [commitBlock, secondServiceId]
        );
        const firstSignature = await chip.wallet.signMessage(ethers.utils.arrayify(firstPackedMsg));
        const secondSignature = await chip.wallet.signMessage(ethers.utils.arrayify(secondPackedMsg));

        await servicesRegistry.connect(owner.wallet).addSecondaryService(subjectChipId, firstServiceId, commitBlock, firstSignature);
        await servicesRegistry.connect(owner.wallet).addSecondaryService(subjectChipId, secondServiceId, commitBlock, secondSignature);
      });

      async function subject(): Promise<any> {
        return servicesRegistry.getAllChipServiceData(subjectChipId);
      }

      it("should return the correct content", async () => {
        const content: ExpandedChipService = await subject();

        const primaryService: Service = content.primaryService;
        const secondaryServiceOne: Service = content.secondaryServices[0];
        const secondaryServiceTwo: Service = content.secondaryServices[1];

        expect(primaryService.serviceId).to.eq(serviceOneId);
        expect(secondaryServiceOne.serviceId).to.eq(serviceTwoId);
        expect(secondaryServiceTwo.serviceId).to.eq(serviceThreeId);
        expect(content.serviceTimelock).to.eq(serviceTimelock);

        const bytesChipId = ethers.utils.hexlify(Buffer.from(subjectChipId.toLowerCase())).slice(2);
        expect(primaryService.records[0].recordType).to.eq(uriDataType);
        expect(primaryService.records[0].content).to.eq(serviceRecordsOne[0].content.concat(bytesChipId));
        expect(secondaryServiceOne.records[0].recordType).to.eq(uriDataType);
        expect(secondaryServiceOne.records[0].content).to.eq(serviceRecordsTwo[0].content.concat(bytesChipId));
        expect(secondaryServiceTwo.records[0].recordType).to.eq(uriDataType);
        expect(secondaryServiceTwo.records[0].content).to.eq(serviceRecordsThree[0].content.concat(bytesChipId));

        expect(primaryService.records[1].recordType).to.eq(redirectUrlType);
        expect(primaryService.records[1].content).to.eq(serviceRecordsOne[1].content);
        expect(secondaryServiceOne.records[1].recordType).to.eq(redirectUrlType);
        expect(secondaryServiceOne.records[1].content).to.eq(serviceRecordsTwo[1].content);
        expect(secondaryServiceTwo.records[1].recordType).to.eq(redirectUrlType);
        expect(secondaryServiceTwo.records[1].content).to.eq(serviceRecordsThree[1].content);
      });
    });
  });
});
