import { ItemView, WorkspaceLeaf, IconName } from 'obsidian';
import Lv999Plugin from './main';

export const VIEW_TYPE_CASINO = 'lv999-casino';

interface GachaItem {
    name: string;
    rarity: 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic';
    desc: string;
}

const GACHA_ITEMS: GachaItem[] = [
    // Common (50% drop rate pool)
    { name: 'Rusty Dagger', rarity: 'Common', desc: 'A chipped iron dagger covered in rust. Barely cuts rope.' },
    { name: 'Wooden Shield', rarity: 'Common', desc: 'Splintered oak planks held together by rusted iron bands.' },
    { name: 'Torn Grimoire Page', rarity: 'Common', desc: 'A scrap of ancient vellum with faded, unreadable runes.' },
    { name: 'Threadbare Cloak', rarity: 'Common', desc: 'A dusty, moth-eaten cloak offering minimal protection from the cold.' },
    { name: 'Dull Sword', rarity: 'Common', desc: 'An old training sword. The edge has been thoroughly blunted.' },
    { name: 'Blunt Arrow', rarity: 'Common', desc: 'An arrow with its flint tip long broken off.' },
    { name: 'Chipped Sapphire', rarity: 'Common', desc: 'A tiny blue gemstone with numerous cracks.' },
    { name: 'Old Boot', rarity: 'Common', desc: 'An old leather boot. Smells faintly of swamp water.' },
    { name: 'Copper Ring', rarity: 'Common', desc: 'A simple band of copper that leaves a green mark on the finger.' },
    { name: 'Rusted Helmet', rarity: 'Common', desc: 'An iron cap that has seen better centuries.' },

    // Uncommon (35% drop rate pool)
    { name: 'Steel Dagger', rarity: 'Uncommon', desc: 'A well-crafted steel blade that catches the light nicely.' },
    { name: 'Iron Shield', rarity: 'Uncommon', desc: 'A sturdy iron buckler capable of deflecting solid strikes.' },
    { name: 'Spell Scroll', rarity: 'Uncommon', desc: 'A scroll containing a basic fire bolt incantation.' },
    { name: 'Leather Vest', rarity: 'Uncommon', desc: 'Reinforced leather armor that fits snugly.' },
    { name: 'Broad Arrow', rarity: 'Uncommon', desc: 'A heavy arrow with a wide, lethal arrowhead.' },
    { name: 'Silver Ring', rarity: 'Uncommon', desc: 'A polished silver band, engraved with geometric patterns.' },
    { name: 'Health Potion', rarity: 'Uncommon', desc: 'A vial of glowing red liquid that speeds up minor wound healing.' },
    { name: 'Mana Potion', rarity: 'Uncommon', desc: 'A swirling blue potion that temporarily restores spiritual energy.' },
    { name: 'Apprentice Wand', rarity: 'Uncommon', desc: 'A slender hazel wand that hums when magical phrases are spoken.' },
    { name: 'Iron Greaves', rarity: 'Uncommon', desc: 'Heavy leg protection designed to endure heavy impacts.' },

    // Rare (11.5% drop rate pool)
    { name: 'Mithril Dagger', rarity: 'Rare', desc: 'An incredibly light and sharp blade made from precious mithril.' },
    { name: 'Reinforced Kite Shield', rarity: 'Rare', desc: 'A large, steel-plated shield decorated with a lion insignia.' },
    { name: 'Ancient Parchment', rarity: 'Rare', desc: 'A delicate historical document discussing forgotten spell theory.' },
    { name: 'Elven Cloak', rarity: 'Rare', desc: 'Woven with forest moss threads. Seems to blend into surrounding shadows.' },
    { name: 'Obsidian Blade', rarity: 'Rare', desc: 'Forged from volcanic glass, leaving a jagged but extremely sharp edge.' },
    { name: 'Gold Ring', rarity: 'Rare', desc: 'A heavy solid gold band set with a tiny sparkling ruby.' },
    { name: 'Restoration Elixir', rarity: 'Rare', desc: 'A powerful elixir that purges fatigue and small toxins.' },
    { name: 'Spirit Flask', rarity: 'Rare', desc: 'A container filled with pure star condensation.' },
    { name: 'Spellweaver Staff', rarity: 'Rare', desc: 'Carved from an ancient redwood tree, channeler of mystical streams.' },
    { name: 'Steel Pauldrons', rarity: 'Rare', desc: 'Ornate shoulder plates etched with combat maneuvers.' },

    // Epic (3.0% drop rate pool)
    { name: 'Dragon Tooth Dagger', rarity: 'Epic', desc: 'A weapon carved from a wyrm\'s fang. Faintly warm to the touch.' },
    { name: 'Aegis of Dawn', rarity: 'Epic', desc: 'A radiant shield that absorbs bright starlight to shield its wielder.' },
    { name: 'Forgotten Chronology', rarity: 'Epic', desc: 'A leather-bound journal recounting secrets of the astral plane.' },
    { name: 'Cloak of Invisibility', rarity: 'Epic', desc: 'A shimmering, translucent cloak that renders the wearer fully unseen.' },
    { name: 'Sunfire Blade', rarity: 'Epic', desc: 'An ancient broadsword infused with the fiery warmth of a dying sun.' },
    { name: 'Archmage Staff', rarity: 'Epic', desc: 'Crowned with an orbiting purple mana crystal. Vibrates with magical power.' },
    { name: 'Sovereign Ring', rarity: 'Epic', desc: 'An ornate platinum band that commands respect from anyone nearby.' },
    { name: 'Quiver of Infinity', rarity: 'Epic', desc: 'A leather quiver that replenishes its contents automatically.' },

    // Legendary (0.49% drop rate pool)
    { name: 'Excalibur', rarity: 'Legendary', desc: 'The mythical sword of kings. Emits a blinding golden aura.' },
    { name: 'Shield of the Immortal', rarity: 'Legendary', desc: 'A shield forged by gods. No physical or magical attack can breach it.' },
    { name: 'Hourglass of Time', rarity: 'Legendary', desc: 'An ancient relic containing stardust that can halt temporal progression.' },
    { name: 'Ring of the Deity', rarity: 'Legendary', desc: 'A celestial artifact granting boundless cosmic wisdom and authority.' },
    { name: 'Crown of Sovereignty', rarity: 'Legendary', desc: 'An ancient golden crown reserved only for the absolute ruler.' },
    { name: 'Star of the Cosmos', rarity: 'Legendary', desc: 'A tiny, floating orb of dark matter radiating infinite celestial power.' },
    { name: 'Philosopher Stone', rarity: 'Legendary', desc: 'The ultimate alchemical achievement. Transmutes matter and holds the secret of life.' }
];

export class CasinoView extends ItemView {
    plugin: Lv999Plugin;
    activeTab: 'games' | 'gacha' | 'inventory' = 'games';

    // Game states
    slotReels: [string, string, string] = ['Star', 'Star', 'Star'];
    slotSpinning = false;
    slotPayoutMsg = '';

    wheelSpinning = false;
    wheelResult = '';
    wheelPayoutMsg = '';

    diceValues: [number, number, number] = [1, 1, 1];
    diceBetType: 'high' | 'low' | 'triple' | 'number' = 'high';
    diceBetNumber = 1;
    diceRolling = false;
    dicePayoutMsg = '';

    // Gacha states
    gachaResults: { item: GachaItem | null; amount: number; isDiamond: boolean }[] = [];
    gachaRolling = false;

    constructor(leaf: WorkspaceLeaf, plugin: Lv999Plugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return VIEW_TYPE_CASINO; }
    getDisplayText(): string { return 'Celestial Casino'; }
    getIcon(): IconName { return 'dice'; }

    async onOpen() {
        this.render();
    }

    async onClose() {
        // Nothing to do
    }

    render() {
        const container = this.contentEl;
        container.empty();
        container.addClass('lv999-casino-container');

        // Render Header
        this.renderHeader(container);

        // Render Navigation Tabs
        this.renderNavigation(container);

        // Render Content area based on active tab
        const contentArea = container.createDiv('lv999-casino-content');
        if (this.activeTab === 'games') {
            this.renderGames(contentArea);
        } else if (this.activeTab === 'gacha') {
            this.renderGacha(contentArea);
        } else if (this.activeTab === 'inventory') {
            this.renderInventory(contentArea);
        }
    }

    renderHeader(parent: HTMLElement) {
        const header = parent.createDiv('lv999-casino-header');
        
        const titleArea = header.createDiv('lv999-casino-title-area');
        titleArea.createEl('h2', { text: 'Celestial Casino', cls: 'lv999-casino-title' });
        titleArea.createEl('p', { text: 'Gamble silver for gold. Devote gold to the gacha altar.', cls: 'lv999-casino-subtitle' });

        const balances = header.createDiv('lv999-casino-balances');
        
        // Silver Badge
        const silver = balances.createDiv('lv999-c-badge silver');
        silver.createSpan({ text: 'Silver: ', cls: 'lbl' });
        silver.createSpan({ text: `${this.plugin.settings.silverCoins}`, cls: 'val' });

        // Gold Badge
        const gold = balances.createDiv('lv999-c-badge gold');
        gold.createSpan({ text: 'Gold: ', cls: 'lbl' });
        gold.createSpan({ text: `${this.plugin.settings.goldCoins}`, cls: 'val' });

        // Diamond Badge
        const diamond = balances.createDiv('lv999-c-badge diamond');
        diamond.createSpan({ text: 'Diamonds: ', cls: 'lbl' });
        diamond.createSpan({ text: `${this.plugin.settings.diamonds}`, cls: 'val' });
    }

    renderNavigation(parent: HTMLElement) {
        const nav = parent.createDiv('lv999-casino-nav');
        
        const tabs: { id: 'games' | 'gacha' | 'inventory'; label: string }[] = [
            { id: 'games', label: 'Celestial Games' },
            { id: 'gacha', label: 'Gacha Altar' },
            { id: 'inventory', label: 'Vault Inventory' }
        ];

        tabs.forEach(tab => {
            const btn = nav.createEl('button', {
                text: tab.label,
                cls: `lv999-casino-tab-btn ${this.activeTab === tab.id ? 'active' : ''}`
            });
            btn.addEventListener('click', () => {
                this.activeTab = tab.id;
                this.render();
            });
        });
    }

    // ────────────────────────────────────────────────────────────────
    // GAMES TAB
    // ────────────────────────────────────────────────────────────────
    renderGames(parent: HTMLElement) {
        const grid = parent.createDiv('lv999-games-grid');

        // Game 1: Astral Slots
        this.renderSlots(grid.createDiv('lv999-game-card slots-card'));

        // Game 2: Nebula Wheel
        this.renderWheel(grid.createDiv('lv999-game-card wheel-card'));

        // Game 3: Cosmic Dice Duel
        this.renderDice(grid.createDiv('lv999-game-card dice-card'));
    }

    renderSlots(card: HTMLElement) {
        card.createEl('h3', { text: 'Astral Slots', cls: 'game-title' });
        card.createEl('p', { text: 'Cost: 10 Silver. Match 3 for massive gold, or 2 for minor gold.', cls: 'game-desc' });

        // Slots Visual area
        const slotsView = card.createDiv('slots-visual-area');
        const reel1 = slotsView.createDiv('slot-reel');
        const reel2 = slotsView.createDiv('slot-reel');
        const reel3 = slotsView.createDiv('slot-reel');

        reel1.setText(this.slotReels[0]);
        reel2.setText(this.slotReels[1]);
        reel3.setText(this.slotReels[2]);

        if (this.slotSpinning) {
            slotsView.addClass('spinning');
        }

        // Payout display
        const payout = card.createDiv('game-payout-display');
        payout.setText(this.slotPayoutMsg || 'Pull the Celestial Lever!');

        // Action button
        const button = card.createEl('button', {
            text: this.slotSpinning ? 'Spinning...' : 'Pull Lever (10 Silver)',
            cls: 'lv999-game-action-btn'
        });

        button.disabled = this.slotSpinning || this.plugin.settings.silverCoins < 10;

        button.addEventListener('click', async () => {
            if (this.plugin.settings.silverCoins < 10) return;
            
            // Deduct
            this.plugin.settings.silverCoins -= 10;
            await this.plugin.saveSettings();
            
            this.slotSpinning = true;
            this.slotPayoutMsg = 'Reels are aligning...';
            this.render();

            const symbols = ['Star', 'Moon', 'Sun', 'Comet', 'Nebula', 'Galaxy'];
            let ticks = 0;
            const interval = window.setInterval(() => {
                this.slotReels = [
                    (symbols[Math.floor(Math.random() * symbols.length)] || 'Star'),
                    (symbols[Math.floor(Math.random() * symbols.length)] || 'Star'),
                    (symbols[Math.floor(Math.random() * symbols.length)] || 'Star')
                ];
                
                // Update text in DOM directly for performance and animation feel
                reel1.setText(this.slotReels[0]);
                reel2.setText(this.slotReels[1]);
                reel3.setText(this.slotReels[2]);

                ticks++;
                if (ticks >= 8) {
                    window.clearInterval(interval);
                    this.resolveSlots();
                }
            }, 100);
        });
    }

    async resolveSlots() {
        this.slotSpinning = false;
        
        const r1 = this.slotReels[0];
        const r2 = this.slotReels[1];
        const r3 = this.slotReels[2];

        let winAmount = 0;
        if (r1 === r2 && r2 === r3) {
            // Triple
            if (r1 === 'Galaxy') winAmount = 25;
            else if (r1 === 'Nebula') winAmount = 18;
            else if (r1 === 'Comet') winAmount = 14;
            else if (r1 === 'Sun') winAmount = 10;
            else if (r1 === 'Moon') winAmount = 8;
            else winAmount = 6; // Star

            this.slotPayoutMsg = `JACKPOT! Triple ${r1}! Won ${winAmount} Gold Coins!`;
        } else if (r1 === r2 || r1 === r3 || r2 === r3) {
            // Double
            winAmount = 3;
            const match = r1 === r2 ? r1 : r3;
            this.slotPayoutMsg = `Nice! Double ${match}! Won 3 Gold Coins!`;
        } else {
            winAmount = 0;
            this.slotPayoutMsg = 'Bust! The constellations do not align.';
        }

        if (winAmount > 0) {
            this.plugin.settings.goldCoins += winAmount;
            await this.plugin.saveSettings();
        }

        this.render();
    }

    renderWheel(card: HTMLElement) {
        card.createEl('h3', { text: 'Nebula Wheel', cls: 'game-title' });
        card.createEl('p', { text: 'Cost: 15 Silver. Spin the stellar wheel for a chance at high gold payouts.', cls: 'game-desc' });

        // Wheel Graphic
        const wheelContainer = card.createDiv('wheel-visual-container');
        const wheelInner = wheelContainer.createDiv('wheel-inner');
        wheelInner.setText(this.wheelResult ? this.wheelResult : 'Nebula Wheel');
        
        if (this.wheelSpinning) {
            wheelInner.addClass('spinning');
        }

        // Payout message
        const payout = card.createDiv('game-payout-display');
        payout.setText(this.wheelPayoutMsg || 'Spin the Celestial Wheel!');

        // Action button
        const button = card.createEl('button', {
            text: this.wheelSpinning ? 'Spinning...' : 'Spin Wheel (15 Silver)',
            cls: 'lv999-game-action-btn'
        });

        button.disabled = this.wheelSpinning || this.plugin.settings.silverCoins < 15;

        button.addEventListener('click', async () => {
            if (this.plugin.settings.silverCoins < 15) return;

            // Deduct
            this.plugin.settings.silverCoins -= 15;
            await this.plugin.saveSettings();

            this.wheelSpinning = true;
            this.wheelPayoutMsg = 'Slowing down...';
            this.render();

            const outcomes = [
                { name: 'Celestial Jackpot (10 Gold)', chance: 0.5, winGold: 10, winSilver: 0 },
                { name: 'Platinum Loot (5 Gold)', chance: 2.5, winGold: 5, winSilver: 0 },
                { name: 'Gold Loot (3 Gold)', chance: 7.0, winGold: 3, winSilver: 0 },
                { name: 'Silver Loot (2 Gold)', chance: 15.0, winGold: 2, winSilver: 0 },
                { name: 'Bronze Loot (1 Gold)', chance: 20.0, winGold: 1, winSilver: 0 },
                { name: 'Silver Back (5 Silver)', chance: 25.0, winGold: 0, winSilver: 5 },
                { name: 'Bust (0 Rewards)', chance: 30.0, winGold: 0, winSilver: 0 }
            ];

            let ticks = 0;
            const interval = window.setInterval(() => {
                const tempIndex = Math.floor(Math.random() * outcomes.length);
                const outcome = outcomes[tempIndex];
                if (outcome) {
                    wheelInner.setText(outcome.name.split(' (')[0] || '');
                }

                ticks++;
                if (ticks >= 10) {
                    window.clearInterval(interval);
                    this.resolveWheel(outcomes);
                }
            }, 100);
        });
    }

    async resolveWheel(outcomes: any[]) {
        this.wheelSpinning = false;

        const rand = Math.random() * 100;
        let cumulative = 0;
        let selectedOutcome = outcomes[outcomes.length - 1]; // Default to bust

        for (const out of outcomes) {
            cumulative += out.chance;
            if (rand <= cumulative) {
                selectedOutcome = out;
                break;
            }
        }

        this.wheelResult = selectedOutcome.name.split(' (')[0];
        
        if (selectedOutcome.winGold > 0) {
            this.plugin.settings.goldCoins += selectedOutcome.winGold;
            this.wheelPayoutMsg = `Superb! Landed on ${this.wheelResult}. Gained ${selectedOutcome.winGold} Gold!`;
        } else if (selectedOutcome.winSilver > 0) {
            this.plugin.settings.silverCoins += selectedOutcome.winSilver;
            this.wheelPayoutMsg = `Landed on ${this.wheelResult}. Reclaimed ${selectedOutcome.winSilver} Silver.`;
        } else {
            this.wheelPayoutMsg = 'Bust! The wheel stops on cold space.';
        }

        await this.plugin.saveSettings();
        this.render();
    }

    renderDice(card: HTMLElement) {
        card.createEl('h3', { text: 'Cosmic Dice', cls: 'game-title' });
        card.createEl('p', { text: 'Cost: 20 Silver. Roll 3 dice and place your celestial wager.', cls: 'game-desc' });

        // Betting Options
        const betSelectRow = card.createDiv('dice-bet-select-row');
        betSelectRow.createSpan({ text: 'Bet Type: ', cls: 'bet-lbl' });
        
        const typeSelect = betSelectRow.createEl('select', { cls: 'dice-bet-type-dropdown' });
        const options = [
            { val: 'high', label: 'High (Sum >= 11) - 2x Gold' },
            { val: 'low', label: 'Low (Sum <= 10) - 2x Gold' },
            { val: 'triple', label: 'Triple Star - 25x Gold' },
            { val: 'number', label: 'Single Star Number (1-6)' }
        ];

        options.forEach(opt => {
            const el = typeSelect.createEl('option', { value: opt.val, text: opt.label });
            if (this.diceBetType === opt.val) el.selected = true;
        });

        typeSelect.addEventListener('change', (e) => {
            this.diceBetType = (e.target as HTMLSelectElement).value as any;
            this.render();
        });

        // Bet on Single Number 1-6 selector
        if (this.diceBetType === 'number') {
            const numSelectRow = card.createDiv('dice-number-select-row');
            numSelectRow.createSpan({ text: 'Choose Star Number: ' });
            const numSelect = numSelectRow.createEl('select', { cls: 'dice-number-dropdown' });
            for (let i = 1; i <= 6; i++) {
                const opt = numSelect.createEl('option', { value: `${i}`, text: `Number ${i}` });
                if (this.diceBetNumber === i) opt.selected = true;
            }
            numSelect.addEventListener('change', (e) => {
                this.diceBetNumber = parseInt((e.target as HTMLSelectElement).value);
            });
        }

        // Dice Visual Row
        const diceRow = card.createDiv('dice-visual-row');
        if (this.diceRolling) {
            diceRow.addClass('rolling');
        }

        const d1 = diceRow.createDiv('die-face');
        const d2 = diceRow.createDiv('die-face');
        const d3 = diceRow.createDiv('die-face');

        d1.setText(`${this.diceValues[0]}`);
        d2.setText(`${this.diceValues[1]}`);
        d3.setText(`${this.diceValues[2]}`);

        // Payout message
        const payout = card.createDiv('game-payout-display');
        const sum = this.diceValues.reduce((a, b) => a + b, 0);
        payout.setText(this.dicePayoutMsg || `Last Roll Sum: ${sum}`);

        // Action button
        const button = card.createEl('button', {
            text: this.diceRolling ? 'Rolling...' : 'Roll Dice (20 Silver)',
            cls: 'lv999-game-action-btn'
        });

        button.disabled = this.diceRolling || this.plugin.settings.silverCoins < 20;

        button.addEventListener('click', async () => {
            if (this.plugin.settings.silverCoins < 20) return;

            // Deduct
            this.plugin.settings.silverCoins -= 20;
            await this.plugin.saveSettings();

            this.diceRolling = true;
            this.dicePayoutMsg = 'Shaking cosmic dice...';
            this.render();

            let ticks = 0;
            const interval = window.setInterval(() => {
                this.diceValues = [
                    Math.floor(Math.random() * 6) + 1,
                    Math.floor(Math.random() * 6) + 1,
                    Math.floor(Math.random() * 6) + 1
                ];

                d1.setText(`${this.diceValues[0]}`);
                d2.setText(`${this.diceValues[1]}`);
                d3.setText(`${this.diceValues[2]}`);

                ticks++;
                if (ticks >= 8) {
                    window.clearInterval(interval);
                    this.resolveDice();
                }
            }, 100);
        });
    }

    async resolveDice() {
        this.diceRolling = false;
        
        const d1 = this.diceValues[0];
        const d2 = this.diceValues[1];
        const d3 = this.diceValues[2];
        const sum = d1 + d2 + d3;

        let winAmount = 0;

        if (this.diceBetType === 'high') {
            if (sum >= 11) {
                winAmount = 4; // Cost is 20 Silver (~2 Gold value). A clean payout!
                this.dicePayoutMsg = `WIN! Sum is ${sum} (High). Gained 4 Gold Coins!`;
            } else {
                this.dicePayoutMsg = `Lost! Sum is ${sum} (Low).`;
            }
        } else if (this.diceBetType === 'low') {
            if (sum <= 10) {
                winAmount = 4;
                this.dicePayoutMsg = `WIN! Sum is ${sum} (Low). Gained 4 Gold Coins!`;
            } else {
                this.dicePayoutMsg = `Lost! Sum is ${sum} (High).`;
            }
        } else if (this.diceBetType === 'triple') {
            if (d1 === d2 && d2 === d3) {
                winAmount = 30;
                this.dicePayoutMsg = `INCREDIBLE WIN! Rolled Triple ${d1}! Gained 30 Gold Coins!`;
            } else {
                this.dicePayoutMsg = `Lost! Rolled ${d1}, ${d2}, ${d3}. No triple.`;
            }
        } else if (this.diceBetType === 'number') {
            let matches = 0;
            if (d1 === this.diceBetNumber) matches++;
            if (d2 === this.diceBetNumber) matches++;
            if (d3 === this.diceBetNumber) matches++;

            if (matches === 1) {
                winAmount = 2;
                this.dicePayoutMsg = `1 Match! Gained 2 Gold Coins.`;
            } else if (matches === 2) {
                winAmount = 6;
                this.dicePayoutMsg = `2 Matches! Gained 6 Gold Coins.`;
            } else if (matches === 3) {
                winAmount = 20;
                this.dicePayoutMsg = `TRIPLE STAR MATCH! Gained 20 Gold Coins.`;
            } else {
                this.dicePayoutMsg = `No matches for Star Number ${this.diceBetNumber}. Rolled [${d1}, ${d2}, ${d3}]`;
            }
        }

        if (winAmount > 0) {
            this.plugin.settings.goldCoins += winAmount;
            await this.plugin.saveSettings();
        }

        this.render();
    }

    // ────────────────────────────────────────────────────────────────
    // GACHA TAB
    // ────────────────────────────────────────────────────────────────
    renderGacha(parent: HTMLElement) {
        const container = parent.createDiv('lv999-gacha-container');

        const displayPanel = container.createDiv('lv999-gacha-altar-display');
        displayPanel.createEl('h3', { text: 'Altar of Celestial Gacha', cls: 'altar-heading' });
        displayPanel.createEl('p', { text: 'Summon items from the high heavens. 1 pull costs 1 Gold Coin. 10 pulls cost 10 Gold Coins.', cls: 'altar-subheading' });

        // Draw actions panel
        const actions = container.createDiv('lv999-gacha-actions');
        
        // 1x Pull
        const pull1Btn = actions.createEl('button', {
            text: 'Summon 1x (1 Gold)',
            cls: 'lv999-gacha-btn single'
        });
        pull1Btn.disabled = this.gachaRolling || this.plugin.settings.goldCoins < 1;
        pull1Btn.addEventListener('click', () => this.executeGacha(1));

        // 10x Pull
        const pull10Btn = actions.createEl('button', {
            text: 'Summon 10x (10 Gold)',
            cls: 'lv999-gacha-btn ten'
        });
        pull10Btn.disabled = this.gachaRolling || this.plugin.settings.goldCoins < 10;
        pull10Btn.addEventListener('click', () => this.executeGacha(10));

        // Results Container
        if (this.gachaResults.length > 0 || this.gachaRolling) {
            const resultsWrapper = container.createDiv('lv999-gacha-results-wrapper');
            
            if (this.gachaRolling) {
                const loader = resultsWrapper.createDiv('gacha-animation-loader');
                loader.createDiv('portal-glow');
                loader.createEl('div', { text: 'Aligning Cosmic Portals...', cls: 'animation-text' });
            } else {
                resultsWrapper.createEl('h4', { text: 'Summoning Results:', cls: 'results-title' });
                const grid = resultsWrapper.createDiv('gacha-results-grid');

                this.gachaResults.forEach(res => {
                    if (res.isDiamond) {
                        const itemCard = grid.createDiv('gacha-result-card rarity-mythic');
                        itemCard.createDiv('item-rarity-badge').setText('Mythic');
                        itemCard.createDiv('item-name').setText('1 Diamond');
                        itemCard.createDiv('item-desc').setText('Rare diamond currency added to settings.');
                    } else if (res.item) {
                        const itemCard = grid.createDiv(`gacha-result-card rarity-${res.item.rarity.toLowerCase()}`);
                        itemCard.createDiv('item-rarity-badge').setText(res.item.rarity);
                        itemCard.createDiv('item-name').setText(res.item.name);
                        itemCard.createDiv('item-desc').setText(res.item.desc);
                    }
                });
            }
        }
    }

    async executeGacha(pullsCount: number) {
        if (this.plugin.settings.goldCoins < pullsCount) return;

        // Deduct
        this.plugin.settings.goldCoins -= pullsCount;
        await this.plugin.saveSettings();

        this.gachaRolling = true;
        this.gachaResults = [];
        this.render();

        setTimeout(async () => {
            this.gachaRolling = false;
            
            for (let i = 0; i < pullsCount; i++) {
                const rand = Math.random() * 100;
                
                if (rand < 50.0) {
                    // Common (50%)
                    const item = this.getRandomItemByRarity('Common');
                    this.gachaResults.push({ item, amount: 1, isDiamond: false });
                    this.addInventoryItem(item.name);
                } else if (rand < 85.0) {
                    // Uncommon (35%)
                    const item = this.getRandomItemByRarity('Uncommon');
                    this.gachaResults.push({ item, amount: 1, isDiamond: false });
                    this.addInventoryItem(item.name);
                } else if (rand < 96.5) {
                    // Rare (11.5%)
                    const item = this.getRandomItemByRarity('Rare');
                    this.gachaResults.push({ item, amount: 1, isDiamond: false });
                    this.addInventoryItem(item.name);
                } else if (rand < 99.5) {
                    // Epic (3.0%)
                    const item = this.getRandomItemByRarity('Epic');
                    this.gachaResults.push({ item, amount: 1, isDiamond: false });
                    this.addInventoryItem(item.name);
                } else if (rand < 99.99) {
                    // Legendary (0.49%)
                    const item = this.getRandomItemByRarity('Legendary');
                    this.gachaResults.push({ item, amount: 1, isDiamond: false });
                    this.addInventoryItem(item.name);
                } else {
                    // Mythic / 1 Diamond (0.01%)
                    this.gachaResults.push({ item: null, amount: 1, isDiamond: true });
                    this.plugin.settings.diamonds += 1;
                }
            }

            await this.plugin.saveSettings();
            this.render();
        }, 1200);
    }

    getRandomItemByRarity(rarity: 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary'): GachaItem {
        const pool = GACHA_ITEMS.filter(it => it.rarity === rarity);
        const item = pool[Math.floor(Math.random() * pool.length)];
        const fallback = GACHA_ITEMS[0];
        if (!fallback) {
            throw new Error("No items in GACHA_ITEMS pool.");
        }
        return item || fallback;
    }

    addInventoryItem(name: string) {
        if (!this.plugin.settings.inventory) {
            this.plugin.settings.inventory = {};
        }
        if (!this.plugin.settings.inventory[name]) {
            this.plugin.settings.inventory[name] = 0;
        }
        this.plugin.settings.inventory[name]++;
    }

    // ────────────────────────────────────────────────────────────────
    // INVENTORY TAB
    // ────────────────────────────────────────────────────────────────
    renderInventory(parent: HTMLElement) {
        const container = parent.createDiv('lv999-vault-inventory');
        
        container.createEl('h3', { text: 'Vault Inventory', cls: 'vault-title' });
        container.createEl('p', { text: 'A listing of all your high celestial collectibles.', cls: 'vault-subtitle' });

        const inventory = this.plugin.settings.inventory || {};
        const collectedItems = GACHA_ITEMS.filter(it => {
            const count = inventory[it.name];
            return count !== undefined && count > 0;
        });

        if (collectedItems.length === 0) {
            const emptyState = container.createDiv('inventory-empty-state');
            emptyState.setText('Your vault is empty. Spend gold coins at the Gacha Altar to secure powerful artifacts.');
            return;
        }

        // Stats summary
        const summary = container.createDiv('inventory-summary');
        const totalItems = Object.values(inventory).reduce((a: number, b: number) => a + (b || 0), 0);
        summary.createSpan({ text: `Unique Artifacts: ${collectedItems.length}  ·  Total Items: ${totalItems}` });

        // Item List Grid
        const grid = container.createDiv('vault-items-grid');

        // Order collected items by rarity: Legendary -> Epic -> Rare -> Uncommon -> Common
        const rarityWeights = { Legendary: 5, Epic: 4, Rare: 3, Uncommon: 2, Common: 1, Mythic: 6 };
        collectedItems.sort((a, b) => rarityWeights[b.rarity] - rarityWeights[a.rarity]);

        collectedItems.forEach(item => {
            const count = inventory[item.name];
            
            const card = grid.createDiv(`vault-item-card rarity-${item.rarity.toLowerCase()}`);
            
            const badgeRow = card.createDiv('card-badge-row');
            badgeRow.createDiv('item-rarity-badge').setText(item.rarity);
            badgeRow.createDiv('item-count-badge').setText(`x${count}`);
            
            card.createDiv('item-name').setText(item.name);
            card.createDiv('item-desc').setText(item.desc);
        });
    }
}
