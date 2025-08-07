import SignClient from '@walletconnect/sign-client';
import {
  Client,
  TransferTransaction,
  Hbar,
  AccountId,
  TransactionId,
  Transaction,
  HbarUnit,
} from '@hashgraph/sdk';

export async function connectAureusWalletAndSendHbar(
  destinationAccount: string, // 0.0.x of the recipient
) {
  // 1. Initialize Client and WalletConnect
  const client = Client.forName('testnet');
  const wc = await SignClient.init({
    projectId: 'f9d8863ab6c03f2293d7d56d7c0c0853', // Replace with your Project ID
    metadata: {
      name: 'Carbon DeFi',
      description: 'Hedera DApp',
      url: 'http://localhost:3000',
      icons: ['https://yourapp.com/logo.png'],
    },
  });

  // 2. Connect to Wallet
  const { uri, approval } = await wc.connect({
    requiredNamespaces: {
      hedera: {
        chains: ['hedera:testnet'],
        methods: ['hedera_signTransaction'],
        events: [],
      },
    },
  });

  if (uri) console.log('WalletConnect URI:', uri);
  const session = await approval();
  console.log('Session established:', session);

  // 3. Prepare the Transaction
  const [_, , accountIdStr] = session.namespaces.hedera.accounts[0].split(':');
  const payerAccountId = AccountId.fromString(accountIdStr);

  const tx = new TransferTransaction()
    .setTransactionId(TransactionId.generate(payerAccountId))
    .setNodeAccountIds([new AccountId(3)]) // Freeze to a single node
    .addHbarTransfer(payerAccountId, Hbar.from(-1, HbarUnit.Hbar))
    .addHbarTransfer(destinationAccount, Hbar.from(1, HbarUnit.Hbar))
    .setTransactionMemo('WC Test');

  // Freeze the transaction body
  tx.freeze();

  const transactionBody = Buffer.from(tx.toBytes()).toString('base64');

  // 4. Request Signature from Wallet
  const responseFromWallet = await wc.request({
    topic: session.topic,
    chainId: 'hedera:testnet',
    request: {
      method: 'hedera_signTransaction',
      params: {
        signerAccountId: `hedera:testnet:${accountIdStr}`,
        transactionBody: transactionBody,
      },
    },
  });

  console.log('Wallet Response:', responseFromWallet);
  const { signedTransaction } = responseFromWallet as {
    signedTransaction: string;
  };
  const signedTxBytes = Uint8Array.from(
    Buffer.from(signedTransaction, 'base64'),
  );

  // 5. Submit the Signed Transaction (The Correct Method)
  // Rehydrate the transaction from the bytes returned by the wallet
  const signedTx = Transaction.fromBytes(signedTxBytes);

  // Execute using the client. This will fail if the wallet returned a bad signature.
  console.log('Submitting the transaction...');
  const result = await signedTx.execute(client);

  console.log('Transaction submitted. Waiting for receipt...');
  const receipt = await result.getReceipt(client);

  console.log('✅ Success! Transaction status:', receipt.status.toString());
  return result; // Return the TransactionResponse// TransactionResponse
}
