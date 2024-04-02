import "module-alias/register";

import { ethers, network } from "hardhat";
import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import {
  Address,
} from "@utils/types";
import {
  AccountMock,
  ChipPBTMock,
  TransferPolicyMock,
  InterfaceIdGetterMock
} from "@utils/contracts";
import { ADDRESS_ZERO, ONE } from "@utils/constants";
import DeployHelper from "@utils/deploys";

import { Blockchain } from "@utils/common";

import {
  Account,
  getWaffleExpect,
  getAccounts
} from "@utils/test/index";

const expect = getWaffleExpect();

describe("ChipPBT", () => {
  let owner: Account;
  let newOwner: Account;
  let chipOne: Account;
  let chipTwo: Account;
  let transferPolicy: TransferPolicyMock;
  let transferPolicyTwo: Account;
  let accountMock: AccountMock;
  let ChipPBT: ChipPBTMock;

  let deployer: DeployHelper;
  let blockchain: Blockchain;

  const name = "Ethereum Reality Service PBT";
  const symbol = "ERSPBT";
  const maxBlockWindow = BigNumber.from(5);
  const baseTokenURI = "https://www.claim.com/";
  blockchain = new Blockchain(ethers.provider);

  beforeEach(async () => {
    [
      owner,
      newOwner,
      chipOne,
      chipTwo,
      transferPolicyTwo,
    ] = await getAccounts();

    deployer = new DeployHelper(owner.wallet);

    ChipPBT = await deployer.mocks.deployChipPBTMock(name, symbol, maxBlockWindow, baseTokenURI);

    accountMock = await deployer.mocks.deployAccountMock(chipOne.address, ChipPBT.address);
    transferPolicy = await deployer.mocks.deployTransferPolicyMock();
  });

  describe("#constructor", async () => {
    it("should set the correct token name", async () => {
      const actualName = await ChipPBT.name();
      expect(actualName).to.eq(name);
    });

    it("should set the correct token symbol", async () => {
      const actualSymbol = await ChipPBT.symbol();
      expect(actualSymbol).to.eq(symbol);
    });

    // it("should set the tokenId counter to 1", async () => {
    //   const actualTokenIdCounter = await ChipPBT.tokenIdCounter();
    //   expect(actualTokenIdCounter).to.eq(ONE);
    // });
  });

  describe("#isChipSignatureForToken", async () => {
    let subjectChipId: Address;
    let subjectPayload: string;
    let subjectChipSignature: string;

    beforeEach(async () => {
      subjectChipId = chipOne.address;
      subjectPayload = ethers.utils.hashMessage("random message");
      subjectChipSignature = await chipOne.wallet.signMessage(ethers.utils.arrayify(subjectPayload));
    });

    async function subject(): Promise<any> {
      return ChipPBT.isChipSignatureForToken(subjectChipId, subjectPayload, subjectChipSignature);
    }

    it("should return true", async () => {
      const actualResult = await subject();
      expect(actualResult).to.be.true;
    });

    describe("when the chip address is not an EOA but an account contract", async () => {
      beforeEach(async () => {
        subjectChipId = accountMock.address;
      });

      it("should return true", async () => {
        const actualResult = await subject();
        expect(actualResult).to.be.true;
      });
    });

    describe("when the signature isn't valid", async () => {
      beforeEach(async () => {
        subjectChipSignature = await chipTwo.wallet.signMessage("random message");
      });

      it("should return false", async () => {
        const actualResult = await subject();
        expect(actualResult).to.be.false;
      });
    });
  });

  describe("#supportsInterface", async () => {
    let interfaceIdMock: InterfaceIdGetterMock;
    let subjectInterfaceId: string;

    beforeEach(async () => {
      interfaceIdMock = await deployer.mocks.deployInterfaceIdGetterMock();
      subjectInterfaceId = await interfaceIdMock.getERC721InterfaceId();
    });

    async function subject(): Promise<any> {
      return ChipPBT.supportsInterface(subjectInterfaceId);
    }

    it("should return true for ERC721 interface", async () => {
      const actualResult = await subject();
      expect(actualResult).to.be.true;
    });

    describe("when the interface is IERC165", async () => {
      beforeEach(async () => {
        subjectInterfaceId = await interfaceIdMock.getERC165InterfaceId();
      });

      it("should return true for IERC165 interface", async () => {
        const actualResult = await subject();
        expect(actualResult).to.be.true;
      });
    });

    describe("when the interface is IERC721Metadata", async () => {
      beforeEach(async () => {
        subjectInterfaceId = await interfaceIdMock.getERC721MetadataInterfaceId();
      });

      it("should return true for IERC721Metadata interface", async () => {
        const actualResult = await subject();
        expect(actualResult).to.be.true;
      });
    });

    describe("when the interface is IPBT", async () => {
      beforeEach(async () => {
        subjectInterfaceId = await interfaceIdMock.getPBTInterfaceId();
      });

      it("should return true for IPBT interface", async () => {
        const actualResult = await subject();
        expect(actualResult).to.be.true;
      });
    });

    describe("when the interface isn't supported", async () => {
      beforeEach(async () => {
        subjectInterfaceId = await interfaceIdMock.getChipRegistryInterfaceId();
      });

      it("should return false for unsupported interface", async () => {
        const actualResult = await subject();
        expect(actualResult).to.be.false;
      });
    });
  });

  describe("#approve", async () => {
    let subjectTo: Address;
    let subjectTokenId: BigNumber;

    beforeEach(async () => {
      subjectTo = newOwner.address;
      subjectTokenId = ONE;
    });

    async function subject(): Promise<any> {
      return ChipPBT.connect(owner.wallet).approve(subjectTo, subjectTokenId);
    }

    it("should revert", async () => {
      await expect(subject()).to.be.revertedWith("ERC721 public approve not allowed");
    });
  });

  describe("#setApprovalForAll", async () => {
    let subjectOperator: Address;
    let subjectApproved: boolean;

    beforeEach(async () => {
      subjectOperator = newOwner.address;
      subjectApproved = true;
    });

    async function subject(): Promise<any> {
      return ChipPBT.connect(owner.wallet).setApprovalForAll(subjectOperator, subjectApproved);
    }

    it("should revert", async () => {
      await expect(subject()).to.be.revertedWith("ERC721 public setApprovalForAll not allowed");
    });
  });

  describe("#transferFrom", async () => {
    let subjectFrom: Address;
    let subjectTo: Address;
    let subjectTokenId: BigNumber;

    beforeEach(async () => {
      subjectFrom = owner.address;
      subjectTo = newOwner.address;
      subjectTokenId = ONE;
    });

    async function subject(): Promise<any> {
      return ChipPBT.connect(owner.wallet).transferFrom(subjectFrom, subjectTo, subjectTokenId);
    }

    it("should revert", async () => {
      await expect(subject()).to.be.revertedWith("ERC721 public transferFrom not allowed");
    });
  });

  describe("#safeTransferFrom", async () => {
    let subjectFrom: Address;
    let subjectTo: Address;
    let subjectTokenId: BigNumber;

    beforeEach(async () => {
      subjectFrom = owner.address;
      subjectTo = newOwner.address;
      subjectTokenId = ONE;
    });

    async function subject(): Promise<any> {
      return ChipPBT.connect(owner.wallet).functions["safeTransferFrom(address,address,uint256)"](
        subjectFrom,
        subjectTo,
        subjectTokenId
      );
    }

    it("should revert", async () => {
      await expect(subject()).to.be.revertedWith("ERC721 public safeTransferFrom not allowed");
    });
  });

  describe("#safeTransferFrom (with data)", async () => {
    let subjectFrom: Address;
    let subjectTo: Address;
    let subjectTokenId: BigNumber;
    let subjectData: string;

    beforeEach(async () => {
      subjectFrom = owner.address;
      subjectTo = newOwner.address;
      subjectTokenId = ONE;
      subjectData = "0x";
    });

    async function subject(): Promise<any> {
      return ChipPBT.connect(owner.wallet).functions["safeTransferFrom(address,address,uint256,bytes)"](
        subjectFrom,
        subjectTo,
        subjectTokenId,
        subjectData
      );
    }

    it("should revert", async () => {
      await expect(subject()).to.be.revertedWith("ERC721 public safeTransferFrom not allowed");
    });
  });

  describe("#_mint", async () => {
    let subjectTo: Address;
    let subjectChipId: Address;
    // let subjectChipInfo: ChipPBTChipInfo;

    beforeEach(async () => {
      subjectTo = owner.address;
      subjectChipId = chipOne.address;
      // subjectChipInfo = {
      //   tokenId: ONE,
      //   transferPolicy: transferPolicy.address,
      //   tokenUri: "https://www.ethereumrealityservice.com",
      //   tokenData: ethers.utils.solidityPack(['uint256'], [ONE]),
      // };
    });

    async function subject(): Promise<any> {
      return ChipPBT.connect(owner.wallet).testMint(subjectTo, subjectChipId, transferPolicy.address);
    }

    // it("should claim the chip and set chip table state", async () => {
    //   const tokenIdCounter = await ChipPBT.tokenIdCounter();

    //   await subject();

    //   const actualChipInfo = await ChipPBT.chipTable(chipOne.address);

    //   expect(actualChipInfo.tokenData).to.eq(subjectChipInfo.tokenData);
    //   expect(actualChipInfo.tokenId).to.eq(tokenIdCounter);
    //   expect(actualChipInfo.transferPolicy).to.eq(subjectChipInfo.transferPolicy);
    //   expect(actualChipInfo.tokenUri).to.eq(subjectChipInfo.tokenUri);
    // });

    it("should mint the token to the correct address and update owner balances", async () => {
      await subject();

      const actualOwner = (await ChipPBT.functions["ownerOf(uint256)"](subjectChipId))[0];
      const actualOwnerBalance = await ChipPBT.balanceOf(subjectTo);
      expect(actualOwner).to.eq(subjectTo);
      expect(actualOwnerBalance).to.eq(subjectChipId);
    });

    // it("should map the token id to the chip id", async () => {
    //   await subject();

    //   const actualChipId = await ChipPBT.tokenIdToChipId(ONE);
    //   expect(actualChipId).to.eq(subjectChipId);
    // });

    // it("should increment the token id counter", async () => {
    //   const initialTokenIdCounter = await ChipPBT.tokenIdCounter();

    //   await subject();

    //   const newTokenIdCounter = await ChipPBT.tokenIdCounter();
    //   expect(newTokenIdCounter).to.eq(initialTokenIdCounter.add(ONE));
    // });

    it("should emit the correct PBTMint event", async () => {
      await expect(subject()).to.emit(ChipPBT, "PBTMint").withArgs(
        subjectChipId,
        subjectChipId
      );
    });
  });

  context("when the chip has been claimed / minted", async() => {
    let ownerAddress: Address;
    let chip: Account;
    let chipAccount: AccountMock;
    let chipInfo: ChipPBTChipInfo;
    // let chipAccountInfo: ChipPBTChipInfo;

    beforeEach(async () => {
      ownerAddress = owner.address;
      // chipInfo = {
      //   tokenId: ONE,
      //   transferPolicy: transferPolicy.address,
      //   tokenUri: "https://www.ethereumrealityservice.com",
      //   tokenData: ethers.utils.solidityPack(['uint256'], [ONE]),
      // };

      // chipAccountInfo = {
      //   tokenId: BigNumber.from(2),
      //   transferPolicy: transferPolicy.address,
      //   tokenUri: "https://www.ethereumrealityservice.com",
      //   tokenData: ethers.utils.solidityPack(['uint256'], [ONE]),
      // };

      chip = chipOne;
      chipAccount = await deployer.mocks.deployAccountMock(chip.address, ChipPBT.address);

      await ChipPBT.testMint(ownerAddress, chip.address, transferPolicy.address);
      await ChipPBT.testMint(ownerAddress, chipAccount.address, transferPolicy.address);
    });

    describe("#transferTokenWithChip", async () => {
      let subjectBlockNumberUsedInSig: BigNumber;
      let subjectSignatureFromChip: string;
      let subjectUseSafeTransfer: boolean;
      let subjectCaller: Account;

      beforeEach(async () => {
        const anchorBlock = await blockchain._provider.getBlock("latest");
        subjectBlockNumberUsedInSig = BigNumber.from(anchorBlock.number);
        subjectCaller = newOwner;
        const msgContents = ethers.utils.solidityPack(
          ["address", "bytes32"],
          [subjectCaller.address, anchorBlock.hash]
        );

        subjectSignatureFromChip = await chip.wallet.signMessage(ethers.utils.arrayify(msgContents));
        subjectUseSafeTransfer = false;
      });

      async function subject(): Promise<any> {
        return ChipPBT.connect(subjectCaller.wallet).transferTokenWithChip(
          subjectSignatureFromChip,
          subjectBlockNumberUsedInSig,
          subjectUseSafeTransfer
        );
      }

      it("should revert", async () => {
        await expect(subject()).to.be.revertedWith("Not implemented");
      });
    });

    describe("#transferToken", async() => {
      let subjectChipId: Address;
      let subjectSignatureFromChip: string;
      let subjectBlockNumberUsedInSig: BigNumber;
      let subjectUseSafeTransfer: boolean;
      let subjectPayload: Uint8Array;
      let subjectCaller: Account;

      beforeEach(async () => {
        const anchorBlock = await blockchain._provider.getBlock("latest");
        subjectBlockNumberUsedInSig = BigNumber.from(anchorBlock.number);

        subjectChipId = chip.address;
        subjectCaller = newOwner;
        subjectPayload = ethers.utils.zeroPad(subjectBlockNumberUsedInSig.toHexString(), 32);

        const msgContents = ethers.utils.solidityPack(
          ["address", "bytes32", "bytes"],
          [subjectCaller.address, anchorBlock.hash, subjectPayload]
        );

        subjectSignatureFromChip = await chip.wallet.signMessage(ethers.utils.arrayify(msgContents));
        subjectUseSafeTransfer = false;
      });

      async function subject(): Promise<any> {
        return await ChipPBT.connect(subjectCaller.wallet).transferToken(
          subjectChipId,
          subjectSignatureFromChip,
          subjectBlockNumberUsedInSig,
          subjectUseSafeTransfer,
          subjectPayload
        );
      }

      it("should transfer the token to the correct address", async () => {
        await subject();

        // Need to use this hacky way to access since the ownerOf function is overloaded
        const actualOwner = (await ChipPBT.functions["ownerOf(address)"](chip.address))[0];
        expect(actualOwner).to.eq(newOwner.address);
      });

      it("should update the owner's balance", async () => {
        const initialOwnerBalance = await ChipPBT.balanceOf(owner.address);
        const initialNewOwnerBalance = await ChipPBT.balanceOf(newOwner.address);

        await subject();

        const postOwnerBalance = await ChipPBT.balanceOf(owner.address);
        const postNewOwnerBalance = await ChipPBT.balanceOf(newOwner.address);
        expect(postOwnerBalance).to.eq(initialOwnerBalance.sub(ONE));
        expect(postNewOwnerBalance).to.eq(initialNewOwnerBalance.add(ONE));
      });


      it("should call the transfer policy correctly", async () => {
        await subject();

        const callInfo = await transferPolicy.callInfo();
        expect(callInfo.chipId).to.eq(subjectChipId);
        expect(callInfo.sender).to.eq(subjectCaller.address);
        expect(callInfo.chipOwner).to.eq(owner.address);
        expect(callInfo.payload).to.eq(ethers.utils.hexZeroPad(subjectBlockNumberUsedInSig.toHexString(), 32));
        expect(callInfo.signature).to.eq(subjectSignatureFromChip);
      });

      it("should emit a Transfer event", async () => {
        const chipTokenId = await ChipPBT.tokenIdFor(chip.address);
        await expect(subject()).to.emit(ChipPBT, "Transfer").withArgs(owner.address, newOwner.address, chipTokenId);
      });

      describe("when safeTransfer is used", async () => {
        beforeEach(async () => {
          const anchorBlock = await blockchain._provider.getBlock("latest");

          const msgContents = ethers.utils.solidityPack(
            ["address", "bytes32", "bytes"],
            [accountMock.address, anchorBlock.hash, subjectPayload]
          );
  
          subjectSignatureFromChip = await chip.wallet.signMessage(ethers.utils.arrayify(msgContents));
          subjectUseSafeTransfer = true;
        });

        async function accountSubject(): Promise<any> {
          return accountMock.connect(subjectCaller.wallet).transferToken(
            subjectChipId,
            subjectSignatureFromChip,
            subjectBlockNumberUsedInSig,
            subjectUseSafeTransfer,
            subjectPayload
          );
        }

        it("should transfer the token to the correct address", async () => {
          await accountSubject();

          // Need to use this hacky way to access since the ownerOf function is overloaded
          const actualOwner = (await ChipPBT.functions["ownerOf(address)"](chip.address))[0];
          expect(actualOwner).to.eq(accountMock.address);
        });

        describe("when the receiver hasn't implemented onERC721Received", async () => {
          beforeEach(async () => {
            await network.provider.request({
              method: "hardhat_impersonateAccount",
              params: [transferPolicy.address],
            });

            await owner.wallet.sendTransaction({
              to: transferPolicy.address,
              value: ethers.utils.parseEther("1.0"), // Sends exactly 1.0 ether
            });

            const signer = await ethers.getSigner(transferPolicy.address) as SignerWithAddress;
            subjectCaller = {
              wallet: signer,
              address: await signer.getAddress(),
            } as Account;

            const anchorBlock = await blockchain._provider.getBlock("latest");
            subjectBlockNumberUsedInSig = BigNumber.from(anchorBlock.number);

            subjectPayload = ethers.utils.zeroPad(subjectBlockNumberUsedInSig.toHexString(), 32);

            const msgContents = ethers.utils.solidityPack(
              ["address", "bytes32", "bytes"],
              [subjectCaller.address, anchorBlock.hash, subjectPayload]
            );
            subjectSignatureFromChip = await chip.wallet.signMessage(ethers.utils.arrayify(msgContents));
          });

          it("should revert", async () => {
            await expect(subject()).to.be.revertedWith("ERC721: transfer to non ERC721Receiver implementer");
          });
        });
      });

      describe("when the payload hasn't been signed by the chip", async () => {
        beforeEach(async () => {
          const anchorBlock = await blockchain._provider.getBlock("latest");
          subjectBlockNumberUsedInSig = BigNumber.from(anchorBlock.number);
          const msgContents = ethers.utils.solidityPack(
            ["address", "bytes32", "bytes"],
            [subjectCaller.address, anchorBlock.hash, "0x"]
          );

          subjectSignatureFromChip = await chipTwo.wallet.signMessage(ethers.utils.arrayify(msgContents));
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Invalid signature");
        });
      });

      describe("when no transfer policy is set", async () => {
        beforeEach(async () => {
          const newTransferPolicy = ADDRESS_ZERO;
          const commitBlock = await blockchain.getLatestBlockNumber();
  
          const packedMsg = ethers.utils.solidityPack(
            ["uint256", "address"],
            [commitBlock, newTransferPolicy]
          );
          const signature = await chip.wallet.signMessage(ethers.utils.arrayify(packedMsg));
          subjectCaller = owner;

          await ChipPBT.connect(owner.wallet).setTransferPolicy(
            chip.address,
            ADDRESS_ZERO,
            await blockchain.getLatestBlockNumber(),
            signature
          );
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Transfer policy must be set");
        });
      });

      describe("when the payload has expired", async () => {
        beforeEach(async () => {
          await blockchain.waitBlocksAsync(6);
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Block number must be within maxBlockWindow");
        });
      });

      describe("when block number used in sig is greater than current block", async () => {
        beforeEach(async () => {
          subjectBlockNumberUsedInSig = await blockchain.getLatestBlockNumber().then(bn => bn.add(2));
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Block number must have been mined");
        });
      });

      describe("when the chip hasn't been claimed", async () => {
        beforeEach(async () => {
          subjectChipId = owner.address;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Chip must be claimed");
        });
      });
    });

    describe("#setOwner", async() => {
      let subjectChipId: Address;
      let subjectNewOwner: Address;
      let subjectCommitBlock: BigNumber;
      let subjectSignature: string;
      let subjectCaller: Account;

      beforeEach(async () => {
        subjectChipId = chip.address;
        subjectNewOwner = newOwner.address;
        subjectCommitBlock = await blockchain.getLatestBlockNumber();

        const packedMsg = ethers.utils.solidityPack(
          ["uint256", "address"],
          [subjectCommitBlock, subjectNewOwner]
        );
        subjectSignature = await chip.wallet.signMessage(ethers.utils.arrayify(packedMsg));
        subjectCaller = owner;
      });

      async function subject(): Promise<any> {
        return await ChipPBT.connect(subjectCaller.wallet).setOwner(
          subjectChipId,
          subjectNewOwner,
          subjectCommitBlock,
          subjectSignature
        );
      }

      it("should update the owner of the token", async () => {
        await subject();

        const actualOwner = (await ChipPBT.functions["ownerOf(uint256)"](chip.address))[0];
        expect(actualOwner).to.eq(subjectNewOwner);
      });

      it("should update the owner and new owner balances", async () => {
        const preOwnerBalance = await ChipPBT.balanceOf(owner.address);
        const preNewOwnerBalance = await ChipPBT.balanceOf(subjectNewOwner);

        await subject();

        const postOwnerBalance = await ChipPBT.balanceOf(owner.address);
        const postNewOwnerBalance = await ChipPBT.balanceOf(subjectNewOwner);

        expect(postOwnerBalance).to.eq(preOwnerBalance.sub(1));
        expect(postNewOwnerBalance).to.eq(preNewOwnerBalance.add(1));
      });

      it("should emit a Transfer event", async () => {
        await expect(subject()).to.emit(ChipPBT, "Transfer").withArgs(
          owner.address,
          subjectNewOwner,
          chip.address
        );
      });

      describe("when the chip is represented by an account contract", async () => {

        beforeEach(async () => {
          subjectChipId = chipAccount.address;
        });

        it("should update the owner of the token", async () => {
          await subject();

          const actualOwner = (await ChipPBT.functions["ownerOf(uint256)"](subjectChipId))[0];
          expect(actualOwner).to.eq(subjectNewOwner);
        });

        it("should update the owner and new owner balances", async () => {
          const preOwnerBalance = await ChipPBT.balanceOf(owner.address);
          const preNewOwnerBalance = await ChipPBT.balanceOf(subjectNewOwner);

          await subject();

          const postOwnerBalance = await ChipPBT.balanceOf(owner.address);
          const postNewOwnerBalance = await ChipPBT.balanceOf(subjectNewOwner);

          expect(postOwnerBalance).to.eq(preOwnerBalance.sub(1));
          expect(postNewOwnerBalance).to.eq(preNewOwnerBalance.add(1));
        });
      });

      describe("when the signature isn't valid", async () => {
        beforeEach(async () => {
          const packedMsg = ethers.utils.solidityPack(["uint256"], [subjectCommitBlock]);
          subjectSignature = await chipTwo.wallet.signMessage(packedMsg);
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Invalid signature");
        });
      });

      describe("when the signature isn't valid for an account contract", async () => {
        beforeEach(async () => {
          subjectChipId = chipAccount.address;
          const packedMsg = ethers.utils.solidityPack(["uint256"], [subjectCommitBlock]);
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

      describe("when the owner isn't the caller", async () => {
        beforeEach(async () => {
          subjectCaller = chip;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Caller must be chip owner");
        });
      });
    });

    describe("#setTransferPolicy", async() => {
      let subjectChipId: Address;
      let subjectNewTransferPolicy: Address;
      let subjectCommitBlock: BigNumber;
      let subjectSignature: string;
      let subjectCaller: Account;

      beforeEach(async () => {
        subjectChipId = chip.address;
        subjectNewTransferPolicy = transferPolicyTwo.address;
        subjectCommitBlock = await blockchain.getLatestBlockNumber();

        const packedMsg = ethers.utils.solidityPack(
          ["uint256", "address"],
          [subjectCommitBlock, subjectNewTransferPolicy]
        );
        subjectSignature = await chip.wallet.signMessage(ethers.utils.arrayify(packedMsg));
        subjectCaller = owner;
      });

      async function subject(): Promise<any> {
        return ChipPBT.connect(subjectCaller.wallet).setTransferPolicy(
          subjectChipId,
          subjectNewTransferPolicy,
          subjectCommitBlock,
          subjectSignature
        );
      }

      it("should update the transfer policy of the token", async () => {
        await subject();

        const actualTransferPolicy = (await ChipPBT.chipTransferPolicy(subjectChipId));
        expect(actualTransferPolicy).to.eq(subjectNewTransferPolicy);
      });

      it("should emit a TransferPolicyChanged event", async () => {
        await expect(subject()).to.emit(ChipPBT, "TransferPolicyChanged").withArgs(
          subjectChipId,
          subjectNewTransferPolicy
        );
      });

      describe("when the chip is represented by an account contract", async () => {

        beforeEach(async () => {
          subjectChipId = chipAccount.address;
        });

        it("should update the owner of the token", async () => {
          await subject();

          const actualTransferPolicy = (await ChipPBT.chipTransferPolicy(subjectChipId));
          expect(actualTransferPolicy).to.eq(subjectNewTransferPolicy);
        });
      });

      describe("when the signature isn't valid", async () => {
        beforeEach(async () => {
          const packedMsg = ethers.utils.solidityPack(["uint256"], [subjectCommitBlock]);
          subjectSignature = await chipTwo.wallet.signMessage(packedMsg);
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Invalid signature");
        });
      });

      describe("when the signature isn't valid for an account contract", async () => {
        beforeEach(async () => {
          subjectChipId = chipAccount.address;
          const packedMsg = ethers.utils.solidityPack(["uint256"], [subjectCommitBlock]);
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

      describe("when the owner isn't the caller", async () => {
        beforeEach(async () => {
          subjectCaller = chip;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Caller must be chip owner");
        });
      });
    });

    describe("#tokenUri(uint256)", async() => {
      let subjectTokenId: BigNumber;

      beforeEach(async () => {
        subjectTokenId = chipInfo.tokenId;
      });

      async function subject(): Promise<any> {
        return (await ChipPBT.functions["tokenURI(uint256)"](subjectTokenId))[0];
      }

      // TODO: check baseURI
      // it("should return the correct token URI", async () => {
      //   const actualTokenURI = await subject();
      //   expect(actualTokenURI).to.eq(chipInfo.tokenUri);
      // });

      describe("when the token ID doesn't exist", async () => {
        beforeEach(async () => {
          subjectTokenId = BigNumber.from(100);
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("ERC721: invalid token ID");
        });
      });
    });

    describe("#tokenUri(address)", async() => {
      let subjectChipId: Address;

      beforeEach(async () => {
        subjectChipId = chip.address;
      });

      async function subject(): Promise<any> {
        return (await ChipPBT.functions["tokenURI(address)"](subjectChipId))[0];
      }

      it("should return the correct token URI", async () => {
        const actualTokenURI = await subject();
        expect(actualTokenURI).to.eq(chipInfo.tokenUri);
      });

      describe("when the token ID doesn't exist", async () => {
        beforeEach(async () => {
          subjectChipId = owner.address;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("Chip must be claimed");
        });
      });
    });
  });

  describe("#transferFrom", async () => {
    let subjectFrom: Address;
    let subjectTo: Address;
    let subjectTokenId: BigNumber;

    beforeEach(async () => {
      subjectFrom = owner.address;
      subjectTo = newOwner.address;
      subjectTokenId = ONE;
    });

    async function subject(): Promise<any> {
      return ChipPBT.connect(owner.wallet).transferFrom(subjectFrom, subjectTo, subjectTokenId);
    }

    it("should revert", async () => {
      await expect(subject()).to.be.revertedWith("ERC721 public transferFrom not allowed");
    });
  });

  describe("#safeTransferFrom", async () => {
    let subjectFrom: Address;
    let subjectTo: Address;
    let subjectTokenId: BigNumber;

    beforeEach(async () => {
      subjectFrom = owner.address;
      subjectTo = newOwner.address;
      subjectTokenId = ONE;
    });

    async function subject(): Promise<any> {
      return ChipPBT.connect(owner.wallet).functions["safeTransferFrom(address,address,uint256)"](
        subjectFrom,
        subjectTo,
        subjectTokenId
      );
    }

    it("should revert", async () => {
      await expect(subject()).to.be.revertedWith("ERC721 public safeTransferFrom not allowed");
    });
  });

  describe("#safeTransferFrom (with data)", async () => {
    let subjectFrom: Address;
    let subjectTo: Address;
    let subjectTokenId: BigNumber;
    let subjectData: string;

    beforeEach(async () => {
      subjectFrom = owner.address;
      subjectTo = newOwner.address;
      subjectTokenId = ONE;
      subjectData = "0x";
    });

    async function subject(): Promise<any> {
      return ChipPBT.connect(owner.wallet).functions["safeTransferFrom(address,address,uint256,bytes)"](
        subjectFrom,
        subjectTo,
        subjectTokenId,
        subjectData
      );
    }

    it("should revert", async () => {
      await expect(subject()).to.be.revertedWith("ERC721 public safeTransferFrom not allowed");
    });
  });

  describe("#approve", async () => {
    let subjectTo: Address;
    let subjectTokenId: BigNumber;

    beforeEach(async () => {
      subjectTo = newOwner.address;
      subjectTokenId = ONE;
    });

    async function subject(): Promise<any> {
      return ChipPBT.connect(owner.wallet).approve(subjectTo, subjectTokenId);
    }

    it("should revert", async () => {
      await expect(subject()).to.be.revertedWith("ERC721 public approve not allowed");
    });
  });

  describe("#setApprovalForAll", async () => {
    let subjectOperator: Address;
    let subjectApproved: boolean;

    beforeEach(async () => {
      subjectOperator = newOwner.address;
      subjectApproved = true;
    });

    async function subject(): Promise<any> {
      return ChipPBT.connect(owner.wallet).setApprovalForAll(subjectOperator, subjectApproved);
    }

    it("should revert", async () => {
      await expect(subject()).to.be.revertedWith("ERC721 public setApprovalForAll not allowed");
    });
  });
});
