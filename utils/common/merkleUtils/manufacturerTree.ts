import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { Address } from "@utils/types";

export class ManufacturerTree {
  private readonly tree: StandardMerkleTree<[number, string]>;
  constructor(enrollmentData: { chipId: string }[]) {
    this.tree = StandardMerkleTree.of(
      enrollmentData.map((info, index) => [index, info.chipId]),
      ["uint256", "address"]
    );
  }

  public verifyProof(
    index: number,
    chipId: Address,
    proof: string[]
  ): boolean {
    return StandardMerkleTree.verify(
      this.tree.root,
      ["uint256", "address"],
      [index, chipId],
      proof
    );
  }

  // keccak(keccak256(abi.encode(index, chipId)))
  public toNode(index: number, chipId: string): string {
    return this.tree.leafHash([index, chipId]);
  }

  public getRoot(): string {
    return this.tree.root;
  }

  // returns the hex bytes32 values of the proof
  public getProof(index: number | [number, string]): string[] {
    return this.tree.getProof(index);
  }
}
