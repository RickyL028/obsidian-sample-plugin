import { Plugin, WorkspaceLeaf } from 'obsidian';
import { Lv999Settings, DEFAULT_SETTINGS } from './types';
import { Lv999SettingTab } from './Settings';
import { DashboardView, VIEW_TYPE_DASHBOARD } from './DashboardView';
import { CasinoView, VIEW_TYPE_CASINO } from './CasinoView';

export default class Lv999Plugin extends Plugin {
    settings: Lv999Settings;

    async onload() {
        await this.loadSettings();

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