import { ethers } from "ethers";

import {
  RedirectProjectRegistrar__factory
} from "../../typechain/factories/contracts/project-registrars/RedirectProjectRegistrar__factory";

export const encoder = (types: string[], values: string[]) => {
  const abiCoder = ethers.utils.defaultAbiCoder;
  const encodedParams = abiCoder.encode(types, values);
  return encodedParams.slice(2);
};

export const create2Address = (factoryAddress: string, saltHex: string, initCode: string) => {
  const create2Addr = ethers.utils.getCreate2Address(factoryAddress, saltHex, ethers.utils.keccak256(initCode));
  return create2Addr;
};

export const calculateRedirectProjectRegistrarAddress = (
  factoryAddress: string,
  saltHex: string,
  constructorArgs: any[]
): string => {
  // Create expected Project Registrar address to sign
  const initCode = RedirectProjectRegistrar__factory.bytecode + encoder(
    [
      "address",
      "address",
      "address",
      "address",
    ],
    constructorArgs
  );
  return create2Address(factoryAddress, saltHex, initCode);
};
