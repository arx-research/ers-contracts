import { BigNumber, constants } from "ethers";

const { Zero, One, AddressZero } = constants;

export const ADDRESS_ZERO = AddressZero;
export const ZERO = Zero;
export const ONE = One;
export const ERS_NODE = "0xda53397877d78746657194546b25f20b5c2e580045028a6fa27f07cf94e704ba";
export const NULL_NODE = constants.HashZero;
export const ONE_DAY_IN_SECONDS = BigNumber.from(86400);
