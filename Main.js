// --- 1. शुरुआती सेटअप ---
const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // !! यहाँ अपना Supabase URL पेस्ट करें !!
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // !! यहाँ अपनी Supabase Anon Key पेस्ट करें !!
const MIN_WITHDRAWAL = 100000; // न्यूनतम विथड्रॉवल राशि

let supabaseClient;
try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
    console.error(e);
    alert("Supabase client banane me error aayi. Keys check karen.");
}

const tg = window.Telegram.WebApp;

// --- 2. HTML एलिमेंट्स ---
const scoreEl = document.getElementById('score');
const energyEl = document.getElementById('energy');
const maxEnergyEl = document.getElementById('max-energy');
const tapButton = document.getElementById('tap-button');
const energyBar = document.getElementById('energy-bar');
const usernameEl = document.getElementById('username');
const adsButton = document.getElementById('ads-button');
const withdrawButton = document.getElementById('withdraw-button');
const withdrawModal = document.getElementById('withdraw-modal');
const closeModalButton = document.getElementById('close-modal');
const submitWithdrawalButton = document.getElementById('submit-withdrawal');
const walletAddressInput = document.getElementById('wallet-address');

// --- 3. गेम वेरिएबल्स ---
let userData = null;
let currentEnergy = 0;
let adRewardCooldown = false;

// --- 4. मुख्य फंक्शन ---

window.onload = () => {
    tg.ready();
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        const user = tg.initDataUnsafe.user;
        usernameEl.textContent = user.first_name || 'Player';
        loadOrCreateUser(user);
    } else {
        usernameEl.textContent = "Test Mode";
    }
    
    setInterval(rechargeEnergy, 1000);
    setInterval(() => { if (userData) saveData(); }, 10000);
};

async function loadOrCreateUser(user) {
    try {
        const { data, error } = await supabaseClient.from('users').select('*').eq('user_id', user.id).single();
        if (error && error.code === 'PGRST116') {
            const { data: newUser, error: createError } = await supabaseClient.from('users').insert([{ user_id: user.id, username: user.username, coins: 0, energy: 1000, max_energy: 1000 }]).select().single();
            if (createError) throw createError;
            userData = newUser;
        } else if (error) { throw error; } 
        else { userData = data; }
        currentEnergy = userData.energy;
        updateUI();
    } catch (err) { console.error("User data load error:", err.message); }
}

function updateUI() {
    if (!userData) return;
    scoreEl.textContent = userData.coins.toLocaleString();
    energyEl.textContent = Math.floor(currentEnergy);
    maxEnergyEl.textContent = userData.max_energy;
    energyBar.style.width = `${(currentEnergy / userData.max_energy) * 100}%`;
}

tapButton.addEventListener('click', () => {
    if (currentEnergy >= 1) {
        currentEnergy--;
        userData.coins += (userData.multitap_level || 1);
        updateUI();
    }
});

function rechargeEnergy() {
    if (userData && currentEnergy < userData.max_energy) {
        currentEnergy = Math.min(userData.max_energy, currentEnergy + (userData.recharge_level || 1));
        updateUI();
    }
}

async function saveData() {
    if (!userData) return;
    try {
        userData.energy = Math.floor(currentEnergy);
        await supabaseClient.from('users').update({ coins: userData.coins, energy: userData.energy }).eq('user_id', userData.user_id);
    } catch (err) { console.error("Data save error:", err.message); }
}

// --- 5. एक्शन बटन लॉजिक ---

// विज्ञापन बटन
adsButton.addEventListener('click', () => {
    if (adRewardCooldown) {
        tg.showAlert("Aap 1 minute me dobara reward le sakte hain.");
        return;
    }
    currentEnergy = userData.max_energy;
    updateUI();
    saveData();
    tg.showAlert("Aapki energy full ho gayi hai!");
    adRewardCooldown = true;
    adsButton.disabled = true;
    setTimeout(() => { adsButton.disabled = false; }, 60000);
});

// विथड्रॉवल बटन
withdrawButton.addEventListener('click', () => {
    withdrawModal.style.display = 'flex';
});

closeModalButton.addEventListener('click', () => {
    withdrawModal.style.display = 'none';
});

submitWithdrawalButton.addEventListener('click', async () => {
    const walletAddress = walletAddressInput.value.trim();
    if (userData.coins < MIN_WITHDRAWAL) {
        tg.showAlert(`Aapke paas kam se kam ${MIN_WITHDRAWAL.toLocaleString()} coins hone chahiye.`);
        return;
    }
    if (walletAddress.length < 20) { // Basic validation
        tg.showAlert("Please enter a valid wallet address.");
        return;
    }

    submitWithdrawalButton.disabled = true;
    submitWithdrawalButton.textContent = "Processing...";

    try {
        // 1. विथड्रॉवल टेबल में रिक्वेस्ट डालें
        const { error: reqError } = await supabaseClient.from('withdrawals').insert([
            { user_id: userData.user_id, coins_requested: userData.coins, wallet_address: walletAddress, status: 'pending' }
        ]);
        if (reqError) throw reqError;

        // 2. यूज़र के कॉइन्स को 0 कर दें
        const oldCoins = userData.coins;
        userData.coins = 0;
        await saveData();
        updateUI();

        tg.showAlert(`Aapki ${oldCoins.toLocaleString()} coins ki withdrawal request bhej di gayi hai. Verification ke baad coins transfer ho jayenge.`);
        withdrawModal.style.display = 'none';

    } catch (err) {
        console.error("Withdrawal error:", err.message);
        tg.showAlert("Request fail ho gayi. Please dobara try karen.");
    } finally {
        submitWithdrawalButton.disabled = false;
        submitWithdrawalButton.textContent = "Submit Request";
    }
});
