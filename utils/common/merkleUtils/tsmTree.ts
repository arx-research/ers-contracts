import MerkleTree from './merkleTree';
import { BigNumber, utils } from 'ethers';
import { Address, TSMClaimTreeInfo } from "@utils/types";

export class TSMTree {
  private readonly tree: MerkleTree;
  constructor(enrollmentData: TSMClaimTreeInfo[]) {
    this.tree = new MerkleTree(
      enrollmentData.map((info, index) => {
        return TSMTree.toNode(
          index,
          info.chipId,
          info.enrollmentId,
          info.lockinPeriod,
          info.primaryServiceId,
          info.tokenUri
        );
      })
    );
  }

  public static verifyProof(
    index: number | BigNumber,
    chipInfo: TSMClaimTreeInfo,
    proof: Buffer[],
    root: Buffer
  ): boolean {
    let pair = TSMTree.toNode(
      index,
      chipInfo.chipId,
      chipInfo.enrollmentId,
      chipInfo.lockinPeriod,
      chipInfo.primaryServiceId,
      chipInfo.tokenUri
    );
    for (const item of proof) {
      pair = MerkleTree.combinedHash(pair, item);
    }

    return pair.equals(root);
  }

  // keccak256(abi.encode(index, chipId, enrollmentId, lockinPeriod, primaryServiceId, tokenUri))
  public static toNode(
    index: number | BigNumber,
    chipId: Address,
    enrollmentId: string,
    lockinPeriod: BigNumber,
    primaryServiceId: string,
    tokenUri: string
  ): Buffer {
    const leaf = utils.solidityKeccak256(
      ['uint256', 'address', 'bytes32', 'uint256', 'bytes32', 'string'],
      [index, chipId, enrollmentId, lockinPeriod, primaryServiceId, tokenUri]
    ).substring(2);
    return Buffer.from(leaf, 'hex');
  }

  public getHexRoot(): string {
    return this.tree.getHexRoot();
  }

  // returns the hex bytes32 values of the proof
  public getProof(index: number | BigNumber, chipInfo: TSMClaimTreeInfo): string[] {
    const node = TSMTree.toNode(
      index,
      chipInfo.chipId,
      chipInfo.enrollmentId,
      chipInfo.lockinPeriod,
      chipInfo.primaryServiceId,
      chipInfo.tokenUri
    );
    return this.tree.getHexProof(node);
  }
}
