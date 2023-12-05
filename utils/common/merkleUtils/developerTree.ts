import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { BigNumber } from 'ethers';
import { Address, DeveloperClaimTreeInfo } from "@utils/types";

export class DeveloperTree {
  private readonly tree: StandardMerkleTree<[number, string, string, BigNumber, string, string]>;
  constructor(enrollmentData: DeveloperClaimTreeInfo[]) {
    this.tree = StandardMerkleTree.of(
      enrollmentData.map((info, index) => [
        index,
        info.chipId,
        info.enrollmentId,
        info.lockinPeriod,
        info.primaryServiceId,
        info.tokenUri,
      ]),
      ["uint256", "address", "bytes32", "uint256", "bytes32", "string"]
    );
  }

  public verifyProof(
    index: number,
    chipInfo: DeveloperClaimTreeInfo,
    proof: string[]
  ): boolean {
    return StandardMerkleTree.verify(
      this.tree.root,
      ["uint256", "address", "bytes32", "uint256", "bytes32", "string"],
      [index, chipInfo.chipId, chipInfo.enrollmentId, chipInfo.lockinPeriod, chipInfo.primaryServiceId, chipInfo.tokenUri],
      proof
    );
  }

  // keccak256(abi.encode(index, chipId, enrollmentId, lockinPeriod, primaryServiceId, tokenUri))
  public toNode(
    index: number,
    chipId: Address,
    enrollmentId: string,
    lockinPeriod: BigNumber,
    primaryServiceId: string,
    tokenUri: string
  ): string {
    return this.tree.leafHash([index, chipId, enrollmentId, lockinPeriod, primaryServiceId, tokenUri]);
  }

  public getRoot(): string {
    return this.tree.root;
  }

  // returns the hex bytes32 values of the proof
  public getProof(index: number): string[] {
    return this.tree.getProof(index);
  }
}
