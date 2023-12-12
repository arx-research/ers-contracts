import { BigNumber, ethers } from "ethers";

import { Address } from "@utils/types";
import { Account } from "@utils/test/types";

export async function createProjectOwnershipProof(
  signer: Account,
  projectRegistrarAddress: Address,
  chainId: number
): Promise<string> {
  const packedMsg = ethers.utils.solidityPack(["uint256", "address"], [chainId, projectRegistrarAddress]);
  return signer.wallet.signMessage(ethers.utils.arrayify(packedMsg));
}

export async function createDeveloperInclusionProof(signer: Account, chipId: Address): Promise<string> {
  const packedMsg = ethers.utils.solidityPack(["address"], [chipId]);
  return signer.wallet.signMessage(ethers.utils.arrayify(packedMsg));
}

export async function createDeveloperCustodyProof(signer: Account, projectPublicKey: Address): Promise<string> {
  const packedMsg = ethers.utils.solidityPack(["address"], [projectPublicKey]);
  return signer.wallet.signMessage(ethers.utils.arrayify(packedMsg));
}

export async function createProvingChipOwnershipProof(signer: Account, chipHolder: Address, chainId: number): Promise<string> {
  const packedChipOwnershipMessage = ethers.utils.solidityPack(["uint256", "address"], [chainId, chipHolder]);
  return await signer.wallet.signMessage(ethers.utils.arrayify(packedChipOwnershipMessage));
}

export async function createNameApprovalProof(
  signer: Account,
  developerOwner: Address,
  nameHash: string
): Promise<string> {
  const packedMsg = ethers.utils.solidityPack(["address", "bytes32"], [developerOwner, nameHash]);
  return signer.wallet.signMessage(ethers.utils.arrayify(packedMsg));
}

export async function createChipOwnershipProof(
  signer: Account,
  chainId: number,
  commitBlock: BigNumber,
  nameHash: string,
  caller: Address
): Promise<string> {
  const packedMsg = ethers.utils.solidityPack(
    ["uint256", "uint256", "bytes32", "address"],
    [chainId, commitBlock, nameHash, caller]
  );
  return signer.wallet.signMessage(ethers.utils.arrayify(packedMsg));
}
