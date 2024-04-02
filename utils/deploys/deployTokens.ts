import { BigNumber, Signer } from "ethers";

import { ChipPBT__factory } from "../../typechain/factories/contracts/token";

import { ChipPBT } from "../contracts";

export default class DeployTokens {
  private _deployerSigner: Signer;

  constructor(deployerSigner: Signer) {
    this._deployerSigner = deployerSigner;
  }

  public async deployChipPBT(
    name: string,
    symbol: string,
    maxBlockWindow: BigNumber
  ): Promise<ChipPBT> {
    const ChipPBT = await new ChipPBT__factory(this._deployerSigner).deploy(
      name,
      symbol,
      maxBlockWindow,
      baseTokenURI
    );
    return ChipPBT;
  }
}
