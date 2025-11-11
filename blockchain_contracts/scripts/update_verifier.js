const Web3 = require('web3');
const fs = require('fs');

const web3 = new Web3('http://localhost:10545');

// Load deployment info
const deployment = JSON.parse(fs.readFileSync('./artifacts/sbt_deployment.json', 'utf8'));
const citizenSBTABI = JSON.parse(fs.readFileSync('./artifacts/CitizenSBT.abi.json', 'utf8'));

const contractAddress = deployment.contracts.CitizenSBT.address;
const contract = new web3.eth.Contract(citizenSBTABI, contractAddress);

async function updateVerifier(newVerifier) {
    const accounts = await web3.eth.getAccounts();
    const deployer = accounts[0]; // Contract owner
    
    console.log('Current verifier:', await contract.methods.verifier().call());
    console.log('Setting new verifier to:', newVerifier);
    
    const receipt = await contract.methods.updateVerifier(newVerifier).send({
        from: deployer,
        gas: 100000
    });
    
    console.log('✓ Verifier updated! TX:', receipt.transactionHash);
    console.log('New verifier:', await contract.methods.verifier().call());
}

// Get new verifier from command line or use first account
const newVerifier = process.argv[2];
if (!newVerifier) {
    web3.eth.getAccounts().then(accounts => {
        console.log('Available accounts:');
        accounts.forEach((acc, i) => console.log(`  [${i}] ${acc}`));
        console.log('\nUsage: node update_verifier.js <verifier_address>');
    });
} else {
    updateVerifier(newVerifier).catch(console.error);
}
