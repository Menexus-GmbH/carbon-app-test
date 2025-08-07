import SignClient from '@walletconnect/sign-client';
import {
  Client,
  TransferTransaction,
  Hbar,
  AccountId,
  TransactionId,
  Transaction,
} from '@hashgraph/sdk';

export async function connectAureusWalletAndSendHbar(
  destinationAccount: string, // 0.0.x of the recipient
) {
  const client = Client.forName('testnet');
  /* 1 — open / reuse a WalletConnect session */
  const wc = await SignClient.init({
    projectId: 'f9d8863ab6c03f2293d7d56d7c0c0853',
    metadata: {
      name: 'Carbon DeFi',
      description: 'Hedera DApp',
      url: 'http://localhost:3000',
      icons: ['https://yourapp.com/logo.png'],
    },
  });

  const { uri, approval } = await wc.connect({
    requiredNamespaces: {
      hedera: {
        chains: ['hedera:testnet'],
        methods: ['hedera_signTransaction'], // only request signature
        events: ['accountsChanged', 'chainChanged'],
      },
    },
  });

  if (uri) console.log('WalletConnect URI:', uri);
  const session = await approval();

  /* 2 — payer account from session */
  const [, , accountIdStr] = session.namespaces.hedera.accounts[0].split(':');
  const payer = AccountId.fromString(accountIdStr);
  const signer = `hedera:testnet:${accountIdStr}`;

  /* 3 — build a 1 HBAR transfer */
  const tx = new TransferTransaction()
    .addHbarTransfer(payer, Hbar.fromTinybars(-100_000_000))
    .addHbarTransfer(destinationAccount, Hbar.fromTinybars(100_000_000))
    .setTransactionMemo('Carbon DeFi test transfer')
    // ────────────────────────────────────────────────────────────
    // 🔥 Add this line to freeze with a single node only:
    .setNodeAccountIds([new AccountId(3)])
    // ────────────────────────────────────────────────────────────
    .setTransactionId(TransactionId.generate(payer));

  await tx.freezeWith(client);

  const transactionList = Buffer.from(tx.toBytes()).toString('base64');

  // 1. Get the raw RPC response and assert its shape
  const response = await wc.request({
    topic: session.topic,
    chainId: 'hedera:testnet',
    request: {
      method: 'hedera_signTransaction',
      params: {
        signerAccountId: signer,
        transactionBody: transactionList, // ← correct key per spec
      },
    },
  });

  console.log('💡 WC response:', response);

  // ✔️ CORRECT: pull signedTransaction straight from raw
  const { signedTransaction } = response as {
    signature: string;
    signedTransaction: string;
  };

  if (!signedTransaction) {
    throw new Error('Wallet did not return a signedTransaction');
  }

  // 3. Decode and rehydrate
  const signedTxBytes = Uint8Array.from(
    Buffer.from(signedTransaction, 'base64'),
  );
  const signedTx = Transaction.fromBytes(signedTxBytes);

  // 4. Submit via SDK

  const result = await signedTx.execute(client);
  console.log('✅ Transaction sent:', result.transactionId.toString());

  return result; // TransactionResponse
}
