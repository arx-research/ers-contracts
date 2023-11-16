import { Signer } from "ethers";

export default class DeployTransferPolicies {
  private _deployerSigner: Signer;

  constructor(deployerSigner: Signer) {
    this._deployerSigner = deployerSigner;
  }
}
