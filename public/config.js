// TrueBlock Mini-App Configuration
const config = {
    // Contract addresses (update after deployment)
    contracts: {
        base: {
            mainnet: "0x0000000000000000000000000000000000000000", // Update after deployment
            testnet: "0x0000000000000000000000000000000000000000"  // Update after deployment
        }
    },
    
    // Network configuration
    networks: {
        base: {
            chainId: 8453,
            name: "Base",
            rpcUrl: "https://mainnet.base.org",
            explorer: "https://basescan.org"
        },
        baseTestnet: {
            chainId: 84532,
            name: "Base Sepolia",
            rpcUrl: "https://sepolia.base.org",
            explorer: "https://sepolia.basescan.org"
        }
    },
    
    // App settings
    app: {
        name: "TrueBlock Mini-App",
        version: "1.0.0",
        description: "Truth checking mini-app for Base - simple, snappy, and fun!",
        minVotesForVerification: 5,
        maxRecentChecks: 10
    },
    
    // UI settings
    ui: {
        theme: "light",
        language: "es",
        autoRefresh: true,
        refreshInterval: 30000 // 30 seconds
    }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = config;
} else {
    window.config = config;
}
