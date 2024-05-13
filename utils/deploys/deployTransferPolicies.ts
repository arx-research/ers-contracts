import { Signer } from "ethers";

import { OpenTransferPolicy } from "../contracts";
import { OpenTransferPolicy__factory } from "../../typechain/factories/contracts/token/transfer-policies";

export default class DeployTransferPolicies {
  private _deployerSigner: Signer;

  constructor(deployerSigner: Signer) {
    this._deployerSigner = deployerSigner;
  }

  public async deployOpenTransferPolicy(): Promise<OpenTransferPolicy> {
    const transferPolicy = await new OpenTransferPolicy__factory(this._deployerSigner).deploy();
    return transferPolicy;
  }
}
