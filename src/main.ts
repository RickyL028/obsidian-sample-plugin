import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import { Lv999Settings, DEFAULT_SETTINGS } from './types';
import { Lv999SettingTab } from './Settings';
import { DashboardView, VIEW_TYPE_DASHBOARD } from './DashboardView';
import { CasinoView, VIEW_TYPE_CASINO } from './CasinoView';
import { DailyLogger } from './DailyLogger';

export default class Lv999Plugin extends Plugin {
    settings: Lv999Settings;
    dailyLogger: DailyLogger;

    // Study Timer properties
    studySessionSeconds = 0;
    isStudyTimerRunning = false;
    studyTimerIntervalId: any = null;
    onTimerTick?: (sessionSecs: number, todaySecs: number) => void;
    onTimerStateChange?: () => void;

    async onload() {
        await this.loadSettings();
        
        this.dailyLogger = new DailyLogger(this.app);
        await this.checkMidnightReset();
        this.startTimerTicker();

        this.registerView(
            VIEW_TYPE_DASHBOARD,
            (leaf) => new DashboardView(leaf, this)
        );

        this.registerView(
            VIEW_TYPE_CASINO,
            (leaf) => new CasinoView(leaf, this)
        );

        // Adds ribbon icon on the left to open Dashboard
        this.addRibbonIcon('swords', 'Lv999 Dashboard', () => {
            this.activateView();
        });

        // Adds ribbon icon on the left to open Casino
        this.addRibbonIcon('dice', 'Lv999 Celestial Casino', () => {
            this.activateCasinoView();
        });

        // Optional Command Palette entries
        this.addCommand({
            id: 'open-lv999-dashboard',
            name: 'Open Lv999 Dashboard',
            callback: () => this.activateView()
        });

        this.addCommand({
            id: 'open-lv999-casino',
            name: 'Open Lv999 Celestial Casino',
            callback: () => this.activateCasinoView()
        });

        this.addSettingTab(new Lv999SettingTab(this.app, this));
    }

    async onunload() {
        if (this.studyTimerIntervalId) {
            window.clearInterval(this.studyTimerIntervalId);
        }
        // Force save study progress on exit
        if (this.settings.todayStudySeconds > 0) {
            const todayStr = DailyLogger.getTodayStr();
            await this.dailyLogger.updateLog(todayStr, {
                studySeconds: this.settings.todayStudySeconds
            });
        }
    }

    startTimerTicker() {
        this.studyTimerIntervalId = window.setInterval(async () => {
            await this.checkMidnightReset();
            if (this.isStudyTimerRunning) {
                this.studySessionSeconds++;
                this.settings.todayStudySeconds++;
                
                // Yield 1 XP every 5 minutes (300 seconds)
                if (this.settings.todayStudySeconds > 0 && this.settings.todayStudySeconds % 300 === 0) {
                    this.settings.currentXp += 1;
                    let reqXp = 8 + (0.037 * this.settings.level);
                    while (this.settings.currentXp >= reqXp && this.settings.level < 999) {
                        this.settings.currentXp -= reqXp;
                        this.settings.level++;
                        reqXp = 8 + (0.037 * this.settings.level);
                    }
                    new Notice("📚 Focus Power! Gained 1 XP!");
                    
                    // Force a log update with the XP
                    const todayStr = DailyLogger.getTodayStr();
                    const todayLog = await this.dailyLogger.getLog(todayStr);
                    await this.dailyLogger.updateLog(todayStr, {
                        studySeconds: this.settings.todayStudySeconds,
                        xpEarned: todayLog.xpEarned + 1
                    });
                } else if (this.settings.todayStudySeconds % 10 === 0) {
                    // Batch write log to disk every 10 seconds of study for performance
                    const todayStr = DailyLogger.getTodayStr();
                    await this.dailyLogger.updateLog(todayStr, {
                        studySeconds: this.settings.todayStudySeconds
                    });
                }
                
                await this.saveSettings();
                
                if (this.onTimerTick) {
                    this.onTimerTick(this.studySessionSeconds, this.settings.todayStudySeconds);
                }
            }
        }, 1000);
        
        this.registerInterval(this.studyTimerIntervalId);
    }

    async toggleStudyTimer() {
        this.isStudyTimerRunning = !this.isStudyTimerRunning;
        if (!this.isStudyTimerRunning) {
            // Paused: force log save immediately
            const todayStr = DailyLogger.getTodayStr();
            await this.dailyLogger.updateLog(todayStr, {
                studySeconds: this.settings.todayStudySeconds
            });
        }
        if (this.onTimerStateChange) {
            this.onTimerStateChange();
        }
    }

    async checkMidnightReset() {
        const todayStr = DailyLogger.getTodayStr();
        if (this.settings.lastStudyResetDate !== todayStr) {
            // Reset timer count
            this.settings.todayStudySeconds = 0;
            this.settings.lastStudyResetDate = todayStr;
            this.studySessionSeconds = 0; // Reset session as well
            await this.saveSettings();
            
            // Create or initialize the daily log file for today
            await this.dailyLogger.updateLog(todayStr, {
                studySeconds: 0
            });
            
            if (this.onTimerTick) {
                this.onTimerTick(0, 0);
            }
        }
    }

    async activateView() {
        const { workspace } = this.app;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);
        let leaf: WorkspaceLeaf;

        if (leaves.length > 0 && leaves[0]) {
            leaf = leaves[0];
        } else {
            // true flag ensures it opens in a new tab/pane!
            leaf = workspace.getLeaf(true); 
            await leaf.setViewState({ type: VIEW_TYPE_DASHBOARD, active: true });
        }
        workspace.revealLeaf(leaf);
    }

    async activateCasinoView() {
        const { workspace } = this.app;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_CASINO);
        let leaf: WorkspaceLeaf;

        if (leaves.length > 0 && leaves[0]) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getLeaf(true); 
            await leaf.setViewState({ type: VIEW_TYPE_CASINO, active: true });
        }
        workspace.revealLeaf(leaf);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}