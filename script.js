const API = `${window.location.protocol}//${window.location.host}`;
const socket = io(API);
const endsAtCache = new Map();
let currentUser = null;

// Toast notification system
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };
    
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="${icons[type]}"></i>
        <div>${message}</div>
    `;
    
    container.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after delay
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode === container) {
                container.removeChild(toast);
            }
        }, 500);
    }, 4000);
}

// Enhanced user management
function getUser() {
    if (!currentUser) {
        const saved = localStorage.getItem("user");
        if (saved) {
            currentUser = JSON.parse(saved);
        }
    }
    return currentUser;
}

function setUser(user) {
    currentUser = user;
    localStorage.setItem("user", JSON.stringify(user));
    updateAvatarColor();
}

// Generate consistent color from username
function updateAvatarColor() {
    const user = getUser();
    if (!user) return;
    
    const avatar = document.getElementById('user-avatar');
    if (!avatar) return;
    
    // Generate color from username hash
    let hash = 0;
    for (let i = 0; i < user.username.length; i++) {
        hash = user.username.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const hue = hash % 360;
    avatar.style.background = `linear-gradient(135deg, hsl(${hue}, 70%, 60%) 0%, hsl(${(hue + 30) % 360}, 70%, 60%) 100%)`;
}

// Enhanced login
function login() {
    const username = document.getElementById("username").value.trim();
    if (!username) {
        showToast("Please enter a username", "error");
        return;
    }

    fetch(`${API}/auth/local`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
    })
    .then(res => res.json())
    .then(user => {
        setUser(user);
        init();
        showToast(`Welcome back, ${user.username}!`, "success");
    })
    .catch((error) => {
        console.error('Login error:', error);
        showToast("Login failed. Please try again.", "error");
    });
}

// Enhanced Telegram login
function onTelegramAuth(user) {
    fetch(`${API}/auth/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user)
    })
    .then(res => res.json())
    .then(dbUser => {
        setUser(dbUser);
        init();
        showToast(`Welcome, ${dbUser.username}!`, "success");
    })
    .catch((error) => {
        console.error('Telegram auth error:', error);
        showToast("Telegram authentication failed", "error");
    });
}

// Enhanced logout
function logout() {
    localStorage.removeItem("user");
    currentUser = null;
    showToast("Logged out successfully", "success");
    setTimeout(() => location.reload(), 1000);
}

// Enhanced initialization
function init() {
    const user = getUser();
    if (!user) {
        // Show login if no user
        document.getElementById("login-box").style.display = "block";
        document.getElementById("app").style.display = "none";
        return;
    }

    document.getElementById("login-box").style.display = "none";
    document.getElementById("app").style.display = "block";

    renderProfile();
    loadAuctions();
    loadTransactions();
}

// Enhanced profile rendering
function renderProfile() {
    const user = getUser();
    if (!user) return;
    
    document.getElementById("username-display").textContent = user.username;
    document.getElementById("balance-display").textContent = user.balance.toLocaleString();
}

// Enhanced wallet adjustment
function adjustBalance(amount) {
    const user = getUser();
    if (!user) return;
    
    if (amount < 0 && Math.abs(amount) > user.balance) {
        showToast("Insufficient balance", "error");
        return;
    }
    
    fetch(`${API}/wallet/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user._id, amount }),
    })
    .then(res => res.json())
    .then(updated => {
        if (updated.error) {
            showToast(updated.error, "error");
            return;
        }
        setUser(updated);
        renderProfile();
        loadTransactions();
        
        const message = amount > 0 
            ? `Added ${amount} credits to your wallet`
            : `Deducted ${Math.abs(amount)} credits from your wallet`;
        showToast(message, "success");
    })
    .catch((error) => {
        console.error('Adjust balance error:', error);
        showToast("Transaction failed", "error");
    });
}

// Enhanced transactions loading
function loadTransactions() {
    const user = getUser();
    if (!user) return;

    fetch(`${API}/transactions?userId=${user._id}`)
        .then(res => res.json())
        .then(txs => {
            const div = document.getElementById("transactions");
            const emptyState = document.getElementById("no-transactions");
            
            if (!txs || !txs.length) {
                div.innerHTML = "";
                emptyState.style.display = "block";
                return;
            }
            
            emptyState.style.display = "none";
            div.innerHTML = "";

            txs.slice(0, 10).forEach(tx => { // Limit to 10 most recent
                const item = document.createElement('div');
                item.className = `transaction-item ${tx.amount > 0 ? 'credit' : 'debit'}`;
                
                const sign = tx.amount > 0 ? "+" : "";
                const amountClass = tx.amount > 0 ? 'positive' : 'negative';
                
                item.innerHTML = `
                    <div>
                        <div class="transaction-type">${tx.type}</div>
                        <div class="transaction-time">${formatDateTime(tx.createdAt)}</div>
                    </div>
                    <div class="transaction-amount ${amountClass}">${sign}${tx.amount} credits</div>
                `;
                
                div.appendChild(item);
            });
        })
        .catch((error) => {
            console.error('Load transactions error:', error);
            showToast("Failed to load transactions", "error");
        });
}

// DateTime formatter
function formatDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Enhanced auctions rendering
function renderAuctions(auctions) {
    const div = document.getElementById("auctions");
    const emptyState = document.getElementById("no-auctions");
    
    if (!auctions || !auctions.length) {
        div.innerHTML = "";
        emptyState.style.display = "block";
        return;
    }
    
    emptyState.style.display = "none";
    div.innerHTML = "";

    auctions.forEach(a => {
        const endsAtMs = a.endsAt ? new Date(a.endsAt).getTime() : null;
        if (endsAtMs) endsAtCache.set(a._id, endsAtMs);

        const leftSec = endsAtMs ? Math.max(0, Math.floor((endsAtMs - Date.now()) / 1000)) : 0;
        const ended = !a.isActive || leftSec <= 0;

        const auctionCard = document.createElement('div');
        auctionCard.className = `auction-card ${ended ? 'ended' : ''}`;
        auctionCard.id = `auction-${a._id}`;
        
        auctionCard.innerHTML = `
            <div class="auction-header">
                <div class="auction-title">${a.item}</div>
                <div class="auction-badge ${ended ? 'badge-ended' : 'badge-live'}">
                    ${ended ? 'Ended' : 'Live'}
                </div>
            </div>
            
            <div class="auction-info">
                <div class="info-item">
                    <div class="info-label">Starting Price</div>
                    <div class="info-value">${a.startingPrice} credits</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Highest Bid</div>
                    <div class="info-value highlight">${a.highestBid} credits</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Winner</div>
                    <div class="info-value">${a.highestBidder ? a.highestBidder.username : '-'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Bids</div>
                    <div class="info-value">${a.bidCount || 0}</div>
                </div>
            </div>
            
            <div class="timer-container">
                <div class="timer-label">Time Remaining</div>
                <div class="timer" id="timer-${a._id}">${formatTime(leftSec)}</div>
            </div>
            
            <div class="bid-form">
                <input type="number" 
                       id="bid-${a._id}" 
                       class="bid-input" 
                       placeholder="Enter your bid" 
                       ${ended ? "disabled" : ""}
                       min="${a.highestBid + 1}"
                       value="${a.highestBid + 1}">
                <button class="btn btn-primary" 
                        onclick="bid('${a._id}')" 
                        ${ended ? "disabled" : ""}>
                    <i class="fas fa-gavel"></i> ${ended ? 'Auction Ended' : 'Place Bid'}
                </button>
            </div>
            
            <div class="auction-footer">
                <i class="fas fa-shield-alt"></i> Anti-sniping: ${a.snipingWindowSec}s window, extends by ${a.extendSec}s
            </div>
        `;
        
        div.appendChild(auctionCard);
    });
}

// Time formatting helper
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Enhanced auction creation
function createAuction() {
    const item = document.getElementById("item").value.trim();
    const price = Number(document.getElementById("price").value);

    const durationSec = Number(document.getElementById("durationSec").value);
    const snipingWindowSec = Number(document.getElementById("snipingWindowSec").value);
    const extendSec = Number(document.getElementById("extendSec").value);

    if (!item || !price) {
        showToast("Please fill in all fields", "error");
        return;
    }

    if (price <= 0) {
        showToast("Price must be greater than 0", "error");
        return;
    }

    fetch(`${API}/auctions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            item,
            startingPrice: price,
            durationSec,
            snipingWindowSec,
            extendSec
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, "error");
            return;
        }
        
        document.getElementById("item").value = "";
        document.getElementById("price").value = "";
        
        showToast(`Auction "${item}" created successfully!`, "success");
        loadAuctions();
    })
    .catch((error) => {
        console.error('Create auction error:', error);
        showToast("Failed to create auction", "error");
    });
}

// Enhanced bidding
function bid(auctionId) {
    const user = getUser();
    if (!user) {
        showToast("Please login first", "error");
        return;
    }
    
    const amount = Number(document.getElementById(`bid-${auctionId}`).value);
    const auctionCard = document.getElementById(`auction-${auctionId}`);
    
    if (!amount || amount <= 0) {
        showToast("Please enter a valid bid amount", "error");
        return;
    }

    // Add loading state
    const btn = auctionCard.querySelector('button');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    btn.disabled = true;

    fetch(`${API}/auctions/${auctionId}/bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user._id, amount })
    })
    .then(res => res.json())
    .then(data => {
        // Restore button state
        btn.innerHTML = originalText;
        btn.disabled = false;
        
        if (data.error) {
            showToast(data.error, "error");
            return;
        }
        
        if (data.user) {
            setUser(data.user);
            renderProfile();
            loadTransactions();
            showToast(`Bid of ${amount} credits placed successfully!`, "success");
            
            // Update bid input minimum
            const bidInput = document.getElementById(`bid-${auctionId}`);
            if (bidInput && data.auction) {
                bidInput.min = data.auction.highestBid + 1;
                bidInput.value = data.auction.highestBid + 1;
            }
        }
    })
    .catch((error) => {
        console.error('Bid error:', error);
        btn.innerHTML = originalText;
        btn.disabled = false;
        showToast("Bid failed. Please try again.", "error");
    });
}

// Enhanced WebSocket updates
socket.on("auctionUpdated", (auction) => {
    if (auction.endsAt) {
        endsAtCache.set(auction._id, new Date(auction.endsAt).getTime());
    }

    const card = document.getElementById(`auction-${auction._id}`);
    const emptyState = document.getElementById("no-auctions");
    
    if (!card) {
        loadAuctions();
        return;
    }

    const endsAtMs = auction.endsAt ? new Date(auction.endsAt).getTime() : null;
    const leftSec = endsAtMs ? Math.max(0, Math.floor((endsAtMs - Date.now()) / 1000)) : 0;
    const ended = !auction.isActive || leftSec <= 0;

    card.className = `auction-card ${ended ? 'ended' : ''}`;
    card.innerHTML = `
        <div class="auction-header">
            <div class="auction-title">${auction.item}</div>
            <div class="auction-badge ${ended ? 'badge-ended' : 'badge-live'}">
                ${ended ? 'Ended' : 'Live'}
            </div>
        </div>
        
        <div class="auction-info">
            <div class="info-item">
                <div class="info-label">Starting Price</div>
                <div class="info-value">${auction.startingPrice} credits</div>
            </div>
            <div class="info-item">
                <div class="info-label">Highest Bid</div>
                <div class="info-value highlight">${auction.highestBid} credits</div>
            </div>
            <div class="info-item">
                <div class="info-label">Winner</div>
                <div class="info-value">${auction.highestBidder ? auction.highestBidder.username : '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Bids</div>
                <div class="info-value">${auction.bidCount || 0}</div>
            </div>
        </div>
        
        <div class="timer-container">
            <div class="timer-label">Time Remaining</div>
            <div class="timer" id="timer-${auction._id}">${formatTime(leftSec)}</div>
        </div>
        
        <div class="bid-form">
            <input type="number" 
                   id="bid-${auction._id}" 
                   class="bid-input" 
                   placeholder="Enter your bid" 
                   ${ended ? "disabled" : ""}
                   min="${auction.highestBid + 1}"
                   value="${auction.highestBid + 1}">
            <button class="btn btn-primary" 
                    onclick="bid('${auction._id}')" 
                    ${ended ? "disabled" : ""}>
                <i class="fas fa-gavel"></i> ${ended ? 'Auction Ended' : 'Place Bid'}
            </button>
        </div>
        
        <div class="auction-footer">
            <i class="fas fa-shield-alt"></i> Anti-sniping: ${auction.snipingWindowSec}s window, extends by ${auction.extendSec}s
        </div>
    `;
    
    // Hide empty state if showing
    if (emptyState.style.display === 'block') {
        loadAuctions();
    }
});

// Enhanced timer
setInterval(() => {
    for (const [auctionId, endsAtMs] of endsAtCache.entries()) {
        const timerElement = document.getElementById(`timer-${auctionId}`);
        if (!timerElement) continue;

        const leftSec = Math.max(0, Math.floor((endsAtMs - Date.now()) / 1000));
        timerElement.textContent = formatTime(leftSec);

        if (leftSec <= 0) {
            const card = document.getElementById(`auction-${auctionId}`);
            if (card && !card.classList.contains('ended')) {
                card.classList.add('ended');
                
                // Update badge if exists
                const badge = card.querySelector('.auction-badge');
                if (badge) {
                    badge.className = 'auction-badge badge-ended';
                    badge.textContent = 'Ended';
                }
                
                // Disable bid form
                const bidInput = card.querySelector('.bid-input');
                const bidButton = card.querySelector('button');
                if (bidInput) bidInput.disabled = true;
                if (bidButton) {
                    bidButton.disabled = true;
                    bidButton.innerHTML = '<i class="fas fa-gavel"></i> Auction Ended';
                }
            }
        }
        
        // Remove expired auctions from cache
        if (leftSec <= -60) { // 1 minute after expiration
            endsAtCache.delete(auctionId);
        }
    }
}, 500);

// Load auctions
function loadAuctions() {
    fetch(`${API}/auctions`)
        .then(res => res.json())
        .then(auctions => renderAuctions(auctions))
        .catch((error) => {
            console.error('Load auctions error:', error);
            showToast("Failed to load auctions", "error");
        });
}

// Auto-refresh auctions every 30 seconds
setInterval(() => {
    if (getUser()) {
        loadAuctions();
    }
}, 30000);

// Initialize app on load
document.addEventListener('DOMContentLoaded', () => {
    init();
    
    // Add event listeners for Enter key in login
    const usernameInput = document.getElementById('username');
    if (usernameInput) {
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                login();
            }
        });
    }
    
    // Add event listeners for auction creation form
    const itemInput = document.getElementById('item');
    const priceInput = document.getElementById('price');
    
    if (itemInput && priceInput) {
        itemInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && priceInput.value) {
                createAuction();
            }
        });
        
        priceInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && itemInput.value) {
                createAuction();
            }
        });
    }
});

// Add CSS for auction footer
const style = document.createElement('style');
style.textContent = `
    .auction-footer {
        margin-top: 15px;
        font-size: 0.9rem;
        color: var(--gray);
        display: flex;
        align-items: center;
        gap: 8px;
    }
`;
document.head.appendChild(style);