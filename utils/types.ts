import { BigNumber } from "ethers";

export type Address = string;

export interface TSMClaimTreeInfo {
  chipId: Address;
  enrollmentId: string;
  lockinPeriod: BigNumber;
  primaryServiceId: string;
  tokenUri: string;
}

export interface TSMMerkleProofInfo {
  tsmIndex: BigNumber;          // When generating a merkle tree you input an array of leaves this is the index of the leaf in that array
  serviceId: string;            // The id of the primary service the TSM specifies for the chip owner
  lockinPeriod: BigNumber;      // Length of time before the chip owner can change the primary service
  tokenUri: string;             // tokenUri like in ERC-721
  tsmProof: string[];           // The merkle proof used to prove that the chip is part of a tree
}

export interface ChipClaimInfo {
  owner: Address;
  ersNode: string;
  tsmMerkleInfo: TSMMerkleProofInfo;
}

export interface ManufacturerValidationInfo {
  enrollmentId: string;             // id of manufacturer enrollment the chip belongs to
  mIndex: BigNumber;                // When generating a merkle tree you input an array of leaves this is the index of the leaf in that array
  manufacturerProof: string[];      // The merkle proof used to prove that the chip is part of a tree
}

export interface ClaimedPBTChipInfo {
  tokenId: BigNumber;
  transferPolicy: Address;
  tokenUri: string;
  tokenData: string;
}

export interface ServiceRecord{
  recordType: string;
  content: string;
  appendId: boolean;
}

export interface RecordContent{
  recordType: string;
  content: string;
}

export interface Service {
  serviceId: string;
  serviceTimelock: BigNumber;
  records: ServiceRecord[];
}

export interface ExpandedChipService {
  primaryService: Service;
  serviceTimelock: BigNumber;
  secondaryServices: Service[];
}

export interface EIP712Domain {
  name: string;
  version: string;
  chainId?: number;
  verifyingContract?: Address;
}
