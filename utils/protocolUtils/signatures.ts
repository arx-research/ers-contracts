import { ethers } from "hardhat";

import { Address, EIP712Domain } from "@utils/types";
import { Account } from "@utils/test/types";

const ERS_DOMAIN = {
  name: "Ethereum Reality Service",
  version: "1"
} as EIP712Domain;

export async function createProjectOwnershipProof(
  signer: Account,
  projectRegistrarAddress: Address,
  chipRegistryAddress: Address,
  chainId: number
): Promise<string> {
  const domain = {
    ...ERS_DOMAIN,
    chainId,
    verifyingContract: chipRegistryAddress
  };

  const message = {
    projectRegistrar: projectRegistrarAddress
  };

  const types = {
    Contents: [{ name: "projectRegistrar", type: "address" }]
  };

  const signature = await signer.wallet._signTypedData(domain, types, message);
  return signature;
}
