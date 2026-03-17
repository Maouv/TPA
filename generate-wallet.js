const fs = require('fs');
const crypto = require('crypto');

try {
    // Generate random wallet data
    const walletData = {
        address: '0x' + crypto.randomBytes(20).toString('hex'),
        privateKey: '0x' + crypto.randomBytes(32).toString('hex'),
        mnemonic: crypto.randomBytes(16).toString('hex').match(/.{1,4}/g).join(' '),
        createdAt: new Date().toISOString()
    };

    // Write to file
    fs.writeFileSync('ethereum-wallet.json', JSON.stringify(walletData, null, 2));
    
    console.log('Wallet generated successfully!');
    console.log('Address:', walletData.address);
    console.log('Saved to: ethereum-wallet.json');
    
} catch (error) {
    console.error('Error generating wallet:', error.message);
    process.exit(1);
}
