import { Command, flags } from '@oclif/command';
import { sendMany, Recipient, isNormalInteger } from '../builder';
import {
  StacksMocknet,
  StacksMainnet,
  StacksTestnet,
  StacksNetwork,
} from '@stacks/network';
import {
  broadcastTransaction,
  ChainID,
  validateStacksAddress,
} from '@stacks/transactions';

type NetworkString = 'mocknet' | 'mainnet' | 'testnet';

const DEFAULT_TESTNET_CONTRACT =
  'STB44HYPYAT2BB2QE513NSP81HTMYWBJP02HPGK6.send-many';
const DEFAULT_MAINNET_CONTRACT = 'not-deployed';

export class SendMany extends Command {
  static description = `Execute a bulk STX transfer.
  The bulk transfer is executed in a single transaction by invoking a \`contract-call\` on the "send-many" contract.

  The default contracts can be found below:

  Testnet: https://explorer.stacks.co/txid/${DEFAULT_TESTNET_CONTRACT}?chain=testnet
  Mainnet: https://explorer.stacks.co/txid/${DEFAULT_MAINNET_CONTRACT}?chain=mainnet

  Example usage:

  \`\`\`
  npx stx-bulk-transfer STADMRP577SC3MCNP7T3PRSTZBJ75FJ59JGABZTW,100 ST2WPFYAW85A0YK9ACJR8JGWPM19VWYF90J8P5ZTH,50 -k my_private_key -n testnet -b
  \`\`\`
  `;
  // allow infinite arguments
  static strict = false;

  static flags = {
    help: flags.help({ char: 'h' }),
    privateKey: flags.string({
      char: 'k',
      description: 'Your private key',
      required: true,
    }),
    broadcast: flags.boolean({
      char: 'b',
      default: false,
      description: 'Whether to broadcast this transaction or not.',
    }),
    network: flags.string({
      char: 'n',
      description: 'Which network to broadcast this to',
      options: ['mocknet', 'testnet', 'mainnet'],
      default: 'testnet',
    }),
    nodeUrl: flags.string({
      required: false,
      char: 'u',
    }),
    verbose: flags.boolean({
      char: 'v',
      default: false,
    }),
    contractAddress: flags.string({
      char: 'c',
      description:
        'Manually specify the contract address for send-many. If omitted, default contracts will be used.',
    }),
    nonce: flags.integer({
      description: 'Optionally specify a nonce for this transaction',
    }),
  };

  static args = [
    {
      name: 'recipient',
      description: `
A set of recipients in the format of "address,amount_ustx"
Example: STADMRP577SC3MCNP7T3PRSTZBJ75FJ59JGABZTW,100 ST2WPFYAW85A0YK9ACJR8JGWPM19VWYF90J8P5ZTH,50
      `,
    },
  ];

  getNetwork() {
    const { flags } = this.parse(SendMany);
    const networks = {
      mainnet: StacksMainnet,
      testnet: StacksTestnet,
      mocknet: StacksMocknet,
    };

    return networks[flags.network as NetworkString];
  }

  getContract(network: StacksNetwork) {
    return network.chainId === ChainID.Testnet
      ? DEFAULT_TESTNET_CONTRACT
      : DEFAULT_MAINNET_CONTRACT;
  }

  async run() {
    const { argv, flags } = this.parse(SendMany);

    const recipients: Recipient[] = argv.map(arg => {
      const [address, amount] = arg.split(',');
      if (!validateStacksAddress(address)) {
        throw new Error(`${address} is not a valid STX address`);
      }
      if (!isNormalInteger(amount)) {
        throw new Error(`${amount} is not a valid integer.`);
      }
      return {
        address,
        amount,
      };
    });

    const networkClass = this.getNetwork();
    if (!networkClass) {
      throw new Error('Unable to get network');
    }
    const network = new networkClass();
    if (flags.nodeUrl) {
      network.coreApiUrl = flags.nodeUrl;
    }

    const contractIdentifier = this.getContract(network);

    const tx = await sendMany({
      recipients,
      network,
      senderKey: flags.privateKey,
      contractIdentifier,
    });

    const { verbose } = flags;

    if (verbose) this.log('Transaction hex:', tx.serialize().toString('hex'));

    if (flags.broadcast) {
      const result = await broadcastTransaction(tx, network);
      if (flags.verbose) {
        this.log('Transaction ID:', result);
        const explorerLink = `https://explorer.stacks.co/txid/0x${result}`;
        this.log(
          'View in explorer:',
          `${explorerLink}?chain=${
            network.chainId === ChainID.Mainnet ? 'mainnet' : 'testnet'
          }`
        );
      } else {
        console.log(result.toString());
      }
    } else {
      console.log(tx.serialize().toString('hex'));
    }
  }
}
