import { BigNumber } from "ethers";

export type Address = string;

export interface DeveloperClaimTreeInfo {
  chipId: Address;
  enrollmentId: string;
  lockinPeriod: BigNumber;
  primaryServiceId: string;
  tokenUri: string;
}

export interface DeveloperMerkleProofInfo {
  developerIndex: BigNumber;          // When generating a merkle tree you input an array of leaves this is the index of the leaf in that array
  serviceId: string;            // The id of the primary service the Developer specifies for the chip owner
  lockinPeriod: BigNumber;      // Length of time before the chip owner can change the primary service
  tokenUri: string;             // tokenUri like in ERC-721
}

export interface ChipAdditionInfo {
  owner: Address;
  rootNode: string;
  nameHash: string;
  developerMerkleInfo: DeveloperMerkleProofInfo;
}

export interface ManufacturerValidationInfo {
  enrollmentId: string;             // id of manufacturer enrollment the chip belongs to
  manufacturerCertificate: string;      // The chip certificate signed by the manufacturer
}

export interface ProjectChipAddition {
  chipId: Address;
  chipNameHash: string;
  developerMerkleInfo: DeveloperMerkleProofInfo;
  manufacturerValidation: ManufacturerValidationInfo;
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
