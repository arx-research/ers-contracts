import MerkleTree from './merkleTree'
import { BigNumber, utils } from 'ethers'

export class ManufacturerTree {
  private readonly tree: MerkleTree
  constructor(enrollmentData: { chipId: string }[]) {
    this.tree = new MerkleTree(
      enrollmentData.map(({ chipId }, index) => {
        return ManufacturerTree.toNode(index, chipId)
      })
    )
  }

  public static verifyProof(
    index: number | BigNumber,
    chipId: string,
    proof: Buffer[],
    root: Buffer
  ): boolean {
    let pair = ManufacturerTree.toNode(index, chipId)
    for (const item of proof) {
      pair = MerkleTree.combinedHash(pair, item)
    }

    return pair.equals(root)
  }

  // keccak256(abi.encode(index, chipId))
  public static toNode(index: number | BigNumber, chipId: string): Buffer {
    return Buffer.from(
      utils.solidityKeccak256(['uint256', 'address'], [index, chipId]).substring(2),
      'hex'
    )
  }

  public getHexRoot(): string {
    return this.tree.getHexRoot()
  }

  // returns the hex bytes32 values of the proof
  public getProof(index: number | BigNumber, chipId: string): string[] {
    return this.tree.getHexProof(ManufacturerTree.toNode(index, chipId))
  }
}
