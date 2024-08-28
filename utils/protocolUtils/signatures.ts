import { Address } from "@utils/types";
import { Account } from "@utils/test/types";

export async function createManufacturerCertificate(signer: Account, chainId: number, chipId: Address, verifyingContract: Address): Promise<string> {
  const domain = {
    name: "ERS",
    version: "2.0.0",
    chainId,
    verifyingContract,
  };

  const types = {
    ManufacturerCertificate: [
      { name: "chipId", type: "address" },
    ],
  };

  const domainWithChainId = { ...domain, chainId };

  const value = {
    chipId,
  };

  return await signer.wallet._signTypedData(domainWithChainId, types, value);
}

export async function createDeveloperCustodyProof(chipId: Account, developerRegistrar: Address, chainId: number, verifyingContract: Address): Promise<string> {
  const domain = {
    name: "ERS",
    version: "2.0.0",
    chainId,
    verifyingContract,
  };

  const types = {
    DeveloperCustodyProof: [
      { name: "developerRegistrar", type: "address" },
    ],
  };

  const domainWithChainId = { ...domain, chainId };

  const value = {
    developerRegistrar,
  };

  return await chipId.wallet._signTypedData(domainWithChainId, types, value);
}

export async function createMigrationProof(
  signer: Account,
  chipId: Address,
  developerRegistrar: Address,
  chainId: number,
  verifyingContract: Address
): Promise<string> {
  const domain = {
    name: "ERS",
    version: "2.0.0",
    chainId,
    verifyingContract,
  };

  const types = {
    MigrationProof: [
      { name: "chipId", type: "address" },
      { name: "developerRegistrar", type: "address" },
    ],
  };

  const domainWithChainId = { ...domain, chainId };

  const value = {
    chipId,
    developerRegistrar,
  };

  return await signer.wallet._signTypedData(domainWithChainId, types, value);
}

export async function createNameApprovalProof(
  signer: Account,
  developerOwner: Address,
  nameHash: string,
  proofTimestamp: number,
  chainId: number,
  verifyingContract: Address
): Promise<string> {
  const domain = {
    name: "ERS",
    version: "2.0.0",
    chainId,
    verifyingContract,
  };

  const types = {
    NameApprovalProof: [
      { name: "developerOwner", type: "address" },
      { name: "developerName", type: "bytes32" },
      { name: "proofTimestamp", type: "uint256" },
    ],
  };

  const domainWithChainId = { ...domain, chainId };

  const value = {
    developerOwner,
    developerName: nameHash,
    proofTimestamp,
  };

  return await signer.wallet._signTypedData(domainWithChainId, types, value);
}
