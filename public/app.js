// TrueBlock Mini-App - JavaScript functionality
class TrueBlockMiniApp {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.contract = null;
        this.contractAddress = null;
        this.contractABI = null;
        
        // Contract ABI (simplified for mini-app)
        this.contractABI = [
            "function submitTruthCheck(string content, string category) external",
            "function voteOnTruthCheck(bytes32 checkId, uint256 truthScore) external",
            "function getRecentChecks(uint256 limit) external view returns (bytes32[])",
            "function getCheckDetails(bytes32 checkId) external view returns (string content, uint256 timestamp, uint256 truthScore, uint256 totalVotes, bool isVerified, address submitter, string category)",
            "function getMiniAppStats() external view returns (uint256 totalChecks, uint256 verifiedChecks, uint256 totalUsers, uint256 totalVotes)",
            "function getUserProfile(address user) external view returns (uint256 reputation, uint256 totalChecks, uint256 correctPredictions, bool isActive, uint256 lastActive)",
            "event TruthCheckSubmitted(bytes32 indexed checkId, string content, address submitter)",
            "event TruthCheckVoted(bytes32 indexed checkId, address voter, uint256 truthScore)",
            "event TruthCheckVerified(bytes32 indexed checkId, uint256 finalScore)"
        ];
        
        this.init();
    }
    
    async init() {
        this.setupEventListeners();
        this.checkWalletConnection();
        this.loadStats();
        this.loadRecentChecks();
    }
    
    setupEventListeners() {
        // Connect wallet button
        document.getElementById('connectWallet').addEventListener('click', () => {
            this.connectWallet();
        });
        
        // Submit truth check form
        document.getElementById('truthCheckForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitTruthCheck();
        });
    }
    
    async checkWalletConnection() {
        if (typeof window.ethereum !== 'undefined') {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (accounts.length > 0) {
                    await this.setupProvider(accounts[0]);
                }
            } catch (error) {
                console.log('No wallet connected');
            }
        }
    }
    
    async connectWallet() {
        if (typeof window.ethereum === 'undefined') {
            this.showError('Por favor instala MetaMask o una wallet compatible');
            return;
        }
        
        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            if (accounts.length > 0) {
                await this.setupProvider(accounts[0]);
                this.showSuccess('Wallet conectada exitosamente!');
            }
        } catch (error) {
            this.showError('Error conectando wallet: ' + error.message);
        }
    }
    
    async setupProvider(account) {
        try {
            this.provider = new ethers.providers.Web3Provider(window.ethereum);
            this.signer = this.provider.getSigner();
            
            // Check if we're on Base network
            const network = await this.provider.getNetwork();
            if (network.chainId !== 8453 && network.chainId !== 84532) { // Base mainnet and testnet
                this.showError('Por favor cambia a la red Base en tu wallet');
                return;
            }
            
            // Update UI
            this.updateWalletInfo(account);
            
            // Setup contract if address is available
            if (this.contractAddress) {
                this.setupContract();
            }
            
            // Listen for account changes
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length > 0) {
                    this.setupProvider(accounts[0]);
                } else {
                    this.disconnectWallet();
                }
            });
            
        } catch (error) {
            this.showError('Error configurando provider: ' + error.message);
        }
    }
    
    updateWalletInfo(account) {
        const walletInfo = document.getElementById('walletInfo');
        walletInfo.className = 'wallet-info connected';
        walletInfo.innerHTML = `
            <p>✅ Wallet conectada</p>
            <p><strong>Cuenta:</strong> ${account.substring(0, 6)}...${account.substring(38)}</p>
            <button id="disconnectWallet" class="btn">Desconectar</button>
        `;
        
        document.getElementById('disconnectWallet').addEventListener('click', () => {
            this.disconnectWallet();
        });
    }
    
    disconnectWallet() {
        this.provider = null;
        this.signer = null;
        this.contract = null;
        
        const walletInfo = document.getElementById('walletInfo');
        walletInfo.className = 'wallet-info not-connected';
        walletInfo.innerHTML = `
            <p>Conecta tu wallet de Base para empezar</p>
            <button id="connectWallet" class="btn">Conectar Wallet</button>
        `;
        
        document.getElementById('connectWallet').addEventListener('click', () => {
            this.connectWallet();
        });
        
        this.loadRecentChecks();
        this.loadStats();
    }
    
    setupContract() {
        if (!this.provider || !this.signer) return;
        
        try {
            this.contract = new ethers.Contract(this.contractAddress, this.contractABI, this.signer);
            console.log('Contract setup complete');
        } catch (error) {
            this.showError('Error configurando contrato: ' + error.message);
        }
    }
    
    async submitTruthCheck() {
        if (!this.contract) {
            this.showError('Por favor conecta tu wallet primero');
            return;
        }
        
        const content = document.getElementById('content').value.trim();
        const category = document.getElementById('category').value;
        
        if (!content) {
            this.showError('Por favor ingresa contenido para verificar');
            return;
        }
        
        try {
            const submitButton = document.querySelector('#truthCheckForm button[type="submit"]');
            submitButton.disabled = true;
            submitButton.textContent = 'Enviando...';
            
            const tx = await this.contract.submitTruthCheck(content, category);
            this.showSuccess('Transacción enviada! Hash: ' + tx.hash.substring(0, 10) + '...');
            
            // Wait for confirmation
            await tx.wait();
            this.showSuccess('Verificación enviada exitosamente!');
            
            // Reset form and reload data
            document.getElementById('truthCheckForm').reset();
            this.loadRecentChecks();
            this.loadStats();
            
        } catch (error) {
            this.showError('Error enviando verificación: ' + error.message);
        } finally {
            const submitButton = document.querySelector('#truthCheckForm button[type="submit"]');
            submitButton.disabled = false;
            submitButton.textContent = '🚀 Enviar para Verificación';
        }
    }
    
    async loadRecentChecks() {
        const recentChecksDiv = document.getElementById('recentChecks');
        
        if (!this.contract) {
            recentChecksDiv.innerHTML = '<p>Conecta tu wallet para ver verificaciones</p>';
            return;
        }
        
        try {
            recentChecksDiv.innerHTML = '<div class="loading">Cargando verificaciones...</div>';
            
            const recentChecks = await this.contract.getRecentChecks(10);
            
            if (recentChecks.length === 0) {
                recentChecksDiv.innerHTML = '<p>No hay verificaciones aún. ¡Sé el primero en enviar una!</p>';
                return;
            }
            
            let html = '';
            for (let i = recentChecks.length - 1; i >= 0; i--) {
                const checkId = recentChecks[i];
                const checkDetails = await this.contract.getCheckDetails(checkId);
                
                html += this.createTruthCheckHTML(checkId, checkDetails);
            }
            
            recentChecksDiv.innerHTML = html;
            
        } catch (error) {
            recentChecksDiv.innerHTML = '<div class="error">Error cargando verificaciones: ' + error.message + '</div>';
        }
    }
    
    createTruthCheckHTML(checkId, details) {
        const [content, timestamp, truthScore, totalVotes, isVerified, submitter, category] = details;
        const date = new Date(timestamp * 1000).toLocaleDateString();
        const scoreClass = this.getScoreClass(truthScore);
        
        return `
            <div class="truth-check ${isVerified ? 'verified' : ''}">
                <h4>${this.getCategoryEmoji(category)} ${category}</h4>
                <p><strong>Contenido:</strong> ${content}</p>
                <p><strong>Enviado:</strong> ${date} por ${submitter.substring(0, 6)}...${submitter.substring(38)}</p>
                <p><strong>Votos:</strong> ${totalVotes}</p>
                ${isVerified ? `<span class="truth-score ${scoreClass}">Score: ${truthScore}/100</span>` : '<p><em>Pendiente de verificación</em></p>'}
                ${!isVerified ? `<button onclick="app.voteOnCheck('${checkId}')" class="btn">🗳️ Votar</button>` : ''}
            </div>
        `;
    }
    
    getScoreClass(score) {
        if (score >= 70) return 'score-high';
        if (score >= 40) return 'score-medium';
        return 'score-low';
    }
    
    getCategoryEmoji(category) {
        const emojis = {
            'news': '📰',
            'meme': '😄',
            'quote': '💬',
            'fact': '🔍'
        };
        return emojis[category] || '📝';
    }
    
    async voteOnCheck(checkId) {
        if (!this.contract) {
            this.showError('Por favor conecta tu wallet primero');
            return;
        }
        
        const score = prompt('Vota del 0 al 100 (0 = falso, 100 = verdadero):');
        if (score === null || score === '') return;
        
        const numScore = parseInt(score);
        if (isNaN(numScore) || numScore < 0 || numScore > 100) {
            this.showError('Por favor ingresa un número del 0 al 100');
            return;
        }
        
        try {
            const tx = await this.contract.voteOnTruthCheck(checkId, numScore);
            this.showSuccess('Voto enviado! Hash: ' + tx.hash.substring(0, 10) + '...');
            
            await tx.wait();
            this.showSuccess('Voto registrado exitosamente!');
            
            this.loadRecentChecks();
            this.loadStats();
            
        } catch (error) {
            this.showError('Error enviando voto: ' + error.message);
        }
    }
    
    async loadStats() {
        const statsDiv = document.getElementById('stats');
        
        if (!this.contract) {
            statsDiv.innerHTML = '<p>Conecta tu wallet para ver estadísticas</p>';
            return;
        }
        
        try {
            const stats = await this.contract.getMiniAppStats();
            const [totalChecks, verifiedChecks, totalUsers, totalVotes] = stats;
            
            document.getElementById('totalChecks').textContent = totalChecks.toString();
            document.getElementById('verifiedChecks').textContent = verifiedChecks.toString();
            document.getElementById('totalUsers').textContent = totalUsers.toString();
            document.getElementById('totalVotes').textContent = totalVotes.toString();
            
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }
    
    showSuccess(message) {
        this.showMessage(message, 'success');
    }
    
    showError(message) {
        this.showMessage(message, 'error');
    }
    
    showMessage(message, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = type;
        messageDiv.textContent = message;
        
        const content = document.querySelector('.content');
        content.insertBefore(messageDiv, content.firstChild);
        
        setTimeout(() => {
            messageDiv.remove();
        }, 5000);
    }
}

// Initialize the mini-app when page loads
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new TrueBlockMiniApp();
});

// Make app globally available for button clicks
window.app = app;
