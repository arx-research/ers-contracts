import "module-alias/register";

import { ethers } from "ethers";

import { Address } from "@utils/types";
import { Account } from "@utils/test/types";
import { ERSRegistry } from "@utils/contracts";
import DeployHelper from "@utils/deploys";

import {
  addSnapshotBeforeRestoreAfterEach,
  getWaffleExpect,
  getAccounts
} from "@utils/test/index";

import {
  calculateLabelHash,
  calculateSubnodeHash
} from "../utils/protocolUtils";
import { ADDRESS_ZERO } from "@utils/constants";

const expect = getWaffleExpect();

describe("ERSRegistry", () => {
  let owner: Account;
  let nodeOwner: Account;
  let newOwner: Account;
  let resolver: Account;

  let chipRegistry: Account;
  let developerRegistry: Account;
  let ersRegistry: ERSRegistry;
  let deployer: DeployHelper;
  const NULL_NODE = ethers.utils.formatBytes32String("");

  beforeEach(async () => {
    [
      owner,
      nodeOwner,
      newOwner,
      resolver,
      chipRegistry,
      developerRegistry,
    ] = await getAccounts();

    deployer = new DeployHelper(owner.wallet);

    ersRegistry = await deployer.deployERSRegistry(chipRegistry.address, developerRegistry.address);
  });

  addSnapshotBeforeRestoreAfterEach();

  describe("#constructor", async () => {
    it("should set the zero node to the DeveloperRegistry and contract state variables", async () => {
      const actualOwner = await ersRegistry.getOwner(NULL_NODE);
      const actualDeveloperRegistry = await ersRegistry.developerRegistry();
      const actualChipRegistry = await ersRegistry.chipRegistry();

      expect(actualOwner).to.eq(owner.address);
      expect(actualDeveloperRegistry).to.eq(developerRegistry.address);
      expect(actualChipRegistry).to.eq(chipRegistry.address);
    });
  });

  describe("#createChipRegistrySubnodeRecord", async () => {
    let subjectNode: string;
    let subjectNameHash: string;
    let subjectOwner: Address;
    let subjectResolver: Address;
    let subjectCaller: Account;

    beforeEach(async () => {
      subjectNode = NULL_NODE;
      subjectNameHash = calculateLabelHash("ers");
      subjectOwner = owner.address;
      subjectResolver = resolver.address;
      subjectCaller = chipRegistry;
    });

    async function subject(): Promise<any> {
      return await ersRegistry.connect(subjectCaller.wallet).createChipRegistrySubnodeRecord(subjectNode, subjectNameHash, subjectOwner, subjectResolver);
    }

    it("should set the record", async () => {
      await subject();

      const subnodeHash = calculateSubnodeHash("ers");
      const actualOwner = await ersRegistry.getOwner(subnodeHash);
      const actualResolver = await ersRegistry.getResolver(subnodeHash);
      expect(actualOwner).to.eq(subjectOwner);
      expect(actualResolver).to.eq(subjectResolver);
    });

    it("should emit the correct NewOwner event", async () => {
      await expect(subject()).to.emit(ersRegistry, "NewOwner").withArgs(
        subjectNode,
        calculateSubnodeHash("ers"),
        subjectNameHash,
        subjectOwner
      );
    });

    it("should emit the correct NewResolver event", async () => {
      await expect(subject()).to.emit(ersRegistry, "NewResolver").withArgs(
        calculateSubnodeHash("ers"),
        subjectResolver
      );
    });

    describe("when the owner is the zero address", async () => {
      beforeEach(async () => {
        subjectOwner = ADDRESS_ZERO;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("New owner cannot be null address");
      });
    });

    describe("when the subnode has already been created", async () => {
      beforeEach(async () => {
        await subject();
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Subnode already exists");
      });
    });

    describe("when the caller is not the node owner", async () => {
      beforeEach(async () => {
        subjectCaller = developerRegistry;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Caller must be ChipRegistry");
      });
    });
  });

  describe("#deleteChipRegistrySubnodeRecord", async () => {
    let subjectNode: string;
    let subjectNameHash: string;
    let subjectCaller: Account;

    beforeEach(async () => {
      await ersRegistry.connect(owner.wallet).createSubnodeRecord(
        NULL_NODE,
        calculateLabelHash("ers"),
        developerRegistry.address,
        resolver.address
      );

      subjectNode = calculateSubnodeHash("ers");
      subjectNameHash = calculateLabelHash("developer");
      subjectCaller = chipRegistry;

      await ersRegistry.connect(developerRegistry.wallet).createSubnodeRecord(
        subjectNode,
        subjectNameHash,
        owner.address,
        resolver.address
      );
    });

    async function subject(): Promise<any> {
      return await ersRegistry.connect(subjectCaller.wallet).deleteChipRegistrySubnodeRecord(subjectNode, subjectNameHash);
    }

    it("should set the record", async () => {
      const subnodeHash = calculateSubnodeHash("developer.ers");
      const preActualOwner = await ersRegistry.getOwner(subnodeHash);
      const preActualResolver = await ersRegistry.getResolver(subnodeHash);
      expect(preActualOwner).to.not.eq(ADDRESS_ZERO);
      expect(preActualResolver).to.not.eq(ADDRESS_ZERO);

      await subject();

      const actualOwner = await ersRegistry.getOwner(subnodeHash);
      const actualResolver = await ersRegistry.getResolver(subnodeHash);
      expect(actualOwner).to.eq(ADDRESS_ZERO);
      expect(actualResolver).to.eq(ADDRESS_ZERO);
    });

    it("should emit the correct NewOwner event", async () => {
      await expect(subject()).to.emit(ersRegistry, "NewOwner").withArgs(
        subjectNode,
        calculateSubnodeHash("developer.ers"),
        subjectNameHash,
        ADDRESS_ZERO
      );
    });

    it("should emit the correct NewResolver event", async () => {
      await expect(subject()).to.emit(ersRegistry, "NewResolver").withArgs(
        calculateSubnodeHash("developer.ers"),
        ADDRESS_ZERO
      );
    });

    describe("when the subnode has not been created", async () => {
      beforeEach(async () => {
        subjectNameHash = calculateLabelHash("new");
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Subnode does not exist");
      });
    });

    describe("when the caller is not the ChipRegistry", async () => {
      beforeEach(async () => {
        subjectCaller = owner;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Caller must be ChipRegistry");
      });
    });
  });

  describe("#createSubnodeRecord", async () => {
    let subjectNode: string;
    let subjectNameHash: string;
    let subjectOwner: Address;
    let subjectResolver: Address;
    let subjectCaller: Account;

    beforeEach(async () => {
      subjectNode = NULL_NODE;
      subjectNameHash = calculateLabelHash("ers");
      subjectOwner = developerRegistry.address;
      subjectResolver = resolver.address;
      subjectCaller = owner;
    });

    async function subject(): Promise<any> {
      return await ersRegistry.connect(subjectCaller.wallet).createSubnodeRecord(subjectNode, subjectNameHash, subjectOwner, subjectResolver);
    }

    it("should set the record", async () => {
      await subject();

      const subnodeHash = calculateSubnodeHash("ers");
      const actualOwner = await ersRegistry.getOwner(subnodeHash);
      const actualResolver = await ersRegistry.getResolver(subnodeHash);
      expect(actualOwner).to.eq(subjectOwner);
      expect(actualResolver).to.eq(subjectResolver);
    });

    it("should emit the correct NewOwner event", async () => {
      await expect(subject()).to.emit(ersRegistry, "NewOwner").withArgs(
        subjectNode,
        calculateSubnodeHash("ers"),
        subjectNameHash,
        subjectOwner
      );
    });

    it("should emit the correct NewResolver event", async () => {
      await expect(subject()).to.emit(ersRegistry, "NewResolver").withArgs(
        calculateSubnodeHash("ers"),
        subjectResolver
      );
    });

    describe("when the caller is the DeveloperRegistry", async () => {
      beforeEach(async () => {
        await subject();

        subjectNode = calculateSubnodeHash("ers");
        subjectNameHash = calculateLabelHash("developer");
        subjectOwner = owner.address;
        subjectResolver = resolver.address;
        subjectCaller = developerRegistry;
      });

      it("should set the record", async () => {
        await subject();

        const subnodeHash = calculateSubnodeHash("developer.ers");
        const actualOwner = await ersRegistry.getOwner(subnodeHash);
        const actualResolver = await ersRegistry.getResolver(subnodeHash);
        expect(actualOwner).to.eq(subjectOwner);
        expect(actualResolver).to.eq(subjectResolver);
      });
    });

    describe("when the owner is the zero address", async () => {
      beforeEach(async () => {
        subjectOwner = ADDRESS_ZERO;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("New owner cannot be null address");
      });
    });

    describe("when the subnode has already been created", async () => {
      beforeEach(async () => {
        await subject();
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Subnode already exists");
      });
    });

    describe("when the caller is not the node owner", async () => {
      beforeEach(async () => {
        subjectCaller = developerRegistry;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Must be node owner");
      });
    });
  });

  describe("#deleteSubnodeRecord", async () => {
    let subjectNode: string;
    let subjectNameHash: string;
    let subjectCaller: Account;

    beforeEach(async () => {
      await ersRegistry.connect(owner.wallet).createSubnodeRecord(
        NULL_NODE,
        calculateLabelHash("ers"),
        developerRegistry.address,
        resolver.address
      );

      subjectNode = calculateSubnodeHash("ers");
      subjectNameHash = calculateLabelHash("developer");
      subjectCaller = developerRegistry;

      await ersRegistry.connect(developerRegistry.wallet).createSubnodeRecord(
        subjectNode,
        subjectNameHash,
        owner.address,
        resolver.address
      );
    });

    async function subject(): Promise<any> {
      return await ersRegistry.connect(subjectCaller.wallet).deleteSubnodeRecord(subjectNode, subjectNameHash);
    }

    it("should set the record", async () => {
      const subnodeHash = calculateSubnodeHash("developer.ers");
      const preActualOwner = await ersRegistry.getOwner(subnodeHash);
      const preActualResolver = await ersRegistry.getResolver(subnodeHash);
      expect(preActualOwner).to.not.eq(ADDRESS_ZERO);
      expect(preActualResolver).to.not.eq(ADDRESS_ZERO);

      await subject();

      const actualOwner = await ersRegistry.getOwner(subnodeHash);
      const actualResolver = await ersRegistry.getResolver(subnodeHash);
      expect(actualOwner).to.eq(ADDRESS_ZERO);
      expect(actualResolver).to.eq(ADDRESS_ZERO);
    });

    it("should emit the correct NewOwner event", async () => {
      await expect(subject()).to.emit(ersRegistry, "NewOwner").withArgs(
        subjectNode,
        calculateSubnodeHash("developer.ers"),
        subjectNameHash,
        ADDRESS_ZERO
      );
    });

    it("should emit the correct NewResolver event", async () => {
      await expect(subject()).to.emit(ersRegistry, "NewResolver").withArgs(
        calculateSubnodeHash("developer.ers"),
        ADDRESS_ZERO
      );
    });

    describe("when the subnode has not been created", async () => {
      beforeEach(async () => {
        subjectNameHash = calculateLabelHash("new");
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Subnode does not exist");
      });
    });

    describe("when the caller is not the DeveloperRegistry", async () => {
      beforeEach(async () => {
        subjectNode = NULL_NODE;
        subjectNameHash = calculateLabelHash("ers");
        subjectCaller = owner;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Caller must be DeveloperRegistry");
      });
    });

    describe("when the caller is the DeveloperRegistry but the DeveloperRegistry is not the node owner (this shouldn't happen)", async () => {
      beforeEach(async () => {
        const nodeHash = calculateSubnodeHash("developer.ers");
        await ersRegistry.connect(owner.wallet).createSubnodeRecord(nodeHash, subjectNameHash, owner.address, resolver.address);
        subjectNode = nodeHash;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Must be node owner");
      });
    });
  });

  describe("#setNodeOwner", async () => {
    let subjectNode: string;
    let subjectNewOwner: Address;
    let subjectCaller: Account;

    beforeEach(async () => {
      await ersRegistry.connect(owner.wallet).createSubnodeRecord(
        NULL_NODE,
        calculateLabelHash("ers"),
        nodeOwner.address,
        resolver.address
      );

      subjectNode = calculateSubnodeHash("ers");
      subjectNewOwner = newOwner.address;
      subjectCaller = chipRegistry;
    });

    async function subject(): Promise<any> {
      return await ersRegistry.connect(subjectCaller.wallet).setNodeOwner(subjectNode, subjectNewOwner);
    }

    it("should set the record", async () => {
      await subject();

      const actualOwner = await ersRegistry.getOwner(subjectNode);
      expect(actualOwner).to.eq(subjectNewOwner);
    });

    it("should emit the correct Transfer event", async () => {
      await expect(subject()).to.emit(ersRegistry, "Transfer").withArgs(
        subjectNode,
        subjectNewOwner
      );
    });

    describe("when the node is the NULL_NODE", async () => {
      beforeEach(async () => {
        subjectNode = NULL_NODE;
        subjectCaller = owner;
      });

      it("should set the record", async () => {
        await subject();

        const actualOwner = await ersRegistry.getOwner(subjectNode);
        expect(actualOwner).to.eq(subjectNewOwner);
      });

      it("should emit the correct Transfer event", async () => {
        await expect(subject()).to.emit(ersRegistry, "Transfer").withArgs(
          subjectNode,
          subjectNewOwner
        );
      });

      describe("but the caller is not the owner", async () => {
        beforeEach(async () => {
          subjectCaller = nodeOwner;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Caller must be ChipRegistry or owner of node");
        });
      });
    });

    describe("when the node has not been created", async () => {
      beforeEach(async () => {
        subjectNode = calculateSubnodeHash("test");
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Node does not exist");
      });
    });

    describe("when the new owner is the zero address", async () => {
      beforeEach(async () => {
        subjectNewOwner = ADDRESS_ZERO;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("New owner cannot be null address");
      });
    });

    describe("when the caller is not the ChipRegistry", async () => {
      beforeEach(async () => {
        subjectCaller = developerRegistry;
      });

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Caller must be ChipRegistry or owner of node");
      });
    });
  });

  describe("#getOwner", async () => {
    let subjectNode: string;
    let outputNode: string;

    beforeEach(async () => {
      subjectNode = NULL_NODE;

      await ersRegistry.connect(owner.wallet).createSubnodeRecord(
        subjectNode,
        calculateLabelHash("ers"),
        owner.address,
        resolver.address
      );

      outputNode = calculateSubnodeHash("ers");
    });

    async function subject(): Promise<any> {
      return await ersRegistry.getOwner(subjectNode);
    }

    it("should return the correct owner", async () => {
      await subject();

      const actualOwner = await ersRegistry.getOwner(outputNode);
      expect(actualOwner).to.eq(owner.address);
    });
  });
});
