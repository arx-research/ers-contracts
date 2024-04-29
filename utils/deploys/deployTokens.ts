import { BigNumber, Signer } from "ethers";

import { PBTSimple__factory } from "../../typechain/factories/contracts/token";

import { PBTSimple } from "../contracts";

export default class DeployTokens {
  private _deployerSigner: Signer;

  constructor(deployerSigner: Signer) {
    this._deployerSigner = deployerSigner;
  }

  public async deployPBTSimple(
    name: string,
    symbol: string,
    maxBlockWindow: BigNumber,
    baseTokenURI: string,
    transferPolicy: string
  ): Promise<PBTSimple> {
    const ChipPBT = await new PBTSimple__factory(this._deployerSigner).deploy(
      name,
      symbol,
      baseTokenURI,
      maxBlockWindow,
      transferPolicy
    );
    return ChipPBT;
  }
}
