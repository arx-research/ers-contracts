import { ethers } from "ethers";

import {
  ProjectRegistrar__factory
} from "../../typechain/factories/contracts/project-registrars/ProjectRegistrar__factory";

export const encoder = (types: string[], values: string[]) => {
  const abiCoder = ethers.utils.defaultAbiCoder;
  const encodedParams = abiCoder.encode(types, values);
  return encodedParams.slice(2);
};

export const create2Address = (factoryAddress: string, saltHex: string, initCode: string) => {
  const create2Addr = ethers.utils.getCreate2Address(factoryAddress, saltHex, ethers.utils.keccak256(initCode));
  return create2Addr;
};

export const calculateProjectRegistrarAddress = (
  factoryAddress: string,
  saltHex: string,
  constructorArgs: any[]
): string => {
  // Create expected Project Registrar address to sign
  const initCode = ProjectRegistrar__factory.bytecode + encoder(
    [
      "address",
      "address",
      "address",
      "address",
      "uint256",
    ],
    constructorArgs
  );
  return create2Address(factoryAddress, saltHex, initCode);
};
