[![Coverage Status](https://coveralls.io/repos/github/arx-research/ers-contracts/badge.svg?t=p3tecU)](https://coveralls.io/github/arx-research/ers-contracts)

Smart contracts for the Ethereum Reality Service protocol.
## Contracts
Ethereum Reality Service is a smart contract protocol for resolution and authentication of blockchain enabled chips embedded in real-world iterms. We use [Hardhat](https://hardhat.org/) as a development environment for compiling, testing, and deploying our contracts.

## Usage
See the [ers-scripts](https://github.com/arx-research/ers-scripts) repository for a set of Hardhat tasks that can be used to interact with ERS deployments on Base and Sepolia. See also [https://docs.ers.to/](https://docs.ers.to/) for comprehensive documentation about ERS.

## Development

Install dependencies using `yarn install`

If need to add dependencies use `yarn add [dependency]`, use `-D` flag if a dev dependency.

To use console.log during Solidity development, follow the [guides](https://hardhat.org/guides/hardhat-console.html).

## Available Functionality

### Run Hardhat EVM on localhost

`yarn chain`

### Build Contracts

`yarn compile`

### Generate TypeChain Typings

`yarn build`

### Run Contract Tests

`yarn test:fast` to run compiled contracts

OR `yarn test:clean` if contracts have been typings need to be updated

Default is run on `hardhat` network. If you want to run on `localhost` use `--network localhost`
