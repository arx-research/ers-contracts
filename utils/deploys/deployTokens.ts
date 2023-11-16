import { BigNumber, Signer } from "ethers";

import { ClaimedPBT__factory } from "../../typechain/factories/contracts/token";

import { ClaimedPBT } from "../contracts";

export default class DeployTokens {
  private _deployerSigner: Signer;

  constructor(deployerSigner: Signer) {
    this._deployerSigner = deployerSigner;
  }

  public async deployClaimedPBT(
    name: string,
    symbol: string,
    maxBlockWindow: BigNumber
  ): Promise<ClaimedPBT> {
    const claimedPBT = await new ClaimedPBT__factory(this._deployerSigner).deploy(
      name,
      symbol,
      maxBlockWindow
    );
    return claimedPBT;
  }
}
